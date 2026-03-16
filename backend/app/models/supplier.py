from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Boolean, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Supplier(Base):
    __tablename__ = "suppliers"

    # Core identity
    name: Mapped[str] = mapped_column(String(200))
    contact_person: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(20))
    phone_alt: Mapped[str | None] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(String(100))
    state: Mapped[str | None] = mapped_column(String(100))
    pin_code: Mapped[str | None] = mapped_column(String(6))

    # GST & Compliance
    gst_no: Mapped[str | None] = mapped_column(String(15))
    gst_type: Mapped[str | None] = mapped_column(String(20))
    state_code: Mapped[str | None] = mapped_column(String(2))
    pan_no: Mapped[str | None] = mapped_column(String(10))
    aadhar_no: Mapped[str | None] = mapped_column(String(12))
    hsn_code: Mapped[str | None] = mapped_column(String(20))

    # Credit & Payment
    due_days: Mapped[int | None] = mapped_column(Integer)
    credit_limit: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    opening_balance: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    balance_type: Mapped[str | None] = mapped_column(String(10))

    # TDS
    tds_applicable: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    tds_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    tds_section: Mapped[str | None] = mapped_column(String(10))

    # MSME
    msme_type: Mapped[str | None] = mapped_column(String(20))
    msme_reg_no: Mapped[str | None] = mapped_column(String(30))

    # Other
    broker: Mapped[str | None] = mapped_column(String(200))
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")

    # Relationships
    rolls: Mapped[list[Roll]] = relationship(back_populates="supplier")
