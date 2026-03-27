"""S86: Add order_date, broker_name, transport to orders.

Revision ID: l6f7g8h9i0j1
Revises: k5e6f7g8h9i0
"""
from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, col_exists

revision = "l6f7g8h9i0j1"
down_revision = "k5e6f7g8h9i0"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        if not col_exists(conn, s, "orders", "order_date"):
            conn.execute(text(
                f"ALTER TABLE {s}.orders ADD COLUMN order_date DATE"
            ))
            conn.execute(text(
                f"UPDATE {s}.orders SET order_date = created_at::date WHERE order_date IS NULL"
            ))
        if not col_exists(conn, s, "orders", "broker_name"):
            conn.execute(text(
                f"ALTER TABLE {s}.orders ADD COLUMN broker_name VARCHAR(200)"
            ))
        if not col_exists(conn, s, "orders", "transport"):
            conn.execute(text(
                f"ALTER TABLE {s}.orders ADD COLUMN transport VARCHAR(200)"
            ))


def downgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        for col in ("order_date", "broker_name", "transport"):
            if col_exists(conn, s, "orders", col):
                conn.execute(text(
                    f"ALTER TABLE {s}.orders DROP COLUMN {col}"
                ))
