from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from typing import Literal

from pydantic import BaseModel

from app.schemas import BaseSchema, PaginatedParams
from app.schemas.sku import SKUBrief
from app.schemas.user import UserBrief


# --- Filter ---


class LotFilterParams(PaginatedParams):
    """GET /lots query parameters with filtering."""

    status: str | None = None
    design_no: str | None = None


# --- Nested ---


class DesignEntry(BaseModel):
    """Single design within a lot — design_no + size breakdown."""
    design_no: str
    size_pattern: dict  # e.g. {"L": 4, "XL": 4}


class LotRollInput(BaseModel):
    """Single roll entry when creating a lot."""

    roll_id: UUID
    palla_weight: Decimal
    size_pattern: dict | None = None  # Override lot default if needed


class LotRollBrief(BaseSchema):
    """Roll info in lot response."""

    id: UUID
    roll_id: UUID
    roll_code: str | None = None
    color: str | None = None
    roll_weight: Decimal | None = None
    palla_weight: Decimal
    num_pallas: int
    weight_used: Decimal
    waste_weight: Decimal
    size_pattern: dict | None = None
    pieces_from_roll: int


class LotBrief(BaseSchema):
    """Nested lot info in batch response."""

    id: UUID
    lot_code: str
    product_type: str = "BLS"
    designs: list[dict] = []
    total_pieces: int
    status: str


# --- Requests ---


class LotCreate(BaseModel):
    """POST /lots — create lot with rolls and one or more designs."""

    sku_id: UUID | None = None
    lot_date: date
    product_type: str = "BLS"
    standard_palla_weight: Decimal | None = None
    standard_palla_meter: Decimal | None = None
    designs: list[DesignEntry]  # At least one design required
    rolls: list[LotRollInput]
    notes: str | None = None


class LotUpdate(BaseModel):
    """PATCH /lots/{id} — update lot metadata and/or status (forward-only)."""

    status: Literal["open", "cutting", "distributed"] | None = None
    standard_palla_weight: Decimal | None = None
    standard_palla_meter: Decimal | None = None
    designs: list[DesignEntry] | None = None
    notes: str | None = None


# --- Response ---


class LotResponse(BaseSchema):
    id: UUID
    lot_code: str
    sku: SKUBrief | None = None
    lot_date: date
    product_type: str = "BLS"
    standard_palla_weight: Decimal | None = None
    standard_palla_meter: Decimal | None = None
    designs: list[dict] = []
    pieces_per_palla: int
    total_pallas: int
    total_pieces: int
    total_weight: Decimal
    status: str
    created_by_user: UserBrief | None = None
    lot_rolls: list[LotRollBrief] = []
    created_at: datetime
    notes: str | None = None
