"""ReturnNote + ReturnNoteItem — supplier return tracking.

ReturnNote: header with supplier, status workflow (draft→approved→dispatched→acknowledged→closed).
ReturnNoteItem: line items — either a roll (roll_return) or SKU (sku_return).
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ReturnNote(Base):
    __tablename__ = "return_notes"
    __table_args__ = (
        CheckConstraint(
            "return_type IN ('roll_return', 'sku_return')",
            name="rn_valid_type",
        ),
        CheckConstraint(
            "status IN ('draft', 'approved', 'dispatched', 'acknowledged', 'closed', 'cancelled')",
            name="rn_valid_status",
        ),
    )

    return_note_no: Mapped[str] = mapped_column(String(50), unique=True)
    return_type: Mapped[str] = mapped_column(String(20), index=True)  # roll_return | sku_return
    supplier_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("suppliers.id", ondelete="RESTRICT"), index=True
    )
    status: Mapped[str] = mapped_column(String(20), default="draft", server_default="'draft'", index=True)
    return_date: Mapped[datetime | None] = mapped_column(Date)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("public.users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dispatch_date: Mapped[datetime | None] = mapped_column(Date)
    transport_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("transports.id", ondelete="SET NULL"), nullable=True
    )
    lr_number: Mapped[str | None] = mapped_column(String(50))
    total_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("public.users.id", ondelete="SET NULL"), index=True
    )
    fy_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("financial_years.id", ondelete="RESTRICT"), nullable=True, index=True
    )

    # Relationships
    supplier = relationship("Supplier")
    transport = relationship("Transport")
    approved_by_user = relationship("User", foreign_keys=[approved_by])
    created_by_user = relationship("User", foreign_keys=[created_by])
    items: Mapped[list[ReturnNoteItem]] = relationship(back_populates="return_note", cascade="all, delete-orphan")


class ReturnNoteItem(Base):
    __tablename__ = "return_note_items"

    return_note_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("return_notes.id", ondelete="CASCADE"), index=True
    )
    roll_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("rolls.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    sku_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("skus.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    weight: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))  # for roll returns
    unit_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    reason: Mapped[str | None] = mapped_column(String(50))  # defective, excess, wrong_material, damaged_in_transit, quality_reject
    condition: Mapped[str | None] = mapped_column(String(50))
    notes: Mapped[str | None] = mapped_column(Text)

    # Relationships
    return_note: Mapped[ReturnNote] = relationship(back_populates="items")
    roll = relationship("Roll")
    sku = relationship("SKU")
