from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Lot(Base):
    __tablename__ = "lots"
    __table_args__ = (
        CheckConstraint(
            "status IN ('open', 'cutting', 'distributed')",
            name="valid_status",
        ),
    )

    lot_code: Mapped[str] = mapped_column(String(50), unique=True)
    sku_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("skus.id", ondelete="SET NULL"), nullable=True, index=True)
    lot_date: Mapped[datetime] = mapped_column(Date)
    product_type: Mapped[str] = mapped_column(String(10), default="BLS", server_default="'BLS'")
    standard_palla_weight: Mapped[Decimal | None] = mapped_column(Numeric(10, 3), nullable=True)
    standard_palla_meter: Mapped[Decimal | None] = mapped_column(Numeric(10, 3), nullable=True)
    # Multi-design: [{"design_no": "101", "size_pattern": {"L": 4, "XL": 4}}, ...]
    designs: Mapped[list] = mapped_column(JSON, default=list)
    pieces_per_palla: Mapped[int] = mapped_column(Integer)
    total_pallas: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_pieces: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    total_weight: Mapped[Decimal] = mapped_column(
        Numeric(10, 3), default=Decimal("0"), server_default="0"
    )
    status: Mapped[str] = mapped_column(
        String(20), default="open", server_default="'open'", index=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("public.users.id", ondelete="SET NULL"))
    notes: Mapped[str | None] = mapped_column(Text)
    fy_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("financial_years.id"), nullable=True, index=True
    )

    # Relationships
    sku: Mapped[SKU | None] = relationship(back_populates="lots")
    created_by_user: Mapped[User | None] = relationship(foreign_keys=[created_by])
    lot_rolls: Mapped[list[LotRoll]] = relationship(back_populates="lot")
    batches: Mapped[list[Batch]] = relationship(back_populates="lot")


class LotRoll(Base):
    __tablename__ = "lot_rolls"
    __table_args__ = (
        UniqueConstraint("lot_id", "roll_id", name="uq_lot_rolls_lot_roll"),
    )

    lot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lots.id", ondelete="CASCADE"), index=True
    )
    roll_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("rolls.id", ondelete="RESTRICT"), index=True
    )
    palla_weight: Mapped[Decimal] = mapped_column(Numeric(10, 3))
    num_pallas: Mapped[int] = mapped_column(Integer)
    weight_used: Mapped[Decimal] = mapped_column(Numeric(10, 3))
    waste_weight: Mapped[Decimal] = mapped_column(Numeric(10, 3), default=Decimal("0"))
    size_pattern: Mapped[dict | None] = mapped_column(JSON)
    pieces_from_roll: Mapped[int] = mapped_column(Integer)

    # Relationships
    lot: Mapped[Lot] = relationship(back_populates="lot_rolls")
    roll: Mapped[Roll] = relationship(back_populates="lot_rolls")
