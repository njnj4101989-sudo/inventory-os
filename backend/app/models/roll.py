from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Roll(Base):
    __tablename__ = "rolls"
    __table_args__ = (
        CheckConstraint("total_weight > 0", name="positive_weight"),
        CheckConstraint("remaining_weight >= 0", name="non_negative_remaining"),
        CheckConstraint(
            "status IN ('in_stock', 'sent_for_processing', 'in_cutting', 'remnant')",
            name="valid_status",
        ),
    )

    roll_code: Mapped[str] = mapped_column(String(80), unique=True)
    fabric_type: Mapped[str] = mapped_column(String(100))
    color: Mapped[str] = mapped_column(String(50))
    color_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("colors.id", ondelete="RESTRICT"), index=True
    )
    total_weight: Mapped[Decimal] = mapped_column(Numeric(10, 3))
    remaining_weight: Mapped[Decimal] = mapped_column(Numeric(10, 3))
    current_weight: Mapped[Decimal] = mapped_column(Numeric(10, 3))
    unit: Mapped[str] = mapped_column(String(20), default="kg", server_default="'kg'")
    cost_per_unit: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    total_length: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    status: Mapped[str] = mapped_column(String(30), default="in_stock", server_default="'in_stock'", index=True)
    supplier_invoice_no: Mapped[str | None] = mapped_column(String(50), index=True)
    supplier_challan_no: Mapped[str | None] = mapped_column(String(50))
    supplier_invoice_date: Mapped[datetime | None] = mapped_column(Date)
    sr_no: Mapped[str | None] = mapped_column(String(20), index=True)
    panna: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    gsm: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("suppliers.id", ondelete="RESTRICT"), index=True
    )
    supplier_invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("supplier_invoices.id", ondelete="SET NULL"), index=True, nullable=True
    )
    received_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("public.users.id", ondelete="SET NULL"), index=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    notes: Mapped[str | None] = mapped_column(Text)
    fy_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("financial_years.id", ondelete="RESTRICT"), nullable=True, index=True
    )

    # Relationships
    color_obj: Mapped[Color | None] = relationship(foreign_keys=[color_id])
    supplier: Mapped[Supplier | None] = relationship(back_populates="rolls")
    supplier_invoice: Mapped[SupplierInvoice | None] = relationship(back_populates="rolls")
    received_by_user: Mapped[User | None] = relationship(foreign_keys=[received_by])
    consumption_records: Mapped[list[BatchRollConsumption]] = relationship(
        back_populates="roll"
    )
    lot_rolls: Mapped[list[LotRoll]] = relationship(back_populates="roll")
    processing_logs: Mapped[list[RollProcessing]] = relationship(back_populates="roll")


class RollProcessing(Base):
    __tablename__ = "roll_processing"
    __table_args__ = (
        CheckConstraint("status IN ('sent', 'received', 'cancelled')", name="rp_valid_status"),
    )

    roll_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rolls.id", ondelete="RESTRICT"), index=True)
    value_addition_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("value_additions.id", ondelete="RESTRICT"), index=True
    )
    va_party_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("va_parties.id", ondelete="RESTRICT"), index=True
    )
    sent_date: Mapped[datetime] = mapped_column(Date)
    received_date: Mapped[datetime | None] = mapped_column(Date)
    weight_before: Mapped[Decimal] = mapped_column(Numeric(10, 3))
    weight_after: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    length_before: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    length_after: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    processing_cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    status: Mapped[str] = mapped_column(String(20), default="sent", server_default="'sent'", index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    job_challan_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("job_challans.id", ondelete="RESTRICT"), nullable=True, index=True
    )

    # Relationships
    roll: Mapped[Roll] = relationship(back_populates="processing_logs")
    value_addition = relationship("ValueAddition")
    va_party = relationship("VAParty")
    job_challan = relationship("JobChallan", back_populates="processing_logs")
