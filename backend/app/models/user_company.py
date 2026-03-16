"""UserCompany — junction table linking users to companies in public schema."""
from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserCompany(Base):
    __tablename__ = "user_companies"
    __table_args__ = (
        UniqueConstraint("user_id", "company_id", name="uq_user_company"),
        {"schema": "public"},
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("public.users.id", ondelete="CASCADE"))
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("public.companies.id", ondelete="CASCADE"))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
