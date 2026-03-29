"""S93: Create sales_returns + sales_return_items tables."""

revision = "u5v6w7x8y9z0"
down_revision = "t4u5v6w7x8y9"

from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):

        # 1. CREATE TABLE sales_returns
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {s}.sales_returns (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                srn_no VARCHAR(50) NOT NULL UNIQUE,
                order_id UUID NOT NULL REFERENCES {s}.orders(id) ON DELETE RESTRICT,
                customer_id UUID NOT NULL REFERENCES {s}.customers(id) ON DELETE RESTRICT,
                status VARCHAR(20) NOT NULL DEFAULT 'draft',
                return_date DATE,
                received_date DATE,
                inspected_date DATE,
                restocked_date DATE,
                transport_id UUID REFERENCES {s}.transports(id) ON DELETE SET NULL,
                lr_number VARCHAR(50),
                lr_date DATE,
                reason_summary TEXT,
                qc_notes TEXT,
                total_amount NUMERIC(12,2),
                credit_note_no VARCHAR(50),
                fy_id UUID REFERENCES {s}.financial_years(id) ON DELETE RESTRICT,
                created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
                received_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
                inspected_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ,
                CONSTRAINT sr_valid_status CHECK (status IN ('draft','received','inspected','restocked','closed','cancelled'))
            )
        """))

        # Indexes for sales_returns
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_sr_order ON {s}.sales_returns(order_id)"))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_sr_customer ON {s}.sales_returns(customer_id)"))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_sr_status ON {s}.sales_returns(status)"))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_sr_fy ON {s}.sales_returns(fy_id)"))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_sr_created_by ON {s}.sales_returns(created_by)"))

        # 2. CREATE TABLE sales_return_items
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {s}.sales_return_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                sales_return_id UUID NOT NULL REFERENCES {s}.sales_returns(id) ON DELETE CASCADE,
                order_item_id UUID NOT NULL REFERENCES {s}.order_items(id) ON DELETE RESTRICT,
                sku_id UUID NOT NULL REFERENCES {s}.skus(id) ON DELETE RESTRICT,
                quantity_returned INTEGER NOT NULL,
                quantity_restocked INTEGER NOT NULL DEFAULT 0,
                quantity_damaged INTEGER NOT NULL DEFAULT 0,
                reason VARCHAR(50),
                condition VARCHAR(20) NOT NULL DEFAULT 'pending',
                notes TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ
            )
        """))

        # Indexes for sales_return_items
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_sri_return ON {s}.sales_return_items(sales_return_id)"))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_sri_oi ON {s}.sales_return_items(order_item_id)"))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_sri_sku ON {s}.sales_return_items(sku_id)"))


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        conn.execute(text(f"DROP TABLE IF EXISTS {s}.sales_return_items"))
        conn.execute(text(f"DROP TABLE IF EXISTS {s}.sales_returns"))
