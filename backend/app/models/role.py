from __future__ import annotations

from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Role(Base):
    __tablename__ = "roles"

    name: Mapped[str] = mapped_column(String(50), unique=True)
    permissions: Mapped[dict] = mapped_column(JSON)

    # Relationships
    users: Mapped[list[User]] = relationship(back_populates="role")
