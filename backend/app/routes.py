"""REST route handlers."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.charging import estimate_requested_energy, evaluate_charge_decision
from app.config import LANE_BLOCK_ZONE
from app.dispatch import select_best_robot, select_next_job
from app.events import add_event, add_event_with_cooldown
from app.faults import apply_fault, clear_fault, try_backup_dispatch
from app.deps import get_app_state, get_manager
from app.schemas import CreateJobRequest, DemoMode, FaultRequest, RobotStatus, SessionStatus, SystemState, VehicleStatus
from app.state import AppState
from app.state_transitions import assign_robot, request_charge
from app.websocket_manager import ConnectionManager

router = APIRouter(prefix="/api")


def _snapshot(app_state: AppState) -> SystemState:
    return app_state.snapshot()


@router.get("/health")
async def api_health(
    app_state: AppState = Depends(get_app_state),
    manager: ConnectionManager = Depends(get_manager),
) -> dict:
    return {
        "status": "ok",
        "demo_mode": app_state.demo_mode.value,
        "tick": app_state.tick,
        "vehicles": len(app_state.vehicles),
        "robots": len(app_state.robots),
        "sessions": len(app_state.sessions),
        "websocket_clients": manager.client_count,
    }


@router.get("/state", response_model=SystemState)
async def get_state(app_state: AppState = Depends(get_app_state)) -> SystemState:
    async with app_state.lock:
        return _snapshot(app_state)


@router.post("/demo/start", response_model=SystemState)
async def start_demo(
    app_state: AppState = Depends(get_app_state),
    manager: ConnectionManager = Depends(get_manager),
) -> SystemState:
    async with app_state.lock:
        app_state.reset("demo")
        app_state.auto_dispatch = True
        snapshot = _snapshot(app_state)
        await manager.broadcast(snapshot)
        return snapshot


@router.post("/demo/pause", response_model=SystemState)
async def pause_demo(
    app_state: AppState = Depends(get_app_state),
    manager: ConnectionManager = Depends(get_manager),
) -> SystemState:
    async with app_state.lock:
        if app_state.demo_mode != DemoMode.running:
            raise HTTPException(400, "Demo is not running")
        app_state.demo_mode = DemoMode.paused
        app_state.events = add_event(app_state.events, app_state.tick, "Demo paused", "dispatch")
        snapshot = _snapshot(app_state)
        await manager.broadcast(snapshot)
        return snapshot


@router.post("/demo/resume", response_model=SystemState)
async def resume_demo(
    app_state: AppState = Depends(get_app_state),
    manager: ConnectionManager = Depends(get_manager),
) -> SystemState:
    async with app_state.lock:
        if app_state.demo_mode != DemoMode.paused:
            raise HTTPException(400, "Demo is not paused")
        app_state.demo_mode = DemoMode.running
        app_state.events = add_event(app_state.events, app_state.tick, "Demo resumed", "dispatch")
        snapshot = _snapshot(app_state)
        await manager.broadcast(snapshot)
        return snapshot


@router.post("/demo/end", response_model=SystemState)
async def end_demo(
    app_state: AppState = Depends(get_app_state),
    manager: ConnectionManager = Depends(get_manager),
) -> SystemState:
    async with app_state.lock:
        if app_state.demo_mode not in (DemoMode.running, DemoMode.paused):
            raise HTTPException(400, "Demo is not active")
        app_state.demo_mode = DemoMode.ended
        app_state.events = add_event(
            app_state.events, app_state.tick,
            "Demo ended — in-flight jobs will finish",
            "dispatch",
        )
        snapshot = _snapshot(app_state)
        await manager.broadcast(snapshot)
        return snapshot


@router.post("/demo/reset", response_model=SystemState)
async def reset_demo(
    app_state: AppState = Depends(get_app_state),
    manager: ConnectionManager = Depends(get_manager),
) -> SystemState:
    async with app_state.lock:
        app_state.reset("idle")
        app_state.events = add_event(
            app_state.events, app_state.tick,
            "Scenario reset to manual baseline",
            "dispatch",
        )
        snapshot = _snapshot(app_state)
        await manager.broadcast(snapshot)
        return snapshot


@router.post("/dispatch/{vehicle_id}", response_model=SystemState)
async def dispatch_vehicle(
    vehicle_id: str,
    app_state: AppState = Depends(get_app_state),
    manager: ConnectionManager = Depends(get_manager),
) -> SystemState:
    async with app_state.lock:
        if app_state.demo_mode != DemoMode.idle:
            raise HTTPException(400, "Manual dispatch only available in idle mode")
        vehicle = app_state.get_vehicle(vehicle_id)
        if not vehicle:
            raise HTTPException(404, "Vehicle not found")
        if vehicle.status not in (VehicleStatus.waiting, VehicleStatus.backup_needed):
            raise HTTPException(400, "Vehicle is not queued for dispatch")
        next_job = select_next_job(app_state.vehicles, app_state.sessions, app_state.tick)
        if not next_job:
            raise HTTPException(400, "No queued jobs")
        v, s, reasons = next_job
        if v.id != vehicle_id:
            # Still try to dispatch this specific vehicle
            session = app_state.get_latest_session_for_vehicle(vehicle_id)
            if not session:
                raise HTTPException(400, "No session for vehicle")
            s = session
            reasons = []
        decision = select_best_robot(
            vehicle, s, app_state.robots, app_state.parking_spots,
            app_state.dock_bays, app_state.blocked_lane_active, reasons,
        )
        if not decision:
            raise HTTPException(400, "No robot available")
        robots, assigned, sessions = assign_robot(vehicle, decision, app_state.robots, app_state.sessions)
        app_state.robots = robots
        app_state.vehicles = [assigned if item.id == vehicle.id else item for item in app_state.vehicles]
        app_state.sessions = sessions
        app_state.last_decision = decision
        snapshot = _snapshot(app_state)
        await manager.broadcast(snapshot)
        return snapshot


@router.post("/jobs", response_model=SystemState)
async def create_job(
    body: CreateJobRequest,
    app_state: AppState = Depends(get_app_state),
    manager: ConnectionManager = Depends(get_manager),
) -> SystemState:
    async with app_state.lock:
        vehicle = app_state.get_vehicle(body.vehicle_id)
        if not vehicle:
            raise HTTPException(404, detail=f"Vehicle {body.vehicle_id} not found")

        if vehicle.status in (VehicleStatus.entering, VehicleStatus.leaving, VehicleStatus.departed, VehicleStatus.parking):
            raise HTTPException(
                409,
                detail=f"Vehicle {vehicle.id} is {vehicle.status.value} and cannot request charge yet.",
            )

        active_statuses = {
            SessionStatus.queued,
            SessionStatus.assigned,
            SessionStatus.en_route,
            SessionStatus.active,
            SessionStatus.interrupted,
        }
        existing = next(
            (s for s in app_state.sessions if s.vehicle_id == vehicle.id and s.status in active_statuses),
            None,
        )
        if existing:
            # Idempotent: already has a job — return current state, do not error-spam.
            if vehicle.status == VehicleStatus.parked:
                app_state.vehicles = [
                    v.model_copy(update={"status": VehicleStatus.waiting}) if v.id == vehicle.id else v
                    for v in app_state.vehicles
                ]
            if existing.status == SessionStatus.interrupted:
                app_state.sessions = [
                    s.model_copy(update={"status": SessionStatus.queued}) if s.id == existing.id else s
                    for s in app_state.sessions
                ]
            app_state.events = add_event_with_cooldown(
                app_state.events,
                app_state.event_cooldowns,
                f"active-job:{vehicle.id}",
                200,
                app_state.tick,
                f"{vehicle.id} already has an active job.",
                "request",
                related_vehicle_id=vehicle.id,
                related_session_id=existing.id,
            )
            if app_state.auto_dispatch:
                waiting = app_state.get_vehicle(body.vehicle_id)
                session = next(
                    (s for s in app_state.sessions if s.id == existing.id),
                    existing,
                )
                if waiting and waiting.status in (VehicleStatus.waiting, VehicleStatus.backup_needed):
                    decision = select_best_robot(
                        waiting, session, app_state.robots, app_state.parking_spots,
                        app_state.dock_bays, app_state.blocked_lane_active, [],
                    )
                    if decision:
                        robots, assigned, sessions = assign_robot(
                            waiting, decision, app_state.robots, app_state.sessions,
                        )
                        app_state.robots = robots
                        app_state.vehicles = [
                            assigned if item.id == waiting.id else item for item in app_state.vehicles
                        ]
                        app_state.sessions = sessions
                        app_state.last_decision = decision
            snapshot = _snapshot(app_state)
            await manager.broadcast(snapshot)
            return snapshot

        if vehicle.status not in (VehicleStatus.parked, VehicleStatus.completed, VehicleStatus.waiting, VehicleStatus.backup_needed):
            raise HTTPException(
                409,
                detail=f"Vehicle {vehicle.id} status '{vehicle.status.value}' cannot request charge.",
            )

        # Manual operator request always creates a job (eligibility is advisory for auto only).
        queue_depth = sum(
            1 for s in app_state.sessions
            if s.status in (SessionStatus.queued, SessionStatus.interrupted)
        )
        charge_decision = evaluate_charge_decision(
            vehicle.model_copy(update={"status": VehicleStatus.parked})
            if vehicle.status in (VehicleStatus.waiting, VehicleStatus.backup_needed, VehicleStatus.completed)
            else vehicle,
            app_state.tick,
            queue_depth=queue_depth,
            manual=True,
            has_active_session=False,
        )

        energy = body.requested_energy_kwh
        if energy is None or energy <= 0:
            energy = charge_decision.requested_energy_kwh
        if energy is None or energy <= 0:
            # Operator override: force a modest top-up toward a practical target.
            top_up_target = min(90.0, max(vehicle.battery + 15.0, charge_decision.target_battery, 65.0))
            if top_up_target <= vehicle.battery + 0.5:
                top_up_target = min(90.0, vehicle.battery + 15.0)
            energy = estimate_requested_energy(
                vehicle.model_copy(update={"status": VehicleStatus.parked, "target_battery": top_up_target}),
                target_battery=top_up_target,
                manual=True,
            )
        if energy is None or energy < 5:
            energy = 8.0

        charge_vehicle = vehicle
        if vehicle.status in (VehicleStatus.waiting, VehicleStatus.backup_needed, VehicleStatus.completed):
            charge_vehicle = vehicle.model_copy(update={"status": VehicleStatus.parked})
        # Apply chosen target so charging completes at a practical SOC.
        charge_vehicle = charge_vehicle.model_copy(update={
            "target_battery": max(charge_vehicle.target_battery, charge_decision.target_battery, min(90.0, charge_vehicle.battery + 15.0)),
        })

        result = request_charge(
            charge_vehicle,
            app_state.sessions,
            app_state.tick,
            energy,
            queue_depth=queue_depth,
            manual=True,
        )
        if not result:
            raise HTTPException(
                409,
                detail=f"Vehicle {vehicle.id} cannot request charge (status={vehicle.status.value}).",
            )
        updated_vehicle, session = result
        app_state.vehicles = [updated_vehicle if v.id == vehicle.id else v for v in app_state.vehicles]
        app_state.sessions = [session, *app_state.sessions]
        app_state.events = add_event(
            app_state.events, app_state.tick,
            f"{vehicle.id} requested {session.requested_energy_kwh:.1f} kWh "
            f"({round(updated_vehicle.battery)}% → {round(updated_vehicle.target_battery)}%) at {vehicle.spot_id}.",
            "request",
            related_vehicle_id=vehicle.id,
            related_session_id=session.id,
        )
        if app_state.auto_dispatch:
            next_job = select_next_job(app_state.vehicles, app_state.sessions, app_state.tick)
            if next_job:
                v, s, reasons = next_job
                if v.id == vehicle.id:
                    decision = select_best_robot(
                        v, s, app_state.robots, app_state.parking_spots,
                        app_state.dock_bays, app_state.blocked_lane_active, reasons,
                    )
                    if decision:
                        robots, assigned, sessions = assign_robot(v, decision, app_state.robots, app_state.sessions)
                        app_state.robots = robots
                        app_state.vehicles = [assigned if item.id == v.id else item for item in app_state.vehicles]
                        app_state.sessions = sessions
                        app_state.last_decision = decision
                        app_state.events = add_event(
                            app_state.events, app_state.tick,
                            f"{decision.selected_robot_id} dispatched to {v.id}.",
                            "dispatch",
                            related_robot_id=decision.selected_robot_id,
                            related_vehicle_id=v.id,
                        )
        snapshot = _snapshot(app_state)
        await manager.broadcast(snapshot)
        return snapshot


@router.post("/robots/{robot_id}/fault", response_model=SystemState)
async def fault_robot(
    robot_id: str,
    body: FaultRequest,
    app_state: AppState = Depends(get_app_state),
    manager: ConnectionManager = Depends(get_manager),
) -> SystemState:
    async with app_state.lock:
        if app_state.demo_mode != DemoMode.idle:
            raise HTTPException(400, "Manual faults only available in idle mode")
        robot = app_state.get_robot(robot_id)
        if not robot:
            raise HTTPException(404, "Robot not found")
        if robot.status == RobotStatus.faulted:
            raise HTTPException(400, "Robot already faulted")
        robots, vehicles, sessions, vehicle_id = apply_fault(
            robot, body.fault_type, app_state.robots, app_state.vehicles, app_state.sessions,
        )
        app_state.robots = robots
        app_state.vehicles = vehicles
        app_state.sessions = sessions
        app_state.events = add_event(
            app_state.events, app_state.tick,
            f"{robot_id} faulted{f' while serving {vehicle_id}' if vehicle_id else ''}",
            "fault",
        )
        if vehicle_id and app_state.auto_dispatch:
            robots, vehicles, sessions, decision = try_backup_dispatch(
                app_state.vehicles, app_state.sessions, app_state.robots,
                app_state.parking_spots, app_state.dock_bays,
                app_state.blocked_lane_active, app_state.tick,
            )
            app_state.robots = robots
            app_state.vehicles = vehicles
            app_state.sessions = sessions
            if decision:
                app_state.last_decision = decision
        snapshot = _snapshot(app_state)
        await manager.broadcast(snapshot)
        return snapshot


@router.post("/robots/{robot_id}/clear-fault", response_model=SystemState)
async def clear_robot_fault(
    robot_id: str,
    app_state: AppState = Depends(get_app_state),
    manager: ConnectionManager = Depends(get_manager),
) -> SystemState:
    async with app_state.lock:
        robot = app_state.get_robot(robot_id)
        if not robot:
            raise HTTPException(404, "Robot not found")
        if robot.status != RobotStatus.faulted:
            raise HTTPException(400, "Robot is not faulted")
        app_state.robots = clear_fault(robot, app_state.robots, app_state.dock_bays, app_state.blocked_lane_active)
        app_state.events = add_event(app_state.events, app_state.tick, f"{robot_id} fault cleared", "fault")
        snapshot = _snapshot(app_state)
        await manager.broadcast(snapshot)
        return snapshot


@router.post("/garage/lane-block", response_model=SystemState)
async def toggle_lane_block(
    app_state: AppState = Depends(get_app_state),
    manager: ConnectionManager = Depends(get_manager),
) -> SystemState:
    async with app_state.lock:
        if app_state.demo_mode == DemoMode.running:
            raise HTTPException(400, "Cannot toggle lane block while demo is running")
        app_state.blocked_lane_active = not app_state.blocked_lane_active
        label = LANE_BLOCK_ZONE["label"]
        msg = (
            f"Lane block detected near {label}. Routing adjusted."
            if app_state.blocked_lane_active
            else f"Lane block near {label} cleared"
        )
        app_state.events = add_event(app_state.events, app_state.tick, msg, "dispatch")
        snapshot = _snapshot(app_state)
        await manager.broadcast(snapshot)
        return snapshot


@router.post("/dispatch/toggle", response_model=SystemState)
async def toggle_dispatch(
    app_state: AppState = Depends(get_app_state),
    manager: ConnectionManager = Depends(get_manager),
) -> SystemState:
    async with app_state.lock:
        if app_state.demo_mode != DemoMode.idle:
            raise HTTPException(400, "Dispatch toggle only in idle mode")
        app_state.auto_dispatch = not app_state.auto_dispatch
        mode = "AUTO" if app_state.auto_dispatch else "MANUAL"
        app_state.events = add_event(
            app_state.events, app_state.tick,
            f"Dispatch mode changed to {mode}",
            "dispatch",
        )
        snapshot = _snapshot(app_state)
        await manager.broadcast(snapshot)
        return snapshot
