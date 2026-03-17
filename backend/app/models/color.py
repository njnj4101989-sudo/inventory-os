from __future__ import annotations

from sqlalchemy import Boolean, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Color(Base):
    __tablename__ = "colors"
    __table_args__ = (
        UniqueConstraint("name", name="uq_colors_name"),
    )

    name: Mapped[str] = mapped_column(String(100))
    code: Mapped[str] = mapped_column(String(5), unique=True, index=True)
    color_no: Mapped[int | None] = mapped_column(Integer, unique=True, index=True)
    hex_code: Mapped[str | None] = mapped_column(String(7))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
