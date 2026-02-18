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
    email: str | None = None
    gst_no: str | None = None
    pan_no: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    pin_code: str | None = None
    broker: str | None = None
    hsn_code: str | None = None


class SupplierUpdate(BaseModel):
    name: str | None = None
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    gst_no: str | None = None
    pan_no: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    pin_code: str | None = None
    broker: str | None = None
    hsn_code: str | None = None
    is_active: bool | None = None


# --- Response ---


class SupplierResponse(BaseSchema):
    id: UUID
    name: str
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    gst_no: str | None = None
    pan_no: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    pin_code: str | None = None
    broker: str | None = None
    hsn_code: str | None = None
    is_active: bool
    created_at: datetime
