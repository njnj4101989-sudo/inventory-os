"""Broker service — CRUD for commission broker master."""

import math
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.broker import Broker
from app.core.exceptions import NotFoundError


class BrokerService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_brokers(self, page: int = 1, page_size: int = 50, search: str | None = None) -> dict:
        conditions = []
        if search:
            q = f"%{search}%"
            conditions.append(
                or_(
                    Broker.name.ilike(q),
                    Broker.phone.ilike(q),
                    Broker.city.ilike(q),
                    Broker.gst_no.ilike(q),
                )
            )

        count_stmt = select(func.count()).select_from(Broker)
        if conditions:
            count_stmt = count_stmt.where(*conditions)
        total = (await self.db.execute(count_stmt)).scalar() or 0
        pages = max(1, math.ceil(total / page_size)) if page_size > 0 else 1

        stmt = select(Broker).order_by(Broker.name)
        if conditions:
            stmt = stmt.where(*conditions)
        if page_size > 0:
            stmt = stmt.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(stmt)
        return {
            "data": [self._to_response(b) for b in result.scalars().all()],
            "total": total,
            "page": page,
            "pages": pages,
        }

    async def get_all_active(self) -> list:
        stmt = select(Broker).where(Broker.is_active == True).order_by(Broker.name)
        result = await self.db.execute(stmt)
        return [self._to_response(b) for b in result.scalars().all()]

    async def get_broker(self, broker_id: UUID) -> dict:
        broker = await self._get_or_404(broker_id)
        return self._to_response(broker)

    async def create_broker(self, data) -> dict:
        obj = Broker(
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
            due_days=data.due_days,
            credit_limit=data.credit_limit,
            opening_balance=data.opening_balance,
            balance_type=data.balance_type,
            commission_rate=data.commission_rate,
            tds_applicable=data.tds_applicable,
            tds_rate=data.tds_rate,
            tds_section=data.tds_section,
            notes=data.notes.strip() if data.notes else None,
        )
        self.db.add(obj)
        await self.db.flush()
        return self._to_response(obj)

    async def update_broker(self, broker_id: UUID, data) -> dict:
        obj = await self._get_or_404(broker_id)
        updates = data.model_dump(exclude_unset=True)
        for field, value in updates.items():
            if isinstance(value, str):
                value = value.strip()
                if field in ("gst_no", "pan_no"):
                    value = value.upper()
            setattr(obj, field, value)
        await self.db.flush()
        return self._to_response(obj)

    async def _get_or_404(self, broker_id: UUID) -> Broker:
        stmt = select(Broker).where(Broker.id == broker_id)
        result = await self.db.execute(stmt)
        obj = result.scalar_one_or_none()
        if not obj:
            raise NotFoundError(f"Broker {broker_id} not found")
        return obj

    def _to_response(self, b: Broker) -> dict:
        return {
            "id": str(b.id),
            "name": b.name,
            "contact_person": b.contact_person,
            "phone": b.phone,
            "phone_alt": b.phone_alt,
            "email": b.email,
            "address": b.address,
            "city": b.city,
            "state": b.state,
            "pin_code": b.pin_code,
            "gst_no": b.gst_no,
            "gst_type": b.gst_type,
            "state_code": b.state_code,
            "pan_no": b.pan_no,
            "aadhar_no": b.aadhar_no,
            "due_days": b.due_days,
            "credit_limit": float(b.credit_limit) if b.credit_limit else None,
            "opening_balance": float(b.opening_balance) if b.opening_balance else None,
            "balance_type": b.balance_type,
            "commission_rate": float(b.commission_rate) if b.commission_rate else None,
            "tds_applicable": b.tds_applicable,
            "tds_rate": float(b.tds_rate) if b.tds_rate else None,
            "tds_section": b.tds_section,
            "notes": b.notes,
            "is_active": b.is_active,
            "created_at": b.created_at.isoformat() if b.created_at else None,
        }
