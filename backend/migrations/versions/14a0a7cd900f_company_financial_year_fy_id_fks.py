"""company_financial_year_fy_id_fks

Revision ID: 14a0a7cd900f
Revises: 839de8e2386a
Create Date: 2026-03-16 18:36:53.181890
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '14a0a7cd900f'
down_revision: Union[str, None] = '839de8e2386a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create new tables first
    op.create_table('company',
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('address', sa.Text(), nullable=True),
    sa.Column('city', sa.String(length=100), nullable=True),
    sa.Column('state', sa.String(length=100), nullable=True),
    sa.Column('pin_code', sa.String(length=10), nullable=True),
    sa.Column('gst_no', sa.String(length=15), nullable=True),
    sa.Column('state_code', sa.String(length=2), nullable=True),
    sa.Column('pan_no', sa.String(length=10), nullable=True),
    sa.Column('phone', sa.String(length=20), nullable=True),
    sa.Column('email', sa.String(length=100), nullable=True),
    sa.Column('logo_url', sa.String(length=500), nullable=True),
    sa.Column('bank_name', sa.String(length=200), nullable=True),
    sa.Column('bank_account', sa.String(length=30), nullable=True),
    sa.Column('bank_ifsc', sa.String(length=11), nullable=True),
    sa.Column('bank_branch', sa.String(length=200), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_company'))
    )
    op.create_table('financial_years',
    sa.Column('code', sa.String(length=20), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=False),
    sa.Column('status', sa.String(length=20), server_default='open', nullable=False),
    sa.Column('is_current', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('closed_by', sa.Uuid(), nullable=True),
    sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['closed_by'], ['users.id'], name=op.f('fk_financial_years_closed_by_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_financial_years')),
    sa.UniqueConstraint('code', name=op.f('uq_financial_years_code'))
    )

    # Add fy_id columns — SQLite: just add column + index, skip FK constraint
    # PostgreSQL will handle FK via batch_alter_table or direct ALTER
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == 'sqlite'

    for table in ['invoices', 'orders', 'rolls', 'supplier_invoices']:
        op.add_column(table, sa.Column('fy_id', sa.Uuid(), nullable=True))
        op.create_index(op.f(f'ix_{table}_fy_id'), table, ['fy_id'], unique=False)
        if not is_sqlite:
            op.create_foreign_key(
                op.f(f'fk_{table}_fy_id_financial_years'),
                table, 'financial_years', ['fy_id'], ['id']
            )

    # ledger_entries already has fy_id column — just add FK if not SQLite
    if not is_sqlite:
        op.create_foreign_key(
            op.f('fk_ledger_entries_fy_id_financial_years'),
            'ledger_entries', 'financial_years', ['fy_id'], ['id']
        )


def downgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == 'sqlite'

    if not is_sqlite:
        op.drop_constraint(op.f('fk_ledger_entries_fy_id_financial_years'), 'ledger_entries', type_='foreignkey')

    for table in ['supplier_invoices', 'rolls', 'orders', 'invoices']:
        if not is_sqlite:
            op.drop_constraint(op.f(f'fk_{table}_fy_id_financial_years'), table, type_='foreignkey')
        op.drop_index(op.f(f'ix_{table}_fy_id'), table_name=table)
        op.drop_column(table, 'fy_id')

    op.drop_table('financial_years')
    op.drop_table('company')
