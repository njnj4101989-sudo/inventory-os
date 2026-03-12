"""s69_va_party_fk_on_challans

Revision ID: 9f88c9ee7c04
Revises: e86e3462e90c
Create Date: 2026-03-12 18:36:26.773894

Replace vendor_name/processor_name text fields with va_party_id FK
on job_challans, batch_challans, and roll_processing.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9f88c9ee7c04'
down_revision: Union[str, None] = 'e86e3462e90c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # batch_challans: add va_party_id, drop processor_name
    with op.batch_alter_table('batch_challans') as batch_op:
        batch_op.add_column(sa.Column('va_party_id', sa.Uuid(), nullable=True))
        batch_op.create_index(op.f('ix_batch_challans_va_party_id'), ['va_party_id'], unique=False)
        batch_op.create_foreign_key(
            op.f('fk_batch_challans_va_party_id_va_parties'),
            'va_parties', ['va_party_id'], ['id']
        )
        batch_op.drop_column('processor_name')

    # job_challans: add va_party_id, drop vendor_name + vendor_phone
    with op.batch_alter_table('job_challans') as batch_op:
        batch_op.add_column(sa.Column('va_party_id', sa.Uuid(), nullable=True))
        batch_op.create_index(op.f('ix_job_challans_va_party_id'), ['va_party_id'], unique=False)
        batch_op.create_foreign_key(
            op.f('fk_job_challans_va_party_id_va_parties'),
            'va_parties', ['va_party_id'], ['id']
        )
        batch_op.drop_column('vendor_phone')
        batch_op.drop_column('vendor_name')

    # roll_processing: add va_party_id, drop vendor_name + vendor_phone
    with op.batch_alter_table('roll_processing') as batch_op:
        batch_op.add_column(sa.Column('va_party_id', sa.Uuid(), nullable=True))
        batch_op.create_index(op.f('ix_roll_processing_va_party_id'), ['va_party_id'], unique=False)
        batch_op.create_foreign_key(
            op.f('fk_roll_processing_va_party_id_va_parties'),
            'va_parties', ['va_party_id'], ['id']
        )
        batch_op.drop_column('vendor_phone')
        batch_op.drop_column('vendor_name')


def downgrade() -> None:
    with op.batch_alter_table('roll_processing') as batch_op:
        batch_op.add_column(sa.Column('vendor_name', sa.VARCHAR(length=200), nullable=True))
        batch_op.add_column(sa.Column('vendor_phone', sa.VARCHAR(length=20), nullable=True))
        batch_op.drop_constraint(op.f('fk_roll_processing_va_party_id_va_parties'), type_='foreignkey')
        batch_op.drop_index(op.f('ix_roll_processing_va_party_id'))
        batch_op.drop_column('va_party_id')

    with op.batch_alter_table('job_challans') as batch_op:
        batch_op.add_column(sa.Column('vendor_name', sa.VARCHAR(length=200), nullable=True))
        batch_op.add_column(sa.Column('vendor_phone', sa.VARCHAR(length=20), nullable=True))
        batch_op.drop_constraint(op.f('fk_job_challans_va_party_id_va_parties'), type_='foreignkey')
        batch_op.drop_index(op.f('ix_job_challans_va_party_id'))
        batch_op.drop_column('va_party_id')

    with op.batch_alter_table('batch_challans') as batch_op:
        batch_op.add_column(sa.Column('processor_name', sa.VARCHAR(length=200), nullable=True))
        batch_op.drop_constraint(op.f('fk_batch_challans_va_party_id_va_parties'), type_='foreignkey')
        batch_op.drop_index(op.f('ix_batch_challans_va_party_id'))
        batch_op.drop_column('va_party_id')
