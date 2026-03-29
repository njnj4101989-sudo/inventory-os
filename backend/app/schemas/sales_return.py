from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema, PaginatedParams


class SalesReturnFilterParams(PaginatedParams):
    status: str | None = None
    customer_id: UUID | None = None
    order_id: UUID | None = None
    search: str | None = None


class SalesReturnItemInput(BaseModel):
    sku_id: UUID
    quantity_returned: int
    order_item_id: UUID | None = None  # optional — set when return is linked to a specific order
    unit_price: Decimal | None = None  # required for standalone returns (no order), optional if order-linked
    reason: str | None = None  # defective, wrong_item, size_mismatch, color_mismatch, damaged_in_transit, customer_changed_mind, other
    notes: str | None = None


class SalesReturnCreate(BaseModel):
    customer_id: UUID
    order_id: UUID | None = None  # optional — link to source order
    return_date: date | None = None
    transport_id: UUID | None = None
    lr_number: str | None = None
    lr_date: date | None = None
    reason_summary: str | None = None
    items: list[SalesReturnItemInput]


class SalesReturnUpdate(BaseModel):
    transport_id: UUID | None = None
    lr_number: str | None = None
    lr_date: date | None = None
    reason_summary: str | None = None


class InspectItemInput(BaseModel):
    item_id: UUID  # sales_return_item id
    condition: str  # good | damaged | rejected
    quantity_restocked: int = 0
    quantity_damaged: int = 0
    notes: str | None = None


class InspectRequest(BaseModel):
    items: list[InspectItemInput]
    qc_notes: str | None = None


class SalesReturnItemResponse(BaseSchema):
    id: UUID
    order_item: dict | None = None
    sku: dict | None = None
    quantity_returned: int
    quantity_restocked: int = 0
    quantity_damaged: int = 0
    reason: str | None = None
    condition: str = "pending"
    notes: str | None = None


class SalesReturnResponse(BaseSchema):
    id: UUID
    srn_no: str
    order: dict | None = None
    customer: dict | None = None
    status: str
    return_date: date | None = None
    received_date: date | None = None
    inspected_date: date | None = None
    restocked_date: date | None = None
    transport: dict | None = None
    lr_number: str | None = None
    lr_date: date | None = None
    reason_summary: str | None = None
    qc_notes: str | None = None
    total_amount: Decimal | None = None
    credit_note_no: str | None = None
    created_by_user: dict | None = None
    received_by_user: dict | None = None
    inspected_by_user: dict | None = None
    created_at: datetime | None = None
    items: list[dict] = []
