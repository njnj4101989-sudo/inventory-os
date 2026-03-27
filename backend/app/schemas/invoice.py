from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema, PaginatedParams
from app.schemas.order import OrderBrief
from app.schemas.sku import SKUBrief


# --- Request ---


class InvoiceItemInput(BaseModel):
    """Single item in standalone invoice creation."""

    sku_id: UUID
    quantity: int
    unit_price: Decimal


class InvoiceCreate(BaseModel):
    """POST /invoices — standalone invoice (no order)."""

    customer_id: UUID
    customer_name: str | None = None
    customer_phone: str | None = None
    customer_address: str | None = None
    gst_percent: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    payment_terms: str | None = None
    place_of_supply: str | None = None
    items: list[InvoiceItemInput]
    notes: str | None = None


class InvoiceFromOrder(BaseModel):
    """POST /invoices/from-order — generate invoice from existing order."""

    order_id: UUID
    payment_terms: str | None = None
    place_of_supply: str | None = None
    notes: str | None = None


class InvoiceUpdate(BaseModel):
    """PATCH /invoices/:id — edit draft/issued invoices."""

    customer_name: str | None = None
    customer_phone: str | None = None
    customer_address: str | None = None
    gst_percent: Decimal | None = None
    discount_amount: Decimal | None = None
    payment_terms: str | None = None
    place_of_supply: str | None = None
    notes: str | None = None
    due_date: date | None = None


# --- Filter Params ---


class InvoiceFilterParams(PaginatedParams):
    """Query parameters for invoice listing."""

    status: str | None = None
    search: str | None = None


# --- Nested ---


class InvoiceItemResponse(BaseSchema):
    """Single item in invoice response."""

    sku: SKUBrief
    hsn_code: str | None = None
    quantity: int
    unit_price: Decimal
    total_price: Decimal


# --- Response ---


class InvoiceResponse(BaseSchema):
    id: UUID
    invoice_number: str
    gst_percent: Decimal = Decimal("0")
    order: OrderBrief | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    customer_address: str | None = None
    subtotal: Decimal
    tax_amount: Decimal
    discount_amount: Decimal
    total_amount: Decimal
    status: str
    due_date: date | None = None
    payment_terms: str | None = None
    place_of_supply: str | None = None
    issued_at: datetime | None = None
    paid_at: datetime | None = None
    notes: str | None = None
    items: list[InvoiceItemResponse] = []
    created_at: datetime | None = None
