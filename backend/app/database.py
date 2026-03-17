import re
import uuid
from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy import DateTime, MetaData, func, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.APP_ENV == "development",
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=1800,
    connect_args={"prepared_statement_cache_size": 0},
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Naming convention for consistent constraint names (important for Alembic)
convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=convention)

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
    )


# ---------------------------------------------------------------------------
# Schema validation — prevent SQL injection via schema names
# ---------------------------------------------------------------------------

_SCHEMA_RE = re.compile(r"^[a-z][a-z0-9_]{0,62}$")


def validate_schema_name(schema: str) -> str:
    """Validate schema name is safe for use in SET search_path."""
    if not _SCHEMA_RE.match(schema):
        raise ValueError(f"Invalid schema name: {schema!r}")
    return schema


# ---------------------------------------------------------------------------
# Database session providers
# ---------------------------------------------------------------------------

async def get_db(request: Request):
    """Database session — schema-aware via request.state.company_schema.

    TenantMiddleware sets request.state.company_schema from JWT cookie.
    FastAPI auto-injects Request. Never call this without Request context —
    background tasks must use async_session_factory() directly.
    """
    schema = getattr(request.state, "company_schema", "public")

    async with async_session_factory() as session:
        if schema != "public":
            await session.execute(text(f"SET search_path TO {validate_schema_name(schema)}, public"))
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_tenant_session(company_schema: str):
    """Create a session scoped to a tenant schema.

    Sets search_path so unqualified table names resolve to the tenant schema,
    while public.* tables (users, roles, companies) remain accessible.
    """
    schema = validate_schema_name(company_schema)
    async with async_session_factory() as session:
        await session.execute(text(f"SET search_path TO {schema}, public"))
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ---------------------------------------------------------------------------
# Schema provisioning helpers
# ---------------------------------------------------------------------------

async def create_schema(schema_name: str) -> None:
    """Create a new PostgreSQL schema (for a new company)."""
    schema = validate_schema_name(schema_name)
    async with engine.begin() as conn:
        await conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))


async def create_tenant_tables(schema_name: str) -> None:
    """Create all tenant tables in a specific schema.

    Uses Base.metadata.create_all but only creates tables that do NOT have
    an explicit schema (i.e., tenant tables, not public.users/roles/companies).
    """
    schema = validate_schema_name(schema_name)

    def _create_tables(sync_conn):
        # Set search_path so unqualified CREATE TABLE goes to tenant schema
        sync_conn.execute(text(f"SET search_path TO {schema}, public"))
        # Filter: only create tables without explicit schema (tenant tables)
        tenant_tables = [
            t for t in Base.metadata.sorted_tables
            if t.schema is None
        ]
        # checkfirst=False because search_path fallthrough to public would
        # find existing tables and skip creation in the tenant schema
        Base.metadata.create_all(sync_conn, tables=tenant_tables, checkfirst=False)

    async with engine.begin() as conn:
        await conn.run_sync(_create_tables)
