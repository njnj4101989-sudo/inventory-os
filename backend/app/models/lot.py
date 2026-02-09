from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Lot(Base):
    __tablename__ = "lots"

    lot_code: Mapped[str] = mapped_column(String(50), unique=True)
    sku_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("skus.id"), nullable=True, index=True)
    lot_date: Mapped[datetime] = mapped_column(Date)
    design_no: Mapped[str] = mapped_column(String(50))
    standard_palla_weight: Mapped[Decimal] = mapped_column(Numeric(10, 3))
    default_size_pattern: Mapped[dict] = mapped_column(JSON)
    pieces_per_palla: Mapped[int] = mapped_column(Integer)
    total_pallas: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_pieces: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_weight: Mapped[Decimal] = mapped_column(
        Numeric(10, 3), default=Decimal("0"), server_default="0"
    )
    status: Mapped[str] = mapped_column(
        String(20), default="open", server_default="'open'", index=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    notes: Mapped[str | None] = mapped_column(Text)

    # Relationships
    sku: Mapped[SKU | None] = relationship(back_populates="lots")
    created_by_user: Mapped[User | None] = relationship(foreign_keys=[created_by])
    lot_rolls: Mapped[list[LotRoll]] = relationship(back_populates="lot")
    batches: Mapped[list[Batch]] = relationship(back_populates="lot")


class LotRoll(Base):
    __tablename__ = "lot_rolls"

    lot_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lots.id"), index=True)
    roll_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rolls.id"), index=True)
    palla_weight: Mapped[Decimal] = mapped_column(Numeric(10, 3))
    num_pallas: Mapped[int] = mapped_column(Integer)
    weight_used: Mapped[Decimal] = mapped_column(Numeric(10, 3))
    waste_weight: Mapped[Decimal] = mapped_column(Numeric(10, 3), default=Decimal("0"))
    size_pattern: Mapped[dict | None] = mapped_column(JSON)
    pieces_from_roll: Mapped[int] = mapped_column(Integer)

    # Relationships
    lot: Mapped[Lot] = relationship(back_populates="lot_rolls")
    roll: Mapped[Roll] = relationship(back_populates="lot_rolls")
