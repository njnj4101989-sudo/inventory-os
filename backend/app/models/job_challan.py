from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class JobChallan(Base):
    __tablename__ = "job_challans"

    challan_no: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    value_addition_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("value_additions.id")
    )
    vendor_name: Mapped[str] = mapped_column(String(200))
    vendor_phone: Mapped[str | None] = mapped_column(String(20))
    sent_date: Mapped[datetime] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))

    # Relationships
    value_addition = relationship("ValueAddition")
    created_by_user = relationship("User", foreign_keys=[created_by_id])
    processing_logs = relationship("RollProcessing", back_populates="job_challan")
