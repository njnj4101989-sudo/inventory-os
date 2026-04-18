"""S113: Add invoice_id FK to sales_returns (credit-note-from-invoice).

Tracks which invoice a credit note was raised against when the CN
was generated via the fast-track path (POST /invoices/{id}/credit-note).
Nullable — classic order-return and standalone-CN flows leave it NULL.

Revision ID: f6g7h8i9j0k1
Revises: e5f6g7h8i9j0
Create Date: 2026-04-18
"""
from alembic import op
from sqlalchemy import text

from migrations.tenant_utils import col_exists, get_tenant_schemas

revision = "f6g7h8i9j0k1"
down_revision = "e5f6g7h8i9j0"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        if not col_exists(conn, s, "sales_returns", "invoice_id"):
            conn.execute(
                text(
                    f"ALTER TABLE {s}.sales_returns ADD COLUMN invoice_id UUID "
                    f"REFERENCES {s}.invoices(id) ON DELETE RESTRICT"
                )
            )
            conn.execute(
                text(f"CREATE INDEX IF NOT EXISTS ix_{s}_sales_returns_invoice_id ON {s}.sales_returns(invoice_id)")
            )


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        conn.execute(text(f"DROP INDEX IF EXISTS {s}.ix_{s}_sales_returns_invoice_id"))
        conn.execute(text(f"ALTER TABLE {s}.sales_returns DROP COLUMN IF EXISTS invoice_id"))
