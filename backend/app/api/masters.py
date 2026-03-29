"""Master data routes — Product Types, Colors, Fabrics."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.schemas.master import (
    ProductTypeCreate, ProductTypeUpdate, ProductTypeResponse,
    ColorCreate, ColorUpdate, ColorResponse,
    FabricCreate, FabricUpdate, FabricResponse,
    ValueAdditionCreate, ValueAdditionUpdate, ValueAdditionResponse,
    VAPartyCreate, VAPartyUpdate, VAPartyResponse,
)
from app.services.master_service import MasterService

router = APIRouter(prefix="/masters", tags=["Masters"])


# ── Product Types ────────────────────────────────────────


@router.get("/product-types", response_model=None)
async def list_product_types(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    items = await MasterService.get_product_types(db)
    return {"success": True, "data": [ProductTypeResponse.model_validate(i) for i in items]}


@router.get("/product-types/all", response_model=None)
async def all_active_product_types(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    items = await MasterService.get_active_product_types(db)
    return {"success": True, "data": [ProductTypeResponse.model_validate(i) for i in items]}


@router.post("/product-types", response_model=None, status_code=201)
async def create_product_type(
    req: ProductTypeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    obj = await MasterService.create_product_type(db, req)
    return {"success": True, "data": ProductTypeResponse.model_validate(obj)}


@router.patch("/product-types/{pt_id}", response_model=None)
async def update_product_type(
    pt_id: UUID,
    req: ProductTypeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    obj = await MasterService.update_product_type(db, pt_id, req)
    return {"success": True, "data": ProductTypeResponse.model_validate(obj)}


# ── Colors ───────────────────────────────────────────────


@router.get("/colors", response_model=None)
async def list_colors(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    items = await MasterService.get_colors(db)
    return {"success": True, "data": [ColorResponse.model_validate(i) for i in items]}


@router.get("/colors/all", response_model=None)
async def all_active_colors(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    items = await MasterService.get_active_colors(db)
    return {"success": True, "data": [ColorResponse.model_validate(i) for i in items]}


@router.post("/colors", response_model=None, status_code=201)
async def create_color(
    req: ColorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    obj = await MasterService.create_color(db, req)
    return {"success": True, "data": ColorResponse.model_validate(obj)}


@router.patch("/colors/{color_id}", response_model=None)
async def update_color(
    color_id: UUID,
    req: ColorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    obj = await MasterService.update_color(db, color_id, req)
    return {"success": True, "data": ColorResponse.model_validate(obj)}


# ── Fabrics ──────────────────────────────────────────────


@router.get("/fabrics", response_model=None)
async def list_fabrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    items = await MasterService.get_fabrics(db)
    return {"success": True, "data": [FabricResponse.model_validate(i) for i in items]}


@router.get("/fabrics/all", response_model=None)
async def all_active_fabrics(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    items = await MasterService.get_active_fabrics(db)
    return {"success": True, "data": [FabricResponse.model_validate(i) for i in items]}


@router.post("/fabrics", response_model=None, status_code=201)
async def create_fabric(
    req: FabricCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    obj = await MasterService.create_fabric(db, req)
    return {"success": True, "data": FabricResponse.model_validate(obj)}


@router.patch("/fabrics/{fabric_id}", response_model=None)
async def update_fabric(
    fabric_id: UUID,
    req: FabricUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    obj = await MasterService.update_fabric(db, fabric_id, req)
    return {"success": True, "data": FabricResponse.model_validate(obj)}


# ── Value Additions ─────────────────────────────────────


@router.get("/value-additions", response_model=None)
async def list_value_additions(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    items = await MasterService.get_value_additions(db)
    return {"success": True, "data": [ValueAdditionResponse.model_validate(i) for i in items]}


@router.get("/value-additions/all", response_model=None)
async def all_active_value_additions(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    items = await MasterService.get_active_value_additions(db)
    return {"success": True, "data": [ValueAdditionResponse.model_validate(i) for i in items]}


@router.post("/value-additions", response_model=None, status_code=201)
async def create_value_addition(
    req: ValueAdditionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    obj = await MasterService.create_value_addition(db, req)
    return {"success": True, "data": ValueAdditionResponse.model_validate(obj)}


@router.patch("/value-additions/{va_id}", response_model=None)
async def update_value_addition(
    va_id: UUID,
    req: ValueAdditionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    obj = await MasterService.update_value_addition(db, va_id, req)
    return {"success": True, "data": ValueAdditionResponse.model_validate(obj)}


# ── VA Parties ─────────────────────────────────────────


@router.get("/va-parties", response_model=None)
async def list_va_parties(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    items = await MasterService.get_va_parties(db)
    return {"success": True, "data": [VAPartyResponse.model_validate(i) for i in items]}


@router.get("/va-parties/all", response_model=None)
async def all_active_va_parties(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    items = await MasterService.get_active_va_parties(db)
    return {"success": True, "data": [VAPartyResponse.model_validate(i) for i in items]}


@router.post("/va-parties", response_model=None, status_code=201)
async def create_va_party(
    req: VAPartyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    obj = await MasterService.create_va_party(db, req)
    return {"success": True, "data": VAPartyResponse.model_validate(obj)}


@router.get("/va-parties/{party_id}/summary", response_model=None)
async def va_party_summary(
    party_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    """VA Party summary — balance, challans, cost, damage stats."""
    from sqlalchemy import func, select
    from app.models.job_challan import JobChallan
    from app.models.batch_challan import BatchChallan
    from app.models.ledger_entry import LedgerEntry

    # Challan counts + cost
    jc_stmt = select(
        func.count().label("count"),
        func.coalesce(func.sum(JobChallan.total_cost), 0).label("cost"),
    ).where(JobChallan.va_party_id == party_id, JobChallan.status != "cancelled")
    jc = (await db.execute(jc_stmt)).one()

    bc_stmt = select(
        func.count().label("count"),
        func.coalesce(func.sum(BatchChallan.total_cost), 0).label("cost"),
    ).where(BatchChallan.va_party_id == party_id, BatchChallan.status != "cancelled")
    bc = (await db.execute(bc_stmt)).one()

    # Ledger balance
    ledger_stmt = select(
        func.coalesce(func.sum(LedgerEntry.debit), 0).label("total_debit"),
        func.coalesce(func.sum(LedgerEntry.credit), 0).label("total_credit"),
    ).where(LedgerEntry.party_type == "va_party", LedgerEntry.party_id == party_id)
    ledger = (await db.execute(ledger_stmt)).one()

    # Damage claims
    damage_stmt = select(
        func.count().label("count"),
        func.coalesce(func.sum(LedgerEntry.debit), 0).label("amount"),
    ).where(
        LedgerEntry.party_type == "va_party",
        LedgerEntry.party_id == party_id,
        LedgerEntry.reference_type == "damage_claim",
    )
    damage = (await db.execute(damage_stmt)).one()

    total_debit = float(ledger.total_debit)
    total_credit = float(ledger.total_credit)
    balance = total_credit - total_debit  # positive = we owe them
    return {
        "success": True,
        "data": {
            "job_challans": {"count": jc.count, "total_cost": float(jc.cost)},
            "batch_challans": {"count": bc.count, "total_cost": float(bc.cost)},
            "total_processed_cost": float(jc.cost) + float(bc.cost),
            "total_debit": total_debit,
            "total_credit": total_credit,
            "balance": abs(balance),
            "balance_type": "cr" if balance >= 0 else "dr",
            "damage_claims": {"count": damage.count, "amount": float(damage.amount)},
        },
    }


@router.patch("/va-parties/{party_id}", response_model=None)
async def update_va_party(
    party_id: UUID,
    req: VAPartyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    obj = await MasterService.update_va_party(db, party_id, req)
    return {"success": True, "data": VAPartyResponse.model_validate(obj)}
