"""Deterministic demo spawn plan for interview-safe Run Demo."""

from __future__ import annotations

from typing import TypedDict


class SpawnPlanEntry(TypedDict):
    id: str
    model: str
    paint: str
    battery: float
    target_battery: float
    spot_id: str
    spawn_at_tick: int
    departure_offset: int
    requested_kwh: float


# Only one scripted arrival during the demo story; overnight fleet is pre-seeded.
DEMO_VEHICLE_SPAWN_PLAN: list[SpawnPlanEntry] = [
    {
        "id": "EV-4466",
        "model": "Nissan Ariya",
        "paint": "silver",
        "battery": 29,
        "target_battery": 75,
        "spot_id": "A5",
        "spawn_at_tick": 10,
        "departure_offset": 12000,
        "requested_kwh": 22.0,
    },
]

# Optional slow post-plan arrivals: mostly overnight.
OVERNIGHT_PROBABILITY = 0.85
OVERNIGHT_DEPARTURE_OFFSET_MIN = 8000
OVERNIGHT_DEPARTURE_OFFSET_MAX = 16000
SHORT_STAY_DEPARTURE_OFFSET_MIN = 2500
SHORT_STAY_DEPARTURE_OFFSET_MAX = 5000
