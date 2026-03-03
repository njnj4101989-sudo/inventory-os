from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from app.schemas import BaseSchema, PaginatedParams
from app.schemas.order import OrderBrief
from app.schemas.sku import SKUBrief


# --- Filter Params ---


class InvoiceFilterParams(PaginatedParams):
    """Query parameters for invoice listing."""

    status: str | None = None
    search: str | None = None


# --- Nested ---


class InvoiceItemResponse(BaseSchema):
    """Single item in invoice response."""

    sku: SKUBrief
    quantity: int
    unit_price: Decimal
    total_price: Decimal


# --- Response ---


class InvoiceResponse(BaseSchema):
    id: UUID
    invoice_number: str
    order: OrderBrief
    subtotal: Decimal
    tax_amount: Decimal
    discount_amount: Decimal
    total_amount: Decimal
    status: str
    issued_at: datetime | None = None
    paid_at: datetime | None = None
    items: list[InvoiceItemResponse] = []
