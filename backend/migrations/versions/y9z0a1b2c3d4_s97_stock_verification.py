"""S97: Stock verification tables for physical count workflow.

Revision ID: y9z0a1b2c3d4
Revises: x8y9z0a1b2c3
Create Date: 2026-03-30
"""
from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas

revision = "y9z0a1b2c3d4"
down_revision = "x8y9z0a1b2c3"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {s}.stock_verifications (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                verification_no VARCHAR(20) NOT NULL UNIQUE,
                verification_type VARCHAR(20) NOT NULL,
                verification_date DATE NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'draft',
                notes TEXT,
                started_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
                approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
                approved_at TIMESTAMPTZ,
                fy_id UUID REFERENCES {s}.financial_years(id) ON DELETE RESTRICT,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now()
            )
        """))

        conn.execute(text(f"""
            CREATE INDEX IF NOT EXISTS ix_{s}_sv_started_by ON {s}.stock_verifications(started_by)
        """))
        conn.execute(text(f"""
            CREATE INDEX IF NOT EXISTS ix_{s}_sv_fy_id ON {s}.stock_verifications(fy_id)
        """))

        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {s}.stock_verification_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                verification_id UUID NOT NULL REFERENCES {s}.stock_verifications(id) ON DELETE CASCADE,
                sku_id UUID REFERENCES {s}.skus(id) ON DELETE SET NULL,
                roll_id UUID REFERENCES {s}.rolls(id) ON DELETE SET NULL,
                item_label VARCHAR(100) NOT NULL,
                book_qty NUMERIC(12, 3) DEFAULT 0,
                physical_qty NUMERIC(12, 3),
                variance NUMERIC(12, 3),
                variance_pct NUMERIC(8, 2),
                adjustment_type VARCHAR(10),
                notes TEXT,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now()
            )
        """))

        conn.execute(text(f"""
            CREATE INDEX IF NOT EXISTS ix_{s}_svi_verification ON {s}.stock_verification_items(verification_id)
        """))
        conn.execute(text(f"""
            CREATE INDEX IF NOT EXISTS ix_{s}_svi_sku ON {s}.stock_verification_items(sku_id)
        """))
        conn.execute(text(f"""
            CREATE INDEX IF NOT EXISTS ix_{s}_svi_roll ON {s}.stock_verification_items(roll_id)
        """))


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        conn.execute(text(f"DROP TABLE IF EXISTS {s}.stock_verification_items"))
        conn.execute(text(f"DROP TABLE IF EXISTS {s}.stock_verifications"))
