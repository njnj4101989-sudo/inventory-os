"""S92: Create return_notes + return_note_items tables, add 'returned' to roll status CHECK."""

revision = "t4u5v6w7x8y9"
down_revision = "s3t4u5v6w7x8"

from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, col_exists, constraint_exists


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):

        # 1. CREATE TABLE return_notes
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {s}.return_notes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                return_note_no VARCHAR(50) NOT NULL UNIQUE,
                return_type VARCHAR(20) NOT NULL,
                supplier_id UUID NOT NULL REFERENCES {s}.suppliers(id) ON DELETE RESTRICT,
                status VARCHAR(20) NOT NULL DEFAULT 'draft',
                return_date DATE,
                approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
                approved_at TIMESTAMPTZ,
                dispatch_date DATE,
                transport_id UUID REFERENCES {s}.transports(id) ON DELETE SET NULL,
                lr_number VARCHAR(50),
                total_amount NUMERIC(12,2),
                notes TEXT,
                created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
                fy_id UUID REFERENCES {s}.financial_years(id) ON DELETE RESTRICT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ,
                CONSTRAINT rn_valid_type CHECK (return_type IN ('roll_return', 'sku_return')),
                CONSTRAINT rn_valid_status CHECK (status IN ('draft', 'approved', 'dispatched', 'acknowledged', 'closed', 'cancelled'))
            )
        """))

        # Indexes
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_rn_supplier ON {s}.return_notes(supplier_id)"))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_rn_status ON {s}.return_notes(status)"))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_rn_type ON {s}.return_notes(return_type)"))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_rn_fy ON {s}.return_notes(fy_id)"))

        # 2. CREATE TABLE return_note_items
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {s}.return_note_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                return_note_id UUID NOT NULL REFERENCES {s}.return_notes(id) ON DELETE CASCADE,
                roll_id UUID REFERENCES {s}.rolls(id) ON DELETE RESTRICT,
                sku_id UUID REFERENCES {s}.skus(id) ON DELETE RESTRICT,
                quantity INTEGER NOT NULL DEFAULT 1,
                weight NUMERIC(10,3),
                unit_price NUMERIC(10,2),
                amount NUMERIC(12,2),
                reason VARCHAR(50),
                condition VARCHAR(50),
                notes TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ
            )
        """))

        conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_rni_note ON {s}.return_note_items(return_note_id)"))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_rni_roll ON {s}.return_note_items(roll_id)"))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_rni_sku ON {s}.return_note_items(sku_id)"))

        # 3. Update roll status CHECK to include 'returned'
        if constraint_exists(conn, s, 'valid_status'):
            conn.execute(text(f"ALTER TABLE {s}.rolls DROP CONSTRAINT valid_status"))
        conn.execute(text(f"""
            ALTER TABLE {s}.rolls ADD CONSTRAINT valid_status
            CHECK (status IN ('in_stock', 'sent_for_processing', 'in_cutting', 'remnant', 'returned'))
        """))


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        conn.execute(text(f"DROP TABLE IF EXISTS {s}.return_note_items"))
        conn.execute(text(f"DROP TABLE IF EXISTS {s}.return_notes"))

        if constraint_exists(conn, s, 'valid_status'):
            conn.execute(text(f"ALTER TABLE {s}.rolls DROP CONSTRAINT valid_status"))
        conn.execute(text(f"""
            ALTER TABLE {s}.rolls ADD CONSTRAINT valid_status
            CHECK (status IN ('in_stock', 'sent_for_processing', 'in_cutting', 'remnant'))
        """))
