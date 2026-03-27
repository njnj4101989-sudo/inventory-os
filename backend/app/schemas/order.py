from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema, PaginatedParams
from app.schemas.sku import SKUBrief


# --- Filter Params ---


class OrderFilterParams(PaginatedParams):
    """Query parameters for order listing."""

    status: str | None = None
    source: str | None = None
    search: str | None = None


# --- Brief ---


class OrderBrief(BaseSchema):
    """Nested order info in invoice responses."""

    order_number: str
    customer_name: str | None = None


# --- Nested ---


class OrderItemInput(BaseModel):
    """Single item in order creation."""

    sku_id: UUID
    quantity: int
    unit_price: Decimal


class OrderItemResponse(BaseSchema):
    """Single item in order response."""

    sku: SKUBrief
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    fulfilled_qty: int = 0
    short_qty: int = 0


class ReturnItemInput(BaseModel):
    """Single item in return request."""

    sku_id: UUID
    quantity: int
    reason: str | None = None


# --- Requests ---


class OrderCreate(BaseModel):
    """POST /orders."""

    source: str  # web, ecommerce, walk_in
    customer_id: UUID
    customer_name: str | None = None
    customer_phone: str | None = None
    customer_address: str | None = None
    order_date: date | None = None
    broker_name: str | None = None
    transport: str | None = None
    gst_percent: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    items: list[OrderItemInput]
    notes: str | None = None


class ReturnRequest(BaseModel):
    """POST /orders/{id}/return."""

    items: list[ReturnItemInput]


# --- Response ---


class OrderResponse(BaseSchema):
    id: UUID
    order_number: str
    order_date: date | None = None
    source: str
    external_order_ref: str | None = None
    customer_id: UUID | None = None
    customer: dict | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    customer_address: str | None = None
    broker_name: str | None = None
    transport: str | None = None
    gst_percent: Decimal = Decimal("0")
    status: str
    items: list[OrderItemResponse] = []
    has_shortage: bool = False
    total_amount: Decimal | None = None
    discount_amount: Decimal = Decimal("0")
    notes: str | None = None
    created_at: datetime
