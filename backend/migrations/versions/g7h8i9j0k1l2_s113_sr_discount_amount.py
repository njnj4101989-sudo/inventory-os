"""S113: Add discount_amount to sales_returns.

Credit notes generated from invoices must inherit the invoice's
discount (proportionally, for partial credits) so the credit total
matches the original invoice total. Nullable + default 0 keeps
historical rows consistent.

Revision ID: g7h8i9j0k1l2
Revises: f6g7h8i9j0k1
Create Date: 2026-04-18
"""
from alembic import op
from sqlalchemy import text

from migrations.tenant_utils import col_exists, get_tenant_schemas

revision = "g7h8i9j0k1l2"
down_revision = "f6g7h8i9j0k1"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        if not col_exists(conn, s, "sales_returns", "discount_amount"):
            conn.execute(
                text(
                    f"ALTER TABLE {s}.sales_returns "
                    f"ADD COLUMN discount_amount NUMERIC(12, 2) DEFAULT 0"
                )
            )


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        conn.execute(text(f"ALTER TABLE {s}.sales_returns DROP COLUMN IF EXISTS discount_amount"))
