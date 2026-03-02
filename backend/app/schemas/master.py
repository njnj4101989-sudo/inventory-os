from __future__ import annotations

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


class ProductTypeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class ProductTypeResponse(BaseSchema):
    id: UUID
    code: str
    name: str
    description: str | None = None
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
