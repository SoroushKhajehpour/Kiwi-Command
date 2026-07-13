"""State transition helpers for vehicles, robots, and sessions."""

from __future__ import annotations

from app.charging import choose_target_battery, estimate_requested_energy, round_kwh
from app.config import ARRIVAL_DISTANCE_THRESHOLD, CHARGE_RATE_KW
from app.dispatch import calculate_job_priority, calculate_vehicle_priority
from app.routing import build_route_to_dock, get_vehicle_service_point, occupied_dock_ids, get_available_dock_bay, calculate_distance
from app.schemas import (
    ChargingSession,
    DispatchDecision,
    DockBay,
    ParkingSpot,
    Robot,
    RobotStatus,
    SessionStatus,
    Vehicle,
    VehiclePriority,
    VehicleStatus,
)


def request_charge(
    vehicle: Vehicle,
    sessions: list[ChargingSession],
    current_tick: int,
    energy_kwh: float | None = None,
    *,
    queue_depth: int = 0,
    manual: bool = False,
) -> tuple[Vehicle, ChargingSession] | None:
    if vehicle.status not in (VehicleStatus.parked, VehicleStatus.completed):
        return None
    if not vehicle.spot_id:
        return None

    target = choose_target_battery(vehicle, queue_depth, current_tick)
    requested = round_kwh(
        energy_kwh
        if energy_kwh is not None
        else estimate_requested_energy(vehicle, target_battery=target, manual=manual)
    )
    if requested < 5:
        return None

    priority = calculate_vehicle_priority(
        vehicle.model_copy(update={"requested_energy_kwh": requested, "target_battery": target}),
        current_tick,
    )
    score, _ = calculate_job_priority(
        ChargingSession(
            id="temp",
            vehicle_id=vehicle.id,
            spot_id=vehicle.spot_id,
            status=SessionStatus.queued,
            requested_energy_kwh=requested,
            created_tick=current_tick,
        ),
        vehicle.model_copy(update={"requested_energy_kwh": requested, "target_battery": target}),
        current_tick,
    )

    session = ChargingSession(
        id=f"S-{current_tick}-{vehicle.id[-4:]}",
        vehicle_id=vehicle.id,
        spot_id=vehicle.spot_id,
        status=SessionStatus.queued,
        requested_energy_kwh=requested,
        priority_score=score,
        created_tick=current_tick,
        charge_rate_kw=CHARGE_RATE_KW,
    )
    updated_vehicle = vehicle.model_copy(update={
        "status": VehicleStatus.waiting,
        "assigned_robot_id": None,
        "requested_energy_kwh": requested,
        "target_battery": target,
        "priority": priority,
    })
    return updated_vehicle, session


def assign_robot(
    vehicle: Vehicle,
    decision: DispatchDecision,
    robots: list[Robot],
    sessions: list[ChargingSession],
) -> tuple[list[Robot], Vehicle, list[ChargingSession]]:
    robots = [
        r.model_copy(update={
            "status": RobotStatus.en_route,
            "assigned_vehicle_id": vehicle.id,
            "assigned_session_id": decision.session_id,
            "dock_bay_id": None,
            "fault_type": None,
            "route": decision.route,
            "route_index": 0,
        }) if r.id == decision.selected_robot_id else r
        for r in robots
    ]
    vehicle = vehicle.model_copy(update={
        "assigned_robot_id": decision.selected_robot_id,
        "status": VehicleStatus.assigned,
    })
    sessions = [
        s.model_copy(update={
            "status": SessionStatus.en_route,
            "robot_id": decision.selected_robot_id,
        }) if s.vehicle_id == vehicle.id and s.status in (
            SessionStatus.queued, SessionStatus.interrupted, SessionStatus.assigned
        ) else s
        for s in sessions
    ]
    return robots, vehicle, sessions


def start_charging(
    robot_id: str,
    vehicle_id: str,
    robots: list[Robot],
    vehicles: list[Vehicle],
    sessions: list[ChargingSession],
    current_tick: int,
    spots: list[ParkingSpot] | None = None,
) -> tuple[list[Robot], list[Vehicle], list[ChargingSession]]:
    vehicle = next((v for v in vehicles if v.id == vehicle_id), None)
    robot = next((r for r in robots if r.id == robot_id), None)
    if not vehicle or not robot or robot.status == RobotStatus.faulted:
        return robots, vehicles, sessions

    session = next(
        (s for s in sessions if s.vehicle_id == vehicle_id and s.status in (
            SessionStatus.queued, SessionStatus.assigned, SessionStatus.en_route,
            SessionStatus.interrupted, SessionStatus.active,
        )),
        None,
    )
    if session and session.status == SessionStatus.active and session.robot_id == robot_id:
        return robots, vehicles, sessions
    if session and session.status == SessionStatus.completed:
        return robots, vehicles, sessions
    if vehicle.status == VehicleStatus.completed:
        return robots, vehicles, sessions

    service = robot.position
    if spots and vehicle.spot_id:
        spot = next((s for s in spots if s.id == vehicle.spot_id), None)
        if spot:
            left = get_vehicle_service_point(spot, "left")
            right = get_vehicle_service_point(spot, "right")
            # Only snap to a bay the robot is already near — never jump across the car.
            near_left = calculate_distance(robot.position, left) <= ARRIVAL_DISTANCE_THRESHOLD * 2.0
            near_right = calculate_distance(robot.position, right) <= ARRIVAL_DISTANCE_THRESHOLD * 2.0
            if near_left and (not near_right or calculate_distance(robot.position, left) <= calculate_distance(robot.position, right)):
                service = left
            elif near_right:
                service = right
            else:
                service = robot.position

    robots = [
        r.model_copy(update={
            "status": RobotStatus.charging,
            "route": [],
            "route_index": 0,
            "position": service,
            "assigned_vehicle_id": vehicle_id,
            "assigned_session_id": session.id if session else r.assigned_session_id,
            "last_yield_tick": 0,
        }) if r.id == robot_id else r
        for r in robots
    ]
    vehicles = [
        v.model_copy(update={
            "status": VehicleStatus.charging,
            "assigned_robot_id": robot_id,
        }) if v.id == vehicle_id else v
        for v in vehicles
    ]
    sessions = [
        s.model_copy(update={
            "status": SessionStatus.active,
            "robot_id": robot_id,
            "started_tick": s.started_tick if s.started_tick is not None else current_tick,
        }) if s.vehicle_id == vehicle_id and s.status in (
            SessionStatus.queued, SessionStatus.assigned, SessionStatus.en_route,
            SessionStatus.interrupted, SessionStatus.active,
        ) else s
        for s in sessions
    ]
    return robots, vehicles, sessions


def complete_charging(
    robot_id: str,
    vehicle_id: str,
    robots: list[Robot],
    vehicles: list[Vehicle],
    sessions: list[ChargingSession],
    dock_bays: list[DockBay],
    blocked_lane: bool,
    current_tick: int,
) -> tuple[list[Robot], list[Vehicle], list[ChargingSession]]:
    vehicles = [
        v.model_copy(update={
            "status": VehicleStatus.completed,
            "assigned_robot_id": None,
            "completed_at_tick": current_tick,
        }) if v.id == vehicle_id else v
        for v in vehicles
    ]
    sessions = [
        s.model_copy(update={
            "status": SessionStatus.completed,
            "delivered_energy_kwh": round_kwh(s.requested_energy_kwh),
            "completed_tick": current_tick,
        }) if s.vehicle_id == vehicle_id and s.status == SessionStatus.active else s
        for s in sessions
    ]

    claimed = occupied_dock_ids(robots, exclude_robot_id=robot_id)
    bay = get_available_dock_bay(dock_bays, claimed, robot_id=robot_id)
    robot = next((r for r in robots if r.id == robot_id), None)

    def update_robot(r: Robot) -> Robot:
        if r.id != robot_id:
            return r
        if not bay or not robot:
            return r.model_copy(update={
                "status": RobotStatus.idle,
                "assigned_vehicle_id": None,
                "dock_bay_id": None,
                "route": [],
                "route_index": 0,
            })
        route = build_route_to_dock(robot.position, bay, blocked_lane)
        return r.model_copy(update={
            "status": RobotStatus.returning,
            "assigned_vehicle_id": None,
            "dock_bay_id": bay.id,
            "route": route,
            "route_index": 0,
        })

    robots = [update_robot(r) for r in robots]
    return robots, vehicles, sessions


def dock_robot(robot_id: str, robots: list[Robot], dock_bays: list[DockBay] | None = None) -> list[Robot]:
    def update(r: Robot) -> Robot:
        if r.id != robot_id:
            return r
        bay = None
        if dock_bays and r.dock_bay_id:
            bay = next((b for b in dock_bays if b.id == r.dock_bay_id), None)
        return r.model_copy(update={
            "status": RobotStatus.docked,
            "position": bay.position if bay else r.position,
            "route": [],
            "route_index": 0,
            "assigned_vehicle_id": None,
        })
    return [update(r) for r in robots]


def requeue_vehicle(
    vehicle_id: str,
    vehicles: list[Vehicle],
    sessions: list[ChargingSession],
) -> tuple[list[Vehicle], list[ChargingSession]]:
    vehicles = [
        v.model_copy(update={"status": VehicleStatus.waiting})
        if v.id == vehicle_id else v
        for v in vehicles
    ]
    sessions = [
        s.model_copy(update={"status": SessionStatus.queued})
        if s.vehicle_id == vehicle_id and s.status == SessionStatus.interrupted else s
        for s in sessions
    ]
    return vehicles, sessions


def vehicle_parks(vehicle: Vehicle, spot: ParkingSpot) -> tuple[Vehicle, ParkingSpot]:
    heading = 0 if spot.row == "top" else 180
    parked = vehicle.model_copy(update={
        "status": VehicleStatus.parked,
        "spot_id": spot.id,
        "position": spot.position,
        "route": [],
        "route_index": 0,
        "heading": heading,
    })
    updated_spot = spot.model_copy(update={
        "occupied_vehicle_id": vehicle.id,
        "reserved_vehicle_id": None,
    })
    return parked, updated_spot


def vehicle_departs(vehicle: Vehicle, spot: ParkingSpot, exit_route: list) -> tuple[Vehicle, ParkingSpot]:
    # Keep spot_id + occupancy until the car fully exits so nothing can spawn on top.
    leaving = vehicle.model_copy(update={
        "status": VehicleStatus.leaving,
        "route": exit_route,
        "route_index": 0,
        "spot_id": spot.id,
    })
    held = spot.model_copy(update={
        "occupied_vehicle_id": vehicle.id,
        "reserved_vehicle_id": None,
    })
    return leaving, held


def clear_spot_after_departure(spot: ParkingSpot, vehicle_id: str) -> ParkingSpot:
    if spot.occupied_vehicle_id != vehicle_id and spot.reserved_vehicle_id != vehicle_id:
        return spot
    return spot.model_copy(update={
        "occupied_vehicle_id": None if spot.occupied_vehicle_id == vehicle_id else spot.occupied_vehicle_id,
        "reserved_vehicle_id": None if spot.reserved_vehicle_id == vehicle_id else spot.reserved_vehicle_id,
    })
