"""Derived operational metrics."""

from __future__ import annotations

from app.routing import eta_seconds_for_route
from app.schemas import EventLogItem, Metrics, RobotStatus, SessionStatus, SystemState, VehicleStatus


def derive_metrics(state: SystemState) -> Metrics:
    robots = state.robots
    vehicles = state.vehicles
    sessions = state.sessions
    events = state.events

    healthy = [r for r in robots if r.status != RobotStatus.offline and r.status != RobotStatus.faulted]
    available = [r for r in robots if r.status in (RobotStatus.idle, RobotStatus.docked) and not r.assigned_vehicle_id]
    active_jobs = len([s for s in sessions if s.status in (SessionStatus.assigned, SessionStatus.en_route, SessionStatus.active)])
    queue_depth = len([s for s in sessions if s.status in (SessionStatus.queued, SessionStatus.interrupted)])
    cars_in_garage = len([v for v in vehicles if v.status != VehicleStatus.departed])
    faults_today = len([e for e in events if e.type == "fault"])
    missed = len([s for s in sessions if s.status == SessionStatus.missed])

    etas = [
        eta_seconds_for_route(r.position, r.route, r.route_index)
        for r in robots if r.status == RobotStatus.en_route
    ]
    avg_eta = sum(etas) / len(etas) if etas else None

    docked = len([
        r for r in robots
        if r.dock_bay_id and r.status in (RobotStatus.docked, RobotStatus.idle)
    ])
    dock_total = len(state.dock_bays)

    energy = sum(s.delivered_energy_kwh for s in sessions if s.status in (SessionStatus.active, SessionStatus.completed))

    return Metrics(
        fleet_online=len(healthy),
        robots_available=len(available),
        jobs_active=active_jobs,
        queue_depth=queue_depth,
        cars_in_garage=cars_in_garage,
        energy_today_kwh=round(energy, 1),
        average_eta_seconds=avg_eta,
        dock_occupancy=f"{docked}/{dock_total}",
        faults_today=faults_today,
        missed_requests=missed,
    )
