"""Shared FastAPI dependencies — auth, DB session, RBAC.

Routes import from here:
    from app.dependencies import get_db, get_current_user, require_permission, require_role
"""

from uuid import UUID as PyUUID

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import ExpiredSignatureError, JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db  # re-export so routes have a single import point
from app.core.security import verify_token
from app.core.exceptions import ForbiddenError, TokenExpiredError, UnauthorizedError
from app.models.user import User

__all__ = ["get_db", "get_current_user", "require_permission", "require_role"]

_bearer = HTTPBearer()


# ---------------------------------------------------------------------------
# Current user (JWT verify + DB lookup)
# ---------------------------------------------------------------------------

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Verify access token and load user from DB with role eagerly loaded."""
    token = credentials.credentials

    # Decode JWT
    try:
        payload = verify_token(token)
    except ExpiredSignatureError:
        raise TokenExpiredError("Token expired, use refresh endpoint")
    except JWTError:
        raise UnauthorizedError("Invalid or malformed token")

    # Must be an access token, not a refresh token
    if payload.get("type") != "access":
        raise UnauthorizedError("Invalid token type")

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise UnauthorizedError("Invalid token payload")

    # Convert string UUID from JWT to proper UUID object (SQLite stores UUIDs as bytes)
    try:
        user_id = PyUUID(user_id_str)
    except ValueError:
        raise UnauthorizedError("Invalid user ID in token")

    # Load user + role in one query
    stmt = (
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.role))
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None:
        raise UnauthorizedError("User not found")
    if not user.is_active:
        raise UnauthorizedError("User account is deactivated")

    # Stash decoded claims for downstream permission checks (avoids re-decode)
    user._token_claims = payload  # type: ignore[attr-defined]
    return user


# ---------------------------------------------------------------------------
# Permission / role gates
# ---------------------------------------------------------------------------

def require_permission(permission: str):
    """Dependency that checks a single permission from JWT claims.

    Usage in routes:
        current_user: User = require_permission("stock_in")
    """
    async def _check(current_user: User = Depends(get_current_user)) -> User:
        claims = getattr(current_user, "_token_claims", {})
        if permission not in claims.get("permissions", []):
            raise ForbiddenError(f"Permission '{permission}' required")
        return current_user

    return Depends(_check)


def require_role(*roles: str):
    """Dependency that checks if user's role is in the allowed list.

    Usage in routes:
        current_user: User = require_role("admin", "supervisor")
    """
    async def _check(current_user: User = Depends(get_current_user)) -> User:
        claims = getattr(current_user, "_token_claims", {})
        if claims.get("role") not in roles:
            raise ForbiddenError(f"Role must be one of: {', '.join(roles)}")
        return current_user

    return Depends(_check)
