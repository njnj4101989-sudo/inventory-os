"""Add 'cancelled' to CHECK constraints on challan + processing tables

Allows cancellation of sent challans. Updates 4 constraints:
  - jc_valid_status on job_challans
  - bc_valid_status on batch_challans
  - rp_valid_status on roll_processing
  - bp_valid_status on batch_processing

Models already updated for new companies.

Revision ID: h2b3c4d5e6f7
Revises: g1a2b3c4d5e6
"""
from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, constraint_exists

revision = "h2b3c4d5e6f7"
down_revision = "g1a2b3c4d5e6"
branch_labels = None
depends_on = None

# (constraint_name, table, old_values, new_values)
CONSTRAINTS = [
    ("jc_valid_status", "job_challans",
     "('sent', 'partially_received', 'received')",
     "('sent', 'partially_received', 'received', 'cancelled')"),
    ("bc_valid_status", "batch_challans",
     "('sent', 'partially_received', 'received')",
     "('sent', 'partially_received', 'received', 'cancelled')"),
    ("rp_valid_status", "roll_processing",
     "('sent', 'received')",
     "('sent', 'received', 'cancelled')"),
    ("bp_valid_status", "batch_processing",
     "('sent', 'received')",
     "('sent', 'received', 'cancelled')"),
]


def upgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        for cname, table, _old, new in CONSTRAINTS:
            if constraint_exists(conn, s, cname):
                conn.execute(text(f"ALTER TABLE {s}.{table} DROP CONSTRAINT {cname}"))
            conn.execute(text(
                f"ALTER TABLE {s}.{table} "
                f"ADD CONSTRAINT {cname} CHECK (status IN {new})"
            ))


def downgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        for cname, table, old, _new in CONSTRAINTS:
            if constraint_exists(conn, s, cname):
                conn.execute(text(f"ALTER TABLE {s}.{table} DROP CONSTRAINT {cname}"))
            conn.execute(text(
                f"ALTER TABLE {s}.{table} "
                f"ADD CONSTRAINT {cname} CHECK (status IN {old})"
            ))
