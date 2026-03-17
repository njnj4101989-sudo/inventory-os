from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import ForeignKey, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class OrderItem(Base):
    __tablename__ = "order_items"

    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    sku_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("skus.id", ondelete="RESTRICT"), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    total_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    fulfilled_qty: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # Relationships
    order: Mapped[Order] = relationship(back_populates="items")
    sku: Mapped[SKU] = relationship()
