import type { GaragePosition, ParkingSpot, Robot, Vehicle } from "../types";
import { ROBOT_COLLISION_RADIUS, VEHICLE_COLLISION_RADIUS } from "./constants";

function distance(a: GaragePosition, b: GaragePosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function tooClose(position: GaragePosition, other: GaragePosition, minDistance: number): boolean {
  return distance(position, other) < minDistance;
}

export function isPositionSafeForRobot(
  position: GaragePosition,
  robotId: string,
  robots: Robot[],
  vehicles: Vehicle[],
  spots: ParkingSpot[],
): boolean {
  for (const robot of robots) {
    if (robot.id === robotId || robot.status === "faulted") continue;
    if (tooClose(position, robot.position, ROBOT_COLLISION_RADIUS * 2)) return false;
  }

  for (const vehicle of vehicles) {
    if (vehicle.status === "departed") continue;
    const isMoving = vehicle.status === "entering" || vehicle.status === "parking" || vehicle.status === "leaving";
    const parked = vehicle.status === "parked" || vehicle.status === "waiting"
      || vehicle.status === "assigned" || vehicle.status === "en_route"
      || vehicle.status === "charging" || vehicle.status === "completed"
      || vehicle.status === "backup-needed";

    if (isMoving || parked) {
      if (tooClose(position, vehicle.position, ROBOT_COLLISION_RADIUS + VEHICLE_COLLISION_RADIUS)) {
        return false;
      }
    }
  }

  for (const spot of spots) {
    if (!spot.occupiedVehicleId) continue;
    if (tooClose(position, spot.position, ROBOT_COLLISION_RADIUS + VEHICLE_COLLISION_RADIUS)) {
      return false;
    }
  }

  return true;
}

export function isPositionSafeForVehicle(
  position: GaragePosition,
  vehicleId: string,
  robots: Robot[],
  vehicles: Vehicle[],
): boolean {
  for (const robot of robots) {
    if (robot.status === "faulted") continue;
    if (tooClose(position, robot.position, ROBOT_COLLISION_RADIUS + VEHICLE_COLLISION_RADIUS)) {
      return false;
    }
  }

  for (const vehicle of vehicles) {
    if (vehicle.id === vehicleId || vehicle.status === "departed") continue;
    if (tooClose(position, vehicle.position, VEHICLE_COLLISION_RADIUS * 2)) return false;
  }

  return true;
}
