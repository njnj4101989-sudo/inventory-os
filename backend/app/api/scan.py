"""Remote scan endpoint — phone scans QR, desktop receives item via SSE."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user
from app.core.event_bus import event_bus
from app.core.exceptions import NotFoundError
from app.models.user import User
from app.models.roll import Roll
from app.models.batch import Batch
from app.models.sku import SKU

router = APIRouter(prefix="/scan", tags=["Scan"])


class RemoteScanRequest(BaseModel):
    code: str


@router.post("/remote")
async def remote_scan(
    body: RemoteScanRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Scan QR on phone → emit SSE event → desktop auto-adds item to form.

    Tries to match code against rolls, batches, then SKUs (in order).
    """
    code = body.code.strip()
    entity_type = None
    entity_data = None

    # 1. Try roll
    result = await db.execute(select(Roll).where(Roll.roll_code == code))
    roll = result.scalar_one_or_none()
    if roll:
        entity_type = "roll"
        entity_data = {
            "id": str(roll.id),
            "roll_code": roll.roll_code,
            "fabric_type": roll.fabric_type,
            "color": roll.color,
            "total_weight": float(roll.total_weight) if roll.total_weight else None,
            "remaining_weight": float(roll.remaining_weight) if roll.remaining_weight else None,
            "status": roll.status,
        }

    # 2. Try batch
    if not entity_type:
        result = await db.execute(select(Batch).where(Batch.batch_code == code))
        batch = result.scalar_one_or_none()
        if batch:
            entity_type = "batch"
            entity_data = {
                "id": str(batch.id),
                "batch_code": batch.batch_code,
                "design_no": batch.design_no,
                "status": batch.status,
            }

    # 3. Try SKU
    if not entity_type:
        result = await db.execute(select(SKU).where(SKU.sku_code == code))
        sku = result.scalar_one_or_none()
        if sku:
            entity_type = "sku"
            entity_data = {
                "id": str(sku.id),
                "sku_code": sku.sku_code,
                "product_type": sku.product_type,
                "color": sku.color,
                "size": sku.size,
            }

    if not entity_type:
        raise NotFoundError(f"No roll, batch, or SKU found for code: {code}")

    # Emit SSE event — all connected clients receive it,
    # frontend filters by actor_id to only act on own scans
    await event_bus.emit(
        event_type="remote_scan",
        payload={
            "code": code,
            "entity_type": entity_type,
            "entity_data": entity_data,
        },
        actor_id=str(current_user.id),
        actor_name=current_user.full_name,
    )

    return {
        "success": True,
        "data": {
            "code": code,
            "entity_type": entity_type,
            "entity_data": entity_data,
        },
        "message": f"Scan sent: {entity_type} {code}",
    }
