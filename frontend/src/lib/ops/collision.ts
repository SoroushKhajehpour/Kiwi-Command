import type { GaragePosition, ParkingSpot, Robot, Vehicle } from "../types";
import {
  ARRIVAL_DISTANCE_THRESHOLD,
  MAX_YIELD_TICKS,
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

export function isPositionSafeForVehicle(
  position: GaragePosition,
  vehicleId: string,
  robots: Robot[],
  vehicles: Vehicle[],
): boolean {
  for (const robot of robots) {
    if ((robot.status === "docked" || robot.status === "idle") && (robot.position.x <= 12 || robot.position.x >= 88)) {
      continue;
    }
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

export function findSafeFaultPosition(
  robot: Robot,
  robots: Robot[],
  vehicles: Vehicle[],
): GaragePosition {
  const towardLane = robot.position.y < 50 ? 1 : -1;
  const offsets = [
    [0, towardLane * 6],
    [0, towardLane * 8],
    [6, towardLane * 4],
    [-6, towardLane * 4],
    [8, 0], [-8, 0],
    [0, towardLane * 10],
  ] as const;

  for (const [dx, dy] of offsets) {
    const candidate = { x: robot.position.x + dx, y: robot.position.y + dy };
    if (candidate.x < 4 || candidate.x > 96 || candidate.y < 18 || candidate.y > 88) continue;
    if (candidate.y >= 45 && candidate.y <= 55 && candidate.x < 12) continue;

    const blockedByRobot = robots.some((other) => (
      other.id !== robot.id && tooClose(candidate, other.position, MIN_ROBOT_SEPARATION)
    ));
    if (blockedByRobot) continue;

    const blockedByVehicle = vehicles.some((vehicle) => {
      if (vehicle.status === "departed") return false;
      if (tooClose(candidate, vehicle.position, ROBOT_COLLISION_RADIUS + VEHICLE_COLLISION_RADIUS + 2)) return true;
      const serviceY = vehicle.position.y < 50 ? 28 : 72;
      return tooClose(candidate, { x: vehicle.position.x + 3, y: serviceY }, MIN_ROBOT_SEPARATION);
    });
    if (blockedByVehicle) continue;

    return candidate;
  }

  return { x: Math.max(12, Math.min(88, robot.position.x)), y: 50 };
}

export function shouldForceThroughYield(robot: Robot, currentTick: number): boolean {
  const started = robot.lastYieldTick ?? 0;
  return started > 0 && currentTick - started >= MAX_YIELD_TICKS;
}
