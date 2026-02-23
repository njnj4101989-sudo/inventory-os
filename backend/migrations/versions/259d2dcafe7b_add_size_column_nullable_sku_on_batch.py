"""add_size_column_nullable_sku_on_batch

Revision ID: 259d2dcafe7b
Revises: c084d85a14ff
Create Date: 2026-02-24 01:32:23.348757
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '259d2dcafe7b'
down_revision: Union[str, None] = 'c084d85a14ff'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add size column
    op.add_column('batches', sa.Column('size', sa.String(length=20), nullable=True))
    op.create_index(op.f('ix_batches_size'), 'batches', ['size'], unique=False)

    # Make sku_id nullable (SQLite needs batch_alter_table)
    with op.batch_alter_table('batches') as batch_op:
        batch_op.alter_column('sku_id', existing_type=sa.CHAR(length=32), nullable=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_batches_size'), table_name='batches')
    with op.batch_alter_table('batches') as batch_op:
        batch_op.alter_column('sku_id', existing_type=sa.CHAR(length=32), nullable=False)
    op.drop_column('batches', 'size')
