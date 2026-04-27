from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class JobChallan(Base):
    __tablename__ = "job_challans"
    __table_args__ = (
        CheckConstraint(
            "status IN ('sent', 'partially_received', 'received', 'cancelled')",
            name="jc_valid_status",
        ),
    )

    challan_no: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    value_addition_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("value_additions.id", ondelete="RESTRICT"), index=True
    )
    va_party_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("va_parties.id", ondelete="RESTRICT"), index=True
    )
    sent_date: Mapped[datetime] = mapped_column(Date)
    received_date: Mapped[datetime | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(
        String(20), default="sent", server_default="'sent'", index=True
    )
    notes: Mapped[str | None] = mapped_column(Text)
    # Totals stack (S121 — Phase 3 of FINANCIAL_SYMMETRY_PLAN). Mirrors
    # SupplierInvoice/Invoice/Order — same rule everywhere:
    #   taxable = subtotal − discount + additional
    #   tax     = taxable × gst_pct / 100
    #   total   = taxable + tax
    # subtotal = SUM(processing_logs.processing_cost where status='received').
    # On the cost engine side AS-2 valuation uses `taxable` (GST input-creditable
    # so excluded from inventory cost) — total_amount is what we owe VA party.
    gst_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0, server_default="0")
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    additional_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    # Bumped by PaymentReceiptService.record() on each PaymentAllocation
    # whose bill_type='job_challan' (S125). Outstanding = total − paid.
    amount_paid: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=0, server_default="0"
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("public.users.id", ondelete="RESTRICT"))
    fy_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("financial_years.id", ondelete="RESTRICT"), nullable=True, index=True
    )

    # Relationships
    value_addition = relationship("ValueAddition")
    va_party = relationship("VAParty")
    created_by_user = relationship("User", foreign_keys=[created_by_id])
    processing_logs = relationship("RollProcessing", back_populates="job_challan")
