from __future__ import annotations

from uuid import UUID

from app.schemas import BaseSchema


class RoleBrief(BaseSchema):
    """Nested role in user responses."""

    id: UUID
    name: str


class RoleResponse(BaseSchema):
    id: UUID
    name: str
    permissions: dict
