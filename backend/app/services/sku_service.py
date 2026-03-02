"""SKU service — CRUD and auto-code generation."""

import math
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.sku import SKU
from app.models.inventory_state import InventoryState
from app.schemas.sku import SKUCreate, SKUUpdate, SKUResponse
from app.schemas import PaginatedParams
from app.core.exceptions import DuplicateError, NotFoundError


class SKUService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_skus(self, params: PaginatedParams) -> dict:
        count_stmt = select(func.count()).select_from(SKU)
        total = (await self.db.execute(count_stmt)).scalar() or 0
        pages = max(1, math.ceil(total / params.page_size))

        sort_col = getattr(SKU, params.sort_by, SKU.created_at)
        order = sort_col.desc() if params.sort_order == "desc" else sort_col.asc()

        stmt = (
            select(SKU)
            .order_by(order)
            .offset((params.page - 1) * params.page_size)
            .limit(params.page_size)
        )
        result = await self.db.execute(stmt)
        skus = result.scalars().all()

        # Get inventory states
        sku_ids = [s.id for s in skus]
        inv_stmt = select(InventoryState).where(InventoryState.sku_id.in_(sku_ids))
        inv_result = await self.db.execute(inv_stmt)
        inv_map = {inv.sku_id: inv for inv in inv_result.scalars().all()}

        return {
            "data": [self._to_response(s, inv_map.get(s.id)) for s in skus],
            "total": total,
            "page": params.page,
            "pages": pages,
        }

    async def get_sku(self, sku_id: UUID) -> dict:
        sku = await self._get_or_404(sku_id)
        inv_stmt = select(InventoryState).where(InventoryState.sku_id == sku_id)
        inv_result = await self.db.execute(inv_stmt)
        inv = inv_result.scalar_one_or_none()
        return self._to_response(sku, inv)

    async def create_sku(self, req: SKUCreate) -> dict:
        # Auto-generate sku_code: ProductType-DesignNo-Color-Size
        sku_code = f"{req.product_type}-{req.product_name}-{req.color}-{req.size}"

        existing = await self.db.execute(
            select(SKU).where(SKU.sku_code == sku_code)
        )
        if existing.scalar_one_or_none():
            raise DuplicateError(f"SKU code '{sku_code}' already exists")

        sku = SKU(
            sku_code=sku_code,
            product_type=req.product_type,
            product_name=req.product_name,
            color=req.color,
            size=req.size,
            description=req.description,
            base_price=req.base_price,
        )
        self.db.add(sku)
        await self.db.flush()

        # Create initial inventory state
        inv = InventoryState(
            sku_id=sku.id,
            total_qty=0,
            available_qty=0,
            reserved_qty=0,
        )
        self.db.add(inv)
        await self.db.flush()

        return self._to_response(sku, inv)

    async def update_sku(self, sku_id: UUID, req: SKUUpdate) -> dict:
        sku = await self._get_or_404(sku_id)

        update_data = req.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(sku, field, value)

        await self.db.flush()

        inv_stmt = select(InventoryState).where(InventoryState.sku_id == sku_id)
        inv_result = await self.db.execute(inv_stmt)
        inv = inv_result.scalar_one_or_none()
        return self._to_response(sku, inv)

    async def find_or_create(
        self, sku_code: str, product_type: str, product_name: str, color: str, size: str
    ) -> SKU:
        """Find existing SKU by code, or create new one with InventoryState."""
        stmt = select(SKU).where(SKU.sku_code == sku_code)
        result = await self.db.execute(stmt)
        sku = result.scalar_one_or_none()
        if sku:
            return sku

        sku = SKU(
            sku_code=sku_code,
            product_type=product_type,
            product_name=product_name,
            color=color,
            size=size,
            is_active=True,
        )
        self.db.add(sku)
        await self.db.flush()

        # Auto-create InventoryState
        state = InventoryState(
            sku_id=sku.id,
            total_qty=0,
            available_qty=0,
            reserved_qty=0,
        )
        self.db.add(state)
        await self.db.flush()
        return sku

    async def _get_or_404(self, sku_id: UUID) -> SKU:
        stmt = select(SKU).where(SKU.id == sku_id)
        result = await self.db.execute(stmt)
        sku = result.scalar_one_or_none()
        if not sku:
            raise NotFoundError(f"SKU {sku_id} not found")
        return sku

    def _to_response(self, s: SKU, inv: InventoryState | None = None) -> dict:
        return {
            "id": str(s.id),
            "sku_code": s.sku_code,
            "product_type": s.product_type,
            "product_name": s.product_name,
            "color": s.color,
            "size": s.size,
            "description": s.description,
            "base_price": float(s.base_price) if s.base_price else 0,
            "is_active": s.is_active,
            "stock": {
                "total_qty": inv.total_qty if inv else 0,
                "available_qty": inv.available_qty if inv else 0,
                "reserved_qty": inv.reserved_qty if inv else 0,
            },
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
