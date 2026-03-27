"""S89: Broker + Transport masters, Order/Invoice FK wiring + LR fields.

Revision ID: o9i0j1k2l3m4
Revises: n8h9i0j1k2l3
"""

revision = "o9i0j1k2l3m4"
down_revision = "n8h9i0j1k2l3"

from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, col_exists, index_exists


def upgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        # ── 1. Create brokers table ──
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {s}.brokers (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(200) NOT NULL,
                contact_person VARCHAR(200),
                phone VARCHAR(20),
                phone_alt VARCHAR(20),
                email VARCHAR(100),
                address TEXT,
                city VARCHAR(100),
                state VARCHAR(100),
                pin_code VARCHAR(10),
                gst_no VARCHAR(15),
                gst_type VARCHAR(20),
                state_code VARCHAR(2),
                pan_no VARCHAR(10),
                aadhar_no VARCHAR(12),
                due_days INTEGER,
                credit_limit NUMERIC(12,2),
                opening_balance NUMERIC(12,2),
                balance_type VARCHAR(10),
                commission_rate NUMERIC(5,2),
                tds_applicable BOOLEAN DEFAULT false,
                tds_rate NUMERIC(5,2),
                tds_section VARCHAR(10),
                notes TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT now()
            )
        """))
        if not index_exists(conn, s, f"ix_{s}_brokers_name"):
            conn.execute(text(f"CREATE INDEX ix_{s}_brokers_name ON {s}.brokers (name)"))
        if not index_exists(conn, s, f"ix_{s}_brokers_gst_no"):
            conn.execute(text(f"CREATE INDEX ix_{s}_brokers_gst_no ON {s}.brokers (gst_no)"))

        # ── 2. Create transports table ──
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {s}.transports (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(200) NOT NULL,
                contact_person VARCHAR(200),
                phone VARCHAR(20),
                phone_alt VARCHAR(20),
                email VARCHAR(100),
                address TEXT,
                city VARCHAR(100),
                state VARCHAR(100),
                pin_code VARCHAR(10),
                gst_no VARCHAR(15),
                gst_type VARCHAR(20),
                state_code VARCHAR(2),
                pan_no VARCHAR(10),
                aadhar_no VARCHAR(12),
                opening_balance NUMERIC(12,2),
                balance_type VARCHAR(10),
                notes TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT now()
            )
        """))
        if not index_exists(conn, s, f"ix_{s}_transports_name"):
            conn.execute(text(f"CREATE INDEX ix_{s}_transports_name ON {s}.transports (name)"))
        if not index_exists(conn, s, f"ix_{s}_transports_gst_no"):
            conn.execute(text(f"CREATE INDEX ix_{s}_transports_gst_no ON {s}.transports (gst_no)"))

        # ── 3. Add columns to orders ──
        if not col_exists(conn, s, "orders", "broker_id"):
            conn.execute(text(f"ALTER TABLE {s}.orders ADD COLUMN broker_id UUID REFERENCES {s}.brokers(id) ON DELETE SET NULL"))
            conn.execute(text(f"CREATE INDEX ix_{s}_orders_broker_id ON {s}.orders (broker_id)"))
        if not col_exists(conn, s, "orders", "transport_id"):
            conn.execute(text(f"ALTER TABLE {s}.orders ADD COLUMN transport_id UUID REFERENCES {s}.transports(id) ON DELETE SET NULL"))
            conn.execute(text(f"CREATE INDEX ix_{s}_orders_transport_id ON {s}.orders (transport_id)"))
        if not col_exists(conn, s, "orders", "lr_number"):
            conn.execute(text(f"ALTER TABLE {s}.orders ADD COLUMN lr_number VARCHAR(50)"))
        if not col_exists(conn, s, "orders", "lr_date"):
            conn.execute(text(f"ALTER TABLE {s}.orders ADD COLUMN lr_date DATE"))

        # ── 4. Add columns to invoices ──
        if not col_exists(conn, s, "invoices", "broker_id"):
            conn.execute(text(f"ALTER TABLE {s}.invoices ADD COLUMN broker_id UUID REFERENCES {s}.brokers(id) ON DELETE SET NULL"))
            conn.execute(text(f"CREATE INDEX ix_{s}_invoices_broker_id ON {s}.invoices (broker_id)"))
        if not col_exists(conn, s, "invoices", "transport_id"):
            conn.execute(text(f"ALTER TABLE {s}.invoices ADD COLUMN transport_id UUID REFERENCES {s}.transports(id) ON DELETE SET NULL"))
            conn.execute(text(f"CREATE INDEX ix_{s}_invoices_transport_id ON {s}.invoices (transport_id)"))
        if not col_exists(conn, s, "invoices", "lr_number"):
            conn.execute(text(f"ALTER TABLE {s}.invoices ADD COLUMN lr_number VARCHAR(50)"))
        if not col_exists(conn, s, "invoices", "lr_date"):
            conn.execute(text(f"ALTER TABLE {s}.invoices ADD COLUMN lr_date DATE"))

        # ── 5. Best-effort backfill (no-op if masters empty) ──
        conn.execute(text(f"""
            UPDATE {s}.orders o
            SET broker_id = b.id
            FROM {s}.brokers b
            WHERE LOWER(TRIM(o.broker_name)) = LOWER(TRIM(b.name))
              AND o.broker_id IS NULL
              AND o.broker_name IS NOT NULL
        """))
        conn.execute(text(f"""
            UPDATE {s}.orders o
            SET transport_id = t.id
            FROM {s}.transports t
            WHERE LOWER(TRIM(o.transport)) = LOWER(TRIM(t.name))
              AND o.transport_id IS NULL
              AND o.transport IS NOT NULL
        """))


def downgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        # Drop columns from invoices
        if col_exists(conn, s, "invoices", "lr_date"):
            conn.execute(text(f"ALTER TABLE {s}.invoices DROP COLUMN lr_date"))
        if col_exists(conn, s, "invoices", "lr_number"):
            conn.execute(text(f"ALTER TABLE {s}.invoices DROP COLUMN lr_number"))
        if col_exists(conn, s, "invoices", "transport_id"):
            conn.execute(text(f"ALTER TABLE {s}.invoices DROP COLUMN transport_id"))
        if col_exists(conn, s, "invoices", "broker_id"):
            conn.execute(text(f"ALTER TABLE {s}.invoices DROP COLUMN broker_id"))

        # Drop columns from orders
        if col_exists(conn, s, "orders", "lr_date"):
            conn.execute(text(f"ALTER TABLE {s}.orders DROP COLUMN lr_date"))
        if col_exists(conn, s, "orders", "lr_number"):
            conn.execute(text(f"ALTER TABLE {s}.orders DROP COLUMN lr_number"))
        if col_exists(conn, s, "orders", "transport_id"):
            conn.execute(text(f"ALTER TABLE {s}.orders DROP COLUMN transport_id"))
        if col_exists(conn, s, "orders", "broker_id"):
            conn.execute(text(f"ALTER TABLE {s}.orders DROP COLUMN broker_id"))

        # Drop tables
        conn.execute(text(f"DROP TABLE IF EXISTS {s}.transports CASCADE"))
        conn.execute(text(f"DROP TABLE IF EXISTS {s}.brokers CASCADE"))
