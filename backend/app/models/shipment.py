from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Shipment(Base):
    __tablename__ = "shipments"

    shipment_no: Mapped[str] = mapped_column(String(50), unique=True)
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), index=True
    )
    transport_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("transports.id", ondelete="SET NULL"), index=True, nullable=True
    )
    lr_number: Mapped[str | None] = mapped_column(String(50))
    lr_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    eway_bill_no: Mapped[str | None] = mapped_column(String(50))
    eway_bill_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    shipped_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("public.users.id", ondelete="SET NULL"), index=True
    )
    shipped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()"
    )
    notes: Mapped[str | None] = mapped_column(Text)
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("invoices.id", ondelete="SET NULL"), index=True, nullable=True
    )
    fy_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("financial_years.id", ondelete="RESTRICT"), nullable=True, index=True
    )

    # Relationships
    order: Mapped[Order] = relationship(back_populates="shipments")
    transport_rel: Mapped[Transport | None] = relationship(foreign_keys=[transport_id])
    shipped_by_user: Mapped[User | None] = relationship(foreign_keys=[shipped_by])
    invoice: Mapped[Invoice | None] = relationship(foreign_keys=[invoice_id])
    items: Mapped[list[ShipmentItem]] = relationship(back_populates="shipment")
