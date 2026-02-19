"""drop_process_type_require_value_addition_id

Revision ID: f3a8b1c2d4e5
Revises: eef26a6af67d
Create Date: 2026-02-19 20:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3a8b1c2d4e5'
down_revision: Union[str, None] = 'eef26a6af67d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # For existing rows with NULL value_addition_id, we need to set a default.
    # Use the first value_addition (EMB by convention) as fallback.
    conn = op.get_bind()
    fallback = conn.execute(
        sa.text("SELECT id FROM value_additions ORDER BY created_at LIMIT 1")
    ).scalar()

    if fallback:
        conn.execute(
            sa.text(
                "UPDATE roll_processing SET value_addition_id = :va_id "
                "WHERE value_addition_id IS NULL"
            ),
            {"va_id": str(fallback)},
        )

    # SQLite requires batch mode for column drops and NOT NULL changes
    with op.batch_alter_table('roll_processing') as batch_op:
        batch_op.drop_column('process_type')
        batch_op.alter_column(
            'value_addition_id',
            existing_type=sa.Uuid(),
            nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table('roll_processing') as batch_op:
        batch_op.add_column(
            sa.Column('process_type', sa.String(length=50), nullable=True)
        )
        batch_op.alter_column(
            'value_addition_id',
            existing_type=sa.Uuid(),
            nullable=True,
        )
    # Backfill process_type from value_addition name for reversibility
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE roll_processing SET process_type = "
            "(SELECT LOWER(va.short_code) FROM value_additions va "
            "WHERE va.id = roll_processing.value_addition_id) "
            "WHERE process_type IS NULL"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE roll_processing SET process_type = 'other' "
            "WHERE process_type IS NULL"
        )
    )
