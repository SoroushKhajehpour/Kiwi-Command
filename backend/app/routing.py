"""Garage routing helpers."""

from __future__ import annotations

import math
from typing import Literal

from app.config import (
    BOTTOM_ROW_LANE_Y,
    BOTTOM_ROW_SERVICE_Y,
    GARAGE_ENTRANCE,
    GARAGE_EXIT,
    LANE_BLOCK_ZONE,
    LANE_CENTER_Y,
    METERS_PER_MAP_UNIT,
    ROBOT_METERS_PER_SECOND,
    TOP_ROW_LANE_Y,
    TOP_ROW_SERVICE_Y,
)
from app.schemas import DockBay, ParkingSpot, Position, Robot, RobotStatus

ServiceSide = Literal["left", "right"]


def calculate_distance(a: Position, b: Position) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


def aisle_y_for_row(row: str) -> float:
    return TOP_ROW_LANE_Y if row == "top" else BOTTOM_ROW_LANE_Y


def vehicle_lane_point(spot: ParkingSpot) -> Position:
    """Aisle waypoint at spot X — outside bay paint for lateral travel."""
    return Position(x=spot.position.x, y=aisle_y_for_row(spot.row))


def assert_orthogonal_route(route: list[Position]) -> bool:
    """True when consecutive waypoints share an axis (no diagonals)."""
    for i in range(1, len(route)):
        a, b = route[i - 1], route[i]
        if abs(a.x - b.x) > 0.05 and abs(a.y - b.y) > 0.05:
            return False
    return True


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
    """Stand beside the car on the lane edge — close enough for a short charge cable."""
    y = TOP_ROW_SERVICE_Y if spot.row == "top" else BOTTOM_ROW_SERVICE_Y
    offset = -3.2 if side == "left" else 3.2
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
        if calculate_distance(robot.position, right) < 5.0:
            right_blocked = True
        if calculate_distance(robot.position, left) < 5.0:
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
    lane = vehicle_lane_point(spot)
    # Strict L-path: main lane → aisle at spot x → plunge into bay.
    return _clean_route(start, [
        Position(x=start.x, y=LANE_CENTER_Y),
        Position(x=spot.position.x, y=LANE_CENTER_Y),
        lane,
        spot.position,
    ])


def build_vehicle_exit_route(
    spot: ParkingSpot,
    exit_pos: Position | None = None,
    from_pos: Position | None = None,
) -> list[Position]:
    end = exit_pos or Position(**GARAGE_EXIT)
    start = from_pos or spot.position
    lane = vehicle_lane_point(spot)
    # Always leave vertically to aisle first — never sideways through neighbor stalls.
    return _clean_route(start, [
        Position(x=start.x, y=lane.y),
        lane,
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
    # Lane travel, then vertical approach into the bay.
    approach_y = TOP_ROW_LANE_Y if bay.position.y < LANE_CENTER_Y else BOTTOM_ROW_LANE_Y
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
    """Orthogonal peel-off: leave the blocker’s lane, pass, then resume."""
    # Prefer the corridor farther from the blocker relative to main lane.
    if abs(blocker.y - LANE_CENTER_Y) < 6:
        detour_y = 36.0 if destination.y <= LANE_CENTER_Y else 64.0
    elif blocker.y < LANE_CENTER_Y:
        detour_y = 64.0
    else:
        detour_y = 36.0

    # When already overlapping / nose-to-nose, take a longer first step so
    # the next tick actually clears the car envelope instead of soft-holding.
    close = calculate_distance(from_pos, blocker) < 7.0
    step_size = 12.0 if close else 6.0
    step = step_size if detour_y > from_pos.y else -step_size
    mid_y = from_pos.y + step
    if (step > 0 and mid_y > detour_y) or (step < 0 and mid_y < detour_y):
        mid_y = detour_y

    # Pass well clear of the vehicle footprint (cars are ~8 wide).
    pass_x = blocker.x + (16.0 if destination.x >= from_pos.x else -16.0)
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
