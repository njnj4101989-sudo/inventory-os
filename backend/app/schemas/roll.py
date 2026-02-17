from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema, PaginatedParams
from app.schemas.supplier import SupplierBrief
from app.schemas.user import UserBrief


# --- Query Params ---


class RollFilterParams(PaginatedParams):
    """GET /rolls query parameters with filtering."""

    status: str | None = None
    fabric_type: str | None = None  # doubles as search text
    fabric_filter: str | None = None  # exact fabric type match
    has_remaining: bool | None = None
    fully_consumed: bool | None = None
    supplier_id: UUID | None = None
    process_type: str | None = None


# --- Requests ---


class RollCreate(BaseModel):
    """POST /rolls — stock-in a new roll."""

    fabric_type: str
    color: str
    total_weight: Decimal
    unit: str = "kg"
    cost_per_unit: Decimal | None = None
    total_length: Decimal | None = None  # Optional reference length
    supplier_id: UUID | None = None
    supplier_invoice_no: str | None = None
    supplier_invoice_date: date | None = None
    notes: str | None = None
    fabric_code: str | None = None  # Pre-resolved from master DB for roll code gen
    color_code: str | None = None   # Pre-resolved from master DB for roll code gen


class RollUpdate(BaseModel):
    """PATCH /rolls/{id} — update an unused roll."""

    fabric_type: str | None = None
    color: str | None = None
    total_weight: Decimal | None = None
    unit: str | None = None
    cost_per_unit: Decimal | None = None
    total_length: Decimal | None = None
    supplier_id: UUID | None = None
    supplier_invoice_no: str | None = None
    supplier_invoice_date: date | None = None
    notes: str | None = None


# --- Nested ---


class ConsumptionBrief(BaseSchema):
    """Roll consumption record nested in roll detail."""

    batch_code: str
    pieces_cut: int
    length_used: Decimal | None = None
    cut_at: datetime


class ProcessingBrief(BaseSchema):
    """Processing log nested in roll detail."""

    id: UUID
    process_type: str
    vendor_name: str
    sent_date: date
    received_date: date | None = None
    weight_before: Decimal
    weight_after: Decimal | None = None
    processing_cost: Decimal | None = None
    status: str


# --- Responses ---


class RollResponse(BaseSchema):
    id: UUID
    roll_code: str
    fabric_type: str
    color: str
    total_weight: Decimal
    remaining_weight: Decimal
    unit: str
    cost_per_unit: Decimal | None = None
    total_length: Decimal | None = None
    status: str = "in_stock"
    supplier: SupplierBrief | None = None
    supplier_invoice_no: str | None = None
    supplier_invoice_date: date | None = None
    received_by_user: UserBrief | None = None
    received_at: datetime
    notes: str | None = None


class RollDetail(RollResponse):
    """GET /rolls/{id} — includes consumption + processing history."""

    consumption_history: list[ConsumptionBrief] = []
    processing_history: list[ProcessingBrief] = []


# --- Processing Requests ---


class SendForProcessing(BaseModel):
    process_type: str  # embroidery, digital_print, dyeing, other
    vendor_name: str
    vendor_phone: str | None = None
    sent_date: date
    notes: str | None = None


class ReceiveFromProcessing(BaseModel):
    received_date: date
    weight_after: Decimal
    length_after: Decimal | None = None
    processing_cost: Decimal | None = None
    notes: str | None = None


class ProcessingResponse(BaseSchema):
    id: UUID
    roll_id: UUID
    process_type: str
    vendor_name: str
    vendor_phone: str | None = None
    sent_date: date
    received_date: date | None = None
    weight_before: Decimal
    weight_after: Decimal | None = None
    length_before: Decimal | None = None
    length_after: Decimal | None = None
    processing_cost: Decimal | None = None
    status: str
    notes: str | None = None
