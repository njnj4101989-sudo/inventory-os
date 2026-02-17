from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema, PaginatedParams
from app.schemas.sku import SKUBrief
from app.schemas.user import UserBrief


# --- Query Params ---


class InventoryFilterParams(PaginatedParams):
    """GET /inventory query parameters with filtering."""

    sku_code: str | None = None  # search text (sku_code or product_name)
    product_type: str | None = None  # exact product_type prefix (BLS, KRT, etc.)
    stock_status: str | None = None  # healthy, low, critical


# --- Requests ---


class AdjustRequest(BaseModel):
    """POST /inventory/adjust — manual stock correction."""

    event_type: str  # LOSS, RETURN, etc.
    item_type: str  # raw_material, finished_goods
    sku_id: UUID
    quantity: int
    reason: str


# --- Responses ---


class InventoryResponse(BaseSchema):
    """Single SKU stock level."""

    sku: SKUBrief
    total_qty: int
    available_qty: int
    reserved_qty: int
    last_updated: datetime


class EventResponse(BaseSchema):
    """Single inventory event."""

    id: UUID
    event_id: str
    event_type: str
    item_type: str
    reference_type: str
    reference_id: UUID
    quantity: int
    performed_by: UserBrief | None = None
    performed_at: datetime
    metadata: dict | None = None


class ReconcileResponse(BaseSchema):
    skus_checked: int
    mismatches_found: int
    mismatches_fixed: int
