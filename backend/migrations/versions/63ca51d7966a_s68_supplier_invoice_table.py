"""s68_supplier_invoice_table

Revision ID: 63ca51d7966a
Revises: s66_remnant_status
Create Date: 2026-03-12 01:40:50.247197

S68: New supplier_invoices table + FK on rolls.
Stores invoice-level data (GST, sr_no, challan_no) once instead of per-roll.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '63ca51d7966a'
down_revision: Union[str, None] = 's66_remnant_status'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create the new table
    op.create_table('supplier_invoices',
        sa.Column('supplier_id', sa.Uuid(), nullable=True),
        sa.Column('invoice_no', sa.String(length=50), nullable=True),
        sa.Column('challan_no', sa.String(length=50), nullable=True),
        sa.Column('invoice_date', sa.Date(), nullable=True),
        sa.Column('sr_no', sa.String(length=20), nullable=True),
        sa.Column('gst_percent', sa.Numeric(precision=5, scale=2), server_default='0', nullable=False),
        sa.Column('received_by', sa.Uuid(), nullable=True),
        sa.Column('received_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['received_by'], ['users.id'], name=op.f('fk_supplier_invoices_received_by_users')),
        sa.ForeignKeyConstraint(['supplier_id'], ['suppliers.id'], name=op.f('fk_supplier_invoices_supplier_id_suppliers'), ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_supplier_invoices'))
    )
    op.create_index(op.f('ix_supplier_invoices_invoice_no'), 'supplier_invoices', ['invoice_no'], unique=False)
    op.create_index(op.f('ix_supplier_invoices_sr_no'), 'supplier_invoices', ['sr_no'], unique=False)
    op.create_index(op.f('ix_supplier_invoices_supplier_id'), 'supplier_invoices', ['supplier_id'], unique=False)

    # 2. Add FK column on rolls — use batch mode for SQLite compatibility
    with op.batch_alter_table('rolls') as batch_op:
        batch_op.add_column(sa.Column('supplier_invoice_id', sa.Uuid(), nullable=True))
        batch_op.create_index(op.f('ix_rolls_supplier_invoice_id'), ['supplier_invoice_id'], unique=False)
        batch_op.create_foreign_key(
            op.f('fk_rolls_supplier_invoice_id_supplier_invoices'),
            'supplier_invoices', ['supplier_invoice_id'], ['id'], ondelete='SET NULL'
        )


def downgrade() -> None:
    with op.batch_alter_table('rolls') as batch_op:
        batch_op.drop_constraint(op.f('fk_rolls_supplier_invoice_id_supplier_invoices'), type_='foreignkey')
        batch_op.drop_index(op.f('ix_rolls_supplier_invoice_id'))
        batch_op.drop_column('supplier_invoice_id')
    op.drop_index(op.f('ix_supplier_invoices_supplier_id'), table_name='supplier_invoices')
    op.drop_index(op.f('ix_supplier_invoices_sr_no'), table_name='supplier_invoices')
    op.drop_index(op.f('ix_supplier_invoices_invoice_no'), table_name='supplier_invoices')
    op.drop_table('supplier_invoices')
