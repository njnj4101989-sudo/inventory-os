"""merge_s68_and_s63_heads

Revision ID: 028398385d86
Revises: 63ca51d7966a, 75e151b92734
Create Date: 2026-03-11 20:40:32.330149
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '028398385d86'
down_revision: Union[str, None] = ('63ca51d7966a', '75e151b92734')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
