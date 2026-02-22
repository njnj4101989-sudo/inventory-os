"""add_job_challans_table_and_fk_on_roll_processing

Revision ID: ff960137e0bc
Revises: a7b2c3d4e5f6
Create Date: 2026-02-22 11:10:52.776869
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ff960137e0bc'
down_revision: Union[str, None] = 'a7b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create job_challans table
    op.create_table('job_challans',
    sa.Column('challan_no', sa.String(length=30), nullable=False),
    sa.Column('value_addition_id', sa.Uuid(), nullable=False),
    sa.Column('vendor_name', sa.String(length=200), nullable=False),
    sa.Column('vendor_phone', sa.String(length=20), nullable=True),
    sa.Column('sent_date', sa.Date(), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_by_id', sa.Uuid(), nullable=False),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name=op.f('fk_job_challans_created_by_id_users')),
    sa.ForeignKeyConstraint(['value_addition_id'], ['value_additions.id'], name=op.f('fk_job_challans_value_addition_id_value_additions')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_job_challans'))
    )
    op.create_index(op.f('ix_job_challans_challan_no'), 'job_challans', ['challan_no'], unique=True)

    # Add job_challan_id FK on roll_processing (SQLite needs batch mode)
    with op.batch_alter_table('roll_processing') as batch_op:
        batch_op.add_column(sa.Column('job_challan_id', sa.Uuid(), nullable=True))
        batch_op.create_foreign_key(
            op.f('fk_roll_processing_job_challan_id_job_challans'),
            'job_challans', ['job_challan_id'], ['id']
        )


def downgrade() -> None:
    with op.batch_alter_table('roll_processing') as batch_op:
        batch_op.drop_constraint(op.f('fk_roll_processing_job_challan_id_job_challans'), type_='foreignkey')
        batch_op.drop_column('job_challan_id')
    op.drop_index(op.f('ix_job_challans_challan_no'), table_name='job_challans')
    op.drop_table('job_challans')
