"""Event logging with rate limiting and deduplication."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.config import MAX_EVENTS
from app.schemas import EventLogItem, EventSeverity


def add_event(
    events: list[EventLogItem],
    tick: int,
    message: str,
    event_type: str,
    severity: EventSeverity = EventSeverity.info,
    related_robot_id: str | None = None,
    related_vehicle_id: str | None = None,
    related_session_id: str | None = None,
) -> list[EventLogItem]:
    item = EventLogItem(
        id=f"E-{uuid.uuid4().hex[:8]}",
        tick=tick,
        timestamp=datetime.now(timezone.utc),
        type=event_type,
        severity=severity,
        message=message,
        related_robot_id=related_robot_id,
        related_vehicle_id=related_vehicle_id,
        related_session_id=related_session_id,
    )
    return [item, *events][:MAX_EVENTS]


def add_event_once(
    events: list[EventLogItem],
    seen_keys: set[str],
    key: str,
    tick: int,
    message: str,
    event_type: str,
    **kwargs,
) -> list[EventLogItem]:
    if key in seen_keys:
        return events
    seen_keys.add(key)
    return add_event(events, tick, message, event_type, **kwargs)


def add_event_with_cooldown(
    events: list[EventLogItem],
    cooldown_ticks: dict[str, int],
    key: str,
    cooldown: int,
    tick: int,
    message: str,
    event_type: str,
    **kwargs,
) -> list[EventLogItem]:
    last = cooldown_ticks.get(key)
    if last is not None and tick - last < cooldown:
        return events
    cooldown_ticks[key] = tick
    return add_event(events, tick, message, event_type, **kwargs)
