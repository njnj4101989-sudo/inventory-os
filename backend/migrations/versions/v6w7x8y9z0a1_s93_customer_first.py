"""S93: Make order_id nullable on sales_returns, order_item_id nullable on sales_return_items, add unit_price."""

revision = "v6w7x8y9z0a1"
down_revision = "u5v6w7x8y9z0"

from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, col_exists


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):

        # 1. Make order_id nullable on sales_returns
        conn.execute(text(f"ALTER TABLE {s}.sales_returns ALTER COLUMN order_id DROP NOT NULL"))

        # 2. Make order_item_id nullable on sales_return_items
        conn.execute(text(f"ALTER TABLE {s}.sales_return_items ALTER COLUMN order_item_id DROP NOT NULL"))

        # 3. Add unit_price to sales_return_items
        if not col_exists(conn, s, 'sales_return_items', 'unit_price'):
            conn.execute(text(f"ALTER TABLE {s}.sales_return_items ADD COLUMN unit_price NUMERIC(10,2)"))


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        conn.execute(text(f"ALTER TABLE {s}.sales_return_items DROP COLUMN IF EXISTS unit_price"))
        conn.execute(text(f"ALTER TABLE {s}.sales_return_items ALTER COLUMN order_item_id SET NOT NULL"))
        conn.execute(text(f"ALTER TABLE {s}.sales_returns ALTER COLUMN order_id SET NOT NULL"))
