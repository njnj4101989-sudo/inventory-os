"""Role routes — list available roles."""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.models.role import Role

router = APIRouter(prefix="/roles", tags=["Roles"])


@router.get("", response_model=None)
async def list_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("role_manage"),
):
    """List all roles with their permissions."""
    result = await db.execute(select(Role))
    roles = result.scalars().all()
    return {
        "success": True,
        "data": [
            {"id": str(r.id), "name": r.name, "permissions": r.permissions}
            for r in roles
        ],
    }
