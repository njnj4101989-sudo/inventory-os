"""S88: Invoice overhaul — due_date, payment_terms, place_of_supply, hsn_code, duplicate guard.

Revision ID: n8h9i0j1k2l3
Revises: m7g8h9i0j1k2
"""
from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, col_exists, index_exists

revision = "n8h9i0j1k2l3"
down_revision = "m7g8h9i0j1k2"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        # --- invoices ---
        if not col_exists(conn, s, "invoices", "due_date"):
            conn.execute(text(f"ALTER TABLE {s}.invoices ADD COLUMN due_date DATE"))
        if not col_exists(conn, s, "invoices", "payment_terms"):
            conn.execute(text(f"ALTER TABLE {s}.invoices ADD COLUMN payment_terms VARCHAR(100)"))
        if not col_exists(conn, s, "invoices", "place_of_supply"):
            conn.execute(text(f"ALTER TABLE {s}.invoices ADD COLUMN place_of_supply VARCHAR(100)"))

        # --- invoice_items ---
        if not col_exists(conn, s, "invoice_items", "hsn_code"):
            conn.execute(text(f"ALTER TABLE {s}.invoice_items ADD COLUMN hsn_code VARCHAR(8)"))

        # --- Partial unique index: one active invoice per order ---
        if not index_exists(conn, s, f"uq_{s}_invoices_order_active"):
            conn.execute(text(
                f"CREATE UNIQUE INDEX uq_{s}_invoices_order_active "
                f"ON {s}.invoices (order_id) WHERE order_id IS NOT NULL AND status != 'cancelled'"
            ))


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        conn.execute(text(f"DROP INDEX IF EXISTS {s}.uq_{s}_invoices_order_active"))
        if col_exists(conn, s, "invoices", "due_date"):
            conn.execute(text(f"ALTER TABLE {s}.invoices DROP COLUMN due_date"))
        if col_exists(conn, s, "invoices", "payment_terms"):
            conn.execute(text(f"ALTER TABLE {s}.invoices DROP COLUMN payment_terms"))
        if col_exists(conn, s, "invoices", "place_of_supply"):
            conn.execute(text(f"ALTER TABLE {s}.invoices DROP COLUMN place_of_supply"))
        if col_exists(conn, s, "invoice_items", "hsn_code"):
            conn.execute(text(f"ALTER TABLE {s}.invoice_items DROP COLUMN hsn_code"))
