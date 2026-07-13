"""Pydantic models for Kiwi Command backend."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class DemoMode(str, Enum):
    idle = "idle"
    running = "running"
    paused = "paused"
    ended = "ended"


class VehicleStatus(str, Enum):
    entering = "entering"
    parking = "parking"
    parked = "parked"
    waiting = "waiting"
    assigned = "assigned"
    en_route = "en_route"
    charging = "charging"
    completed = "completed"
    leaving = "leaving"
    departed = "departed"
    backup_needed = "backup_needed"
    faulted = "faulted"


class RobotStatus(str, Enum):
    idle = "idle"
    docked = "docked"
    en_route = "en_route"
    charging = "charging"
    returning = "returning"
    faulted = "faulted"
    yielding = "yielding"
    offline = "offline"


class SessionStatus(str, Enum):
    queued = "queued"
    assigned = "assigned"
    en_route = "en_route"
    active = "active"
    completed = "completed"
    interrupted = "interrupted"
    cancelled = "cancelled"
    missed = "missed"


class FaultType(str, Enum):
    connector_timeout = "connector_timeout"
    vehicle_handshake_failed = "vehicle_handshake_failed"
    low_robot_battery = "low_robot_battery"
    blocked_route = "blocked_route"
    robot_offline = "robot_offline"
    emergency_stop = "emergency_stop"


class VehiclePaint(str, Enum):
    white = "white"
    black = "black"
    charcoal = "charcoal"
    silver = "silver"
    blue = "blue"
    green = "green"


class VehiclePriority(str, Enum):
    low = "low"
    normal = "normal"
    urgent = "urgent"


class EventSeverity(str, Enum):
    info = "info"
    warning = "warning"
    critical = "critical"


class Position(BaseModel):
    x: float
    y: float


class Vehicle(BaseModel):
    id: str
    model: str
    paint: VehiclePaint
    spot_id: Optional[str] = None
    position: Position
    status: VehicleStatus
    battery: float
    requested_energy_kwh: float = 0.0
    target_battery: float = 80.0
    priority: VehiclePriority = VehiclePriority.normal
    arrival_tick: int = 0
    expected_departure_tick: int = 120
    assigned_robot_id: Optional[str] = None
    route: list[Position] = Field(default_factory=list)
    route_index: int = 0
    heading: float = 0.0
    completed_at_tick: Optional[int] = None


class Robot(BaseModel):
    id: str
    name: str
    status: RobotStatus
    battery: float
    position: Position
    heading: float = 0.0
    assigned_vehicle_id: Optional[str] = None
    assigned_session_id: Optional[str] = None
    route: list[Position] = Field(default_factory=list)
    route_index: int = 0
    dock_bay_id: Optional[str] = None
    fault_type: Optional[FaultType] = None
    last_telemetry_tick: int = 0
    speed_mps: float = 1.4
    last_yield_tick: int = 0


class ParkingSpot(BaseModel):
    id: str
    row: str
    position: Position
    service_point: Position
    occupied_vehicle_id: Optional[str] = None
    reserved_vehicle_id: Optional[str] = None


class DockBay(BaseModel):
    id: str
    position: Position
    label: Optional[str] = None
    orientation: Optional[str] = None
    occupied_robot_id: Optional[str] = None


class ChargingSession(BaseModel):
    id: str
    vehicle_id: str
    spot_id: str
    robot_id: Optional[str] = None
    status: SessionStatus
    requested_energy_kwh: float
    delivered_energy_kwh: float = 0.0
    charge_rate_kw: float = 7.0
    priority_score: float = 0.0
    created_tick: int = 0
    started_tick: Optional[int] = None
    completed_tick: Optional[int] = None


class EventLogItem(BaseModel):
    id: str
    tick: int
    timestamp: datetime
    type: str
    severity: EventSeverity = EventSeverity.info
    message: str
    related_robot_id: Optional[str] = None
    related_vehicle_id: Optional[str] = None
    related_session_id: Optional[str] = None


class RejectedRobot(BaseModel):
    robot_id: str
    reason: str


class DispatchDecision(BaseModel):
    vehicle_id: Optional[str] = None
    session_id: Optional[str] = None
    selected_robot_id: Optional[str] = None
    selected_score: Optional[float] = None
    distance_meters: Optional[float] = None
    eta_seconds: Optional[float] = None
    reasons: list[str] = Field(default_factory=list)
    rejected_robots: list[RejectedRobot] = Field(default_factory=list)
    job_priority_reasons: list[str] = Field(default_factory=list)
    route: list[Position] = Field(default_factory=list)


class Metrics(BaseModel):
    fleet_online: int
    robots_available: int
    jobs_active: int
    queue_depth: int
    cars_in_garage: int
    energy_today_kwh: float
    average_eta_seconds: Optional[float] = None
    dock_occupancy: str
    faults_today: int
    missed_requests: int


class SystemState(BaseModel):
    demo_mode: DemoMode
    tick: int
    vehicles: list[Vehicle]
    robots: list[Robot]
    parking_spots: list[ParkingSpot]
    dock_bays: list[DockBay]
    sessions: list[ChargingSession]
    events: list[EventLogItem]
    metrics: Metrics
    last_decision: Optional[DispatchDecision] = None
    blocked_lane_active: bool = False
    auto_dispatch: bool = True


class FaultRequest(BaseModel):
    fault_type: FaultType = FaultType.connector_timeout


class CreateJobRequest(BaseModel):
    vehicle_id: str
    requested_energy_kwh: Optional[float] = None


class WebSocketMessage(BaseModel):
    type: str
    state: SystemState
