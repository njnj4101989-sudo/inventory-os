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
    total_length: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    remaining_length: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    unit: Mapped[str] = mapped_column(String(20), default="meters", server_default="'meters'")
    cost_per_unit: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    supplier_invoice_no: Mapped[str | None] = mapped_column(String(50))
    supplier_invoice_date: Mapped[datetime | None] = mapped_column(Date)
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
