"""S121: VA challan totals symmetry.

Brings JobChallan + BatchChallan into the same totals stack as Order /
Invoice / SupplierInvoice / ReturnNote so every financial document in the
system carries identical math:

  taxable = subtotal - discount + additional
  tax     = taxable * gst_pct / 100
  total   = taxable + tax

Schema changes:
  job_challans    +6 cols: gst_percent, subtotal, discount_amount,
                          additional_amount, tax_amount, total_amount
  batch_challans  +6 cols: same as above
                  -1 col : total_cost (legacy flat field, superseded)

Backfill:
  job_challans.subtotal   = SUM(processing_logs.processing_cost where status='received')
  batch_challans.subtotal = SUM(batch_items.cost where status='received')
                            (or carries old total_cost if subtotal is 0)
  Then: taxable = subtotal - 0 + 0 = subtotal
        tax_amount = 0 (gst_percent default 0 — historical challans had no GST tracking)
        total_amount = subtotal

Idempotent via `COALESCE(subtotal, 0) = 0` skip — safe to re-run.

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-04-27
"""
from alembic import op
from sqlalchemy import text

from migrations.tenant_utils import col_exists, get_tenant_schemas

revision = "n4o5p6q7r8s9"
down_revision = "m3n4o5p6q7r8"
branch_labels = None
depends_on = None


_TOTALS_COLS = (
    ("gst_percent", "NUMERIC(5, 2) DEFAULT 0 NOT NULL"),
    ("subtotal", "NUMERIC(12, 2) DEFAULT 0 NOT NULL"),
    ("discount_amount", "NUMERIC(12, 2) DEFAULT 0 NOT NULL"),
    ("additional_amount", "NUMERIC(12, 2) DEFAULT 0 NOT NULL"),
    ("tax_amount", "NUMERIC(12, 2) DEFAULT 0 NOT NULL"),
    ("total_amount", "NUMERIC(12, 2) DEFAULT 0 NOT NULL"),
)


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        # 1. Add 6 totals cols on both challan tables
        for table in ("job_challans", "batch_challans"):
            for col, ddl in _TOTALS_COLS:
                if not col_exists(conn, s, table, col):
                    conn.execute(text(
                        f"ALTER TABLE {s}.{table} ADD COLUMN {col} {ddl}"
                    ))

        # 2. Backfill JobChallan.subtotal from received processing logs.
        # Same math the read path used to do on the fly.
        conn.execute(text(f"""
            UPDATE {s}.job_challans jc
               SET subtotal = COALESCE(sub.s, 0),
                   total_amount = COALESCE(sub.s, 0)
              FROM (
                  SELECT job_challan_id,
                         SUM(COALESCE(processing_cost, 0)) AS s
                    FROM {s}.roll_processing
                   WHERE status = 'received'
                     AND job_challan_id IS NOT NULL
                   GROUP BY job_challan_id
              ) sub
             WHERE jc.id = sub.job_challan_id
               AND COALESCE(jc.subtotal, 0) = 0
        """))

        # 3. Backfill BatchChallan.subtotal — first try from batch_processing.cost,
        # then fall back to old total_cost if it's still around.
        conn.execute(text(f"""
            UPDATE {s}.batch_challans bc
               SET subtotal = COALESCE(sub.s, 0),
                   total_amount = COALESCE(sub.s, 0)
              FROM (
                  SELECT batch_challan_id,
                         SUM(COALESCE(cost, 0)) AS s
                    FROM {s}.batch_processing
                   WHERE status = 'received'
                     AND batch_challan_id IS NOT NULL
                   GROUP BY batch_challan_id
              ) sub
             WHERE bc.id = sub.batch_challan_id
               AND COALESCE(bc.subtotal, 0) = 0
        """))

        # 3b. For batch_challans where line-level cost was never populated but
        # the legacy aggregate `total_cost` was, carry that forward so we don't
        # lose history. Only runs if total_cost column still exists.
        if col_exists(conn, s, "batch_challans", "total_cost"):
            conn.execute(text(f"""
                UPDATE {s}.batch_challans
                   SET subtotal = COALESCE(total_cost, 0),
                       total_amount = COALESCE(total_cost, 0)
                 WHERE COALESCE(subtotal, 0) = 0
                   AND COALESCE(total_cost, 0) > 0
            """))

        # 4. Drop legacy flat total_cost from batch_challans (superseded by stack)
        if col_exists(conn, s, "batch_challans", "total_cost"):
            conn.execute(text(
                f"ALTER TABLE {s}.batch_challans DROP COLUMN total_cost"
            ))


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        # Restore total_cost as a nullable column (data lost — best-effort restore from total_amount)
        if not col_exists(conn, s, "batch_challans", "total_cost"):
            conn.execute(text(
                f"ALTER TABLE {s}.batch_challans ADD COLUMN total_cost NUMERIC(10, 2)"
            ))
            conn.execute(text(
                f"UPDATE {s}.batch_challans SET total_cost = total_amount WHERE total_amount > 0"
            ))

        for table in ("job_challans", "batch_challans"):
            for col, _ in _TOTALS_COLS:
                conn.execute(text(
                    f"ALTER TABLE {s}.{table} DROP COLUMN IF EXISTS {col}"
                ))
