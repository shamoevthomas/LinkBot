from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# Auth
class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

# User
class UserResponse(BaseModel):
    id: int
    username: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    profile_picture_path: Optional[str] = None
    job_role: Optional[str] = None
    reason_for_using: Optional[str] = None
    linkedin_profile_url: Optional[str] = None
    cookies_valid: bool
    has_gemini_key: bool = False
    onboarding_completed: bool

class CookiesUpdate(BaseModel):
    li_at: str
    jsessionid: str

class CookiesStatus(BaseModel):
    valid: bool

# CRM
class CRMCreate(BaseModel):
    name: str
    description: Optional[str] = None

class CRMUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class CRMResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    contact_count: int = 0
    created_at: datetime
    updated_at: datetime

class ContactResponse(BaseModel):
    id: int
    crm_id: int
    urn_id: str
    public_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    headline: Optional[str] = None
    location: Optional[str] = None
    profile_picture_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    connection_status: str
    last_interaction_at: Optional[datetime] = None
    added_at: datetime
    notes: Optional[str] = None
    tags: List["TagResponse"] = []

class ContactAdd(BaseModel):
    urn_id: Optional[str] = None
    linkedin_url: Optional[str] = None

class BulkDelete(BaseModel):
    contact_ids: List[int]

class BulkMove(BaseModel):
    contact_ids: List[int]
    target_crm_id: int

class BulkUpdateStatus(BaseModel):
    contact_ids: List[int]
    connection_status: str

class ContactNotesUpdate(BaseModel):
    notes: str

# Campaigns
class CampaignCreate(BaseModel):
    name: str
    type: str  # search, dm, connection
    crm_id: Optional[int] = None
    keywords: Optional[str] = None
    message_template: Optional[str] = None
    use_ai: bool = False
    total_target: Optional[int] = None
    max_per_day: Optional[int] = None
    spread_over_days: Optional[int] = None
    auto_connect: bool = False
    search_regions: Optional[List[str]] = None  # geo URN IDs for LinkedIn search

class CampaignMessageSchema(BaseModel):
    sequence: int
    message_template: str
    fallback_template: Optional[str] = None
    delay_days: int = 0

class DMCampaignCreate(BaseModel):
    name: str
    crm_id: int
    context_text: Optional[str] = None
    ai_prompt: Optional[str] = None
    use_ai: bool = False
    full_personalize: bool = False  # AI writes entire message per contact
    messages: List[CampaignMessageSchema]  # main + follow-ups (or empty for full_personalize)
    total_target: Optional[int] = None
    max_per_day: Optional[int] = None
    spread_over_days: Optional[int] = None
    delay_minutes: Optional[int] = 2  # minutes between each action
    is_connection_dm: bool = False  # connection + DM combo campaign
    is_search_connection_dm: bool = False  # search + connection + DM pipeline
    keywords: Optional[str] = None  # search keywords (for connection_dm / search_connection_dm)
    search_regions: Optional[List[str]] = None  # geo URN IDs for LinkedIn search
    dm_delay_hours: int = 0  # hours to wait after connection accepted before sending DM
    fallback_message: Optional[str] = None  # sent when AI fails after all retries

class GenerateCampaignMessagesRequest(BaseModel):
    ai_prompt: str
    context_text: Optional[str] = None
    followup_count: int = 0  # 0-7
    followup_delays: List[int] = []  # days for each follow-up

class PreviewFullPersonalizationRequest(BaseModel):
    crm_id: int
    ai_prompt: str = ""
    context_text: str = ""
    followup_count: int = 0
    followup_delays: List[int] = []

class CampaignResponse(BaseModel):
    id: int
    name: str
    type: str
    status: str
    crm_id: Optional[int] = None
    keywords: Optional[str] = None
    message_template: Optional[str] = None
    use_ai: bool = False
    full_personalize: bool = False
    context_text: Optional[str] = None
    ai_prompt: Optional[str] = None
    total_target: Optional[int] = None
    total_processed: int
    total_succeeded: int
    total_failed: int
    total_skipped: int
    total_sent: int = 0
    total_relance: int = 0
    max_per_day: Optional[int] = None
    spread_over_days: Optional[int] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    error_message: Optional[str] = None
    fallback_message: Optional[str] = None
    reply_rate: Optional[float] = None
    connection_rate: Optional[float] = None
    next_action_at: Optional[datetime] = None
    paused_reason: Optional[str] = None

class CampaignActionResponse(BaseModel):
    id: int
    campaign_id: int
    contact_id: Optional[int] = None
    action_type: str
    status: str
    error_message: Optional[str] = None
    created_at: datetime
    # Contact info (joined)
    contact_first_name: Optional[str] = None
    contact_last_name: Optional[str] = None
    contact_headline: Optional[str] = None
    contact_location: Optional[str] = None
    contact_profile_picture_url: Optional[str] = None
    contact_linkedin_url: Optional[str] = None
    contact_connection_status: Optional[str] = None

class CampaignContactResponse(BaseModel):
    id: int
    campaign_id: int
    contact_id: Optional[int] = None
    status: str
    last_sequence_sent: int
    main_sent_at: Optional[datetime] = None
    last_sent_at: Optional[datetime] = None
    replied_at: Optional[datetime] = None
    # Contact info
    contact_first_name: Optional[str] = None
    contact_last_name: Optional[str] = None
    contact_headline: Optional[str] = None
    contact_profile_picture_url: Optional[str] = None
    contact_linkedin_url: Optional[str] = None

# Config
class SettingsUpdate(BaseModel):
    max_connections_per_day: Optional[int] = None
    max_dms_per_day: Optional[int] = None
    default_spread_days: Optional[int] = None
    delay_between_actions: Optional[int] = None  # minutes
    schedule_enabled: Optional[bool] = None
    schedule_start_hour: Optional[str] = None    # "HH:MM"
    schedule_end_hour: Optional[str] = None      # "HH:MM"
    schedule_timezone: Optional[str] = None      # e.g. "Europe/Paris"
    warmup_enabled: Optional[bool] = None
    warmup_start_limit: Optional[int] = None
    warmup_target_limit: Optional[int] = None
    warmup_days: Optional[int] = None
    action_interval_min: Optional[int] = None  # minutes
    action_interval_max: Optional[int] = None  # minutes

class SendMessageRequest(BaseModel):
    message: str

class GenerateAIMessageRequest(BaseModel):
    instructions: str

class BlacklistCreate(BaseModel):
    urn_id: str
    public_id: Optional[str] = None
    name: Optional[str] = None
    reason: Optional[str] = None

class BlacklistResponse(BaseModel):
    id: int
    urn_id: str
    public_id: Optional[str] = None
    name: Optional[str] = None
    reason: Optional[str] = None
    created_at: datetime

class TagCreate(BaseModel):
    name: str
    color: str = "#0A66C2"

class TagResponse(BaseModel):
    id: int
    name: str
    color: str

class BulkTagAssign(BaseModel):
    contact_ids: List[int]
    tag_id: int

# Lead Magnets
class LeadMagnetCreate(BaseModel):
    name: str
    post_url: str
    keyword: str
    check_interval_seconds: int = 300
    action_interval_seconds: int = 60
    dm_template: str
    reply_template_connected: Optional[str] = None
    reply_template_not_connected: Optional[str] = None
    connection_message: Optional[str] = None

class LeadMagnetUpdate(BaseModel):
    name: Optional[str] = None
    post_url: Optional[str] = None
    keyword: Optional[str] = None
    check_interval_seconds: Optional[int] = None
    action_interval_seconds: Optional[int] = None
    dm_template: Optional[str] = None
    reply_template_connected: Optional[str] = None
    reply_template_not_connected: Optional[str] = None
    connection_message: Optional[str] = None

class LeadMagnetResponse(BaseModel):
    id: int
    name: str
    status: str
    post_url: str
    keyword: str
    check_interval_seconds: int
    action_interval_seconds: int
    dm_template: str
    reply_template_connected: Optional[str] = None
    reply_template_not_connected: Optional[str] = None
    connection_message: Optional[str] = None
    total_processed: int = 0
    total_dm_sent: int = 0
    total_connections_sent: int = 0
    total_replies_sent: int = 0
    total_likes: int = 0
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    created_at: datetime

class LeadMagnetContactResponse(BaseModel):
    id: int
    lead_magnet_id: int
    commenter_urn_id: str
    commenter_name: Optional[str] = None
    comment_text: Optional[str] = None
    status: str
    is_connected: bool
    liked_comment: bool
    replied_to_comment: bool
    dm_sent: bool
    connection_sent_at: Optional[datetime] = None
    connection_accepted_at: Optional[datetime] = None
    dm_sent_at: Optional[datetime] = None
    created_at: datetime

class ImportConnectionsRequest(BaseModel):
    crm_id: int
