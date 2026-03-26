from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class JobChallan(Base):
    __tablename__ = "job_challans"
    __table_args__ = (
        CheckConstraint(
            "status IN ('sent', 'partially_received', 'received', 'cancelled')",
            name="jc_valid_status",
        ),
    )

    challan_no: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    value_addition_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("value_additions.id", ondelete="RESTRICT"), index=True
    )
    va_party_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("va_parties.id", ondelete="RESTRICT"), index=True
    )
    sent_date: Mapped[datetime] = mapped_column(Date)
    received_date: Mapped[datetime | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(
        String(20), default="sent", server_default="'sent'", index=True
    )
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("public.users.id", ondelete="RESTRICT"))
    fy_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("financial_years.id", ondelete="RESTRICT"), nullable=True, index=True
    )

    # Relationships
    value_addition = relationship("ValueAddition")
    va_party = relationship("VAParty")
    created_by_user = relationship("User", foreign_keys=[created_by_id])
    processing_logs = relationship("RollProcessing", back_populates="job_challan")
