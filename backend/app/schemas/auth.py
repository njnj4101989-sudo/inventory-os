from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema


# --- Requests ---


class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


# --- Responses ---


class UserBriefAuth(BaseSchema):
    """User info embedded in login response."""

    id: UUID
    username: str
    full_name: str
    role: str
    permissions: dict


class TokenResponse(BaseSchema):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserBriefAuth


class RefreshResponse(BaseSchema):
    access_token: str
    expires_in: int
