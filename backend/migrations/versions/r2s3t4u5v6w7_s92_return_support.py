"""S92: Add returned_qty to order_items, partially_returned to order status CHECK."""

revision = "r2s3t4u5v6w7"
down_revision = "q1r2s3t4u5v6"

from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, col_exists, constraint_exists


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):

        # 1. Add returned_qty to order_items
        if not col_exists(conn, s, 'order_items', 'returned_qty'):
            conn.execute(text(
                f"ALTER TABLE {s}.order_items ADD COLUMN returned_qty INTEGER NOT NULL DEFAULT 0"
            ))

        # 2. Update orders CHECK constraint to include partially_returned
        # Drop both possible constraint names (auto-generated ck_ prefix and named)
        if constraint_exists(conn, s, 'ck_orders_ord_valid_status'):
            conn.execute(text(f"ALTER TABLE {s}.orders DROP CONSTRAINT ck_orders_ord_valid_status"))
        if constraint_exists(conn, s, 'ord_valid_status'):
            conn.execute(text(f"ALTER TABLE {s}.orders DROP CONSTRAINT ord_valid_status"))
        conn.execute(text(f"""
            ALTER TABLE {s}.orders ADD CONSTRAINT ord_valid_status
            CHECK (status IN ('pending', 'confirmed', 'processing', 'partially_shipped', 'shipped', 'delivered', 'cancelled', 'partially_returned', 'returned'))
        """))


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        if col_exists(conn, s, 'order_items', 'returned_qty'):
            conn.execute(text(f"ALTER TABLE {s}.order_items DROP COLUMN returned_qty"))

        if constraint_exists(conn, s, 'ord_valid_status'):
            conn.execute(text(f"ALTER TABLE {s}.orders DROP CONSTRAINT ord_valid_status"))
        conn.execute(text(f"""
            ALTER TABLE {s}.orders ADD CONSTRAINT ord_valid_status
            CHECK (status IN ('pending', 'confirmed', 'processing', 'partially_shipped', 'shipped', 'delivered', 'cancelled', 'returned'))
        """))
