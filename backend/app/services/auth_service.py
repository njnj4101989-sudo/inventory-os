"""Authentication service — login, token refresh, logout."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import User
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse, RefreshResponse, UserBriefAuth
from app.core.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    verify_token,
    build_token_payload,
)
from app.core.permissions import get_role_permissions, get_role_permission_list, ALL_PERMISSIONS
from app.core.exceptions import UnauthorizedError, TokenExpiredError
from app.config import get_settings

settings = get_settings()


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def login(self, req: LoginRequest) -> TokenResponse:
        stmt = (
            select(User)
            .where(User.username == req.username)
            .options(selectinload(User.role))
        )
        result = await self.db.execute(stmt)
        user = result.scalar_one_or_none()

        if user is None or not verify_password(req.password, user.password_hash):
            raise UnauthorizedError("Invalid username or password")

        if not user.is_active:
            raise UnauthorizedError("User account is deactivated")

        role_name = user.role.name if user.role else "unknown"

        # Read permissions: merge DB overrides with hardcoded defaults.
        # This ensures new permissions added to the codebase are automatically
        # available without requiring a manual role update in the UI.
        hardcoded = set(get_role_permission_list(role_name))
        db_permissions = user.role.permissions if user.role and user.role.permissions else None
        if db_permissions and isinstance(db_permissions, dict):
            # Start with hardcoded defaults, then apply DB overrides
            merged = set(hardcoded)
            for perm_name, granted in db_permissions.items():
                if granted:
                    merged.add(perm_name)
                else:
                    merged.discard(perm_name)
            permissions = list(merged)
        else:
            permissions = list(hardcoded)

        # Build full permission map for frontend (all keys, True/False)
        permissions_map = {perm: perm in permissions for perm in ALL_PERMISSIONS}

        payload = build_token_payload(
            user_id=str(user.id),
            username=user.username,
            role=role_name,
            permissions=permissions,
        )

        access_token = create_access_token(payload)
        refresh_token = create_refresh_token(payload)

        user_brief = UserBriefAuth(
            id=user.id,
            username=user.username,
            full_name=user.full_name,
            role=role_name,
            role_display_name=user.role.display_name if user.role else None,
            permissions=permissions_map,
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=user_brief,
        )

    async def refresh(self, req: RefreshRequest) -> RefreshResponse:
        from jose import JWTError, ExpiredSignatureError

        try:
            payload = verify_token(req.refresh_token)
        except ExpiredSignatureError:
            raise TokenExpiredError("Refresh token expired, please login again")
        except JWTError:
            raise UnauthorizedError("Invalid refresh token")

        if payload.get("type") != "refresh":
            raise UnauthorizedError("Invalid token type — expected refresh token")

        user_id_str = payload.get("sub")
        if not user_id_str:
            raise UnauthorizedError("Invalid token payload")

        from uuid import UUID as PyUUID
        try:
            user_id = PyUUID(user_id_str)
        except ValueError:
            raise UnauthorizedError("Invalid user ID in token")

        stmt = (
            select(User)
            .where(User.id == user_id)
            .options(selectinload(User.role))
        )
        result = await self.db.execute(stmt)
        user = result.scalar_one_or_none()

        if user is None:
            raise UnauthorizedError("User not found")
        if not user.is_active:
            raise UnauthorizedError("User account is deactivated")

        role_name = user.role.name if user.role else "unknown"

        # Read permissions from DB (same logic as login)
        db_permissions = user.role.permissions if user.role and user.role.permissions else None
        if db_permissions and isinstance(db_permissions, dict):
            permissions = [k for k, v in db_permissions.items() if v]
        else:
            permissions = get_role_permission_list(role_name)

        new_payload = build_token_payload(
            user_id=str(user.id),
            username=user.username,
            role=role_name,
            permissions=permissions,
        )

        access_token = create_access_token(new_payload)

        return RefreshResponse(
            access_token=access_token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    async def logout(self, user_id: UUID) -> None:
        # MVP: no-op. Future: add token jti to blacklist table/cache.
        pass
