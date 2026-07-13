"""Main simulation tick loop."""

from __future__ import annotations

import random

from app.charging import advance_charging, estimate_requested_energy, should_request_charge
from app.config import (
    ARRIVAL_DISTANCE_THRESHOLD,
    COMPLETED_DWELL_TICKS,
    DEMO_FAULT_AFTER_CHARGE_TICKS,
    INVARIANT_CHECK_INTERVAL_TICKS,
    LANE_BLOCK_ZONE,
    LOW_ROBOT_BATTERY_THRESHOLD,
    MAX_ACTIVE_VEHICLES,
    SIMULATION_TIME_SCALE,
    SPAWN_INTERVAL_MAX_TICKS,
    SPAWN_INTERVAL_MIN_TICKS,
    SPAWN_RETRY_COOLDOWN_TICKS,
    YIELD_EVENT_COOLDOWN_TICKS,
)
from app.demo_scenario import DEMO_VEHICLE_SPAWN_PLAN
from app.dispatch import select_best_robot, select_next_job
from app.events import add_event, add_event_once, add_event_with_cooldown
from app.faults import apply_fault
from app.movement import advance_robot, advance_vehicle
from app.routing import (
    assert_orthogonal_route,
    build_route_to_dock,
    build_vehicle_entry_route,
    build_vehicle_exit_route,
    calculate_distance,
    get_available_dock_bay,
    occupied_dock_ids,
)
from app.schemas import DemoMode, FaultType, Robot, RobotStatus, SessionStatus, VehicleStatus
from app.state import AppState
from app.state_transitions import (
    assign_robot,
    clear_spot_after_departure,
    complete_charging,
    dock_robot,
    requeue_vehicle,
    request_charge,
    start_charging,
    vehicle_departs,
    vehicle_parks,
)
from app.vehicle_spawn import (
    count_active_vehicles,
    find_available_spot,
    find_spot_by_id,
    get_available_planned_or_fallback_spot,
    reserve_spot,
    should_skip_arrival,
    spawn_vehicle,
)


def _update_spot(state: AppState, spot_id: str, updated) -> None:
    state.parking_spots = [
        updated if s.id == spot_id else s for s in state.parking_spots
    ]


def _format_eta(seconds: float | None) -> str:
    total = max(0, int(round(seconds or 0)))
    minutes, secs = divmod(total, 60)
    if minutes <= 0:
        return f"{secs}s"
    return f"{minutes}m {secs:02d}s"


def _maybe_spawn_vehicle(state: AppState) -> None:
    if state.demo_mode != DemoMode.running:
        return
    if state.tick < state.next_spawn_tick:
        return

    active = count_active_vehicles(state.vehicles)
    if active >= MAX_ACTIVE_VEHICLES or should_skip_arrival(state.vehicles, state.parking_spots):
        state.next_spawn_tick = state.tick + SPAWN_RETRY_COOLDOWN_TICKS
        return

    entrance_busy = any(
        v.status in (VehicleStatus.entering, VehicleStatus.parking)
        for v in state.vehicles
    )
    if entrance_busy:
        state.next_spawn_tick = state.tick + SPAWN_RETRY_COOLDOWN_TICKS
        return

    # Never spawn while a car is physically exiting a bay (prevents overlap).
    if any(v.status == VehicleStatus.leaving for v in state.vehicles):
        state.next_spawn_tick = state.tick + SPAWN_RETRY_COOLDOWN_TICKS
        return

    plan = None
    target = None

    if state.spawn_plan_index < len(DEMO_VEHICLE_SPAWN_PLAN):
        candidate = DEMO_VEHICLE_SPAWN_PLAN[state.spawn_plan_index]
        if state.tick < candidate["spawn_at_tick"]:
            state.next_spawn_tick = candidate["spawn_at_tick"]
            return

        already = any(v.id == candidate["id"] for v in state.vehicles)
        if already:
            state.spawn_plan_index += 1
            state.next_spawn_tick = state.tick + SPAWN_RETRY_COOLDOWN_TICKS
            return

        # Planned bay taken → fallback to any free spot (do not skip forever).
        target = get_available_planned_or_fallback_spot(
            candidate["spot_id"], state.parking_spots, state.vehicles,
        )
        if target:
            plan = candidate
        else:
            state.next_spawn_tick = state.tick + SPAWN_RETRY_COOLDOWN_TICKS
            return
    else:
        target = find_available_spot(state.parking_spots, state.vehicles)

    if not target:
        state.next_spawn_tick = state.tick + SPAWN_RETRY_COOLDOWN_TICKS
        return

    vehicle_id = plan["id"] if plan else state.new_vehicle_id()
    vehicle = spawn_vehicle(target, state.tick, vehicle_id, plan=plan)
    reserved = reserve_spot(target, vehicle.id)
    if not reserved:
        state.next_spawn_tick = state.tick + SPAWN_RETRY_COOLDOWN_TICKS
        return
    _update_spot(state, target.id, reserved)
    state.vehicles.append(vehicle)
    state.spawn_count += 1
    if plan:
        state.spawn_plan_index += 1
        if plan["id"] == "EV-4466":
            state.scripted_vehicle_id = vehicle.id

    state.events = add_event_once(
        state.events,
        state.event_keys,
        f"entered:{vehicle.id}",
        state.tick,
        f"{vehicle.id} entered garage.",
        "arrival",
        related_vehicle_id=vehicle.id,
    )

    if state.spawn_plan_index < len(DEMO_VEHICLE_SPAWN_PLAN):
        state.next_spawn_tick = DEMO_VEHICLE_SPAWN_PLAN[state.spawn_plan_index]["spawn_at_tick"]
    else:
        state.next_spawn_tick = state.tick + SPAWN_INTERVAL_MIN_TICKS + random.randint(
            0, SPAWN_INTERVAL_MAX_TICKS - SPAWN_INTERVAL_MIN_TICKS
        )


def tick(state: AppState, elapsed_seconds: float) -> None:
    is_running = state.demo_mode == DemoMode.running
    is_ending = state.demo_mode == DemoMode.ended
    is_simulating = is_running or is_ending

    if is_running:
        state.tick += int(elapsed_seconds * SIMULATION_TIME_SCALE)

    if is_running:
        _maybe_spawn_vehicle(state)

    # Move vehicles
    if is_running:
        updated_vehicles = []
        for vehicle in state.vehicles:
            if vehicle.status == VehicleStatus.departed:
                continue
            if vehicle.status not in (VehicleStatus.entering, VehicleStatus.parking, VehicleStatus.leaving):
                updated_vehicles.append(vehicle)
                continue

            moved, arrived, yielded = advance_vehicle(
                vehicle, elapsed_seconds, state.robots, state.vehicles, state.tick,
            )
            if yielded:
                updated_vehicles.append(vehicle)
                continue

            updated = moved

            # Free bay once the leaving car reaches the aisle (first exit waypoint).
            if (
                vehicle.status == VehicleStatus.leaving
                and vehicle.spot_id
                and updated.route_index >= 1
            ):
                spot = find_spot_by_id(state.parking_spots, vehicle.spot_id)
                if spot and (spot.occupied_vehicle_id == vehicle.id or spot.reserved_vehicle_id == vehicle.id):
                    _update_spot(state, spot.id, clear_spot_after_departure(spot, vehicle.id))
                updated = updated.model_copy(update={"spot_id": None})

            if arrived:
                if vehicle.status == VehicleStatus.entering:
                    entry_spot = find_spot_by_id(state.parking_spots, vehicle.spot_id or "")
                    can_park = bool(
                        entry_spot
                        and (entry_spot.occupied_vehicle_id is None or entry_spot.occupied_vehicle_id == vehicle.id)
                        and (entry_spot.reserved_vehicle_id is None or entry_spot.reserved_vehicle_id == vehicle.id)
                    )
                    if can_park and entry_spot:
                        result = vehicle_parks(updated, entry_spot)
                        if result:
                            parked, spot = result
                            updated = parked
                            _update_spot(state, entry_spot.id, spot)
                            state.events = add_event_once(
                                state.events,
                                state.event_keys,
                                f"parked:{vehicle.id}",
                                state.tick,
                                f"{vehicle.id} parked at {entry_spot.id} with {round(vehicle.battery)}% battery.",
                                "arrival",
                                related_vehicle_id=vehicle.id,
                            )
                        else:
                            # Occupied by another — rebuild entry toward any free spot.
                            alt = find_available_spot(state.parking_spots, state.vehicles)
                            if alt:
                                reserved = reserve_spot(alt, vehicle.id)
                                if reserved:
                                    _update_spot(state, alt.id, reserved)
                                    route = build_vehicle_entry_route(alt, updated.position)
                                    updated = updated.model_copy(update={
                                        "spot_id": alt.id,
                                        "route": route,
                                        "route_index": 0,
                                    })
                elif vehicle.status == VehicleStatus.leaving:
                    updated = updated.model_copy(update={
                        "status": VehicleStatus.departed,
                        "spot_id": None,
                        "route": [],
                        "route_index": 0,
                    })
                    if vehicle.spot_id:
                        spot = find_spot_by_id(state.parking_spots, vehicle.spot_id)
                        if spot:
                            _update_spot(
                                state,
                                spot.id,
                                clear_spot_after_departure(spot, vehicle.id),
                            )
                    state.events = add_event_once(
                        state.events,
                        state.event_keys,
                        f"departed:{vehicle.id}",
                        state.tick,
                        f"{vehicle.id} departed garage.",
                        "departure",
                        related_vehicle_id=vehicle.id,
                    )
                    updated_vehicles.append(updated)
                    continue

            updated_vehicles.append(updated)
        state.vehicles = updated_vehicles

    # Auto charge requests
    if is_running:
        queue_depth = sum(
            1 for s in state.sessions
            if s.status in (SessionStatus.queued, SessionStatus.interrupted)
        )
        for vehicle in state.vehicles:
            if vehicle.status != VehicleStatus.parked:
                continue
            # Keep robots free for EV-4466 fault → backup until backup is assigned.
            if (
                state.scripted_vehicle_id
                and not state.backup_assigned
                and vehicle.id != state.scripted_vehicle_id
            ):
                continue
            if not should_request_charge(vehicle, state.tick, queue_depth):
                continue
            active = any(
                s.vehicle_id == vehicle.id and s.status in (
                    SessionStatus.queued, SessionStatus.assigned, SessionStatus.en_route,
                    SessionStatus.active, SessionStatus.interrupted,
                )
                for s in state.sessions
            )
            if active:
                continue
            energy = estimate_requested_energy(vehicle, manual=False)
            result = request_charge(
                vehicle, state.sessions, state.tick, energy, queue_depth=queue_depth, manual=False,
            )
            if result:
                updated_vehicle, session = result
                state.vehicles = [updated_vehicle if v.id == vehicle.id else v for v in state.vehicles]
                state.sessions = [session, *state.sessions]
                queue_depth += 1
                priority_label = updated_vehicle.priority.value
                state.events = add_event_once(
                    state.events,
                    state.event_keys,
                    f"request:{vehicle.id}:{session.id}",
                    state.tick,
                    f"{vehicle.id} requested {session.requested_energy_kwh:.1f} kWh "
                    f"({round(updated_vehicle.battery)}% → {round(updated_vehicle.target_battery)}%). "
                    f"Priority: {priority_label}.",
                    "request",
                    related_vehicle_id=vehicle.id,
                    related_session_id=session.id,
                )

    # Departures
    if is_running:
        already_leaving = any(v.status == VehicleStatus.leaving for v in state.vehicles)
        for vehicle in list(state.vehicles):
            if already_leaving:
                break
            spot = next((s for s in state.parking_spots if s.id == vehicle.spot_id), None)
            if not spot:
                continue

            departure_due = state.tick >= vehicle.expected_departure_tick
            completed_dwell = (
                vehicle.status == VehicleStatus.completed
                and vehicle.completed_at_tick is not None
                and state.tick - vehicle.completed_at_tick >= COMPLETED_DWELL_TICKS
            )
            # Overnight cars only leave after charge completion dwell, not early random exits.
            should_leave = (
                (vehicle.status == VehicleStatus.completed and completed_dwell)
                or (departure_due and vehicle.status == VehicleStatus.parked and vehicle.battery >= 70)
            )
            if not should_leave or vehicle.status == VehicleStatus.leaving:
                continue

            exit_route = build_vehicle_exit_route(spot, from_pos=vehicle.position)
            departing, cleared = vehicle_departs(vehicle, spot, exit_route)
            state.vehicles = [departing if v.id == vehicle.id else v for v in state.vehicles]
            _update_spot(state, spot.id, cleared)
            state.events = add_event_once(
                state.events,
                state.event_keys,
                f"departing:{vehicle.id}",
                state.tick,
                f"{vehicle.id} preparing to leave.",
                "departure",
                related_vehicle_id=vehicle.id,
            )
            already_leaving = True

    # Auto dispatch
    if is_running and state.auto_dispatch:
        has_robot = any(
            r.status in (RobotStatus.idle, RobotStatus.docked)
            and not r.assigned_vehicle_id and r.battery >= 20
            for r in state.robots
        )
        if has_robot:
            next_job = select_next_job(state.vehicles, state.sessions, state.tick)
            if next_job:
                vehicle, session, reasons = next_job
                state.sessions = [
                    session if s.id == session.id else s for s in state.sessions
                ]
                decision = select_best_robot(
                    vehicle, session, state.robots, state.parking_spots,
                    state.dock_bays, state.blocked_lane_active, reasons,
                )
                if decision:
                    if state.blocked_lane_active:
                        state.events = add_event_with_cooldown(
                            state.events,
                            state.event_cooldowns,
                            "lane-block",
                            40,
                            state.tick,
                            f"Lane block detected near {LANE_BLOCK_ZONE['label']}. Routing adjusted.",
                            "dispatch",
                        )
                    robots, assigned_vehicle, sessions = assign_robot(vehicle, decision, state.robots, state.sessions)
                    state.robots = robots
                    state.vehicles = [assigned_vehicle if v.id == vehicle.id else v for v in state.vehicles]
                    state.sessions = sessions
                    state.last_decision = decision
                    state.events = add_event(
                        state.events, state.tick,
                        f"{decision.selected_robot_id} dispatched to {vehicle.id}, ETA {_format_eta(decision.eta_seconds)}.",
                        "dispatch",
                        related_robot_id=decision.selected_robot_id,
                        related_vehicle_id=vehicle.id,
                    )

    # Robot movement
    service_arrivals: list[tuple[str, str]] = []
    dock_arrivals: list[str] = []
    yield_events: list[str] = []

    if is_simulating:
        next_robots = []
        for robot in state.robots:
            if robot.status in (RobotStatus.faulted, RobotStatus.charging):
                next_robots.append(robot)
                continue
            if robot.status not in (RobotStatus.en_route, RobotStatus.returning):
                next_robots.append(robot)
                continue

            # Empty / completed route → arrival transition this tick.
            if not robot.route or robot.route_index >= len(robot.route):
                if robot.status == RobotStatus.en_route and robot.assigned_vehicle_id:
                    service_arrivals.append((robot.id, robot.assigned_vehicle_id))
                    next_robots.append(robot.model_copy(update={
                        "status": RobotStatus.charging,
                        "route": [],
                        "route_index": 0,
                    }))
                elif robot.status == RobotStatus.returning:
                    dock_arrivals.append(robot.id)
                    bay = next((b for b in state.dock_bays if b.id == robot.dock_bay_id), None)
                    next_robots.append(robot.model_copy(update={
                        "status": RobotStatus.docked,
                        "position": bay.position if bay else robot.position,
                        "route": [],
                        "route_index": 0,
                        "assigned_vehicle_id": None,
                    }))
                else:
                    next_robots.append(robot)
                continue

            moved, arrived, yielded = advance_robot(robot, elapsed_seconds, state.robots, state.vehicles, state.tick)
            if yielded:
                if not robot.last_yield_tick or state.tick - robot.last_yield_tick >= YIELD_EVENT_COOLDOWN_TICKS:
                    yield_events.append(robot.id)
                next_robots.append(moved)
                continue

            if not arrived:
                next_robots.append(moved)
                continue

            if robot.status == RobotStatus.en_route and robot.assigned_vehicle_id:
                service_arrivals.append((robot.id, robot.assigned_vehicle_id))
                next_robots.append(moved.model_copy(update={
                    "status": RobotStatus.charging,
                    "route": [],
                    "route_index": 0,
                }))
            else:
                dock_arrivals.append(robot.id)
                bay = next((b for b in state.dock_bays if b.id == robot.dock_bay_id), None)
                next_robots.append(moved.model_copy(update={
                    "status": RobotStatus.docked,
                    "position": bay.position if bay else moved.position,
                    "route": [],
                    "route_index": 0,
                    "assigned_vehicle_id": None,
                }))

        state.robots = next_robots

        for robot_id in yield_events:
            state.events = add_event_with_cooldown(
                state.events,
                state.event_cooldowns,
                f"yield:{robot_id}",
                YIELD_EVENT_COOLDOWN_TICKS,
                state.tick,
                f"{robot_id} briefly yielding to traffic.",
                "yield",
                related_robot_id=robot_id,
            )

        for robot_id, vehicle_id in service_arrivals:
            robots, vehicles, sessions = start_charging(
                robot_id, vehicle_id, state.robots, state.vehicles, state.sessions, state.tick,
                state.parking_spots,
            )
            state.robots = robots
            state.vehicles = vehicles
            state.sessions = sessions
            # Confirm charging actually started.
            started = any(
                r.id == robot_id and r.status == RobotStatus.charging for r in state.robots
            )
            if started:
                state.events = add_event_once(
                    state.events,
                    state.event_keys,
                    f"charging:{robot_id}:{vehicle_id}",
                    state.tick,
                    f"{robot_id} arrived and started charging {vehicle_id}.",
                    "charging",
                    related_robot_id=robot_id,
                    related_vehicle_id=vehicle_id,
                )
                if state.charge_started_tick is None and state.scripted_vehicle_id == vehicle_id:
                    state.charge_started_tick = state.tick
            else:
                state.events = add_event_once(
                    state.events,
                    state.event_keys,
                    f"arrive-fail:{robot_id}:{vehicle_id}",
                    state.tick,
                    f"{robot_id} reached {vehicle_id} but could not start charging.",
                    "dispatch",
                    related_robot_id=robot_id,
                    related_vehicle_id=vehicle_id,
                )

        for robot_id in dock_arrivals:
            state.robots = dock_robot(robot_id, state.robots, state.dock_bays)
            state.events = add_event_once(
                state.events,
                state.event_keys,
                f"docked:{robot_id}:{state.tick // 100}",
                state.tick,
                f"{robot_id} returned to dock.",
                "dock",
                related_robot_id=robot_id,
            )

    # Charging progression
    charging_robots = [r for r in state.robots if r.status == RobotStatus.charging and r.assigned_vehicle_id]
    completed_jobs: list[tuple[str, str]] = []
    delivered_total = 0.0

    if charging_robots:
        vehicles = list(state.vehicles)
        sessions = list(state.sessions)
        for robot in charging_robots:
            v_idx = next((i for i, v in enumerate(vehicles) if v.id == robot.assigned_vehicle_id), -1)
            s_idx = next(
                (i for i, s in enumerate(sessions)
                 if s.vehicle_id == robot.assigned_vehicle_id and s.status == SessionStatus.active),
                -1,
            )
            if v_idx < 0 or s_idx < 0:
                continue
            new_v, new_s, delivered, complete = advance_charging(vehicles[v_idx], sessions[s_idx], elapsed_seconds)
            vehicles[v_idx] = new_v
            sessions[s_idx] = new_s
            delivered_total += delivered
            if complete:
                completed_jobs.append((robot.id, new_v.id))

        state.vehicles = vehicles
        state.sessions = sessions
        share = delivered_total / max(1, len(charging_robots))
        state.robots = [
            r.model_copy(update={"battery": max(0, r.battery - share * 0.45)})
            if r.status == RobotStatus.charging and r.assigned_vehicle_id else r
            for r in state.robots
        ]
        state.energy_today_kwh += delivered_total

    for robot_id, vehicle_id in completed_jobs:
        robots, vehicles, sessions = complete_charging(
            robot_id, vehicle_id, state.robots, state.vehicles, state.sessions,
            state.dock_bays, state.blocked_lane_active, state.tick,
        )
        state.robots = robots
        state.vehicles = vehicles
        state.sessions = sessions
        state.events = add_event(
            state.events, state.tick,
            f"{vehicle_id} charge complete. {robot_id} returning to dock.",
            "charging",
            related_robot_id=robot_id,
            related_vehicle_id=vehicle_id,
        )

    # Dock recharge — any robot sitting on its bay charges until full.
    def recharge_at_dock(robot: Robot) -> Robot:
        if robot.assigned_vehicle_id or robot.status in (
            RobotStatus.en_route, RobotStatus.returning, RobotStatus.charging, RobotStatus.faulted,
        ):
            return robot

        bay = next((b for b in state.dock_bays if b.id == robot.dock_bay_id), None)
        if not bay:
            return robot

        # Keep the marker perfectly centered on the dock bay.
        at_bay = calculate_distance(robot.position, bay.position) <= ARRIVAL_DISTANCE_THRESHOLD * 1.5
        if robot.status in (RobotStatus.docked, RobotStatus.idle) or at_bay:
            centered = bay.position
            if robot.battery >= 99.5:
                return robot.model_copy(update={
                    "battery": 100.0,
                    "status": RobotStatus.idle,
                    "position": centered,
                    "route": [],
                    "route_index": 0,
                    "dock_bay_id": bay.id,
                })
            # ~2% per real second at 20x feels visible on the status strip.
            gain = 2.0 * elapsed_seconds
            new_battery = min(100.0, robot.battery + gain)
            return robot.model_copy(update={
                "battery": new_battery,
                "status": RobotStatus.docked,
                "position": centered,
                "route": [],
                "route_index": 0,
                "dock_bay_id": bay.id,
            })
        return robot

    state.robots = [recharge_at_dock(r) for r in state.robots]

    # Low battery return
    if is_running:
        claimed = occupied_dock_ids(state.robots)
        updated = []
        for robot in state.robots:
            if robot.battery >= LOW_ROBOT_BATTERY_THRESHOLD:
                updated.append(robot)
                continue
            if robot.status not in (RobotStatus.idle, RobotStatus.docked) or robot.assigned_vehicle_id:
                updated.append(robot)
                continue
            bay = next((b for b in state.dock_bays if b.id == robot.dock_bay_id), None)
            if not bay:
                bay = get_available_dock_bay(state.dock_bays, claimed, robot_id=robot.id)
            if not bay or robot.dock_bay_id == bay.id:
                updated.append(robot)
                continue
            claimed.add(bay.id)
            state.events = add_event_with_cooldown(
                state.events,
                state.event_cooldowns,
                f"lowbat:{robot.id}",
                40,
                state.tick,
                f"{robot.id} battery low, returning to dock.",
                "returning",
                related_robot_id=robot.id,
            )
            updated.append(robot.model_copy(update={
                "status": RobotStatus.returning,
                "dock_bay_id": bay.id,
                "route": build_route_to_dock(robot.position, bay, state.blocked_lane_active),
                "route_index": 0,
            }))
        state.robots = updated

    # Scripted fault
    if (
        is_running
        and not state.fault_triggered
        and state.charge_started_tick is not None
        and state.tick - state.charge_started_tick >= DEMO_FAULT_AFTER_CHARGE_TICKS
        and state.scripted_vehicle_id
    ):
        fault_target = next(
            (r for r in state.robots
             if r.assigned_vehicle_id == state.scripted_vehicle_id and r.status == RobotStatus.charging),
            None,
        )
        if fault_target:
            robots, vehicles, sessions, vehicle_id = apply_fault(
                fault_target, FaultType.connector_timeout, state.robots, state.vehicles, state.sessions,
            )
            state.robots = robots
            state.vehicles = vehicles
            state.sessions = sessions
            delivered = 0.0
            interrupted = next(
                (s for s in sessions if s.vehicle_id == vehicle_id and s.status == SessionStatus.interrupted),
                None,
            )
            if interrupted:
                delivered = interrupted.delivered_energy_kwh
            state.events = add_event(
                state.events, state.tick,
                f"Connector timeout on {fault_target.id} while serving {vehicle_id}.",
                "fault",
                related_robot_id=fault_target.id,
                related_vehicle_id=vehicle_id,
            )
            state.fault_triggered = True

            if (vehicle_id):
                vehicles, sessions = requeue_vehicle(vehicle_id, state.vehicles, state.sessions)
                state.vehicles = vehicles
                state.sessions = sessions
                state.events = add_event(
                    state.events, state.tick,
                    f"{vehicle_id} requeued with {delivered:.1f} kWh delivered.",
                    "fault",
                    related_vehicle_id=vehicle_id,
                )

                # Prefer the interrupted vehicle for backup — not a different queued job.
                vehicle = next((v for v in state.vehicles if v.id == vehicle_id), None)
                session = next(
                    (s for s in state.sessions if s.vehicle_id == vehicle_id and s.status == SessionStatus.queued),
                    None,
                )
                if vehicle and session:
                    decision = select_best_robot(
                        vehicle, session, state.robots, state.parking_spots,
                        state.dock_bays, state.blocked_lane_active, ["backup after fault"],
                    )
                    if decision and decision.selected_robot_id:
                        robots, assigned_vehicle, sessions = assign_robot(vehicle, decision, state.robots, state.sessions)
                        state.robots = robots
                        state.vehicles = [assigned_vehicle if v.id == vehicle.id else v for v in state.vehicles]
                        state.sessions = sessions
                        state.last_decision = decision
                        state.backup_assigned = True
                        state.events = add_event(
                            state.events, state.tick,
                            f"Backup assigned: {decision.selected_robot_id} to {vehicle.id}.",
                            "reassignment",
                            related_robot_id=decision.selected_robot_id,
                            related_vehicle_id=vehicle.id,
                        )
                    else:
                        state.events = add_event_with_cooldown(
                            state.events,
                            state.event_cooldowns,
                            f"nobackup:{vehicle_id}",
                            60,
                            state.tick,
                            f"No backup robot available. {vehicle_id} remains queued.",
                            "dispatch",
                            related_vehicle_id=vehicle_id,
                        )

    # Retry backup if fault already fired but no robot was free yet.
    if is_running and state.fault_triggered and not state.backup_assigned and state.scripted_vehicle_id:
        vehicle_id = state.scripted_vehicle_id
        vehicle = next((v for v in state.vehicles if v.id == vehicle_id), None)
        session = next(
            (s for s in state.sessions if s.vehicle_id == vehicle_id and s.status in (
                SessionStatus.queued, SessionStatus.interrupted,
            )),
            None,
        )
        if vehicle and session and vehicle.status in (VehicleStatus.waiting, VehicleStatus.backup_needed):
            if session.status == SessionStatus.interrupted:
                vehicles, sessions = requeue_vehicle(vehicle_id, state.vehicles, state.sessions)
                state.vehicles = vehicles
                state.sessions = sessions
                vehicle = next((v for v in state.vehicles if v.id == vehicle_id), None)
                session = next(
                    (s for s in state.sessions if s.vehicle_id == vehicle_id and s.status == SessionStatus.queued),
                    None,
                )
            if vehicle and session:
                decision = select_best_robot(
                    vehicle, session, state.robots, state.parking_spots,
                    state.dock_bays, state.blocked_lane_active, ["backup retry"],
                )
                if decision and decision.selected_robot_id:
                    robots, assigned_vehicle, sessions = assign_robot(vehicle, decision, state.robots, state.sessions)
                    state.robots = robots
                    state.vehicles = [assigned_vehicle if v.id == vehicle.id else v for v in state.vehicles]
                    state.sessions = sessions
                    state.last_decision = decision
                    state.backup_assigned = True
                    state.events = add_event(
                        state.events, state.tick,
                        f"Backup assigned: {decision.selected_robot_id} to {vehicle.id}.",
                        "reassignment",
                        related_robot_id=decision.selected_robot_id,
                        related_vehicle_id=vehicle.id,
                    )

    # Idle-mode manual simulation (robot movement + charging when not in demo)
    if state.demo_mode == DemoMode.idle:
        _tick_idle_manual(state, elapsed_seconds)

    if is_running and state.tick % INVARIANT_CHECK_INTERVAL_TICKS == 0:
        _check_parking_invariants(state)


def _check_parking_invariants(state: AppState) -> None:
    """Light occupancy / route checks with cooldown events + simple recovery."""
    active = [v for v in state.vehicles if v.status != VehicleStatus.departed]

    # Duplicate active spot_id assignments.
    by_spot: dict[str, list[str]] = {}
    for vehicle in active:
        if not vehicle.spot_id:
            continue
        by_spot.setdefault(vehicle.spot_id, []).append(vehicle.id)
    for spot_id, ids in by_spot.items():
        if len(ids) < 2:
            continue
        state.events = add_event_with_cooldown(
            state.events,
            state.event_cooldowns,
            f"invariant:dup-spot:{spot_id}",
            YIELD_EVENT_COOLDOWN_TICKS,
            state.tick,
            f"Occupancy conflict at {spot_id}: {', '.join(ids)}.",
            "dispatch",
        )
        # Keep first claim; clear extras' reservations and send them to exit if entering.
        for extra_id in ids[1:]:
            for i, vehicle in enumerate(state.vehicles):
                if vehicle.id != extra_id:
                    continue
                if vehicle.status == VehicleStatus.entering:
                    spot = find_spot_by_id(state.parking_spots, spot_id)
                    alt = find_available_spot(state.parking_spots, state.vehicles)
                    if alt:
                        reserved = reserve_spot(alt, vehicle.id)
                        if reserved:
                            _update_spot(state, alt.id, reserved)
                            route = build_vehicle_entry_route(alt, vehicle.position)
                            state.vehicles[i] = vehicle.model_copy(update={
                                "spot_id": alt.id,
                                "route": route,
                                "route_index": 0,
                            })
                    elif spot:
                        route = build_vehicle_exit_route(spot, from_pos=vehicle.position)
                        state.vehicles[i] = vehicle.model_copy(update={
                            "status": VehicleStatus.leaving,
                            "spot_id": None,
                            "route": route,
                            "route_index": 0,
                        })

    # Orphan reserved / occupied ids (vehicle gone or departed).
    live_ids = {v.id for v in active}
    for spot in state.parking_spots:
        dirty = False
        occupied = spot.occupied_vehicle_id
        reserved = spot.reserved_vehicle_id
        updates = {}
        if occupied and occupied not in live_ids:
            updates["occupied_vehicle_id"] = None
            dirty = True
        if reserved and reserved not in live_ids:
            updates["reserved_vehicle_id"] = None
            dirty = True
        if dirty:
            _update_spot(state, spot.id, spot.model_copy(update=updates))
            state.events = add_event_with_cooldown(
                state.events,
                state.event_cooldowns,
                f"invariant:orphan-spot:{spot.id}",
                YIELD_EVENT_COOLDOWN_TICKS,
                state.tick,
                f"Cleared orphan occupancy on {spot.id}.",
                "dispatch",
            )

    # Snap drifted stationary cars onto their bay center (seed/coord bugs).
    from app.state import spot_center

    stationary = {
        VehicleStatus.parked, VehicleStatus.waiting, VehicleStatus.charging,
        VehicleStatus.completed, VehicleStatus.assigned, VehicleStatus.backup_needed,
    }
    for i, vehicle in enumerate(state.vehicles):
        if vehicle.status not in stationary or not vehicle.spot_id:
            continue
        try:
            center = spot_center(vehicle.spot_id)
        except ValueError:
            continue
        if abs(vehicle.position.x - center.x) > 0.5 or abs(vehicle.position.y - center.y) > 0.5:
            state.vehicles[i] = vehicle.model_copy(update={"position": center})
            state.events = add_event_with_cooldown(
                state.events,
                state.event_cooldowns,
                f"invariant:snap:{vehicle.id}",
                YIELD_EVENT_COOLDOWN_TICKS,
                state.tick,
                f"Snapped {vehicle.id} to {vehicle.spot_id} center.",
                "dispatch",
            )

    # Non-orthogonal moving routes → rebuild once.
    for i, vehicle in enumerate(state.vehicles):
        if vehicle.status not in (VehicleStatus.entering, VehicleStatus.leaving):
            continue
        if not vehicle.route or assert_orthogonal_route(vehicle.route):
            continue
        spot = find_spot_by_id(state.parking_spots, vehicle.spot_id or "")
        if not spot:
            continue
        if vehicle.status == VehicleStatus.entering:
            route = build_vehicle_entry_route(spot, vehicle.position)
        else:
            route = build_vehicle_exit_route(spot, from_pos=vehicle.position)
        state.vehicles[i] = vehicle.model_copy(update={"route": route, "route_index": 0})
        state.events = add_event_with_cooldown(
            state.events,
            state.event_cooldowns,
            f"invariant:reroute:{vehicle.id}",
            YIELD_EVENT_COOLDOWN_TICKS,
            state.tick,
            f"Rebuilt non-orthogonal route for {vehicle.id}.",
            "dispatch",
        )


def _tick_idle_manual(state: AppState, elapsed_seconds: float) -> None:
    """Advance robots and charging for the manual idle baseline."""
    service_arrivals: list[tuple[str, str]] = []
    dock_arrivals: list[str] = []
    next_robots = []

    for robot in state.robots:
        if robot.status not in (RobotStatus.en_route, RobotStatus.returning) or robot.route_index >= len(robot.route):
            next_robots.append(robot)
            continue
        moved, arrived, _ = advance_robot(robot, elapsed_seconds, state.robots, state.vehicles, state.tick)
        if not arrived:
            next_robots.append(moved)
            continue
        if robot.status == RobotStatus.en_route and robot.assigned_vehicle_id:
            service_arrivals.append((robot.id, robot.assigned_vehicle_id))
            next_robots.append(moved.model_copy(update={"status": RobotStatus.charging, "route": [], "route_index": 0}))
        else:
            dock_arrivals.append(robot.id)
            bay = next((b for b in state.dock_bays if b.id == robot.dock_bay_id), None)
            next_robots.append(moved.model_copy(update={
                "status": RobotStatus.docked,
                "position": bay.position if bay else moved.position,
                "route": [],
                "route_index": 0,
                "assigned_vehicle_id": None,
            }))

    state.robots = next_robots

    for robot_id, vehicle_id in service_arrivals:
        robots, vehicles, sessions = start_charging(
            robot_id, vehicle_id, state.robots, state.vehicles, state.sessions, state.tick,
            state.parking_spots,
        )
        state.robots = robots
        state.vehicles = vehicles
        state.sessions = sessions

    for robot_id in dock_arrivals:
        state.robots = dock_robot(robot_id, state.robots, state.dock_bays)

    charging_robots = [r for r in state.robots if r.status == RobotStatus.charging and r.assigned_vehicle_id]
    if not charging_robots:
        return

    vehicles = list(state.vehicles)
    sessions = list(state.sessions)
    completed_jobs: list[tuple[str, str]] = []
    delivered_total = 0.0

    for robot in charging_robots:
        v_idx = next((i for i, v in enumerate(vehicles) if v.id == robot.assigned_vehicle_id), -1)
        s_idx = next(
            (i for i, s in enumerate(sessions)
             if s.vehicle_id == robot.assigned_vehicle_id and s.status == SessionStatus.active),
            -1,
        )
        if v_idx < 0 or s_idx < 0:
            continue
        new_v, new_s, delivered, complete = advance_charging(vehicles[v_idx], sessions[s_idx], elapsed_seconds)
        vehicles[v_idx] = new_v
        sessions[s_idx] = new_s
        delivered_total += delivered
        if complete:
            completed_jobs.append((robot.id, new_v.id))

    state.vehicles = vehicles
    state.sessions = sessions
    state.energy_today_kwh += delivered_total

    for robot_id, vehicle_id in completed_jobs:
        robots, vehicles, sessions = complete_charging(
            robot_id, vehicle_id, state.robots, state.vehicles, state.sessions,
            state.dock_bays, state.blocked_lane_active, state.tick,
        )
        state.robots = robots
        state.vehicles = vehicles
        state.sessions = sessions
