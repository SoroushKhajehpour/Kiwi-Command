"""Dispatch priority queue and robot selection."""

from __future__ import annotations

from app.routing import build_route_to_dock, build_route_to_vehicle, choose_service_side, eta_seconds_for_route, route_distance_meters
from app.schemas import (
    ChargingSession,
    DispatchDecision,
    DockBay,
    ParkingSpot,
    RejectedRobot,
    Robot,
    RobotStatus,
    SessionStatus,
    Vehicle,
    VehiclePriority,
    VehicleStatus,
)

ROBOT_CAPACITY_KWH = 100
RESERVE_PERCENT = 10
DELIVERY_EFFICIENCY = 0.9
TRAVEL_KWH_PER_METER = 0.01


def calculate_vehicle_priority(vehicle: Vehicle, current_tick: int) -> VehiclePriority:
    departure_soon = vehicle.expected_departure_tick - current_tick
    if vehicle.battery < 20 or (departure_soon <= 10 and vehicle.requested_energy_kwh > 15):
        return VehiclePriority.urgent
    if vehicle.battery < 45 or vehicle.requested_energy_kwh >= 15:
        return VehiclePriority.normal
    return VehiclePriority.low


def calculate_job_priority(session: ChargingSession, vehicle: Vehicle, current_tick: int) -> tuple[float, list[str]]:
    wait_minutes = max(0, current_tick - session.created_tick)
    departure_minutes = max(0, vehicle.expected_departure_tick - current_tick)
    reasons: list[str] = []
    score = 0.0

    if vehicle.battery < 15:
        score += 100
        reasons.append(f"{round(vehicle.battery)}% battery (critical)")
    elif vehicle.battery < 25:
        score += 70
        reasons.append(f"{round(vehicle.battery)}% battery")
    elif vehicle.battery < 40:
        score += 40
        reasons.append(f"{round(vehicle.battery)}% battery")
    else:
        score += 10
        reasons.append(f"{round(vehicle.battery)}% battery")

    if departure_minutes <= 10:
        score += 80
        reasons.append(f"departure in {departure_minutes} simulated min")
    elif departure_minutes <= 20:
        score += 40
        reasons.append(f"departure in {departure_minutes} simulated min")
    elif departure_minutes <= 40:
        score += 20
        reasons.append(f"departure in {departure_minutes} simulated min")

    if wait_minutes > 0:
        score += wait_minutes * 2
        reasons.append(f"waited {wait_minutes} min")

    requested = vehicle.requested_energy_kwh or session.requested_energy_kwh
    if requested > 0:
        reasons.append(f"requested {requested:.1f} kWh")
    if 0 < requested <= 12:
        score += 10
        reasons.append("quick-win energy size")
    elif requested > 30:
        score -= 10
        reasons.append("large energy request")

    if vehicle.priority == VehiclePriority.urgent:
        reasons.append("urgent priority")

    return score, reasons


def _status_rejection(robot: Robot) -> str | None:
    if robot.status == RobotStatus.faulted:
        return "faulted"
    if robot.assigned_vehicle_id:
        return f"already assigned to {robot.assigned_vehicle_id}"
    if robot.status == RobotStatus.charging:
        return "already charging"
    if robot.status == RobotStatus.returning:
        return "returning to dock"
    if robot.status == RobotStatus.en_route:
        return "already en route"
    if robot.status not in (RobotStatus.idle, RobotStatus.docked):
        return "unavailable"
    if robot.battery < 20:
        return f"battery critical at {round(robot.battery)}%"
    return None


def _deliverable_kwh(robot: Robot, travel_meters: float) -> float:
    usable = max(0, robot.battery - RESERVE_PERCENT) / 100 * ROBOT_CAPACITY_KWH
    return usable * DELIVERY_EFFICIENCY - travel_meters * TRAVEL_KWH_PER_METER


def select_next_job(
    vehicles: list[Vehicle],
    sessions: list[ChargingSession],
    current_tick: int,
) -> tuple[Vehicle, ChargingSession, list[str]] | None:
    queued = [s for s in sessions if s.status in (SessionStatus.queued, SessionStatus.interrupted)]
    ranked: list[tuple[float, list[str], Vehicle, ChargingSession]] = []

    for session in queued:
        vehicle = next((v for v in vehicles if v.id == session.vehicle_id), None)
        if not vehicle or vehicle.status not in (VehicleStatus.waiting, VehicleStatus.backup_needed):
            continue
        score, reasons = calculate_job_priority(session, vehicle, current_tick)
        ranked.append((score, reasons, vehicle, session))

    if not ranked:
        return None
    ranked.sort(key=lambda item: item[0], reverse=True)
    score, reasons, vehicle, session = ranked[0]
    session = session.model_copy(update={"priority_score": score})
    return vehicle, session, reasons


def select_best_robot(
    vehicle: Vehicle,
    session: ChargingSession,
    robots: list[Robot],
    spots: list[ParkingSpot],
    dock_bays: list[DockBay],
    blocked_lane: bool,
    job_reasons: list[str] | None = None,
) -> DispatchDecision | None:
    if not vehicle.spot_id:
        return None
    spot = next((s for s in spots if s.id == vehicle.spot_id), None)
    if not spot:
        return None

    requested = vehicle.requested_energy_kwh or session.requested_energy_kwh or 22.0
    rejected: list[RejectedRobot] = []
    eligible: list[tuple[Robot, list, float, float, float, float]] = []

    for robot in robots:
        reason = _status_rejection(robot)
        if reason:
            rejected.append(RejectedRobot(robot_id=robot.id, reason=reason))
            continue

        side = choose_service_side(spot, robots, exclude_robot_id=robot.id)
        route = build_route_to_vehicle(robot.position, spot, blocked_lane, side=side)
        distance = route_distance_meters(robot.position, route)
        return_dist = min(
            route_distance_meters(spot.service_point, build_route_to_dock(spot.service_point, bay, blocked_lane))
            for bay in dock_bays
        ) if dock_bays else 0
        deliverable = _deliverable_kwh(robot, distance + return_dist)
        if deliverable < requested:
            rejected.append(RejectedRobot(robot_id=robot.id, reason=f"insufficient energy ({deliverable:.1f} kWh available)"))
            continue

        energy_penalty = 12 if deliverable < requested + 4 else 0
        battery_penalty = 50 if robot.battery < 35 else 20 if robot.battery < 50 else 0
        dist_weight = 1.6 if vehicle.priority == VehiclePriority.urgent else 1.2
        priority_adj = -8 if vehicle.priority == VehiclePriority.urgent else 0
        score = distance * dist_weight + return_dist * 0.25 + battery_penalty + energy_penalty + priority_adj
        eta = eta_seconds_for_route(robot.position, route)
        eligible.append((robot, route, distance, eta, score, robot.battery))

    eligible.sort(key=lambda item: item[4])
    if not eligible:
        return None

    selected_robot, route, distance, eta, score, battery = eligible[0]
    for robot, _, dist, _, _, bat in eligible[1:]:
        rejected.append(RejectedRobot(robot_id=robot.id, reason=f"higher route cost ({round(dist)}m, {round(bat)}% battery)"))

    eta_min = int(eta // 60)
    eta_sec = int(eta % 60)
    eta_label = f"{eta_min}m {eta_sec}s" if eta_sec else f"{eta_min}m"

    return DispatchDecision(
        vehicle_id=vehicle.id,
        session_id=session.id,
        selected_robot_id=selected_robot.id,
        selected_score=score,
        distance_meters=distance,
        eta_seconds=eta,
        reasons=[
            f"{round(distance)}m route to {vehicle.spot_id}",
            f"ETA {eta_label}",
            f"{round(battery)}% battery",
            f"Ready in {selected_robot.dock_bay_id}" if selected_robot.status == RobotStatus.docked else "Idle and unassigned",
            f"Can complete {requested:.1f} kWh and return to dock",
        ],
        rejected_robots=rejected,
        job_priority_reasons=job_reasons or [],
        route=route,
    )
