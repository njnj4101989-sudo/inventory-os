from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema
from app.schemas.lot import LotBrief
from app.schemas.sku import SKUBrief
from app.schemas.user import UserBrief


# --- Nested ---


class RollCutInput(BaseModel):
    """Single roll cut entry in batch creation (legacy support)."""

    roll_id: UUID
    pieces_cut: int
    length_used: Decimal | None = None


class AssignmentBrief(BaseSchema):
    """Batch assignment info in response."""

    tailor: UserBrief
    assigned_at: datetime


class RollUsedBrief(BaseSchema):
    """Roll consumption summary in batch response."""

    roll_code: str
    pieces_cut: int
    length_used: Decimal | None = None


# --- Requests ---


class BatchCreate(BaseModel):
    """POST /batches — create batch from a lot."""

    lot_id: UUID
    sku_id: UUID
    piece_count: int
    color_breakdown: dict | None = None  # e.g. {"Green": 100, "Red": 50}
    notes: str | None = None


class BatchAssign(BaseModel):
    """POST /batches/{id}/assign."""

    tailor_id: UUID


class BatchCheck(BaseModel):
    """POST /batches/{id}/check — QC result."""

    approved_qty: int
    rejected_qty: int
    rejection_reason: str | None = None


# --- Response ---


class BatchResponse(BaseSchema):
    id: UUID
    batch_code: str
    lot: LotBrief | None = None
    sku: SKUBrief
    quantity: int
    piece_count: int
    color_breakdown: dict | None = None
    status: str
    qr_code_data: str
    created_by_user: UserBrief | None = None
    assignment: AssignmentBrief | None = None
    rolls_used: list[RollUsedBrief] = []
    created_at: datetime
    assigned_at: datetime | None = None
    started_at: datetime | None = None
    submitted_at: datetime | None = None
    checked_at: datetime | None = None
    completed_at: datetime | None = None
    approved_qty: int | None = None
    rejected_qty: int | None = None
    rejection_reason: str | None = None
    notes: str | None = None
