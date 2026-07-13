"""Shared FastAPI dependencies."""

from app.state import AppState
from app.websocket_manager import ConnectionManager

app_state = AppState()
manager = ConnectionManager()


def get_app_state() -> AppState:
    return app_state


def get_manager() -> ConnectionManager:
    return manager
