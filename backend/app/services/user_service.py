"""User service — CRUD operations for users."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate, UserResponse
from app.schemas import PaginatedParams


class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_users(self, params: PaginatedParams) -> dict:
        """List users with pagination. Returns {items: list[UserResponse], total, page, pages}."""
        raise NotImplementedError

    async def get_user(self, user_id: UUID) -> UserResponse:
        """Get single user by ID with role info. Raises NotFoundError."""
        raise NotImplementedError

    async def create_user(self, req: UserCreate) -> UserResponse:
        """Create user with hashed password. Raises DuplicateError on username conflict."""
        raise NotImplementedError

    async def update_user(self, user_id: UUID, req: UserUpdate) -> UserResponse:
        """Partial update user fields. Raises NotFoundError."""
        raise NotImplementedError

    async def delete_user(self, user_id: UUID) -> None:
        """Soft-delete user (set is_active=False). Raises NotFoundError."""
        raise NotImplementedError
