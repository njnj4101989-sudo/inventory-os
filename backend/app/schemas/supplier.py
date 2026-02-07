from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema


# --- Brief ---


class SupplierBrief(BaseSchema):
    """Nested supplier info in roll responses."""

    id: UUID
    name: str


# --- Requests ---


class SupplierCreate(BaseModel):
    name: str
    contact_person: str | None = None
    phone: str | None = None
    address: str | None = None


class SupplierUpdate(BaseModel):
    name: str | None = None
    contact_person: str | None = None
    phone: str | None = None
    address: str | None = None
    is_active: bool | None = None


# --- Response ---


class SupplierResponse(BaseSchema):
    id: UUID
    name: str
    contact_person: str | None = None
    phone: str | None = None
    address: str | None = None
    is_active: bool
    created_at: datetime
