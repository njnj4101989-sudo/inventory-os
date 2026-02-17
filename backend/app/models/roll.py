from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Roll(Base):
    __tablename__ = "rolls"

    roll_code: Mapped[str] = mapped_column(String(50), unique=True)
    fabric_type: Mapped[str] = mapped_column(String(100))
    color: Mapped[str] = mapped_column(String(50))
    total_weight: Mapped[Decimal] = mapped_column(Numeric(10, 3))
    remaining_weight: Mapped[Decimal] = mapped_column(Numeric(10, 3))
    unit: Mapped[str] = mapped_column(String(20), default="kg", server_default="'kg'")
    cost_per_unit: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    total_length: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    status: Mapped[str] = mapped_column(String(30), default="in_stock", server_default="'in_stock'")
    supplier_invoice_no: Mapped[str | None] = mapped_column(String(50))
    supplier_challan_no: Mapped[str | None] = mapped_column(String(50))
    supplier_invoice_date: Mapped[datetime | None] = mapped_column(Date)
    sr_no: Mapped[str | None] = mapped_column(String(20))
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("suppliers.id"))
    received_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    notes: Mapped[str | None] = mapped_column(Text)

    # Relationships
    supplier: Mapped[Supplier | None] = relationship(back_populates="rolls")
    received_by_user: Mapped[User | None] = relationship(foreign_keys=[received_by])
    consumption_records: Mapped[list[BatchRollConsumption]] = relationship(
        back_populates="roll"
    )
    lot_rolls: Mapped[list[LotRoll]] = relationship(back_populates="roll")
    processing_logs: Mapped[list[RollProcessing]] = relationship(back_populates="roll")


class RollProcessing(Base):
    __tablename__ = "roll_processing"

    roll_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rolls.id"))
    process_type: Mapped[str] = mapped_column(String(50))  # embroidery, digital_print, dyeing, other
    vendor_name: Mapped[str] = mapped_column(String(200))
    vendor_phone: Mapped[str | None] = mapped_column(String(20))
    sent_date: Mapped[datetime] = mapped_column(Date)
    received_date: Mapped[datetime | None] = mapped_column(Date)
    weight_before: Mapped[Decimal] = mapped_column(Numeric(10, 3))
    weight_after: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    length_before: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    length_after: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    processing_cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    status: Mapped[str] = mapped_column(String(20), default="sent", server_default="'sent'")
    notes: Mapped[str | None] = mapped_column(Text)

    # Relationships
    roll: Mapped[Roll] = relationship(back_populates="processing_logs")
