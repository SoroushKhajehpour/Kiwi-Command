import type { GaragePosition, ParkingSpot, Robot, Vehicle } from "../types";
import {
  ARRIVAL_DISTANCE_THRESHOLD,
  MIN_ROBOT_SEPARATION,
  ROBOT_COLLISION_RADIUS,
  VEHICLE_COLLISION_RADIUS,
} from "./constants";

function distance(a: GaragePosition, b: GaragePosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function tooClose(position: GaragePosition, other: GaragePosition, minDistance: number): boolean {
  return distance(position, other) < minDistance;
}

export function hasReachedPosition(
  current: GaragePosition,
  target: GaragePosition,
  threshold = ARRIVAL_DISTANCE_THRESHOLD,
): boolean {
  return distance(current, target) <= threshold;
}

export function isPositionSafeForRobot(
  position: GaragePosition,
  robotId: string,
  robots: Robot[],
  vehicles: Vehicle[],
  spots: ParkingSpot[],
  options?: { ignoreVehicleId?: string | null; finalApproach?: boolean },
): boolean {
  const minSep = ROBOT_COLLISION_RADIUS * (options?.finalApproach ? 1.4 : 2);

  for (const robot of robots) {
    if (robot.id === robotId) continue;
    if (tooClose(position, robot.position, minSep * 2 > MIN_ROBOT_SEPARATION ? minSep : MIN_ROBOT_SEPARATION)) {
      return false;
    }
  }

  for (const vehicle of vehicles) {
    if (vehicle.status === "departed") continue;
    if (options?.ignoreVehicleId && vehicle.id === options.ignoreVehicleId) continue;
    if (tooClose(position, vehicle.position, ROBOT_COLLISION_RADIUS + VEHICLE_COLLISION_RADIUS)) {
      return false;
    }
  }

  for (const spot of spots) {
    if (!spot.occupiedVehicleId) continue;
    if (options?.ignoreVehicleId && spot.occupiedVehicleId === options.ignoreVehicleId) continue;
    if (tooClose(position, spot.position, ROBOT_COLLISION_RADIUS + VEHICLE_COLLISION_RADIUS)) {
      return false;
    }
  }

  return true;
}
