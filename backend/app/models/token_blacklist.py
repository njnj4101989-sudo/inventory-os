"""TokenBlacklist — stores invalidated JWT token IDs (jti) after logout.

Public schema table — shared across all tenants.
Tokens auto-expire (DB cleanup via periodic task).
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TokenBlacklist(Base):
    __tablename__ = "token_blacklist"
    __table_args__ = {"schema": "public"}

    jti: Mapped[str] = mapped_column(String(36), unique=True, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("public.users.id", ondelete="CASCADE"))
    token_type: Mapped[str] = mapped_column(String(10))  # "access" or "refresh"
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    blacklisted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
