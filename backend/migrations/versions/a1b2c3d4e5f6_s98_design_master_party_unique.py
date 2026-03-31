"""S98: Design master table + party name unique constraints.

Revision ID: a1b2c3d4e5f6
Revises: z0a1b2c3d4e5
Create Date: 2026-03-31
"""

from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, constraint_exists

revision = "a1b2c3d4e5f6"
down_revision = "z0a1b2c3d4e5"
branch_labels = None
depends_on = None


def table_exists(conn, schema, table):
    r = conn.execute(text(
        f"SELECT 1 FROM information_schema.tables "
        f"WHERE table_schema='{schema}' AND table_name='{table}'"
    ))
    return r.fetchone() is not None


def upgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        # 1. Create designs table
        if not table_exists(conn, s, 'designs'):
            conn.execute(text(f"""
                CREATE TABLE {s}.designs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    design_no VARCHAR(100) NOT NULL,
                    description TEXT,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now(),
                    CONSTRAINT uq_{s}_designs_design_no UNIQUE (design_no)
                )
            """))
            conn.execute(text(f"CREATE INDEX ix_{s}_designs_design_no ON {s}.designs (design_no)"))

        # 2. Party name unique constraints (case-insensitive via unique index on lower(name))
        for table in ['suppliers', 'customers', 'va_parties', 'brokers', 'transports']:
            idx_name = f"uq_{s}_{table}_name_lower"
            if not constraint_exists(conn, s, idx_name):
                # Use unique index on lower(name) for case-insensitive uniqueness
                conn.execute(text(
                    f"CREATE UNIQUE INDEX IF NOT EXISTS {idx_name} ON {s}.{table} (lower(name))"
                ))


def downgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        # Drop party name unique indexes
        for table in ['suppliers', 'customers', 'va_parties', 'brokers', 'transports']:
            conn.execute(text(f"DROP INDEX IF EXISTS {s}.uq_{s}_{table}_name_lower"))

        # Drop designs table
        conn.execute(text(f"DROP TABLE IF EXISTS {s}.designs"))
