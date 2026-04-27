"""S116: Add Roll.weight_at_write_off snapshot column.

S115 shipped roll write-off but zeroed `remaining_weight` without snapshotting it,
so historical write-offs cannot be valued. This adds the snapshot column and
backfills existing written-off rolls via reconstruction:

    weight_at_write_off = GREATEST(0,
        total_weight
        - COALESCE(SUM(lot_rolls.weight_used + lot_rolls.waste_weight), 0)
        - COALESCE(SUM(roll_processing.weight_damaged), 0)
    )

This is best-effort for historical rows. Going forward the service writes the
exact pre-zero `remaining_weight`.

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-04-27
"""
from alembic import op
from sqlalchemy import text

from migrations.tenant_utils import col_exists, get_tenant_schemas

revision = "j0k1l2m3n4o5"
down_revision = "i9j0k1l2m3n4"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        if not col_exists(conn, s, "rolls", "weight_at_write_off"):
            conn.execute(
                text(f"ALTER TABLE {s}.rolls ADD COLUMN weight_at_write_off NUMERIC(10, 3)")
            )

        # Backfill existing written_off rolls (best-effort reconstruction).
        conn.execute(
            text(
                f"""
                UPDATE {s}.rolls AS r
                SET weight_at_write_off = GREATEST(
                    0,
                    r.total_weight
                    - COALESCE((
                        SELECT SUM(lr.weight_used + lr.waste_weight)
                        FROM {s}.lot_rolls AS lr
                        WHERE lr.roll_id = r.id
                    ), 0)
                    - COALESCE((
                        SELECT SUM(rp.weight_damaged)
                        FROM {s}.roll_processing AS rp
                        WHERE rp.roll_id = r.id AND rp.weight_damaged IS NOT NULL
                    ), 0)
                )
                WHERE r.status = 'written_off'
                  AND r.weight_at_write_off IS NULL
                """
            )
        )


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        conn.execute(text(f"ALTER TABLE {s}.rolls DROP COLUMN IF EXISTS weight_at_write_off"))
