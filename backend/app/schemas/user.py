from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema
from app.schemas.role import RoleBrief


# --- Brief (nested in other responses) ---


class UserBrief(BaseSchema):
    """Minimal user info nested in rolls, batches, events, etc."""

    id: UUID
    full_name: str


# --- Requests ---


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role_id: UUID
    phone: str | None = None


class UserUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    is_active: bool | None = None
    role_id: UUID | None = None


# --- Response ---


class UserResponse(BaseSchema):
    id: UUID
    username: str
    full_name: str
    role: RoleBrief | None = None
    phone: str | None = None
    is_active: bool
    created_at: datetime
