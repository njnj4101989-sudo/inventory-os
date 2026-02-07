from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.schemas import BaseSchema


# --- Requests ---


class ReserveItemInput(BaseModel):
    sku_code: str
    quantity: int


class ReserveRequest(BaseModel):
    """POST /external/reserve."""

    external_order_ref: str
    items: list[ReserveItemInput]


class ConfirmRequest(BaseModel):
    """POST /external/confirm."""

    reservation_code: str


class ReleaseRequest(BaseModel):
    """POST /external/release."""

    reservation_code: str


class ReturnExternalItemInput(BaseModel):
    sku_code: str
    quantity: int
    reason: str | None = None


class ReturnExternalRequest(BaseModel):
    """POST /external/return."""

    external_order_ref: str
    items: list[ReturnExternalItemInput]


# --- Responses ---


class StockResponse(BaseSchema):
    """GET /external/stock/{sku_code}."""

    sku_code: str
    product_name: str
    available_qty: int
    price: Decimal | None = None


class ReserveItemResponse(BaseSchema):
    sku_code: str
    quantity: int
    available: bool


class ReserveResponse(BaseSchema):
    reservation_code: str
    status: str
    expires_at: datetime
    items: list[ReserveItemResponse]


class ConfirmResponse(BaseSchema):
    reservation_code: str
    status: str
    order_number: str
    message: str


class ReturnExternalItemResponse(BaseSchema):
    sku_code: str
    quantity: int
    new_available_qty: int
