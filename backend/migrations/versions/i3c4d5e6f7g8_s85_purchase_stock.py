"""S85: Add purchase_items table + type column to supplier_invoices.

Revision ID: i3c4d5e6f7g8
Revises: h2b3c4d5e6f7
Create Date: 2026-03-27
"""
from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, col_exists

revision = "i3c4d5e6f7g8"
down_revision = "h2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        # Add type column to supplier_invoices
        if not col_exists(conn, s, "supplier_invoices", "type"):
            conn.execute(text(
                f"ALTER TABLE {s}.supplier_invoices "
                f"ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'roll_purchase'"
            ))
            conn.execute(text(
                f"CREATE INDEX ix_{s}_supplier_invoices_type ON {s}.supplier_invoices (type)"
            ))

        # Create purchase_items table
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {s}.purchase_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                supplier_invoice_id UUID NOT NULL REFERENCES {s}.supplier_invoices(id) ON DELETE CASCADE,
                sku_id UUID NOT NULL REFERENCES {s}.skus(id) ON DELETE RESTRICT,
                quantity INTEGER NOT NULL,
                unit_price NUMERIC(10,2) NOT NULL,
                total_price NUMERIC(12,2) NOT NULL,
                hsn_code VARCHAR(8),
                gst_percent NUMERIC(5,2),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS ix_{s}_purchase_items_invoice "
            f"ON {s}.purchase_items (supplier_invoice_id)"
        ))
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS ix_{s}_purchase_items_sku "
            f"ON {s}.purchase_items (sku_id)"
        ))


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        conn.execute(text(f"DROP TABLE IF EXISTS {s}.purchase_items"))
        if col_exists(conn, s, "supplier_invoices", "type"):
            conn.execute(text(f"ALTER TABLE {s}.supplier_invoices DROP COLUMN type"))
