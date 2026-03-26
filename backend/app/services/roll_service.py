"""Roll service — stock-in, queries, consumption history."""

import math
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.supplier import Supplier

from app.models.roll import Roll, RollProcessing
from app.models.color import Color
from app.models.supplier_invoice import SupplierInvoice
from app.models.inventory_event import InventoryEvent
from app.models.batch_roll_consumption import BatchRollConsumption
from app.models.lot import Lot, LotRoll
from app.models.batch import Batch
from app.models.batch_assignment import BatchAssignment
from app.schemas.roll import (
    RollCreate, RollUpdate, RollFilterParams, RollResponse, RollDetail,
    ReceiveFromProcessing, UpdateProcessingLog,
    BulkStockIn, SupplierInvoiceParams,
)
from app.core.code_generator import next_roll_code
from app.core.exceptions import NotFoundError, BusinessRuleViolationError


class RollService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_rolls(self, params: RollFilterParams, fy_id: UUID) -> dict:
        # FY scoping: current FY records + active rolls from any previous FY
        _ROLL_ACTIVE = ("in_stock", "remnant", "sent_for_processing")
        conditions = [or_(Roll.fy_id == fy_id, Roll.status.in_(_ROLL_ACTIVE))]

        if params.status:
            conditions.append(Roll.status == params.status)

        if params.fabric_type:
            # Used as search text — match against code, fabric, color, invoice
            search = f"%{params.fabric_type}%"
            conditions.append(
                Roll.roll_code.ilike(search)
                | Roll.fabric_type.ilike(search)
                | Roll.color.ilike(search)
                | Roll.supplier_invoice_no.ilike(search)
            )

        if params.fabric_filter:
            conditions.append(Roll.fabric_type == params.fabric_filter)

        if params.has_remaining:
            conditions.append(Roll.remaining_weight > 0)

        if params.fully_consumed:
            conditions.append(Roll.remaining_weight <= 0)

        if params.max_remaining_weight is not None:
            conditions.append(Roll.remaining_weight <= params.max_remaining_weight)

        if params.supplier_id:
            conditions.append(Roll.supplier_id == params.supplier_id)

        if params.sr_no:
            conditions.append(Roll.sr_no == params.sr_no)

        if params.value_addition_id:
            conditions.append(
                Roll.id.in_(
                    select(RollProcessing.roll_id).where(
                        RollProcessing.value_addition_id == params.value_addition_id
                    )
                )
            )

        # Count with filters applied
        count_stmt = select(func.count()).select_from(Roll)
        if conditions:
            count_stmt = count_stmt.where(*conditions)
        total = (await self.db.execute(count_stmt)).scalar() or 0
        no_limit = params.page_size == 0
        pages = 1 if no_limit else max(1, math.ceil(total / params.page_size))

        sort_col = getattr(Roll, params.sort_by, Roll.created_at)
        order = sort_col.desc() if params.sort_order == "desc" else sort_col.asc()

        stmt = (
            select(Roll)
            .options(
                selectinload(Roll.color_obj),
                selectinload(Roll.supplier),
                selectinload(Roll.supplier_invoice),
                selectinload(Roll.received_by_user),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.value_addition),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.va_party),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.job_challan),
            )
            .order_by(order)
        )
        if not no_limit:
            stmt = stmt.offset((params.page - 1) * params.page_size).limit(params.page_size)
        if conditions:
            stmt = stmt.where(*conditions)

        result = await self.db.execute(stmt)
        rolls = result.scalars().all()

        return {
            "data": [self._to_response(r) for r in rolls],
            "total": total,
            "page": params.page,
            "pages": pages,
        }

    async def get_roll(self, roll_id: UUID) -> dict:
        stmt = (
            select(Roll)
            .where(Roll.id == roll_id)
            .options(
                selectinload(Roll.color_obj),
                selectinload(Roll.supplier),
                selectinload(Roll.supplier_invoice),
                selectinload(Roll.received_by_user),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.value_addition),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.va_party),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.job_challan),
            )
        )
        result = await self.db.execute(stmt)
        roll = result.scalar_one_or_none()
        if not roll:
            raise NotFoundError(f"Roll {roll_id} not found")

        consumption = await self.get_consumption_history(roll_id)

        resp = self._to_response(roll)
        resp["consumption_history"] = consumption
        return resp

    async def get_roll_passport(self, roll_code: str) -> dict:
        """Public roll passport — full chain: origin → processing → lots → batches."""
        stmt = (
            select(Roll)
            .where(Roll.roll_code == roll_code)
            .options(
                selectinload(Roll.color_obj),
                selectinload(Roll.supplier),
                selectinload(Roll.supplier_invoice),
                selectinload(Roll.received_by_user),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.value_addition),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.va_party),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.job_challan),
                selectinload(Roll.lot_rolls)
                    .selectinload(LotRoll.lot)
                    .selectinload(Lot.batches)
                    .selectinload(Batch.sku),
                selectinload(Roll.lot_rolls)
                    .selectinload(LotRoll.lot)
                    .selectinload(Lot.batches)
                    .selectinload(Batch.assignments)
                    .selectinload(BatchAssignment.tailor),
            )
        )
        result = await self.db.execute(stmt)
        roll = result.scalar_one_or_none()
        if not roll:
            raise NotFoundError(f"Roll '{roll_code}' not found")

        # Build lots + batches chain
        lots = []
        batches = []
        seen_batch_ids: set[str] = set()

        for lot_roll in (roll.lot_rolls or []):
            lot = lot_roll.lot
            if not lot:
                continue
            lots.append({
                "id": str(lot.id),
                "lot_code": lot.lot_code,
                "lot_date": lot.lot_date.isoformat() if lot.lot_date else None,
                "designs": lot.designs or [],
                "weight_used": float(lot_roll.weight_used) if lot_roll.weight_used else None,
                "waste_weight": float(lot_roll.waste_weight) if lot_roll.waste_weight else None,
                "pieces_from_roll": lot_roll.pieces_from_roll,
                "status": lot.status,
            })
            for batch in (lot.batches or []):
                bid = str(batch.id)
                if bid in seen_batch_ids:
                    continue
                seen_batch_ids.add(bid)

                tailor = None
                if batch.assignments:
                    a = batch.assignments[0]
                    tailor = {
                        "id": str(a.tailor.id),
                        "full_name": a.tailor.full_name,
                    } if a.tailor else None

                sku_code = batch.sku.sku_code if batch.sku else None
                # Phase 1: effective_sku = base sku_code
                # Phase 2 will append value addition short_codes (+EMB, +DYE, etc.)
                effective_sku = sku_code

                batches.append({
                    "id": bid,
                    "batch_code": batch.batch_code,
                    "sku_code": sku_code,
                    "effective_sku": effective_sku,
                    "quantity": batch.quantity,
                    "status": batch.status,
                    "tailor": tailor,
                })

        # Compute value additions for passport display (all logs have a VA now)
        value_additions = []
        for p in (roll.processing_logs or []):
            entry = self._processing_to_response(p)
            if p.value_addition:
                entry["name"] = p.value_addition.name
                entry["short_code"] = p.value_addition.short_code
            value_additions.append(entry)

        # Compute effective_sku: base sku + received value addition short_codes
        va_suffixes = [
            p.value_addition.short_code
            for p in (roll.processing_logs or [])
            if p.status == "received" and p.value_addition
        ]
        base_sku = batches[0]["sku_code"] if batches else None
        effective_sku = None
        if base_sku:
            effective_sku = base_sku + ("+" + "+".join(va_suffixes) if va_suffixes else "")

        passport = self._to_response(roll)
        passport.update({
            "value_additions": value_additions,
            "lots": lots,
            "batches": batches,
            "orders": [],   # Future: traverse batch → order items
            "effective_sku": effective_sku,
        })
        return passport

    async def bulk_stock_in(self, req: BulkStockIn, received_by: UUID, fy_id: UUID) -> dict:
        """Atomic bulk stock-in: create all rolls in a single transaction.

        All-or-nothing — if any roll fails validation, entire batch rolls back.
        """
        if not req.rolls:
            raise BusinessRuleViolationError("At least one roll entry is required")
        if len(req.rolls) > 200:
            raise BusinessRuleViolationError("Maximum 200 rolls per bulk stock-in")

        created_rolls = []
        now = datetime.now(timezone.utc)

        # If adding rolls to an existing invoice (edit flow), use that invoice directly
        if req.supplier_invoice_id:
            si_stmt = select(SupplierInvoice).where(SupplierInvoice.id == req.supplier_invoice_id)
            si_result = await self.db.execute(si_stmt)
            supplier_inv = si_result.scalar_one_or_none()
            if not supplier_inv:
                raise NotFoundError(f"Supplier invoice {req.supplier_invoice_id} not found")
        else:
            # Duplicate check: same supplier + invoice_no (+ challan_no if provided)
            if req.supplier_id and req.supplier_invoice_no:
                dup_conditions = [
                    SupplierInvoice.supplier_id == req.supplier_id,
                    SupplierInvoice.invoice_no == req.supplier_invoice_no,
                ]
                if req.supplier_challan_no:
                    dup_conditions.append(SupplierInvoice.challan_no == req.supplier_challan_no)
                else:
                    dup_conditions.append(
                        or_(SupplierInvoice.challan_no == None, SupplierInvoice.challan_no == "")
                    )

                dup_stmt = (
                    select(SupplierInvoice)
                    .where(and_(*dup_conditions))
                    .options(selectinload(SupplierInvoice.supplier))
                    .limit(1)
                )
                dup_result = await self.db.execute(dup_stmt)
                existing = dup_result.scalar_one_or_none()

                if existing:
                    supplier_name = existing.supplier.name if existing.supplier else "Unknown"
                    roll_count = (await self.db.execute(
                        select(func.count()).select_from(Roll)
                        .where(Roll.supplier_invoice_id == existing.id)
                    )).scalar() or 0
                    challan_part = f" / Challan: {req.supplier_challan_no}" if req.supplier_challan_no else ""
                    raise BusinessRuleViolationError(
                        f"Invoice '{req.supplier_invoice_no}'{challan_part} from '{supplier_name}' "
                        f"is already in stock with {roll_count} roll(s) "
                        f"(entered on {existing.received_at.strftime('%d-%b-%Y') if existing.received_at else '—'}). "
                        f"Please verify before re-entering."
                    )

            # Create new SupplierInvoice record
            supplier_inv = SupplierInvoice(
                supplier_id=req.supplier_id,
                invoice_no=req.supplier_invoice_no,
                challan_no=req.supplier_challan_no,
                invoice_date=req.supplier_invoice_date,
                sr_no=req.sr_no,
                gst_percent=req.gst_percent,
                received_by=received_by,
                received_at=now,
                fy_id=fy_id,
            )
            self.db.add(supplier_inv)
            await self.db.flush()

        for entry in req.rolls:
            if entry.total_weight <= 0:
                raise BusinessRuleViolationError(
                    f"Weight must be > 0 for {entry.color} {entry.fabric_type}"
                )

            roll_code = await next_roll_code(
                self.db,
                challan_no=req.sr_no or "STOCK",
                fabric_type=entry.fabric_type,
                color=entry.color,
                fabric_code=entry.fabric_code,
                color_code=entry.color_code,
                color_no=entry.color_no,
            )

            roll = Roll(
                roll_code=roll_code,
                fabric_type=entry.fabric_type,
                color=entry.color,
                color_id=entry.color_id,
                total_weight=entry.total_weight,
                remaining_weight=entry.total_weight,
                current_weight=entry.total_weight,
                unit=entry.unit or "kg",
                cost_per_unit=entry.cost_per_unit,
                total_length=entry.total_length,
                supplier_id=req.supplier_id,
                supplier_invoice_no=req.supplier_invoice_no,
                supplier_challan_no=req.supplier_challan_no,
                supplier_invoice_date=req.supplier_invoice_date,
                sr_no=req.sr_no,
                supplier_invoice_id=supplier_inv.id,
                panna=entry.panna,
                gsm=entry.gsm,
                received_by=received_by,
                received_at=now,
                status="in_stock",
                notes=entry.notes,
                fy_id=fy_id,
            )
            self.db.add(roll)
            created_rolls.append(roll)

        await self.db.flush()

        # Auto-create ledger entry for supplier invoice
        subtotal = sum(
            float(r.total_weight or 0) * float(r.cost_per_unit or 0)
            for r in created_rolls
        )
        if subtotal > 0:
            gst_pct = float(req.gst_percent or 0)
            gst_amt = round(subtotal * gst_pct / 100, 2)
            total = round(subtotal + gst_amt, 2)
            from app.services.ledger_service import LedgerService
            from app.schemas.ledger import LedgerEntryCreate
            ledger = LedgerService(self.db)
            await ledger.create_entry(LedgerEntryCreate(
                entry_date=req.supplier_invoice_date or now.date(),
                party_type="supplier",
                party_id=req.supplier_id,
                entry_type="invoice",
                reference_type="supplier_invoice",
                reference_id=supplier_inv.id,
                debit=0,
                credit=total,
                description=f"Stock-in {req.supplier_invoice_no or 'N/A'} — {len(created_rolls)} rolls, ₹{total:,.2f}",
                created_by=received_by,
                fy_id=fy_id,
            ))
            await self.db.flush()

        # Reload all with relationships
        roll_ids = [r.id for r in created_rolls]
        stmt = (
            select(Roll)
            .where(Roll.id.in_(roll_ids))
            .options(
                selectinload(Roll.color_obj),
                selectinload(Roll.supplier),
                selectinload(Roll.supplier_invoice),
                selectinload(Roll.received_by_user),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.value_addition),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.va_party),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.job_challan),
            )
            .order_by(Roll.created_at.asc())
        )
        result = await self.db.execute(stmt)
        rolls = result.scalars().all()

        # Emit SSE event
        from app.core.event_bus import event_bus
        await event_bus.emit("bulk_stock_in", {
            "count": len(rolls),
            "sr_no": req.sr_no,
            "supplier_invoice_no": req.supplier_invoice_no,
        }, str(received_by))

        return {
            "rolls": [self._to_response(r) for r in rolls],
            "count": len(rolls),
        }

    async def get_supplier_invoices(self, params: SupplierInvoiceParams, fy_id: UUID) -> dict:
        """Server-side grouping of rolls by (supplier_invoice_no, supplier_id).

        Two-phase approach:
        1. SQL GROUP BY for group keys + aggregates (lightweight, paginated)
        2. Fetch full rolls only for the current page of groups (with eager loads)
        """
        page = params.page
        page_size = params.page_size

        # --- Phase 1: SQL GROUP BY with optional search + pagination ---
        # Supplier invoices: show current FY + any invoice with active (unconsumed) rolls
        _ROLL_ACTIVE = ("in_stock", "remnant", "sent_for_processing")
        base_where = [
            Roll.supplier_invoice_no.isnot(None),
            or_(Roll.fy_id == fy_id, Roll.status.in_(_ROLL_ACTIVE)),
        ]

        if params.search:
            q = f"%{params.search}%"
            # Group is included if ANY roll-level or group-level field matches
            base_where.append(
                or_(
                    Roll.supplier_invoice_no.ilike(q),
                    Roll.supplier_challan_no.ilike(q),
                    Roll.sr_no.ilike(q),
                    Roll.fabric_type.ilike(q),
                    Roll.color.ilike(q),
                    Roll.roll_code.ilike(q),
                    Roll.supplier_id.in_(
                        select(Supplier.id).where(Supplier.name.ilike(q))
                    ),
                )
            )

        # Aggregate query: groups with counts and sums
        group_cols = [
            Roll.supplier_invoice_no,
            Roll.supplier_id,
            func.min(Roll.supplier_challan_no).label("challan_no"),
            func.min(Roll.sr_no).label("sr_no"),
            func.min(Roll.supplier_invoice_date).label("invoice_date"),
            func.min(Roll.received_at).label("received_at"),
            func.count().label("roll_count"),
            func.coalesce(func.sum(Roll.total_weight), 0).label("total_weight"),
            func.coalesce(func.sum(Roll.total_length), 0).label("total_length"),
            func.coalesce(
                func.sum(Roll.total_weight * func.coalesce(Roll.cost_per_unit, 0)), 0
            ).label("total_value"),
        ]

        # When search filters individual rolls, aggregates reflect only matching rolls
        # in the group. To get correct aggregates for the FULL group, we need a HAVING
        # approach. But for search, the user wants to see matching groups — slight
        # aggregate difference is acceptable and avoids a double-query.
        # If no search: aggregates are exact.

        group_base = (
            select(*group_cols)
            .where(*base_where)
            .group_by(Roll.supplier_invoice_no, Roll.supplier_id)
        )

        # Count total groups
        count_stmt = select(func.count()).select_from(group_base.subquery())
        total = (await self.db.execute(count_stmt)).scalar() or 0
        pages = max(1, math.ceil(total / page_size))

        # Fetch paginated group metadata (lightweight — no eager loads)
        group_stmt = (
            group_base
            .order_by(func.min(Roll.received_at).desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        group_result = await self.db.execute(group_stmt)
        groups = group_result.all()

        if not groups:
            return {"data": [], "total": total, "page": page, "pages": pages}

        # --- Phase 2: Fetch full rolls for visible groups only ---
        group_conditions = [
            and_(
                Roll.supplier_invoice_no == g.supplier_invoice_no,
                Roll.supplier_id == g.supplier_id,
            )
            for g in groups
        ]
        rolls_stmt = (
            select(Roll)
            .where(or_(*group_conditions))
            .options(
                selectinload(Roll.color_obj),
                selectinload(Roll.supplier),
                selectinload(Roll.supplier_invoice),
                selectinload(Roll.received_by_user),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.value_addition),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.va_party),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.job_challan),
            )
            .order_by(Roll.created_at.asc())
        )
        rolls_result = await self.db.execute(rolls_stmt)
        all_rolls = rolls_result.scalars().all()

        # Group fetched rolls by key
        rolls_by_group: dict[str, list] = {}
        for r in all_rolls:
            key = f"{r.supplier_invoice_no}__{r.supplier_id}"
            rolls_by_group.setdefault(key, []).append(r)

        # --- Build response (same shape as before) ---
        data = []
        for g in groups:
            key = f"{g.supplier_invoice_no}__{g.supplier_id}"
            group_rolls = rolls_by_group.get(key, [])

            supplier = None
            if group_rolls and group_rolls[0].supplier:
                s = group_rolls[0].supplier
                supplier = {"id": str(s.id), "name": s.name}

            # GST from SupplierInvoice (new rolls) or 0 (legacy rolls)
            si = next((r.supplier_invoice for r in group_rolls if r.supplier_invoice), None)
            gst_pct = float(si.gst_percent) if si and si.gst_percent else 0.0
            total_val = float(g.total_value) if g.total_value else 0.0
            gst_amount = round(total_val * gst_pct / 100, 2)

            data.append({
                "invoice_no": g.supplier_invoice_no,
                "challan_no": g.challan_no,
                "invoice_date": g.invoice_date.isoformat() if g.invoice_date else None,
                "sr_no": g.sr_no,
                "supplier": supplier,
                "supplier_invoice_id": str(si.id) if si else None,
                "gst_percent": gst_pct,
                "gst_amount": gst_amount,
                "total_with_gst": round(total_val + gst_amount, 2),
                "rolls": [self._to_response(r) for r in group_rolls],
                "roll_count": int(g.roll_count),
                "total_weight": float(g.total_weight) if g.total_weight else 0.0,
                "total_length": float(g.total_length) if g.total_length else 0.0,
                "total_value": total_val,
                "received_at": g.received_at.isoformat() if g.received_at else None,
            })

        return {"data": data, "total": total, "page": page, "pages": pages}

    async def stock_in(self, req: RollCreate, received_by: UUID, fy_id: UUID) -> dict:
        roll_code = await next_roll_code(
            self.db,
            challan_no=req.sr_no or "STOCK",
            fabric_type=req.fabric_type,
            color=req.color,
            fabric_code=req.fabric_code,
            color_code=req.color_code,
            color_no=req.color_no,
        )

        roll = Roll(
            roll_code=roll_code,
            fabric_type=req.fabric_type,
            color=req.color,
            color_id=req.color_id,
            total_weight=req.total_weight,
            remaining_weight=req.total_weight,
            current_weight=req.total_weight,
            unit=req.unit or "kg",
            cost_per_unit=req.cost_per_unit,
            total_length=req.total_length,
            supplier_id=req.supplier_id,
            supplier_invoice_no=req.supplier_invoice_no,
            supplier_challan_no=req.supplier_challan_no,
            supplier_invoice_date=req.supplier_invoice_date,
            sr_no=req.sr_no,
            panna=req.panna,
            gsm=req.gsm,
            received_by=received_by,
            received_at=datetime.now(timezone.utc),
            status="in_stock",
            notes=req.notes,
            fy_id=fy_id,
        )
        self.db.add(roll)
        await self.db.flush()

        # Reload with relationships
        stmt = select(Roll).where(Roll.id == roll.id).options(
            selectinload(Roll.color_obj),
            selectinload(Roll.supplier),
            selectinload(Roll.received_by_user),
            selectinload(Roll.supplier_invoice),
            selectinload(Roll.processing_logs).selectinload(RollProcessing.value_addition),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.va_party),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.job_challan),
        )
        result = await self.db.execute(stmt)
        roll = result.scalar_one()

        from app.core.event_bus import event_bus
        await event_bus.emit("roll_stocked_in", {
            "roll_code": roll.roll_code,
            "sr_no": req.sr_no,
            "weight": float(roll.total_weight) if roll.total_weight else None,
            "supplier": roll.supplier.name if roll.supplier else None,
        }, str(received_by))

        return self._to_response(roll)

    async def update_supplier_invoice(self, invoice_id: UUID, updates) -> dict:
        """Update a SupplierInvoice record (e.g. gst_percent, invoice_no, etc.)."""
        stmt = (
            select(SupplierInvoice)
            .where(SupplierInvoice.id == invoice_id)
            .options(selectinload(SupplierInvoice.supplier))
        )
        result = await self.db.execute(stmt)
        si = result.scalar_one_or_none()
        if not si:
            raise NotFoundError(f"Supplier invoice {invoice_id} not found")

        for field, value in updates.model_dump(exclude_unset=True).items():
            setattr(si, field, value)

        await self.db.flush()
        return {
            "id": str(si.id),
            "supplier_id": str(si.supplier_id) if si.supplier_id else None,
            "invoice_no": si.invoice_no,
            "challan_no": si.challan_no,
            "invoice_date": si.invoice_date.isoformat() if si.invoice_date else None,
            "sr_no": si.sr_no,
            "gst_percent": float(si.gst_percent) if si.gst_percent else 0,
        }

    async def update_roll(self, roll_id: UUID, req: RollUpdate) -> dict:
        stmt = (
            select(Roll)
            .where(Roll.id == roll_id)
            .options(selectinload(Roll.color_obj), selectinload(Roll.supplier), selectinload(Roll.supplier_invoice))
        )
        result = await self.db.execute(stmt)
        roll = result.scalar_one_or_none()
        if not roll:
            raise NotFoundError(f"Roll {roll_id} not found")

        # Guard: only unused rolls can be edited (check weight AND history)
        if roll.remaining_weight < roll.current_weight:
            raise BusinessRuleViolationError(
                "Cannot edit a roll that has been partially or fully consumed"
            )
        # Also block if roll has any processing history or lot assignments
        history_count = (await self.db.execute(
            select(func.count()).select_from(RollProcessing).where(RollProcessing.roll_id == roll_id)
        )).scalar() or 0
        lot_count = (await self.db.execute(
            select(func.count()).select_from(LotRoll).where(LotRoll.roll_id == roll_id)
        )).scalar() or 0
        if history_count > 0 or lot_count > 0:
            raise BusinessRuleViolationError(
                "Cannot edit a roll that has processing history or lot assignments"
            )

        updates = req.model_dump(exclude_unset=True)
        weight_changed = False

        for field, value in updates.items():
            setattr(roll, field, value)
            if field == "total_weight":
                weight_changed = True

        # Keep remaining_weight and current_weight in sync when total_weight changes on unused roll
        if weight_changed and req.total_weight is not None:
            roll.remaining_weight = req.total_weight
            roll.current_weight = req.total_weight

        await self.db.flush()

        # Reload with relationships (supplier may have changed)
        stmt = select(Roll).where(Roll.id == roll.id).options(
            selectinload(Roll.color_obj),
            selectinload(Roll.supplier),
            selectinload(Roll.received_by_user),
            selectinload(Roll.supplier_invoice),
            selectinload(Roll.processing_logs).selectinload(RollProcessing.value_addition),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.va_party),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.job_challan),
        )
        result = await self.db.execute(stmt)
        roll = result.scalar_one()

        return self._to_response(roll)

    async def delete_roll(self, roll_id: UUID) -> None:
        stmt = select(Roll).where(Roll.id == roll_id)
        result = await self.db.execute(stmt)
        roll = result.scalar_one_or_none()
        if not roll:
            raise NotFoundError(f"Roll {roll_id} not found")
        if roll.remaining_weight != roll.total_weight:
            raise BusinessRuleViolationError("Cannot delete a roll that has been used in lots or processing")
        invoice_id = roll.supplier_invoice_id
        await self.db.delete(roll)
        await self.db.flush()

        # Clean up orphan SupplierInvoice if no rolls remain
        if invoice_id:
            remaining = (await self.db.execute(
                select(func.count()).select_from(Roll)
                .where(Roll.supplier_invoice_id == invoice_id)
            )).scalar() or 0
            if remaining == 0:
                si = (await self.db.execute(
                    select(SupplierInvoice).where(SupplierInvoice.id == invoice_id)
                )).scalar_one_or_none()
                if si:
                    await self.db.delete(si)
                    await self.db.flush()

    async def get_consumption_history(self, roll_id: UUID) -> list:
        stmt = (
            select(BatchRollConsumption)
            .where(BatchRollConsumption.roll_id == roll_id)
            .order_by(BatchRollConsumption.created_at.desc())
        )
        result = await self.db.execute(stmt)
        records = result.scalars().all()

        return [
            {
                "id": str(c.id),
                "batch_id": str(c.batch_id),
                "pieces_cut": c.pieces_cut,
                "length_used": float(c.length_used) if c.length_used else None,
                "cut_at": c.cut_at.isoformat() if c.cut_at else None,
            }
            for c in records
        ]

    async def receive_from_processing(
        self, roll_id: UUID, processing_id: UUID, req: ReceiveFromProcessing
    ) -> dict:
        stmt = select(Roll).where(Roll.id == roll_id).with_for_update()
        result = await self.db.execute(stmt)
        roll = result.scalar_one_or_none()
        if not roll:
            raise NotFoundError(f"Roll {roll_id} not found")

        log_stmt = select(RollProcessing).where(
            RollProcessing.id == processing_id,
            RollProcessing.roll_id == roll_id,
        )
        log_result = await self.db.execute(log_stmt)
        log = log_result.scalar_one_or_none()
        if not log:
            raise NotFoundError(f"Processing log {processing_id} not found")
        if log.status != "sent":
            raise BusinessRuleViolationError("Processing log is not in 'sent' status")

        log.received_date = req.received_date
        log.weight_after = req.weight_after
        log.length_after = req.length_after
        log.processing_cost = req.processing_cost
        log.status = "received"
        if req.notes:
            log.notes = (log.notes + " | " + req.notes) if log.notes else req.notes

        # Add back the returned weight to remaining
        roll.remaining_weight = (roll.remaining_weight or 0) + req.weight_after
        # Adjust current_weight by VA delta (weight change from processing)
        va_delta = req.weight_after - log.weight_before
        roll.current_weight = (roll.current_weight or 0) + va_delta
        if req.length_after:
            roll.total_length = req.length_after
        if req.processing_cost and roll.cost_per_unit and req.weight_after:
            roll.cost_per_unit = float(roll.cost_per_unit) + (float(req.processing_cost) / float(req.weight_after))

        # Status: check if roll has any remaining "sent" processing logs
        sent_logs_stmt = select(func.count()).select_from(RollProcessing).where(
            RollProcessing.roll_id == roll_id,
            RollProcessing.status == "sent",
            RollProcessing.id != processing_id,  # exclude the one we just received
        )
        remaining_sent = (await self.db.execute(sent_logs_stmt)).scalar() or 0
        if remaining_sent == 0 and roll.status == "sent_for_processing":
            # Transition back — if roll was used in a lot (has remaining < some threshold), stay remnant-aware
            roll.status = "in_stock"
        # else keep current status (still has material out, or in_cutting/remnant)

        await self.db.flush()

        # Reload with all relationships for full roll response
        reload = select(Roll).where(Roll.id == roll_id).options(
            selectinload(Roll.color_obj),
            selectinload(Roll.supplier),
            selectinload(Roll.received_by_user),
            selectinload(Roll.supplier_invoice),
            selectinload(Roll.processing_logs).selectinload(RollProcessing.value_addition),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.va_party),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.job_challan),
        )
        roll = (await self.db.execute(reload)).scalar_one()

        from app.core.event_bus import event_bus
        va_name = log.value_addition.name if log.value_addition else "Processing"
        await event_bus.emit("va_received", {
            "roll_code": roll.roll_code,
            "va_name": va_name,
            "weight_after": float(req.weight_after) if req.weight_after else None,
        })

        return self._to_response(roll)

    async def update_processing_log(
        self, roll_id: UUID, processing_id: UUID, req: UpdateProcessingLog
    ) -> dict:
        """Update editable fields on a processing log (cost, vendor, dates, notes, etc.)."""
        stmt = select(Roll).where(Roll.id == roll_id).with_for_update()
        result = await self.db.execute(stmt)
        roll = result.scalar_one_or_none()
        if not roll:
            raise NotFoundError(f"Roll {roll_id} not found")

        log_stmt = select(RollProcessing).where(
            RollProcessing.id == processing_id,
            RollProcessing.roll_id == roll_id,
        )
        log_result = await self.db.execute(log_stmt)
        log = log_result.scalar_one_or_none()
        if not log:
            raise NotFoundError(f"Processing log {processing_id} not found")

        updates = req.model_dump(exclude_unset=True)
        for field, value in updates.items():
            if field == "notes" and value is not None:
                # Replace notes entirely (not append)
                setattr(log, field, value)
            else:
                setattr(log, field, value)

        # If weight_after was edited on a received log, recalculate roll weights
        if "weight_after" in updates and log.status == "received":
            # Recalculate current_weight and remaining_weight from all processing logs
            # current_weight = total_weight + sum(weight_after - weight_before) for all received logs
            # remaining_weight = total_weight + sum(weight_after - weight_before) for received - sum(weight_before) for sent
            all_logs_stmt = select(RollProcessing).where(RollProcessing.roll_id == roll_id)
            all_logs = (await self.db.execute(all_logs_stmt)).scalars().all()
            va_delta_sum = sum(
                (float(p.weight_after) - float(p.weight_before))
                for p in all_logs if p.status == "received" and p.weight_after is not None
            )
            sent_weight_sum = sum(
                float(p.weight_before) for p in all_logs if p.status == "sent"
            )
            roll.current_weight = float(roll.total_weight) + va_delta_sum
            roll.remaining_weight = roll.current_weight - sent_weight_sum

        await self.db.flush()

        # Reload full roll with relationships
        reload = select(Roll).where(Roll.id == roll_id).options(
            selectinload(Roll.color_obj),
            selectinload(Roll.supplier),
            selectinload(Roll.received_by_user),
            selectinload(Roll.supplier_invoice),
            selectinload(Roll.processing_logs).selectinload(RollProcessing.value_addition),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.va_party),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.job_challan),
        )
        roll = (await self.db.execute(reload)).scalar_one()
        return self._to_response(roll)

    def _processing_to_response(self, p: RollProcessing) -> dict:
        va = p.value_addition
        vp = p.va_party
        return {
            "id": str(p.id),
            "roll_id": str(p.roll_id),
            "value_addition_id": str(p.value_addition_id),
            "value_addition": {
                "id": str(va.id),
                "name": va.name,
                "short_code": va.short_code,
            } if va else None,
            "va_party": {
                "id": str(vp.id),
                "name": vp.name,
                "phone": vp.phone,
                "city": vp.city,
            } if vp else None,
            "sent_date": p.sent_date.isoformat() if p.sent_date else None,
            "received_date": p.received_date.isoformat() if p.received_date else None,
            "weight_before": float(p.weight_before) if p.weight_before else None,
            "weight_after": float(p.weight_after) if p.weight_after else None,
            "length_before": float(p.length_before) if p.length_before else None,
            "length_after": float(p.length_after) if p.length_after else None,
            "processing_cost": float(p.processing_cost) if p.processing_cost else None,
            "status": p.status,
            "notes": p.notes,
            "job_challan_id": str(p.job_challan_id) if p.job_challan_id else None,
            "challan_no": p.job_challan.challan_no if p.job_challan else None,
        }

    @staticmethod
    def _compute_enhanced_roll_code(roll_code: str, processing_logs) -> str:
        """Compute enhanced roll code: base + received value addition short codes."""
        suffixes = []
        for p in (processing_logs or []):
            if p.status == "received" and p.value_addition:
                suffixes.append(p.value_addition.short_code)
        if suffixes:
            return roll_code + "+" + "+".join(suffixes)
        return roll_code

    def _to_response(self, r: Roll) -> dict:
        enhanced = self._compute_enhanced_roll_code(r.roll_code, r.processing_logs)
        c = r.color_obj
        return {
            "id": str(r.id),
            "roll_code": r.roll_code,
            "enhanced_roll_code": enhanced,
            "fabric_type": r.fabric_type,
            "color": r.color,
            "color_id": str(r.color_id) if r.color_id else None,
            "color_obj": {
                "id": str(c.id),
                "name": c.name,
                "code": c.code,
                "color_no": c.color_no,
            } if c else None,
            "total_weight": float(r.total_weight) if r.total_weight else 0,
            "remaining_weight": float(r.remaining_weight) if r.remaining_weight else 0,
            "current_weight": float(r.current_weight) if r.current_weight else 0,
            "unit": r.unit,
            "cost_per_unit": float(r.cost_per_unit) if r.cost_per_unit else 0,
            "total_length": float(r.total_length) if r.total_length else None,
            "status": r.status,
            "supplier": {
                "id": str(r.supplier.id),
                "name": r.supplier.name,
            } if r.supplier else None,
            "supplier_invoice_no": r.supplier_invoice_no,
            "supplier_challan_no": r.supplier_challan_no,
            "supplier_invoice_date": r.supplier_invoice_date.isoformat() if r.supplier_invoice_date else None,
            "sr_no": r.sr_no,
            "gst_percent": float(r.supplier_invoice.gst_percent) if r.supplier_invoice and r.supplier_invoice.gst_percent else 0,
            "supplier_invoice_id": str(r.supplier_invoice_id) if r.supplier_invoice_id else None,
            "panna": float(r.panna) if r.panna else None,
            "gsm": float(r.gsm) if r.gsm else None,
            "received_by_user": {
                "id": str(r.received_by_user.id),
                "full_name": r.received_by_user.full_name,
            } if r.received_by_user else None,
            "received_at": r.received_at.isoformat() if r.received_at else None,
            "notes": r.notes,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "processing_logs": [
                self._processing_to_response(p) for p in r.processing_logs
            ] if r.processing_logs else [],
        }
