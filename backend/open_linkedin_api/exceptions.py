"""
Custom exception classes for LinkedIn API.

This module provides specific exception types for better error handling
and follows best practices for exception hierarchies.
"""


class LinkedInAPIException(Exception):
    """Base exception class for all LinkedIn API errors."""


class LinkedInRequestException(LinkedInAPIException):
    """Exception raised when a LinkedIn API request fails."""

    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(f"Request failed with status code {status_code}: {message}")


class ChallengeException(LinkedInAPIException):
    """Exception raised when LinkedIn presents a challenge/captcha."""


class UnauthorizedException(LinkedInAPIException):
    """Exception raised when authentication fails or session is invalid."""


class InvalidURNException(LinkedInAPIException):
    """
    Exception raised when an invalid URN format is encountered.

    Note: This exception is currently defined for future use in URN validation.
    It will be used when implementing validation in functions like get_id_from_urn()
    and get_urn_from_raw_update() to provide clearer error messages when URN
    parsing fails.
    """

    def __init__(self, urn: str, message: str = None):
        self.urn = urn
        default_message = f"Invalid URN format: {urn}"
        super().__init__(message or default_message)
