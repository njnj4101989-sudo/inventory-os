"""add_current_weight_to_rolls

Revision ID: a7b2c3d4e5f6
Revises: f3a8b1c2d4e5
Create Date: 2026-02-19 23:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7b2c3d4e5f6'
down_revision: Union[str, None] = 'f3a8b1c2d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Step 1: Add current_weight column (nullable initially for backfill)
    with op.batch_alter_table('rolls') as batch_op:
        batch_op.add_column(
            sa.Column('current_weight', sa.Numeric(10, 3), nullable=True)
        )

    # Step 2: Backfill — default current_weight = total_weight (original supplier weight)
    conn = op.get_bind()
    conn.execute(
        sa.text("UPDATE rolls SET current_weight = total_weight WHERE current_weight IS NULL")
    )

    # Step 3: For rolls that have received processing logs, use the latest weight_after
    # This handles rolls that already went through VA before this migration
    conn.execute(
        sa.text("""
            UPDATE rolls SET current_weight = (
                SELECT rp.weight_after
                FROM roll_processing rp
                WHERE rp.roll_id = rolls.id
                  AND rp.status = 'received'
                  AND rp.weight_after IS NOT NULL
                ORDER BY rp.received_date DESC, rp.created_at DESC
                LIMIT 1
            )
            WHERE EXISTS (
                SELECT 1 FROM roll_processing rp
                WHERE rp.roll_id = rolls.id
                  AND rp.status = 'received'
                  AND rp.weight_after IS NOT NULL
            )
        """)
    )

    # Step 4: Make NOT NULL now that all rows are backfilled
    with op.batch_alter_table('rolls') as batch_op:
        batch_op.alter_column(
            'current_weight',
            existing_type=sa.Numeric(10, 3),
            nullable=False,
        )


def downgrade() -> None:
    # Restore total_weight from current_weight for rolls that had VA processing
    # (undo the separation — put current weight back into total_weight)
    conn = op.get_bind()
    conn.execute(
        sa.text("UPDATE rolls SET total_weight = current_weight WHERE total_weight != current_weight")
    )

    with op.batch_alter_table('rolls') as batch_op:
        batch_op.drop_column('current_weight')
