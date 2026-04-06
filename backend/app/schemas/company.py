from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema


class CompanyUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    pin_code: str | None = None
    gst_no: str | None = None
    state_code: str | None = None
    pan_no: str | None = None
    phone: str | None = None
    email: str | None = None
    logo_url: str | None = None
    bank_name: str | None = None
    bank_account: str | None = None
    bank_ifsc: str | None = None
    bank_branch: str | None = None
    upi_id: str | None = None


class CompanyResponse(BaseSchema):
    id: UUID
    name: str
    slug: str | None = None
    schema_name: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    pin_code: str | None = None
    gst_no: str | None = None
    state_code: str | None = None
    pan_no: str | None = None
    phone: str | None = None
    email: str | None = None
    logo_url: str | None = None
    bank_name: str | None = None
    bank_account: str | None = None
    bank_ifsc: str | None = None
    bank_branch: str | None = None
    upi_id: str | None = None
    is_active: bool = True


class CompanyCreate(BaseModel):
    name: str
    copy_from_company_id: UUID | None = None
    inherit_masters: list[str] | None = None  # ["colors", "fabrics", "suppliers", ...]
    address: str | None = None
    city: str | None = None
    state: str | None = None
    pin_code: str | None = None
    gst_no: str | None = None
    state_code: str | None = None
    pan_no: str | None = None
    phone: str | None = None
    email: str | None = None
