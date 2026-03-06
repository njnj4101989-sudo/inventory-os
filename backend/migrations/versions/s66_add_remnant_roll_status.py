"""add remnant to roll status check constraint

Revision ID: s66_remnant_status
Revises: s61_db_hardening
Create Date: 2026-03-06

S66: Add 'remnant' to roll status CHECK constraint.
Rolls with remaining weight < palla weight after lot creation get this status.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "s66_remnant_status"
down_revision: Union[str, None] = "75e151b92734"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("valid_status", "rolls", type_="check")
    op.create_check_constraint(
        "valid_status",
        "rolls",
        "status IN ('in_stock', 'sent_for_processing', 'in_cutting', 'remnant')",
    )


def downgrade() -> None:
    op.drop_constraint("valid_status", "rolls", type_="check")
    op.create_check_constraint(
        "valid_status",
        "rolls",
        "status IN ('in_stock', 'sent_for_processing', 'in_cutting')",
    )
