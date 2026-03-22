"""Add CHECK constraint on product_types.palla_mode

Ensures palla_mode can only be 'weight', 'meter', or 'both'.
Model already has this constraint for new companies.

Revision ID: g1a2b3c4d5e6
Revises: f9b5c3d7e2a4
"""
from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, constraint_exists

revision = "g1a2b3c4d5e6"
down_revision = "f9b5c3d7e2a4"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        if not constraint_exists(conn, s, "valid_palla_mode"):
            conn.execute(text(
                f"ALTER TABLE {s}.product_types "
                f"ADD CONSTRAINT valid_palla_mode "
                f"CHECK (palla_mode IN ('weight', 'meter', 'both'))"
            ))


def downgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        if constraint_exists(conn, s, "valid_palla_mode"):
            conn.execute(text(
                f"ALTER TABLE {s}.product_types "
                f"DROP CONSTRAINT valid_palla_mode"
            ))
