from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema, PaginatedParams
from app.schemas.lot import LotBrief
from app.schemas.master import DesignBrief
from app.schemas.sku import SKUBrief
from app.schemas.user import UserBrief


# --- Filter ---


class BatchFilterParams(PaginatedParams):
    """GET /batches query parameters with filtering."""

    status: str | None = None
    lot_id: UUID | None = None
    sku_id: UUID | None = None
    size: str | None = None
    location: str | None = None  # 'in_house' | 'out_house' | None (all)


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
    sku_id: UUID | None = None
    piece_count: int
    size: str | None = None
    color_breakdown: dict | None = None  # e.g. {"Green": 100, "Red": 50}
    notes: str | None = None


class BatchAssign(BaseModel):
    """POST /batches/{id}/assign."""

    tailor_id: UUID


class BatchCheck(BaseModel):
    """POST /batches/{id}/check — QC result.

    Per-color mode: send color_qc dict, approved_qty/rejected_qty are auto-computed.
    Legacy flat mode: send approved_qty + rejected_qty directly.
    """

    approved_qty: int | None = None
    rejected_qty: int | None = None
    rejection_reason: str | None = None
    color_qc: dict | None = None  # {color: {expected, approved, rejected, reason}, ...}


class BatchUpdate(BaseModel):
    """PATCH /batches/{id} — update editable batch fields."""

    notes: str | None = None


class BatchPack(BaseModel):
    """POST /batches/{id}/pack — packing confirmation."""

    pack_reference: str | None = None  # optional box/bundle label


# --- Response ---


class BatchResponse(BaseSchema):
    id: UUID
    batch_code: str
    design_no: str | None = None
    design: DesignBrief | None = None
    lot: LotBrief | None = None
    sku: SKUBrief | None = None
    size: str | None = None
    quantity: int
    piece_count: int
    color_breakdown: dict | None = None
    status: str
    qr_code_data: str
    has_pending_va: bool = False
    created_by_user: UserBrief | None = None
    assignment: AssignmentBrief | None = None
    checked_by: UserBrief | None = None
    packed_by: UserBrief | None = None
    packed_at: datetime | None = None
    pack_reference: str | None = None
    rolls_used: list[RollUsedBrief] = []
    processing_logs: list[dict] = []  # BatchProcessingBrief dicts
    created_at: datetime
    assigned_at: datetime | None = None
    started_at: datetime | None = None
    submitted_at: datetime | None = None
    checked_at: datetime | None = None
    completed_at: datetime | None = None
    approved_qty: int | None = None
    rejected_qty: int | None = None
    rejection_reason: str | None = None
    color_qc: dict | None = None
    notes: str | None = None
