"""Company + FinancialYear service."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.financial_year import FinancialYear
from app.schemas.company import CompanyUpdate
from app.schemas.financial_year import FinancialYearCreate, FinancialYearUpdate


class CompanyService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_company(self) -> Company | None:
        result = await self.db.execute(select(Company).limit(1))
        return result.scalar_one_or_none()

    async def upsert_company(self, data: CompanyUpdate) -> Company:
        company = await self.get_company()
        if not company:
            company = Company(name=data.name or "My Company")
            self.db.add(company)

        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(company, k, v)

        await self.db.flush()
        return company


class FinancialYearService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all(self) -> list[FinancialYear]:
        result = await self.db.execute(
            select(FinancialYear).order_by(FinancialYear.start_date.desc())
        )
        return list(result.scalars().all())

    async def get_current(self) -> FinancialYear | None:
        result = await self.db.execute(
            select(FinancialYear).where(FinancialYear.is_current == True)
        )
        return result.scalar_one_or_none()

    async def create(self, data: FinancialYearCreate) -> FinancialYear:
        # If marking as current, unset existing current
        if data.is_current:
            existing = await self.get_current()
            if existing:
                existing.is_current = False

        fy = FinancialYear(**data.model_dump())
        self.db.add(fy)
        await self.db.flush()
        return fy

    async def update(self, fy_id: UUID, data: FinancialYearUpdate) -> FinancialYear:
        result = await self.db.execute(
            select(FinancialYear).where(FinancialYear.id == fy_id)
        )
        fy = result.scalar_one_or_none()
        if not fy:
            raise ValueError(f"Financial year {fy_id} not found")

        if data.is_current:
            existing = await self.get_current()
            if existing and existing.id != fy_id:
                existing.is_current = False

        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(fy, k, v)

        await self.db.flush()
        return fy
