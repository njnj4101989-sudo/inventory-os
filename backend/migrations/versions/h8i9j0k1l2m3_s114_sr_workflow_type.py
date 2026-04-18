"""S114: Add workflow_type to sales_returns (fast_track vs with_qc).

Differentiates the 1-click fast-track CN path from the full 5-step QC
workflow so list views can badge them clearly. Existing rows default
to 'with_qc' via server default. The fast-track endpoint writes
'fast_track'; the classic create_sales_return path writes 'with_qc'.

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-04-18
"""
from alembic import op
from sqlalchemy import text

from migrations.tenant_utils import col_exists, get_tenant_schemas

revision = "h8i9j0k1l2m3"
down_revision = "g7h8i9j0k1l2"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        if not col_exists(conn, s, "sales_returns", "workflow_type"):
            conn.execute(
                text(
                    f"ALTER TABLE {s}.sales_returns "
                    f"ADD COLUMN workflow_type VARCHAR(20) NOT NULL DEFAULT 'with_qc'"
                )
            )


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        conn.execute(text(f"ALTER TABLE {s}.sales_returns DROP COLUMN IF EXISTS workflow_type"))
