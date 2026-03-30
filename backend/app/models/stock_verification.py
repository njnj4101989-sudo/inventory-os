"""StockVerification — physical stock count vs book stock reconciliation."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class StockVerification(Base):
    __tablename__ = "stock_verifications"

    verification_no: Mapped[str] = mapped_column(String(20), unique=True)
    verification_type: Mapped[str] = mapped_column(String(20))  # raw_material / finished_goods
    verification_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft / in_progress / completed / approved
    notes: Mapped[str | None] = mapped_column(Text)

    started_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("public.users.id", ondelete="SET NULL"), index=True
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("public.users.id", ondelete="SET NULL")
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fy_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("financial_years.id", ondelete="RESTRICT"), index=True
    )

    # Relationships
    items: Mapped[list[StockVerificationItem]] = relationship(
        back_populates="verification", cascade="all, delete-orphan"
    )
    started_by_user: Mapped[User | None] = relationship(foreign_keys=[started_by])
    approved_by_user: Mapped[User | None] = relationship(foreign_keys=[approved_by])


class StockVerificationItem(Base):
    __tablename__ = "stock_verification_items"

    verification_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("stock_verifications.id", ondelete="CASCADE"), index=True
    )
    sku_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("skus.id", ondelete="SET NULL"), index=True
    )
    roll_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("rolls.id", ondelete="SET NULL"), index=True
    )
    item_label: Mapped[str] = mapped_column(String(100))  # SKU code or roll code for display
    book_qty: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=0)  # system quantity (int for SKU, decimal for roll weight)
    physical_qty: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))  # entered during count
    variance: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))  # physical - book
    variance_pct: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))  # variance / book * 100
    adjustment_type: Mapped[str | None] = mapped_column(String(10))  # shortage / excess / match
    notes: Mapped[str | None] = mapped_column(Text)

    # Relationships
    verification: Mapped[StockVerification] = relationship(back_populates="items")
    sku: Mapped[SKU | None] = relationship()
    roll: Mapped[Roll | None] = relationship()


# TYPE_CHECKING imports (avoid circular)
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from app.models.user import User
    from app.models.sku import SKU
    from app.models.roll import Roll
