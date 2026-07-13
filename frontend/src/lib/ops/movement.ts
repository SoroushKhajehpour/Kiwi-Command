import { headingTo } from "../movement";
import type { GaragePosition, ParkingSpot, Robot, Vehicle } from "../types";
import {
  ARRIVAL_DISTANCE_THRESHOLD,
  MAX_VEHICLE_YIELD_TICKS,
  MAX_YIELD_TICKS,
  ROBOT_COLLISION_RADIUS,
  ROBOT_MAP_UNITS_PER_SECOND,
  VEHICLE_COLLISION_RADIUS,
  VEHICLE_MAP_UNITS_PER_SECOND,
} from "./constants";
import { hasReachedPosition, isPositionSafeForRobot } from "./collision";
import { buildDetourAroundObstacle } from "./routes";

const MOVING_VEHICLE = new Set(["leaving", "entering", "parking"]);

function nextOrthogonalTarget(
  pos: GaragePosition,
  waypoint: GaragePosition,
  preferVertical = false,
): GaragePosition {
  const dx = waypoint.x - pos.x;
  const dy = waypoint.y - pos.y;
  if (Math.abs(dx) > 0.05 && Math.abs(dy) > 0.05) {
    if (preferVertical) return { x: pos.x, y: waypoint.y };
    return { x: waypoint.x, y: pos.y };
  }
  return waypoint;
}

function advanceAlongRoute(
  position: GaragePosition,
  routeIndex: number,
  route: GaragePosition[],
  heading: number,
  speed: number,
  elapsedSeconds: number,
  options?: { preferVertical?: boolean; singleAxisPerTick?: boolean },
): { position: GaragePosition; routeIndex: number; heading: number; arrived: boolean } {
  if (!route.length || routeIndex >= route.length) {
    return { position, routeIndex: Math.max(routeIndex, route.length), heading, arrived: true };
  }

  const preferVertical = options?.preferVertical ?? false;
  const singleAxis = options?.singleAxisPerTick ?? false;
  let nextPosition = position;
  let nextIndex = routeIndex;
  let distanceBudget = speed * elapsedSeconds;
  let nextHeading = heading;
  let movedAxis = false;

  while (distanceBudget > 0 && nextIndex < route.length) {
    const waypoint = route[nextIndex];
    let target = nextOrthogonalTarget(nextPosition, waypoint, preferVertical);
    let segmentDistance = Math.hypot(target.x - nextPosition.x, target.y - nextPosition.y);

    if (segmentDistance < 0.001) {
      if (hasReachedPosition(nextPosition, waypoint, ARRIVAL_DISTANCE_THRESHOLD * 0.5)) {
        nextPosition = waypoint;
        nextIndex += 1;
        if (singleAxis && movedAxis) break;
        continue;
      }
      target = waypoint;
      segmentDistance = Math.hypot(target.x - nextPosition.x, target.y - nextPosition.y);
      if (segmentDistance < 0.001) {
        nextPosition = waypoint;
        nextIndex += 1;
        if (singleAxis && movedAxis) break;
        continue;
      }
    }

    nextHeading = headingTo(nextPosition, target);

    if (segmentDistance <= distanceBudget || segmentDistance <= ARRIVAL_DISTANCE_THRESHOLD * 0.35) {
      nextPosition = target;
      distanceBudget -= segmentDistance;
      movedAxis = true;
      if (hasReachedPosition(nextPosition, waypoint, ARRIVAL_DISTANCE_THRESHOLD * 0.5)) {
        nextPosition = waypoint;
        nextIndex += 1;
      }
      if (singleAxis) break;
    } else {
      const ratio = distanceBudget / segmentDistance;
      nextPosition = {
        x: nextPosition.x + (target.x - nextPosition.x) * ratio,
        y: nextPosition.y + (target.y - nextPosition.y) * ratio,
      };
      distanceBudget = 0;
      movedAxis = true;
    }
  }

  const final = route[route.length - 1];
  let arrived = nextIndex >= route.length;
  if (!arrived && hasReachedPosition(nextPosition, final)) {
    return { position: final, routeIndex: route.length, heading: nextHeading, arrived: true };
  }

  return {
    position: nextPosition,
    routeIndex: nextIndex,
    heading: nextHeading,
    arrived,
  };
}

function nearestBlockingVehicle(
  position: GaragePosition,
  vehicles: Vehicle[],
  ignoreVehicleId: string | null,
  radius: number,
): Vehicle | null {
  let nearest: Vehicle | null = null;
  let nearestDist = Infinity;
  for (const vehicle of vehicles) {
    if (vehicle.status === "departed") continue;
    if (ignoreVehicleId && vehicle.id === ignoreVehicleId) continue;
    const dist = Math.hypot(position.x - vehicle.position.x, position.y - vehicle.position.y);
    if (dist < radius && dist < nearestDist) {
      nearest = vehicle;
      nearestDist = dist;
    }
  }
  return nearest;
}

export function advanceRobotWithCollisionAvoidance(
  robot: Robot,
  elapsedSeconds: number,
  robots: Robot[],
  vehicles: Vehicle[],
  spots: ParkingSpot[],
  currentTick: number,
): { robot: Robot; arrived: boolean; yielded: boolean } {
  if (robot.status !== "en-route" && robot.status !== "returning") {
    return {
      robot,
      arrived: Boolean(robot.route.length) && robot.routeIndex >= robot.route.length,
      yielded: false,
    };
  }

  if (!robot.route.length || robot.routeIndex >= robot.route.length) {
    return { robot, arrived: true, yielded: false };
  }

  const final = robot.route[robot.route.length - 1];
  const nearFinal = hasReachedPosition(robot.position, final, ARRIVAL_DISTANCE_THRESHOLD * 2.5);
  const ignoreVehicleId = robot.status === "en-route" ? robot.assignedVehicleId : null;
  const vehicleNearby = nearestBlockingVehicle(
    robot.position,
    vehicles,
    nearFinal ? ignoreVehicleId : null,
    ROBOT_COLLISION_RADIUS + VEHICLE_COLLISION_RADIUS + 3,
  );
  const movingCar = Boolean(vehicleNearby && MOVING_VEHICLE.has(vehicleNearby.status));
  const yieldStarted = robot.lastYieldTick ?? currentTick;
  const blockedTicks = robot.lastYieldTick ? currentTick - robot.lastYieldTick : 0;

  // Leaving/entering cars: peel onto a parallel aisle immediately.
  if (vehicleNearby && movingCar && !nearFinal) {
    const detour = buildDetourAroundObstacle(robot.position, final, vehicleNearby.position);
    if (detour.length > 0) {
      const moved = advanceAlongRoute(
        robot.position,
        0,
        detour,
        headingTo(robot.position, detour[0]),
        ROBOT_MAP_UNITS_PER_SECOND,
        elapsedSeconds,
      );
      return {
        robot: {
          ...robot,
          route: detour,
          routeIndex: moved.routeIndex,
          position: moved.position,
          heading: moved.heading,
          motionState: "moving",
          lastYieldTick: undefined,
        },
        arrived: moved.arrived,
        yielded: false,
      };
    }
  }

  const preview = advanceAlongRoute(
    robot.position,
    robot.routeIndex,
    robot.route,
    robot.heading,
    ROBOT_MAP_UNITS_PER_SECOND,
    elapsedSeconds,
  );

  let safe = isPositionSafeForRobot(preview.position, robot.id, robots, vehicles, spots, {
    ignoreVehicleId,
    finalApproach: nearFinal,
  });

  // After a short hold (or against a moving car), force progress — never deadlock.
  if (!safe && (blockedTicks >= MAX_YIELD_TICKS || movingCar)) {
    if (vehicleNearby) {
      const detour = buildDetourAroundObstacle(robot.position, final, vehicleNearby.position);
      if (detour.length > 0) {
        const moved = advanceAlongRoute(
          robot.position,
          0,
          detour,
          headingTo(robot.position, detour[0]),
          ROBOT_MAP_UNITS_PER_SECOND * 0.85,
          elapsedSeconds,
        );
        return {
          robot: {
            ...robot,
            route: detour,
            routeIndex: moved.routeIndex,
            position: moved.position,
            heading: moved.heading,
            motionState: "moving",
            lastYieldTick: undefined,
          },
          arrived: moved.arrived,
          yielded: false,
        };
      }
    }
    safe = true;
  }

  if (!safe) {
    return {
      robot: {
        ...robot,
        lastYieldTick: robot.lastYieldTick ? robot.lastYieldTick : currentTick,
        motionState: "yielding",
      },
      arrived: false,
      yielded: true,
    };
  }

  const moved = advanceAlongRoute(
    robot.position,
    robot.routeIndex,
    robot.route,
    robot.heading,
    ROBOT_MAP_UNITS_PER_SECOND,
    elapsedSeconds,
  );

  return {
    robot: {
      ...robot,
      position: moved.position,
      routeIndex: moved.routeIndex,
      heading: moved.heading,
      status: robot.status,
      motionState: "moving",
      lastYieldTick: moved.arrived || safe ? undefined : yieldStarted,
    },
    arrived: moved.arrived,
    yielded: false,
  };
}

export function advanceVehicleWithCollisionAvoidance(
  vehicle: Vehicle,
  elapsedSeconds: number,
  robots: Robot[],
  vehicles: Vehicle[],
  currentTick: number,
): { vehicle: Vehicle; arrived: boolean; yielded: boolean } {
  if (
    vehicle.status !== "entering"
    && vehicle.status !== "parking"
    && vehicle.status !== "leaving"
  ) {
    return { vehicle, arrived: vehicle.routeIndex >= vehicle.route.length, yielded: false };
  }

  if (!vehicle.route.length || vehicle.routeIndex >= vehicle.route.length) {
    return { vehicle, arrived: true, yielded: false };
  }

  const preview = advanceAlongRoute(
    vehicle.position,
    vehicle.routeIndex,
    vehicle.route,
    vehicle.heading,
    VEHICLE_MAP_UNITS_PER_SECOND,
    elapsedSeconds,
    { preferVertical: true, singleAxisPerTick: true },
  );

  const blockedByCar = vehicles.some((other) => (
    other.id !== vehicle.id
    && other.status !== "departed"
    && Math.hypot(preview.position.x - other.position.x, preview.position.y - other.position.y) < 6
  ));

  if (blockedByCar) {
    return { vehicle, arrived: false, yielded: true };
  }

  const robotBlocked = robots.some((robot) => (
    robot.status !== "docked"
    && robot.status !== "idle"
    && robot.status !== "faulted"
    && Math.hypot(preview.position.x - robot.position.x, preview.position.y - robot.position.y)
      < ROBOT_COLLISION_RADIUS + VEHICLE_COLLISION_RADIUS
  ));
  if (robotBlocked) {
    const yieldStart = vehicle.lastYieldTick ?? currentTick;
    const yieldedFor = vehicle.lastYieldTick ? currentTick - yieldStart : 0;
    const maxWait = vehicle.status === "leaving" ? 3 : MAX_VEHICLE_YIELD_TICKS;
    if (!vehicle.lastYieldTick || yieldedFor < maxWait) {
      return {
        vehicle: { ...vehicle, lastYieldTick: vehicle.lastYieldTick ?? currentTick },
        arrived: false,
        yielded: true,
      };
    }
  }

  const moved = advanceAlongRoute(
    vehicle.position,
    vehicle.routeIndex,
    vehicle.route,
    vehicle.heading,
    VEHICLE_MAP_UNITS_PER_SECOND,
    elapsedSeconds,
    { preferVertical: true, singleAxisPerTick: true },
  );

  return {
    vehicle: {
      ...vehicle,
      position: moved.position,
      routeIndex: moved.routeIndex,
      heading: moved.heading,
      lastYieldTick: 0,
    },
    arrived: moved.arrived,
    yielded: false,
  };
}
