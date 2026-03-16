"""Customer service — CRUD for customer (retailer) master."""

import math
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.core.exceptions import NotFoundError


class CustomerService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_customers(self, page: int = 1, page_size: int = 50, search: str | None = None) -> dict:
        conditions = []
        if search:
            q = f"%{search}%"
            conditions.append(
                or_(
                    Customer.name.ilike(q),
                    Customer.phone.ilike(q),
                    Customer.city.ilike(q),
                    Customer.gst_no.ilike(q),
                    Customer.short_name.ilike(q),
                )
            )

        count_stmt = select(func.count()).select_from(Customer)
        if conditions:
            count_stmt = count_stmt.where(*conditions)
        total = (await self.db.execute(count_stmt)).scalar() or 0
        pages = max(1, math.ceil(total / page_size)) if page_size > 0 else 1

        stmt = select(Customer).order_by(Customer.name)
        if conditions:
            stmt = stmt.where(*conditions)
        if page_size > 0:
            stmt = stmt.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(stmt)
        customers = result.scalars().all()

        return {
            "data": [self._to_response(c) for c in customers],
            "total": total,
            "page": page,
            "pages": pages,
        }

    async def get_all_active(self) -> list:
        stmt = select(Customer).where(Customer.is_active == True).order_by(Customer.name)
        result = await self.db.execute(stmt)
        return [self._to_response(c) for c in result.scalars().all()]

    async def get_customer(self, customer_id: UUID) -> dict:
        customer = await self._get_or_404(customer_id)
        return self._to_response(customer)

    async def create_customer(self, data) -> dict:
        obj = Customer(
            name=data.name.strip(),
            contact_person=data.contact_person.strip() if data.contact_person else None,
            short_name=data.short_name.strip() if data.short_name else None,
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
            tds_applicable=data.tds_applicable,
            tds_rate=data.tds_rate,
            tds_section=data.tds_section,
            tcs_applicable=data.tcs_applicable,
            tcs_rate=data.tcs_rate,
            tcs_section=data.tcs_section,
            broker=data.broker.strip() if data.broker else None,
            notes=data.notes.strip() if data.notes else None,
        )
        self.db.add(obj)
        await self.db.flush()
        return self._to_response(obj)

    async def update_customer(self, customer_id: UUID, data) -> dict:
        obj = await self._get_or_404(customer_id)
        updates = data.model_dump(exclude_unset=True)
        for field, value in updates.items():
            if isinstance(value, str):
                value = value.strip()
                if field in ("gst_no", "pan_no"):
                    value = value.upper()
            setattr(obj, field, value)
        await self.db.flush()
        return self._to_response(obj)

    async def _get_or_404(self, customer_id: UUID) -> Customer:
        stmt = select(Customer).where(Customer.id == customer_id)
        result = await self.db.execute(stmt)
        obj = result.scalar_one_or_none()
        if not obj:
            raise NotFoundError(f"Customer {customer_id} not found")
        return obj

    def _to_response(self, c: Customer) -> dict:
        return {
            "id": str(c.id),
            "name": c.name,
            "contact_person": c.contact_person,
            "short_name": c.short_name,
            "phone": c.phone,
            "phone_alt": c.phone_alt,
            "email": c.email,
            "address": c.address,
            "city": c.city,
            "state": c.state,
            "pin_code": c.pin_code,
            "gst_no": c.gst_no,
            "gst_type": c.gst_type,
            "state_code": c.state_code,
            "pan_no": c.pan_no,
            "aadhar_no": c.aadhar_no,
            "due_days": c.due_days,
            "credit_limit": float(c.credit_limit) if c.credit_limit else None,
            "opening_balance": float(c.opening_balance) if c.opening_balance else None,
            "balance_type": c.balance_type,
            "tds_applicable": c.tds_applicable,
            "tds_rate": float(c.tds_rate) if c.tds_rate else None,
            "tds_section": c.tds_section,
            "tcs_applicable": c.tcs_applicable,
            "tcs_rate": float(c.tcs_rate) if c.tcs_rate else None,
            "tcs_section": c.tcs_section,
            "broker": c.broker,
            "notes": c.notes,
            "is_active": c.is_active,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
