from __future__ import annotations

from sqlalchemy import Boolean, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProductType(Base):
    __tablename__ = "product_types"
    __table_args__ = (
        UniqueConstraint("name", name="uq_product_types_name"),
    )

    code: Mapped[str] = mapped_column(String(10), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    # weight = only palla_weight, meter = only palla_meter, both = either
    palla_mode: Mapped[str] = mapped_column(String(10), default="weight", server_default="'weight'")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
