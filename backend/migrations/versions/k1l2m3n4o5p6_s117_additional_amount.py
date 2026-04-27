"""S117: Add additional_amount to orders, invoices, sales_returns.

Mirrors the existing discount_amount column. Lets users add an extra
taxable charge (packing, freight, handling, labour) to the order/invoice
grand total. Math: taxable = subtotal - discount + additional → +GST → total.

Auto-copies from order → invoice (full + proportional per-shipment) and
proportionally reverses on credit-note (mirrors discount behaviour S113).

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-04-27
"""
from alembic import op
from sqlalchemy import text

from migrations.tenant_utils import col_exists, get_tenant_schemas

revision = "k1l2m3n4o5p6"
down_revision = "j0k1l2m3n4o5"
branch_labels = None
depends_on = None


_TABLES = ("orders", "invoices", "sales_returns")


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        for table in _TABLES:
            if not col_exists(conn, s, table, "additional_amount"):
                conn.execute(
                    text(
                        f"ALTER TABLE {s}.{table} "
                        f"ADD COLUMN additional_amount NUMERIC(12, 2) DEFAULT 0"
                    )
                )


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        for table in _TABLES:
            conn.execute(
                text(f"ALTER TABLE {s}.{table} DROP COLUMN IF EXISTS additional_amount")
            )
