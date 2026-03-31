from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema


# ── Product Type ─────────────────────────────────────────


class ProductTypeBrief(BaseSchema):
    id: UUID
    code: str
    name: str


class ProductTypeCreate(BaseModel):
    code: str
    name: str
    description: str | None = None
    palla_mode: str = "weight"  # weight | meter | both


class ProductTypeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    palla_mode: str | None = None
    is_active: bool | None = None


class ProductTypeResponse(BaseSchema):
    id: UUID
    code: str
    name: str
    description: str | None = None
    palla_mode: str = "weight"
    is_active: bool = True


# ── Color ────────────────────────────────────────────────


class ColorBrief(BaseSchema):
    id: UUID
    name: str
    code: str
    color_no: int | None = None


class ColorCreate(BaseModel):
    name: str
    code: str
    color_no: int | None = None
    hex_code: str | None = None


class ColorUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    color_no: int | None = None
    hex_code: str | None = None
    is_active: bool | None = None


class ColorResponse(BaseSchema):
    id: UUID
    name: str
    code: str
    color_no: int | None = None
    hex_code: str | None = None
    is_active: bool = True


# ── Fabric ───────────────────────────────────────────────


class FabricBrief(BaseSchema):
    id: UUID
    name: str
    code: str


class FabricCreate(BaseModel):
    name: str
    code: str
    description: str | None = None


class FabricUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class FabricResponse(BaseSchema):
    id: UUID
    name: str
    code: str
    description: str | None = None
    is_active: bool = True


# ── Design ─────────────────────────────────────────────


class DesignBrief(BaseSchema):
    id: UUID
    design_no: str


class DesignCreate(BaseModel):
    design_no: str
    description: str | None = None


class DesignUpdate(BaseModel):
    design_no: str | None = None
    description: str | None = None
    is_active: bool | None = None


class DesignResponse(BaseSchema):
    id: UUID
    design_no: str
    description: str | None = None
    is_active: bool = True


# ── Value Addition ──────────────────────────────────────


class ValueAdditionBrief(BaseSchema):
    id: UUID
    name: str
    short_code: str
    applicable_to: str = "both"


class ValueAdditionCreate(BaseModel):
    name: str
    short_code: str
    applicable_to: str = "both"  # 'roll' | 'garment' | 'both'
    description: str | None = None


class ValueAdditionUpdate(BaseModel):
    name: str | None = None
    short_code: str | None = None
    applicable_to: str | None = None
    description: str | None = None
    is_active: bool | None = None


class ValueAdditionResponse(BaseSchema):
    id: UUID
    name: str
    short_code: str
    applicable_to: str = "both"
    description: str | None = None
    is_active: bool = True


# ── VA Party ───────────────────────────────────────────


class VAPartyBrief(BaseSchema):
    id: UUID
    name: str
    phone: str | None = None
    city: str | None = None


class VAPartyCreate(BaseModel):
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
    hsn_code: str | None = None
    due_days: int | None = None
    credit_limit: Decimal | None = None
    opening_balance: Decimal | None = None
    balance_type: str | None = None
    tds_applicable: bool = False
    tds_rate: Decimal | None = None
    tds_section: str | None = None
    msme_type: str | None = None
    msme_reg_no: str | None = None
    notes: str | None = None


class VAPartyUpdate(BaseModel):
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
    hsn_code: str | None = None
    due_days: int | None = None
    credit_limit: Decimal | None = None
    opening_balance: Decimal | None = None
    balance_type: str | None = None
    tds_applicable: bool | None = None
    tds_rate: Decimal | None = None
    tds_section: str | None = None
    msme_type: str | None = None
    msme_reg_no: str | None = None
    notes: str | None = None
    is_active: bool | None = None


class VAPartyResponse(BaseSchema):
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
    hsn_code: str | None = None
    due_days: int | None = None
    credit_limit: Decimal | None = None
    opening_balance: Decimal | None = None
    balance_type: str | None = None
    tds_applicable: bool = False
    tds_rate: Decimal | None = None
    tds_section: str | None = None
    msme_type: str | None = None
    msme_reg_no: str | None = None
    notes: str | None = None
    is_active: bool = True
