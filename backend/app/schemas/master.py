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


class ColorCreate(BaseModel):
    name: str
    code: str
    hex_code: str | None = None


class ColorUpdate(BaseModel):
    name: str | None = None
    hex_code: str | None = None
    is_active: bool | None = None


class ColorResponse(BaseSchema):
    id: UUID
    name: str
    code: str
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
