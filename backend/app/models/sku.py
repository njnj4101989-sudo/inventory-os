from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SKU(Base):
    __tablename__ = "skus"

    sku_code: Mapped[str] = mapped_column(String(50), unique=True)
    product_type: Mapped[str] = mapped_column(String(50))
    product_name: Mapped[str] = mapped_column(String(200))
    color: Mapped[str] = mapped_column(String(50))
    color_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("colors.id", ondelete="RESTRICT"), index=True
    )
    design_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("designs.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    size: Mapped[str] = mapped_column(String(20))
    description: Mapped[str | None] = mapped_column(Text)
    base_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    hsn_code: Mapped[str | None] = mapped_column(String(8))
    gst_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    mrp: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    sale_rate: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    stitching_cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))  # tailor charges per piece
    other_cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))  # thread, lining, packing, misc per piece
    unit: Mapped[str | None] = mapped_column(String(20))  # pcs / meters / kg
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    # Relationships
    color_obj: Mapped[Color | None] = relationship(foreign_keys=[color_id])
    design_obj: Mapped[Design | None] = relationship(foreign_keys=[design_id])
    lots: Mapped[list[Lot]] = relationship(back_populates="sku")
    batches: Mapped[list[Batch]] = relationship(back_populates="sku")
    inventory_state: Mapped[InventoryState | None] = relationship(
        back_populates="sku", uselist=False
    )
