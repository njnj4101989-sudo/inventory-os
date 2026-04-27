from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema, PaginatedParams


# --- Query Params ---

class JobChallanFilterParams(PaginatedParams):
    va_party_id: UUID | None = None
    value_addition_id: UUID | None = None
    status: str | None = None  # 'sent' | 'partially_received' | 'received'


# --- Requests ---

class JobChallanRollEntry(BaseModel):
    roll_id: UUID
    weight_to_send: Decimal | None = None  # None = full remaining weight

class JobChallanCreate(BaseModel):
    value_addition_id: UUID
    va_party_id: UUID
    sent_date: date
    notes: str | None = None
    rolls: list[JobChallanRollEntry]
    # S121 — totals are computed at receive (subtotal = SUM(processing_cost)),
    # but gst/disc/add are entered up-front so the VA party knows the math.
    gst_percent: Decimal | None = None
    discount_amount: Decimal | None = None
    additional_amount: Decimal | None = None


class JobChallanUpdate(BaseModel):
    va_party_id: UUID | None = None
    value_addition_id: UUID | None = None
    sent_date: date | None = None
    notes: str | None = None
    gst_percent: Decimal | None = None
    discount_amount: Decimal | None = None
    additional_amount: Decimal | None = None


# --- Receive ---

class JobChallanReceiveEntry(BaseModel):
    """One roll in a challan receive request."""
    roll_id: UUID
    processing_id: UUID
    weight_after: Decimal
    processing_cost: Decimal | None = None
    weight_damaged: Decimal | None = None  # weight lost/damaged during VA
    damage_reason: str | None = None  # shrinkage, color_bleeding, stain, tear, wrong_process, lost, other
    notes: str | None = None


class JobChallanReceive(BaseModel):
    received_date: date
    rolls: list[JobChallanReceiveEntry]
    notes: str | None = None


# --- Responses ---

class JobChallanRollBrief(BaseSchema):
    id: UUID
    roll_code: str
    enhanced_roll_code: str | None = None
    fabric_type: str
    color: str
    current_weight: float
    weight_sent: float | None = None  # partial weight sent for this challan


class JobChallanResponse(BaseSchema):
    id: UUID
    challan_no: str
    value_addition: dict | None = None
    va_party: dict | None = None
    sent_date: date
    received_date: date | None = None
    status: str = "sent"  # 'sent' | 'partially_received' | 'received'
    notes: str | None = None
    created_by_user: dict | None = None
    created_at: datetime
    rolls: list[JobChallanRollBrief] = []
    total_weight: float = 0
    roll_count: int = 0
    # S121 — totals stack
    gst_percent: Decimal = Decimal("0")
    subtotal: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    additional_amount: Decimal = Decimal("0")
    taxable_amount: Decimal = Decimal("0")  # derived: subtotal − discount + additional
    tax_amount: Decimal = Decimal("0")
    total_amount: Decimal = Decimal("0")
