from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InventoryState(Base):
    __tablename__ = "inventory_state"

    sku_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("skus.id"), unique=True)
    total_qty: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    available_qty: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    reserved_qty: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    sku: Mapped[SKU] = relationship(back_populates="inventory_state")
