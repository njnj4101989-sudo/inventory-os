"""PaymentReceipt — receipt voucher header for partial / multi-invoice payments.

One PaymentReceipt represents a single inflow (or outflow, when the system
extends to supplier/VA payouts) carrying a sequential `receipt_no` (PAY-XXXX
per FY). The receipt fans out into one-or-more PaymentAllocation rows, each
applying a slice of `amount` against a specific invoice. Any unallocated
residue is booked as on-account credit for the party.

Tally Receipt Voucher (F6) parallel:
    PaymentReceipt   = the voucher header
    PaymentAllocation = the bill-wise allocation lines
    LedgerEntry rows  = the journal lines posted into the party ledger

Notes:
    * `party_type` + `party_id` are polymorphic — no DB FK constraint, mirror
      of `LedgerEntry`.
    * Amounts are GROSS at the header. TDS/TCS are calculated at the service
      layer and posted as separate `LedgerEntry` rows (mirrors S119 pattern).
    * `on_account_amount = amount - SUM(allocations.amount_applied) - tds_amount`
      is computed by the service and stored on the receipt for fast list
      rendering. Allocations + on-account always reconcile to gross amount
      minus TDS/TCS.
"""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PaymentReceipt(Base):
    __tablename__ = "payment_receipts"
    __table_args__ = (
        CheckConstraint(
            "party_type IN ('customer', 'supplier', 'va_party')",
            name="pr_valid_party_type",
        ),
        CheckConstraint(
            "amount > 0",
            name="pr_amount_positive",
        ),
    )

    receipt_no: Mapped[str] = mapped_column(String(50), unique=True, index=True)

    # Polymorphic party — service resolves to customers/suppliers/va_parties.
    # No DB FK (mirror of LedgerEntry).
    party_type: Mapped[str] = mapped_column(String(20), index=True)
    party_id: Mapped[uuid.UUID] = mapped_column(index=True)

    # Receipt details
    payment_date: Mapped[date] = mapped_column(Date)
    payment_mode: Mapped[str] = mapped_column(String(20))  # neft / upi / cash / cheque / card
    reference_no: Mapped[str | None] = mapped_column(String(100))  # UTR / cheque no / txn id

    # Money — gross at header. TDS/TCS posted as separate LedgerEntry rows.
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    tds_applicable: Mapped[bool] = mapped_column(default=False, server_default="false")
    tds_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    tds_section: Mapped[str | None] = mapped_column(String(10))
    tds_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=0, server_default="0"
    )
    tcs_applicable: Mapped[bool] = mapped_column(default=False, server_default="false")
    tcs_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    tcs_section: Mapped[str | None] = mapped_column(String(10))
    tcs_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=0, server_default="0"
    )

    # Service-computed at write time. Equals amount - SUM(allocations) - tds + tcs.
    # Stored so list views don't need an extra aggregation query.
    on_account_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=0, server_default="0"
    )

    # Audit / scope
    notes: Mapped[str | None] = mapped_column(Text)
    fy_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("financial_years.id", ondelete="RESTRICT"), index=True, nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("public.users.id", ondelete="SET NULL"), index=True
    )

    # Relationships
    allocations: Mapped[list["PaymentAllocation"]] = relationship(
        back_populates="receipt", cascade="all, delete-orphan"
    )
    created_by_user = relationship("User", foreign_keys=[created_by])
