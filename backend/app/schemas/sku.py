from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema


# --- Brief ---


class SKUBrief(BaseSchema):
    """Nested SKU info in batch, order, inventory responses."""

    id: UUID
    sku_code: str
    product_name: str
    color: str | None = None
    size: str | None = None
    base_price: Decimal | None = None


class StockBrief(BaseSchema):
    """Nested stock levels in SKU listing."""

    total_qty: int = 0
    available_qty: int = 0
    reserved_qty: int = 0


# --- Requests ---


class SKUCreate(BaseModel):
    product_type: str
    product_name: str
    color: str
    color_id: UUID | None = None
    size: str
    description: str | None = None
    base_price: Decimal | None = None


class SKUUpdate(BaseModel):
    product_name: str | None = None
    description: str | None = None
    base_price: Decimal | None = None
    is_active: bool | None = None


# --- Response ---


class SKUResponse(BaseSchema):
    id: UUID
    sku_code: str
    product_type: str
    product_name: str
    color: str
    color_id: UUID | None = None
    size: str
    description: str | None = None
    base_price: Decimal | None = None
    is_active: bool
    stock: StockBrief | None = None
