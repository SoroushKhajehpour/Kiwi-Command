"""Garage routing helpers."""

from __future__ import annotations

import math
from typing import Literal

from app.config import GARAGE_ENTRANCE, GARAGE_EXIT, LANE_BLOCK_ZONE, LANE_CENTER_Y, METERS_PER_MAP_UNIT, ROBOT_METERS_PER_SECOND
from app.schemas import DockBay, ParkingSpot, Position, Robot, RobotStatus

ServiceSide = Literal["left", "right"]


def calculate_distance(a: Position, b: Position) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


def heading_to_first_segment(from_pos: Position, route: list[Position]) -> float:
    if not route:
        return 90.0
    degrees = math.degrees(math.atan2(route[0].x - from_pos.x, -(route[0].y - from_pos.y)))
    return degrees % 360


def _same_point(a: Position, b: Position) -> bool:
    return calculate_distance(a, b) < 0.01


def _clean_route(from_pos: Position, points: list[Position]) -> list[Position]:
    cleaned: list[Position] = []
    prev = from_pos
    for point in points:
        if not _same_point(point, prev):
            cleaned.append(point)
            prev = point
    return cleaned


def get_vehicle_service_point(spot: ParkingSpot, side: ServiceSide = "right") -> Position:
    """Lane-side service bays: left or right of the parked car (no overlap)."""
    y = 28 if spot.row == "top" else 72
    offset = -4.5 if side == "left" else 4.5
    return Position(x=spot.position.x + offset, y=y)


def choose_service_side(
    spot: ParkingSpot,
    robots: list[Robot],
    *,
    exclude_robot_id: str | None = None,
) -> ServiceSide:
    """Prefer the side that is not blocked by a faulted / stopped robot."""
    right = get_vehicle_service_point(spot, "right")
    left = get_vehicle_service_point(spot, "left")

    right_blocked = False
    left_blocked = False
    for robot in robots:
        if exclude_robot_id and robot.id == exclude_robot_id:
            continue
        if robot.status not in (RobotStatus.faulted, RobotStatus.charging, RobotStatus.en_route):
            continue
        if calculate_distance(robot.position, right) < 7.0:
            right_blocked = True
        if calculate_distance(robot.position, left) < 7.0:
            left_blocked = True

    if right_blocked and not left_blocked:
        return "left"
    if left_blocked and not right_blocked:
        return "right"
    if right_blocked and left_blocked:
        return "left"
    return "right"


def build_vehicle_entry_route(spot: ParkingSpot, entry: Position | None = None) -> list[Position]:
    start = entry or Position(**GARAGE_ENTRANCE)
    approach_y = 28 if spot.row == "top" else 72
    # Strict L-path: vertical into lane, horizontal, vertical into bay.
    return _clean_route(start, [
        Position(x=start.x, y=LANE_CENTER_Y),
        Position(x=spot.position.x, y=LANE_CENTER_Y),
        Position(x=spot.position.x, y=approach_y),
        spot.position,
    ])


def build_vehicle_exit_route(
    spot: ParkingSpot,
    exit_pos: Position | None = None,
    from_pos: Position | None = None,
) -> list[Position]:
    end = exit_pos or Position(**GARAGE_EXIT)
    start = from_pos or spot.position
    approach_y = 28 if spot.row == "top" else 72
    # Always leave vertically first (same x), then lane, then exit — never diagonal.
    return _clean_route(start, [
        Position(x=start.x, y=approach_y),
        Position(x=spot.position.x, y=approach_y),
        Position(x=spot.position.x, y=LANE_CENTER_Y),
        Position(x=end.x, y=LANE_CENTER_Y),
        end,
    ])


def _lane_crosses_block(from_x: float, to_x: float) -> bool:
    return min(from_x, to_x) < LANE_BLOCK_ZONE["x_max"] and max(from_x, to_x) > LANE_BLOCK_ZONE["x_min"]


def build_route_to_vehicle(
    from_pos: Position,
    spot: ParkingSpot,
    blocked_lane: bool = False,
    side: ServiceSide = "right",
) -> list[Position]:
    service = get_vehicle_service_point(spot, side)
    if blocked_lane and _lane_crosses_block(from_pos.x, service.x):
        return _clean_route(from_pos, [
            Position(x=from_pos.x, y=LANE_CENTER_Y),
            Position(x=30, y=LANE_CENTER_Y),
            Position(x=30, y=68),
            Position(x=service.x, y=68),
            service,
        ])
    return _clean_route(from_pos, [
        Position(x=from_pos.x, y=LANE_CENTER_Y),
        Position(x=service.x, y=LANE_CENTER_Y),
        service,
    ])


def build_route_to_dock(from_pos: Position, bay: DockBay, blocked_lane: bool = False) -> list[Position]:
    # Lane travel, then vertical approach into the row-aligned bay.
    approach_y = 28 if bay.position.y < LANE_CENTER_Y else 72
    return _clean_route(from_pos, [
        Position(x=from_pos.x, y=LANE_CENTER_Y),
        Position(x=bay.position.x, y=LANE_CENTER_Y),
        Position(x=bay.position.x, y=approach_y),
        bay.position,
    ])


def build_detour_around_robot(
    from_pos: Position,
    destination: Position,
    blocker: Position,
) -> list[Position]:
    """Smooth orthogonal peel-off: slide to a parallel corridor, then resume."""
    # Prefer the corridor farther from the blocker relative to main lane.
    if abs(blocker.y - LANE_CENTER_Y) < 6:
        detour_y = 36.0 if destination.y <= LANE_CENTER_Y else 64.0
    elif blocker.y < LANE_CENTER_Y:
        detour_y = 64.0
    else:
        detour_y = 36.0

    # Soft first step: only a few units toward the parallel lane (no teleport feel).
    step = 6.0 if detour_y > from_pos.y else -6.0
    mid_y = from_pos.y + step
    # Don't overshoot the corridor on the first move.
    if (step > 0 and mid_y > detour_y) or (step < 0 and mid_y < detour_y):
        mid_y = detour_y

    pass_x = blocker.x + (12.0 if destination.x >= from_pos.x else -12.0)
    pass_x = max(8.0, min(92.0, pass_x))

    return _clean_route(from_pos, [
        Position(x=from_pos.x, y=mid_y),
        Position(x=from_pos.x, y=detour_y),
        Position(x=pass_x, y=detour_y),
        Position(x=destination.x, y=detour_y),
        destination,
    ])


def calculate_route_distance(position: Position, route: list[Position], route_index: int = 0) -> float:
    cursor = position
    total = 0.0
    for waypoint in route[route_index:]:
        total += calculate_distance(cursor, waypoint)
        cursor = waypoint
    return total


def route_distance_meters(position: Position, route: list[Position], route_index: int = 0) -> float:
    return calculate_route_distance(position, route, route_index) * METERS_PER_MAP_UNIT


def eta_seconds_for_route(position: Position, route: list[Position], route_index: int = 0) -> float:
    return route_distance_meters(position, route, route_index) / ROBOT_METERS_PER_SECOND


def get_available_dock_bay(dock_bays: list[DockBay], occupied_ids: set[str], robot_id: str | None = None) -> DockBay | None:
    from app.config import ROBOT_HOME_DOCK

    if robot_id:
        home_id = ROBOT_HOME_DOCK.get(robot_id)
        if home_id and home_id not in occupied_ids:
            home = next((b for b in dock_bays if b.id == home_id), None)
            if home:
                return home
    for bay in dock_bays:
        if bay.id not in occupied_ids:
            return bay
    return None


def occupied_dock_ids(robots: list, exclude_robot_id: str | None = None) -> set[str]:
    """Bays held by docked / returning / idle robots (not en-route/charging)."""
    holding = {RobotStatus.docked, RobotStatus.returning, RobotStatus.idle, RobotStatus.faulted}
    occupied: set[str] = set()
    for robot in robots:
        if exclude_robot_id and robot.id == exclude_robot_id:
            continue
        if robot.dock_bay_id and robot.status in holding:
            occupied.add(robot.dock_bay_id)
    return occupied
