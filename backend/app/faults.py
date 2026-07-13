"""Fault handling with safe stop placement and backup reassignment."""

from __future__ import annotations

import math

from app.dispatch import select_best_robot, select_next_job
from app.routing import build_route_to_dock, get_available_dock_bay, occupied_dock_ids
from app.schemas import (
    ChargingSession,
    DispatchDecision,
    DockBay,
    FaultType,
    ParkingSpot,
    Position,
    Robot,
    RobotStatus,
    SessionStatus,
    Vehicle,
    VehicleStatus,
)


def _distance(a: Position, b: Position) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


def apply_fault(
    robot: Robot,
    fault_type: FaultType,
    robots: list[Robot],
    vehicles: list[Vehicle],
    sessions: list[ChargingSession],
) -> tuple[list[Robot], list[Vehicle], list[ChargingSession], str | None]:
    vehicle_id = robot.assigned_vehicle_id

    # Freeze exactly where the robot is — never nudge/teleport sideways on fault.
    robots = [
        r.model_copy(update={
            "status": RobotStatus.faulted,
            "fault_type": fault_type,
            "assigned_vehicle_id": None,
            "assigned_session_id": None,
            "dock_bay_id": None,
            "route": [],
            "route_index": 0,
            "last_yield_tick": 0,
            "speed_mps": 0.0,
            "position": r.position,
        }) if r.id == robot.id else r
        for r in robots
    ]
    vehicles = [
        v.model_copy(update={"status": VehicleStatus.backup_needed, "assigned_robot_id": None})
        if v.id == vehicle_id else v
        for v in vehicles
    ]
    sessions = [
        s.model_copy(update={"status": SessionStatus.interrupted, "robot_id": None})
        if s.vehicle_id == vehicle_id and s.status in (
            SessionStatus.active, SessionStatus.en_route, SessionStatus.assigned,
        ) else s
        for s in sessions
    ]
    return robots, vehicles, sessions, vehicle_id


def clear_fault(robot: Robot, robots: list[Robot], dock_bays: list[DockBay], blocked_lane: bool) -> list[Robot]:
    occupied = occupied_dock_ids(robots, exclude_robot_id=robot.id)
    bay = get_available_dock_bay(dock_bays, occupied, robot_id=robot.id)

    # Already at (or very near) home dock → available immediately.
    if bay and _distance(robot.position, bay.position) < 2.0:
        return [
            r.model_copy(update={
                "status": RobotStatus.docked,
                "fault_type": None,
                "dock_bay_id": bay.id,
                "position": bay.position,
                "route": [],
                "route_index": 0,
                "last_yield_tick": 0,
            }) if r.id == robot.id else r
            for r in robots
        ]

    return [
        r.model_copy(update={
            "status": RobotStatus.returning if bay else RobotStatus.idle,
            "fault_type": None,
            "dock_bay_id": bay.id if bay else None,
            "route": build_route_to_dock(r.position, bay, blocked_lane) if bay else [],
            "route_index": 0,
            "last_yield_tick": 0,
        }) if r.id == robot.id else r
        for r in robots
    ]


def try_backup_dispatch(
    vehicles: list[Vehicle],
    sessions: list[ChargingSession],
    robots: list[Robot],
    spots: list[ParkingSpot],
    dock_bays: list[DockBay],
    blocked_lane: bool,
    current_tick: int,
) -> tuple[list[Robot], list[Vehicle], list[ChargingSession], DispatchDecision | None]:
    sessions = [
        s.model_copy(update={"status": SessionStatus.queued}) if s.status == SessionStatus.interrupted else s
        for s in sessions
    ]
    vehicles = [
        v.model_copy(update={"status": VehicleStatus.waiting}) if v.status == VehicleStatus.backup_needed else v
        for v in vehicles
    ]

    next_job = select_next_job(vehicles, sessions, current_tick)
    if not next_job:
        return robots, vehicles, sessions, None

    vehicle, session, reasons = next_job
    decision = select_best_robot(vehicle, session, robots, spots, dock_bays, blocked_lane, reasons)
    if not decision or not decision.selected_robot_id:
        return robots, vehicles, sessions, None

    robots = [
        r.model_copy(update={
            "status": RobotStatus.en_route,
            "assigned_vehicle_id": vehicle.id,
            "assigned_session_id": session.id,
            "dock_bay_id": None,
            "route": decision.route,
            "route_index": 0,
            "fault_type": None,
            "last_yield_tick": 0,
        }) if r.id == decision.selected_robot_id else r
        for r in robots
    ]
    vehicles = [
        v.model_copy(update={"status": VehicleStatus.assigned, "assigned_robot_id": decision.selected_robot_id})
        if v.id == vehicle.id else v
        for v in vehicles
    ]
    sessions = [
        s.model_copy(update={"status": SessionStatus.en_route, "robot_id": decision.selected_robot_id})
        if s.id == session.id else s
        for s in sessions
    ]
    return robots, vehicles, sessions, decision
