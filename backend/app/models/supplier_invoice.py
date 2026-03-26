from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SupplierInvoice(Base):
    __tablename__ = "supplier_invoices"

    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("suppliers.id", ondelete="RESTRICT"), index=True
    )
    invoice_no: Mapped[str | None] = mapped_column(String(50), index=True)
    challan_no: Mapped[str | None] = mapped_column(String(50))
    invoice_date: Mapped[datetime | None] = mapped_column(Date)
    sr_no: Mapped[str | None] = mapped_column(String(20), index=True)
    gst_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=0, server_default="0"
    )
    received_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("public.users.id", ondelete="SET NULL"), index=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    notes: Mapped[str | None] = mapped_column(Text)
    type: Mapped[str] = mapped_column(
        String(20), default="roll_purchase", server_default="roll_purchase", index=True
    )
    fy_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("financial_years.id", ondelete="RESTRICT"), nullable=True, index=True
    )

    # Relationships
    supplier: Mapped[Supplier | None] = relationship(foreign_keys=[supplier_id])
    received_by_user: Mapped[User | None] = relationship(foreign_keys=[received_by])
    rolls: Mapped[list[Roll]] = relationship(back_populates="supplier_invoice")
    purchase_items: Mapped[list[PurchaseItem]] = relationship(back_populates="supplier_invoice")
