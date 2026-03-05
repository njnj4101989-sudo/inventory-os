"""add indexes checks ondelete constraints

Revision ID: s61_db_hardening
Revises:
Create Date: 2026-03-06

S61: Fix all 26 Phase 1 DB audit findings.
- 14 indexes on FK/filter columns
- 4 CHECK constraints (weight, status values, quantity)
- 3 ondelete rules (RESTRICT/CASCADE)
- 1 column widen (roll_code 50->80)

Target: PostgreSQL production. For SQLite dev, delete inventory_os.db and restart.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "s61_db_hardening"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── CRITICAL: Indexes on rolls (hottest table) ──
    op.create_index("ix_rolls_status", "rolls", ["status"])
    op.create_index("ix_rolls_supplier_invoice_no", "rolls", ["supplier_invoice_no"])
    op.create_index("ix_rolls_supplier_id", "rolls", ["supplier_id"])

    # ── CRITICAL: Weight must be positive ──
    op.create_check_constraint("ck_rolls_positive_weight", "rolls", "total_weight > 0")

    # ── HIGH: Roll status CHECK ──
    op.create_check_constraint(
        "ck_rolls_valid_status", "rolls",
        "status IN ('in_stock', 'sent_for_processing', 'in_cutting')"
    )

    # ── HIGH: sr_no index (label printing filter) ──
    op.create_index("ix_rolls_sr_no", "rolls", ["sr_no"])

    # ── HIGH: Batch status CHECK (7-state machine) ──
    op.create_check_constraint(
        "ck_batches_valid_status", "batches",
        "status IN ('created', 'assigned', 'in_progress', 'submitted', 'checked', 'packing', 'packed')"
    )

    # ── HIGH: Lot status CHECK ──
    op.create_check_constraint(
        "ck_lots_valid_status", "lots",
        "status IN ('open', 'cutting', 'distributed')"
    )

    # ── HIGH: FK ondelete rules ──
    # Roll.supplier_id -> RESTRICT (can't delete supplier with rolls)
    op.drop_constraint("fk_rolls_supplier_id_suppliers", "rolls", type_="foreignkey")
    op.create_foreign_key(
        "fk_rolls_supplier_id_suppliers", "rolls", "suppliers",
        ["supplier_id"], ["id"], ondelete="RESTRICT"
    )

    # LotRoll.lot_id -> CASCADE (delete lot -> delete lot_rolls)
    op.drop_constraint("fk_lot_rolls_lot_id_lots", "lot_rolls", type_="foreignkey")
    op.create_foreign_key(
        "fk_lot_rolls_lot_id_lots", "lot_rolls", "lots",
        ["lot_id"], ["id"], ondelete="CASCADE"
    )

    # LotRoll.roll_id -> RESTRICT (can't delete roll while in lot)
    op.drop_constraint("fk_lot_rolls_roll_id_rolls", "lot_rolls", type_="foreignkey")
    op.create_foreign_key(
        "fk_lot_rolls_roll_id_rolls", "lot_rolls", "rolls",
        ["roll_id"], ["id"], ondelete="RESTRICT"
    )

    # Batch.lot_id -> RESTRICT (can't delete lot with batches)
    op.drop_constraint("fk_batches_lot_id_lots", "batches", type_="foreignkey")
    op.create_foreign_key(
        "fk_batches_lot_id_lots", "batches", "lots",
        ["lot_id"], ["id"], ondelete="RESTRICT"
    )

    # ── MEDIUM: FK indexes for join performance ──
    op.create_index("ix_roll_processing_roll_id", "roll_processing", ["roll_id"])
    op.create_index("ix_roll_processing_job_challan_id", "roll_processing", ["job_challan_id"])
    op.create_index("ix_batch_assignments_batch_id", "batch_assignments", ["batch_id"])
    op.create_index("ix_batch_assignments_tailor_id", "batch_assignments", ["tailor_id"])
    op.create_index("ix_batch_roll_consumption_batch_id", "batch_roll_consumption", ["batch_id"])
    op.create_index("ix_batch_roll_consumption_roll_id", "batch_roll_consumption", ["roll_id"])
    op.create_index("ix_orders_source", "orders", ["source"])
    op.create_index("ix_order_items_order_id", "order_items", ["order_id"])
    op.create_index("ix_order_items_sku_id", "order_items", ["sku_id"])

    # ── MEDIUM: Quantity checks ──
    op.create_check_constraint("ck_batches_positive_quantity", "batches", "quantity > 0")
    op.create_check_constraint(
        "ck_batch_processing_positive_pieces", "batch_processing", "pieces_sent > 0"
    )

    # ── LOW: More FK indexes ──
    op.create_index("ix_invoices_order_id", "invoices", ["order_id"])
    op.create_index("ix_invoice_items_invoice_id", "invoice_items", ["invoice_id"])
    op.create_index("ix_inventory_events_roll_id", "inventory_events", ["roll_id"])

    # ── LOW: Widen roll_code for VA suffixes (50 -> 80) ──
    op.alter_column(
        "rolls", "roll_code",
        existing_type=sa.String(50),
        type_=sa.String(80),
    )


def downgrade() -> None:
    # Roll back column widen
    op.alter_column(
        "rolls", "roll_code",
        existing_type=sa.String(80),
        type_=sa.String(50),
    )

    # Drop LOW indexes
    op.drop_index("ix_inventory_events_roll_id", "inventory_events")
    op.drop_index("ix_invoice_items_invoice_id", "invoice_items")
    op.drop_index("ix_invoices_order_id", "invoices")

    # Drop MEDIUM checks
    op.drop_constraint("ck_batch_processing_positive_pieces", "batch_processing", type_="check")
    op.drop_constraint("ck_batches_positive_quantity", "batches", type_="check")

    # Drop MEDIUM indexes
    op.drop_index("ix_order_items_sku_id", "order_items")
    op.drop_index("ix_order_items_order_id", "order_items")
    op.drop_index("ix_orders_source", "orders")
    op.drop_index("ix_batch_roll_consumption_roll_id", "batch_roll_consumption")
    op.drop_index("ix_batch_roll_consumption_batch_id", "batch_roll_consumption")
    op.drop_index("ix_batch_assignments_tailor_id", "batch_assignments")
    op.drop_index("ix_batch_assignments_batch_id", "batch_assignments")
    op.drop_index("ix_roll_processing_job_challan_id", "roll_processing")
    op.drop_index("ix_roll_processing_roll_id", "roll_processing")

    # Restore original FKs (no ondelete)
    op.drop_constraint("fk_batches_lot_id_lots", "batches", type_="foreignkey")
    op.create_foreign_key("fk_batches_lot_id_lots", "batches", "lots", ["lot_id"], ["id"])

    op.drop_constraint("fk_lot_rolls_roll_id_rolls", "lot_rolls", type_="foreignkey")
    op.create_foreign_key("fk_lot_rolls_roll_id_rolls", "lot_rolls", "rolls", ["roll_id"], ["id"])

    op.drop_constraint("fk_lot_rolls_lot_id_lots", "lot_rolls", type_="foreignkey")
    op.create_foreign_key("fk_lot_rolls_lot_id_lots", "lot_rolls", "lots", ["lot_id"], ["id"])

    op.drop_constraint("fk_rolls_supplier_id_suppliers", "rolls", type_="foreignkey")
    op.create_foreign_key("fk_rolls_supplier_id_suppliers", "rolls", "suppliers", ["supplier_id"], ["id"])

    # Drop HIGH checks
    op.drop_constraint("ck_lots_valid_status", "lots", type_="check")
    op.drop_constraint("ck_batches_valid_status", "batches", type_="check")

    # Drop HIGH/CRITICAL
    op.drop_index("ix_rolls_sr_no", "rolls")
    op.drop_constraint("ck_rolls_valid_status", "rolls", type_="check")
    op.drop_constraint("ck_rolls_positive_weight", "rolls", type_="check")
    op.drop_index("ix_rolls_supplier_id", "rolls")
    op.drop_index("ix_rolls_supplier_invoice_no", "rolls")
    op.drop_index("ix_rolls_status", "rolls")
