"""JWT token creation/verification, password hashing, and cookie configuration.

Uses python-jose (HS256) and passlib (bcrypt).
Config values sourced from app.config.Settings.
"""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Response
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

settings = get_settings()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ---------------------------------------------------------------------------
# Cookie configuration
# ---------------------------------------------------------------------------

_is_prod = settings.APP_ENV == "production"

COOKIE_SETTINGS = {
    "httponly": True,
    "secure": _is_prod,                        # HTTPS only in production
    "samesite": "none" if _is_prod else "lax", # None for cross-origin prod (Vercel→EC2), Lax for localhost dev
}

ACCESS_COOKIE_NAME = "access_token"
REFRESH_COOKIE_NAME = "refresh_token"


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def create_access_token(
    data: dict,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a short-lived access token (default: ACCESS_TOKEN_EXPIRE_MINUTES)."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta
        if expires_delta is not None
        else timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc), "type": "access", "jti": str(uuid.uuid4())})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(data: dict) -> str:
    """Create a long-lived refresh token (default: REFRESH_TOKEN_EXPIRE_DAYS)."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc), "type": "refresh", "jti": str(uuid.uuid4())})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def verify_token(token: str) -> dict:
    """Decode and verify a JWT. Raises JWTError on failure."""
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


def build_token_payload(
    user_id: str,
    username: str,
    role: str,
    permissions: list[str],
    company_id: str | None = None,
    company_schema: str | None = None,
    company_name: str | None = None,
    fy_id: str | None = None,
    fy_code: str | None = None,
    fy_start_date: str | None = None,
    fy_end_date: str | None = None,
) -> dict:
    """Build the standard JWT claim set (without exp/iat — added by create_*)."""
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "permissions": permissions,
    }
    if company_id:
        payload["company_id"] = company_id
        payload["company_schema"] = company_schema
        payload["company_name"] = company_name
    if fy_id:
        payload["fy_id"] = fy_id
        payload["fy_code"] = fy_code
        payload["fy_start_date"] = fy_start_date
        payload["fy_end_date"] = fy_end_date
    return payload


# ---------------------------------------------------------------------------
# Cookie helpers
# ---------------------------------------------------------------------------

def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Set HttpOnly cookies for access and refresh tokens."""
    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
        **COOKIE_SETTINGS,
    )
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth",  # refresh cookie only sent to auth endpoints
        **COOKIE_SETTINGS,
    )


def set_access_cookie(response: Response, access_token: str) -> None:
    """Set only the access token cookie (used during refresh)."""
    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
        **COOKIE_SETTINGS,
    )


def clear_auth_cookies(response: Response) -> None:
    """Clear both auth cookies."""
    response.delete_cookie(key=ACCESS_COOKIE_NAME, path="/")
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/api/v1/auth")
