"""S107: Add hsn_code to ProductType for GST propagation.

HSN code on ProductType auto-flows to SKU at creation, then to InvoiceItem
at invoice time. Nullable — backwards compatible.

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2026-04-07
"""
from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, col_exists

revision = "c3d4e5f6g7h8"
down_revision = "b2c3d4e5f6g7"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        if not col_exists(conn, s, "product_types", "hsn_code"):
            conn.execute(text(f"ALTER TABLE {s}.product_types ADD COLUMN hsn_code VARCHAR(8)"))


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        conn.execute(text(f"ALTER TABLE {s}.product_types DROP COLUMN IF EXISTS hsn_code"))
