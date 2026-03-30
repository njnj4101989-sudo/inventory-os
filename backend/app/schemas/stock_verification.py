"""Schemas for stock verification (physical count vs book stock)."""
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


class CreateVerificationRequest(BaseModel):
    verification_type: str  # raw_material / finished_goods
    notes: str | None = None


class CountEntry(BaseModel):
    item_id: UUID  # stock_verification_item.id
    physical_qty: Decimal
    notes: str | None = None


class UpdateCountsRequest(BaseModel):
    counts: list[CountEntry]


class VerificationItemResponse(BaseModel):
    id: UUID
    sku_id: UUID | None = None
    roll_id: UUID | None = None
    item_label: str
    book_qty: float
    physical_qty: float | None = None
    variance: float | None = None
    variance_pct: float | None = None
    adjustment_type: str | None = None
    notes: str | None = None


class VerificationResponse(BaseModel):
    id: UUID
    verification_no: str
    verification_type: str
    verification_date: str
    status: str
    notes: str | None = None
    started_by: dict | None = None
    approved_by: dict | None = None
    approved_at: str | None = None
    items: list[VerificationItemResponse] = []
    summary: dict | None = None


class VerificationBrief(BaseModel):
    id: UUID
    verification_no: str
    verification_type: str
    verification_date: str
    status: str
    total_items: int = 0
    mismatches: int = 0
    started_by: str | None = None
