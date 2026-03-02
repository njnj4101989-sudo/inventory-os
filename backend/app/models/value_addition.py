from __future__ import annotations

from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ValueAddition(Base):
    __tablename__ = "value_additions"

    name: Mapped[str] = mapped_column(String(100))
    short_code: Mapped[str] = mapped_column(String(4), unique=True, index=True)
    applicable_to: Mapped[str] = mapped_column(
        String(20), default="both", server_default="'both'"
    )  # 'roll' | 'garment' | 'both'
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
