"""FinancialYear — FY periods with open/closed status + year closing."""
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FinancialYear(Base):
    __tablename__ = "financial_years"
    __table_args__ = (
        CheckConstraint("status IN ('open', 'closed')", name="fy_valid_status"),
    )

    code: Mapped[str] = mapped_column(String(20), unique=True)  # FY2025-26
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="open", server_default="open", index=True)  # open / closed
    is_current: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", index=True)
    closed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("public.users.id", ondelete="SET NULL"), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closing_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
