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


class JobChallanUpdate(BaseModel):
    va_party_id: UUID | None = None
    value_addition_id: UUID | None = None
    sent_date: date | None = None
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
    notes: str | None = None
    created_by_user: dict | None = None
    created_at: datetime
    rolls: list[JobChallanRollBrief] = []
    total_weight: float = 0
    roll_count: int = 0
