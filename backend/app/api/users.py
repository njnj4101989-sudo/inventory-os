"""User management routes — admin only."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.schemas import PaginatedParams
from app.schemas.user import UserCreate, UserUpdate
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("", response_model=None)
async def list_users(
    params: PaginatedParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("user_manage"),
):
    """List users with pagination. Filters: role, is_active, search."""
    svc = UserService(db)
    result = await svc.get_users(params)
    return {"success": True, **result}


@router.post("", response_model=None, status_code=201)
async def create_user(
    req: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("user_manage"),
):
    """Create a new user with hashed password."""
    svc = UserService(db)
    result = await svc.create_user(req)
    return {"success": True, "data": result}


@router.patch("/{user_id}", response_model=None)
async def update_user(
    user_id: UUID,
    req: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("user_manage"),
):
    """Partial update user fields."""
    svc = UserService(db)
    result = await svc.update_user(user_id, req)
    return {"success": True, "data": result}
