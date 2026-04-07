"""
Provides linkedin api-related code
"""

import json
import logging
import random
import uuid
import re
import os
import base64
import time
from operator import itemgetter
from time import sleep
from urllib.parse import urlencode, quote
from typing import Dict, Union, Optional, List, Literal

from bs4 import BeautifulSoup

from open_linkedin_api.exceptions import (
    UnauthorizedException,
    LinkedInRequestException,
)
from open_linkedin_api.client import Client

from open_linkedin_api.utils.helpers import (
    get_id_from_urn,
    get_urn_from_raw_update,
    get_list_posts_sorted_without_promoted,
    parse_list_raw_posts,
    parse_list_raw_urns,
    generate_trackingId,
    generate_trackingId_as_charString,
    extract_profile_section,
)

logger = logging.getLogger(__name__)


def default_evade():
    """
    A catch-all method to try and evade suspension from Linkedin.

    This function is now a no-op as rate limiting is handled by
    the RateLimiter class integrated into the Client. The function
    is kept for backward compatibility.
    """
    pass  # Rate limiting now handled by RateLimiter in Client


class Linkedin(object):
    """
    Class for accessing the LinkedIn API.

    :param username: Username of LinkedIn account.
    :type username: str
    :param password: Password of LinkedIn account.
    :type password: str
    """

    _MAX_POST_COUNT = 100  # max seems to be 100 posts per page
    _MAX_UPDATE_COUNT = 100  # max seems to be 100
    _MAX_SEARCH_COUNT = 49  # max seems to be 49, and min seems to be 2
    _MAX_REPEATED_REQUESTS = (
        200  # VERY conservative max requests count to avoid rate-limit
    )

    # Image upload constants
    MAX_IMAGE_SIZE_BYTES = (
        10 * 1024 * 1024
    )  # 10MB maximum file size for LinkedIn images

    # Timestamp validation constants
    ONE_YEAR_IN_MS = 365 * 24 * 60 * 60 * 1000  # One year in milliseconds

    def __init__(
        self,
        username: str,
        password: str,
        *,
        authenticate=True,
        refresh_cookies=False,
        debug=False,
        proxies={},
        cookies=None,
        cookies_dir: str = "",
    ):
        """Constructor method"""
        self.client = Client(
            refresh_cookies=refresh_cookies,
            debug=debug,
            proxies=proxies,
            cookies_dir=cookies_dir,
        )
        logging.basicConfig(level=logging.DEBUG if debug else logging.INFO)
        self.logger = logger

        if authenticate:
            if cookies:
                # If the cookies are expired, the API won't work anymore since
                # `username` and `password` are not used at all in this case.
                self.client._set_session_cookies(cookies)
            else:
                self.client.authenticate(username, password)

    def _fetch(self, uri: str, evade=default_evade, base_request=False, **kwargs):
        """GET request to Linkedin API"""
        # Apply rate limiting before making request
        self.client.rate_limiter.wait()

        evade()

        url = f"{self.client.API_BASE_URL if not base_request else self.client.LINKEDIN_BASE_URL}{uri}"
        res = self.client.session.get(url, **kwargs)

        if res.status_code == 401:
            raise UnauthorizedException()

        if not (
            200 <= res.status_code < 300
        ):  # I don't know all status_codes successfully of LkIn
            raise LinkedInRequestException(res.status_code, res.text)

        return res

    def _cookies(self):
        """Return client cookies"""
        return self.client.cookies

    def _headers(self):
        """Return client cookies"""
        return self.client.REQUEST_HEADERS

    def _post(self, uri: str, evade=default_evade, base_request=False, **kwargs):
        """POST request to Linkedin API"""
        # Apply rate limiting before making request
        self.client.rate_limiter.wait()

        evade()

        url = f"{self.client.API_BASE_URL if not base_request else self.client.LINKEDIN_BASE_URL}{uri}"

        res = self.client.session.post(url, **kwargs)
        if res.status_code == 401:
            raise UnauthorizedException()

        if not (
            200 <= res.status_code < 300
        ):  # I don't know all status_codes successfully of LkIn
            raise LinkedInRequestException(res.status_code, res.text)

        return res

    def _put(self, uri: str, evade=default_evade, base_request=False, **kwargs):
        """PUT request to Linkedin API

        Note: This method is currently not used for CDN image uploads (see schedule_post).
        Image uploads use self.client.session.put() directly because they go to an external
        CDN URL, not the LinkedIn API endpoint, and therefore don't need rate limiting or evade.
        This method is kept for potential future PUT operations to LinkedIn API endpoints.
        """
        # Apply rate limiting before making request
        self.client.rate_limiter.wait()

        evade()

        url = f"{self.client.API_BASE_URL if not base_request else self.client.LINKEDIN_BASE_URL}{uri}"

        res = self.client.session.put(url, **kwargs)
        if res.status_code == 401:
            raise UnauthorizedException()

        if not (
            200 <= res.status_code < 300
        ):  # I don't know all status_codes successfully of LkIn
            raise LinkedInRequestException(res.status_code, res.text)

        return res

    def get_profile_posts(
        self,
        public_id: Optional[str] = None,
        urn_id: Optional[str] = None,
        post_count=10,
    ) -> List:
        """
        get_profile_posts: Get profile posts

        :param public_id: LinkedIn public ID for a profile
        :type public_id: str, optional
        :param urn_id: LinkedIn URN ID for a profile
        :type urn_id: str, optional
        :param post_count: Number of posts to fetch
        :type post_count: int, optional
        :return: List of posts
        :rtype: list
        """
        url_params = {
            "count": min(post_count, self._MAX_POST_COUNT),
            "start": 0,
            "q": "memberShareFeed",
            "moduleKey": "member-shares:phone",
            "includeLongTermHistory": True,
        }
        if urn_id:
            profile_urn = f"urn:li:fsd_profile:{urn_id}"
        else:
            profile = self.get_profile(public_id=public_id)
            profile_urn = profile["profile_urn"].replace(
                "fs_miniProfile", "fsd_profile"
            )
        url_params["profileUrn"] = profile_urn
        url = f"/identity/profileUpdatesV2"
        res = self._fetch(url, params=url_params)
        data = res.json()
        if data and "status" in data and data["status"] != 200:
            self.logger.info(
                f"request failed:{data.get('status')} - {data.get('message')}"
            )
            return [{}]
        while data and data["metadata"]["paginationToken"] != "":
            if len(data["elements"]) >= post_count:
                break
            pagination_token = data["metadata"]["paginationToken"]
            url_params["start"] = url_params["start"] + self._MAX_POST_COUNT
            url_params["paginationToken"] = pagination_token
            res = self._fetch(url, params=url_params)
            data["metadata"] = res.json()["metadata"]
            data["elements"] = data["elements"] + res.json()["elements"]
            data["paging"] = res.json()["paging"]
        return data["elements"]

    def get_post_comments(self, post_urn: str, comment_count=100) -> List:
        """
        get_post_comments: Get post comments

        :param post_urn: Post URN
        :type post_urn: str
        :param comment_count: Number of comments to fetch
        :type comment_count: int, optional
        :return: List of post comments
        :rtype: list
        """
        url_params = {
            "count": min(comment_count, self._MAX_POST_COUNT),
            "start": 0,
            "q": "comments",
            "sortOrder": "RELEVANCE",
        }
        url = f"/feed/comments"
        url_params["updateId"] = "activity:" + post_urn
        res = self._fetch(url, params=url_params)
        data = res.json()
        if data and "status" in data and data["status"] != 200:
            self.logger.info("request failed: {}".format(data["status"]))
            return [{}]
        while data and data["metadata"]["paginationToken"] != "":
            if len(data["elements"]) >= comment_count:
                break
            pagination_token = data["metadata"]["paginationToken"]
            url_params["start"] = url_params["start"] + self._MAX_POST_COUNT
            url_params["count"] = self._MAX_POST_COUNT
            url_params["paginationToken"] = pagination_token
            res = self._fetch(url, params=url_params)
            if res.json() and "status" in res.json() and res.json()["status"] != 200:
                self.logger.info("request failed: {}".format(data["status"]))
                return [{}]
            data["metadata"] = res.json()["metadata"]
            """ When the number of comments exceed total available 
            comments, the api starts returning an empty list of elements"""
            if res.json()["elements"] and len(res.json()["elements"]) == 0:
                break
            if data["elements"] and len(res.json()["elements"]) == 0:
                break
            data["elements"] = data["elements"] + res.json()["elements"]
            data["paging"] = res.json()["paging"]
        return data["elements"]

    def search(self, params: Dict, limit=-1, offset=0) -> List:
        """Perform a LinkedIn search.

        :param params: Search parameters (see code)
        :type params: dict
        :param limit: Maximum length of the returned list, defaults to -1 (no limit)
        :type limit: int, optional
        :param offset: Index to start searching from
        :type offset: int, optional


        :return: List of search results
        :rtype: list
        """
        count = Linkedin._MAX_SEARCH_COUNT
        if limit is None:
            limit = -1

        results = []
        while True:
            # when we're close to the limit, only fetch what we need to
            if limit > -1 and limit - len(results) < count:
                count = limit - len(results)
            default_params = {
                "count": str(count),
                "filters": "List()",
                "origin": "GLOBAL_SEARCH_HEADER",
                "q": "all",
                "start": len(results) + offset,
                "queryContext": "List(spellCorrectionEnabled->true,relatedSearchesEnabled->true,kcardTypes->PROFILE|COMPANY)",
                "includeWebMetadata": "true",
            }
            default_params.update(params)

            keywords = (
                f"keywords:{default_params['keywords']},"
                if "keywords" in default_params
                else ""
            )

            # Hardcoded queryId for search
            query_id = "voyagerSearchDashClusters.b0928897b71bd00a5a7291755dcd64f0"
            res = self._fetch(
                f"/graphql?variables=(start:{default_params['start']},origin:{default_params['origin']},"
                f"query:("
                f"{keywords}"
                f"flagshipSearchIntent:SEARCH_SRP,"
                f"queryParameters:{default_params['filters']},"
                f"includeFiltersInResponse:false))&queryId={query_id}"
            )
            data = res.json()

            # Build lookup from included entities (normalized JSON format)
            included_map = {}
            for inc in data.get("included", []):
                urn = inc.get("entityUrn", "")
                if urn:
                    included_map[urn] = inc

            # Response may be nested under data.data or data directly
            inner = data.get("data", {})
            if isinstance(inner, dict) and "data" in inner:
                inner = inner["data"]
            data_clusters = inner.get("searchDashClustersByAll", {})

            if not data_clusters:
                break  # Don't wipe accumulated results — just stop paginating

            # Accept both _type and $type fields
            cluster_type = data_clusters.get("_type") or data_clusters.get("$type", "")
            if cluster_type not in (
                "com.linkedin.restli.common.CollectionResponse",
                "com.linkedin.restli.common.CollectionMetadata",
                "",
            ):
                # Also accept if paging exists (valid response structure)
                if not data_clusters.get("paging"):
                    break

            new_elements = []
            for it in data_clusters.get("elements", []):
                it_type = it.get("_type") or it.get("$type", "")
                if it_type and "SearchClusterViewModel" not in it_type:
                    continue

                for el in it.get("items", []):
                    el_type = el.get("_type") or el.get("$type", "")
                    if el_type and "SearchItem" not in el_type:
                        continue

                    item_data = el.get("item", {})
                    # Try inline entityResult first, then resolve *entityResult reference
                    e = item_data.get("entityResult")
                    if not e:
                        ref_urn = item_data.get("*entityResult", "")
                        if ref_urn:
                            e = included_map.get(ref_urn, {})
                    if not e:
                        continue
                    e_type = e.get("_type") or e.get("$type", "")
                    if e_type and "EntityResultViewModel" not in e_type:
                        continue
                    new_elements.append(e)

            results.extend(new_elements)

            # break the loop if we're done searching
            # NOTE: we could also check for the `total` returned in the response.
            # This is in data["data"]["paging"]["total"]
            if (
                (-1 < limit <= len(results))  # if our results exceed set limit
                or len(results) / count >= Linkedin._MAX_REPEATED_REQUESTS
            ) or len(new_elements) == 0:
                break

            self.logger.debug(f"results grew to {len(results)}")

        return results

    def search_people(
        self,
        keywords: Optional[str] = None,
        connection_of: Optional[str] = None,
        network_depths: Optional[
            List[Union[Literal["F"], Literal["S"], Literal["O"]]]
        ] = None,
        current_company: Optional[List[str]] = None,
        past_companies: Optional[List[str]] = None,
        nonprofit_interests: Optional[List[str]] = None,
        profile_languages: Optional[List[str]] = None,
        regions: Optional[List[str]] = None,
        industries: Optional[List[str]] = None,
        schools: Optional[List[str]] = None,
        contact_interests: Optional[List[str]] = None,
        service_categories: Optional[List[str]] = None,
        include_private_profiles=False,  # profiles without a public id, "Linkedin Member"
        # Keywords filter
        keyword_first_name: Optional[str] = None,
        keyword_last_name: Optional[str] = None,
        # `keyword_title` and `title` are the same. We kept `title` for backward compatibility. Please only use one of them.
        keyword_title: Optional[str] = None,
        keyword_company: Optional[str] = None,
        keyword_school: Optional[str] = None,
        network_depth: Optional[
            Union[Literal["F"], Literal["S"], Literal["O"]]
        ] = None,  # DEPRECATED - use network_depths
        title: Optional[str] = None,  # DEPRECATED - use keyword_title
        **kwargs,
    ) -> List[Dict]:
        """Perform a LinkedIn search for people.

        :param keywords: Keywords to search on
        :type keywords: str, optional
        :param current_company: A list of company URN IDs (str)
        :type current_company: list, optional
        :param past_companies: A list of company URN IDs (str)
        :type past_companies: list, optional
        :param regions: A list of geo URN IDs (str)
        :type regions: list, optional
        :param industries: A list of industry URN IDs (str)
        :type industries: list, optional
        :param schools: A list of school URN IDs (str)
        :type schools: list, optional
        :param profile_languages: A list of 2-letter language codes (str)
        :type profile_languages: list, optional
        :param contact_interests: A list containing one or both of "proBono" and "boardMember"
        :type contact_interests: list, optional
        :param service_categories: A list of service category URN IDs (str)
        :type service_categories: list, optional
        :param network_depth: Deprecated, use `network_depths`. One of "F", "S" and "O" (first, second and third+ respectively)
        :type network_depth: str, optional
        :param network_depths: A list containing one or many of "F", "S" and "O" (first, second and third+ respectively)
        :type network_depths: list, optional
        :param include_private_profiles: Include private profiles in search results. If False, only public profiles are included. Defaults to False
        :type include_private_profiles: boolean, optional
        :param keyword_first_name: First name
        :type keyword_first_name: str, optional
        :param keyword_last_name: Last name
        :type keyword_last_name: str, optional
        :param keyword_title: Job title
        :type keyword_title: str, optional
        :param keyword_company: Company name
        :type keyword_company: str, optional
        :param keyword_school: School name
        :type keyword_school: str, optional
        :param connection_of: Connection of LinkedIn user, given by profile URN ID
        :type connection_of: str, optional
        :param limit: Maximum length of the returned list, defaults to -1 (no limit)
        :type limit: int, optional

        :return: List of profiles (minimal data only)
        :rtype: list
        """
        filters = ["(key:resultType,value:List(PEOPLE))"]
        if connection_of:
            filters.append(f"(key:connectionOf,value:List({connection_of}))")
        if network_depths:
            stringify = " | ".join(network_depths)
            filters.append(f"(key:network,value:List({stringify}))")
        elif network_depth:
            filters.append(f"(key:network,value:List({network_depth}))")
        if regions:
            stringify = " | ".join(regions)
            filters.append(f"(key:geoUrn,value:List({stringify}))")
        if industries:
            stringify = " | ".join(industries)
            filters.append(f"(key:industry,value:List({stringify}))")
        if current_company:
            stringify = " | ".join(current_company)
            filters.append(f"(key:currentCompany,value:List({stringify}))")
        if past_companies:
            stringify = " | ".join(past_companies)
            filters.append(f"(key:pastCompany,value:List({stringify}))")
        if profile_languages:
            stringify = " | ".join(profile_languages)
            filters.append(f"(key:profileLanguage,value:List({stringify}))")
        if nonprofit_interests:
            stringify = " | ".join(nonprofit_interests)
            filters.append(f"(key:nonprofitInterest,value:List({stringify}))")
        if schools:
            stringify = " | ".join(schools)
            filters.append(f"(key:schools,value:List({stringify}))")
        if service_categories:
            stringify = " | ".join(service_categories)
            filters.append(f"(key:serviceCategory,value:List({stringify}))")
        # `Keywords` filter
        keyword_title = keyword_title if keyword_title else title
        if keyword_first_name:
            filters.append(f"(key:firstName,value:List({keyword_first_name}))")
        if keyword_last_name:
            filters.append(f"(key:lastName,value:List({keyword_last_name}))")
        if keyword_title:
            filters.append(f"(key:title,value:List({keyword_title}))")
        if keyword_company:
            filters.append(f"(key:company,value:List({keyword_company}))")
        if keyword_school:
            filters.append(f"(key:school,value:List({keyword_school}))")

        params = {"filters": "List({})".format(",".join(filters))}

        if keywords:
            params["keywords"] = keywords

        data = self.search(params, **kwargs)

        results = []
        for item in data:
            if (
                not include_private_profiles
                and (item.get("entityCustomTrackingInfo") or {}).get(
                    "memberDistance", None
                )
                == "OUT_OF_NETWORK"
            ):
                continue
            results.append(
                {
                    "urn_id": get_id_from_urn(
                        get_urn_from_raw_update(item.get("entityUrn", None))
                    ),
                    "distance": (item.get("entityCustomTrackingInfo") or {}).get(
                        "memberDistance", None
                    ),
                    "jobtitle": (item.get("primarySubtitle") or {}).get("text", None),
                    "location": (item.get("secondarySubtitle") or {}).get("text", None),
                    "name": (item.get("title") or {}).get("text", None),
                    "navigation_url": item.get("navigationUrl", None),
                }
            )

        return results

    def search_companies(self, keywords: Optional[List[str]] = None, **kwargs) -> List:
        """Perform a LinkedIn search for companies.

        :param keywords: A list of search keywords (str)
        :type keywords: list, optional

        :return: List of companies
        :rtype: list
        """
        filters = ["(key:resultType,value:List(COMPANIES))"]

        params: Dict[str, Union[str, List[str]]] = {
            "filters": "List({})".format(",".join(filters)),
            "queryContext": "List(spellCorrectionEnabled->true)",
        }

        if keywords:
            params["keywords"] = keywords

        data = self.search(params, **kwargs)

        results = []
        for item in data:
            if "company" not in item.get("trackingUrn"):
                continue
            results.append(
                {
                    "urn_id": get_id_from_urn(item.get("trackingUrn", None)),
                    "name": (item.get("title") or {}).get("text", None),
                    "headline": (item.get("primarySubtitle") or {}).get("text", None),
                    "subline": (item.get("secondarySubtitle") or {}).get("text", None),
                }
            )

        return results

    def search_jobs(
        self,
        keywords: Optional[str] = None,
        companies: Optional[List[str]] = None,
        experience: Optional[
            List[
                Union[
                    Literal["1"],
                    Literal["2"],
                    Literal["3"],
                    Literal["4"],
                    Literal["5"],
                    Literal["6"],
                ]
            ]
        ] = None,
        job_type: Optional[
            List[
                Union[
                    Literal["F"],
                    Literal["C"],
                    Literal["P"],
                    Literal["T"],
                    Literal["I"],
                    Literal["V"],
                    Literal["O"],
                ]
            ]
        ] = None,
        job_title: Optional[List[str]] = None,
        industries: Optional[List[str]] = None,
        location_name: Optional[str] = None,
        remote: Optional[List[Union[Literal["1"], Literal["2"], Literal["3"]]]] = None,
        listed_at=24 * 60 * 60,
        distance: Optional[int] = None,
        limit=-1,
        offset=0,
        **kwargs,
    ) -> List[Dict]:
        """Perform a LinkedIn search for jobs.

        :param keywords: Search keywords (str)
        :type keywords: str, optional
        :param companies: A list of company URN IDs (str)
        :type companies: list, optional
        :param experience: A list of experience levels, one or many of "1", "2", "3", "4", "5" and "6" (internship, entry level, associate, mid-senior level, director and executive, respectively)
        :type experience: list, optional
        :param job_type:  A list of job types , one or many of "F", "C", "P", "T", "I", "V", "O" (full-time, contract, part-time, temporary, internship, volunteer and "other", respectively)
        :type job_type: list, optional
        :param job_title: A list of title URN IDs (str)
        :type job_title: list, optional
        :param industries: A list of industry URN IDs (str)
        :type industries: list, optional
        :param location_name: Name of the location to search within. Example: "Kyiv City, Ukraine"
        :type location_name: str, optional
        :param remote: Filter for remote jobs, onsite or hybrid. onsite:"1", remote:"2", hybrid:"3"
        :type remote: list, optional
        :param listed_at: maximum number of seconds passed since job posting. 86400 will filter job postings posted in last 24 hours.
        :type listed_at: int/str, optional. Default value is equal to 24 hours.
        :param distance: maximum distance from location in miles
        :type distance: int/str, optional. If not specified, None or 0, the default value of 25 miles applied.
        :param limit: maximum number of results obtained from API queries. -1 means maximum which is defined by constants and is equal to 1000 now.
        :type limit: int, optional, default -1
        :param offset: indicates how many search results shall be skipped
        :type offset: int, optional
        :return: List of jobs
        :rtype: list
        """
        count = Linkedin._MAX_SEARCH_COUNT
        if limit is None:
            limit = -1

        query: Dict[str, Union[str, Dict[str, str]]] = {
            "origin": "JOB_SEARCH_PAGE_QUERY_EXPANSION"
        }
        if keywords:
            query["keywords"] = "KEYWORD_PLACEHOLDER"
        if location_name:
            query["locationFallback"] = "LOCATION_PLACEHOLDER"

        # In selectedFilters()
        query["selectedFilters"] = {}
        if companies:
            query["selectedFilters"]["company"] = f"List({','.join(companies)})"
        if experience:
            query["selectedFilters"]["experience"] = f"List({','.join(experience)})"
        if job_type:
            query["selectedFilters"]["jobType"] = f"List({','.join(job_type)})"
        if job_title:
            query["selectedFilters"]["title"] = f"List({','.join(job_title)})"
        if industries:
            query["selectedFilters"]["industry"] = f"List({','.join(industries)})"
        if distance:
            query["selectedFilters"]["distance"] = f"List({distance})"
        if remote:
            query["selectedFilters"]["workplaceType"] = f"List({','.join(remote)})"

        query["selectedFilters"]["timePostedRange"] = f"List(r{listed_at})"
        query["spellCorrectionEnabled"] = "true"

        # Query structure:
        # "(
        #    origin:JOB_SEARCH_PAGE_QUERY_EXPANSION,
        #    keywords:marketing%20manager,
        #    locationFallback:germany,
        #    selectedFilters:(
        #        distance:List(25),
        #        company:List(163253),
        #        salaryBucketV2:List(5),
        #        timePostedRange:List(r2592000),
        #        workplaceType:List(1)
        #    ),
        #    spellCorrectionEnabled:true
        #  )"

        query_string = (
            str(query)
            .replace(" ", "")
            .replace("'", "")
            .replace("KEYWORD_PLACEHOLDER", keywords or "")
            .replace("LOCATION_PLACEHOLDER", location_name or "")
            .replace("{", "(")
            .replace("}", ")")
        )
        results = []
        while True:
            # when we're close to the limit, only fetch what we need to
            if limit > -1 and limit - len(results) < count:
                count = limit - len(results)
            default_params = {
                "decorationId": "com.linkedin.voyager.dash.deco.jobs.search.JobSearchCardsCollection-174",
                "count": count,
                "q": "jobSearch",
                "query": query_string,
                "start": len(results) + offset,
            }

            res = self._fetch(
                f"/voyagerJobsDashJobCards?{urlencode(default_params, safe='(),:')}",
                headers={"accept": "application/vnd.linkedin.normalized+json+2.1"},
            )
            data = res.json()

            elements = data.get("included", [])
            new_data = [
                i
                for i in elements
                if i["$type"] == "com.linkedin.voyager.dash.jobs.JobPosting"
            ]
            # break the loop if we're done searching or no results returned
            if not new_data:
                break
            # NOTE: we could also check for the `total` returned in the response.
            # This is in data["data"]["paging"]["total"]
            results.extend(new_data)
            if (
                (-1 < limit <= len(results))  # if our results exceed set limit
                or len(results) / count >= Linkedin._MAX_REPEATED_REQUESTS
            ) or len(elements) == 0:
                break

            self.logger.debug(f"results grew to {len(results)}")

        return results

    def get_profile_contact_info(
        self, public_id: Optional[str] = None, urn_id: Optional[str] = None
    ) -> Dict:
        """Fetch contact information for a given LinkedIn profile. Pass a [public_id] or a [urn_id].

        :param public_id: LinkedIn public ID for a profile
        :type public_id: str, optional
        :param urn_id: LinkedIn URN ID for a profile
        :type urn_id: str, optional

        :return: Contact data
        :rtype: dict
        """
        res = self._fetch(
            f"/identity/profiles/{public_id or urn_id}/profileContactInfo"
        )
        data = res.json()

        contact_info = {
            "email_address": data.get("emailAddress"),
            "websites": [],
            "twitter": data.get("twitterHandles"),
            "birthdate": data.get("birthDateOn"),
            "ims": data.get("ims"),
            "phone_numbers": data.get("phoneNumbers", []),
        }

        websites = data.get("websites", [])
        for item in websites:
            if "com.linkedin.voyager.identity.profile.StandardWebsite" in item["type"]:
                item["label"] = item["type"][
                    "com.linkedin.voyager.identity.profile.StandardWebsite"
                ]["category"]
            elif "" in item["type"]:
                item["label"] = item["type"][
                    "com.linkedin.voyager.identity.profile.CustomWebsite"
                ]["label"]

            del item["type"]

        contact_info["websites"] = websites

        return contact_info

    def get_profile_skills(
        self, public_id: Optional[str] = None, urn_id: Optional[str] = None
    ) -> List:
        """Fetch the skills listed on a given LinkedIn profile.

        :param public_id: LinkedIn public ID for a profile
        :type public_id: str, optional
        :param urn_id: LinkedIn URN ID for a profile
        :type urn_id: str, optional


        :return: List of skill objects
        :rtype: list
        """
        params = {"count": 100, "start": 0}
        res = self._fetch(
            f"/identity/profiles/{public_id or urn_id}/skills", params=params
        )
        data = res.json()

        skills = data.get("elements", [])
        for item in skills:
            del item["entityUrn"]

        return skills

    def _extract_profile_images(self, profile: Dict, result: Dict) -> None:
        """Extract profile and background picture information.

        :param profile: Profile data from API
        :param result: Result dictionary to update
        """
        # Extract profile picture
        if profile.get("profilePicture"):
            pic = profile["profilePicture"]
            vector_img = pic.get("displayImageReference", {}).get("vectorImage")
            if vector_img:
                result["displayPictureUrl"] = vector_img.get("rootUrl")

                # Extract image artifacts
                for artifact in vector_img.get("artifacts", []):
                    w, h = artifact.get("width"), artifact.get("height")
                    url_segment = artifact.get("fileIdentifyingUrlPathSegment")
                    if w and h and url_segment:
                        result[f"img_{w}_{h}"] = url_segment

        # Extract background picture
        if profile.get("backgroundPicture"):
            bg = profile["backgroundPicture"]
            vector_img = bg.get("displayImageReference", {}).get("vectorImage")
            if vector_img:
                result["backgroundPictureUrl"] = vector_img.get("rootUrl")

    def _fetch_profile_from_dash_api(self, urn_id: str) -> Optional[Dict]:
        """Fetch profile data from LinkedIn dash API.

        :param urn_id: LinkedIn URN ID
        :return: Profile data dict or None if fetch fails
        """
        params = {
            "decorationId": "com.linkedin.voyager.dash.deco.identity.profile.FullProfile-76"
        }

        try:
            res = self._fetch(f"/identity/dash/profiles/{urn_id}?{urlencode(params)}")
            response_data = res.json()

            if not response_data:
                self.logger.error("Empty response from dash API")
                return None

            # The API returns {"data": {profile}, "included": [...]}
            # We need to return the profile dict inside "data"
            if "data" in response_data and isinstance(response_data["data"], dict):
                return response_data["data"]
            return response_data
        except Exception as e:
            self.logger.error(f"Failed to fetch profile from dash API: {e}")
            return None

    def _extract_urn_from_json_ld(self, soup) -> Optional[str]:
        """Extract URN from JSON-LD structured data.

        :param soup: BeautifulSoup parsed HTML
        :return: Extracted URN or None
        """
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string)
                if isinstance(data, dict) and data.get("@type") == "Person":
                    identifier = data.get("identifier")
                    if identifier and "fsd_profile" in str(identifier):
                        urn = (
                            identifier
                            if identifier.startswith("urn:")
                            else f"urn:li:fsd_profile:{identifier}"
                        )
                        self.logger.debug(f"Extracted URN from JSON-LD: {urn}")
                        return urn
            except (json.JSONDecodeError, AttributeError):
                continue
        return None

    def _extract_urn_from_tags(
        self, soup, tag_name: str, public_id: Optional[str] = None
    ) -> Optional[str]:
        """Extract URN from HTML tags using regex pattern.

        :param soup: BeautifulSoup parsed HTML
        :param tag_name: HTML tag name to search ('code' or 'script')
        :param public_id: Optional public ID to filter tags containing profile data
        :return: Extracted URN or None
        """
        urn_pattern = r"urn:li:fsd_profile:[A-Za-z0-9_-]+"
        candidate_urns = []

        for tag in soup.find_all(tag_name):
            if tag.string and "fsd_profile" in tag.string:
                # If public_id provided, prefer tags that also mention it
                if public_id and public_id in tag.string:
                    match = re.search(urn_pattern, tag.string)
                    if match:
                        urn = match.group(0)
                        self.logger.debug(
                            f"Extracted URN from {tag_name} tag with matching public_id: {urn}"
                        )
                        return urn

                # Collect all URNs as candidates
                match = re.search(urn_pattern, tag.string)
                if match:
                    candidate_urns.append(match.group(0))

        # If no URN found with public_id match, return first candidate
        if candidate_urns:
            urn = candidate_urns[0]
            self.logger.debug(
                f"Extracted URN from {tag_name} tag (first candidate): {urn}"
            )
            return urn

        return None

    def _fetch_profile_html(self, public_id: str) -> Optional[str]:
        """Fetch profile HTML page.

        :param public_id: LinkedIn public ID
        :return: HTML content or None if fetch fails
        """
        encoded_public_id = quote(public_id, safe="")
        profile_url = f"{self.client.LINKEDIN_BASE_URL}/in/{encoded_public_id}/"

        try:
            res = self.client.session.get(profile_url)
            if res.status_code != 200:
                self.logger.error(
                    f"Failed to fetch profile page: HTTP {res.status_code}"
                )
                return None
            return res.text
        except Exception as e:
            self.logger.error(f"Error fetching profile page: {e}")
            return None

    def _extract_urn_from_public_id(self, public_id: str) -> Optional[str]:
        """Extract URN from profile using GraphQL API with HTML fallback.

        :param public_id: LinkedIn public ID (vanity name)
        :return: Extracted URN or None
        """
        # Try GraphQL first
        try:
            # Use GraphQL endpoint to get profile URN by vanityName
            query_id = "voyagerIdentityDashProfiles.a1a483e719b20537a256b6853cdca711"
            variables = f"(vanityName:{public_id})"
            query_string = urlencode(
                {
                    "includeWebMetadata": "true",
                    "variables": variables,
                    "queryId": query_id,
                }
            )
            url = f"/graphql?{query_string}"

            res = self._fetch(url)
            response_data = res.json()

            # Extract URN from response: data.data.identityDashProfilesByMemberIdentity.*elements[0]
            elements = (
                response_data.get("data", {})
                .get("data", {})
                .get("identityDashProfilesByMemberIdentity", {})
                .get("*elements", [])
            )

            if elements and len(elements) > 0:
                urn = elements[0]
                if urn and "fsd_profile" in urn:
                    self.logger.debug(f"Extracted URN from GraphQL: {urn}")
                    return urn

            self.logger.warning(
                f"Could not extract URN from GraphQL response for {public_id}. "
                f"Falling back to HTML parsing."
            )

        except Exception as e:
            self.logger.warning(
                f"GraphQL URN extraction failed: {e}. Falling back to HTML parsing."
            )

        # Fallback to HTML parsing
        try:
            from bs4 import BeautifulSoup

            self.logger.info(f"Attempting HTML parsing for profile: {public_id}")
            html = self._fetch_profile_html(public_id)
            if not html:
                self.logger.error(f"Failed to fetch HTML for profile: {public_id}")
                return None

            soup = BeautifulSoup(html, "html.parser")

            # Try extracting from code tags first
            urn = self._extract_urn_from_tags(soup, "code", public_id)
            if urn:
                self.logger.info(f"Extracted URN from HTML code tags: {urn}")
                return urn

            # Fallback to script tags
            urn = self._extract_urn_from_tags(soup, "script", public_id)
            if urn:
                self.logger.info(f"Extracted URN from HTML script tags: {urn}")
                return urn

            self.logger.error(f"Could not extract URN from HTML for {public_id}")
            return None

        except Exception as e:
            self.logger.error(f"HTML URN extraction failed: {e}", exc_info=True)
            return None

    def _normalize_urn(self, urn_id: str) -> str:
        """Ensure URN is in the correct format for dash API.

        :param urn_id: Raw URN or profile ID
        :return: Properly formatted URN
        """
        if not urn_id.startswith("urn:"):
            return f"urn:li:fsd_profile:{urn_id}"
        return urn_id

    def get_profile(
        self, public_id: Optional[str] = None, urn_id: Optional[str] = None
    ) -> Dict:
        """Fetch data for a given LinkedIn profile.

        :param public_id: LinkedIn public ID for a profile
        :type public_id: str, optional
        :param urn_id: LinkedIn URN ID for a profile
        :type urn_id: str, optional

        :return: Profile data
        :rtype: dict
        """
        # Convert public_id to URN if needed
        # The old REST endpoints (/identity/profiles/*) now return 410 Gone
        if public_id and not urn_id:
            urn_id = self._extract_urn_from_public_id(public_id)
            if not urn_id:
                return {}

        # Validate we have a URN
        if not urn_id:
            self.logger.error("Either public_id or urn_id must be provided")
            return {}

        # Normalize URN format
        urn_id = self._normalize_urn(urn_id)

        # Fetch profile from dash API
        profile = self._fetch_profile_from_dash_api(urn_id)
        if not profile:
            return {}

        # Extract basic profile information
        result = {
            "public_id": profile.get("publicIdentifier"),
            "profile_id": get_id_from_urn(profile.get("objectUrn", "")),
            "profile_urn": urn_id,
            "member_urn": profile.get("objectUrn"),
            "firstName": profile.get("firstName"),
            "lastName": profile.get("lastName"),
            "headline": profile.get("headline"),
            "summary": (
                profile.get("multiLocaleSummary", {}).get("en_US")
                if isinstance(profile.get("multiLocaleSummary"), dict)
                else profile.get("summary")
            ),
            "industryUrn": profile.get("industryUrn"),
            "locationName": profile.get("locationName"),
            "geoLocationName": profile.get("geoLocationName"),
            "geoUrn": profile.get("geoUrn"),
            "trackingId": profile.get("trackingId"),
            "versionTag": profile.get("versionTag"),
        }

        # Extract profile picture information
        self._extract_profile_images(profile, result)

        # Extract all profile sections using the helper function
        result["experience"] = extract_profile_section(
            profile,
            "*positionView",
            "profilePositionGroups",
            "profilePositionInPositionGroup",
        )
        result["education"] = extract_profile_section(
            profile, "*educationView", "profileEducations"
        )
        result["languages"] = extract_profile_section(
            profile, "*languageView", "profileLanguages"
        )
        result["skills"] = extract_profile_section(
            profile, "*skillView", "profileSkills"
        )
        result["certifications"] = extract_profile_section(
            profile, "*certificationView", "profileCertifications"
        )
        result["publications"] = extract_profile_section(
            profile, "*publicationView", "profilePublications"
        )
        result["volunteer"] = extract_profile_section(
            profile, "*volunteerExperienceView", "profileVolunteerExperiences"
        )
        result["honors"] = extract_profile_section(
            profile, "*honorView", "profileHonors"
        )
        result["projects"] = extract_profile_section(
            profile, "*projectView", "profileProjects"
        )

        # Add urn_id for backward compatibility
        result["urn_id"] = urn_id.replace("urn:li:fsd_profile:", "")

        return result

    def get_profile_connections(self, urn_id: str, **kwargs) -> List:
        """Fetch connections for a given LinkedIn profile.

        See Linkedin.search_people() for additional searching parameters.

        :param urn_id: LinkedIn URN ID for a profile
        :type urn_id: str

        :return: List of search results
        :rtype: list
        """
        return self.search_people(connection_of=urn_id, **kwargs)

    @staticmethod
    def _text_value(val) -> str:
        """Extract text from a value that may be a plain string or a TextViewModel dict."""
        if isinstance(val, dict):
            return val.get("text", "") or ""
        return val or ""

    def get_all_connections(self, limit: int = -1, offset: int = 0) -> List:
        """Fetch ALL of the authenticated user's 1st-degree connections
        using the dedicated connections endpoint (not the search API).

        This endpoint supports full pagination and is not subject to the
        ~20 result cap that now affects the search API.

        :param limit: Maximum number of connections to return (-1 for all)
        :type limit: int
        :param offset: Starting offset for pagination
        :type offset: int

        :return: List of connection dicts with keys: urn_id, public_id, name,
                 first_name, last_name, headline, location, picture_url, navigation_url
        :rtype: list
        """
        _CONN_PAGE_SIZE = 100
        results = []
        start = offset
        seen_urns = set()

        while True:
            count = _CONN_PAGE_SIZE
            if limit > 0 and limit - len(results) < count:
                count = limit - len(results)

            params = {
                "decorationId": "com.linkedin.voyager.dash.deco.web.mynetwork.ConnectionListWithProfile-15",
                "count": count,
                "q": "search",
                "sortType": "RECENTLY_ADDED",
                "start": start,
            }

            try:
                res = self._fetch(
                    "/relationships/dash/connections",
                    params=params,
                    headers={"accept": "application/vnd.linkedin.normalized+json+2.1"},
                )
                raw = res.json()
            except Exception:
                self.logger.exception("[CONNECTIONS] Error fetching at start=%d", start)
                break

            included = raw.get("included", [])
            data_section = raw.get("data", {})

            # Build lookup map from all included entities
            included_map = {}
            for inc in included:
                urn = inc.get("entityUrn", "")
                if urn:
                    included_map[urn] = inc

            # Get element references from data.*elements
            element_refs = data_section.get("*elements", []) if isinstance(data_section, dict) else []
            paging = data_section.get("paging", {}) if isinstance(data_section, dict) else {}

            # Debug: dump structure of first page
            if start == offset:
                self.logger.info("[CONNECTIONS] top-level keys: %s", list(raw.keys()))
                self.logger.info("[CONNECTIONS] data keys: %s", list(data_section.keys()) if isinstance(data_section, dict) else "N/A")
                self.logger.info("[CONNECTIONS] *elements count: %d, paging: %s", len(element_refs), paging)
                for i, inc in enumerate(included[:3]):
                    self.logger.info(
                        "[CONNECTIONS] included[%d]: $type=%s, entityUrn=%s, keys=%s",
                        i, inc.get("$type", "?"), inc.get("entityUrn", "?"), list(inc.keys())[:10]
                    )
                for inc in included:
                    if "fsd_profile" in inc.get("entityUrn", ""):
                        self.logger.info(
                            "[CONNECTIONS] FIRST fsd_profile: $type=%s, urn=%s, keys=%s, firstName=%r, lastName=%r, headline=%r, publicIdentifier=%r",
                            inc.get("$type", "?"), inc.get("entityUrn", "?"),
                            list(inc.keys()), inc.get("firstName", "<MISSING>"),
                            inc.get("lastName", "<MISSING>"), inc.get("headline", "<MISSING>"),
                            inc.get("publicIdentifier", "<MISSING>")
                        )
                        break

            if not element_refs and not included:
                break

            # Resolve connections: *elements → Connection object → connectedMember → Profile
            profiles = []
            for conn_urn in element_refs:
                conn = included_map.get(conn_urn, {})
                profile_urn = conn.get("*connectedMemberResolutionResult") or conn.get("connectedMember") or ""
                if not profile_urn:
                    continue
                if isinstance(profile_urn, dict):
                    profile_urn = profile_urn.get("entityUrn", "")
                urn_id = profile_urn.split(":")[-1] if profile_urn else ""
                if not urn_id or urn_id in seen_urns:
                    continue
                seen_urns.add(urn_id)
                profile = included_map.get(profile_urn, {})
                profiles.append((urn_id, profile))

            # Fallback: if *elements didn't work, try fsd_profile URNs from included
            if not profiles:
                for item in included:
                    entity_urn = item.get("entityUrn", "")
                    if "fsd_profile" not in entity_urn:
                        continue
                    urn_id = entity_urn.split(":")[-1]
                    if not urn_id or urn_id in seen_urns:
                        continue
                    seen_urns.add(urn_id)
                    profiles.append((urn_id, item))

            self.logger.info(
                "[CONNECTIONS] start=%d, *elements=%d, included=%d, profiles=%d, paging_total=%s",
                start, len(element_refs), len(included), len(profiles),
                paging.get("total", "?")
            )

            if not profiles:
                break

            for urn_id, profile in profiles:
                first_name = self._text_value(profile.get("firstName"))
                last_name = self._text_value(profile.get("lastName"))
                name = f"{first_name} {last_name}".strip()
                headline = self._text_value(profile.get("headline"))
                location = self._text_value(
                    profile.get("geoLocationName") or profile.get("locationName")
                )

                # Extract profile picture
                picture_url = ""
                picture_data = profile.get("profilePicture") or profile.get("picture") or {}
                if isinstance(picture_data, dict):
                    vec = (picture_data.get("displayImageReference") or {}).get("vectorImage") or {}
                    if not vec:
                        vec = picture_data.get("com.linkedin.common.VectorImage") or {}
                    art_list = vec.get("artifacts") or []
                    root_url = vec.get("rootUrl", "")
                    if art_list and root_url:
                        best = art_list[-1]
                        file_seg = best.get("fileIdentifyingUrlPathSegment", "")
                        if file_seg:
                            picture_url = f"{root_url}{file_seg}"

                public_id = self._text_value(profile.get("publicIdentifier"))

                results.append({
                    "urn_id": urn_id,
                    "public_id": public_id,
                    "name": name or "Inconnu",
                    "first_name": first_name,
                    "last_name": last_name,
                    "jobtitle": headline,
                    "location": location,
                    "picture_url": picture_url,
                    "navigation_url": f"https://www.linkedin.com/in/{public_id}" if public_id else "",
                })

            # Use element_refs count for pagination (matches LinkedIn's page size)
            start += len(element_refs) if element_refs else len(profiles)

            if 0 < limit <= len(results):
                break

            if start > 10000:
                self.logger.warning("[CONNECTIONS] Safety limit reached at start=%d", start)
                break

        self.logger.info("[CONNECTIONS] Total fetched: %d connections", len(results))
        return results

    def get_profile_experiences(self, urn_id: str) -> List:
        """Fetch experiences for a given LinkedIn profile.

        NOTE: data structure differs slightly from  Linkedin.get_profile() experiences.

        :param urn_id: LinkedIn URN ID for a profile
        :type urn_id: str

        :return: List of experiences
        :rtype: list
        """
        profile_urn = f"urn:li:fsd_profile:{urn_id}"
        variables = ",".join(
            [f"profileUrn:{quote(profile_urn)}", "sectionType:experience"]
        )
        # Hardcoded queryId for profile experience
        query_id = (
            "voyagerIdentityDashProfileComponents.3ef6d3f8e7295e8e8e7c3f2e2e3f3f3f"
        )

        res = self._fetch(
            f"/graphql?variables=({variables})&queryId={query_id}&includeWebMetadata=true",
            headers={"accept": "application/vnd.linkedin.normalized+json+2.1"},
        )

        def parse_item(item, is_group_item=False):
            """
            Parse a single experience item.

            Items as part of an 'experience group' (e.g. a company with multiple positions) have different data structures.
            Therefore, some exceptions need to be made when parsing these items.
            """
            component = item["components"]["entityComponent"]
            title = component["titleV2"]["text"]["text"]
            subtitle = component["subtitle"]
            company = subtitle["text"].split(" · ")[0] if subtitle else None
            employment_type_parts = subtitle["text"].split(" · ") if subtitle else None
            employment_type = (
                employment_type_parts[1]
                if employment_type_parts and len(employment_type_parts) > 1
                else None
            )
            metadata = component.get("metadata", {}) or {}
            location = metadata.get("text")

            duration_text = component["caption"]["text"]
            duration_parts = duration_text.split(" · ")
            date_parts = duration_parts[0].split(" - ")

            duration = (
                duration_parts[1]
                if duration_parts and len(duration_parts) > 1
                else None
            )
            start_date = date_parts[0] if date_parts else None
            end_date = date_parts[1] if date_parts and len(date_parts) > 1 else None

            sub_components = component["subComponents"]
            fixed_list_component = (
                sub_components["components"][0]["components"]["fixedListComponent"]
                if sub_components
                else None
            )

            fixed_list_text_component = (
                fixed_list_component["components"][0]["components"]["textComponent"]
                if fixed_list_component
                else None
            )

            # Extract additional description
            description = (
                fixed_list_text_component["text"]["text"]
                if fixed_list_text_component
                else None
            )

            # Create a dictionary with the extracted information
            parsed_data = {
                "title": title,
                "companyName": company if not is_group_item else None,
                "employmentType": company if is_group_item else employment_type,
                "locationName": location,
                "duration": duration,
                "startDate": start_date,
                "endDate": end_date,
                "description": description,
            }

            return parsed_data

        def get_grouped_item_id(item):
            sub_components = item["components"]["entityComponent"]["subComponents"]
            sub_components_components = (
                sub_components["components"][0]["components"]
                if sub_components
                else None
            )
            paged_list_component_id = (
                sub_components_components.get("*pagedListComponent", "")
                if sub_components_components
                else None
            )
            if (
                paged_list_component_id
                and "fsd_profilePositionGroup" in paged_list_component_id
            ):
                pattern = r"urn:li:fsd_profilePositionGroup:\([A-z0-9]+,[A-z0-9]+\)"
                match = re.search(pattern, paged_list_component_id)
                return match.group(0) if match else None

        data = res.json()

        items = []
        for item in data["included"][0]["components"]["elements"]:
            grouped_item_id = get_grouped_item_id(item)
            # if the item is part of a group (e.g. a company with multiple positions),
            # find the group items and parse them.
            if grouped_item_id:
                component = item["components"]["entityComponent"]
                # use the company and location from the main item
                company = component["titleV2"]["text"]["text"]

                location = (
                    component["caption"]["text"] if component["caption"] else None
                )

                # find the group
                group = [
                    i
                    for i in data["included"]
                    if grouped_item_id in i.get("entityUrn", "")
                ]
                if not group:
                    continue
                for group_item in group[0]["components"]["elements"]:
                    parsed_data = parse_item(group_item, is_group_item=True)
                    parsed_data["companyName"] = company
                    parsed_data["locationName"] = location
                    items.append(parsed_data)
                continue

            # else, parse the regular item
            parsed_data = parse_item(item)
            items.append(parsed_data)

        return items

    def get_company_updates(
        self,
        public_id: Optional[str] = None,
        urn_id: Optional[str] = None,
        max_results: Optional[int] = None,
        results: Optional[List] = None,
    ) -> List:
        """Fetch company updates (news activity) for a given LinkedIn company.

        :param public_id: LinkedIn public ID for a company
        :type public_id: str, optional
        :param urn_id: LinkedIn URN ID for a company
        :type urn_id: str, optional

        :return: List of company update objects
        :rtype: list
        """

        if results is None:
            results = []

        params = {
            "companyUniversalName": {public_id or urn_id},
            "q": "companyFeedByUniversalName",
            "moduleKey": "member-share",
            "count": Linkedin._MAX_UPDATE_COUNT,
            "start": len(results),
        }

        res = self._fetch(f"/feed/updates", params=params)

        data = res.json()

        if (
            len(data["elements"]) == 0
            or (max_results is not None and len(results) >= max_results)
            or (
                max_results is not None
                and len(results) / max_results >= Linkedin._MAX_REPEATED_REQUESTS
            )
        ):
            return results

        results.extend(data["elements"])
        self.logger.debug(f"results grew: {len(results)}")

        return self.get_company_updates(
            public_id=public_id,
            urn_id=urn_id,
            results=results,
            max_results=max_results,
        )

    def get_profile_updates(
        self, public_id=None, urn_id=None, max_results=None, results=None
    ):
        """Fetch profile updates (newsfeed activity) for a given LinkedIn profile.

        :param public_id: LinkedIn public ID for a profile
        :type public_id: str, optional
        :param urn_id: LinkedIn URN ID for a profile
        :type urn_id: str, optional

        :return: List of profile update objects
        :rtype: list
        """

        if results is None:
            results = []

        params = {
            "profileId": {public_id or urn_id},
            "q": "memberShareFeed",
            "moduleKey": "member-share",
            "count": Linkedin._MAX_UPDATE_COUNT,
            "start": len(results),
        }

        res = self._fetch(f"/feed/updates", params=params)

        data = res.json()

        if (
            len(data["elements"]) == 0
            or (max_results is not None and len(results) >= max_results)
            or (
                max_results is not None
                and len(results) / max_results >= Linkedin._MAX_REPEATED_REQUESTS
            )
        ):
            return results

        results.extend(data["elements"])
        self.logger.debug(f"results grew: {len(results)}")

        return self.get_profile_updates(
            public_id=public_id,
            urn_id=urn_id,
            results=results,
            max_results=max_results,
        )

    def get_current_profile_views(self):
        """Get profile view statistics, including chart data.

        :return: Profile view data
        :rtype: dict
        """
        res = self._fetch(f"/identity/wvmpCards")

        data = res.json()

        return data["elements"][0]["value"][
            "com.linkedin.voyager.identity.me.wvmpOverview.WvmpViewersCard"
        ]["insightCards"][0]["value"][
            "com.linkedin.voyager.identity.me.wvmpOverview.WvmpSummaryInsightCard"
        ][
            "numViews"
        ]

    def get_school(self, public_id):
        """Fetch data about a given LinkedIn school.

        :param public_id: LinkedIn public ID for a school
        :type public_id: str

        :return: School data
        :rtype: dict
        """
        params = {
            "decorationId": "com.linkedin.voyager.deco.organization.web.WebFullCompanyMain-12",
            "q": "universalName",
            "universalName": public_id,
        }

        res = self._fetch(f"/organization/companies?{urlencode(params)}")

        data = res.json()

        if data and "status" in data and data["status"] != 200:
            self.logger.info("request failed: {}".format(data))
            return {}

        school = data["elements"][0]

        return school

    def get_company(self, public_id):
        """Fetch data about a given LinkedIn company.

        :param public_id: LinkedIn public ID for a company
        :type public_id: str

        :return: Company data
        :rtype: dict
        """
        params = {
            "decorationId": "com.linkedin.voyager.deco.organization.web.WebFullCompanyMain-12",
            "q": "universalName",
            "universalName": public_id,
        }

        res = self._fetch(f"/organization/companies", params=params)

        data = res.json()

        if data and "status" in data and data["status"] != 200:
            self.logger.info("request failed: {}".format(data["message"]))
            return {}

        company = data["elements"][0]

        return company

    def follow_company(self, following_state_urn, following=True):
        """Follow a company from its ID.

        :param following_state_urn: LinkedIn State URN to append to URL to follow the company
        :type following_state_urn: str
        :param following: The following state to set. True by default for following the company
        :type following: bool, optional

        :return: Error state. If True, an error occured.
        :rtype: boolean
        """
        payload = json.dumps({"patch": {"$set": {"following": following}}})

        res = self._post(
            f"/feed/dash/followingStates/{following_state_urn}", data=payload
        )

        return res.status_code != 200

    def get_conversation_details(self, profile_urn_id):
        """Fetch conversation (message thread) details for a given LinkedIn profile.

        Tries multiple strategies since LinkedIn's API endpoints change:
        1. Scan unfiltered inbox for matching participant
        2. Direct fetch via constructed conversation URN (dash API)
        3. Legacy filtered API (often returns 500, kept as fallback)

        :param profile_urn_id: LinkedIn URN ID for a profile
        :type profile_urn_id: str

        :return: Conversation data
        :rtype: dict
        """
        # Normalize target ID for matching (strip urn prefix)
        if profile_urn_id.startswith("urn:"):
            target_id = profile_urn_id.split(":")[-1]
        else:
            target_id = profile_urn_id

        # Strategy 1: Scan unfiltered inbox
        try:
            result = self._find_conversation_in_inbox(target_id)
            if result:
                print(f"[CONVO LOOKUP] Found via inbox scan, id={result.get('id')}", flush=True)
                return result
        except Exception as e:
            print(f"[CONVO LOOKUP] Inbox scan failed: {e}", flush=True)

        # Strategy 2: Direct conversation fetch by constructed URN
        try:
            result = self._get_conversation_by_urn(profile_urn_id)
            if result:
                print(f"[CONVO LOOKUP] Found via direct URN fetch", flush=True)
                return result
        except Exception as e:
            print(f"[CONVO LOOKUP] Direct URN fetch failed: {e}", flush=True)

        # Strategy 3: Legacy filtered API (may return 500)
        try:
            params = {
                "keyVersion": "LEGACY_INBOX",
                "q": "participants",
                "recipients": f"List({profile_urn_id})",
            }
            query = urlencode(params, safe="(),")
            res = self._fetch(f"/messaging/conversations?{query}")
            data = res.json()
            if data.get("elements"):
                item = data["elements"][0]
                item["id"] = get_id_from_urn(item["entityUrn"])
                print(f"[CONVO LOOKUP] Found via legacy filtered API", flush=True)
                return item
        except Exception as e:
            print(f"[CONVO LOOKUP] Legacy filtered API failed: {e}", flush=True)

        print(f"[CONVO LOOKUP] All strategies failed for {profile_urn_id}", flush=True)
        return {}

    def _find_conversation_in_inbox(self, target_id: str) -> dict:
        """Search through unfiltered inbox conversations for a matching participant.

        :param target_id: Profile ID to search for (without urn prefix)
        :return: Conversation dict with 'id' key, or empty dict
        """
        params = {"keyVersion": "LEGACY_INBOX"}
        res = self._fetch("/messaging/conversations", params=params)
        data = res.json()

        elements = data.get("elements", [])
        print(f"[CONVO LOOKUP] Inbox scan: {len(elements)} conversations", flush=True)

        for convo in elements:
            participants = convo.get("participants", [])
            for p in participants:
                # Legacy format: MessagingMember with miniProfile
                member = p.get("com.linkedin.voyager.messaging.MessagingMember", {})
                if member:
                    mini = member.get("miniProfile", {})
                    entity_urn = mini.get("entityUrn", "")
                    # urn:li:fs_miniProfile:ACoXXX -> compare ACoXXX part
                    if target_id in entity_urn:
                        convo["id"] = get_id_from_urn(convo.get("entityUrn", ""))
                        return convo

                # Alternative: direct participant URNs
                p_urn = p.get("entityUrn", "") or p.get("participantUrn", "")
                if target_id in p_urn:
                    convo["id"] = get_id_from_urn(convo.get("entityUrn", ""))
                    return convo

        return {}

    def _get_conversation_by_urn(self, profile_urn_id: str) -> dict:
        """Directly fetch a conversation by constructing its URN from mailbox + contact URN.

        :param profile_urn_id: LinkedIn URN ID (with or without urn prefix)
        :return: Conversation dict with 'id' key, or empty dict
        """
        mailbox_urn = self._get_mailbox_urn()
        if not mailbox_urn:
            print(f"[CONVO LOOKUP] Cannot get mailbox URN", flush=True)
            return {}

        if not profile_urn_id.startswith("urn:"):
            full_profile_urn = f"urn:li:fsd_profile:{profile_urn_id}"
        else:
            full_profile_urn = profile_urn_id

        # Conversation URN format: urn:li:msg_conversation:(mailbox,recipient)
        conversation_urn = f"urn:li:msg_conversation:({mailbox_urn},{full_profile_urn})"
        encoded_urn = quote(conversation_urn, safe="")

        res = self._fetch(
            f"/voyagerMessagingDashConversations/{encoded_urn}",
            params={"decorationId": "com.linkedin.voyager.dash.deco.messaging.FullConversation-2"},
        )
        data = res.json()

        # Response may be wrapped in {"data": {...}, "included": [...]}
        convo = data.get("data", data)
        if convo and convo.get("entityUrn"):
            entity_urn = convo["entityUrn"]
            convo["id"] = get_id_from_urn(entity_urn)
            return convo

        return {}

    def get_conversations(self):
        """Fetch list of conversations the user is in.

        :return: List of conversations
        :rtype: list
        """
        params = {"keyVersion": "LEGACY_INBOX"}

        res = self._fetch(f"/messaging/conversations", params=params)

        return res.json()

    def get_conversation(self, conversation_urn_id: str):
        """Fetch data about a given conversation.

        :param conversation_urn_id: LinkedIn URN ID for a conversation
        :type conversation_urn_id: str

        :return: Conversation data
        :rtype: dict
        """
        res = self._fetch(f"/messaging/conversations/{conversation_urn_id}/events")

        return res.json()

    def _get_mailbox_urn(self) -> Optional[str]:
        """Get the current user's mailbox URN (fsd_profile URN).

        Uses LINKEDIN_MAILBOX_URN env var if set, otherwise fetches from API.

        :return: Mailbox URN string or None
        :rtype: str or None
        """
        if hasattr(self, "_mailbox_urn") and self._mailbox_urn:
            return self._mailbox_urn

        # Check env var first (avoids extra API call)
        env_urn = os.environ.get("LINKEDIN_MAILBOX_URN")
        if env_urn:
            if not env_urn.startswith("urn:"):
                env_urn = f"urn:li:fsd_profile:{env_urn}"
            self._mailbox_urn = env_urn
            return self._mailbox_urn

        # Fallback: try to extract from /me endpoint
        try:
            me = self.get_user_profile(use_cache=False)
            # Response may be wrapped in {"data": ..., "included": [...]}
            included = me.get("included", [])
            if included:
                for item in included:
                    entity_urn = item.get("entityUrn", "")
                    if "fsd_profile" in entity_urn:
                        self._mailbox_urn = entity_urn.replace("fs_miniProfile", "fsd_profile")
                        return self._mailbox_urn
                    # Also try objectUrn -> convert member id to fsd_profile
                    obj_urn = item.get("objectUrn", "")
                    if "member:" in obj_urn:
                        # Use the miniProfile entityUrn and convert
                        if entity_urn and "miniProfile" in entity_urn:
                            profile_id = entity_urn.split(":")[-1]
                            self._mailbox_urn = f"urn:li:fsd_profile:{profile_id}"
                            return self._mailbox_urn
            # Unwrapped response
            data = me.get("data", me)
            plain_id = data.get("plainId")
            mini_ref = data.get("*miniProfile", "")
            if mini_ref and "miniProfile" in mini_ref:
                profile_id = mini_ref.split(":")[-1]
                self._mailbox_urn = f"urn:li:fsd_profile:{profile_id}"
                return self._mailbox_urn
        except Exception as e:
            self.logger.warning(f"Failed to get mailbox URN: {e}")

        return None

    def send_message(
        self,
        message_body: str,
        conversation_urn_id: Optional[str] = None,
        recipients: Optional[List[str]] = None,
    ):
        """Send a message to a given conversation using the new dash messaging API.

        :param message_body: Message text to send
        :type message_body: str
        :param conversation_urn_id: LinkedIn conversation URN ID (the thread ID part)
        :type conversation_urn_id: str, optional
        :param recipients: List of profile urn id's (without urn:li:fsd_profile: prefix)
        :type recipients: list, optional

        :return: Error state. If True, an error occured.
        :rtype: boolean
        """
        if not (conversation_urn_id or recipients):
            self.logger.debug("Must provide [conversation_urn_id] or [recipients].")
            return True

        # Get current user's mailbox URN
        mailbox_urn = self._get_mailbox_urn()
        if not mailbox_urn:
            self.logger.error("Could not determine mailbox URN for current user")
            return True

        # Normalize mailbox URN
        if not mailbox_urn.startswith("urn:"):
            mailbox_urn = f"urn:li:fsd_profile:{mailbox_urn}"

        # Build the message payload for the new dash API
        message_payload = {
            "body": {
                "attributes": [],
                "text": message_body,
            },
            "renderContentUnions": [],
            "originToken": str(uuid.uuid4()),
        }

        payload = {
            "message": message_payload,
            "mailboxUrn": mailbox_urn,
            "trackingId": generate_trackingId_as_charString(),
            "dedupeByClientGeneratedToken": False,
        }

        if conversation_urn_id:
            # Build full conversation URN if needed
            if not conversation_urn_id.startswith("urn:"):
                conversation_urn = f"urn:li:msg_conversation:({mailbox_urn},{conversation_urn_id})"
            else:
                conversation_urn = conversation_urn_id
            message_payload["conversationUrn"] = conversation_urn
        elif recipients:
            # Normalize recipient URNs
            normalized = []
            for r in recipients:
                if not r.startswith("urn:"):
                    normalized.append(f"urn:li:fsd_profile:{r}")
                else:
                    normalized.append(r)
            payload["hostRecipientUrns"] = normalized

        res = self._post(
            "/voyagerMessagingDashMessengerMessages",
            params={"action": "createMessage"},
            data=json.dumps(payload),
            headers={"Content-Type": "text/plain;charset=UTF-8"},
        )

        return res.status_code != 200

    def mark_conversation_as_seen(self, conversation_urn_id: str):
        """Send 'seen' to a given conversation.

        :param conversation_urn_id: LinkedIn URN ID for a conversation
        :type conversation_urn_id: str

        :return: Error state. If True, an error occured.
        :rtype: boolean
        """
        payload = json.dumps({"patch": {"$set": {"read": True}}})

        res = self._post(
            f"/messaging/conversations/{conversation_urn_id}", data=payload
        )

        return res.status_code != 200

    def get_user_profile(self, use_cache=True) -> Dict:
        """Get the current user profile. If not cached, a network request will be fired.

        :return: Profile data for currently logged in user
        :rtype: dict
        """
        me_profile = self.client.metadata.get("me", {})
        if not self.client.metadata.get("me") or not use_cache:
            res = self._fetch(f"/me")
            me_profile = res.json()
            # cache profile
            self.client.metadata["me"] = me_profile

        return me_profile

    def get_invitations(self, start=0, limit=3):
        """Fetch connection invitations for the currently logged in user.

        :param start: How much to offset results by
        :type start: int
        :param limit: Maximum amount of invitations to return
        :type limit: int

        :return: List of invitation objects
        :rtype: list
        """
        params = {
            "start": start,
            "count": limit,
            "includeInsights": True,
            "q": "receivedInvitation",
        }

        res = self._fetch(
            "/relationships/invitationViews",
            params=params,
        )

        if res.status_code != 200:
            return []

        response_payload = res.json()
        return [element["invitation"] for element in response_payload["elements"]]

    def reply_invitation(
        self, invitation_entity_urn: str, invitation_shared_secret: str, action="accept"
    ):
        """Respond to a connection invitation. By default, accept the invitation.

        :param invitation_entity_urn: URN ID of the invitation
        :type invitation_entity_urn: int
        :param invitation_shared_secret: Shared secret of invitation
        :type invitation_shared_secret: str
        :param action: "accept" or "reject". Defaults to "accept"
        :type action: str, optional

        :return: Success state. True if successful
        :rtype: boolean
        """
        invitation_id = get_id_from_urn(invitation_entity_urn)
        params = {"action": action}
        payload = json.dumps(
            {
                "invitationId": invitation_id,
                "invitationSharedSecret": invitation_shared_secret,
                "isGenericInvitation": False,
            }
        )

        res = self._post(
            f"/relationships/invitations/{invitation_id}",
            params=params,
            data=payload,
        )

        return res.ok

    def add_connection(self, profile_public_id: str, message="", profile_urn=None):
        """Add a given profile id as a connection.

        :param profile_public_id: public ID of a LinkedIn profile
        :type profile_public_id: str
        :param message: message to send along with connection request
        :type profile_urn: str, optional
        :param profile_urn: member URN for the given LinkedIn profile
        :type profile_urn: str, optional

        :return: Error state. True if error occurred
        :rtype: boolean
        """

        # Validating message length (max size is 300 characters)
        if len(message) > 300:
            self.logger.info("Message too long. Max size is 300 characters")
            return False

        if not profile_urn:
            profile_urn_string = self.get_profile(public_id=profile_public_id)[
                "profile_urn"
            ]
            # Returns string of the form 'urn:li:fs_miniProfile:ACoAABTest001FakeLinkedInProfileId'
            # We extract the last part of the string
            profile_urn = profile_urn_string.split(":")[-1]

        payload = {
            "invitee": {
                "inviteeUnion": {"memberProfile": f"urn:li:fsd_profile:{profile_urn}"}
            },
            "customMessage": message,
        }
        params = {
            "action": "verifyQuotaAndCreateV2",
            "decorationId": "com.linkedin.voyager.dash.deco.relationships.InvitationCreationResultWithInvitee-2",
        }

        res = self._post(
            "/voyagerRelationshipsDashMemberRelationships",
            data=json.dumps(payload),
            headers={"accept": "application/vnd.linkedin.normalized+json+2.1"},
            params=params,
        )
        # Check for connection_response.status_code == 400 and connection_response.json().get('data', {}).get('code') == 'CANT_RESEND_YET'
        # If above condition is True then request has been already sent, (might be pending or already connected)
        if res.ok:
            return False
        else:
            return True

    def remove_connection(self, public_profile_id: str):
        """Remove a given profile as a connection.

        :param public_profile_id: public ID of a LinkedIn profile
        :type public_profile_id: str

        :return: Error state. True if error occurred
        :rtype: boolean
        """
        res = self._post(
            f"/identity/profiles/{public_profile_id}/profileActions?action=disconnect",
            headers={"accept": "application/vnd.linkedin.normalized+json+2.1"},
        )

        return res.status_code != 200

    def track(self, eventBody, eventInfo):
        payload = {"eventBody": eventBody, "eventInfo": eventInfo}
        res = self._post(
            "/li/track",
            base_request=True,
            headers={
                "accept": "*/*",
                "content-type": "text/plain;charset=UTF-8",
            },
            data=json.dumps(payload),
        )

        return res.status_code != 200

    def get_profile_privacy_settings(self, public_profile_id: str):
        """Fetch privacy settings for a given LinkedIn profile.

        :param public_profile_id: public ID of a LinkedIn profile
        :type public_profile_id: str

        :return: Privacy settings data
        :rtype: dict
        """
        res = self._fetch(
            f"/identity/profiles/{public_profile_id}/privacySettings",
            headers={"accept": "application/vnd.linkedin.normalized+json+2.1"},
        )
        if res.status_code != 200:
            return {}

        data = res.json()
        return data.get("data", {})

    def get_profile_member_badges(self, public_profile_id: str):
        """Fetch badges for a given LinkedIn profile.

        :param public_profile_id: public ID of a LinkedIn profile
        :type public_profile_id: str

        :return: Badges data
        :rtype: dict
        """
        res = self._fetch(
            f"/identity/profiles/{public_profile_id}/memberBadges",
            headers={"accept": "application/vnd.linkedin.normalized+json+2.1"},
        )
        if res.status_code != 200:
            return {}

        data = res.json()
        return data.get("data", {})

    def get_profile_network_info(self, public_profile_id: str):
        """Fetch network information for a given LinkedIn profile.

        Network information includes the following:
        - number of connections
        - number of followers
        - if the account is followable
        - the network distance between the API session user and the profile
        - if the API session user is following the profile

        :param public_profile_id: public ID of a LinkedIn profile
        :type public_profile_id: str

        :return: Network data
        :rtype: dict
        """
        res = self._fetch(
            f"/identity/profiles/{public_profile_id}/networkinfo",
            headers={"accept": "application/vnd.linkedin.normalized+json+2.1"},
        )
        if res.status_code != 200:
            return {}

        data = res.json()
        return data.get("data", {})

    def unfollow_entity(self, urn_id: str):
        """Unfollow a given entity.

        :param urn_id: URN ID of entity to unfollow
        :type urn_id: str

        :return: Error state. Returns True if error occurred
        :rtype: boolean
        """
        payload = {"urn": f"urn:li:fs_followingInfo:{urn_id}"}
        res = self._post(
            "/feed/follows?action=unfollowByEntityUrn",
            headers={"accept": "application/vnd.linkedin.normalized+json+2.1"},
            data=json.dumps(payload),
        )

        err = False
        if res.status_code != 200:
            err = True

        return err

    def _get_list_feed_posts_and_list_feed_urns(
        self, limit=-1, offset=0, exclude_promoted_posts=True
    ):
        """Get a list of URNs from feed sorted by 'Recent' and a list of yet
        unsorted posts, each one of them containing a dict per post.

        :param limit: Maximum length of the returned list, defaults to -1 (no limit)
        :type limit: int, optional
        :param offset: Index to start searching from
        :type offset: int, optional
        :param exclude_promoted_posts: Exclude from the output promoted posts
        :type exclude_promoted_posts: bool, optional

        :return: List of posts and list of URNs
        :rtype: (list, list)
        """
        _PROMOTED_STRING = "Promoted"
        _PROFILE_URL = f"{self.client.LINKEDIN_BASE_URL}/in/"

        l_posts = []
        l_urns = []

        # If count>100 API will return HTTP 400
        count = Linkedin._MAX_UPDATE_COUNT
        if limit == -1:
            limit = Linkedin._MAX_UPDATE_COUNT

        # 'l_urns' equivalent to other functions 'results' variable
        l_urns = []

        while True:
            # when we're close to the limit, only fetch what we need to
            if limit > -1 and limit - len(l_urns) < count:
                count = limit - len(l_urns)
            params = {
                "count": str(count),
                "q": "chronFeed",
                "start": len(l_urns) + offset,
            }
            res = self._fetch(
                f"/feed/updatesV2",
                params=params,
                headers={"accept": "application/vnd.linkedin.normalized+json+2.1"},
            )
            """
            Response includes two keya:
            - ['Data']['*elements']. It includes the posts URNs always
            properly sorted as 'Recent', including yet sponsored posts. The
            downside is that fetching one by one the posts is slower. We will
            save the URNs to later on build a sorted list of posts purging
            promotions
            - ['included']. List with all the posts attributes, but not sorted as
            'Recent' and including promoted posts
            """
            l_raw_posts = res.json().get("included", {})
            l_raw_urns = res.json().get("data", {}).get("*elements", [])

            l_new_posts = parse_list_raw_posts(
                l_raw_posts, self.client.LINKEDIN_BASE_URL
            )
            l_posts.extend(l_new_posts)

            l_urns.extend(parse_list_raw_urns(l_raw_urns))

            # break the loop if we're done searching
            # NOTE: we could also check for the `total` returned in the response.
            # This is in data["data"]["paging"]["total"]
            if (
                (limit > -1 and len(l_urns) >= limit)  # if our results exceed set limit
                or len(l_urns) / count >= Linkedin._MAX_REPEATED_REQUESTS
            ) or len(l_raw_urns) == 0:
                break

            self.logger.debug(f"results grew to {len(l_urns)}")

        return l_posts, l_urns

    def get_feed_posts(self, limit=-1, offset=0, exclude_promoted_posts=True):
        """Get a list of URNs from feed sorted by 'Recent'

        :param limit: Maximum length of the returned list, defaults to -1 (no limit)
        :type limit: int, optional
        :param offset: Index to start searching from
        :type offset: int, optional
        :param exclude_promoted_posts: Exclude from the output promoted posts
        :type exclude_promoted_posts: bool, optional

        :return: List of URNs
        :rtype: list
        """
        l_posts, l_urns = self._get_list_feed_posts_and_list_feed_urns(
            limit, offset, exclude_promoted_posts
        )
        return get_list_posts_sorted_without_promoted(l_urns, l_posts)

    def get_job(self, job_id: str) -> Dict:
        """Fetch data about a given job.
        :param job_id: LinkedIn job ID
        :type job_id: str

        :return: Job data
        :rtype: dict
        """
        params = {
            "decorationId": "com.linkedin.voyager.deco.jobs.web.shared.WebLightJobPosting-23",
        }

        res = self._fetch(f"/jobs/jobPostings/{job_id}", params=params)

        data = res.json()

        if data and "status" in data and data["status"] != 200:
            self.logger.info(
                f"request failed:{data.get('status')} - {data.get('message')}"
            )
            return {}

        return data

    def get_post_reactions(self, urn_id, max_results=None, results=None):
        """Fetch social reactions for a given LinkedIn post.

        :param urn_id: LinkedIn URN ID for a post
        :type urn_id: str
        :param max_results: Maximum results to return
        :type max_results: int, optional

        :return: List of social reactions
        :rtype: list

        # Note: This may need to be updated to GraphQL in the future, see https://github.com/tomquirk/linkedin-api/pull/309
        """

        if results is None:
            results = []

        params = {
            "decorationId": "com.linkedin.voyager.dash.deco.social.ReactionsByTypeWithProfileActions-13",
            "count": 10,
            "q": "reactionType",
            "start": len(results),
            "threadUrn": urn_id,
        }

        res = self._fetch("/voyagerSocialDashReactions", params=params)

        data = res.json()

        if (
            len(data["elements"]) == 0
            or (max_results is not None and len(results) >= max_results)
            or (
                max_results is not None
                and len(results) / max_results >= Linkedin._MAX_REPEATED_REQUESTS
            )
        ):
            return results

        results.extend(data["elements"])
        self.logger.debug(f"results grew: {len(results)}")

        return self.get_post_reactions(
            urn_id=urn_id,
            results=results,
            max_results=max_results,
        )

    def react_to_post(self, post_urn_id, reaction_type="LIKE"):
        """React to a given post.
        :param post_urn_id: LinkedIn Post URN ID
        :type post_urn_id: str
        :param reactionType: LinkedIn reaction type, defaults to "LIKE", can be "LIKE", "PRAISE", "APPRECIATION", "EMPATHY", "INTEREST", "ENTERTAINMENT"
        :type reactionType: str

        :return: Error state. If True, an error occured.
        :rtype: boolean
        """
        params = {"threadUrn": f"urn:li:activity:{post_urn_id}"}
        payload = {"reactionType": reaction_type}

        res = self._post(
            "/voyagerSocialDashReactions",
            params=params,
            data=json.dumps(payload),
        )

        return res.status_code != 201

    def get_job_skills(self, job_id: str) -> Dict:
        """Fetch skills associated with a given job.
        :param job_id: LinkedIn job ID
        :type job_id: str

        :return: Job skills
        :rtype: dict
        """
        params = {
            "decorationId": "com.linkedin.voyager.dash.deco.assessments.FullJobSkillMatchInsight-17",
        }
        # https://www.linkedin.com/voyager/api/voyagerAssessmentsDashJobSkillMatchInsight/urn%3Ali%3Afsd_jobSkillMatchInsight%3A3894460323?decorationId=com.linkedin.voyager.dash.deco.assessments.FullJobSkillMatchInsight-17
        res = self._fetch(
            f"/voyagerAssessmentsDashJobSkillMatchInsight/urn%3Ali%3Afsd_jobSkillMatchInsight%3A{job_id}",
            params=params,
        )
        data = res.json()

        if data and "status" in data and data["status"] != 200:
            self.logger.info("request failed: {}".format(data.get("message")))
            return {}

        return data

    def schedule_post(
        self,
        text: str,
        scheduled_at: int,
        image_path: Optional[str] = None,
        image_base64: Optional[str] = None,
        image_filename: Optional[str] = None,
        visibility: str = "ANYONE",
        alt_text: str = "",
    ):
        """
        Schedule a LinkedIn post with optional image attachment.

        :param text: The text content of the post
        :type text: str
        :param scheduled_at: Unix timestamp in milliseconds for when to publish the post
        :type scheduled_at: int
        :param image_path: Local path to an image file to attach (optional, use image_base64 in containers)
        :type image_path: str, optional
        :param image_base64: Base64 encoded image data (optional, preferred for containerized environments)
        :type image_base64: str, optional
        :param image_filename: Filename with extension for base64 image (e.g., 'image.png', required with image_base64)
        :type image_filename: str, optional
        :param visibility: Who can see the post - "ANYONE" (public) or "CONNECTIONS" (default: "ANYONE")
        :type visibility: str, optional
        :param alt_text: Alternative text for the image (for accessibility)
        :type alt_text: str, optional

        :return: Response data with share information
        :rtype: dict
        """
        # Validate visibility parameter
        valid_visibility_values = ["ANYONE", "CONNECTIONS"]
        if visibility not in valid_visibility_values:
            raise ValueError(
                f"Invalid visibility value: {visibility}. Must be one of {valid_visibility_values}"
            )

        # Validate scheduled_at timestamp
        if not isinstance(scheduled_at, int) or scheduled_at <= 0:
            raise ValueError(
                f"Invalid scheduled_at timestamp: {scheduled_at}. Must be a positive integer representing milliseconds since epoch."
            )

        # Check if timestamp is in the future
        current_time_ms = int(time.time() * 1000)
        if scheduled_at <= current_time_ms:
            raise ValueError(
                f"scheduled_at must be a future timestamp. Provided: {scheduled_at}, Current: {current_time_ms}"
            )

        # Check if timestamp is not too far in the future (e.g., 1 year)
        if scheduled_at > current_time_ms + self.ONE_YEAR_IN_MS:
            raise ValueError(
                f"scheduled_at is too far in the future (max 1 year). Provided: {scheduled_at}"
            )

        media_urn = None

        # Step 1: Upload image if provided
        if image_path or image_base64:
            # Handle base64 encoded image
            if image_base64:
                if not image_filename:
                    raise ValueError(
                        "image_filename is required when using image_base64"
                    )

                # Validate estimated size before decoding to prevent memory exhaustion
                # Base64 encoded data is roughly 4/3 the size of the original
                estimated_size = len(image_base64) * 0.75
                if estimated_size > self.MAX_IMAGE_SIZE_BYTES:
                    raise ValueError(
                        f"Image base64 data too large (estimated {estimated_size:.0f} bytes). Maximum allowed: {self.MAX_IMAGE_SIZE_BYTES} bytes (10MB)"
                    )

                # Decode base64 to bytes
                try:
                    image_data = base64.b64decode(image_base64)
                except Exception as e:
                    raise ValueError(f"Failed to decode base64 image data: {e}")

                filename = image_filename
                file_size = len(image_data)

            # Handle file path
            elif image_path:
                # Normalize and validate the image path to prevent path traversal
                normalized_path = os.path.normpath(image_path)

                # If path is relative, resolve it relative to current directory
                if not os.path.isabs(normalized_path):
                    normalized_path = os.path.abspath(normalized_path)

                if not os.path.exists(normalized_path):
                    raise FileNotFoundError(f"Image file not found: {image_path}")

                # Get file size and name
                file_size = os.path.getsize(normalized_path)
                filename = os.path.basename(normalized_path)

                # Read the image file
                with open(normalized_path, "rb") as image_file:
                    image_data = image_file.read()

            # Validate file size (10MB limit)
            if file_size > self.MAX_IMAGE_SIZE_BYTES:
                raise ValueError(
                    f"Image file size ({file_size} bytes) exceeds maximum allowed size ({self.MAX_IMAGE_SIZE_BYTES} bytes / 10MB)"
                )

            # Validate file format
            supported_extensions = [".jpg", ".jpeg", ".png", ".gif"]
            file_ext = os.path.splitext(filename)[1].lower()
            if file_ext not in supported_extensions:
                raise ValueError(
                    f"Unsupported image format: {file_ext}. Supported formats: {', '.join(supported_extensions)}"
                )

            # Step 1a: Request upload metadata
            upload_metadata_payload = {
                "mediaUploadType": "IMAGE_SHARING",
                "fileSize": file_size,
                "filename": filename,
            }

            metadata_res = self._post(
                "/voyagerVideoDashMediaUploadMetadata",
                params={"action": "upload"},
                data=json.dumps(upload_metadata_payload),
                headers={"Content-Type": "application/json; charset=UTF-8"},
            )

            metadata_data = metadata_res.json()

            # Extract upload info - LinkedIn returns it in value directly
            upload_info = None
            if "value" in metadata_data:
                upload_info = metadata_data["value"]
            elif "data" in metadata_data and "value" in metadata_data["data"]:
                upload_info = metadata_data["data"]["value"]

            if not upload_info or "singleUploadUrl" not in upload_info:
                raise LinkedInRequestException(
                    metadata_res.status_code,
                    f"No upload URL in response: {metadata_data}",
                )
            media_urn = upload_info["urn"]
            upload_url = upload_info["singleUploadUrl"]

            # Determine content type based on file extension
            if filename.lower().endswith(".png"):
                content_type = "image/png"
            elif filename.lower().endswith(".gif"):
                content_type = "image/gif"
            elif filename.lower().endswith(".jpg") or filename.lower().endswith(
                ".jpeg"
            ):
                content_type = "image/jpeg"
            else:
                content_type = "image/jpeg"  # Default fallback

            # Step 1b: Upload the actual image data to the provided URL
            # Note: Using direct session.put() here because upload_url is an external CDN URL
            # (not a LinkedIn API endpoint), so we can't use self._put() which prepends LinkedIn's base URL
            # However, we still apply rate limiting for consistency
            self.client.rate_limiter.wait()

            upload_response = self.client.session.put(
                upload_url,
                data=image_data,
                headers={
                    "Content-Type": content_type,
                },
            )

            if upload_response.status_code not in [200, 201]:
                raise LinkedInRequestException(
                    upload_response.status_code,
                    f"Image upload failed: {upload_response.text}",
                )

            self.logger.info(f"Image uploaded successfully: {media_urn}")

        # Step 2: Create the scheduled post
        post_data = {
            "allowedCommentersScope": "ALL",
            "intendedShareLifeCycleState": "SCHEDULED",
            "origin": "FEED",
            "visibilityDataUnion": {
                "visibilityType": visibility,
            },
            "commentary": {
                "text": text,
                "attributesV2": [],
            },
            "scheduledAt": scheduled_at,  # Use numeric timestamp in milliseconds
        }

        # Add media if image was uploaded
        if media_urn:
            post_data["media"] = {
                "category": "IMAGE",
                "mediaUrn": media_urn,
                "tapTargets": [],
                "altText": alt_text,
            }

        # Hardcoded queryId for CREATE operation
        # NOTE: This queryId is extracted from LinkedIn's web interface and may need
        # periodic updates if LinkedIn changes their API. The same applies to other
        # queryIds throughout this file (e.g., for list_scheduled_posts, delete_scheduled_post).
        # These were last verified: January 24, 2026
        # This is the queryId used by LinkedIn's web interface for creating posts
        full_query_id = (
            "voyagerContentcreationDashShares.279996efa5064c01775d5aff003d9377"
        )

        create_payload = {
            "variables": {
                "post": post_data,
            },
            "queryId": full_query_id,
            "includeWebMetadata": True,
        }

        create_res = self._post(
            "/graphql",
            params={
                "action": "execute",
                "queryId": full_query_id,
            },
            data=json.dumps(create_payload),
            headers={"Content-Type": "application/json; charset=UTF-8"},
        )

        result = create_res.json()

        # LinkedIn's response can have data at different levels
        response_data = result

        # Navigate to the actual data - can be in value.data or data.data
        if "value" in response_data and "data" in response_data["value"]:
            response_data = response_data["value"]["data"]
        elif "data" in response_data and "data" in response_data["data"]:
            response_data = response_data["data"]["data"]
        elif "data" in response_data:
            response_data = response_data["data"]

        # Look for the share creation response (case-insensitive)
        share_data = None
        if isinstance(response_data, dict):
            for key in response_data:
                if (
                    isinstance(key, str)
                    and "contentcreation" in key.lower()
                    and "shares" in key.lower()
                ):
                    share_data = response_data[key]
                    break

        if share_data and "entity" in share_data:
            entity = share_data.get("entity", {})
            resource_key = share_data.get("resourceKey", "")
            entity_urn = entity.get("entityUrn", resource_key)

            self.logger.info(f"Post created successfully. URN: {entity_urn}")
            return {
                "success": True,
                "postId": entity_urn,
                "message": "Post scheduled successfully",
            }

        # If we got here but have a 2xx response, treat it as success
        if create_res.ok:
            self.logger.info("Post created with 200 status")
            return {
                "success": True,
                "message": "Post created successfully",
                "data": result,
            }

        # Only raise exception for actual failures
        raise LinkedInRequestException(
            create_res.status_code,
            f"Failed to schedule post: {result}",
        )

    def list_scheduled_posts(self, count: int = 10, start: int = 0) -> Dict:
        """
        List scheduled posts.

        :param count: Number of posts to retrieve (default: 10)
        :type count: int, optional
        :param start: Starting offset for pagination (default: 0)
        :type start: int, optional

        :return: Response data with list of scheduled posts
        :rtype: dict
        """
        # Validate count parameter
        if not isinstance(count, int) or count < 0:
            raise ValueError(
                f"Invalid count value: {count}. Must be a non-negative integer."
            )

        # Validate start parameter
        if not isinstance(start, int) or start < 0:
            raise ValueError(
                f"Invalid start value: {start}. Must be a non-negative integer."
            )

        # Hardcoded queryId for listing scheduled posts
        # Extracted from HAR file: January 25, 2026
        full_query_id = (
            "voyagerContentcreationDashSharePreviews.bcae3f9b4dca29d5c589c05485dad181"
        )
        res = self._fetch(
            f"/graphql?variables=(shareLifeCycleState:SCHEDULED,start:{start},count:{count})"
            f"&queryId={full_query_id}"
        )

        result = res.json()

        if "data" not in result:
            raise LinkedInRequestException(
                res.status_code,
                f"Failed to list scheduled posts: {result}",
            )

        # Parse and return simplified data - note: only ONE level of "data", not two!
        response_data = result.get("data", {})
        previews = response_data.get(
            "contentcreationDashSharePreviewsByShareLifeCycleState", {}
        )

        scheduled_posts = []
        elements = previews.get("elements", [])

        for element in elements:
            # Skip if element is None
            if element is None:
                continue

            # Extract share URN from *miniUpdate field
            # Format: urn:li:fsd_miniUpdate:(urn:li:share:7420877854915301376,SHARE_MANAGEMENT)
            mini_update = element.get("*miniUpdate", "")
            share_urn = ""
            if mini_update and "urn:li:share:" in mini_update:
                match = re.search(r"urn:li:share:\d+", mini_update)
                if match:
                    share_urn = match.group(0)
                else:
                    self.logger.warning(
                        f"Could not extract share URN from: {mini_update}"
                    )
            else:
                self.logger.debug(
                    f"*miniUpdate is None or empty for element, will try to match from included section"
                )

            post = {
                "scheduled_at": element.get("scheduledAt"),
                "contextual_description": element.get("contextualDescription", {}).get(
                    "text"
                ),
                "share_urn": share_urn,
                "error_message": element.get("errorMessage"),
                "_mini_update": mini_update,  # Store for matching with included
            }
            scheduled_posts.append(post)

        # Enrich posts with details from included section
        included_items = result.get("included", [])
        for i, post in enumerate(scheduled_posts):
            # Determine the miniUpdate URN from elements or the temporary field
            mini_update_urn = None
            if i < len(elements):
                mini_update_urn = elements[i].get("*miniUpdate")
            if not mini_update_urn:
                mini_update_urn = post.get("_mini_update")

            if not mini_update_urn:
                # Clean up temporary field if present and move on
                if "_mini_update" in post:
                    del post["_mini_update"]
                continue

            # Look for matching item in included
            for item in included_items:
                if item.get("entityUrn") == mini_update_urn:
                    # Try to extract share URN if we don't have it yet
                    if not post.get("share_urn"):
                        entity_urn = item.get("entityUrn", "")
                        if "urn:li:share:" in entity_urn:
                            match = re.search(r"urn:li:share:\d+", entity_urn)
                            if match:
                                post["share_urn"] = match.group(0)
                                self.logger.debug(
                                    f"Extracted share URN from included: {post['share_urn']}"
                                )

                    # Extract commentary text and image info
                    commentary = item.get("commentary", {})
                    if commentary:
                        commentary_text = commentary.get("commentaryText", {}).get(
                            "text"
                        )
                        if commentary_text:
                            post["text"] = commentary_text

                        # Check if there's an image
                        image = commentary.get("image")
                        post["has_image"] = bool(image)
                    break

            # Clean up temporary field
            if "_mini_update" in post:
                del post["_mini_update"]

        return {
            "posts": scheduled_posts,
            "paging": previews.get("paging", {}),
            "total": previews.get("paging", {}).get("total", 0),
        }

    def delete_scheduled_post(self, share_urn: str) -> Dict:
        """
        Delete a scheduled post.

        :param share_urn: The share URN of the scheduled post to delete (e.g., 'urn:li:share:1234567890')
        :type share_urn: str

        :return: Response data confirming deletion
        :rtype: dict
        """
        # Ensure the URN has the correct format
        if not share_urn.startswith("urn:li:share:"):
            # Try to extract the share ID if a different format was provided
            if "urn:li:share:" in share_urn:
                # Extract from formats like "(urn:li:share:123,SHARE_MANAGEMENT)"
                match = re.search(r"urn:li:share:\d+", share_urn)
                if match:
                    share_urn = match.group(0)
                else:
                    raise ValueError(
                        f"Invalid share URN format: {share_urn}. Expected format: 'urn:li:share:1234567890'"
                    )
            else:
                raise ValueError(
                    f"Invalid share URN format: {share_urn}. Expected format: 'urn:li:share:1234567890'"
                )

        # Hardcoded queryId for DELETE operation (different from CREATE)
        # This is the queryId used by LinkedIn's web interface for deleting scheduled posts
        # Extracted from HAR file: delete_scheduled_post.har
        full_query_id = (
            "voyagerContentcreationDashShares.b7155044c276d51764fc9981037204b3"
        )

        # Construct the GraphQL delete payload (flat structure - matches HAR file)
        delete_payload = {
            "variables": {
                "resourceKey": share_urn,
                "shareLifecycleState": "SCHEDULED",
            },
            "queryId": full_query_id,
            "includeWebMetadata": True,
        }

        delete_res = self._post(
            "/graphql",
            params={
                "action": "execute",
                "queryId": full_query_id,
            },
            data=json.dumps(delete_payload),
            headers={"Content-Type": "application/json; charset=UTF-8"},
        )

        result = delete_res.json()

        # Check for successful deletion
        # Response structure: {"value": {"data": {"deleteContentcreationDashShares": {...}}}}
        if "value" in result and "data" in result["value"]:
            delete_data = result["value"]["data"].get(
                "deleteContentcreationDashShares", {}
            )
            if delete_data.get("resourceKey") == share_urn:
                self.logger.info(f"Successfully deleted scheduled post: {share_urn}")
                return {
                    "success": True,
                    "share_urn": share_urn,
                    "message": "Scheduled post deleted successfully",
                }

        # Check for errors
        if "value" in result and "errors" in result["value"]:
            error_msg = result["value"]["errors"]
            raise LinkedInRequestException(
                delete_res.status_code,
                f"Failed to delete scheduled post: {error_msg}",
            )

        raise LinkedInRequestException(
            delete_res.status_code,
            f"Failed to delete scheduled post: {result}",
        )

    def send_connection_request(
        self, profile_public_id: Optional[str] = None, message: Optional[str] = None, urn_id: Optional[str] = None
    ) -> Dict:
        """
        Send a connection request to a LinkedIn user.

        :param profile_public_id: The public profile ID (username) of the person to connect with
        :type profile_public_id: str, optional
        :param message: Optional personalized message to include with the connection request
        :type message: str, optional
        :param urn_id: The URN ID of the person (skips profile fetch if provided)
        :type urn_id: str, optional

        :return: Response data confirming the connection request was sent
        :rtype: dict
        """
        if urn_id:
            # Use URN directly — normalize to fsd_profile format
            profile_urn = self._normalize_urn(urn_id)
        elif profile_public_id:
            # Fetch profile to extract URN
            try:
                profile = self.get_profile(public_id=profile_public_id)
            except Exception as e:
                self.logger.error(
                    f"Failed to fetch profile for {profile_public_id}: {e}", exc_info=True
                )
                raise LinkedInRequestException(
                    500,
                    f"Failed to fetch profile for {profile_public_id}: {str(e)}",
                )

            profile_urn = profile.get("profile_urn") or profile.get("member_urn", "")
            if not profile_urn:
                raise LinkedInRequestException(
                    404,
                    f"Could not extract profile URN for {profile_public_id}.",
                )
        else:
            raise LinkedInRequestException(
                400,
                "Either profile_public_id or urn_id must be provided.",
            )

        # Construct the connection request payload for Voyager API
        payload = {"invitee": {"inviteeUnion": {"memberProfile": profile_urn}}}

        # Add message if provided (maximum 300 characters, as in add_connection)
        if message:
            if len(message) > 300:
                raise LinkedInRequestException(
                    400,
                    "Custom message must be 300 characters or fewer.",
                )
            payload["customMessage"] = message

        # Send the connection request using Voyager API
        res = self._post(
            "/voyagerRelationshipsDashMemberRelationships",
            params={
                "action": "verifyQuotaAndCreateV2",
                "decorationId": "com.linkedin.voyager.dash.deco.relationships.InvitationCreationResultWithInvitee-2",
            },
            data=json.dumps(payload),
            headers={"Content-Type": "application/json; charset=UTF-8"},
        )

        result = res.json()

        # Check for successful connection request
        if res.ok:
            # Extract invitation URN from response
            invitation_urn = (
                result.get("data", {}).get("value", {}).get("invitationUrn", "")
            )
            invitation_id = get_id_from_urn(invitation_urn) if invitation_urn else None

            identifier = profile_public_id or urn_id
            self.logger.info(
                f"Successfully sent connection request to {identifier}"
            )
            return {
                "success": True,
                "profile_public_id": profile_public_id,
                "profile_urn": profile_urn,
                "invitation_urn": invitation_urn,
                "invitation_id": invitation_id,
                "message": f"Connection request sent successfully",
            }

        # Check for errors
        raise LinkedInRequestException(
            res.status_code,
            f"Failed to send connection request: {result}",
        )

    def withdraw_connection_request(self, invitation_id: str) -> Dict:
        """
        Withdraw a pending connection request on LinkedIn.

        :param invitation_id: The invitation ID or URN to withdraw
                             Can be in formats:
                             - 'urn:li:fsd_invitation:1234567890'
                             - '1234567890'
        :type invitation_id: str

        :return: Response data confirming the withdrawal
        :rtype: dict
        """
        # Normalize the invitation ID to URN format
        if not invitation_id.startswith("urn:li:fsd_invitation:"):
            invitation_urn = f"urn:li:fsd_invitation:{invitation_id}"
        else:
            invitation_urn = invitation_id

        # URL encode the URN for the API endpoint
        encoded_urn = quote(invitation_urn, safe="")

        # Construct the withdraw payload
        payload = {"invitationType": "CONNECTION"}

        # Send the withdraw request
        res = self._post(
            f"/voyagerRelationshipsDashInvitations/{encoded_urn}",
            params={"action": "withdraw"},
            data=json.dumps(payload),
            headers={"Content-Type": "application/json; charset=UTF-8"},
        )

        # Check for successful withdrawal
        if res.ok:
            self.logger.info(
                f"Successfully withdrew connection request: {invitation_urn}"
            )
            return {
                "success": True,
                "invitation_urn": invitation_urn,
                "invitation_id": get_id_from_urn(invitation_urn),
                "message": "Connection request withdrawn successfully",
            }

        # Check for errors
        result = res.json() if res.text else {}
        raise LinkedInRequestException(
            res.status_code,
            f"Failed to withdraw connection request: {result}",
        )


# Force LF
