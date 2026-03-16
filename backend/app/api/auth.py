"""Auth routes — login, select-company, refresh, logout, me."""

from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user
from app.models.user import User
from app.schemas.auth import LoginRequest
from app.services.auth_service import AuthService
from app.core.security import (
    set_auth_cookies,
    set_access_cookie,
    clear_auth_cookies,
    verify_token,
    REFRESH_COOKIE_NAME,
)
from app.core.exceptions import UnauthorizedError

router = APIRouter(prefix="/auth", tags=["Auth"])


class SelectCompanyRequest(BaseModel):
    company_id: UUID
    fy_id: UUID | None = None


@router.post("/login", response_model=None)
async def login(req: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    """Authenticate user. Returns user + companies.

    If 1 company: auto-selects, sets full JWT cookies.
    If N companies: sets temporary JWT, frontend shows company picker.
    """
    svc = AuthService(db)
    result = await svc.login(req)

    # Set cookies
    set_auth_cookies(response, result["access_token"], result["refresh_token"])

    # Return everything except raw tokens
    return {
        "success": True,
        "data": {
            "user": result["user"],
            "company": result["company"],
            "companies": result["companies"],
            "fy": result["fy"],
            "fys": result["fys"],
            "needs_company_select": result["needs_company_select"],
        },
    }


@router.post("/select-company", response_model=None)
async def select_company(
    req: SelectCompanyRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Select company (+ optional FY). Re-issues JWT with company/FY context."""
    svc = AuthService(db)
    result = await svc.select_company(current_user.id, req.company_id, req.fy_id)

    # Update cookies with company-scoped JWT
    set_auth_cookies(response, result["access_token"], result["refresh_token"])

    return {
        "success": True,
        "data": {
            "user": result["user"],
            "company": result["company"],
            "companies": result["companies"],
            "fy": result["fy"],
            "fys": result["fys"],
        },
    }


@router.post("/refresh", response_model=None)
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """Read refresh token from cookie, issue new access token."""
    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not refresh_token:
        raise UnauthorizedError("No refresh token")

    svc = AuthService(db)
    result = await svc.refresh_from_token(refresh_token)

    set_access_cookie(response, result.access_token)

    return {"success": True, "data": {"expires_in": result.expires_in}}


@router.post("/logout", response_model=None)
async def logout(
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Clear auth cookies."""
    svc = AuthService(db)
    await svc.logout(current_user.id)
    clear_auth_cookies(response)
    return {"success": True, "message": "Logged out"}


@router.get("/me", response_model=None)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return current user profile + company/FY context from JWT cookie."""
    claims = getattr(current_user, "_token_claims", {})
    permissions_list = claims.get("permissions", [])

    from app.core.permissions import ALL_PERMISSIONS
    permissions_map = {perm: perm in permissions_list for perm in ALL_PERMISSIONS}

    data = {
        "id": str(current_user.id),
        "username": current_user.username,
        "full_name": current_user.full_name,
        "role": current_user.role.name if current_user.role else "unknown",
        "role_display_name": current_user.role.display_name if current_user.role else None,
        "permissions": permissions_map,
    }

    # Include company/FY context if present in JWT
    if claims.get("company_id"):
        data["company"] = {
            "id": claims["company_id"],
            "name": claims.get("company_name"),
            "schema": claims.get("company_schema"),
        }
    if claims.get("fy_id"):
        data["fy"] = {
            "id": claims["fy_id"],
            "code": claims.get("fy_code"),
        }

    return {"success": True, "data": data}
