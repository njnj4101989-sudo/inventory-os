from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Reservation(Base):
    __tablename__ = "reservations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'confirmed', 'released', 'cancelled', 'expired')",
            name="res_valid_status",
        ),
    )

    reservation_code: Mapped[str] = mapped_column(String(50), unique=True)
    sku_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("skus.id", ondelete="RESTRICT"), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), index=True)
    order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), index=True)
    external_order_ref: Mapped[str | None] = mapped_column(String(100))
    reserved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Relationships
    sku: Mapped[SKU] = relationship()
    order: Mapped[Order | None] = relationship(back_populates="reservations")
