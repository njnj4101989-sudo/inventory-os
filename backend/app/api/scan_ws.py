"""WebSocket scan pairing — phone ↔ desktop real-time connection.

Phone connects as role='phone', desktop as role='desktop'.
Scans from phone are forwarded to all desktop connections for the same user.
Presence events are sent instantly on connect/disconnect.
"""

import asyncio
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError

from app.core.security import verify_token, ACCESS_COOKIE_NAME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scan/ws", tags=["ScanWS"])


class ScanPairManager:
    """Manages phone ↔ desktop WebSocket pairs keyed by user_id."""

    def __init__(self):
        # { user_id: { 'phone': WebSocket | None, 'desktops': [WebSocket, ...] } }
        self._pairs: dict[str, dict] = {}

    def _ensure(self, user_id: str):
        if user_id not in self._pairs:
            self._pairs[user_id] = {"phone": None, "desktops": []}

    async def connect_phone(self, user_id: str, ws: WebSocket):
        self._ensure(user_id)
        old = self._pairs[user_id]["phone"]
        if old:
            # Replace previous phone connection
            try:
                await old.close(code=4000, reason="Replaced by new phone connection")
            except Exception:
                pass
        self._pairs[user_id]["phone"] = ws
        # Notify all desktops
        await self._broadcast_desktops(user_id, {"type": "presence", "phone": "connected"})

    async def connect_desktop(self, user_id: str, ws: WebSocket):
        self._ensure(user_id)
        self._pairs[user_id]["desktops"].append(ws)
        # Tell this desktop if phone is already connected
        if self._pairs[user_id]["phone"]:
            try:
                await ws.send_json({"type": "presence", "phone": "connected"})
            except Exception:
                pass
        # Tell phone that a desktop joined
        await self._notify_phone(user_id, {"type": "presence", "desktop": "connected"})

    async def disconnect_phone(self, user_id: str, ws: WebSocket):
        pair = self._pairs.get(user_id)
        if not pair:
            return
        if pair["phone"] is ws:
            pair["phone"] = None
            await self._broadcast_desktops(user_id, {"type": "presence", "phone": "disconnected"})
        self._cleanup(user_id)

    async def disconnect_desktop(self, user_id: str, ws: WebSocket):
        pair = self._pairs.get(user_id)
        if not pair:
            return
        if ws in pair["desktops"]:
            pair["desktops"].remove(ws)
        if not pair["desktops"]:
            await self._notify_phone(user_id, {"type": "presence", "desktop": "disconnected"})
        self._cleanup(user_id)

    async def forward_scan(self, user_id: str, data: dict):
        """Phone sends scan → forward to all desktop connections."""
        await self._broadcast_desktops(user_id, data)

    async def _broadcast_desktops(self, user_id: str, msg: dict):
        pair = self._pairs.get(user_id)
        if not pair:
            return
        dead = []
        for ws in pair["desktops"]:
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            pair["desktops"].remove(ws)

    async def _notify_phone(self, user_id: str, msg: dict):
        pair = self._pairs.get(user_id)
        if not pair or not pair["phone"]:
            return
        try:
            await pair["phone"].send_json(msg)
        except Exception:
            pair["phone"] = None

    def _cleanup(self, user_id: str):
        pair = self._pairs.get(user_id)
        if pair and not pair["phone"] and not pair["desktops"]:
            del self._pairs[user_id]


manager = ScanPairManager()


def _authenticate_ws(websocket: WebSocket) -> str | None:
    """Extract and verify JWT from HttpOnly cookie on WS handshake. Returns user_id or None."""
    token = websocket.cookies.get(ACCESS_COOKIE_NAME)
    if not token:
        return None
    try:
        payload = verify_token(token)
        if payload.get("type") != "access":
            return None
        return payload.get("sub")
    except JWTError:
        return None


@router.websocket("/pair")
async def scan_pair(websocket: WebSocket, role: str = Query(...)):
    """WebSocket endpoint for phone ↔ desktop scan pairing.

    Query params:
        role: 'phone' or 'desktop'
    Auth: HttpOnly access_token cookie (sent automatically by browser)
    """
    if role not in ("phone", "desktop"):
        await websocket.close(code=4002, reason="Invalid role — use 'phone' or 'desktop'")
        return

    user_id = _authenticate_ws(websocket)
    if not user_id:
        await websocket.close(code=4001, reason="Not authenticated")
        return

    await websocket.accept()
    logger.info("ScanWS %s connected: user=%s", role, user_id)

    try:
        if role == "phone":
            await manager.connect_phone(user_id, websocket)
            while True:
                data = await websocket.receive_json()
                if data.get("type") == "scan":
                    await manager.forward_scan(user_id, data)
        else:
            await manager.connect_desktop(user_id, websocket)
            while True:
                # Desktop doesn't send scan data, but keep connection alive
                data = await websocket.receive_json()
                # Could handle future desktop→phone messages here
    except WebSocketDisconnect:
        logger.info("ScanWS %s disconnected: user=%s", role, user_id)
    except Exception as e:
        logger.warning("ScanWS %s error: user=%s err=%s", role, user_id, e)
    finally:
        if role == "phone":
            await manager.disconnect_phone(user_id, websocket)
        else:
            await manager.disconnect_desktop(user_id, websocket)
