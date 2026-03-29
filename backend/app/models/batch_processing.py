"""Batch Processing model — individual batch VA record within a BatchChallan.

Mirrors RollProcessing but tracks pieces (not weight).
Each record = one batch sent on one challan for one VA type.
Phase field tracks when in the flow this VA happened: 'stitching' or 'post_qc'.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class BatchProcessing(Base):
    __tablename__ = "batch_processing"
    __table_args__ = (
        CheckConstraint("pieces_sent > 0", name="positive_pieces_sent"),
        CheckConstraint("status IN ('sent', 'received', 'cancelled')", name="bp_valid_status"),
    )

    batch_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("batches.id", ondelete="CASCADE"), index=True
    )
    batch_challan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("batch_challans.id", ondelete="CASCADE"), index=True
    )
    value_addition_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("value_additions.id", ondelete="RESTRICT"), index=True
    )
    pieces_sent: Mapped[int] = mapped_column(Integer)
    pieces_received: Mapped[int | None] = mapped_column(Integer)
    pieces_damaged: Mapped[int | None] = mapped_column(Integer)
    damage_reason: Mapped[str | None] = mapped_column(String(50))
    cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    status: Mapped[str] = mapped_column(
        String(20), default="sent", server_default="'sent'", index=True
    )
    phase: Mapped[str] = mapped_column(String(20))  # 'stitching' or 'post_qc'
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("public.users.id", ondelete="RESTRICT"))

    # Relationships
    batch = relationship("Batch", back_populates="processing_logs")
    batch_challan: Mapped[BatchChallan] = relationship(back_populates="batch_items")
    value_addition = relationship("ValueAddition")
    created_by_user = relationship("User", foreign_keys=[created_by_id])
