"""Company + Financial Year API routes."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.services.company_service import CompanyService, FinancialYearService
from app.schemas.company import CompanyUpdate
from app.schemas.financial_year import FinancialYearCreate, FinancialYearUpdate

router = APIRouter(tags=["company"])


# ── Company (single row) ──

@router.get("/company")
async def get_company(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = CompanyService(db)
    company = await svc.get_company()
    return {"success": True, "data": company}


@router.patch("/company")
async def update_company(
    req: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = CompanyService(db)
    company = await svc.upsert_company(req)
    return {"success": True, "data": company, "message": "Company updated"}


# ── Financial Years ──

@router.get("/financial-years")
async def list_financial_years(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = FinancialYearService(db)
    years = await svc.get_all()
    return {"success": True, "data": years}


@router.get("/financial-years/current")
async def get_current_fy(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = FinancialYearService(db)
    fy = await svc.get_current()
    return {"success": True, "data": fy}


@router.post("/financial-years")
async def create_financial_year(
    req: FinancialYearCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = FinancialYearService(db)
    fy = await svc.create(req)
    return {"success": True, "data": fy, "message": f"Financial year {fy.code} created"}


@router.patch("/financial-years/{fy_id}")
async def update_financial_year(
    fy_id: UUID,
    req: FinancialYearUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = FinancialYearService(db)
    fy = await svc.update(fy_id, req)
    return {"success": True, "data": fy, "message": f"Financial year {fy.code} updated"}
