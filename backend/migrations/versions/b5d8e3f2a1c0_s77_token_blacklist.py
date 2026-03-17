"""s77_token_blacklist

Add public.token_blacklist table for JWT invalidation on logout.

Revision ID: b5d8e3f2a1c0
Revises: a4c7b2e1f3d9
Create Date: 2026-03-17 15:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b5d8e3f2a1c0'
down_revision: Union[str, None] = 'a4c7b2e1f3d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'token_blacklist',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('jti', sa.String(36), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('token_type', sa.String(10), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('blacklisted_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['public.users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('jti'),
        schema='public',
    )
    op.create_index('ix_token_blacklist_jti', 'token_blacklist', ['jti'], schema='public')
    op.create_index('ix_token_blacklist_expires_at', 'token_blacklist', ['expires_at'], schema='public')


def downgrade() -> None:
    op.drop_index('ix_token_blacklist_expires_at', 'token_blacklist', schema='public')
    op.drop_index('ix_token_blacklist_jti', 'token_blacklist', schema='public')
    op.drop_table('token_blacklist', schema='public')
