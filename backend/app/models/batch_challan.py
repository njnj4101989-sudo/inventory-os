"""Batch Challan model — tracks garment-level VA sends to external vendors.

Mirrors JobChallan (roll-level) but for batches (pieces instead of weight).
Auto-sequential challan_no: BC-001, BC-002...
One challan can include multiple batches sent to same vendor for same VA.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class BatchChallan(Base):
    __tablename__ = "batch_challans"
    __table_args__ = (
        CheckConstraint(
            "status IN ('sent', 'partially_received', 'received')",
            name="bc_valid_status",
        ),
    )

    challan_no: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    va_party_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("va_parties.id", ondelete="RESTRICT"), index=True
    )
    value_addition_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("value_additions.id", ondelete="RESTRICT"), index=True
    )
    total_pieces: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    sent_date: Mapped[datetime] = mapped_column(Date, server_default=func.now())
    received_date: Mapped[datetime | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(
        String(20), default="sent", server_default="'sent'", index=True
    )
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("public.users.id", ondelete="RESTRICT"))
    fy_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("financial_years.id", ondelete="RESTRICT"), nullable=True, index=True
    )

    # Relationships
    value_addition = relationship("ValueAddition")
    va_party = relationship("VAParty")
    created_by_user = relationship("User", foreign_keys=[created_by_id])
    batch_items: Mapped[list[BatchProcessing]] = relationship(
        back_populates="batch_challan"
    )
