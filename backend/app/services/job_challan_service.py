"""Job Challan service — create challan + bulk send/receive rolls, list, get by id."""

import math
from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.job_challan import JobChallan
from app.models.ledger_entry import LedgerEntry
from app.models.roll import Roll, RollProcessing
from app.models.va_party import VAParty
from app.schemas.job_challan import (
    JobChallanCreate, JobChallanFilterParams, JobChallanReceive, JobChallanUpdate,
)
from app.core.exceptions import NotFoundError, BusinessRuleViolationError


class JobChallanService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _next_challan_no(self, fy_id: UUID) -> str:
        """Generate next sequential challan number scoped to FY: JC-001, JC-002, etc."""
        stmt = (
            select(JobChallan.challan_no)
            .where(JobChallan.challan_no.like("JC-%"))
            .where(JobChallan.fy_id == fy_id)
            .order_by(JobChallan.challan_no.desc())
            .limit(1)
            .with_for_update()
        )
        result = await self.db.execute(stmt)
        last = result.scalar_one_or_none()
        if last:
            try:
                num = int(last.replace("JC-", ""))
                return f"JC-{num + 1:03d}"
            except ValueError:
                pass
        return "JC-001"

    async def create_challan(self, req: JobChallanCreate, created_by: UUID, fy_id: UUID) -> dict:
        """Create a job challan and send all specified rolls for processing in one transaction."""
        if not req.rolls:
            raise BusinessRuleViolationError("At least one roll is required")

        roll_ids = [entry.roll_id for entry in req.rolls]
        weight_map = {entry.roll_id: entry.weight_to_send for entry in req.rolls}

        # Validate all rolls exist and are in_stock (lock rows to prevent concurrent weight mutation)
        stmt = (
            select(Roll)
            .where(Roll.id.in_(roll_ids))
            .options(
                selectinload(Roll.supplier),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.value_addition),
            )
        )
        stmt = stmt.with_for_update(of=Roll)
        result = await self.db.execute(stmt)
        rolls = result.scalars().all()

        roll_map = {r.id: r for r in rolls}
        missing = [str(rid) for rid in roll_ids if rid not in roll_map]
        if missing:
            raise NotFoundError(f"Rolls not found: {', '.join(missing)}")

        not_available = [r.roll_code for r in rolls if r.status not in ("in_stock", "remnant")]
        if not_available:
            raise BusinessRuleViolationError(
                f"Rolls must be in_stock or remnant: {', '.join(not_available)}"
            )

        # Validate weights
        for entry in req.rolls:
            roll = roll_map[entry.roll_id]
            if roll.remaining_weight <= 0:
                raise BusinessRuleViolationError(f"Roll {roll.roll_code} has no remaining weight")
            wts = entry.weight_to_send if entry.weight_to_send is not None else roll.remaining_weight
            if wts <= 0:
                raise BusinessRuleViolationError(f"Weight to send must be > 0 for roll {roll.roll_code}")
            if wts > roll.remaining_weight:
                raise BusinessRuleViolationError(
                    f"Weight to send ({wts}) exceeds remaining ({roll.remaining_weight}) for roll {roll.roll_code}"
                )

        # Generate challan number (scoped to FY)
        challan_no = await self._next_challan_no(fy_id)

        # Create challan
        challan = JobChallan(
            challan_no=challan_no,
            value_addition_id=req.value_addition_id,
            va_party_id=req.va_party_id,
            sent_date=req.sent_date,
            notes=req.notes,
            created_by_id=created_by,
            fy_id=fy_id,
        )
        self.db.add(challan)
        await self.db.flush()

        # Track weight sent per roll for response
        weight_sent_map = {}

        # Send each roll for processing and link to challan
        for entry in req.rolls:
            roll = roll_map[entry.roll_id]
            wts = entry.weight_to_send if entry.weight_to_send is not None else roll.remaining_weight
            weight_sent_map[entry.roll_id] = float(wts)

            log = RollProcessing(
                roll_id=entry.roll_id,
                value_addition_id=req.value_addition_id,
                va_party_id=req.va_party_id,
                sent_date=req.sent_date,
                weight_before=wts,  # partial amount sent
                length_before=roll.total_length,
                status="sent",
                notes=req.notes,
                job_challan_id=challan.id,
            )
            self.db.add(log)

            # Deduct remaining weight
            roll.remaining_weight = roll.remaining_weight - wts
            if roll.remaining_weight <= 0:
                roll.status = "sent_for_processing"
            # else stays in_stock

        await self.db.flush()

        from app.core.event_bus import event_bus
        # Eagerly load va_party for event
        if challan.va_party_id:
            vp_res = await self.db.execute(select(VAParty).where(VAParty.id == challan.va_party_id))
            vp = vp_res.scalar_one_or_none()
        else:
            vp = None
        await event_bus.emit("va_sent", {
            "challan_no": challan.challan_no,
            "vendor": vp.name if vp else "—",
            "roll_count": len(rolls),
            "type": "roll",
        }, str(created_by))

        # Reload challan with relationships
        return await self._get_challan_response(challan.id, rolls, weight_sent_map)

    async def get_challans(self, params: JobChallanFilterParams, fy_id: UUID) -> dict:
        """List challans with pagination and optional filters."""
        # FY scoping: current FY records + open challans from any previous FY
        _CHALLAN_ACTIVE = ("sent", "partially_received")
        conditions = [or_(JobChallan.fy_id == fy_id, JobChallan.status.in_(_CHALLAN_ACTIVE))]
        if params.va_party_id:
            conditions.append(JobChallan.va_party_id == params.va_party_id)
        if params.value_addition_id:
            conditions.append(JobChallan.value_addition_id == params.value_addition_id)
        if params.status:
            conditions.append(JobChallan.status == params.status)

        count_stmt = select(func.count()).select_from(JobChallan)
        if conditions:
            count_stmt = count_stmt.where(*conditions)
        total = (await self.db.execute(count_stmt)).scalar() or 0
        pages = max(1, math.ceil(total / params.page_size))

        stmt = (
            select(JobChallan)
            .options(
                selectinload(JobChallan.value_addition),
                selectinload(JobChallan.va_party),
                selectinload(JobChallan.created_by_user),
                selectinload(JobChallan.processing_logs)
                    .selectinload(RollProcessing.roll)
                    .selectinload(Roll.processing_logs)
                    .selectinload(RollProcessing.value_addition),
                # Note: 4-level chain IS needed — enhanced_roll_code requires all
                # processing_logs + value_addition.short_code for the roll.
            )
            .order_by(JobChallan.created_at.desc())
            .offset((params.page - 1) * params.page_size)
            .limit(params.page_size)
        )
        if conditions:
            stmt = stmt.where(*conditions)

        result = await self.db.execute(stmt)
        challans = result.scalars().all()

        return {
            "data": [self._to_response(c) for c in challans],
            "total": total,
            "page": params.page,
            "pages": pages,
        }

    async def get_challan(self, challan_id: UUID) -> dict:
        """Get a single challan by ID with full roll details."""
        stmt = (
            select(JobChallan)
            .where(JobChallan.id == challan_id)
            .options(
                selectinload(JobChallan.value_addition),
                selectinload(JobChallan.va_party),
                selectinload(JobChallan.created_by_user),
                selectinload(JobChallan.processing_logs)
                    .selectinload(RollProcessing.roll)
                    .selectinload(Roll.processing_logs)
                    .selectinload(RollProcessing.value_addition),
            )
        )
        result = await self.db.execute(stmt)
        challan = result.scalar_one_or_none()
        if not challan:
            raise NotFoundError(f"Job challan {challan_id} not found")
        return self._to_response(challan)

    async def get_challan_by_no(self, challan_no: str) -> dict:
        """Get a single challan by challan_no."""
        stmt = (
            select(JobChallan)
            .where(JobChallan.challan_no == challan_no)
            .options(
                selectinload(JobChallan.value_addition),
                selectinload(JobChallan.va_party),
                selectinload(JobChallan.created_by_user),
                selectinload(JobChallan.processing_logs)
                    .selectinload(RollProcessing.roll)
                    .selectinload(Roll.processing_logs)
                    .selectinload(RollProcessing.value_addition),
            )
        )
        result = await self.db.execute(stmt)
        challan = result.scalar_one_or_none()
        if not challan:
            raise NotFoundError(f"Job challan '{challan_no}' not found")
        return self._to_response(challan)

    async def receive_challan(self, challan_id: UUID, req: JobChallanReceive, received_by: UUID, fy_id: UUID) -> dict:
        """Receive rolls back from VA vendor — bulk, single transaction.

        Replicates roll_service.receive_from_processing() logic per roll but
        executes all in one DB transaction. Supports partial receive.
        """
        # 1. Load challan with all processing logs + rolls
        stmt = (
            select(JobChallan)
            .where(JobChallan.id == challan_id)
            .options(
                selectinload(JobChallan.value_addition),
                selectinload(JobChallan.va_party),
                selectinload(JobChallan.created_by_user),
                selectinload(JobChallan.processing_logs).selectinload(RollProcessing.value_addition),
                selectinload(JobChallan.processing_logs).selectinload(RollProcessing.va_party),
                selectinload(JobChallan.processing_logs).selectinload(RollProcessing.roll),
            )
        )
        result = await self.db.execute(stmt)
        challan = result.scalar_one_or_none()
        if not challan:
            raise NotFoundError(f"Job challan {challan_id} not found")
        if challan.status in ("received", "cancelled"):
            raise BusinessRuleViolationError(
                "Challan already fully received" if challan.status == "received"
                else "Challan has been cancelled"
            )

        # 2. Build lookup: processing_id → RollProcessing log
        log_map = {log.id: log for log in challan.processing_logs}

        # 3. Collect unique roll IDs to lock
        roll_ids = list({entry.roll_id for entry in req.rolls})
        lock_stmt = select(Roll).where(Roll.id.in_(roll_ids)).with_for_update()
        lock_result = await self.db.execute(lock_stmt)
        roll_map = {r.id: r for r in lock_result.scalars().all()}

        # Validate all referenced rolls exist
        missing = [str(e.roll_id) for e in req.rolls if e.roll_id not in roll_map]
        if missing:
            raise NotFoundError(f"Rolls not found: {', '.join(missing)}")

        # 4. Process each roll entry
        received_count = 0
        for entry in req.rolls:
            log = log_map.get(entry.processing_id)
            if not log:
                raise NotFoundError(
                    f"Processing log {entry.processing_id} not found on this challan"
                )
            if log.roll_id != entry.roll_id:
                raise BusinessRuleViolationError(
                    f"Processing log {entry.processing_id} does not belong to roll {entry.roll_id}"
                )
            if log.status == "received":
                continue  # idempotent — skip already-received

            if log.status != "sent":
                raise BusinessRuleViolationError(
                    f"Processing log for roll {roll_map[entry.roll_id].roll_code} "
                    f"is in '{log.status}' status, expected 'sent'"
                )

            # --- Receive this log (mirrors roll_service.receive_from_processing) ---
            log.received_date = req.received_date
            log.weight_after = entry.weight_after
            log.processing_cost = entry.processing_cost
            log.status = "received"
            if entry.notes:
                log.notes = (log.notes + " | " + entry.notes) if log.notes else entry.notes

            # --- Roll weight math ---
            roll = roll_map[entry.roll_id]

            # Add back the returned weight to remaining
            roll.remaining_weight = float(roll.remaining_weight or 0) + float(entry.weight_after)

            # Adjust current_weight by VA delta (weight change from processing)
            va_delta = float(entry.weight_after) - float(log.weight_before)
            roll.current_weight = float(roll.current_weight or 0) + va_delta

            # Adjust cost_per_unit if applicable
            if entry.processing_cost and roll.cost_per_unit and entry.weight_after:
                roll.cost_per_unit = float(roll.cost_per_unit) + (
                    float(entry.processing_cost) / float(entry.weight_after)
                )

            received_count += 1

        # 5. Roll status check — for EACH affected roll, count remaining "sent" logs
        #    across ALL challans (not just this one). A roll only returns to in_stock
        #    when it has ZERO sent processing logs anywhere.
        for roll_id in roll_ids:
            roll = roll_map[roll_id]
            if roll.status != "sent_for_processing":
                continue  # don't change status of in_stock/remnant/in_cutting rolls

            sent_logs_stmt = (
                select(func.count())
                .select_from(RollProcessing)
                .where(
                    RollProcessing.roll_id == roll_id,
                    RollProcessing.status == "sent",
                )
            )
            remaining_sent = (await self.db.execute(sent_logs_stmt)).scalar() or 0
            if remaining_sent == 0:
                roll.status = "in_stock"

        # 6. Challan status — sent → partially_received → received
        all_received = all(log.status == "received" for log in challan.processing_logs)
        any_received = any(log.status == "received" for log in challan.processing_logs)
        if all_received:
            challan.status = "received"
            challan.received_date = req.received_date
        elif any_received:
            challan.status = "partially_received"

        if req.notes:
            challan.notes = (challan.notes + "\n" + req.notes) if challan.notes else req.notes

        await self.db.flush()

        # 7. Auto-create ledger entry for VA party (only when cost is known)
        total_cost = sum(
            float(log.processing_cost or 0)
            for log in challan.processing_logs
            if log.status == "received" and log.processing_cost
        )
        if total_cost > 0 and challan.va_party_id:
            from app.services.ledger_service import LedgerService
            from app.schemas.ledger import LedgerEntryCreate
            ledger_svc = LedgerService(self.db)
            # Check if entry already exists for this challan (partial receives)
            existing = (await self.db.execute(
                select(LedgerEntry).where(
                    LedgerEntry.reference_type == "job_challan",
                    LedgerEntry.reference_id == challan.id,
                )
            )).scalar_one_or_none()
            va_name_str = challan.va_party.name if challan.va_party else "VA"
            if existing:
                existing.credit = total_cost
                existing.description = f"{challan.challan_no} {va_name_str} — {received_count} rolls, ₹{total_cost:,.2f}"
            else:
                await ledger_svc.create_entry(LedgerEntryCreate(
                    entry_date=req.received_date or date.today(),
                    party_type="va_party",
                    party_id=challan.va_party_id,
                    entry_type="challan",
                    reference_type="job_challan",
                    reference_id=challan.id,
                    debit=0,
                    credit=total_cost,
                    description=f"{challan.challan_no} {va_name_str} — {received_count} rolls, ₹{total_cost:,.2f}",
                    created_by=received_by,
                    fy_id=fy_id,
                ))
            await self.db.flush()

        # 8. SSE event
        from app.core.event_bus import event_bus
        va_name = challan.value_addition.name if challan.value_addition else "Processing"
        vendor = challan.va_party.name if challan.va_party else "—"
        await event_bus.emit("va_received", {
            "challan_no": challan.challan_no,
            "vendor": vendor,
            "roll_count": received_count,
            "type": "roll",
        }, str(received_by))

        # 9. Return full challan response
        return await self.get_challan(challan_id)

    async def _get_challan_response(self, challan_id: UUID, rolls: list[Roll], weight_sent_map: dict | None = None) -> dict:
        """Build response for a freshly created challan — reloads with processing_logs for consistent shape."""
        # Reuse _to_response via get_challan for consistent shape (includes processing_id, processing_status)
        return await self.get_challan(challan_id)

    async def cancel_challan(self, challan_id: UUID, cancelled_by: UUID) -> dict:
        """Cancel a sent job challan — reverses roll weight deductions.

        Safety guards:
        1. Challan must be status='sent'
        2. ALL processing logs must be status='sent' (no individual receives)
        3. No roll can be in_cutting (consumed by lot)
        4. remaining_weight + weight_before <= total_weight per roll
        5. FOR UPDATE locks on challan + rolls
        """
        # 1. Load and lock challan
        stmt = (
            select(JobChallan)
            .where(JobChallan.id == challan_id)
            .options(
                selectinload(JobChallan.processing_logs).selectinload(RollProcessing.roll),
            )
            .with_for_update()
        )
        result = await self.db.execute(stmt)
        challan = result.scalar_one_or_none()
        if not challan:
            raise NotFoundError(f"Job challan {challan_id} not found")

        # Guard 1: status must be 'sent'
        if challan.status != "sent":
            raise BusinessRuleViolationError(
                f"Cannot cancel challan with status '{challan.status}' — only 'sent' challans can be cancelled"
            )

        logs = challan.processing_logs or []
        if not logs:
            raise BusinessRuleViolationError("Challan has no processing logs to cancel")

        # Guard 2: ALL logs must be 'sent'
        received_logs = [log for log in logs if log.status != "sent"]
        if received_logs:
            raise BusinessRuleViolationError(
                f"Cannot cancel: {len(received_logs)} roll(s) have already been received individually"
            )

        # 2. Lock all affected rolls
        roll_ids = [log.roll_id for log in logs]
        roll_stmt = select(Roll).where(Roll.id.in_(roll_ids)).with_for_update()
        roll_result = await self.db.execute(roll_stmt)
        rolls_by_id = {r.id: r for r in roll_result.scalars().all()}

        # Guard 3 + 4: check each roll
        for log in logs:
            roll = rolls_by_id.get(log.roll_id)
            if not roll:
                raise BusinessRuleViolationError(f"Roll {log.roll_id} not found — data inconsistency")
            if roll.status == "in_cutting":
                raise BusinessRuleViolationError(
                    f"Cannot cancel: roll {roll.roll_code} is in cutting (consumed by lot)"
                )
            restored = float(roll.remaining_weight) + float(log.weight_before)
            if restored > float(roll.total_weight) + 0.001:  # small tolerance for float
                raise BusinessRuleViolationError(
                    f"Cannot cancel: restoring weight for {roll.roll_code} would exceed total weight "
                    f"({restored:.3f} > {float(roll.total_weight):.3f}) — state may have been modified"
                )

        # 3. Collect all log IDs in this challan (for exclusion in "other sent" queries)
        challan_log_ids = [log.id for log in logs]

        # 4. Reverse weight deductions, cancel logs, restore roll statuses
        for log in logs:
            roll = rolls_by_id[log.roll_id]
            roll.remaining_weight = roll.remaining_weight + log.weight_before

            # Mark processing log as cancelled FIRST
            log.status = "cancelled"

        # Flush cancelled statuses so the count query below sees them
        await self.db.flush()

        # 5. Re-evaluate roll statuses (after all logs are cancelled)
        for roll_id_val, roll in rolls_by_id.items():
            if roll.status != "sent_for_processing":
                continue
            # Count remaining 'sent' logs for this roll (across ALL challans)
            remaining_sent_stmt = (
                select(func.count())
                .select_from(RollProcessing)
                .where(
                    RollProcessing.roll_id == roll_id_val,
                    RollProcessing.status == "sent",
                )
            )
            remaining_sent = (await self.db.execute(remaining_sent_stmt)).scalar() or 0
            if remaining_sent == 0:
                roll.status = "in_stock"

        # 6. Mark challan as cancelled
        challan.status = "cancelled"

        await self.db.flush()

        # 7. Emit SSE event
        try:
            from app.core.event_bus import event_bus
            await event_bus.emit("va_cancelled", {
                "challan_no": challan.challan_no,
                "vendor": challan.va_party.name if challan.va_party else "Unknown",
                "roll_count": len(logs),
                "type": "roll",
            }, str(cancelled_by))
        except Exception:
            pass  # SSE failure should not block cancel

        return await self.get_challan(challan_id)

    async def update_challan(self, challan_id: UUID, req: JobChallanUpdate) -> dict:
        """Edit a job challan (va_party, value_addition, sent_date, notes)."""
        stmt = (
            select(JobChallan)
            .where(JobChallan.id == challan_id)
            .options(
                selectinload(JobChallan.value_addition),
                selectinload(JobChallan.va_party),
                selectinload(JobChallan.created_by_user),
                selectinload(JobChallan.processing_logs)
                    .selectinload(RollProcessing.roll)
                    .selectinload(Roll.processing_logs)
                    .selectinload(RollProcessing.value_addition),
            )
        )
        result = await self.db.execute(stmt)
        challan = result.scalar_one_or_none()
        if not challan:
            raise NotFoundError(f"Job challan {challan_id} not found")

        if req.va_party_id is not None:
            challan.va_party_id = req.va_party_id
            for log in challan.processing_logs:
                log.va_party_id = req.va_party_id
        if req.value_addition_id is not None:
            challan.value_addition_id = req.value_addition_id
            for log in challan.processing_logs:
                log.value_addition_id = req.value_addition_id
        if req.sent_date is not None:
            challan.sent_date = req.sent_date
            for log in challan.processing_logs:
                log.sent_date = req.sent_date
        if req.notes is not None:
            challan.notes = req.notes

        await self.db.flush()
        # Reload with fresh relationships (FK changes don't auto-refresh ORM objects)
        return await self.get_challan(challan_id)

    def _to_response(self, challan: JobChallan) -> dict:
        va = challan.value_addition
        vp = challan.va_party
        user = challan.created_by_user

        from app.services.roll_service import RollService
        roll_briefs = []
        for log in (challan.processing_logs or []):
            r = log.roll
            if not r:
                continue
            enhanced = RollService._compute_enhanced_roll_code(r.roll_code, r.processing_logs)
            roll_briefs.append({
                "id": str(r.id),
                "roll_code": r.roll_code,
                "enhanced_roll_code": enhanced,
                "fabric_type": r.fabric_type,
                "color": r.color,
                "current_weight": float(r.current_weight) if r.current_weight else 0,
                "weight_sent": float(log.weight_before) if log.weight_before else None,
                "processing_id": str(log.id),
                "processing_status": log.status,
            })

        total_weight = sum(rb.get("weight_sent") or rb["current_weight"] for rb in roll_briefs)

        return {
            "id": str(challan.id),
            "challan_no": challan.challan_no,
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
            "sent_date": challan.sent_date.isoformat() if challan.sent_date else None,
            "received_date": challan.received_date.isoformat() if challan.received_date else None,
            "status": challan.status or "sent",
            "notes": challan.notes,
            "created_by_user": {
                "id": str(user.id),
                "full_name": user.full_name,
            } if user else None,
            "created_at": challan.created_at.isoformat() if challan.created_at else None,
            "rolls": roll_briefs,
            "total_weight": round(total_weight, 3),
            "roll_count": len(roll_briefs),
        }
