"""Vehicle spawning for autonomous demo."""

from __future__ import annotations

import random
from typing import Any

from app.config import GARAGE_ENTRANCE, TARGET_OCCUPANCY_MAX
from app.demo_scenario import (
    OVERNIGHT_DEPARTURE_OFFSET_MAX,
    OVERNIGHT_DEPARTURE_OFFSET_MIN,
    OVERNIGHT_PROBABILITY,
    SHORT_STAY_DEPARTURE_OFFSET_MAX,
    SHORT_STAY_DEPARTURE_OFFSET_MIN,
)
from app.dispatch import calculate_vehicle_priority
from app.routing import build_vehicle_entry_route, heading_to_first_segment
from app.schemas import ParkingSpot, Position, Vehicle, VehiclePaint, VehicleStatus


MODELS = [
    "Tesla Model 3", "Tesla Model Y", "Hyundai IONIQ 5", "Kia EV6",
    "Ford Mustang Mach-E", "Nissan Ariya", "Polestar 2", "BMW i4",
]
PAINTS = list(VehiclePaint)


def find_available_spot(
    spots: list[ParkingSpot],
    vehicles: list[Vehicle] | None = None,
) -> ParkingSpot | None:
    """Free = not occupied, not reserved, and no live vehicle still assigned to it."""
    claimed: set[str] = set()
    if vehicles:
        for vehicle in vehicles:
            if vehicle.status == VehicleStatus.departed:
                continue
            if vehicle.spot_id:
                claimed.add(vehicle.spot_id)

    return next(
        (
            s for s in spots
            if not s.occupied_vehicle_id
            and not s.reserved_vehicle_id
            and s.id not in claimed
        ),
        None,
    )


def find_spot_by_id(spots: list[ParkingSpot], spot_id: str) -> ParkingSpot | None:
    return next((s for s in spots if s.id == spot_id), None)


def count_active_vehicles(vehicles: list[Vehicle]) -> int:
    return sum(1 for v in vehicles if v.status != VehicleStatus.departed)


def occupancy_ratio(vehicles: list[Vehicle], spots: list[ParkingSpot]) -> float:
    if not spots:
        return 1.0
    return count_active_vehicles(vehicles) / len(spots)


def should_skip_arrival(vehicles: list[Vehicle], spots: list[ParkingSpot]) -> bool:
    return occupancy_ratio(vehicles, spots) >= TARGET_OCCUPANCY_MAX


def reserve_spot(spot: ParkingSpot, vehicle_id: str) -> ParkingSpot:
    return spot.model_copy(update={"reserved_vehicle_id": vehicle_id})


def spawn_vehicle(
    spot: ParkingSpot,
    current_tick: int,
    new_vehicle_id: str,
    *,
    plan: dict[str, Any] | None = None,
) -> Vehicle:
    if plan:
        battery = float(plan["battery"])
        target_battery = float(plan["target_battery"])
        departure_offset = int(plan.get("departure_offset", 12000))
        model = str(plan["model"])
        paint = VehiclePaint(plan["paint"])
        requested = float(plan.get("requested_kwh") or 0)
    else:
        overnight = random.random() < OVERNIGHT_PROBABILITY
        battery = float(random.randint(15, 75))
        target_battery = float(random.randint(70, 90))
        if overnight:
            departure_offset = random.randint(
                OVERNIGHT_DEPARTURE_OFFSET_MIN, OVERNIGHT_DEPARTURE_OFFSET_MAX
            )
        else:
            departure_offset = random.randint(
                SHORT_STAY_DEPARTURE_OFFSET_MIN, SHORT_STAY_DEPARTURE_OFFSET_MAX
            )
        model = random.choice(MODELS)
        paint = random.choice(PAINTS)
        requested = 0.0

    entrance = Position(**GARAGE_ENTRANCE)
    route = build_vehicle_entry_route(spot)
    heading = heading_to_first_segment(entrance, route)

    temp = Vehicle(
        id="temp",
        model=model,
        paint=paint,
        spot_id=spot.id,
        position=entrance,
        status=VehicleStatus.parked,
        battery=battery,
        target_battery=target_battery,
        expected_departure_tick=current_tick + departure_offset,
    )
    priority = calculate_vehicle_priority(temp, current_tick)

    return Vehicle(
        id=new_vehicle_id,
        model=model,
        paint=paint,
        spot_id=spot.id,
        position=entrance,
        status=VehicleStatus.entering,
        battery=battery,
        target_battery=target_battery,
        requested_energy_kwh=requested,
        priority=priority,
        arrival_tick=current_tick,
        expected_departure_tick=current_tick + departure_offset,
        route=route,
        route_index=0,
        heading=heading,
    )
