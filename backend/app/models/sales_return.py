"""SalesReturn + SalesReturnItem — customer sale return tracking.

SalesReturn: header with order, customer, 5-status workflow (draft->received->inspected->restocked->closed).
SalesReturnItem: line items linked to order items with QC condition tracking.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SalesReturn(Base):
    __tablename__ = "sales_returns"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'received', 'inspected', 'restocked', 'closed', 'cancelled')",
            name="sr_valid_status",
        ),
    )

    srn_no: Mapped[str] = mapped_column(String(50), unique=True)
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("orders.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    # When a credit note is raised directly against an invoice (fast-track path),
    # we record which invoice it reverses. Nullable for the classic order-return
    # flow and for standalone credit notes.
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("invoices.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), index=True
    )
    status: Mapped[str] = mapped_column(String(20), default="draft", server_default="'draft'", index=True)
    return_date: Mapped[datetime | None] = mapped_column(Date)
    received_date: Mapped[datetime | None] = mapped_column(Date)
    inspected_date: Mapped[datetime | None] = mapped_column(Date)
    restocked_date: Mapped[datetime | None] = mapped_column(Date)
    transport_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("transports.id", ondelete="SET NULL"), nullable=True
    )
    lr_number: Mapped[str | None] = mapped_column(String(50))
    lr_date: Mapped[datetime | None] = mapped_column(Date)
    reason_summary: Mapped[str | None] = mapped_column(Text)
    qc_notes: Mapped[str | None] = mapped_column(Text)
    gst_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), default=0, server_default="0")
    subtotal: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    discount_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2), default=0, server_default="0"
    )
    additional_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2), default=0, server_default="0"
    )
    tax_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    total_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    credit_note_no: Mapped[str | None] = mapped_column(String(50))
    # 'fast_track' (1-click CN from invoice, closed at creation) or 'with_qc'
    # (5-step inspection workflow). Default with_qc for back-compat.
    workflow_type: Mapped[str] = mapped_column(
        String(20), default="with_qc", server_default="'with_qc'"
    )
    fy_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("financial_years.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("public.users.id", ondelete="SET NULL"), index=True
    )
    received_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("public.users.id", ondelete="SET NULL"), nullable=True
    )
    inspected_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("public.users.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    order = relationship("Order", back_populates="sales_returns")
    invoice = relationship("Invoice", foreign_keys=[invoice_id])
    customer = relationship("Customer")
    transport = relationship("Transport")
    created_by_user = relationship("User", foreign_keys=[created_by])
    received_by_user = relationship("User", foreign_keys=[received_by])
    inspected_by_user = relationship("User", foreign_keys=[inspected_by])
    items: Mapped[list[SalesReturnItem]] = relationship(back_populates="sales_return", cascade="all, delete-orphan")


class SalesReturnItem(Base):
    __tablename__ = "sales_return_items"

    sales_return_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sales_returns.id", ondelete="CASCADE"), index=True
    )
    order_item_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("order_items.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    sku_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("skus.id", ondelete="RESTRICT"), index=True
    )
    unit_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    quantity_returned: Mapped[int] = mapped_column(Integer)
    quantity_restocked: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    quantity_damaged: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    reason: Mapped[str | None] = mapped_column(String(50))
    condition: Mapped[str] = mapped_column(String(20), default="pending", server_default="'pending'")
    notes: Mapped[str | None] = mapped_column(Text)

    # Relationships
    sales_return: Mapped[SalesReturn] = relationship(back_populates="items")
    order_item = relationship("OrderItem")
    sku = relationship("SKU")
