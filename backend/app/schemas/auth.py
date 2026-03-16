from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel

from app.schemas import BaseSchema


# --- Requests ---


class LoginRequest(BaseModel):
    username: str
    password: str


# --- Responses ---


class UserBriefAuth(BaseSchema):
    """User info embedded in login response."""

    id: UUID
    username: str
    full_name: str
    role: str
    role_display_name: str | None = None
    permissions: dict


class TokenResponse(BaseSchema):
    """Internal response from AuthService.login() — tokens set as cookies, only user sent to client."""
    access_token: str
    refresh_token: str
    expires_in: int
    user: UserBriefAuth


class RefreshResponse(BaseSchema):
    """Internal response from AuthService.refresh_from_token()."""
    access_token: str
    expires_in: int
