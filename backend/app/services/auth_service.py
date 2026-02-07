"""Authentication service — login, token refresh, logout."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse, RefreshResponse


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def login(self, req: LoginRequest) -> TokenResponse:
        """Authenticate user, return access + refresh tokens with user info.

        Steps:
        1. Fetch user by username (with role eagerly loaded)
        2. Verify password hash via core/security.verify_password
        3. Build JWT payload via core/security.build_token_payload
        4. Create access + refresh tokens
        5. Return TokenResponse
        Raises: UnauthorizedError if credentials invalid or user inactive.
        """
        raise NotImplementedError

    async def refresh(self, req: RefreshRequest) -> RefreshResponse:
        """Validate refresh token and return new access token.

        Steps:
        1. Decode refresh token via core/security.verify_token
        2. Verify type == "refresh"
        3. Load user from DB to confirm still active
        4. Create new access token
        5. Return RefreshResponse
        Raises: TokenExpiredError, UnauthorizedError.
        """
        raise NotImplementedError

    async def logout(self, user_id: UUID) -> None:
        """Blacklist current access token (placeholder for token blacklist).

        For MVP: no-op. Future: add token jti to blacklist table/cache.
        """
        raise NotImplementedError
