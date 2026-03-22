"""Company + Financial Year API routes."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import BaseModel as PydanticBase

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.services.company_service import CompanyService, FinancialYearService
from app.services.fy_closing_service import FYClosingService
from app.schemas.company import CompanyUpdate, CompanyCreate
from app.schemas.financial_year import FinancialYearCreate, FinancialYearUpdate
from app.core.exceptions import ValidationError

router = APIRouter(tags=["company"])


def _require_company_context(current_user: User) -> None:
    """Raise clear error if JWT has no company selected."""
    claims = getattr(current_user, "_token_claims", {})
    if not claims.get("company_schema"):
        raise ValidationError(
            "No company selected. Please logout, login again, and select a company first. "
            "If you just created a company, you must logout and login again to activate it."
        )


# ── Companies (multi-company) ──

@router.get("/companies")
async def list_companies(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("user_manage"),
):
    """List all companies with is_default for current user."""
    svc = CompanyService(db)
    companies = await svc.get_user_companies(current_user.id)
    return {"success": True, "data": companies}


class SetDefaultRequest(PydanticBase):
    company_id: UUID


@router.post("/companies/set-default")
async def set_default_company(
    req: SetDefaultRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("user_manage"),
):
    """Set a company as the user's default."""
    svc = CompanyService(db)
    await svc.set_default_company(current_user.id, req.company_id)
    return {"success": True, "message": "Default company updated"}


@router.post("/companies")
async def create_company(
    req: CompanyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("user_manage"),
):
    """Create a new company with its own schema + optional master inheritance."""
    svc = CompanyService(db)
    company = await svc.create_company(
        name=req.name,
        created_by_user_id=current_user.id,
        copy_from_company_id=req.copy_from_company_id,
        inherit_masters=req.inherit_masters,
        address=req.address,
        city=req.city,
        state=req.state,
        pin_code=req.pin_code,
        gst_no=req.gst_no,
        state_code=req.state_code,
        pan_no=req.pan_no,
        phone=req.phone,
        email=req.email,
    )
    return {"success": True, "data": company, "message": f"Company '{company.name}' created"}


# ── Company (single row — current company profile) ──

@router.get("/company")
async def get_company(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    _require_company_context(current_user)
    claims = getattr(current_user, "_token_claims", {})
    company_id = claims.get("company_id")
    svc = CompanyService(db)
    company = await svc.get_company(company_id=company_id)
    return {"success": True, "data": company}


@router.patch("/company")
async def update_company(
    req: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    _require_company_context(current_user)
    claims = getattr(current_user, "_token_claims", {})
    company_id = claims.get("company_id")
    svc = CompanyService(db)
    company = await svc.upsert_company(req, company_id=company_id)
    return {"success": True, "data": company, "message": "Company updated"}


# ── Financial Years ──

@router.get("/financial-years")
async def list_financial_years(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    _require_company_context(current_user)
    svc = FinancialYearService(db)
    years = await svc.get_all()
    return {"success": True, "data": years}


@router.get("/financial-years/current")
async def get_current_fy(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    _require_company_context(current_user)
    svc = FinancialYearService(db)
    fy = await svc.get_current()
    return {"success": True, "data": fy}


@router.post("/financial-years")
async def create_financial_year(
    req: FinancialYearCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    _require_company_context(current_user)
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
    _require_company_context(current_user)
    svc = FinancialYearService(db)
    fy = await svc.update(fy_id, req)
    return {"success": True, "data": fy, "message": f"Financial year {fy.code} updated"}


@router.delete("/financial-years/{fy_id}")
async def delete_financial_year(
    fy_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("user_manage"),
):
    _require_company_context(current_user)
    svc = FinancialYearService(db)
    await svc.delete(fy_id)
    return {"success": True, "message": "Financial year deleted"}


# ── Year Closing ──

class CloseFYRequest(PydanticBase):
    new_fy_code: str          # e.g. "FY2026-27"
    new_start_date: date      # "2026-04-01"
    new_end_date: date        # "2027-03-31"


@router.get("/financial-years/{fy_id}/close-preview")
async def close_preview(
    fy_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("user_manage"),
):
    """Preview year closing — warnings, party balance snapshot."""
    _require_company_context(current_user)
    svc = FYClosingService(db)
    result = await svc.validate_closing(fy_id)
    return {"success": True, "data": result}


@router.post("/financial-years/{fy_id}/close")
async def close_fy(
    fy_id: UUID,
    req: CloseFYRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("user_manage"),
):
    """Close the current FY — snapshot balances, create new FY, carry forward."""
    _require_company_context(current_user)
    svc = FYClosingService(db)
    result = await svc.close_fy(
        fy_id=fy_id,
        new_fy_code=req.new_fy_code,
        new_start_date=req.new_start_date,
        new_end_date=req.new_end_date,
        closed_by_user_id=current_user.id,
    )
    return {"success": True, "data": result, "message": f"FY closed. New FY: {req.new_fy_code}"}
