"""Robot and vehicle movement with smooth collision avoidance."""

from __future__ import annotations

import math

from app.config import (
    ARRIVAL_DISTANCE_THRESHOLD,
    MAX_YIELD_TICKS,
    ROBOT_AVOID_DISTANCE,
    ROBOT_COLLISION_RADIUS,
    ROBOT_MAP_UNITS_PER_SECOND,
    ROBOT_SLOW_DISTANCE,
    VEHICLE_COLLISION_RADIUS,
    VEHICLE_MAP_UNITS_PER_SECOND,
)
from app.routing import build_detour_around_robot
from app.schemas import Position, Robot, RobotStatus, Vehicle, VehicleStatus

# After adopting a detour, don't thrash routes every tick.
DETOUR_COOLDOWN_TICKS = 24


def heading_to(from_pos: Position, to_pos: Position) -> float:
    degrees = math.degrees(math.atan2(to_pos.x - from_pos.x, -(to_pos.y - from_pos.y)))
    return degrees % 360


def has_reached_position(current: Position, target: Position, threshold: float = ARRIVAL_DISTANCE_THRESHOLD) -> bool:
    return math.hypot(current.x - target.x, current.y - target.y) <= threshold


def _next_orthogonal_target(pos: Position, waypoint: Position, prefer_vertical: bool = False) -> Position:
    """Force lane-style movement: finish one axis before the other (no diagonals)."""
    dx = waypoint.x - pos.x
    dy = waypoint.y - pos.y
    if abs(dx) > 0.05 and abs(dy) > 0.05:
        if prefer_vertical:
            return Position(x=pos.x, y=waypoint.y)
        return Position(x=waypoint.x, y=pos.y)
    return waypoint


def _advance_along_route(
    position: Position,
    route_index: int,
    route: list[Position],
    heading: float,
    speed: float,
    elapsed: float,
    *,
    prefer_vertical: bool = False,
    single_axis_per_tick: bool = False,
) -> tuple[Position, int, float, bool]:
    if not route or route_index >= len(route):
        return position, max(route_index, len(route)), heading, True

    pos = position
    idx = route_index
    budget = speed * elapsed
    hdg = heading
    moved_axis = False

    while budget > 0 and idx < len(route):
        waypoint = route[idx]
        target = _next_orthogonal_target(pos, waypoint, prefer_vertical=prefer_vertical)
        dist = math.hypot(target.x - pos.x, target.y - pos.y)
        if dist < 0.001:
            if has_reached_position(pos, waypoint, ARRIVAL_DISTANCE_THRESHOLD * 0.5):
                pos = waypoint
                idx += 1
                if single_axis_per_tick and moved_axis:
                    break
                continue
            target = waypoint
            dist = math.hypot(target.x - pos.x, target.y - pos.y)
            if dist < 0.001:
                pos = waypoint
                idx += 1
                if single_axis_per_tick and moved_axis:
                    break
                continue

        hdg = heading_to(pos, target)
        if dist <= budget or dist <= ARRIVAL_DISTANCE_THRESHOLD * 0.35:
            pos = target
            budget -= dist
            moved_axis = True
            if has_reached_position(pos, waypoint, ARRIVAL_DISTANCE_THRESHOLD * 0.5):
                pos = waypoint
                idx += 1
            if single_axis_per_tick:
                break
        else:
            ratio = budget / dist if dist else 1
            pos = Position(
                x=pos.x + (target.x - pos.x) * ratio,
                y=pos.y + (target.y - pos.y) * ratio,
            )
            budget = 0
            moved_axis = True

    arrived = idx >= len(route)
    if not arrived and route:
        final = route[-1]
        if idx >= len(route) - 1 and has_reached_position(pos, final):
            return final, len(route), hdg, True

    return pos, idx, hdg, arrived


def _robot_separation(a: Position, b: Position) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


def _nearest_blocking_robot(
    position: Position,
    robot_id: str,
    robots: list[Robot],
    *,
    radius: float,
) -> Robot | None:
    nearest: Robot | None = None
    nearest_dist = float("inf")
    for robot in robots:
        if robot.id == robot_id:
            continue
        if robot.status in (RobotStatus.docked, RobotStatus.idle):
            continue
        dist = _robot_separation(position, robot.position)
        soft = ROBOT_COLLISION_RADIUS * 2.6 if robot.status == RobotStatus.faulted else radius
        if dist < soft and dist < nearest_dist:
            nearest = robot
            nearest_dist = dist
    return nearest


def _should_yield_to(robot: Robot, other: Robot) -> bool:
    """Deterministic courtesy: lower id continues; higher id yields/diverts."""
    if other.status == RobotStatus.faulted:
        return True
    if other.status not in (RobotStatus.en_route, RobotStatus.returning):
        return False
    return robot.id > other.id


def _can_adopt_detour(robot: Robot, current_tick: int) -> bool:
    if not robot.last_yield_tick:
        return True
    return current_tick - robot.last_yield_tick >= DETOUR_COOLDOWN_TICKS


def is_position_safe_for_robot(
    position: Position,
    robot_id: str,
    robots: list[Robot],
    vehicles: list[Vehicle],
    *,
    ignore_vehicle_id: str | None = None,
    final_approach: bool = False,
) -> bool:
    min_sep = ROBOT_COLLISION_RADIUS * (1.5 if final_approach else 2.2)
    for robot in robots:
        if robot.id == robot_id:
            continue
        if robot.status in (RobotStatus.docked, RobotStatus.idle):
            continue
        if robot.status == RobotStatus.faulted:
            if _robot_separation(position, robot.position) < ROBOT_COLLISION_RADIUS * 2.5:
                return False
            continue
        if _robot_separation(position, robot.position) < min_sep:
            return False

    for vehicle in vehicles:
        if vehicle.status == VehicleStatus.departed:
            continue
        if ignore_vehicle_id and vehicle.id == ignore_vehicle_id:
            continue
        if _robot_separation(position, vehicle.position) < ROBOT_COLLISION_RADIUS + VEHICLE_COLLISION_RADIUS:
            return False
    return True


def is_position_safe_for_vehicle(position: Position, vehicle_id: str, robots: list[Robot], vehicles: list[Vehicle]) -> bool:
    for robot in robots:
        if robot.status in (RobotStatus.docked, RobotStatus.idle):
            continue
        if robot.status == RobotStatus.faulted:
            continue
        if _robot_separation(position, robot.position) < ROBOT_COLLISION_RADIUS + VEHICLE_COLLISION_RADIUS:
            return False
    for vehicle in vehicles:
        if vehicle.id == vehicle_id or vehicle.status == VehicleStatus.departed:
            continue
        if _robot_separation(position, vehicle.position) < VEHICLE_COLLISION_RADIUS * 2:
            return False
    return True


def _approach_speed_scale(robot: Robot, robots: list[Robot]) -> float:
    """Ease speed down as another robot gets close — no hard freezes when avoidable."""
    nearest = float("inf")
    for other in robots:
        if other.id == robot.id:
            continue
        if other.status in (RobotStatus.docked, RobotStatus.idle):
            continue
        nearest = min(nearest, _robot_separation(robot.position, other.position))
    if nearest >= ROBOT_SLOW_DISTANCE:
        return 1.0
    if nearest <= ROBOT_AVOID_DISTANCE:
        return 0.28
    t = (nearest - ROBOT_AVOID_DISTANCE) / (ROBOT_SLOW_DISTANCE - ROBOT_AVOID_DISTANCE)
    return 0.28 + 0.72 * t


def _try_detour(
    robot: Robot,
    final: Position,
    blocker: Robot,
    robots: list[Robot],
    vehicles: list[Vehicle],
    ignore_vehicle_id: str | None,
    current_tick: int,
) -> Robot | None:
    if not _can_adopt_detour(robot, current_tick):
        return None
    detour = build_detour_around_robot(robot.position, final, blocker.position)
    if not detour:
        return None
    first = detour[0]
    if not is_position_safe_for_robot(
        first, robot.id, robots, vehicles, ignore_vehicle_id=ignore_vehicle_id,
    ):
        return None
    return robot.model_copy(update={
        "route": detour,
        "route_index": 0,
        "heading": heading_to(robot.position, first),
        # Mark cooldown start so we don't replan every tick.
        "last_yield_tick": current_tick,
        "speed_mps": 1.0,
    })


def advance_robot(
    robot: Robot,
    elapsed: float,
    robots: list[Robot],
    vehicles: list[Vehicle],
    current_tick: int,
) -> tuple[Robot, bool, bool]:
    """Returns (robot, arrived, yielded). Never overlaps — divert smoothly instead."""
    if robot.status not in (RobotStatus.en_route, RobotStatus.returning):
        return robot, bool(robot.route) and robot.route_index >= len(robot.route), False

    if not robot.route or robot.route_index >= len(robot.route):
        return robot, True, False

    final = robot.route[-1]
    near_final = has_reached_position(robot.position, final, ARRIVAL_DISTANCE_THRESHOLD * 2.5)
    ignore_vehicle = robot.assigned_vehicle_id if robot.status == RobotStatus.en_route else None

    nearby = _nearest_blocking_robot(
        robot.position, robot.id, robots, radius=ROBOT_AVOID_DISTANCE,
    )

    # Courtesy robot peels off early onto a parallel corridor — no freeze-then-jump.
    if nearby is not None and _should_yield_to(robot, nearby):
        diverted = _try_detour(
            robot, final, nearby, robots, vehicles, ignore_vehicle, current_tick,
        )
        if diverted is not None:
            return diverted, False, False

    speed_scale = _approach_speed_scale(robot, robots)
    # Non-yielding robot still eases off near traffic.
    if nearby is not None and not _should_yield_to(robot, nearby):
        speed_scale = min(speed_scale, 0.75)

    speed = ROBOT_MAP_UNITS_PER_SECOND * speed_scale

    preview_pos, _, _, _ = _advance_along_route(
        robot.position, robot.route_index, robot.route, robot.heading,
        speed, elapsed,
    )

    safe = is_position_safe_for_robot(
        preview_pos,
        robot.id,
        robots,
        vehicles,
        ignore_vehicle_id=ignore_vehicle,
        final_approach=near_final,
    )

    if not safe:
        yield_started = robot.last_yield_tick or current_tick
        blocked_ticks = current_tick - yield_started if robot.last_yield_tick else 0
        blocker = _nearest_blocking_robot(
            preview_pos, robot.id, robots, radius=ROBOT_COLLISION_RADIUS * 2.8,
        ) or nearby

        if blocker is not None and (
            blocked_ticks >= MAX_YIELD_TICKS
            or blocker.status == RobotStatus.faulted
            or _should_yield_to(robot, blocker)
        ):
            diverted = _try_detour(
                robot, final, blocker, robots, vehicles, ignore_vehicle, current_tick,
            )
            if diverted is not None:
                return diverted, False, False

        # Soft hold only when no safe detour yet — never tunnel through.
        return robot.model_copy(update={
            "last_yield_tick": yield_started if robot.last_yield_tick else current_tick,
            "speed_mps": 0.0,
        }), False, True

    pos, idx, hdg, arrived = _advance_along_route(
        robot.position, robot.route_index, robot.route, robot.heading,
        speed, elapsed,
    )

    if not is_position_safe_for_robot(
        pos, robot.id, robots, vehicles,
        ignore_vehicle_id=ignore_vehicle,
        final_approach=near_final or arrived,
    ):
        return robot.model_copy(update={
            "last_yield_tick": robot.last_yield_tick or current_tick,
            "speed_mps": 0.0,
        }), False, True

    if not arrived and has_reached_position(pos, final):
        pos = final
        idx = len(robot.route)
        arrived = True

    return robot.model_copy(update={
        "position": pos,
        "route_index": idx,
        "heading": hdg,
        "status": robot.status,
        "speed_mps": 1.4 * speed_scale,
        "last_telemetry_tick": current_tick,
        # Clear cooldown once traffic is clear and moving again.
        "last_yield_tick": 0 if (nearby is None and safe) else robot.last_yield_tick,
    }), arrived, False


def advance_vehicle(
    vehicle: Vehicle,
    elapsed: float,
    robots: list[Robot],
    vehicles: list[Vehicle],
    current_tick: int = 0,
) -> tuple[Vehicle, bool, bool]:
    if vehicle.status not in (VehicleStatus.entering, VehicleStatus.parking, VehicleStatus.leaving):
        return vehicle, vehicle.route_index >= len(vehicle.route), False
    if not vehicle.route or vehicle.route_index >= len(vehicle.route):
        return vehicle, True, False

    preview_pos, _, _, _ = _advance_along_route(
        vehicle.position, vehicle.route_index, vehicle.route, vehicle.heading,
        VEHICLE_MAP_UNITS_PER_SECOND, elapsed,
        prefer_vertical=True,
        single_axis_per_tick=True,
    )
    blocked_by_car = False
    for other in vehicles:
        if other.id == vehicle.id or other.status == VehicleStatus.departed:
            continue
        if other.status not in (VehicleStatus.entering, VehicleStatus.parking, VehicleStatus.leaving):
            continue
        if _robot_separation(preview_pos, other.position) < VEHICLE_COLLISION_RADIUS * 1.8:
            blocked_by_car = True
            break
    if blocked_by_car:
        return vehicle, False, True

    pos, idx, hdg, arrived = _advance_along_route(
        vehicle.position, vehicle.route_index, vehicle.route, vehicle.heading,
        VEHICLE_MAP_UNITS_PER_SECOND, elapsed,
        prefer_vertical=True,
        single_axis_per_tick=True,
    )

    if not arrived and vehicle.route:
        final = vehicle.route[-1]
        if has_reached_position(pos, final):
            pos = final
            idx = len(vehicle.route)
            arrived = True

    return vehicle.model_copy(update={"position": pos, "route_index": idx, "heading": hdg}), arrived, False
