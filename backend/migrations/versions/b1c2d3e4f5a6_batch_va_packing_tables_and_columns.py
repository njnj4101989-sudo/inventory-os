"""batch_va_packing_tables_and_columns

Create batch_challans + batch_processing tables.
Add packing columns to batches (checked_by, packed_by, packed_at, pack_reference).
Add applicable_to column to value_additions.
Migrate batches.status 'completed' → 'checked'.

Revision ID: b1c2d3e4f5a6
Revises: 259d2dcafe7b
Create Date: 2026-03-03 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = '259d2dcafe7b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- 1. Create batch_challans table ---
    op.create_table('batch_challans',
        sa.Column('challan_no', sa.String(length=30), nullable=False),
        sa.Column('processor_name', sa.String(length=200), nullable=False),
        sa.Column('value_addition_id', sa.Uuid(), nullable=False),
        sa.Column('total_pieces', sa.Integer(), server_default='0', nullable=False),
        sa.Column('total_cost', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('sent_date', sa.Date(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('received_date', sa.Date(), nullable=True),
        sa.Column('status', sa.String(length=20), server_default="'sent'", nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by_id', sa.Uuid(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name=op.f('fk_batch_challans_created_by_id_users')),
        sa.ForeignKeyConstraint(['value_addition_id'], ['value_additions.id'], name=op.f('fk_batch_challans_value_addition_id_value_additions')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_batch_challans')),
    )
    op.create_index(op.f('ix_batch_challans_challan_no'), 'batch_challans', ['challan_no'], unique=True)
    op.create_index(op.f('ix_batch_challans_status'), 'batch_challans', ['status'], unique=False)
    op.create_index(op.f('ix_batch_challans_value_addition_id'), 'batch_challans', ['value_addition_id'], unique=False)

    # --- 2. Create batch_processing table ---
    op.create_table('batch_processing',
        sa.Column('batch_id', sa.Uuid(), nullable=False),
        sa.Column('batch_challan_id', sa.Uuid(), nullable=False),
        sa.Column('value_addition_id', sa.Uuid(), nullable=False),
        sa.Column('pieces_sent', sa.Integer(), nullable=False),
        sa.Column('pieces_received', sa.Integer(), nullable=True),
        sa.Column('cost', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('status', sa.String(length=20), server_default="'sent'", nullable=False),
        sa.Column('phase', sa.String(length=20), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by_id', sa.Uuid(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['batch_id'], ['batches.id'], name=op.f('fk_batch_processing_batch_id_batches')),
        sa.ForeignKeyConstraint(['batch_challan_id'], ['batch_challans.id'], name=op.f('fk_batch_processing_batch_challan_id_batch_challans')),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name=op.f('fk_batch_processing_created_by_id_users')),
        sa.ForeignKeyConstraint(['value_addition_id'], ['value_additions.id'], name=op.f('fk_batch_processing_value_addition_id_value_additions')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_batch_processing')),
    )
    op.create_index(op.f('ix_batch_processing_batch_id'), 'batch_processing', ['batch_id'], unique=False)
    op.create_index(op.f('ix_batch_processing_batch_challan_id'), 'batch_processing', ['batch_challan_id'], unique=False)
    op.create_index(op.f('ix_batch_processing_value_addition_id'), 'batch_processing', ['value_addition_id'], unique=False)
    op.create_index(op.f('ix_batch_processing_status'), 'batch_processing', ['status'], unique=False)

    # --- 3. Add packing columns to batches (SQLite needs batch_alter_table) ---
    with op.batch_alter_table('batches') as batch_op:
        batch_op.add_column(sa.Column('checked_by', sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column('packed_by', sa.Uuid(), nullable=True))
        batch_op.add_column(sa.Column('packed_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('pack_reference', sa.String(length=50), nullable=True))
        batch_op.create_foreign_key(
            op.f('fk_batches_checked_by_users'), 'users', ['checked_by'], ['id']
        )
        batch_op.create_foreign_key(
            op.f('fk_batches_packed_by_users'), 'users', ['packed_by'], ['id']
        )

    # --- 4. Add applicable_to to value_additions ---
    with op.batch_alter_table('value_additions') as batch_op:
        batch_op.add_column(
            sa.Column('applicable_to', sa.String(length=20), server_default="'both'", nullable=False)
        )

    # --- 5. Migrate batches.status 'completed' → 'checked' ---
    op.execute("UPDATE batches SET status = 'checked' WHERE status = 'completed'")


def downgrade() -> None:
    # Reverse status migration
    op.execute("UPDATE batches SET status = 'completed' WHERE status = 'checked'")

    # Drop applicable_to from value_additions
    with op.batch_alter_table('value_additions') as batch_op:
        batch_op.drop_column('applicable_to')

    # Drop packing columns from batches
    with op.batch_alter_table('batches') as batch_op:
        batch_op.drop_constraint(op.f('fk_batches_packed_by_users'), type_='foreignkey')
        batch_op.drop_constraint(op.f('fk_batches_checked_by_users'), type_='foreignkey')
        batch_op.drop_column('pack_reference')
        batch_op.drop_column('packed_at')
        batch_op.drop_column('packed_by')
        batch_op.drop_column('checked_by')

    # Drop batch_processing
    op.drop_index(op.f('ix_batch_processing_status'), table_name='batch_processing')
    op.drop_index(op.f('ix_batch_processing_value_addition_id'), table_name='batch_processing')
    op.drop_index(op.f('ix_batch_processing_batch_challan_id'), table_name='batch_processing')
    op.drop_index(op.f('ix_batch_processing_batch_id'), table_name='batch_processing')
    op.drop_table('batch_processing')

    # Drop batch_challans
    op.drop_index(op.f('ix_batch_challans_value_addition_id'), table_name='batch_challans')
    op.drop_index(op.f('ix_batch_challans_status'), table_name='batch_challans')
    op.drop_index(op.f('ix_batch_challans_challan_no'), table_name='batch_challans')
    op.drop_table('batch_challans')
