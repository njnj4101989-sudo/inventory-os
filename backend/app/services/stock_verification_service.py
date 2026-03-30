"""StockVerificationService — physical stock count workflow."""

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import BusinessRuleViolationError, NotFoundError, ValidationError
from app.models.stock_verification import StockVerification, StockVerificationItem
from app.models.inventory_state import InventoryState
from app.models.sku import SKU
from app.models.roll import Roll
from app.models.inventory_event import InventoryEvent


class StockVerificationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_verifications(self, verification_type: str | None = None) -> list[dict]:
        stmt = (
            select(StockVerification)
            .options(selectinload(StockVerification.items))
            .order_by(StockVerification.created_at.desc())
        )
        if verification_type:
            stmt = stmt.where(StockVerification.verification_type == verification_type)

        result = await self.db.execute(stmt)
        rows = result.scalars().all()
        return [self._to_brief(v) for v in rows]

    async def get_verification(self, verification_id: UUID) -> dict:
        v = await self._get(verification_id)
        return self._to_response(v)

    async def create(
        self,
        verification_type: str,
        fy_id: UUID | None,
        started_by: UUID,
        notes: str | None = None,
    ) -> dict:
        if verification_type not in ("raw_material", "finished_goods"):
            raise ValidationError("verification_type must be 'raw_material' or 'finished_goods'")

        from app.core.code_generator import next_verification_number
        vno = await next_verification_number(self.db, fy_id)

        verification = StockVerification(
            verification_no=vno,
            verification_type=verification_type,
            verification_date=date.today(),
            status="draft",
            notes=notes,
            started_by=started_by,
            fy_id=fy_id,
        )
        self.db.add(verification)
        await self.db.flush()

        # Auto-populate items from current stock
        if verification_type == "finished_goods":
            await self._populate_finished_goods(verification.id)
        else:
            await self._populate_raw_materials(verification.id)

        await self.db.flush()

        # Re-fetch with items
        return await self.get_verification(verification.id)

    async def update_counts(self, verification_id: UUID, counts: list[dict]) -> dict:
        v = await self._get(verification_id)
        if v.status not in ("draft", "in_progress"):
            raise BusinessRuleViolationError("Can only update counts on draft/in-progress verifications")

        # Build lookup of items
        item_map = {item.id: item for item in v.items}

        for entry in counts:
            item = item_map.get(entry["item_id"])
            if not item:
                continue

            physical = Decimal(str(entry["physical_qty"]))
            item.physical_qty = physical
            book = item.book_qty or Decimal("0")
            variance = physical - book
            item.variance = variance
            item.variance_pct = round((variance / book) * 100, 2) if book > 0 else Decimal("0")

            if variance < 0:
                item.adjustment_type = "shortage"
            elif variance > 0:
                item.adjustment_type = "excess"
            else:
                item.adjustment_type = "match"

            if entry.get("notes"):
                item.notes = entry["notes"]

        if v.status == "draft":
            v.status = "in_progress"

        await self.db.flush()
        return await self.get_verification(verification_id)

    async def complete(self, verification_id: UUID) -> dict:
        v = await self._get(verification_id)
        if v.status not in ("draft", "in_progress"):
            raise BusinessRuleViolationError("Can only complete draft/in-progress verifications")

        # Check all items have physical_qty
        uncounted = sum(1 for item in v.items if item.physical_qty is None)
        if uncounted > 0:
            raise ValidationError(f"{uncounted} item(s) still uncounted. Enter physical quantities for all items.")

        v.status = "completed"
        await self.db.flush()
        return await self.get_verification(verification_id)

    async def approve(self, verification_id: UUID, approved_by: UUID) -> dict:
        """Approve verification and create adjustment events for mismatches."""
        v = await self._get(verification_id)
        if v.status != "completed":
            raise BusinessRuleViolationError("Can only approve completed verifications")

        v.status = "approved"
        v.approved_by = approved_by
        v.approved_at = datetime.now(timezone.utc)

        adjustments_created = 0

        for item in v.items:
            if item.adjustment_type == "match" or item.variance is None:
                continue

            variance = item.variance

            if v.verification_type == "finished_goods" and item.sku_id:
                # Shortage → loss event, Excess → adjustment event
                if variance < 0:
                    event_type = "loss"
                    qty = int(abs(variance))
                else:
                    event_type = "adjustment"
                    qty = int(variance)

                event = InventoryEvent(
                    event_id=str(uuid.uuid4()),
                    event_type=event_type,
                    item_type="finished_goods",
                    reference_type="physical_verification",
                    reference_id=verification_id,
                    sku_id=item.sku_id,
                    quantity=qty,
                    performed_by=approved_by,
                    performed_at=datetime.now(timezone.utc),
                    metadata_={"verification_no": v.verification_no, "book_qty": float(item.book_qty), "physical_qty": float(item.physical_qty)},
                )
                self.db.add(event)

                # Update InventoryState
                state = (await self.db.execute(
                    select(InventoryState).where(InventoryState.sku_id == item.sku_id).with_for_update()
                )).scalar_one_or_none()

                if state:
                    if event_type == "loss":
                        state.total_qty = max(0, state.total_qty - qty)
                    else:
                        state.total_qty += qty
                    state.available_qty = max(0, state.total_qty - state.reserved_qty)
                    state.last_updated = datetime.now(timezone.utc)

                adjustments_created += 1

            elif v.verification_type == "raw_material" and item.roll_id:
                # Adjust roll remaining_weight
                roll = (await self.db.execute(
                    select(Roll).where(Roll.id == item.roll_id).with_for_update()
                )).scalar_one_or_none()

                if roll:
                    roll.remaining_weight = item.physical_qty
                    if item.physical_qty < roll.current_weight:
                        roll.current_weight = item.physical_qty
                adjustments_created += 1

        await self.db.flush()

        return {
            **await self.get_verification(verification_id),
            "adjustments_created": adjustments_created,
        }

    # ── Helpers ─────────────────────────────────────────────

    async def _get(self, verification_id: UUID) -> StockVerification:
        result = await self.db.execute(
            select(StockVerification)
            .options(selectinload(StockVerification.items))
            .where(StockVerification.id == verification_id)
        )
        v = result.scalar_one_or_none()
        if not v:
            raise NotFoundError("Verification not found")
        return v

    async def _populate_finished_goods(self, verification_id: UUID):
        """Add all SKUs with stock as verification items."""
        rows = (await self.db.execute(
            select(InventoryState.sku_id, InventoryState.total_qty, SKU.sku_code)
            .join(SKU, SKU.id == InventoryState.sku_id)
            .where(InventoryState.total_qty > 0)
            .order_by(SKU.sku_code)
        )).all()

        for r in rows:
            item = StockVerificationItem(
                verification_id=verification_id,
                sku_id=r.sku_id,
                item_label=r.sku_code,
                book_qty=Decimal(str(r.total_qty)),
            )
            self.db.add(item)

    async def _populate_raw_materials(self, verification_id: UUID):
        """Add all active rolls as verification items."""
        rows = (await self.db.execute(
            select(Roll.id, Roll.roll_code, Roll.remaining_weight)
            .where(
                Roll.status.in_(("in_stock", "sent_for_processing", "in_cutting", "remnant")),
                Roll.remaining_weight > 0,
            )
            .order_by(Roll.roll_code)
        )).all()

        for r in rows:
            item = StockVerificationItem(
                verification_id=verification_id,
                roll_id=r.id,
                item_label=r.roll_code,
                book_qty=r.remaining_weight,
            )
            self.db.add(item)

    def _to_response(self, v: StockVerification) -> dict:
        mismatches = sum(1 for i in v.items if i.adjustment_type and i.adjustment_type != "match")
        total_shortage = sum(float(abs(i.variance)) for i in v.items if i.adjustment_type == "shortage" and i.variance)
        total_excess = sum(float(i.variance) for i in v.items if i.adjustment_type == "excess" and i.variance)
        counted = sum(1 for i in v.items if i.physical_qty is not None)

        return {
            "id": str(v.id),
            "verification_no": v.verification_no,
            "verification_type": v.verification_type,
            "verification_date": str(v.verification_date),
            "status": v.status,
            "notes": v.notes,
            "started_by": {"id": str(v.started_by), "name": v.started_by_user.full_name} if v.started_by_user else None,
            "approved_by": {"id": str(v.approved_by), "name": v.approved_by_user.full_name} if v.approved_by_user else None,
            "approved_at": v.approved_at.isoformat() if v.approved_at else None,
            "items": [{
                "id": str(i.id),
                "sku_id": str(i.sku_id) if i.sku_id else None,
                "roll_id": str(i.roll_id) if i.roll_id else None,
                "item_label": i.item_label,
                "book_qty": float(i.book_qty) if i.book_qty else 0,
                "physical_qty": float(i.physical_qty) if i.physical_qty is not None else None,
                "variance": float(i.variance) if i.variance is not None else None,
                "variance_pct": float(i.variance_pct) if i.variance_pct is not None else None,
                "adjustment_type": i.adjustment_type,
                "notes": i.notes,
            } for i in v.items],
            "summary": {
                "total_items": len(v.items),
                "counted": counted,
                "uncounted": len(v.items) - counted,
                "matches": sum(1 for i in v.items if i.adjustment_type == "match"),
                "shortages": sum(1 for i in v.items if i.adjustment_type == "shortage"),
                "excesses": sum(1 for i in v.items if i.adjustment_type == "excess"),
                "total_shortage": round(total_shortage, 3),
                "total_excess": round(total_excess, 3),
                "mismatches": mismatches,
            },
        }

    def _to_brief(self, v: StockVerification) -> dict:
        mismatches = sum(1 for i in v.items if i.adjustment_type and i.adjustment_type != "match")
        return {
            "id": str(v.id),
            "verification_no": v.verification_no,
            "verification_type": v.verification_type,
            "verification_date": str(v.verification_date),
            "status": v.status,
            "total_items": len(v.items),
            "mismatches": mismatches,
            "started_by": v.started_by_user.full_name if v.started_by_user else None,
        }
