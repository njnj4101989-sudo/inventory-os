"""S120: Order cancel audit trail.

Adds GST-style cancel audit columns to Order, mirroring Invoice's cancel
audit (S113). Required because the OrdersPage Cancel button was firing
without confirmation and there was no record of why an order was
cancelled — purely a hard-delete-flag-flip.

  Order +4 cols: cancel_reason, cancel_notes, cancelled_at, cancelled_by

All four are NULLABLE — historical cancelled rows pre-S120 simply have
NULL on these columns. No backfill is meaningful (no record of original
reason exists).

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
Create Date: 2026-04-27
"""
from alembic import op
from sqlalchemy import text

from migrations.tenant_utils import col_exists, get_tenant_schemas

revision = "m3n4o5p6q7r8"
down_revision = "l2m3n4o5p6q7"
branch_labels = None
depends_on = None


_COLS = {
    "cancel_reason": "VARCHAR(50)",
    "cancel_notes": "TEXT",
    "cancelled_at": "TIMESTAMPTZ",
    "cancelled_by": "UUID",
}


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        for col, ctype in _COLS.items():
            if not col_exists(conn, s, "orders", col):
                conn.execute(text(
                    f"ALTER TABLE {s}.orders ADD COLUMN {col} {ctype}"
                ))

        # FK on cancelled_by -> public.users(id) ON DELETE SET NULL.
        # Idempotent: only add if not present.
        fk_exists = conn.execute(text(f"""
            SELECT 1 FROM information_schema.table_constraints
             WHERE table_schema = '{s}'
               AND table_name = 'orders'
               AND constraint_name = 'fk_orders_cancelled_by_users'
        """)).first()
        if not fk_exists:
            conn.execute(text(f"""
                ALTER TABLE {s}.orders
                ADD CONSTRAINT fk_orders_cancelled_by_users
                FOREIGN KEY (cancelled_by)
                REFERENCES public.users(id)
                ON DELETE SET NULL
            """))


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        conn.execute(text(
            f"ALTER TABLE {s}.orders DROP CONSTRAINT IF EXISTS fk_orders_cancelled_by_users"
        ))
        for col in _COLS:
            conn.execute(text(
                f"ALTER TABLE {s}.orders DROP COLUMN IF EXISTS {col}"
            ))
