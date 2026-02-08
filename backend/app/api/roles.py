"""Role routes — list, create, update, delete roles."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.models.role import Role
from app.schemas.role import RoleCreate, RoleUpdate

router = APIRouter(prefix="/roles", tags=["Roles"])


@router.get("", response_model=None)
async def list_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("role_manage"),
):
    """List all roles with their permissions and user counts."""
    result = await db.execute(select(Role))
    roles = result.scalars().all()

    # Count users per role
    count_stmt = (
        select(User.role_id, func.count(User.id))
        .group_by(User.role_id)
    )
    count_result = await db.execute(count_stmt)
    user_counts = dict(count_result.all())

    return {
        "success": True,
        "data": [
            {
                "id": str(r.id),
                "name": r.name,
                "display_name": r.display_name,
                "permissions": r.permissions,
                "user_count": user_counts.get(r.id, 0),
            }
            for r in roles
        ],
    }


@router.post("", response_model=None, status_code=201)
async def create_role(
    body: RoleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("role_manage"),
):
    """Create a new role with custom permissions."""
    # Check name uniqueness
    existing = await db.execute(select(Role).where(Role.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Role '{body.name}' already exists")

    role = Role(
        name=body.name,
        display_name=body.display_name,
        permissions=body.permissions,
    )
    db.add(role)
    await db.flush()
    await db.refresh(role)

    return {
        "success": True,
        "data": {
            "id": str(role.id),
            "name": role.name,
            "display_name": role.display_name,
            "permissions": role.permissions,
            "user_count": 0,
        },
    }


@router.patch("/{role_id}", response_model=None)
async def update_role(
    role_id: UUID,
    body: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("role_manage"),
):
    """Update role display_name and/or permissions."""
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    if body.display_name is not None:
        role.display_name = body.display_name
    if body.permissions is not None:
        role.permissions = body.permissions

    await db.flush()
    await db.refresh(role)

    # Get user count
    count_result = await db.execute(
        select(func.count(User.id)).where(User.role_id == role.id)
    )
    user_count = count_result.scalar() or 0

    return {
        "success": True,
        "data": {
            "id": str(role.id),
            "name": role.name,
            "display_name": role.display_name,
            "permissions": role.permissions,
            "user_count": user_count,
        },
    }


@router.delete("/{role_id}", response_model=None)
async def delete_role(
    role_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("role_manage"),
):
    """Delete a role. Fails if any users are assigned to it."""
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    # Prevent deleting roles that have users
    count_result = await db.execute(
        select(func.count(User.id)).where(User.role_id == role.id)
    )
    user_count = count_result.scalar() or 0
    if user_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete role '{role.name}' — {user_count} user(s) assigned",
        )

    await db.delete(role)
    return {"success": True, "message": f"Role '{role.name}' deleted"}
