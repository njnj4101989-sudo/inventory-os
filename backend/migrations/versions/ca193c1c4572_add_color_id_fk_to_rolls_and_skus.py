"""Add color_id FK to rolls and skus

Revision ID: ca193c1c4572
Revises: a1b2c3d4e5f6
Create Date: 2026-03-16 15:14:48.721186
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.database import is_postgresql


# revision identifiers, used by Alembic.
revision: str = 'ca193c1c4572'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if is_postgresql():
        # PostgreSQL: direct ALTER TABLE
        op.add_column('rolls', sa.Column('color_id', sa.Uuid(), nullable=True))
        op.create_index(op.f('ix_rolls_color_id'), 'rolls', ['color_id'], unique=False)
        op.create_foreign_key(op.f('fk_rolls_color_id_colors'), 'rolls', 'colors', ['color_id'], ['id'], ondelete='RESTRICT')
        op.add_column('skus', sa.Column('color_id', sa.Uuid(), nullable=True))
        op.create_index(op.f('ix_skus_color_id'), 'skus', ['color_id'], unique=False)
        op.create_foreign_key(op.f('fk_skus_color_id_colors'), 'skus', 'colors', ['color_id'], ['id'], ondelete='RESTRICT')
    else:
        # SQLite: batch_alter_table (copy-rename strategy)
        with op.batch_alter_table('rolls') as batch_op:
            batch_op.add_column(sa.Column('color_id', sa.Uuid(), nullable=True))
            batch_op.create_index(op.f('ix_rolls_color_id'), ['color_id'], unique=False)
            batch_op.create_foreign_key(op.f('fk_rolls_color_id_colors'), 'colors', ['color_id'], ['id'], ondelete='RESTRICT')
        with op.batch_alter_table('skus') as batch_op:
            batch_op.add_column(sa.Column('color_id', sa.Uuid(), nullable=True))
            batch_op.create_index(op.f('ix_skus_color_id'), ['color_id'], unique=False)
            batch_op.create_foreign_key(op.f('fk_skus_color_id_colors'), 'colors', ['color_id'], ['id'], ondelete='RESTRICT')


def downgrade() -> None:
    if is_postgresql():
        op.drop_constraint(op.f('fk_skus_color_id_colors'), 'skus', type_='foreignkey')
        op.drop_index(op.f('ix_skus_color_id'), table_name='skus')
        op.drop_column('skus', 'color_id')
        op.drop_constraint(op.f('fk_rolls_color_id_colors'), 'rolls', type_='foreignkey')
        op.drop_index(op.f('ix_rolls_color_id'), table_name='rolls')
        op.drop_column('rolls', 'color_id')
    else:
        with op.batch_alter_table('skus') as batch_op:
            batch_op.drop_constraint(op.f('fk_skus_color_id_colors'), type_='foreignkey')
            batch_op.drop_index(op.f('ix_skus_color_id'))
            batch_op.drop_column('color_id')
        with op.batch_alter_table('rolls') as batch_op:
            batch_op.drop_constraint(op.f('fk_rolls_color_id_colors'), type_='foreignkey')
            batch_op.drop_index(op.f('ix_rolls_color_id'))
            batch_op.drop_column('color_id')
