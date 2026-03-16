"""LedgerEntry — journal table for double-entry party accounting.

NOTE: fy_id is nullable for now. Will be wired to FinancialYear FK in Phase 4.
"""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    # Core
    entry_date: Mapped[date] = mapped_column(Date)
    party_type: Mapped[str] = mapped_column(String(20))  # supplier / customer / va_party
    party_id: Mapped[uuid.UUID] = mapped_column()  # polymorphic — no DB FK constraint
    entry_type: Mapped[str] = mapped_column(String(30))  # opening / invoice / payment / challan / adjustment / tds / tcs

    # Reference to source document
    reference_type: Mapped[str | None] = mapped_column(String(30))  # supplier_invoice / order / invoice / job_challan / batch_challan / manual
    reference_id: Mapped[uuid.UUID | None] = mapped_column()

    # Amounts
    debit: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    credit: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    tds_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    tds_section: Mapped[str | None] = mapped_column(String(10))
    tcs_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    net_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))

    # Metadata
    description: Mapped[str] = mapped_column(String(500))
    fy_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("financial_years.id"), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column()  # FK to users (no constraint — polymorphic)
    notes: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        Index("ix_ledger_party", "party_type", "party_id", "entry_date"),
        Index("ix_ledger_fy", "fy_id"),
        Index("ix_ledger_ref", "reference_type", "reference_id"),
    )
