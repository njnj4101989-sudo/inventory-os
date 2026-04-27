"""PaymentAllocation — bill-wise allocation lines for a PaymentReceipt.

One row per (receipt × invoice) saying "₹X out of this receipt is applied
against that invoice". A single receipt can split across many invoices, and
a single invoice can be touched by many receipts (partial payments). This is
the Tally bill-wise breakdown.

Service-layer invariants:
    * `amount_applied > 0` (CHECK)
    * `SUM(amount_applied) <= receipt.amount - receipt.tds_amount + receipt.tcs_amount`
      (residue lands on `receipt.on_account_amount`)
    * After insert: `invoice.amount_paid` is bumped, status flips between
      `issued`, `partially_paid`, `paid`.
    * Each allocation generates exactly one LedgerEntry with
      `reference_type='payment_allocation'` + `reference_id=allocation.id`.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Index, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PaymentAllocation(Base):
    __tablename__ = "payment_allocations"
    __table_args__ = (
        CheckConstraint(
            "amount_applied > 0",
            name="pa_amount_positive",
        ),
        Index("ix_pa_receipt_invoice", "payment_receipt_id", "invoice_id"),
    )

    payment_receipt_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("payment_receipts.id", ondelete="CASCADE"), index=True
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("invoices.id", ondelete="RESTRICT"), index=True
    )
    amount_applied: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    # Relationships
    receipt: Mapped["PaymentReceipt"] = relationship(back_populates="allocations")
    invoice = relationship("Invoice", foreign_keys=[invoice_id])
