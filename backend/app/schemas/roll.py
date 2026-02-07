from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema
from app.schemas.supplier import SupplierBrief
from app.schemas.user import UserBrief


# --- Requests ---


class RollCreate(BaseModel):
    """POST /rolls — stock-in a new roll."""

    fabric_type: str
    color: str
    total_length: Decimal
    unit: str = "meters"
    cost_per_unit: Decimal | None = None
    supplier_id: UUID | None = None
    notes: str | None = None


# --- Nested ---


class ConsumptionBrief(BaseSchema):
    """Roll consumption record nested in roll detail."""

    batch_code: str
    pieces_cut: int
    length_used: Decimal | None = None
    cut_at: datetime


# --- Responses ---


class RollResponse(BaseSchema):
    id: UUID
    roll_code: str
    fabric_type: str
    color: str
    total_length: Decimal
    remaining_length: Decimal
    unit: str
    cost_per_unit: Decimal | None = None
    supplier: SupplierBrief | None = None
    received_by_user: UserBrief | None = None
    received_at: datetime
    notes: str | None = None


class RollDetail(RollResponse):
    """GET /rolls/{id} — includes consumption history."""

    consumption_history: list[ConsumptionBrief] = []
