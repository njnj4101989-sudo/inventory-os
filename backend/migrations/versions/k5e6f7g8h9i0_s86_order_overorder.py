"""S86: Add short_qty to order_items + fix reservation CHECK constraint.

short_qty tracks how much of an order item could not be reserved from stock.
Reservation CHECK was 'reserved' but service writes 'active' — fix alignment.

Revision ID: k5e6f7g8h9i0
Revises: j4d5e6f7g8h9
"""
from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, col_exists, constraint_exists

revision = "k5e6f7g8h9i0"
down_revision = "j4d5e6f7g8h9"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        # 1. Add short_qty to order_items
        if not col_exists(conn, s, "order_items", "short_qty"):
            conn.execute(text(
                f"ALTER TABLE {s}.order_items "
                f"ADD COLUMN short_qty INTEGER NOT NULL DEFAULT 0"
            ))

        # 2. Fix reservation CHECK constraint: 'reserved' → 'active'
        # Drop both possible names (SQLAlchemy auto-prefix + explicit name)
        if constraint_exists(conn, s, "ck_reservations_res_valid_status"):
            conn.execute(text(
                f"ALTER TABLE {s}.reservations "
                f"DROP CONSTRAINT ck_reservations_res_valid_status"
            ))
        if constraint_exists(conn, s, "res_valid_status"):
            conn.execute(text(
                f"ALTER TABLE {s}.reservations "
                f"DROP CONSTRAINT res_valid_status"
            ))
        conn.execute(text(
            f"ALTER TABLE {s}.reservations "
            f"ADD CONSTRAINT res_valid_status "
            f"CHECK (status IN ('active', 'confirmed', 'released', 'cancelled', 'expired'))"
        ))


def downgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        # Revert short_qty
        if col_exists(conn, s, "order_items", "short_qty"):
            conn.execute(text(
                f"ALTER TABLE {s}.order_items DROP COLUMN short_qty"
            ))

        # Revert CHECK constraint back to 'reserved'
        if constraint_exists(conn, s, "res_valid_status"):
            conn.execute(text(
                f"ALTER TABLE {s}.reservations DROP CONSTRAINT res_valid_status"
            ))
        conn.execute(text(
            f"ALTER TABLE {s}.reservations "
            f"ADD CONSTRAINT res_valid_status "
            f"CHECK (status IN ('reserved', 'confirmed', 'released', 'cancelled', 'expired'))"
        ))
