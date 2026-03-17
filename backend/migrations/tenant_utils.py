"""Reusable utilities for multi-tenant Alembic migrations.

Usage in any migration:

    from migrations.tenant_utils import get_tenant_schemas

    def upgrade():
        conn = op.get_bind()
        for schema in get_tenant_schemas(conn):
            conn.execute(text(f'ALTER TABLE {schema}.rolls ADD COLUMN new_col UUID'))
"""

from sqlalchemy import text


def get_tenant_schemas(conn):
    """Get all co_* tenant schema names from the database."""
    rows = conn.execute(text(
        "SELECT schema_name FROM information_schema.schemata "
        "WHERE schema_name LIKE 'co_%' ORDER BY schema_name"
    ))
    return [row[0] for row in rows]


def col_exists(conn, schema, table, column):
    """Check if a column exists in a specific schema.table."""
    r = conn.execute(text(
        f"SELECT 1 FROM information_schema.columns "
        f"WHERE table_schema='{schema}' AND table_name='{table}' AND column_name='{column}'"
    ))
    return r.fetchone() is not None


def constraint_exists(conn, schema, name):
    """Check if a constraint exists in a specific schema."""
    r = conn.execute(text(
        f"SELECT 1 FROM information_schema.table_constraints "
        f"WHERE constraint_schema='{schema}' AND constraint_name='{name}'"
    ))
    return r.fetchone() is not None


def index_exists(conn, schema, name):
    """Check if an index exists in a specific schema."""
    r = conn.execute(text(
        f"SELECT 1 FROM pg_indexes "
        f"WHERE schemaname='{schema}' AND indexname='{name}'"
    ))
    return r.fetchone() is not None
