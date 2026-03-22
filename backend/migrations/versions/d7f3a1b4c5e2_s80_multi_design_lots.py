"""S80: Multi-design lots + batch design_no + lot code with product_type

- Add `designs` JSON column to lots (replaces design_no + default_size_pattern)
- Migrate existing data: copy design_no + default_size_pattern into designs array
- Add `design_no` column to batches, backfill from lot
- Make standard_palla_weight nullable on lots
- Lot code format changes from LOT-XXXX to LT-{PT}-XXXX (new lots only)

Revision ID: d7f3a1b4c5e2
Revises: c6e9f4a3b2d1
"""
from alembic import op
from sqlalchemy import text
from migrations.tenant_utils import get_tenant_schemas, col_exists


revision = "d7f3a1b4c5e2"
down_revision = "c6e9f4a3b2d1"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        # 1. Add `designs` JSON column to lots
        if not col_exists(conn, s, "lots", "designs"):
            conn.execute(text(f"ALTER TABLE {s}.lots ADD COLUMN designs JSON DEFAULT '[]'"))

        # 2. Migrate existing lots: design_no + default_size_pattern → designs array
        conn.execute(text(f"""
            UPDATE {s}.lots
            SET designs = json_build_array(
                json_build_object(
                    'design_no', COALESCE(design_no, ''),
                    'size_pattern', COALESCE(default_size_pattern, '{{}}'::json)
                )
            )
            WHERE designs IS NULL OR designs::text = '[]'
        """))

        # 3. Make standard_palla_weight nullable
        conn.execute(text(f"ALTER TABLE {s}.lots ALTER COLUMN standard_palla_weight DROP NOT NULL"))

        # 4. Add design_no to batches
        if not col_exists(conn, s, "batches", "design_no"):
            conn.execute(text(f"ALTER TABLE {s}.batches ADD COLUMN design_no VARCHAR(50)"))
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{s}_batches_design_no ON {s}.batches (design_no)"))

        # 5. Backfill batch.design_no from lot.design_no for existing batches
        conn.execute(text(f"""
            UPDATE {s}.batches b
            SET design_no = l.design_no
            FROM {s}.lots l
            WHERE b.lot_id = l.id AND b.design_no IS NULL AND l.design_no IS NOT NULL
        """))

        # Note: we do NOT drop design_no or default_size_pattern columns from lots
        # They can be cleaned up in a future migration after verification


def downgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        # Remove designs column from lots
        conn.execute(text(f"ALTER TABLE {s}.lots DROP COLUMN IF EXISTS designs"))

        # Remove design_no from batches
        conn.execute(text(f"DROP INDEX IF EXISTS ix_{s}_batches_design_no"))
        conn.execute(text(f"ALTER TABLE {s}.batches DROP COLUMN IF EXISTS design_no"))

        # Restore NOT NULL on standard_palla_weight
        conn.execute(text(f"ALTER TABLE {s}.lots ALTER COLUMN standard_palla_weight SET NOT NULL"))
