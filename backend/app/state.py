"""In-memory application state and seed data."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Literal

from app.config import DOCK_BAYS, TOP_ROW_X
from app.events import add_event
from app.metrics import derive_metrics
from app.schemas import (
    ChargingSession,
    DemoMode,
    DispatchDecision,
    DockBay,
    EventLogItem,
    Metrics,
    ParkingSpot,
    Position,
    Robot,
    RobotStatus,
    SessionStatus,
    SystemState,
    Vehicle,
    VehiclePaint,
    VehiclePriority,
    VehicleStatus,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _make_spot(spot_id: str, x: float, y: float, row: str, occupied: str | None) -> ParkingSpot:
    rotation_top = row == "top"
    return ParkingSpot(
        id=spot_id,
        row=row,
        position=Position(x=x, y=y),
        service_point=Position(x=x + 3, y=28 if rotation_top else 72),
        occupied_vehicle_id=occupied,
    )


def build_parking_spots(occupancy: dict[str, str | None] | None = None) -> list[ParkingSpot]:
    occ = occupancy or {}
    spots: list[ParkingSpot] = []
    for i, x in enumerate(TOP_ROW_X):
        label = f"P2-{14 + i}"
        spots.append(_make_spot(label, x, 16, "top", occ.get(label)))
    for i, x in enumerate(TOP_ROW_X):
        label = f"A{i + 1}"
        spots.append(_make_spot(label, x, 84, "bottom", occ.get(label)))
    return spots


def build_dock_bays() -> list[DockBay]:
    return [
        DockBay(
            id=b["id"],
            position=Position(**b["position"]),
            label=b.get("label"),
            orientation=b.get("orientation"),
        )
        for b in DOCK_BAYS
    ]


def seed_idle_state() -> dict:
    spots = build_parking_spots({
        "P2-15": "EV-4712", "P2-18": "EV-4821", "P2-20": "EV-2054",
        "P2-22": "EV-7391", "A2": "EV-3568", "A5": "EV-4466", "A8": "EV-1730",
    })
    vehicles = [
        Vehicle(id="EV-4712", model="Polestar 2", paint=VehiclePaint.white, spot_id="P2-15", position=Position(x=18, y=16), status=VehicleStatus.parked, battery=76, target_battery=80, priority=VehiclePriority.normal, expected_departure_tick=12000),
        Vehicle(id="EV-4821", model="Hyundai IONIQ 5", paint=VehiclePaint.charcoal, spot_id="P2-18", position=Position(x=45, y=16), status=VehicleStatus.waiting, battery=18, requested_energy_kwh=28, target_battery=75, priority=VehiclePriority.urgent, expected_departure_tick=10000),
        Vehicle(id="EV-2054", model="Tesla Model 3", paint=VehiclePaint.black, spot_id="P2-20", position=Position(x=54, y=16), status=VehicleStatus.charging, battery=64, requested_energy_kwh=24, target_battery=85, assigned_robot_id="R-02", priority=VehiclePriority.normal, expected_departure_tick=11000),
        Vehicle(id="EV-7391", model="Kia EV6", paint=VehiclePaint.white, spot_id="P2-22", position=Position(x=72, y=16), status=VehicleStatus.completed, battery=92, requested_energy_kwh=18.8, target_battery=90, priority=VehiclePriority.normal, expected_departure_tick=9000),
        Vehicle(id="EV-3568", model="Ford Mustang Mach-E", paint=VehiclePaint.silver, spot_id="A2", position=Position(x=27, y=84), status=VehicleStatus.parked, battery=41, target_battery=80, priority=VehiclePriority.normal, heading=180, expected_departure_tick=14000),
        Vehicle(id="EV-4466", model="Nissan Ariya", paint=VehiclePaint.silver, spot_id="A5", position=Position(x=54, y=84), status=VehicleStatus.waiting, battery=29, requested_energy_kwh=22, target_battery=75, priority=VehiclePriority.normal, heading=180, expected_departure_tick=10000),
        Vehicle(id="EV-1730", model="Tesla Model Y", paint=VehiclePaint.blue, spot_id="A8", position=Position(x=81, y=84), status=VehicleStatus.parked, battery=67, target_battery=85, priority=VehiclePriority.normal, heading=180, expected_departure_tick=15000),
    ]
    dock_bays = build_dock_bays()
    robots = [
        Robot(id="R-01", name="R-01", status=RobotStatus.docked, battery=82, position=dock_bays[0].position, dock_bay_id="dock-A"),
        Robot(id="R-02", name="R-02", status=RobotStatus.charging, battery=64, position=Position(x=66, y=28), assigned_vehicle_id="EV-2054"),
        Robot(id="R-03", name="R-03", status=RobotStatus.returning, battery=41, position=Position(x=42, y=52), dock_bay_id="dock-C", route=[Position(x=42, y=50), Position(x=dock_bays[2].position.x, y=50), Position(x=dock_bays[2].position.x, y=72), dock_bays[2].position], heading=90),
    ]
    sessions = [
        ChargingSession(id="S-1045", vehicle_id="EV-4466", spot_id="A5", status=SessionStatus.queued, requested_energy_kwh=22, priority_score=70),
        ChargingSession(id="S-1044", vehicle_id="EV-4821", spot_id="P2-18", status=SessionStatus.queued, requested_energy_kwh=28, priority_score=120),
        ChargingSession(id="S-1043", vehicle_id="EV-2054", spot_id="P2-20", robot_id="R-02", status=SessionStatus.active, requested_energy_kwh=24, delivered_energy_kwh=12.4, started_tick=5),
        ChargingSession(id="S-1039", vehicle_id="EV-7391", spot_id="P2-22", robot_id="R-03", status=SessionStatus.completed, requested_energy_kwh=18.8, delivered_energy_kwh=18.8, completed_tick=40),
    ]
    events = [
        EventLogItem(id="E-102", tick=0, timestamp=_now(), type="request", message="EV-4466 requested 22.0 kWh at A5"),
        EventLogItem(id="E-101", tick=0, timestamp=_now(), type="returning", message="R-03 returned to dock"),
    ]
    return {"vehicles": vehicles, "robots": robots, "parking_spots": spots, "dock_bays": dock_bays, "sessions": sessions, "events": events}


def seed_demo_state() -> dict:
    """Overnight garage: most spaces occupied, A5 left free for the scripted arrival."""
    occupancy = {
        "P2-15": "EV-4712",
        "P2-18": "EV-4821",
        "P2-20": "EV-2054",
        "P2-22": "EV-7391",
        "A2": "EV-3568",
        "A8": "EV-1730",
    }
    spots = build_parking_spots(occupancy)
    vehicles = [
        Vehicle(id="EV-4712", model="Polestar 2", paint=VehiclePaint.white, spot_id="P2-15", position=Position(x=18, y=16), status=VehicleStatus.parked, battery=76, target_battery=80, priority=VehiclePriority.normal, expected_departure_tick=14000),
        Vehicle(id="EV-4821", model="Hyundai IONIQ 5", paint=VehiclePaint.charcoal, spot_id="P2-18", position=Position(x=45, y=16), status=VehicleStatus.parked, battery=18, requested_energy_kwh=28, target_battery=80, priority=VehiclePriority.urgent, expected_departure_tick=12000),
        Vehicle(id="EV-2054", model="Tesla Model 3", paint=VehiclePaint.black, spot_id="P2-20", position=Position(x=54, y=16), status=VehicleStatus.parked, battery=64, target_battery=70, priority=VehiclePriority.normal, expected_departure_tick=13000),
        Vehicle(id="EV-7391", model="Kia EV6", paint=VehiclePaint.white, spot_id="P2-22", position=Position(x=72, y=16), status=VehicleStatus.parked, battery=88, target_battery=90, priority=VehiclePriority.normal, expected_departure_tick=15000),
        Vehicle(id="EV-3568", model="Ford Mustang Mach-E", paint=VehiclePaint.silver, spot_id="A2", position=Position(x=27, y=84), status=VehicleStatus.parked, battery=41, requested_energy_kwh=22, target_battery=80, priority=VehiclePriority.normal, heading=180, expected_departure_tick=11000),
        Vehicle(id="EV-1730", model="Tesla Model Y", paint=VehiclePaint.blue, spot_id="A8", position=Position(x=81, y=84), status=VehicleStatus.parked, battery=67, target_battery=85, priority=VehiclePriority.normal, heading=180, expected_departure_tick=16000),
    ]
    # Overnight cars stay parked (no seed jobs) so robots stay free for the
    # EV-4466 fault → backup story. Low-battery overnight requests after story.
    dock_bays = build_dock_bays()
    robots = [
        Robot(id="R-01", name="R-01", status=RobotStatus.docked, battery=82, position=dock_bays[0].position, dock_bay_id="dock-A"),
        Robot(id="R-02", name="R-02", status=RobotStatus.docked, battery=78, position=dock_bays[1].position, dock_bay_id="dock-B"),
        Robot(id="R-03", name="R-03", status=RobotStatus.docked, battery=91, position=dock_bays[2].position, dock_bay_id="dock-C"),
    ]
    events = add_event([], 0, "Demo started. Garage simulation running.", "dispatch")
    return {
        "vehicles": vehicles,
        "robots": robots,
        "parking_spots": spots,
        "dock_bays": dock_bays,
        "sessions": [],
        "events": events,
    }


class AppState:
    def __init__(self) -> None:
        self.lock = asyncio.Lock()
        self.auto_dispatch = True
        self.reset("idle")

    def reset(self, mode: Literal["idle", "demo"] = "idle") -> None:
        seed = seed_demo_state() if mode == "demo" else seed_idle_state()
        self.demo_mode = DemoMode.running if mode == "demo" else DemoMode.idle
        self.tick = 0
        self.vehicles: list[Vehicle] = seed["vehicles"]
        self.robots: list[Robot] = seed["robots"]
        self.parking_spots: list[ParkingSpot] = seed["parking_spots"]
        self.dock_bays: list[DockBay] = seed["dock_bays"]
        self.sessions: list[ChargingSession] = seed["sessions"]
        self.events: list[EventLogItem] = seed["events"]
        self.last_decision: DispatchDecision | None = None
        self.blocked_lane_active = False
        self.energy_today_kwh = 148.6 if mode == "idle" else 0.0
        self.next_spawn_tick = 10
        self.spawn_count = 0
        self.spawn_plan_index = 0
        self.charge_started_tick: int | None = None
        self.fault_triggered = False
        self.backup_assigned = False
        self.scripted_vehicle_id: str | None = "EV-4466" if mode == "demo" else None
        self.vehicle_counter = 9000
        self.missed_count = 0
        self.event_keys: set[str] = set()
        self.event_cooldowns: dict[str, int] = {}
        if mode == "demo":
            self.event_keys.add("demo-started")
            for vehicle in self.vehicles:
                self.event_keys.add(f"parked:{vehicle.id}")

    def _placeholder_metrics(self) -> Metrics:
        return Metrics(
            fleet_online=0,
            robots_available=0,
            jobs_active=0,
            queue_depth=0,
            cars_in_garage=0,
            energy_today_kwh=self.energy_today_kwh,
            dock_occupancy="0/0",
            faults_today=0,
            missed_requests=self.missed_count,
        )

    def snapshot(self) -> SystemState:
        partial = SystemState(
            demo_mode=self.demo_mode,
            tick=self.tick,
            vehicles=self.vehicles,
            robots=self.robots,
            parking_spots=self.parking_spots,
            dock_bays=self.dock_bays,
            sessions=self.sessions,
            events=self.events,
            metrics=self._placeholder_metrics(),
            last_decision=self.last_decision,
            blocked_lane_active=self.blocked_lane_active,
            auto_dispatch=self.auto_dispatch,
        )
        metrics = derive_metrics(partial)
        metrics.energy_today_kwh = self.energy_today_kwh
        metrics.missed_requests = self.missed_count
        return partial.model_copy(update={"metrics": metrics})

    def get_vehicle(self, vehicle_id: str) -> Vehicle | None:
        return next((v for v in self.vehicles if v.id == vehicle_id), None)

    def get_robot(self, robot_id: str) -> Robot | None:
        return next((r for r in self.robots if r.id == robot_id), None)

    def get_session(self, session_id: str) -> ChargingSession | None:
        return next((s for s in self.sessions if s.id == session_id), None)

    def get_latest_session_for_vehicle(self, vehicle_id: str) -> ChargingSession | None:
        for session in self.sessions:
            if session.vehicle_id == vehicle_id:
                return session
        return None

    def new_session_id(self) -> str:
        return f"S-{uuid.uuid4().hex[:6]}"

    def new_vehicle_id(self) -> str:
        self.vehicle_counter += 1
        return f"EV-{self.vehicle_counter}"
