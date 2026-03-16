"""SSE (Server-Sent Events) endpoint for real-time notifications.

Reads JWT from HttpOnly cookie (auto-sent by browser).
"""

import asyncio
import json

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from jose import ExpiredSignatureError, JWTError

from app.core.event_bus import event_bus
from app.core.security import verify_token, ACCESS_COOKIE_NAME

router = APIRouter(prefix="/events", tags=["events"])


async def _validate_from_cookie(request: Request) -> dict | None:
    """Validate JWT from HttpOnly cookie. Returns claims dict or None."""
    token = request.cookies.get(ACCESS_COOKIE_NAME)
    if not token:
        return None
    try:
        payload = verify_token(token)
        if payload.get("type") != "access":
            return None
        return payload
    except (ExpiredSignatureError, JWTError):
        return None


async def _event_generator(request: Request, client_id: str, queue: asyncio.Queue):
    """Yield SSE events from the client's queue. Heartbeat every 30s."""
    try:
        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30.0)
            except asyncio.TimeoutError:
                # Heartbeat — keeps connection alive through Nginx/proxies
                yield ": heartbeat\n\n"
                continue

            if event is None:
                # Shutdown sentinel
                break

            yield f"data: {json.dumps(event)}\n\n"
    finally:
        event_bus.unsubscribe(client_id)


@router.get("/stream")
async def event_stream(request: Request):
    """SSE stream — real-time production events. Auth via HttpOnly cookie."""
    claims = await _validate_from_cookie(request)
    if claims is None:
        return StreamingResponse(
            iter([f"data: {json.dumps({'error': 'unauthorized'})}\n\n"]),
            media_type="text/event-stream",
            status_code=401,
        )

    client_id, queue = event_bus.subscribe()

    return StreamingResponse(
        _event_generator(request, client_id, queue),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Nginx: disable proxy buffering
        },
    )
