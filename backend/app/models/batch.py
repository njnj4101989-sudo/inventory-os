from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Batch(Base):
    __tablename__ = "batches"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="positive_quantity"),
        CheckConstraint(
            "status IN ('created', 'assigned', 'in_progress', 'submitted', 'checked', 'packing', 'packed')",
            name="valid_status",
        ),
    )

    batch_code: Mapped[str] = mapped_column(String(50), unique=True)
    lot_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("lots.id", ondelete="RESTRICT"), index=True
    )
    sku_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("skus.id"), nullable=True, index=True)
    size: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    piece_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    color_breakdown: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), index=True)
    qr_code_data: Mapped[str] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("public.users.id"))
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_qty: Mapped[int | None] = mapped_column(Integer)
    rejected_qty: Mapped[int | None] = mapped_column(Integer)
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)

    # Packing fields (S42 — Batch VA + Packing)
    checked_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("public.users.id"))
    packed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("public.users.id"))
    packed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pack_reference: Mapped[str | None] = mapped_column(String(50))
    color_qc: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    fy_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("financial_years.id"), nullable=True, index=True
    )

    # Relationships
    lot: Mapped[Lot | None] = relationship(back_populates="batches")
    sku: Mapped[SKU | None] = relationship(back_populates="batches")
    created_by_user: Mapped[User | None] = relationship(foreign_keys=[created_by])
    checked_by_user: Mapped[User | None] = relationship(foreign_keys=[checked_by])
    packed_by_user: Mapped[User | None] = relationship(foreign_keys=[packed_by])
    assignments: Mapped[list[BatchAssignment]] = relationship(back_populates="batch")
    roll_consumptions: Mapped[list[BatchRollConsumption]] = relationship(
        back_populates="batch"
    )
    processing_logs: Mapped[list[BatchProcessing]] = relationship(
        back_populates="batch"
    )
