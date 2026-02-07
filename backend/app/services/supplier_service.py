"""Supplier service — CRUD operations for suppliers."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supplier import Supplier
from app.schemas.supplier import SupplierCreate, SupplierUpdate, SupplierResponse
from app.schemas import PaginatedParams


class SupplierService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_suppliers(self, params: PaginatedParams) -> dict:
        """List suppliers with pagination. Returns {items, total, page, pages}."""
        raise NotImplementedError

    async def get_supplier(self, supplier_id: UUID) -> SupplierResponse:
        """Get single supplier by ID. Raises NotFoundError."""
        raise NotImplementedError

    async def create_supplier(self, req: SupplierCreate) -> SupplierResponse:
        """Create supplier. Raises DuplicateError on name conflict."""
        raise NotImplementedError

    async def update_supplier(self, supplier_id: UUID, req: SupplierUpdate) -> SupplierResponse:
        """Partial update supplier fields. Raises NotFoundError."""
        raise NotImplementedError
