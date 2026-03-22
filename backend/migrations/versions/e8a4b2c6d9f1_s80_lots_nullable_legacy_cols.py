"""S80b: Make lots.design_no and lots.default_size_pattern nullable

These columns are superseded by lots.designs JSON (S80) but were left NOT NULL
in the original migration, causing INSERT failures on new lots.

Revision ID: e8a4b2c6d9f1
Revises: d7f3a1b4c5e2
"""
from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, col_exists


revision = "e8a4b2c6d9f1"
down_revision = "d7f3a1b4c5e2"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        # Make legacy design_no nullable (no longer set by application)
        if col_exists(conn, s, "lots", "design_no"):
            conn.execute(text(f"ALTER TABLE {s}.lots ALTER COLUMN design_no DROP NOT NULL"))

        # Make legacy default_size_pattern nullable (no longer set by application)
        if col_exists(conn, s, "lots", "default_size_pattern"):
            conn.execute(text(f"ALTER TABLE {s}.lots ALTER COLUMN default_size_pattern DROP NOT NULL"))


def downgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        if col_exists(conn, s, "lots", "design_no"):
            # Backfill NULLs before restoring NOT NULL
            conn.execute(text(f"UPDATE {s}.lots SET design_no = '' WHERE design_no IS NULL"))
            conn.execute(text(f"ALTER TABLE {s}.lots ALTER COLUMN design_no SET NOT NULL"))

        if col_exists(conn, s, "lots", "default_size_pattern"):
            conn.execute(text(f"UPDATE {s}.lots SET default_size_pattern = '{{}}' WHERE default_size_pattern IS NULL"))
            conn.execute(text(f"ALTER TABLE {s}.lots ALTER COLUMN default_size_pattern SET NOT NULL"))
