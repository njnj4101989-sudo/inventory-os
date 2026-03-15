"""s71_job_challan_status_received_date

Revision ID: a1b2c3d4e5f6
Revises: 9f88c9ee7c04
Create Date: 2026-03-15

Add status and received_date columns to job_challans table.
Existing rows get status='sent' via server_default.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '9f88c9ee7c04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('job_challans') as batch_op:
        batch_op.add_column(
            sa.Column('status', sa.String(20), nullable=False, server_default='sent')
        )
        batch_op.add_column(
            sa.Column('received_date', sa.Date(), nullable=True)
        )
        batch_op.create_index(
            op.f('ix_job_challans_status'), ['status'], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table('job_challans') as batch_op:
        batch_op.drop_index(op.f('ix_job_challans_status'))
        batch_op.drop_column('received_date')
        batch_op.drop_column('status')
