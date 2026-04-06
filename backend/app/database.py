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
    from app.models import User, CRM, Contact, Campaign, CampaignAction, AppSettings  # noqa: F401
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

        # Drop old unique constraints that should now be per-user
        if is_pg:
            # These constraint names are PostgreSQL auto-generated defaults
            for constraint in [
                ("crm", "crm_name_key"),
                ("tag", "tag_name_key"),
                ("blacklist", "blacklist_urn_id_key"),
            ]:
                table, name = constraint
                try:
                    conn.execute(text(f'ALTER TABLE "{table}" DROP CONSTRAINT IF EXISTS "{name}"'))
                    print(f"[MIGRATION] Dropped constraint {name} from {table}", flush=True)
                except Exception:
                    pass
