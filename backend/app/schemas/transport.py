from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema


class TransportBrief(BaseSchema):
    """Nested transport info in order/invoice responses."""
    id: UUID
    name: str
    phone: str | None = None
    city: str | None = None
    gst_no: str | None = None


class TransportCreate(BaseModel):
    name: str
    contact_person: str | None = None
    phone: str | None = None
    phone_alt: str | None = None
    email: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    pin_code: str | None = None
    gst_no: str | None = None
    gst_type: str | None = None
    state_code: str | None = None
    pan_no: str | None = None
    aadhar_no: str | None = None
    opening_balance: Decimal | None = None
    balance_type: str | None = None
    notes: str | None = None


class TransportUpdate(BaseModel):
    name: str | None = None
    contact_person: str | None = None
    phone: str | None = None
    phone_alt: str | None = None
    email: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    pin_code: str | None = None
    gst_no: str | None = None
    gst_type: str | None = None
    state_code: str | None = None
    pan_no: str | None = None
    aadhar_no: str | None = None
    opening_balance: Decimal | None = None
    balance_type: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class TransportResponse(BaseSchema):
    id: UUID
    name: str
    contact_person: str | None = None
    phone: str | None = None
    phone_alt: str | None = None
    email: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    pin_code: str | None = None
    gst_no: str | None = None
    gst_type: str | None = None
    state_code: str | None = None
    pan_no: str | None = None
    aadhar_no: str | None = None
    opening_balance: Decimal | None = None
    balance_type: str | None = None
    notes: str | None = None
    is_active: bool = True
    created_at: datetime
