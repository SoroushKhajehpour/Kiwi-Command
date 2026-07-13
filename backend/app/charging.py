"""Charging session progression and charge eligibility."""

from __future__ import annotations

from dataclasses import dataclass

from app.config import BATTERY_CAPACITY_KWH, CHARGING_KWH_PER_SECOND
from app.schemas import ChargingSession, SessionStatus, Vehicle, VehiclePriority, VehicleStatus


def round_kwh(value: float) -> float:
    return round(value, 1)


def round_pct(value: float) -> float:
    return round(value, 1)


@dataclass(frozen=True)
class ChargeDecision:
    eligible: bool
    status: str
    reason: str
    target_battery: float
    requested_energy_kwh: float


def choose_target_battery(
    vehicle: Vehicle,
    queue_depth: int = 0,
    current_tick: int = 0,
) -> float:
    """Practical SOC targets — never charge to 100% in the demo."""
    remaining = max(0, vehicle.expected_departure_tick - current_tick)
    if vehicle.battery < 20:
        return 65.0
    if vehicle.priority == VehiclePriority.urgent:
        return 70.0
    if queue_depth >= 3:
        return 70.0
    # Long remaining dwell + light queue → allow higher target, but not for already-high SOC.
    if remaining > 60 and queue_depth <= 1 and vehicle.battery < 70:
        return 90.0
    return 80.0


def estimate_requested_energy(
    vehicle: Vehicle,
    *,
    target_battery: float | None = None,
    manual: bool = False,
) -> float:
    target = target_battery if target_battery is not None else vehicle.target_battery
    gap = max(0.0, target - vehicle.battery)
    raw = (gap / 100.0) * BATTERY_CAPACITY_KWH
    if manual:
        return round_kwh(min(35.0, max(5.0, raw))) if gap > 0 else 0.0
    return round_kwh(min(28.0, max(8.0, raw))) if gap > 0 else 0.0


def evaluate_charge_decision(
    vehicle: Vehicle,
    current_tick: int,
    *,
    queue_depth: int = 0,
    manual: bool = False,
    has_active_session: bool = False,
) -> ChargeDecision:
    target = choose_target_battery(vehicle, queue_depth, current_tick)
    requested = estimate_requested_energy(vehicle, target_battery=target, manual=manual)

    if has_active_session:
        return ChargeDecision(
            False, "queued", "Vehicle already has an active session.", target, requested,
        )

    if vehicle.status in (
        VehicleStatus.entering,
        VehicleStatus.parking,
        VehicleStatus.leaving,
        VehicleStatus.departed,
    ):
        return ChargeDecision(
            False,
            "not_feasible",
            f"Vehicle is {vehicle.status.value} and cannot request charge yet.",
            target,
            requested,
        )

    if vehicle.status in (
        VehicleStatus.waiting,
        VehicleStatus.backup_needed,
        VehicleStatus.assigned,
        VehicleStatus.charging,
    ):
        return ChargeDecision(
            False, "queued", "Charge already in progress or queued.", target, requested,
        )

    if vehicle.battery >= target or requested <= 0:
        return ChargeDecision(
            False,
            "not_needed",
            f"Not charging: battery already at/above target ({round(vehicle.battery)}% ≥ {round(target)}%).",
            target,
            0.0,
        )

    if requested < (5.0 if manual else 8.0):
        return ChargeDecision(
            False,
            "not_needed",
            f"Not charging: requested energy too small ({requested:.1f} kWh).",
            target,
            requested,
        )

    departure_in = vehicle.expected_departure_tick - current_tick
    if departure_in < 8 and not manual:
        return ChargeDecision(
            False,
            "not_feasible",
            "Not feasible: departure too soon for useful charging.",
            target,
            requested,
        )

    if not manual and queue_depth >= 3 and vehicle.battery > 70:
        return ChargeDecision(
            False,
            "deferred",
            "Deferred: queue is prioritizing lower-battery vehicles.",
            target,
            requested,
        )

    if manual:
        reason = (
            f"Charging needed: {round(vehicle.battery)}% → {round(target)}%, "
            f"{requested:.1f} kWh requested (manual)"
        )
        return ChargeDecision(True, "eligible_for_charge", reason, target, requested)

    gap = target - vehicle.battery
    departure_soon = departure_in <= 15
    eligible = (
        vehicle.battery < 45
        or gap >= 20
        or vehicle.priority == VehiclePriority.urgent
        or (departure_soon and vehicle.battery < 50)
        or (requested >= 8 and vehicle.battery < 70)
    )
    if not eligible:
        return ChargeDecision(
            False,
            "deferred",
            "Deferred: battery and dwell do not justify a charge job yet.",
            target,
            requested,
        )

    reason = f"Charging needed: {round(vehicle.battery)}% → {round(target)}%, {requested:.1f} kWh requested"
    return ChargeDecision(True, "eligible_for_charge", reason, target, requested)


def should_request_charge(vehicle: Vehicle, current_tick: int, queue_depth: int = 0) -> bool:
    if vehicle.status != VehicleStatus.parked:
        return False
    decision = evaluate_charge_decision(vehicle, current_tick, queue_depth=queue_depth, manual=False)
    return decision.eligible


def advance_charging(
    vehicle: Vehicle,
    session: ChargingSession,
    elapsed_seconds: float,
) -> tuple[Vehicle, ChargingSession, float, bool]:
    requested = session.requested_energy_kwh
    remaining = max(0.0, requested - session.delivered_energy_kwh)
    delivered = min(remaining, CHARGING_KWH_PER_SECOND * elapsed_seconds)
    battery_cap = min(90.0, vehicle.target_battery if vehicle.target_battery > 0 else 90.0)
    battery_gain = delivered / BATTERY_CAPACITY_KWH * 100.0
    next_battery = min(battery_cap, vehicle.battery + battery_gain)
    raw_delivered = session.delivered_energy_kwh + delivered

    hit_energy = raw_delivered >= requested - 0.0001
    hit_target = next_battery >= battery_cap - 0.05
    complete = hit_energy or hit_target

    if complete:
        energy = round_kwh(min(requested, raw_delivered if hit_target and not hit_energy else requested))
        if hit_energy:
            energy = round_kwh(requested)
        else:
            energy = round_kwh(min(requested, raw_delivered))
    else:
        energy = round_kwh(min(raw_delivered, requested))

    new_vehicle = vehicle.model_copy(update={
        "battery": round_pct(min(battery_cap, next_battery)),
        "status": VehicleStatus.completed if complete else VehicleStatus.charging,
        "assigned_robot_id": None if complete else vehicle.assigned_robot_id,
    })
    new_session = session.model_copy(update={
        "delivered_energy_kwh": energy,
        "status": SessionStatus.completed if complete else SessionStatus.active,
    })
    return new_vehicle, new_session, round_kwh(delivered), complete
