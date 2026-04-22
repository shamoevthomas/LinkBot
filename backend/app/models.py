from datetime import datetime, date
from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, Date, ForeignKey, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    __tablename__ = "user"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    first_name = Column(String)
    last_name = Column(String)
    profile_picture_path = Column(String)
    job_role = Column(String)
    reason_for_using = Column(String)
    linkedin_profile_url = Column(String)
    li_at_cookie = Column(Text)
    jsessionid_cookie = Column(Text)
    cookies_valid = Column(Boolean, default=True)
    gemini_api_key = Column(Text, nullable=True)
    onboarding_completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CRM(Base):
    __tablename__ = "crm"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", backref="crms")
    contacts = relationship("Contact", back_populates="crm", cascade="all, delete-orphan")


class Contact(Base):
    __tablename__ = "contact"
    __table_args__ = (
        UniqueConstraint("crm_id", "urn_id", name="uq_crm_urn"),
        Index("ix_contact_crm_id", "crm_id"),
        Index("ix_contact_urn_id", "urn_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    crm_id = Column(Integer, ForeignKey("crm.id", ondelete="CASCADE"), nullable=False)
    urn_id = Column(String, nullable=False)
    public_id = Column(String)
    first_name = Column(String)
    last_name = Column(String)
    headline = Column(Text)
    location = Column(String)
    profile_picture_url = Column(Text)
    linkedin_url = Column(Text)
    connection_status = Column(String, default="unknown")
    invitation_id = Column(String)
    last_interaction_at = Column(DateTime)
    added_at = Column(DateTime, default=datetime.utcnow)
    extra_data = Column(Text)
    notes = Column(Text)
    deleted_at = Column(DateTime, nullable=True)

    crm = relationship("CRM", back_populates="contacts")
    tags = relationship("Tag", secondary="contact_tag", backref="contacts")


class Campaign(Base):
    __tablename__ = "campaign"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # search, dm, connection, export
    status = Column(String, default="pending")  # pending, running, paused, completed, failed, cancelled
    crm_id = Column(Integer, ForeignKey("crm.id"))
    source_crm_id = Column(Integer, ForeignKey("crm.id"), nullable=True)  # export: source CRM to copy from
    keywords = Column(Text)
    message_template = Column(Text)
    use_ai = Column(Boolean, default=False)
    total_target = Column(Integer)
    total_processed = Column(Integer, default=0)
    total_succeeded = Column(Integer, default=0)
    total_failed = Column(Integer, default=0)
    total_skipped = Column(Integer, default=0)
    max_per_day = Column(Integer)
    spread_over_days = Column(Integer)
    actions_today = Column(Integer, default=0)
    last_action_date = Column(Date)
    search_offset = Column(Integer, default=0)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    error_message = Column(Text)

    context_text = Column(Text)
    ai_prompt = Column(Text)
    context_pdf_path = Column(String)
    full_personalize = Column(Boolean, default=False)
    search_regions = Column(Text)  # comma-separated geo URN IDs for LinkedIn search
    dm_delay_hours = Column(Integer, default=0)
    fallback_message = Column(Text)

    user = relationship("User", backref="campaigns")
    actions = relationship("CampaignAction", back_populates="campaign", cascade="all, delete-orphan")
    messages = relationship("CampaignMessage", back_populates="campaign", cascade="all, delete-orphan", order_by="CampaignMessage.sequence")
    campaign_contacts = relationship("CampaignContact", back_populates="campaign", cascade="all, delete-orphan")


class CampaignAction(Base):
    __tablename__ = "campaign_action"

    id = Column(Integer, primary_key=True, autoincrement=True)
    campaign_id = Column(Integer, ForeignKey("campaign.id", ondelete="CASCADE"))
    lead_magnet_id = Column(Integer, ForeignKey("lead_magnet.id", ondelete="CASCADE"))
    contact_id = Column(Integer, ForeignKey("contact.id", ondelete="SET NULL"))
    action_type = Column(String, nullable=False)
    status = Column(String, nullable=False)  # success, failed, skipped
    error_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    campaign = relationship("Campaign", back_populates="actions")


class CampaignMessage(Base):
    __tablename__ = "campaign_message"

    id = Column(Integer, primary_key=True, autoincrement=True)
    campaign_id = Column(Integer, ForeignKey("campaign.id", ondelete="CASCADE"), nullable=False)
    sequence = Column(Integer, nullable=False)  # 0=main, 1-7=follow-ups
    message_template = Column(Text, nullable=False)
    fallback_template = Column(Text)  # fallback if AI fails
    delay_days = Column(Integer, default=0)  # days after previous message

    campaign = relationship("Campaign", back_populates="messages")


class CampaignContact(Base):
    """Tracks per-contact state within a DM campaign (follow-up cycle)."""
    __tablename__ = "campaign_contact"
    __table_args__ = (
        UniqueConstraint("campaign_id", "contact_id", name="uq_campaign_contact"),
        Index("ix_cc_campaign_status", "campaign_id", "status"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    campaign_id = Column(Integer, ForeignKey("campaign.id", ondelete="CASCADE"), nullable=False)
    contact_id = Column(Integer, ForeignKey("contact.id", ondelete="SET NULL"))
    # pending, envoye, relance_1..7, reussi, perdu
    status = Column(String, default="pending")
    last_sequence_sent = Column(Integer, default=-1)  # -1=none, 0=main, 1-7=followups
    main_sent_at = Column(DateTime)
    last_sent_at = Column(DateTime)
    replied_at = Column(DateTime)
    last_checked_at = Column(DateTime)
    connection_accepted_at = Column(DateTime)

    campaign = relationship("Campaign", back_populates="campaign_contacts")
    contact = relationship("Contact")


class ImportJob(Base):
    __tablename__ = "import_job"

    id = Column(Integer, primary_key=True, autoincrement=True)
    crm_id = Column(Integer, ForeignKey("crm.id"))
    status = Column(String, default="running")  # running, completed, failed
    total_found = Column(Integer, default=0)
    total_created = Column(Integer, default=0)
    total_skipped = Column(Integer, default=0)
    skipped_details = Column(Text)  # JSON array of {name, reason}
    error_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)


class AppSettings(Base):
    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Blacklist(Base):
    __tablename__ = "blacklist"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=True)
    urn_id = Column(String, nullable=False)
    public_id = Column(String)
    name = Column(String)
    reason = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class Tag(Base):
    __tablename__ = "tag"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=True)
    name = Column(String, nullable=False)
    color = Column(String, default="#0A66C2")
    created_at = Column(DateTime, default=datetime.utcnow)


class ContactTag(Base):
    __tablename__ = "contact_tag"
    __table_args__ = (UniqueConstraint("contact_id", "tag_id", name="uq_contact_tag"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    contact_id = Column(Integer, ForeignKey("contact.id", ondelete="CASCADE"), nullable=False)
    tag_id = Column(Integer, ForeignKey("tag.id", ondelete="CASCADE"), nullable=False)


class LeadMagnet(Base):
    __tablename__ = "lead_magnet"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=False)
    name = Column(String, nullable=False)
    status = Column(String, default="pending")  # pending, running, paused, cancelled
    post_url = Column(Text, nullable=False)
    post_activity_urn = Column(String, nullable=False)
    keyword = Column(String, nullable=False)
    check_interval_seconds = Column(Integer, default=300)
    action_interval_seconds = Column(Integer, default=60)
    dm_template = Column(Text, nullable=False)
    reply_template_connected = Column(Text)
    reply_template_not_connected = Column(Text)
    connection_message = Column(Text)
    processed_comment_ids = Column(Text, default="[]")  # JSON array
    total_processed = Column(Integer, default=0)
    total_dm_sent = Column(Integer, default=0)
    total_connections_sent = Column(Integer, default=0)
    total_replies_sent = Column(Integer, default=0)
    total_likes = Column(Integer, default=0)
    error_message = Column(Text)
    started_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", backref="lead_magnets")
    contacts = relationship("LeadMagnetContact", back_populates="lead_magnet", cascade="all, delete-orphan")


class LeadMagnetContact(Base):
    __tablename__ = "lead_magnet_contact"
    __table_args__ = (
        UniqueConstraint("lead_magnet_id", "commenter_urn_id", name="uq_lm_commenter"),
        Index("ix_lmc_status", "lead_magnet_id", "status"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    lead_magnet_id = Column(Integer, ForeignKey("lead_magnet.id", ondelete="CASCADE"), nullable=False)
    commenter_urn_id = Column(String, nullable=False)
    commenter_name = Column(String)
    comment_urn = Column(String)
    comment_text = Column(Text)
    status = Column(String, default="pending_actions")  # pending_actions, connection_sent, dm_pending, completed, failed
    is_connected = Column(Boolean, default=False)
    liked_comment = Column(Boolean, default=False)
    replied_to_comment = Column(Boolean, default=False)
    dm_sent = Column(Boolean, default=False)
    connection_sent_at = Column(DateTime)
    connection_accepted_at = Column(DateTime)
    dm_sent_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

    lead_magnet = relationship("LeadMagnet", back_populates="contacts")


class Notification(Base):
    __tablename__ = "notification"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    type = Column(String, nullable=False)  # campaign_completed, reply_received, cookies_expired
    title = Column(String, nullable=False)
    message = Column(Text)
    read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", backref="notifications")
