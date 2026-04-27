from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'issued', 'partially_paid', 'paid', 'cancelled')",
            name="inv_valid_status",
        ),
    )

    invoice_number: Mapped[str] = mapped_column(String(50), unique=True)
    order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"), index=True, nullable=True)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), index=True, nullable=True)
    customer_name: Mapped[str | None] = mapped_column(String(200))
    customer_phone: Mapped[str | None] = mapped_column(String(20))
    customer_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    qr_code_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    gst_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0, server_default="0")
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=0, server_default="0"
    )
    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=0, server_default="0"
    )
    additional_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=0, server_default="0"
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    # Running total of payments applied via PaymentAllocation. Updated by
    # PaymentReceiptService.record on every allocation insert + reversed on
    # cancel-with-payment cascade. Drives `partially_paid` vs `paid` status
    # transitions.
    amount_paid: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=0, server_default="0"
    )
    status: Mapped[str] = mapped_column(String(20), index=True)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("public.users.id", ondelete="SET NULL"), index=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    payment_terms: Mapped[str | None] = mapped_column(String(100), nullable=True)
    place_of_supply: Mapped[str | None] = mapped_column(String(100), nullable=True)
    broker_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("brokers.id", ondelete="SET NULL"), index=True, nullable=True
    )
    transport_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("transports.id", ondelete="SET NULL"), index=True, nullable=True
    )
    lr_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    lr_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    shipment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("shipments.id", ondelete="SET NULL"), index=True, nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text)
    # Cancellation audit trail (GST-compliant — cancelled invoices retained with reason).
    cancel_reason: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cancel_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("public.users.id", ondelete="SET NULL"), nullable=True
    )
    fy_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("financial_years.id", ondelete="RESTRICT"), nullable=True, index=True
    )

    # Relationships
    order: Mapped[Order | None] = relationship(back_populates="invoices")
    shipment: Mapped[Shipment | None] = relationship(foreign_keys=[shipment_id])
    customer: Mapped[Customer | None] = relationship(foreign_keys=[customer_id])
    broker: Mapped[Broker | None] = relationship(foreign_keys=[broker_id])
    transport: Mapped[Transport | None] = relationship(foreign_keys=[transport_id])
    created_by_user: Mapped[User | None] = relationship(foreign_keys=[created_by])
    cancelled_by_user: Mapped[User | None] = relationship(foreign_keys=[cancelled_by])
    items: Mapped[list[InvoiceItem]] = relationship(back_populates="invoice")
    # Credit notes raised against this invoice (fast-track path). Many-side
    # of the SalesReturn.invoice FK. Used to surface CNs on invoice detail.
    credit_notes: Mapped[list["SalesReturn"]] = relationship(
        "SalesReturn",
        foreign_keys="[SalesReturn.invoice_id]",
        order_by="SalesReturn.created_at",
        viewonly=True,
    )
