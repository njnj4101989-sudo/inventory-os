"""Return Notes API — supplier return CRUD + status transitions."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_permission, get_fy_id
from app.models.user import User
from app.schemas.return_note import (
    ReturnNoteCreate,
    ReturnNoteFilterParams,
    ReturnNoteUpdate,
)
from app.services.return_note_service import ReturnNoteService

router = APIRouter(prefix="/return-notes", tags=["Return Notes"])


@router.get("", response_model=None)
async def list_return_notes(
    params: ReturnNoteFilterParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    fy_id = get_fy_id(current_user)
    svc = ReturnNoteService(db)
    return await svc.list_return_notes(params, fy_id)


@router.get("/next-number", response_model=None)
async def get_next_number(
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    from app.core.code_generator import next_return_note_number
    fy_id = get_fy_id(current_user)
    num = await next_return_note_number(db, fy_id)
    return {"success": True, "data": {"next_number": num}}


@router.get("/{note_id}", response_model=None)
async def get_return_note(
    note_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    svc = ReturnNoteService(db)
    result = await svc.get_return_note(note_id)
    return {"success": True, "data": result}


@router.post("", response_model=None)
async def create_return_note(
    req: ReturnNoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    fy_id = get_fy_id(current_user)
    svc = ReturnNoteService(db)
    result = await svc.create_return_note(req, current_user.id, fy_id)
    return {"success": True, "data": result, "message": "Return note created"}


@router.patch("/{note_id}", response_model=None)
async def update_return_note(
    note_id: UUID,
    req: ReturnNoteUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    svc = ReturnNoteService(db)
    result = await svc.update_return_note(note_id, req)
    return {"success": True, "data": result}


@router.post("/{note_id}/approve", response_model=None)
async def approve_return_note(
    note_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    svc = ReturnNoteService(db)
    result = await svc.approve_return_note(note_id, current_user.id)
    return {"success": True, "data": result, "message": "Return note approved"}


@router.post("/{note_id}/dispatch", response_model=None)
async def dispatch_return_note(
    note_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    svc = ReturnNoteService(db)
    result = await svc.dispatch_return_note(note_id, current_user.id)
    return {"success": True, "data": result, "message": "Return note dispatched"}


@router.post("/{note_id}/acknowledge", response_model=None)
async def acknowledge_return_note(
    note_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    svc = ReturnNoteService(db)
    result = await svc.acknowledge_return_note(note_id)
    return {"success": True, "data": result, "message": "Return acknowledged"}


@router.post("/{note_id}/close", response_model=None)
async def close_return_note(
    note_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    svc = ReturnNoteService(db)
    result = await svc.close_return_note(note_id, current_user.id)
    return {"success": True, "data": result, "message": "Return note closed — supplier debited"}


@router.post("/{note_id}/cancel", response_model=None)
async def cancel_return_note(
    note_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = require_permission("order_manage"),
):
    svc = ReturnNoteService(db)
    result = await svc.cancel_return_note(note_id)
    return {"success": True, "data": result, "message": "Return note cancelled"}
