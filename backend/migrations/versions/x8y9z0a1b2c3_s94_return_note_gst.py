"""S94: Add GST + debit note fields to return_notes."""

revision = "x8y9z0a1b2c3"
down_revision = "w7x8y9z0a1b2"

from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, col_exists


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        if not col_exists(conn, s, "return_notes", "gst_percent"):
            conn.execute(text(f"ALTER TABLE {s}.return_notes ADD COLUMN gst_percent NUMERIC(5,2) DEFAULT 0"))
        if not col_exists(conn, s, "return_notes", "subtotal"):
            conn.execute(text(f"ALTER TABLE {s}.return_notes ADD COLUMN subtotal NUMERIC(12,2)"))
        if not col_exists(conn, s, "return_notes", "tax_amount"):
            conn.execute(text(f"ALTER TABLE {s}.return_notes ADD COLUMN tax_amount NUMERIC(12,2)"))
        if not col_exists(conn, s, "return_notes", "debit_note_no"):
            conn.execute(text(f"ALTER TABLE {s}.return_notes ADD COLUMN debit_note_no VARCHAR(50)"))

        # Backfill: set subtotal = total_amount, tax_amount = 0, gst_percent = 0 for existing rows
        conn.execute(text(f"""
            UPDATE {s}.return_notes
            SET subtotal = COALESCE(total_amount, 0),
                tax_amount = 0,
                gst_percent = 0
            WHERE subtotal IS NULL
        """))


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        conn.execute(text(f"ALTER TABLE {s}.return_notes DROP COLUMN IF EXISTS gst_percent"))
        conn.execute(text(f"ALTER TABLE {s}.return_notes DROP COLUMN IF EXISTS subtotal"))
        conn.execute(text(f"ALTER TABLE {s}.return_notes DROP COLUMN IF EXISTS tax_amount"))
        conn.execute(text(f"ALTER TABLE {s}.return_notes DROP COLUMN IF EXISTS debit_note_no"))
