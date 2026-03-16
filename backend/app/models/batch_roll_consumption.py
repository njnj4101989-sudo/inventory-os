from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class BatchRollConsumption(Base):
    __tablename__ = "batch_roll_consumption"

    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("batches.id"), index=True)
    roll_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rolls.id"), index=True)
    pieces_cut: Mapped[int] = mapped_column(Integer)
    length_used: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    cut_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("public.users.id"))
    cut_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    batch: Mapped[Batch] = relationship(back_populates="roll_consumptions")
    roll: Mapped[Roll] = relationship(back_populates="consumption_records")
    cut_by_user: Mapped[User | None] = relationship(foreign_keys=[cut_by])
