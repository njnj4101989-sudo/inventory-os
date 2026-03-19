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
from app.models.va_party import VAParty


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
        # Check for duplicate color_no
        existing = await db.execute(
            select(Color).where(Color.color_no == color_no)
        )
        if existing.scalar_one_or_none():
            next_no = await MasterService._next_color_no(db)
            raise DuplicateError(f"Color No. {color_no} is already taken. Next available: {next_no}")
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
        if data.code is not None:
            new_code = data.code.strip().upper()[:5]
            if new_code != obj.code:
                await MasterService._check_code(db, Color, new_code, "Color")
                obj.code = new_code
        if data.color_no is not None and data.color_no != obj.color_no:
            existing = await db.execute(
                select(Color).where(Color.color_no == data.color_no)
            )
            if existing.scalar_one_or_none():
                raise DuplicateError(f"Color No. {data.color_no} is already taken")
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

    # ── VA Parties ─────────────────────────────────────────

    @staticmethod
    async def get_va_parties(db: AsyncSession):
        stmt = select(VAParty).order_by(VAParty.name)
        result = await db.execute(stmt)
        return result.scalars().all()

    @staticmethod
    async def get_active_va_parties(db: AsyncSession):
        stmt = (
            select(VAParty)
            .where(VAParty.is_active == True)  # noqa: E712
            .order_by(VAParty.name)
        )
        result = await db.execute(stmt)
        return result.scalars().all()

    @staticmethod
    async def create_va_party(db: AsyncSession, data) -> VAParty:
        obj = VAParty(
            name=data.name.strip(),
            contact_person=data.contact_person.strip() if data.contact_person else None,
            phone=data.phone.strip() if data.phone else None,
            phone_alt=data.phone_alt.strip() if data.phone_alt else None,
            email=data.email.strip() if data.email else None,
            address=data.address.strip() if data.address else None,
            city=data.city.strip() if data.city else None,
            state=data.state.strip() if data.state else None,
            pin_code=data.pin_code.strip() if data.pin_code else None,
            gst_no=data.gst_no.strip().upper() if data.gst_no else None,
            gst_type=data.gst_type,
            state_code=data.state_code.strip() if data.state_code else None,
            pan_no=data.pan_no.strip().upper() if data.pan_no else None,
            aadhar_no=data.aadhar_no.strip() if data.aadhar_no else None,
            hsn_code=data.hsn_code.strip() if data.hsn_code else None,
            due_days=data.due_days,
            credit_limit=data.credit_limit,
            opening_balance=data.opening_balance,
            balance_type=data.balance_type,
            tds_applicable=data.tds_applicable,
            tds_rate=data.tds_rate,
            tds_section=data.tds_section,
            msme_type=data.msme_type,
            msme_reg_no=data.msme_reg_no.strip() if data.msme_reg_no else None,
            notes=data.notes.strip() if data.notes else None,
        )
        db.add(obj)
        await db.flush()
        return obj

    @staticmethod
    async def update_va_party(db: AsyncSession, party_id: UUID, data) -> VAParty:
        obj = await MasterService._get(db, VAParty, party_id, "VA Party")
        updates = data.model_dump(exclude_unset=True)
        for field, value in updates.items():
            if isinstance(value, str):
                value = value.strip()
                if field in ("gst_no", "pan_no"):
                    value = value.upper()
            setattr(obj, field, value)
        await db.flush()
        return obj
