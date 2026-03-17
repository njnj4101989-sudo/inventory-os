from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Boolean, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Customer(Base):
    __tablename__ = "customers"

    # Core identity
    name: Mapped[str] = mapped_column(String(200), index=True)
    contact_person: Mapped[str | None] = mapped_column(String(200))
    short_name: Mapped[str | None] = mapped_column(String(50))
    phone: Mapped[str | None] = mapped_column(String(20))
    phone_alt: Mapped[str | None] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(100))

    # Address
    address: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(String(100))
    state: Mapped[str | None] = mapped_column(String(100))
    pin_code: Mapped[str | None] = mapped_column(String(10))

    # GST & Compliance
    gst_no: Mapped[str | None] = mapped_column(String(15), index=True)
    gst_type: Mapped[str | None] = mapped_column(String(20))
    state_code: Mapped[str | None] = mapped_column(String(2))
    pan_no: Mapped[str | None] = mapped_column(String(10))
    aadhar_no: Mapped[str | None] = mapped_column(String(12))

    # Credit & Payment
    due_days: Mapped[int | None] = mapped_column(Integer)
    credit_limit: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    opening_balance: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    balance_type: Mapped[str | None] = mapped_column(String(10))

    # TDS/TCS
    tds_applicable: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    tds_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    tds_section: Mapped[str | None] = mapped_column(String(10))
    tcs_applicable: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    tcs_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    tcs_section: Mapped[str | None] = mapped_column(String(10))

    # Other
    broker: Mapped[str | None] = mapped_column(String(200))
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
