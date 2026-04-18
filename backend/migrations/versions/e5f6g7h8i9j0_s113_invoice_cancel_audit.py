"""S113: Add cancel audit fields to invoices (GST-compliant cancellation).

Captures WHY an invoice was cancelled + WHO cancelled it + WHEN. Required
for GST audits — cancelled invoices are never deleted, and auditors expect
a reason attached to each cancellation.

Adds:
  - cancel_reason  VARCHAR(50)              — short code (wrong_amount, duplicate, etc.)
  - cancel_notes   TEXT                     — optional free-text details
  - cancelled_at   TIMESTAMPTZ              — when the cancel happened
  - cancelled_by   UUID FK public.users.id  — who clicked cancel

All nullable — historical cancelled invoices (pre-S113) keep NULLs,
new cancellations populate all four.

Revision ID: e5f6g7h8i9j0
Revises: d4e5f6g7h8i9
Create Date: 2026-04-18
"""
from alembic import op
from sqlalchemy import text

from migrations.tenant_utils import col_exists, get_tenant_schemas

revision = "e5f6g7h8i9j0"
down_revision = "d4e5f6g7h8i9"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        if not col_exists(conn, s, "invoices", "cancel_reason"):
            conn.execute(text(f"ALTER TABLE {s}.invoices ADD COLUMN cancel_reason VARCHAR(50)"))
        if not col_exists(conn, s, "invoices", "cancel_notes"):
            conn.execute(text(f"ALTER TABLE {s}.invoices ADD COLUMN cancel_notes TEXT"))
        if not col_exists(conn, s, "invoices", "cancelled_at"):
            conn.execute(text(f"ALTER TABLE {s}.invoices ADD COLUMN cancelled_at TIMESTAMPTZ"))
        if not col_exists(conn, s, "invoices", "cancelled_by"):
            conn.execute(
                text(
                    f"ALTER TABLE {s}.invoices ADD COLUMN cancelled_by UUID "
                    f"REFERENCES public.users(id) ON DELETE SET NULL"
                )
            )


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        conn.execute(text(f"ALTER TABLE {s}.invoices DROP COLUMN IF EXISTS cancelled_by"))
        conn.execute(text(f"ALTER TABLE {s}.invoices DROP COLUMN IF EXISTS cancelled_at"))
        conn.execute(text(f"ALTER TABLE {s}.invoices DROP COLUMN IF EXISTS cancel_notes"))
        conn.execute(text(f"ALTER TABLE {s}.invoices DROP COLUMN IF EXISTS cancel_reason"))
