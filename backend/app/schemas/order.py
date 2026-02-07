from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema
from app.schemas.sku import SKUBrief


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


class ReturnItemInput(BaseModel):
    """Single item in return request."""

    sku_id: UUID
    quantity: int
    reason: str | None = None


# --- Requests ---


class OrderCreate(BaseModel):
    """POST /orders."""

    source: str  # web, ecommerce, walk_in
    customer_name: str | None = None
    customer_phone: str | None = None
    customer_address: str | None = None
    items: list[OrderItemInput]
    notes: str | None = None


class ReturnRequest(BaseModel):
    """POST /orders/{id}/return."""

    items: list[ReturnItemInput]


# --- Response ---


class OrderResponse(BaseSchema):
    id: UUID
    order_number: str
    source: str
    external_order_ref: str | None = None
    customer_name: str | None = None
    customer_phone: str | None = None
    status: str
    items: list[OrderItemResponse] = []
    total_amount: Decimal | None = None
    created_at: datetime
