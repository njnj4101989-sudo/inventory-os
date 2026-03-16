"""Ledger API routes — view entries, record payments, get balances."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission
from app.models.user import User
from app.services.ledger_service import LedgerService
from app.schemas.ledger import PaymentCreate

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
    svc = LedgerService(db)
    data = await svc.get_ledger(party_type, party_id, page, page_size, entry_type, date_from, date_to)
    return {"success": True, "data": data}


@router.get("/balance")
async def get_party_balance(
    party_type: str = Query(...),
    party_id: UUID = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = LedgerService(db)
    balance = await svc.get_party_balance(party_type, party_id)
    return {"success": True, "data": balance}


@router.get("/balances")
async def get_all_balances(
    party_type: str = Query(..., description="supplier / customer / va_party"),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = LedgerService(db)
    balances = await svc.get_all_balances(party_type)
    return {"success": True, "data": balances}


@router.post("/payment")
async def record_payment(
    req: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("supplier_manage"),
):
    svc = LedgerService(db)
    entries = await svc.record_payment(req, created_by=current_user.id)
    return {
        "success": True,
        "data": [e for e in entries],
        "message": f"Payment recorded — {len(entries)} ledger entries created",
    }
