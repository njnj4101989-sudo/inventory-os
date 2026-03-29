"""S94: Add GST fields (gst_percent, subtotal, tax_amount) to sales_returns."""

revision = "w7x8y9z0a1b2"
down_revision = "v6w7x8y9z0a1"

from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, col_exists


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        if not col_exists(conn, s, "sales_returns", "gst_percent"):
            conn.execute(text(f"ALTER TABLE {s}.sales_returns ADD COLUMN gst_percent NUMERIC(5,2) DEFAULT 0"))
        if not col_exists(conn, s, "sales_returns", "subtotal"):
            conn.execute(text(f"ALTER TABLE {s}.sales_returns ADD COLUMN subtotal NUMERIC(12,2)"))
        if not col_exists(conn, s, "sales_returns", "tax_amount"):
            conn.execute(text(f"ALTER TABLE {s}.sales_returns ADD COLUMN tax_amount NUMERIC(12,2)"))

        # Backfill: set subtotal = total_amount, tax_amount = 0 for existing rows
        conn.execute(text(f"""
            UPDATE {s}.sales_returns
            SET subtotal = COALESCE(total_amount, 0),
                tax_amount = 0,
                gst_percent = 0
            WHERE subtotal IS NULL
        """))


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        conn.execute(text(f"ALTER TABLE {s}.sales_returns DROP COLUMN IF EXISTS gst_percent"))
        conn.execute(text(f"ALTER TABLE {s}.sales_returns DROP COLUMN IF EXISTS subtotal"))
        conn.execute(text(f"ALTER TABLE {s}.sales_returns DROP COLUMN IF EXISTS tax_amount"))
