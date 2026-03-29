from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema, PaginatedParams


class ReturnNoteFilterParams(PaginatedParams):
    status: str | None = None
    return_type: str | None = None
    supplier_id: UUID | None = None
    search: str | None = None


class ReturnNoteItemInput(BaseModel):
    roll_id: UUID | None = None
    sku_id: UUID | None = None
    quantity: int = 1
    weight: Decimal | None = None
    unit_price: Decimal | None = None
    reason: str | None = None  # defective, excess, wrong_material, damaged_in_transit, quality_reject
    condition: str | None = None
    notes: str | None = None


class ReturnNoteCreate(BaseModel):
    return_type: str  # roll_return | sku_return
    supplier_id: UUID
    return_date: date | None = None
    transport_id: UUID | None = None
    lr_number: str | None = None
    gst_percent: Decimal | None = None
    items: list[ReturnNoteItemInput]
    notes: str | None = None


class ReturnNoteUpdate(BaseModel):
    return_date: date | None = None
    transport_id: UUID | None = None
    lr_number: str | None = None
    notes: str | None = None


class ReturnNoteItemResponse(BaseSchema):
    id: UUID
    roll: dict | None = None
    sku: dict | None = None
    quantity: int = 1
    weight: Decimal | None = None
    unit_price: Decimal | None = None
    amount: Decimal | None = None
    reason: str | None = None
    condition: str | None = None
    notes: str | None = None


class ReturnNoteResponse(BaseSchema):
    id: UUID
    return_note_no: str
    return_type: str
    supplier: dict | None = None
    status: str
    return_date: date | None = None
    approved_by_user: dict | None = None
    approved_at: datetime | None = None
    dispatch_date: date | None = None
    transport: dict | None = None
    lr_number: str | None = None
    total_amount: Decimal | None = None
    gst_percent: Decimal | None = None
    subtotal: Decimal | None = None
    tax_amount: Decimal | None = None
    debit_note_no: str | None = None
    notes: str | None = None
    created_by_user: dict | None = None
    created_at: datetime | None = None
    items: list[dict] = []
