"""Shared FastAPI dependencies — auth, DB session, RBAC.

Routes import from here:
    from app.dependencies import get_db, get_current_user, require_permission, require_role
"""

from uuid import UUID as PyUUID

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import ExpiredSignatureError, JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db  # re-export so routes have a single import point
from app.core.security import verify_token, ACCESS_COOKIE_NAME
from app.core.exceptions import ForbiddenError, TokenExpiredError, UnauthorizedError, ValidationError
from app.models.user import User

__all__ = ["get_db", "get_current_user", "require_permission", "require_role", "get_fy_id"]

# Bearer header is now optional — cookies are primary
_bearer = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Extract JWT — cookie first, then Authorization header fallback
# ---------------------------------------------------------------------------

def _extract_token(request: Request, credentials: HTTPAuthorizationCredentials | None) -> str:
    """Get JWT from HttpOnly cookie, falling back to Authorization header."""
    # 1. HttpOnly cookie (primary — set by login/refresh)
    token = request.cookies.get(ACCESS_COOKIE_NAME)
    if token:
        return token

    # 2. Authorization: Bearer header (fallback — for SSE query param rewrite, etc.)
    if credentials and credentials.credentials:
        return credentials.credentials

    raise UnauthorizedError("Not authenticated")


# ---------------------------------------------------------------------------
# Current user (JWT verify + DB lookup)
# ---------------------------------------------------------------------------

async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Verify access token and load user from DB with role eagerly loaded."""
    token = _extract_token(request, credentials)

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

    # Check if token has been blacklisted (logout invalidation)
    jti = payload.get("jti")
    if jti:
        from app.models.token_blacklist import TokenBlacklist
        bl_check = await db.execute(
            select(TokenBlacklist.id).where(TokenBlacklist.jti == jti).limit(1)
        )
        if bl_check.scalar_one_or_none() is not None:
            raise UnauthorizedError("Token has been revoked. Please login again.")

    user_id_str = payload.get("sub")
    if not user_id_str:
        raise UnauthorizedError("Invalid token payload")

    # Convert string UUID from JWT to proper UUID object
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


def require_any_permission(*permissions: str):
    """Dependency that checks if user has ANY of the listed permissions.

    Usage in routes:
        current_user: User = require_any_permission("batch_send_va", "batch_receive_va")
    """
    async def _check(current_user: User = Depends(get_current_user)) -> User:
        claims = getattr(current_user, "_token_claims", {})
        user_perms = claims.get("permissions", [])
        if not any(p in user_perms for p in permissions):
            raise ForbiddenError(f"One of permissions required: {', '.join(permissions)}")
        return current_user

    return Depends(_check)


# ---------------------------------------------------------------------------
# Financial Year extraction from JWT
# ---------------------------------------------------------------------------

def get_fy_id(user: User) -> PyUUID:
    """Extract fy_id from JWT claims. Raises clear error if not set.

    Call from routes as: fy_id = get_fy_id(current_user)
    """
    claims = getattr(user, "_token_claims", {})
    fy_id_str = claims.get("fy_id")
    if not fy_id_str:
        raise ValidationError(
            "No financial year selected. Please select a company with an active "
            "financial year from the company switcher before performing this action."
        )
    try:
        return PyUUID(fy_id_str)
    except (ValueError, AttributeError):
        raise ValidationError(
            "Invalid financial year in session. Please re-login or switch company "
            "to refresh your session."
        )


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
