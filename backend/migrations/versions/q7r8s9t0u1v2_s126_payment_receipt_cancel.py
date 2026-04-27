"""S126: PaymentReceipt cancel + audit columns.

Schema changes (per tenant schema co_*):
  payment_receipts
    + status VARCHAR(20) NOT NULL DEFAULT 'active'
    + cancel_reason VARCHAR(50) NULL
    + cancel_notes TEXT NULL
    + cancelled_at TIMESTAMPTZ NULL
    + cancelled_by UUID NULL FK public.users(id) ON DELETE SET NULL
    + CHECK pr_valid_status (status IN ('active', 'cancelled'))
    + index ix_payment_receipts_status

Backfill: not needed. New `status` column lands with server_default 'active'
which is correct for all existing rows (none have been cancelled — the
feature didn't exist before this migration).

Idempotent. Round-trip safe.

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
Create Date: 2026-04-27
"""
from alembic import op
from sqlalchemy import text

from migrations.tenant_utils import (
    col_exists,
    constraint_exists,
    get_tenant_schemas,
    index_exists,
)

revision = "q7r8s9t0u1v2"
down_revision = "p6q7r8s9t0u1"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):

        if not col_exists(conn, s, "payment_receipts", "status"):
            conn.execute(text(
                f"ALTER TABLE {s}.payment_receipts "
                f"ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active'"
            ))
        if not col_exists(conn, s, "payment_receipts", "cancel_reason"):
            conn.execute(text(
                f"ALTER TABLE {s}.payment_receipts ADD COLUMN cancel_reason VARCHAR(50)"
            ))
        if not col_exists(conn, s, "payment_receipts", "cancel_notes"):
            conn.execute(text(
                f"ALTER TABLE {s}.payment_receipts ADD COLUMN cancel_notes TEXT"
            ))
        if not col_exists(conn, s, "payment_receipts", "cancelled_at"):
            conn.execute(text(
                f"ALTER TABLE {s}.payment_receipts ADD COLUMN cancelled_at TIMESTAMPTZ"
            ))
        if not col_exists(conn, s, "payment_receipts", "cancelled_by"):
            conn.execute(text(
                f"ALTER TABLE {s}.payment_receipts ADD COLUMN cancelled_by UUID"
            ))
            conn.execute(text(f"""
                ALTER TABLE {s}.payment_receipts
                ADD CONSTRAINT payment_receipts_cancelled_by_fkey
                FOREIGN KEY (cancelled_by) REFERENCES public.users(id) ON DELETE SET NULL
            """))

        if not constraint_exists(conn, s, "pr_valid_status"):
            conn.execute(text(f"""
                ALTER TABLE {s}.payment_receipts
                ADD CONSTRAINT pr_valid_status
                CHECK (status IN ('active', 'cancelled'))
            """))

        if not index_exists(conn, s, "ix_payment_receipts_status"):
            conn.execute(text(
                f"CREATE INDEX ix_payment_receipts_status "
                f"ON {s}.payment_receipts (status)"
            ))
        if not index_exists(conn, s, "ix_payment_receipts_cancelled_by"):
            conn.execute(text(
                f"CREATE INDEX ix_payment_receipts_cancelled_by "
                f"ON {s}.payment_receipts (cancelled_by)"
            ))


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        if index_exists(conn, s, "ix_payment_receipts_cancelled_by"):
            conn.execute(text(f"DROP INDEX {s}.ix_payment_receipts_cancelled_by"))
        if index_exists(conn, s, "ix_payment_receipts_status"):
            conn.execute(text(f"DROP INDEX {s}.ix_payment_receipts_status"))
        if constraint_exists(conn, s, "pr_valid_status"):
            conn.execute(text(
                f"ALTER TABLE {s}.payment_receipts DROP CONSTRAINT pr_valid_status"
            ))

        # Drop FK (created with explicit name) before dropping the column
        r = conn.execute(text(
            f"SELECT 1 FROM information_schema.table_constraints "
            f"WHERE table_schema='{s}' AND table_name='payment_receipts' "
            f"AND constraint_name='payment_receipts_cancelled_by_fkey'"
        ))
        if r.fetchone() is not None:
            conn.execute(text(
                f"ALTER TABLE {s}.payment_receipts "
                f"DROP CONSTRAINT payment_receipts_cancelled_by_fkey"
            ))

        for col in ("cancelled_by", "cancelled_at", "cancel_notes", "cancel_reason", "status"):
            if col_exists(conn, s, "payment_receipts", col):
                conn.execute(text(
                    f"ALTER TABLE {s}.payment_receipts DROP COLUMN {col}"
                ))
