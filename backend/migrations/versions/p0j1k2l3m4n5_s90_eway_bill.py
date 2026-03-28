"""S90: Add eway_bill_no + eway_bill_date to orders, make lr_number optional at ship."""

revision = "p0j1k2l3m4n5"
down_revision = "o9i0j1k2l3m4"

from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, col_exists


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        if not col_exists(conn, s, "orders", "eway_bill_no"):
            conn.execute(text(f"ALTER TABLE {s}.orders ADD COLUMN eway_bill_no VARCHAR(50)"))
        if not col_exists(conn, s, "orders", "eway_bill_date"):
            conn.execute(text(f"ALTER TABLE {s}.orders ADD COLUMN eway_bill_date DATE"))


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        if col_exists(conn, s, "orders", "eway_bill_no"):
            conn.execute(text(f"ALTER TABLE {s}.orders DROP COLUMN eway_bill_no"))
        if col_exists(conn, s, "orders", "eway_bill_date"):
            conn.execute(text(f"ALTER TABLE {s}.orders DROP COLUMN eway_bill_date"))
