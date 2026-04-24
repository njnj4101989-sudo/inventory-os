"""S115: Add write-off support for remnant rolls.

Adds 4 audit columns to `rolls` (written_off_at, written_off_by, write_off_reason,
write_off_notes) and expands the status CHECK constraint to include 'written_off'.
Only rolls currently in 'remnant' status can transition to 'written_off'.

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-04-24
"""
from alembic import op
from sqlalchemy import text

from migrations.tenant_utils import col_exists, get_tenant_schemas

revision = "i9j0k1l2m3n4"
down_revision = "h8i9j0k1l2m3"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        if not col_exists(conn, s, "rolls", "written_off_at"):
            conn.execute(text(f"ALTER TABLE {s}.rolls ADD COLUMN written_off_at TIMESTAMPTZ"))
        if not col_exists(conn, s, "rolls", "written_off_by"):
            conn.execute(
                text(
                    f"ALTER TABLE {s}.rolls ADD COLUMN written_off_by UUID "
                    f"REFERENCES public.users(id) ON DELETE SET NULL"
                )
            )
        if not col_exists(conn, s, "rolls", "write_off_reason"):
            conn.execute(text(f"ALTER TABLE {s}.rolls ADD COLUMN write_off_reason VARCHAR(30)"))
        if not col_exists(conn, s, "rolls", "write_off_notes"):
            conn.execute(text(f"ALTER TABLE {s}.rolls ADD COLUMN write_off_notes TEXT"))

        # Expand status CHECK constraint. Drop both possible constraint names
        # (see memory/feedback_ck_prefix_constraints.md — always drop both forms).
        conn.execute(text(f"ALTER TABLE {s}.rolls DROP CONSTRAINT IF EXISTS ck_rolls_valid_status"))
        conn.execute(text(f"ALTER TABLE {s}.rolls DROP CONSTRAINT IF EXISTS valid_status"))
        conn.execute(
            text(
                f"ALTER TABLE {s}.rolls ADD CONSTRAINT valid_status CHECK ("
                f"status IN ('in_stock', 'sent_for_processing', 'in_cutting', "
                f"'remnant', 'returned', 'written_off'))"
            )
        )


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        # Revert CHECK constraint first (any 'written_off' rows will block revert)
        conn.execute(text(f"ALTER TABLE {s}.rolls DROP CONSTRAINT IF EXISTS valid_status"))
        conn.execute(
            text(
                f"ALTER TABLE {s}.rolls ADD CONSTRAINT valid_status CHECK ("
                f"status IN ('in_stock', 'sent_for_processing', 'in_cutting', "
                f"'remnant', 'returned'))"
            )
        )
        conn.execute(text(f"ALTER TABLE {s}.rolls DROP COLUMN IF EXISTS write_off_notes"))
        conn.execute(text(f"ALTER TABLE {s}.rolls DROP COLUMN IF EXISTS write_off_reason"))
        conn.execute(text(f"ALTER TABLE {s}.rolls DROP COLUMN IF EXISTS written_off_by"))
        conn.execute(text(f"ALTER TABLE {s}.rolls DROP COLUMN IF EXISTS written_off_at"))
