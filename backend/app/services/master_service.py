"""Service for Product Type, Color, and Fabric master entities."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import DuplicateError, NotFoundError
from app.models.product_type import ProductType
from app.models.color import Color
from app.models.fabric import Fabric
from app.models.value_addition import ValueAddition


class MasterService:
    """CRUD operations for master data entities."""

    # ── Generic helpers ──────────────────────────────────

    @staticmethod
    async def _list(db: AsyncSession, model, *, active_only: bool = False):
        stmt = select(model).order_by(model.code)
        if active_only:
            stmt = stmt.where(model.is_active == True)  # noqa: E712
        result = await db.execute(stmt)
        return result.scalars().all()

    @staticmethod
    async def _get(db: AsyncSession, model, entity_id: UUID, label: str):
        result = await db.execute(select(model).where(model.id == entity_id))
        obj = result.scalar_one_or_none()
        if not obj:
            raise NotFoundError(f"{label} not found")
        return obj

    @staticmethod
    async def _check_code(db: AsyncSession, model, code: str, label: str, *, field_name: str = "code"):
        col = getattr(model, field_name)
        result = await db.execute(select(model).where(col == code))
        if result.scalar_one_or_none():
            raise DuplicateError(f"{label} with {field_name} '{code}' already exists")

    # ── Product Types ────────────────────────────────────

    @staticmethod
    async def get_product_types(db: AsyncSession):
        return await MasterService._list(db, ProductType)

    @staticmethod
    async def get_active_product_types(db: AsyncSession):
        return await MasterService._list(db, ProductType, active_only=True)

    @staticmethod
    async def create_product_type(db: AsyncSession, data) -> ProductType:
        code = data.code.strip().upper()
        await MasterService._check_code(db, ProductType, code, "Product type")
        obj = ProductType(
            code=code,
            name=data.name.strip(),
            description=data.description,
        )
        db.add(obj)
        await db.flush()
        return obj

    @staticmethod
    async def update_product_type(db: AsyncSession, pt_id: UUID, data) -> ProductType:
        obj = await MasterService._get(db, ProductType, pt_id, "Product type")
        if data.name is not None:
            obj.name = data.name.strip()
        if data.description is not None:
            obj.description = data.description
        if data.is_active is not None:
            obj.is_active = data.is_active
        await db.flush()
        return obj

    # ── Colors ───────────────────────────────────────────

    @staticmethod
    async def get_colors(db: AsyncSession):
        return await MasterService._list(db, Color)

    @staticmethod
    async def get_active_colors(db: AsyncSession):
        return await MasterService._list(db, Color, active_only=True)

    @staticmethod
    async def _next_color_no(db: AsyncSession) -> int:
        result = await db.execute(select(func.max(Color.color_no)))
        current = result.scalar() or 0
        return current + 1

    @staticmethod
    async def create_color(db: AsyncSession, data) -> Color:
        code = data.code.strip().upper()
        if len(code) > 5:
            code = code[:5]
        await MasterService._check_code(db, Color, code, "Color")
        # Auto-assign color_no if not provided
        color_no = data.color_no if data.color_no else await MasterService._next_color_no(db)
        obj = Color(
            name=data.name.strip(),
            code=code,
            color_no=color_no,
            hex_code=data.hex_code,
        )
        db.add(obj)
        await db.flush()
        return obj

    @staticmethod
    async def update_color(db: AsyncSession, color_id: UUID, data) -> Color:
        obj = await MasterService._get(db, Color, color_id, "Color")
        if data.name is not None:
            obj.name = data.name.strip()
        if data.color_no is not None:
            obj.color_no = data.color_no
        if data.hex_code is not None:
            obj.hex_code = data.hex_code
        if data.is_active is not None:
            obj.is_active = data.is_active
        await db.flush()
        return obj

    # ── Fabrics ──────────────────────────────────────────

    @staticmethod
    async def get_fabrics(db: AsyncSession):
        return await MasterService._list(db, Fabric)

    @staticmethod
    async def get_active_fabrics(db: AsyncSession):
        return await MasterService._list(db, Fabric, active_only=True)

    @staticmethod
    async def create_fabric(db: AsyncSession, data) -> Fabric:
        code = data.code.strip().upper()
        if len(code) > 3:
            code = code[:3]
        await MasterService._check_code(db, Fabric, code, "Fabric")
        obj = Fabric(
            name=data.name.strip(),
            code=code,
            description=data.description,
        )
        db.add(obj)
        await db.flush()
        return obj

    @staticmethod
    async def update_fabric(db: AsyncSession, fabric_id: UUID, data) -> Fabric:
        obj = await MasterService._get(db, Fabric, fabric_id, "Fabric")
        if data.name is not None:
            obj.name = data.name.strip()
        if data.description is not None:
            obj.description = data.description
        if data.is_active is not None:
            obj.is_active = data.is_active
        await db.flush()
        return obj

    # ── Value Additions ───────────────────────────────────

    @staticmethod
    async def get_value_additions(db: AsyncSession):
        stmt = select(ValueAddition).order_by(ValueAddition.short_code)
        result = await db.execute(stmt)
        return result.scalars().all()

    @staticmethod
    async def get_active_value_additions(db: AsyncSession):
        stmt = (
            select(ValueAddition)
            .where(ValueAddition.is_active == True)  # noqa: E712
            .order_by(ValueAddition.short_code)
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    @staticmethod
    async def create_value_addition(db: AsyncSession, data) -> ValueAddition:
        code = data.short_code.strip().upper()
        if len(code) > 4:
            code = code[:4]
        await MasterService._check_code(
            db, ValueAddition, code, "Value addition", field_name="short_code"
        )
        obj = ValueAddition(
            name=data.name.strip(),
            short_code=code,
            description=data.description,
        )
        db.add(obj)
        await db.flush()
        return obj

    @staticmethod
    async def update_value_addition(db: AsyncSession, va_id: UUID, data) -> ValueAddition:
        obj = await MasterService._get(db, ValueAddition, va_id, "Value addition")
        if data.name is not None:
            obj.name = data.name.strip()
        if data.short_code is not None:
            new_code = data.short_code.strip().upper()[:4]
            if new_code != obj.short_code:
                await MasterService._check_code(
                    db, ValueAddition, new_code, "Value addition", field_name="short_code"
                )
                obj.short_code = new_code
        if data.description is not None:
            obj.description = data.description
        if data.is_active is not None:
            obj.is_active = data.is_active
        await db.flush()
        return obj
