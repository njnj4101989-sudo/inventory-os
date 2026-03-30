"""Ledger API routes — view entries, record payments, get balances, party confirmation."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission, get_fy_id
from app.models.user import User
from app.services.ledger_service import LedgerService
from app.schemas.ledger import PaymentCreate, OpeningBalanceEntry, OpeningBalanceBulkRequest

router = APIRouter(prefix="/ledger", tags=["ledger"])


@router.get("")
async def get_ledger_entries(
    party_type: str = Query(..., description="supplier / customer / va_party"),
    party_id: UUID = Query(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=0),
    entry_type: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    fy_id = get_fy_id(current_user)
    svc = LedgerService(db)
    data = await svc.get_ledger(party_type, party_id, fy_id, page, page_size, entry_type, date_from, date_to)
    return {"success": True, "data": data}


@router.get("/balance")
async def get_party_balance(
    party_type: str = Query(...),
    party_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    fy_id = get_fy_id(current_user)
    svc = LedgerService(db)
    balance = await svc.get_party_balance(party_type, party_id, fy_id)
    return {"success": True, "data": balance}


@router.get("/balances")
async def get_all_balances(
    party_type: str = Query(..., description="supplier / customer / va_party"),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    fy_id = get_fy_id(current_user)
    svc = LedgerService(db)
    balances = await svc.get_all_balances(party_type, fy_id)
    return {"success": True, "data": balances}


@router.post("/payment")
async def record_payment(
    req: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    fy_id = get_fy_id(current_user)
    svc = LedgerService(db)
    entries = await svc.record_payment(req, fy_id=fy_id, created_by=current_user.id)
    return {
        "success": True,
        "data": [e for e in entries],
        "message": f"Payment recorded — {len(entries)} ledger entries created",
    }


@router.post("/opening-balance")
async def create_opening_balance(
    req: OpeningBalanceEntry,
    force: bool = Query(False, description="Override existing opening balance"),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    """Create opening balance for a single party. Use force=true to override existing."""
    fy_id = get_fy_id(current_user)
    svc = LedgerService(db)
    result = await svc.create_opening_balance(
        party_type=req.party_type,
        party_id=req.party_id,
        amount=req.amount,
        balance_type=req.balance_type,
        fy_id=fy_id,
        entry_date=req.entry_date,
        notes=req.notes,
        created_by=current_user.id,
        force=force,
    )
    return {"success": True, "data": result, "message": result["message"]}


@router.post("/opening-balance/bulk")
async def create_opening_balance_bulk(
    req: OpeningBalanceBulkRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    """Bulk opening balance entry. Overwrites existing opening entries."""
    fy_id = get_fy_id(current_user)
    svc = LedgerService(db)
    result = await svc.create_opening_balance_bulk(
        entries=req.entries,
        fy_id=fy_id,
        created_by=current_user.id,
    )
    return {"success": True, "data": result, "message": result["message"]}


@router.get("/opening-balance/status")
async def opening_balance_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    """Per party_type count of parties with/without opening balance in current FY."""
    fy_id = get_fy_id(current_user)
    svc = LedgerService(db)
    result = await svc.get_opening_balance_status(fy_id)
    return {"success": True, "data": result}


@router.get("/party-confirmation/{party_type}/{party_id}")
async def party_confirmation(
    party_type: str,
    party_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("report_view"),
):
    """Balance confirmation report for a party — opening, transactions, closing, unpaid invoices."""
    fy_id = get_fy_id(current_user)
    svc = LedgerService(db)
    result = await svc.get_party_confirmation(party_type, party_id, fy_id)
    return {"success": True, "data": result}
