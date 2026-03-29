"""ReturnNote service — CRUD + status transitions + stock/ledger integration."""

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.return_note import ReturnNote, ReturnNoteItem
from app.models.roll import Roll
from app.models.sku import SKU
from app.models.supplier import Supplier
from app.schemas.return_note import (
    ReturnNoteCreate,
    ReturnNoteFilterParams,
    ReturnNoteUpdate,
)
from app.core.code_generator import next_return_note_number
from app.core.exceptions import (
    NotFoundError,
    InvalidStateTransitionError,
    ValidationError,
)


class ReturnNoteService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_return_notes(self, params: ReturnNoteFilterParams, fy_id: UUID) -> dict:
        stmt = (
            select(ReturnNote)
            .options(
                selectinload(ReturnNote.supplier),
                selectinload(ReturnNote.created_by_user),
                selectinload(ReturnNote.items),
            )
            .order_by(ReturnNote.created_at.desc())
        )

        if fy_id:
            stmt = stmt.where(
                or_(ReturnNote.fy_id == fy_id, ReturnNote.status.in_(("draft", "approved", "dispatched")))
            )
        if params.status:
            stmt = stmt.where(ReturnNote.status == params.status)
        if params.return_type:
            stmt = stmt.where(ReturnNote.return_type == params.return_type)
        if params.supplier_id:
            stmt = stmt.where(ReturnNote.supplier_id == params.supplier_id)
        if params.search:
            q = f"%{params.search}%"
            stmt = stmt.where(
                or_(
                    ReturnNote.return_note_no.ilike(q),
                    ReturnNote.notes.ilike(q),
                )
            )

        # Count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.db.execute(count_stmt)).scalar() or 0

        # Paginate
        page = params.page
        page_size = params.page_size
        pages = max(1, (total + page_size - 1) // page_size)
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(stmt)
        notes = result.scalars().all()

        return {
            "data": [self._to_response(n) for n in notes],
            "total": total,
            "page": page,
            "pages": pages,
        }

    async def get_return_note(self, note_id: UUID) -> dict:
        note = await self._get_or_404(note_id)
        return self._to_response(note)

    async def create_return_note(self, req: ReturnNoteCreate, created_by: UUID, fy_id: UUID) -> dict:
        if req.return_type not in ("roll_return", "sku_return"):
            raise ValidationError("return_type must be 'roll_return' or 'sku_return'")

        # Validate supplier exists
        supplier = (await self.db.execute(
            select(Supplier).where(Supplier.id == req.supplier_id)
        )).scalar_one_or_none()
        if not supplier:
            raise NotFoundError("Supplier not found")

        note_no = await next_return_note_number(self.db, fy_id)

        note = ReturnNote(
            return_note_no=note_no,
            return_type=req.return_type,
            supplier_id=req.supplier_id,
            status="draft",
            return_date=req.return_date or datetime.now(timezone.utc).date(),
            transport_id=req.transport_id,
            lr_number=req.lr_number,
            notes=req.notes,
            created_by=created_by,
            fy_id=fy_id,
        )
        self.db.add(note)
        await self.db.flush()

        total_amount = Decimal("0")
        for item_req in req.items:
            amount = Decimal("0")
            if item_req.unit_price and item_req.quantity:
                amount = item_req.unit_price * item_req.quantity
            elif item_req.unit_price and item_req.weight:
                amount = item_req.unit_price * item_req.weight

            rni = ReturnNoteItem(
                return_note_id=note.id,
                roll_id=item_req.roll_id,
                sku_id=item_req.sku_id,
                quantity=item_req.quantity,
                weight=item_req.weight,
                unit_price=item_req.unit_price,
                amount=amount,
                reason=item_req.reason,
                condition=item_req.condition,
                notes=item_req.notes,
            )
            self.db.add(rni)
            total_amount += amount

        note.total_amount = total_amount
        await self.db.flush()

        return await self.get_return_note(note.id)

    async def update_return_note(self, note_id: UUID, req: ReturnNoteUpdate) -> dict:
        note = await self._get_or_404(note_id)
        if note.status != "draft":
            raise InvalidStateTransitionError("Can only edit drafts")

        if req.return_date is not None:
            note.return_date = req.return_date
        if req.transport_id is not None:
            note.transport_id = req.transport_id or None
        if req.lr_number is not None:
            note.lr_number = req.lr_number or None
        if req.notes is not None:
            note.notes = req.notes or None

        await self.db.flush()
        return await self.get_return_note(note_id)

    async def approve_return_note(self, note_id: UUID, user_id: UUID) -> dict:
        note = await self._get_or_404(note_id)
        if note.status != "draft":
            raise InvalidStateTransitionError(f"Cannot approve from '{note.status}' (expected 'draft')")

        note.status = "approved"
        note.approved_by = user_id
        note.approved_at = datetime.now(timezone.utc)
        await self.db.flush()
        return await self.get_return_note(note_id)

    async def dispatch_return_note(self, note_id: UUID, user_id: UUID) -> dict:
        """Mark as dispatched — stock goes out (STOCK_OUT for SKUs, status change for rolls)."""
        note = await self._get_or_404(note_id)
        if note.status != "approved":
            raise InvalidStateTransitionError(f"Cannot dispatch from '{note.status}' (expected 'approved')")

        note.status = "dispatched"
        note.dispatch_date = datetime.now(timezone.utc).date()
        await self.db.flush()

        # Stock reversal
        if note.return_type == "sku_return":
            from app.services.inventory_service import InventoryService
            inv_svc = InventoryService(self.db)
            for item in note.items:
                if item.sku_id:
                    await inv_svc.create_event(
                        event_type="stock_out",
                        item_type="finished_goods",
                        reference_type="supplier_return",
                        reference_id=note.id,
                        sku_id=item.sku_id,
                        quantity=item.quantity,
                        performed_by=user_id,
                        metadata={
                            "return_note_no": note.return_note_no,
                            "reason": item.reason,
                        },
                    )
        elif note.return_type == "roll_return":
            for item in note.items:
                if item.roll_id:
                    roll = (await self.db.execute(
                        select(Roll).where(Roll.id == item.roll_id).with_for_update()
                    )).scalar_one_or_none()
                    if roll:
                        roll.status = "returned"

        await self.db.flush()
        return await self.get_return_note(note_id)

    async def acknowledge_return_note(self, note_id: UUID) -> dict:
        note = await self._get_or_404(note_id)
        if note.status != "dispatched":
            raise InvalidStateTransitionError(f"Cannot acknowledge from '{note.status}' (expected 'dispatched')")

        note.status = "acknowledged"
        await self.db.flush()
        return await self.get_return_note(note_id)

    async def close_return_note(self, note_id: UUID, user_id: UUID) -> dict:
        """Close — create debit ledger entry against supplier (they owe us refund)."""
        note = await self._get_or_404(note_id)
        if note.status not in ("dispatched", "acknowledged"):
            raise InvalidStateTransitionError(f"Cannot close from '{note.status}'")

        note.status = "closed"
        await self.db.flush()

        # Debit supplier ledger
        if note.supplier_id and note.total_amount and float(note.total_amount) > 0:
            from app.services.ledger_service import LedgerService
            from app.schemas.ledger import LedgerEntryCreate
            ledger = LedgerService(self.db)
            await ledger.create_entry(LedgerEntryCreate(
                entry_date=datetime.now(timezone.utc).date(),
                party_type="supplier",
                party_id=note.supplier_id,
                entry_type="adjustment",
                reference_type="supplier_return",
                reference_id=note.id,
                debit=float(note.total_amount),
                credit=0,
                description=f"Return {note.return_note_no} — ₹{float(note.total_amount):,.2f}",
                fy_id=note.fy_id,
                created_by=user_id,
            ))
            await self.db.flush()

        return await self.get_return_note(note_id)

    async def cancel_return_note(self, note_id: UUID) -> dict:
        note = await self._get_or_404(note_id)
        if note.status not in ("draft", "approved"):
            raise InvalidStateTransitionError(f"Cannot cancel from '{note.status}' (only draft or approved)")

        note.status = "cancelled"
        await self.db.flush()
        return await self.get_return_note(note_id)

    # ── Internal ──

    async def _get_or_404(self, note_id: UUID) -> ReturnNote:
        stmt = (
            select(ReturnNote)
            .where(ReturnNote.id == note_id)
            .options(
                selectinload(ReturnNote.supplier),
                selectinload(ReturnNote.transport),
                selectinload(ReturnNote.approved_by_user),
                selectinload(ReturnNote.created_by_user),
                selectinload(ReturnNote.items).selectinload(ReturnNoteItem.roll),
                selectinload(ReturnNote.items).selectinload(ReturnNoteItem.sku),
            )
        )
        result = await self.db.execute(stmt)
        note = result.scalar_one_or_none()
        if not note:
            raise NotFoundError(f"Return note {note_id} not found")
        return note

    def _to_response(self, n: ReturnNote) -> dict:
        return {
            "id": str(n.id),
            "return_note_no": n.return_note_no,
            "return_type": n.return_type,
            "supplier": {
                "id": str(n.supplier.id),
                "name": n.supplier.name,
                "phone": n.supplier.phone,
                "city": n.supplier.city,
            } if n.supplier else None,
            "status": n.status,
            "return_date": n.return_date.isoformat() if n.return_date else None,
            "approved_by_user": {
                "id": str(n.approved_by_user.id),
                "full_name": n.approved_by_user.full_name,
            } if n.approved_by_user else None,
            "approved_at": n.approved_at.isoformat() if n.approved_at else None,
            "dispatch_date": n.dispatch_date.isoformat() if n.dispatch_date else None,
            "transport": {
                "id": str(n.transport.id),
                "name": n.transport.name,
            } if n.transport else None,
            "lr_number": n.lr_number,
            "total_amount": float(n.total_amount) if n.total_amount else 0,
            "notes": n.notes,
            "created_by_user": {
                "id": str(n.created_by_user.id),
                "full_name": n.created_by_user.full_name,
            } if n.created_by_user else None,
            "created_at": n.created_at.isoformat() if n.created_at else None,
            "items": [
                {
                    "id": str(item.id),
                    "roll": {
                        "id": str(item.roll.id),
                        "roll_code": item.roll.roll_code,
                        "fabric_type": item.roll.fabric_type,
                        "color": item.roll.color,
                        "total_weight": float(item.roll.total_weight) if item.roll.total_weight else 0,
                    } if item.roll else None,
                    "sku": {
                        "id": str(item.sku.id),
                        "sku_code": item.sku.sku_code,
                        "product_name": item.sku.product_name,
                        "color": item.sku.color,
                        "size": item.sku.size,
                    } if item.sku else None,
                    "quantity": item.quantity,
                    "weight": float(item.weight) if item.weight else None,
                    "unit_price": float(item.unit_price) if item.unit_price else None,
                    "amount": float(item.amount) if item.amount else None,
                    "reason": item.reason,
                    "condition": item.condition,
                    "notes": item.notes,
                }
                for item in (n.items or [])
            ],
        }
