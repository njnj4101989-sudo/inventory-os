"""Job Challan service — create challan + bulk send rolls, list, get by id."""

import math
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.job_challan import JobChallan
from app.models.roll import Roll, RollProcessing
from app.schemas.job_challan import JobChallanCreate, JobChallanFilterParams
from app.core.exceptions import NotFoundError, BusinessRuleViolationError


class JobChallanService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _next_challan_no(self) -> str:
        """Generate next sequential challan number: JC-001, JC-002, etc."""
        stmt = (
            select(func.max(JobChallan.challan_no))
            .where(JobChallan.challan_no.like("JC-%"))
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

    async def create_challan(self, req: JobChallanCreate, created_by: UUID) -> dict:
        """Create a job challan and send all specified rolls for processing in one transaction."""
        if not req.roll_ids:
            raise BusinessRuleViolationError("At least one roll is required")

        # Validate all rolls exist and are in_stock
        stmt = (
            select(Roll)
            .where(Roll.id.in_(req.roll_ids))
            .options(
                selectinload(Roll.supplier),
                selectinload(Roll.processing_logs).selectinload(RollProcessing.value_addition),
            )
        )
        result = await self.db.execute(stmt)
        rolls = result.scalars().all()

        roll_map = {r.id: r for r in rolls}
        missing = [str(rid) for rid in req.roll_ids if rid not in roll_map]
        if missing:
            raise NotFoundError(f"Rolls not found: {', '.join(missing)}")

        not_in_stock = [r.roll_code for r in rolls if r.status != "in_stock"]
        if not_in_stock:
            raise BusinessRuleViolationError(
                f"Rolls must be in_stock: {', '.join(not_in_stock)}"
            )

        # Generate challan number
        challan_no = await self._next_challan_no()

        # Create challan
        challan = JobChallan(
            challan_no=challan_no,
            value_addition_id=req.value_addition_id,
            vendor_name=req.vendor_name,
            vendor_phone=req.vendor_phone,
            sent_date=req.sent_date,
            notes=req.notes,
            created_by_id=created_by,
        )
        self.db.add(challan)
        await self.db.flush()

        # Send each roll for processing and link to challan
        for roll_id in req.roll_ids:
            roll = roll_map[roll_id]
            log = RollProcessing(
                roll_id=roll_id,
                value_addition_id=req.value_addition_id,
                vendor_name=req.vendor_name,
                vendor_phone=req.vendor_phone,
                sent_date=req.sent_date,
                weight_before=roll.current_weight,
                length_before=roll.total_length,
                status="sent",
                notes=req.notes,
                job_challan_id=challan.id,
            )
            self.db.add(log)
            roll.status = "sent_for_processing"

        await self.db.flush()

        # Reload challan with relationships
        return await self._get_challan_response(challan.id, rolls)

    async def get_challans(self, params: JobChallanFilterParams) -> dict:
        """List challans with pagination and optional filters."""
        conditions = []
        if params.vendor_name:
            conditions.append(JobChallan.vendor_name.ilike(f"%{params.vendor_name}%"))
        if params.value_addition_id:
            conditions.append(JobChallan.value_addition_id == params.value_addition_id)

        count_stmt = select(func.count()).select_from(JobChallan)
        if conditions:
            count_stmt = count_stmt.where(*conditions)
        total = (await self.db.execute(count_stmt)).scalar() or 0
        pages = max(1, math.ceil(total / params.page_size))

        stmt = (
            select(JobChallan)
            .options(
                selectinload(JobChallan.value_addition),
                selectinload(JobChallan.created_by_user),
                selectinload(JobChallan.processing_logs)
                    .selectinload(RollProcessing.roll)
                    .selectinload(Roll.processing_logs)
                    .selectinload(RollProcessing.value_addition),
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

    async def _get_challan_response(self, challan_id: UUID, rolls: list[Roll]) -> dict:
        """Build response for a freshly created challan using already-loaded rolls."""
        stmt = (
            select(JobChallan)
            .where(JobChallan.id == challan_id)
            .options(
                selectinload(JobChallan.value_addition),
                selectinload(JobChallan.created_by_user),
            )
        )
        result = await self.db.execute(stmt)
        challan = result.scalar_one()

        va = challan.value_addition
        user = challan.created_by_user

        from app.services.roll_service import RollService
        roll_briefs = []
        for r in rolls:
            enhanced = RollService._compute_enhanced_roll_code(r.roll_code, r.processing_logs)
            roll_briefs.append({
                "id": str(r.id),
                "roll_code": r.roll_code,
                "enhanced_roll_code": enhanced,
                "fabric_type": r.fabric_type,
                "color": r.color,
                "current_weight": float(r.current_weight) if r.current_weight else 0,
            })

        total_weight = sum(rb["current_weight"] for rb in roll_briefs)

        return {
            "id": str(challan.id),
            "challan_no": challan.challan_no,
            "value_addition": {
                "id": str(va.id),
                "name": va.name,
                "short_code": va.short_code,
            } if va else None,
            "vendor_name": challan.vendor_name,
            "vendor_phone": challan.vendor_phone,
            "sent_date": challan.sent_date.isoformat() if challan.sent_date else None,
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

    def _to_response(self, challan: JobChallan) -> dict:
        va = challan.value_addition
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
            })

        total_weight = sum(rb["current_weight"] for rb in roll_briefs)

        return {
            "id": str(challan.id),
            "challan_no": challan.challan_no,
            "value_addition": {
                "id": str(va.id),
                "name": va.name,
                "short_code": va.short_code,
            } if va else None,
            "vendor_name": challan.vendor_name,
            "vendor_phone": challan.vendor_phone,
            "sent_date": challan.sent_date.isoformat() if challan.sent_date else None,
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
