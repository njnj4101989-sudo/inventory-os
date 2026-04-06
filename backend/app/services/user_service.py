"""User service — CRUD operations for users."""

import math
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate, UserResponse
from app.schemas import PaginatedParams
from app.core.security import hash_password
from app.core.exceptions import DuplicateError, NotFoundError


class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_users(self, params: PaginatedParams) -> dict:
        # Count
        count_stmt = select(func.count()).select_from(User)
        total = (await self.db.execute(count_stmt)).scalar() or 0
        no_limit = params.page_size == 0
        pages = 1 if no_limit else max(1, math.ceil(total / params.page_size))

        # Query
        stmt = (
            select(User)
            .options(selectinload(User.role))
            .order_by(getattr(User, params.sort_by, User.created_at).desc() if params.sort_order == "desc"
                      else getattr(User, params.sort_by, User.created_at).asc())
        )
        if not no_limit:
            stmt = stmt.offset((params.page - 1) * params.page_size).limit(params.page_size)
        result = await self.db.execute(stmt)
        users = result.scalars().all()

        return {
            "data": [self._to_response(u) for u in users],
            "total": total,
            "page": params.page,
            "pages": pages,
        }

    async def get_user(self, user_id: UUID) -> dict:
        user = await self._get_or_404(user_id)
        return self._to_response(user)

    async def create_user(self, req: UserCreate) -> dict:
        # Check duplicate username
        existing = await self.db.execute(
            select(User).where(User.username == req.username)
        )
        if existing.scalar_one_or_none():
            raise DuplicateError(f"Username '{req.username}' already exists")

        user = User(
            username=req.username,
            password_hash=hash_password(req.password),
            full_name=req.full_name,
            role_id=req.role_id,
            phone=req.phone,
        )
        self.db.add(user)
        await self.db.flush()

        # Reload with role
        stmt = select(User).where(User.id == user.id).options(selectinload(User.role))
        result = await self.db.execute(stmt)
        user = result.scalar_one()
        return self._to_response(user)

    async def update_user(self, user_id: UUID, req: UserUpdate) -> dict:
        user = await self._get_or_404(user_id)

        update_data = req.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(user, field, value)
        user.updated_at = datetime.now(timezone.utc)

        await self.db.flush()

        # Reload with role
        stmt = select(User).where(User.id == user.id).options(selectinload(User.role))
        result = await self.db.execute(stmt)
        user = result.scalar_one()
        return self._to_response(user)

    async def delete_user(self, user_id: UUID) -> None:
        user = await self._get_or_404(user_id)
        user.is_active = False
        user.updated_at = datetime.now(timezone.utc)
        await self.db.flush()

    async def _get_or_404(self, user_id: UUID) -> User:
        stmt = select(User).where(User.id == user_id).options(selectinload(User.role))
        result = await self.db.execute(stmt)
        user = result.scalar_one_or_none()
        if not user:
            raise NotFoundError(f"User {user_id} not found")
        return user

    def _to_response(self, user: User) -> dict:
        return {
            "id": str(user.id),
            "username": user.username,
            "full_name": user.full_name,
            "role": {
                "id": str(user.role.id),
                "name": user.role.name,
                "display_name": user.role.display_name,
            } if user.role else None,
            "phone": user.phone,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        }
