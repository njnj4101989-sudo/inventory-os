"""PaymentAllocation — bill-wise allocation lines for a PaymentReceipt.

One row per (receipt × bill) saying "₹X out of this receipt is applied
against that bill". A single receipt can split across many bills, and a
single bill can be touched by many receipts (partial payments). This is
the Tally bill-wise breakdown.

Polymorphic bill reference (S125): `bill_type` + `bill_id` (no FK) supports
all 4 bill kinds — customer invoice, supplier invoice, job challan (roll VA),
batch challan (garment VA). FK was dropped because Postgres doesn't allow a
single FK to point at one of N tables; service layer validates the row exists
under FOR UPDATE before allocating.

Service-layer invariants:
    * `amount_applied > 0` (CHECK)
    * `bill_type IN ('invoice','supplier_invoice','job_challan','batch_challan')` (CHECK)
    * `SUM(amount_applied) <= receipt.amount - receipt.tds_amount + receipt.tcs_amount`
      (residue lands on `receipt.on_account_amount`)
    * After insert: `bill.amount_paid` is bumped, status flips between
      `issued`/`partially_paid`/`paid` (invoice) or `received`/... (challans).
    * Each allocation generates exactly one LedgerEntry with
      `reference_type='payment_allocation'` + `reference_id=allocation.id`.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PaymentAllocation(Base):
    __tablename__ = "payment_allocations"
    __table_args__ = (
        CheckConstraint(
            "amount_applied > 0",
            name="pa_amount_positive",
        ),
        CheckConstraint(
            "bill_type IN ('invoice', 'supplier_invoice', 'job_challan', 'batch_challan')",
            name="pa_valid_bill_type",
        ),
        Index("ix_pa_receipt_bill", "payment_receipt_id", "bill_type", "bill_id"),
        Index("ix_pa_bill", "bill_type", "bill_id"),
    )

    payment_receipt_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("payment_receipts.id", ondelete="CASCADE"), index=True
    )
    bill_type: Mapped[str] = mapped_column(String(30))
    bill_id: Mapped[uuid.UUID] = mapped_column()
    amount_applied: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    # Relationships
    receipt: Mapped["PaymentReceipt"] = relationship(back_populates="allocations")
