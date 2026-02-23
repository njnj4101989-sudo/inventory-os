"""add_standard_palla_meter_to_lots

Revision ID: c084d85a14ff
Revises: ff960137e0bc
Create Date: 2026-02-23 18:09:38.723865
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c084d85a14ff'
down_revision: Union[str, None] = 'ff960137e0bc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('lots') as batch_op:
        batch_op.add_column(sa.Column('standard_palla_meter', sa.Numeric(precision=10, scale=3), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('lots') as batch_op:
        batch_op.drop_column('standard_palla_meter')
