"""SKU service — CRUD and auto-code generation."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sku import SKU
from app.schemas.sku import SKUCreate, SKUUpdate, SKUResponse
from app.schemas import PaginatedParams


class SKUService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_skus(self, params: PaginatedParams) -> dict:
        """List SKUs with stock levels. Returns {items, total, page, pages}."""
        raise NotImplementedError

    async def get_sku(self, sku_id: UUID) -> SKUResponse:
        """Get single SKU by ID. Raises NotFoundError."""
        raise NotImplementedError

    async def create_sku(self, req: SKUCreate) -> SKUResponse:
        """Create SKU with auto-generated sku_code as ProductType-DesignNo-Color-Size.

        Code format: e.g. "BLS-101-Red-M" for Blouse Design 101 Red Medium.
        Raises DuplicateError if sku_code already exists.
        """
        raise NotImplementedError

    async def update_sku(self, sku_id: UUID, req: SKUUpdate) -> SKUResponse:
        """Partial update SKU fields. Raises NotFoundError."""
        raise NotImplementedError
