"""add_product_type_to_lots_and_color_qc_to_batches

Revision ID: a8a7f6a87d98
Revises: b1c2d3e4f5a6
Create Date: 2026-03-03 02:06:14.110655
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a8a7f6a87d98'
down_revision: Union[str, None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLite-safe batch operations
    with op.batch_alter_table('batches') as batch_op:
        batch_op.add_column(sa.Column('color_qc', sa.JSON(), nullable=True))

    with op.batch_alter_table('lots') as batch_op:
        batch_op.add_column(sa.Column('product_type', sa.String(length=10), server_default="'BLS'", nullable=False))


def downgrade() -> None:
    with op.batch_alter_table('lots') as batch_op:
        batch_op.drop_column('product_type')

    with op.batch_alter_table('batches') as batch_op:
        batch_op.drop_column('color_qc')
