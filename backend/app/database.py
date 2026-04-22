from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import DATABASE_URL

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def init_db():
    from app.models import User, CRM, Contact, Campaign, CampaignAction, AppSettings, Notification, LeadMagnet, LeadMagnetContact  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _run_migrations()


def _run_migrations():
    """Add user_id columns and drop old unique constraints for multi-user support (idempotent)."""
    from sqlalchemy import text, inspect as sa_inspect

    inspector = sa_inspect(engine)
    is_pg = DATABASE_URL.startswith("postgresql")

    with engine.begin() as conn:
        for table in ("crm", "campaign", "tag", "blacklist"):
            columns = [c["name"] for c in inspector.get_columns(table)]
            if "user_id" not in columns:
                conn.execute(text(
                    f'ALTER TABLE "{table}" ADD COLUMN user_id INTEGER REFERENCES "user"(id)'
                ))
                conn.execute(text(
                    f'UPDATE "{table}" SET user_id = 1 WHERE user_id IS NULL'
                ))
                print(f"[MIGRATION] Added user_id to {table}", flush=True)

        # Add search_regions column to campaign
        campaign_columns = [c["name"] for c in inspector.get_columns("campaign")]
        if "search_regions" not in campaign_columns:
            conn.execute(text('ALTER TABLE "campaign" ADD COLUMN search_regions TEXT'))
            print("[MIGRATION] Added search_regions to campaign", flush=True)

        # Add fallback_message column to campaign
        if "fallback_message" not in campaign_columns:
            conn.execute(text('ALTER TABLE "campaign" ADD COLUMN fallback_message TEXT'))
            print("[MIGRATION] Added fallback_message to campaign", flush=True)

        # Add source_crm_id column to campaign (for export campaigns)
        if "source_crm_id" not in campaign_columns:
            conn.execute(text('ALTER TABLE "campaign" ADD COLUMN source_crm_id INTEGER REFERENCES "crm"(id)'))
            print("[MIGRATION] Added source_crm_id to campaign", flush=True)

        # Add notes and deleted_at columns to contact
        contact_columns = [c["name"] for c in inspector.get_columns("contact")]
        if "notes" not in contact_columns:
            conn.execute(text('ALTER TABLE "contact" ADD COLUMN notes TEXT'))
            print("[MIGRATION] Added notes to contact", flush=True)
        if "deleted_at" not in contact_columns:
            conn.execute(text('ALTER TABLE "contact" ADD COLUMN deleted_at TIMESTAMP'))
            print("[MIGRATION] Added deleted_at to contact", flush=True)

        # Cleanup old soft-deleted contacts (> 5 minutes)
        conn.execute(text(
            "DELETE FROM contact WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '5 minutes'"
        )) if is_pg else None

        # Add fallback_template column to campaign_message
        cm_columns = [c["name"] for c in inspector.get_columns("campaign_message")]
        if "fallback_template" not in cm_columns:
            conn.execute(text('ALTER TABLE "campaign_message" ADD COLUMN fallback_template TEXT'))
            print("[MIGRATION] Added fallback_template to campaign_message", flush=True)

        # Add lead_magnet_id column to campaign_action for lead magnet action logging
        action_columns = [c["name"] for c in inspector.get_columns("campaign_action")]
        if "lead_magnet_id" not in action_columns:
            conn.execute(text('ALTER TABLE "campaign_action" ADD COLUMN lead_magnet_id INTEGER'))
            print("[MIGRATION] Added lead_magnet_id to campaign_action", flush=True)

        # Make campaign_action.campaign_id nullable (lead magnet actions don't have a campaign)
        if is_pg:
            try:
                conn.execute(text('ALTER TABLE "campaign_action" ALTER COLUMN campaign_id DROP NOT NULL'))
                print("[MIGRATION] Made campaign_action.campaign_id nullable", flush=True)
            except Exception:
                pass  # Already nullable or constraint doesn't exist

    # Performance indexes — run in separate connections to avoid deadlock on concurrent startup
    for idx_sql in [
        'CREATE INDEX IF NOT EXISTS ix_cc_campaign_status ON campaign_contact(campaign_id, status)',
        'CREATE INDEX IF NOT EXISTS ix_campaign_user_status ON campaign(user_id, status)',
        'CREATE INDEX IF NOT EXISTS ix_action_campaign_created ON campaign_action(campaign_id, created_at)',
    ]:
        try:
            with engine.begin() as conn2:
                conn2.execute(text(idx_sql))
        except Exception:
            pass  # Index likely already exists or concurrent process is creating it

    # Drop old unique constraints that should now be per-user
    if is_pg:
        try:
            with engine.begin() as conn3:
                for table, name in [
                    ("crm", "crm_name_key"),
                    ("tag", "tag_name_key"),
                    ("blacklist", "blacklist_urn_id_key"),
                ]:
                    try:
                        conn3.execute(text(f'ALTER TABLE "{table}" DROP CONSTRAINT IF EXISTS "{name}"'))
                    except Exception:
                        pass
        except Exception:
            pass
