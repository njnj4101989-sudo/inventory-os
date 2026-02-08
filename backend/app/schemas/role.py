from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema


class RoleBrief(BaseSchema):
    """Nested role in user responses — includes display_name for UI."""

    id: UUID
    name: str
    display_name: str | None = None


class RoleResponse(BaseSchema):
    id: UUID
    name: str
    display_name: str | None = None
    permissions: dict
    user_count: int = 0


class RoleCreate(BaseModel):
    name: str
    display_name: str | None = None
    permissions: dict


class RoleUpdate(BaseModel):
    display_name: str | None = None
    permissions: dict | None = None
