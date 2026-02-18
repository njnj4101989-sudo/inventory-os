"""Supplier service — CRUD operations for suppliers."""

import math
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.supplier import Supplier
from app.schemas.supplier import SupplierCreate, SupplierUpdate, SupplierResponse
from app.schemas import PaginatedParams
from app.core.exceptions import DuplicateError, NotFoundError


class SupplierService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_suppliers(self, params: PaginatedParams) -> dict:
        count_stmt = select(func.count()).select_from(Supplier)
        total = (await self.db.execute(count_stmt)).scalar() or 0
        pages = max(1, math.ceil(total / params.page_size))

        sort_col = getattr(Supplier, params.sort_by, Supplier.created_at)
        order = sort_col.desc() if params.sort_order == "desc" else sort_col.asc()

        stmt = (
            select(Supplier)
            .order_by(order)
            .offset((params.page - 1) * params.page_size)
            .limit(params.page_size)
        )
        result = await self.db.execute(stmt)
        suppliers = result.scalars().all()

        return {
            "data": [self._to_response(s) for s in suppliers],
            "total": total,
            "page": params.page,
            "pages": pages,
        }

    async def get_supplier(self, supplier_id: UUID) -> dict:
        supplier = await self._get_or_404(supplier_id)
        return self._to_response(supplier)

    async def create_supplier(self, req: SupplierCreate) -> dict:
        existing = await self.db.execute(
            select(Supplier).where(Supplier.name == req.name)
        )
        if existing.scalar_one_or_none():
            raise DuplicateError(f"Supplier '{req.name}' already exists")

        supplier = Supplier(**req.model_dump())
        self.db.add(supplier)
        await self.db.flush()
        return self._to_response(supplier)

    async def update_supplier(self, supplier_id: UUID, req: SupplierUpdate) -> dict:
        supplier = await self._get_or_404(supplier_id)

        update_data = req.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(supplier, field, value)

        await self.db.flush()
        return self._to_response(supplier)

    async def _get_or_404(self, supplier_id: UUID) -> Supplier:
        stmt = select(Supplier).where(Supplier.id == supplier_id)
        result = await self.db.execute(stmt)
        supplier = result.scalar_one_or_none()
        if not supplier:
            raise NotFoundError(f"Supplier {supplier_id} not found")
        return supplier

    def _to_response(self, s: Supplier) -> dict:
        return {
            "id": str(s.id),
            "name": s.name,
            "contact_person": s.contact_person,
            "phone": s.phone,
            "email": s.email,
            "gst_no": s.gst_no,
            "pan_no": s.pan_no,
            "address": s.address,
            "city": s.city,
            "state": s.state,
            "pin_code": s.pin_code,
            "broker": s.broker,
            "hsn_code": s.hsn_code,
            "is_active": s.is_active,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
