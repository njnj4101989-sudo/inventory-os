from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InventoryEvent(Base):
    __tablename__ = "inventory_events"

    event_id: Mapped[str] = mapped_column(String(100), unique=True)
    event_type: Mapped[str] = mapped_column(String(20), index=True)
    item_type: Mapped[str] = mapped_column(String(20))
    reference_type: Mapped[str] = mapped_column(String(50))
    reference_id: Mapped[uuid.UUID] = mapped_column()
    sku_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("skus.id"), index=True
    )
    roll_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("rolls.id"), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    unit: Mapped[str | None] = mapped_column(String(20))
    reason: Mapped[str | None] = mapped_column(Text)
    performed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("public.users.id"))
    performed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON)

    # Relationships
    sku: Mapped[SKU | None] = relationship()
    roll: Mapped[Roll | None] = relationship()
    performed_by_user: Mapped[User | None] = relationship(foreign_keys=[performed_by])
