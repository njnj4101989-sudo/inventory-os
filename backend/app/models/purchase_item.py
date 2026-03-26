from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PurchaseItem(Base):
    __tablename__ = "purchase_items"

    supplier_invoice_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("supplier_invoices.id", ondelete="CASCADE"), index=True
    )
    sku_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("skus.id", ondelete="RESTRICT"), index=True
    )
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    total_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    hsn_code: Mapped[str | None] = mapped_column(String(8))
    gst_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))

    # Relationships
    supplier_invoice: Mapped[SupplierInvoice] = relationship(back_populates="purchase_items")
    sku: Mapped[SKU] = relationship()
