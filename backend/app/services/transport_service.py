"""Transport service — CRUD for transport company master."""

import math
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transport import Transport
from app.core.exceptions import DuplicateError, NotFoundError


class TransportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_transports(self, page: int = 1, page_size: int = 50, search: str | None = None) -> dict:
        conditions = []
        if search:
            q = f"%{search}%"
            conditions.append(
                or_(
                    Transport.name.ilike(q),
                    Transport.phone.ilike(q),
                    Transport.city.ilike(q),
                    Transport.gst_no.ilike(q),
                )
            )

        count_stmt = select(func.count()).select_from(Transport)
        if conditions:
            count_stmt = count_stmt.where(*conditions)
        total = (await self.db.execute(count_stmt)).scalar() or 0
        pages = max(1, math.ceil(total / page_size)) if page_size > 0 else 1

        stmt = select(Transport).order_by(Transport.name)
        if conditions:
            stmt = stmt.where(*conditions)
        if page_size > 0:
            stmt = stmt.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(stmt)
        return {
            "data": [self._to_response(t) for t in result.scalars().all()],
            "total": total,
            "page": page,
            "pages": pages,
        }

    async def get_all_active(self) -> list:
        stmt = select(Transport).where(Transport.is_active == True).order_by(Transport.name)
        result = await self.db.execute(stmt)
        return [self._to_response(t) for t in result.scalars().all()]

    async def get_transport(self, transport_id: UUID) -> dict:
        transport = await self._get_or_404(transport_id)
        return self._to_response(transport)

    async def create_transport(self, data) -> dict:
        name = data.name.strip().title()
        existing = await self.db.execute(
            select(Transport).where(func.lower(Transport.name) == name.lower())
        )
        if existing.scalar_one_or_none():
            raise DuplicateError(f"Transport '{name}' already exists")
        obj = Transport(
            name=name,
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
            opening_balance=data.opening_balance,
            balance_type=data.balance_type,
            notes=data.notes.strip() if data.notes else None,
        )
        self.db.add(obj)
        await self.db.flush()
        return self._to_response(obj)

    async def update_transport(self, transport_id: UUID, data) -> dict:
        obj = await self._get_or_404(transport_id)
        updates = data.model_dump(exclude_unset=True)
        for field, value in updates.items():
            if isinstance(value, str):
                value = value.strip()
                if field in ("gst_no", "pan_no"):
                    value = value.upper()
            setattr(obj, field, value)
        await self.db.flush()
        return self._to_response(obj)

    async def _get_or_404(self, transport_id: UUID) -> Transport:
        stmt = select(Transport).where(Transport.id == transport_id)
        result = await self.db.execute(stmt)
        obj = result.scalar_one_or_none()
        if not obj:
            raise NotFoundError(f"Transport {transport_id} not found")
        return obj

    def _to_response(self, t: Transport) -> dict:
        return {
            "id": str(t.id),
            "name": t.name,
            "contact_person": t.contact_person,
            "phone": t.phone,
            "phone_alt": t.phone_alt,
            "email": t.email,
            "address": t.address,
            "city": t.city,
            "state": t.state,
            "pin_code": t.pin_code,
            "gst_no": t.gst_no,
            "gst_type": t.gst_type,
            "state_code": t.state_code,
            "pan_no": t.pan_no,
            "aadhar_no": t.aadhar_no,
            "opening_balance": float(t.opening_balance) if t.opening_balance else None,
            "balance_type": t.balance_type,
            "notes": t.notes,
            "is_active": t.is_active,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
