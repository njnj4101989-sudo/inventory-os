from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema, PaginatedParams


# --- Query Params ---

class JobChallanFilterParams(PaginatedParams):
    vendor_name: str | None = None
    value_addition_id: UUID | None = None


# --- Requests ---

class JobChallanCreate(BaseModel):
    value_addition_id: UUID
    vendor_name: str
    vendor_phone: str | None = None
    sent_date: date
    notes: str | None = None
    roll_ids: list[UUID]


# --- Responses ---

class JobChallanRollBrief(BaseSchema):
    id: UUID
    roll_code: str
    enhanced_roll_code: str | None = None
    fabric_type: str
    color: str
    current_weight: float


class JobChallanResponse(BaseSchema):
    id: UUID
    challan_no: str
    value_addition: dict | None = None
    vendor_name: str
    vendor_phone: str | None = None
    sent_date: date
    notes: str | None = None
    created_by_user: dict | None = None
    created_at: datetime
    rolls: list[JobChallanRollBrief] = []
    total_weight: float = 0
    roll_count: int = 0
