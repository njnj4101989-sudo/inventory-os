"""Batch Challan + BatchProcessing schemas.

Mirrors job_challan.py pattern but for garment-level VA (pieces, not weight).
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema, PaginatedParams


# --- Filter ---


class BatchChallanFilterParams(PaginatedParams):
    va_party_id: UUID | None = None
    value_addition_id: UUID | None = None
    status: str | None = None  # 'sent' | 'partially_received' | 'received'


# --- Nested / Brief ---


class BatchChallanBatchEntry(BaseModel):
    """Input: one batch in a challan create request."""
    batch_id: UUID
    pieces_to_send: int


class BatchChallanReceiveEntry(BaseModel):
    """Input: one batch in a challan receive request."""
    batch_id: UUID
    pieces_received: int
    pieces_damaged: int | None = None  # pieces lost/damaged during VA
    damage_reason: str | None = None  # shrinkage, color_bleeding, stain, tear, wrong_process, lost, other
    cost: Decimal | None = None


class BatchProcessingBrief(BaseSchema):
    """Nested in BatchResponse.processing_logs[]."""
    id: UUID
    batch_challan_id: UUID
    challan_no: str | None = None
    value_addition: dict | None = None  # { id, name, short_code }
    va_party: dict | None = None
    pieces_sent: int
    pieces_received: int | None = None
    cost: Decimal | None = None
    status: str
    phase: str
    sent_date: date | None = None
    received_date: date | None = None
    notes: str | None = None


class BatchItemBrief(BaseSchema):
    """One batch entry in challan response."""
    id: UUID
    batch: dict | None = None  # { id, batch_code, size }
    pieces_sent: int
    pieces_received: int | None = None
    cost: Decimal | None = None
    status: str
    phase: str


# --- Requests ---


class BatchChallanCreate(BaseModel):
    va_party_id: UUID
    value_addition_id: UUID
    batches: list[BatchChallanBatchEntry]
    notes: str | None = None
    # S121 — totals are computed at receive (subtotal = SUM(batch_items.cost)),
    # but gst/disc/add are entered up-front so the VA party knows the math.
    gst_percent: Decimal | None = None
    discount_amount: Decimal | None = None
    additional_amount: Decimal | None = None


class BatchChallanUpdate(BaseModel):
    va_party_id: UUID | None = None
    value_addition_id: UUID | None = None
    notes: str | None = None
    gst_percent: Decimal | None = None
    discount_amount: Decimal | None = None
    additional_amount: Decimal | None = None


class BatchChallanReceive(BaseModel):
    batches: list[BatchChallanReceiveEntry]
    notes: str | None = None


# --- Responses ---


class BatchChallanResponse(BaseSchema):
    id: UUID
    challan_no: str
    va_party: dict | None = None
    value_addition: dict | None = None  # { id, name, short_code }
    total_pieces: int
    status: str
    sent_date: date | None = None
    received_date: date | None = None
    notes: str | None = None
    created_by_user: dict | None = None  # { id, full_name }
    created_at: datetime
    batch_items: list[BatchItemBrief] = []
    # S121 — totals stack (replaces flat total_cost)
    gst_percent: Decimal = Decimal("0")
    subtotal: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    additional_amount: Decimal = Decimal("0")
    taxable_amount: Decimal = Decimal("0")  # derived: subtotal − discount + additional
    tax_amount: Decimal = Decimal("0")
    total_amount: Decimal = Decimal("0")
