"""S99: Add design_id UUID FK to batches and skus tables.

Revision ID: b2c3d4e5f6g7
Revises: z0a1b2c3d4e5
Create Date: 2026-03-31
"""

from alembic import op
from sqlalchemy import text

from migrations.tenant_utils import get_tenant_schemas, col_exists, index_exists

revision = "b2c3d4e5f6g7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        # --- batches.design_id ---
        if not col_exists(conn, s, "batches", "design_id"):
            conn.execute(text(
                f"ALTER TABLE {s}.batches ADD COLUMN design_id UUID"
            ))
            conn.execute(text(
                f"ALTER TABLE {s}.batches ADD CONSTRAINT fk_batches_design_id "
                f"FOREIGN KEY (design_id) REFERENCES {s}.designs(id) ON DELETE RESTRICT"
            ))
        if not index_exists(conn, s, "ix_batches_design_id"):
            conn.execute(text(
                f"CREATE INDEX ix_batches_design_id ON {s}.batches(design_id)"
            ))

        # --- skus.design_id ---
        if not col_exists(conn, s, "skus", "design_id"):
            conn.execute(text(
                f"ALTER TABLE {s}.skus ADD COLUMN design_id UUID"
            ))
            conn.execute(text(
                f"ALTER TABLE {s}.skus ADD CONSTRAINT fk_skus_design_id "
                f"FOREIGN KEY (design_id) REFERENCES {s}.designs(id) ON DELETE RESTRICT"
            ))
        if not index_exists(conn, s, "ix_skus_design_id"):
            conn.execute(text(
                f"CREATE INDEX ix_skus_design_id ON {s}.skus(design_id)"
            ))

        # --- Backfill: match existing design_no values to designs table ---
        # Batches: set design_id from designs.design_no matching batch.design_no
        conn.execute(text(
            f"UPDATE {s}.batches b SET design_id = d.id "
            f"FROM {s}.designs d "
            f"WHERE b.design_no = d.design_no AND b.design_id IS NULL"
        ))

        # SKUs: extract design_no from sku_code (pattern: ProductType-DesignNo-Color-Size)
        # product_name stores design_no for auto-generated SKUs
        conn.execute(text(
            f"UPDATE {s}.skus s SET design_id = d.id "
            f"FROM {s}.designs d "
            f"WHERE s.product_name = d.design_no AND s.design_id IS NULL"
        ))


def downgrade():
    conn = op.get_bind()

    for s in get_tenant_schemas(conn):
        if index_exists(conn, s, "ix_batches_design_id"):
            conn.execute(text(f"DROP INDEX {s}.ix_batches_design_id"))
        if col_exists(conn, s, "batches", "design_id"):
            conn.execute(text(f"ALTER TABLE {s}.batches DROP COLUMN design_id"))

        if index_exists(conn, s, "ix_skus_design_id"):
            conn.execute(text(f"DROP INDEX {s}.ix_skus_design_id"))
        if col_exists(conn, s, "skus", "design_id"):
            conn.execute(text(f"ALTER TABLE {s}.skus DROP COLUMN design_id"))
