"""s77_fy_id_on_lot_batch_challans

Add fy_id FK + index to lots, batches, job_challans, batch_challans
for FY-scoped counter reset.

Revision ID: a4c7b2e1f3d9
Revises: 3e78791f67a1
Create Date: 2026-03-17 14:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a4c7b2e1f3d9'
down_revision: Union[str, None] = '3e78791f67a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Lots
    op.add_column('lots', sa.Column('fy_id', sa.Uuid(), nullable=True))
    op.create_index('ix_lots_fy_id', 'lots', ['fy_id'])
    op.create_foreign_key('fk_lots_fy_id', 'lots', 'financial_years', ['fy_id'], ['id'])

    # Batches
    op.add_column('batches', sa.Column('fy_id', sa.Uuid(), nullable=True))
    op.create_index('ix_batches_fy_id', 'batches', ['fy_id'])
    op.create_foreign_key('fk_batches_fy_id', 'batches', 'financial_years', ['fy_id'], ['id'])

    # Job Challans
    op.add_column('job_challans', sa.Column('fy_id', sa.Uuid(), nullable=True))
    op.create_index('ix_job_challans_fy_id', 'job_challans', ['fy_id'])
    op.create_foreign_key('fk_job_challans_fy_id', 'job_challans', 'financial_years', ['fy_id'], ['id'])

    # Batch Challans
    op.add_column('batch_challans', sa.Column('fy_id', sa.Uuid(), nullable=True))
    op.create_index('ix_batch_challans_fy_id', 'batch_challans', ['fy_id'])
    op.create_foreign_key('fk_batch_challans_fy_id', 'batch_challans', 'financial_years', ['fy_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_batch_challans_fy_id', 'batch_challans', type_='foreignkey')
    op.drop_index('ix_batch_challans_fy_id', 'batch_challans')
    op.drop_column('batch_challans', 'fy_id')

    op.drop_constraint('fk_job_challans_fy_id', 'job_challans', type_='foreignkey')
    op.drop_index('ix_job_challans_fy_id', 'job_challans')
    op.drop_column('job_challans', 'fy_id')

    op.drop_constraint('fk_batches_fy_id', 'batches', type_='foreignkey')
    op.drop_index('ix_batches_fy_id', 'batches')
    op.drop_column('batches', 'fy_id')

    op.drop_constraint('fk_lots_fy_id', 'lots', type_='foreignkey')
    op.drop_index('ix_lots_fy_id', 'lots')
    op.drop_column('lots', 'fy_id')
