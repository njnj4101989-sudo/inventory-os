from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Boolean, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SKU(Base):
    __tablename__ = "skus"

    sku_code: Mapped[str] = mapped_column(String(50), unique=True)
    product_type: Mapped[str] = mapped_column(String(50))
    product_name: Mapped[str] = mapped_column(String(200))
    color: Mapped[str] = mapped_column(String(50))
    size: Mapped[str] = mapped_column(String(20))
    description: Mapped[str | None] = mapped_column(Text)
    base_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    # Relationships
    batches: Mapped[list[Batch]] = relationship(back_populates="sku")
    inventory_state: Mapped[InventoryState | None] = relationship(
        back_populates="sku", uselist=False
    )
