from __future__ import annotations

from sqlalchemy import Boolean, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Fabric(Base):
    __tablename__ = "fabrics"
    __table_args__ = (
        UniqueConstraint("name", name="uq_fabrics_name"),
    )

    name: Mapped[str] = mapped_column(String(100))
    code: Mapped[str] = mapped_column(String(3), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
