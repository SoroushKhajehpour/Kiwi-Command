"""WebSocket connection manager."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect

from app.schemas import SystemState, WebSocketMessage


class ConnectionManager:
    def __init__(self) -> None:
        self.active: list[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.active.append(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            if websocket in self.active:
                self.active.remove(websocket)

    async def broadcast(self, state: SystemState) -> None:
        message = WebSocketMessage(type="state", state=state)
        payload = message.model_dump(mode="json")
        async with self._lock:
            stale: list[WebSocket] = []
            for connection in self.active:
                try:
                    await connection.send_json(payload)
                except (WebSocketDisconnect, RuntimeError):
                    stale.append(connection)
            for connection in stale:
                if connection in self.active:
                    self.active.remove(connection)

    @property
    def client_count(self) -> int:
        return len(self.active)
