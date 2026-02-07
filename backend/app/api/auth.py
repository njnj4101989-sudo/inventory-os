"""Auth routes — login, refresh, logout."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user
from app.models.user import User
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse, RefreshResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=None)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user, return access + refresh tokens."""
    svc = AuthService(db)
    result = await svc.login(req)
    return {"success": True, "data": result}


@router.post("/refresh", response_model=None)
async def refresh(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Exchange refresh token for new access token."""
    svc = AuthService(db)
    result = await svc.refresh(req)
    return {"success": True, "data": result}


@router.post("/logout", response_model=None)
async def logout(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Blacklist current access token."""
    svc = AuthService(db)
    await svc.logout(current_user.id)
    return {"success": True, "message": "Logged out"}
