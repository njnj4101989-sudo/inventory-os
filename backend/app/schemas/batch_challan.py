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
    status: str | None = None  # 'sent' | 'received'


# --- Nested / Brief ---


class BatchChallanBatchEntry(BaseModel):
    """Input: one batch in a challan create request."""
    batch_id: UUID
    pieces_to_send: int


class BatchChallanReceiveEntry(BaseModel):
    """Input: one batch in a challan receive request."""
    batch_id: UUID
    pieces_received: int
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


class BatchChallanUpdate(BaseModel):
    va_party_id: UUID | None = None
    value_addition_id: UUID | None = None
    notes: str | None = None


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
    total_cost: Decimal | None = None
    status: str
    sent_date: date | None = None
    received_date: date | None = None
    notes: str | None = None
    created_by_user: dict | None = None  # { id, full_name }
    created_at: datetime
    batch_items: list[BatchItemBrief] = []
