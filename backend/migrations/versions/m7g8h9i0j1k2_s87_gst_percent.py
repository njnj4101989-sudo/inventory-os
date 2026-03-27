"""S87: gst_percent, discount_amount on orders + invoice standalone columns.

Revision ID: m7g8h9i0j1k2
Revises: l6f7g8h9i0j1
"""
from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, col_exists

revision = "m7g8h9i0j1k2"
down_revision = "l6f7g8h9i0j1"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        # --- Orders ---
        if not col_exists(conn, s, "orders", "gst_percent"):
            conn.execute(text(
                f"ALTER TABLE {s}.orders ADD COLUMN gst_percent NUMERIC(5,2) NOT NULL DEFAULT 0"
            ))
        if not col_exists(conn, s, "orders", "discount_amount"):
            conn.execute(text(
                f"ALTER TABLE {s}.orders ADD COLUMN discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0"
            ))

        # --- Invoices ---
        if not col_exists(conn, s, "invoices", "gst_percent"):
            conn.execute(text(
                f"ALTER TABLE {s}.invoices ADD COLUMN gst_percent NUMERIC(5,2) NOT NULL DEFAULT 0"
            ))
        if not col_exists(conn, s, "invoices", "customer_id"):
            conn.execute(text(
                f"ALTER TABLE {s}.invoices ADD COLUMN customer_id UUID REFERENCES {s}.customers(id) ON DELETE RESTRICT"
            ))
        if not col_exists(conn, s, "invoices", "customer_name"):
            conn.execute(text(
                f"ALTER TABLE {s}.invoices ADD COLUMN customer_name VARCHAR(200)"
            ))
        if not col_exists(conn, s, "invoices", "customer_phone"):
            conn.execute(text(
                f"ALTER TABLE {s}.invoices ADD COLUMN customer_phone VARCHAR(20)"
            ))
        if not col_exists(conn, s, "invoices", "customer_address"):
            conn.execute(text(
                f"ALTER TABLE {s}.invoices ADD COLUMN customer_address TEXT"
            ))
        # Make order_id nullable (standalone invoices have no order)
        conn.execute(text(
            f"ALTER TABLE {s}.invoices ALTER COLUMN order_id DROP NOT NULL"
        ))
        # Make qr_code_data nullable
        conn.execute(text(
            f"ALTER TABLE {s}.invoices ALTER COLUMN qr_code_data DROP NOT NULL"
        ))
        # Index on customer_id
        conn.execute(text(
            f"CREATE INDEX IF NOT EXISTS ix_{s}_invoices_customer_id ON {s}.invoices (customer_id)"
        ))


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        if col_exists(conn, s, "orders", "gst_percent"):
            conn.execute(text(f"ALTER TABLE {s}.orders DROP COLUMN gst_percent"))
        if col_exists(conn, s, "orders", "discount_amount"):
            conn.execute(text(f"ALTER TABLE {s}.orders DROP COLUMN discount_amount"))
        if col_exists(conn, s, "invoices", "gst_percent"):
            conn.execute(text(f"ALTER TABLE {s}.invoices DROP COLUMN gst_percent"))
        if col_exists(conn, s, "invoices", "customer_id"):
            conn.execute(text(f"ALTER TABLE {s}.invoices DROP COLUMN customer_id"))
        if col_exists(conn, s, "invoices", "customer_name"):
            conn.execute(text(f"ALTER TABLE {s}.invoices DROP COLUMN customer_name"))
        if col_exists(conn, s, "invoices", "customer_phone"):
            conn.execute(text(f"ALTER TABLE {s}.invoices DROP COLUMN customer_phone"))
        if col_exists(conn, s, "invoices", "customer_address"):
            conn.execute(text(f"ALTER TABLE {s}.invoices DROP COLUMN customer_address"))
