from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned')",
            name="ord_valid_status",
        ),
    )

    order_number: Mapped[str] = mapped_column(String(50), unique=True)
    order_date: Mapped[datetime | None] = mapped_column(Date)
    source: Mapped[str] = mapped_column(String(20), index=True)
    external_order_ref: Mapped[str | None] = mapped_column(String(100))
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), index=True
    )
    customer_name: Mapped[str | None] = mapped_column(String(200))
    customer_phone: Mapped[str | None] = mapped_column(String(20))
    customer_address: Mapped[str | None] = mapped_column(Text)
    broker_name: Mapped[str | None] = mapped_column(String(200))
    transport: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), index=True)
    total_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("public.users.id", ondelete="SET NULL"), index=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fy_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("financial_years.id", ondelete="RESTRICT"), nullable=True, index=True
    )

    # Relationships
    customer: Mapped[Customer | None] = relationship(foreign_keys=[customer_id])
    created_by_user: Mapped[User | None] = relationship(foreign_keys=[created_by])
    items: Mapped[list[OrderItem]] = relationship(back_populates="order")
    invoices: Mapped[list[Invoice]] = relationship(back_populates="order")
    reservations: Mapped[list[Reservation]] = relationship(back_populates="order")
