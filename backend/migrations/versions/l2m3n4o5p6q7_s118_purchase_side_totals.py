"""S118: Purchase-side totals symmetry.

Adds the full totals stack to SupplierInvoice (was only storing gst_percent;
totals were synthesised on the fly from rolls/purchase_items every read) and
extends ReturnNote with discount_amount + additional_amount so the math
mirrors sales-side (S117) end to end.

  SupplierInvoice  +5 cols: subtotal, discount_amount, additional_amount,
                            tax_amount, total_amount
  ReturnNote       +2 cols: discount_amount, additional_amount

Math (everywhere):
  taxable = subtotal - discount + additional
  tax     = taxable * gst_pct / 100
  total   = taxable + tax

Backfill for SupplierInvoice reproduces the previously-synthesised total
from `rolls.total_weight × rolls.cost_per_unit` + `purchase_items.total_price`,
applies the SI's own gst_percent, and writes subtotal/tax/total. Rows where
subtotal is already populated are skipped (idempotent re-runs).

Revision ID: l2m3n4o5p6q7
Revises: k1l2m3n4o5p6
Create Date: 2026-04-27
"""
from alembic import op
from sqlalchemy import text

from migrations.tenant_utils import col_exists, get_tenant_schemas

revision = "l2m3n4o5p6q7"
down_revision = "k1l2m3n4o5p6"
branch_labels = None
depends_on = None


_SI_COLS = (
    "subtotal",
    "discount_amount",
    "additional_amount",
    "tax_amount",
    "total_amount",
)
_RN_COLS = ("discount_amount", "additional_amount")


def upgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        # SupplierInvoice — 5 columns
        for col in _SI_COLS:
            if not col_exists(conn, s, "supplier_invoices", col):
                conn.execute(
                    text(
                        f"ALTER TABLE {s}.supplier_invoices "
                        f"ADD COLUMN {col} NUMERIC(12, 2) DEFAULT 0 NOT NULL"
                    )
                )

        # ReturnNote — 2 columns
        for col in _RN_COLS:
            if not col_exists(conn, s, "return_notes", col):
                conn.execute(
                    text(
                        f"ALTER TABLE {s}.return_notes "
                        f"ADD COLUMN {col} NUMERIC(12, 2) DEFAULT 0"
                    )
                )

        # Backfill SupplierInvoice from line aggregates. Same math the read
        # path used to do on the fly. Skips already-populated rows.
        conn.execute(text(f"""
            UPDATE {s}.supplier_invoices si
               SET subtotal = sub.line_subtotal,
                   tax_amount = ROUND(
                       (sub.line_subtotal - si.discount_amount + si.additional_amount)
                       * COALESCE(si.gst_percent, 0) / 100, 2
                   ),
                   total_amount = ROUND(
                       (sub.line_subtotal - si.discount_amount + si.additional_amount)
                       * (1 + COALESCE(si.gst_percent, 0) / 100), 2
                   )
              FROM (
                  SELECT si2.id AS si_id,
                         COALESCE(roll_sum.s, 0) + COALESCE(item_sum.s, 0) AS line_subtotal
                    FROM {s}.supplier_invoices si2
                    LEFT JOIN (
                        SELECT supplier_invoice_id,
                               SUM(total_weight * COALESCE(cost_per_unit, 0)) AS s
                          FROM {s}.rolls
                         WHERE supplier_invoice_id IS NOT NULL
                         GROUP BY supplier_invoice_id
                    ) roll_sum ON roll_sum.supplier_invoice_id = si2.id
                    LEFT JOIN (
                        SELECT supplier_invoice_id, SUM(total_price) AS s
                          FROM {s}.purchase_items
                         GROUP BY supplier_invoice_id
                    ) item_sum ON item_sum.supplier_invoice_id = si2.id
              ) sub
             WHERE si.id = sub.si_id
               AND COALESCE(si.subtotal, 0) = 0
        """))


def downgrade():
    conn = op.get_bind()
    for s in get_tenant_schemas(conn):
        for col in _SI_COLS:
            conn.execute(
                text(f"ALTER TABLE {s}.supplier_invoices DROP COLUMN IF EXISTS {col}")
            )
        for col in _RN_COLS:
            conn.execute(
                text(f"ALTER TABLE {s}.return_notes DROP COLUMN IF EXISTS {col}")
            )
