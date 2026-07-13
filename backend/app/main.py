"""Kiwi Command FastAPI backend."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.config import BROADCAST_INTERVAL_SECONDS, CORS_ORIGINS, TICK_INTERVAL_SECONDS
from app.deps import app_state, manager
from app.events import add_event
from app.routes import router
from app.simulation import tick

logger = logging.getLogger("kiwi.simulation")


async def simulation_loop() -> None:
    """Tick simulation frequently; broadcast less often and never while holding the lock."""
    since_broadcast = 0.0
    while True:
        await asyncio.sleep(TICK_INTERVAL_SECONDS)
        since_broadcast += TICK_INTERVAL_SECONDS
        try:
            snapshot = None
            async with app_state.lock:
                tick(app_state, TICK_INTERVAL_SECONDS)
                # Only prepare a broadcast payload on the UI interval, and only if clients exist.
                if since_broadcast >= BROADCAST_INTERVAL_SECONDS:
                    since_broadcast = 0.0
                    if manager.client_count > 0:
                        snapshot = app_state.snapshot()
            if snapshot is not None:
                await manager.broadcast(snapshot)
        except Exception:
            logger.exception("Simulation tick failed")
            try:
                async with app_state.lock:
                    app_state.events = add_event(
                        app_state.events,
                        app_state.tick,
                        "Simulation tick error. Check backend logs.",
                        "critical",
                    )
            except Exception:
                logger.exception("Failed to record simulation error event")


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(simulation_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Kiwi Command API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, dependencies=[])


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "clients": manager.client_count,
        "demo_mode": app_state.demo_mode.value,
        "tick": app_state.tick,
    }


@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        async with app_state.lock:
            payload = app_state.snapshot().model_dump(mode="json")
        await websocket.send_json({"type": "state", "state": payload})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception:
        await manager.disconnect(websocket)
