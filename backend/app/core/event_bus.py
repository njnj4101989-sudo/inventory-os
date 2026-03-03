"""In-memory event bus for SSE real-time notifications.

Singleton pattern — import `event_bus` anywhere and call `await event_bus.emit(...)`.
Each connected SSE client gets its own asyncio.Queue.
"""

import asyncio
import uuid
from datetime import datetime, timezone


class EventBus:
    """Broadcast events to all connected SSE clients."""

    def __init__(self):
        self._clients: dict[str, asyncio.Queue] = {}

    def subscribe(self) -> tuple[str, asyncio.Queue]:
        """Register a new SSE client. Returns (client_id, queue)."""
        client_id = str(uuid.uuid4())
        queue: asyncio.Queue = asyncio.Queue(maxsize=256)
        self._clients[client_id] = queue
        return client_id, queue

    def unsubscribe(self, client_id: str) -> None:
        """Remove a disconnected SSE client."""
        self._clients.pop(client_id, None)

    async def emit(
        self,
        event_type: str,
        payload: dict,
        actor_id: str | None = None,
        actor_name: str | None = None,
    ) -> None:
        """Push an event to ALL connected clients (non-blocking)."""
        event = {
            "type": event_type,
            "payload": payload,
            "actor": actor_name or "System",
            "actor_id": str(actor_id) if actor_id else None,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        dead_clients = []
        for client_id, queue in self._clients.items():
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                dead_clients.append(client_id)
        for cid in dead_clients:
            self._clients.pop(cid, None)

    def close_all(self) -> None:
        """Shutdown — signal all clients to disconnect."""
        for queue in self._clients.values():
            try:
                queue.put_nowait(None)  # sentinel
            except asyncio.QueueFull:
                pass
        self._clients.clear()

    @property
    def client_count(self) -> int:
        return len(self._clients)


# Singleton instance — import this from anywhere
event_bus = EventBus()
