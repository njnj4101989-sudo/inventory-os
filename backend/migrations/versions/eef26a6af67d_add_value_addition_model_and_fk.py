"""add_value_addition_model_and_fk

Revision ID: eef26a6af67d
Revises: 2a1bf32421db
Create Date: 2026-02-19 16:02:08.939754
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'eef26a6af67d'
down_revision: Union[str, None] = '2a1bf32421db'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create new table
    op.create_table('value_additions',
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('short_code', sa.String(length=4), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('is_active', sa.Boolean(), server_default='1', nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_value_additions'))
    )
    op.create_index(op.f('ix_value_additions_short_code'), 'value_additions', ['short_code'], unique=True)

    # SQLite: use batch mode for ALTER TABLE with FK
    with op.batch_alter_table('roll_processing') as batch_op:
        batch_op.add_column(sa.Column('value_addition_id', sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            op.f('fk_roll_processing_value_addition_id_value_additions'),
            'value_additions', ['value_addition_id'], ['id']
        )


def downgrade() -> None:
    with op.batch_alter_table('roll_processing') as batch_op:
        batch_op.drop_constraint(op.f('fk_roll_processing_value_addition_id_value_additions'), type_='foreignkey')
        batch_op.drop_column('value_addition_id')
    op.drop_index(op.f('ix_value_additions_short_code'), table_name='value_additions')
    op.drop_table('value_additions')
