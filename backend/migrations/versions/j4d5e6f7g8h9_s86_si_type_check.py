"""S86: Add CHECK constraint on supplier_invoices.type

Ensures type can only be 'roll_purchase' or 'item_purchase'.
Model already has this constraint for new companies.

Revision ID: j4d5e6f7g8h9
Revises: i3c4d5e6f7g8
"""
from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, constraint_exists

revision = "j4d5e6f7g8h9"
down_revision = "i3c4d5e6f7g8"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        if not constraint_exists(conn, s, "si_valid_type"):
            conn.execute(text(
                f"ALTER TABLE {s}.supplier_invoices "
                f"ADD CONSTRAINT si_valid_type "
                f"CHECK (type IN ('roll_purchase', 'item_purchase'))"
            ))


def downgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        if constraint_exists(conn, s, "si_valid_type"):
            conn.execute(text(
                f"ALTER TABLE {s}.supplier_invoices "
                f"DROP CONSTRAINT si_valid_type"
            ))
