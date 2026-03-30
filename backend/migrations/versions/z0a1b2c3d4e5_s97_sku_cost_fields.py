"""S97: Add stitching_cost + other_cost to SKUs for full cost breakdown.

Revision ID: z0a1b2c3d4e5
Revises: y9z0a1b2c3d4
Create Date: 2026-03-30
"""
from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, col_exists

revision = "z0a1b2c3d4e5"
down_revision = "y9z0a1b2c3d4"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        if not col_exists(conn, s, "skus", "stitching_cost"):
            conn.execute(text(f"ALTER TABLE {s}.skus ADD COLUMN stitching_cost NUMERIC(10, 2)"))
        if not col_exists(conn, s, "skus", "other_cost"):
            conn.execute(text(f"ALTER TABLE {s}.skus ADD COLUMN other_cost NUMERIC(10, 2)"))


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        conn.execute(text(f"ALTER TABLE {s}.skus DROP COLUMN IF EXISTS stitching_cost"))
        conn.execute(text(f"ALTER TABLE {s}.skus DROP COLUMN IF EXISTS other_cost"))
