from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema


class FinancialYearCreate(BaseModel):
    code: str  # FY2026-27
    start_date: date
    end_date: date
    is_current: bool = False


class FinancialYearUpdate(BaseModel):
    status: str | None = None  # open / closed
    is_current: bool | None = None


class FinancialYearResponse(BaseSchema):
    id: UUID
    code: str
    start_date: date
    end_date: date
    status: str
    is_current: bool
    closed_by: UUID | None = None
    closed_at: datetime | None = None
    created_at: datetime
