import { advanceRobot as advanceRobotBase, headingTo } from "../movement";
import type { GaragePosition, ParkingSpot, Robot, Vehicle } from "../types";
import {
  ARRIVAL_DISTANCE_THRESHOLD,
  MAX_YIELD_TICKS,
  ROBOT_MAP_UNITS_PER_SECOND,
  VEHICLE_MAP_UNITS_PER_SECOND,
} from "./constants";
import { hasReachedPosition, isPositionSafeForRobot } from "./collision";

export { headingTo } from "../movement";

export function advanceRobot(robot: Robot, elapsedSeconds: number) {
  return advanceRobotBase(robot, elapsedSeconds);
}

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

  if (!safe) {
    const started = robot.lastYieldTick ?? currentTick;
    if (robot.lastYieldTick && currentTick - robot.lastYieldTick >= MAX_YIELD_TICKS) {
      safe = true;
    } else {
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
      lastYieldTick: moved.arrived || safe ? undefined : robot.lastYieldTick,
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

  // Prefer demo progress: cars only soft-yield to other moving cars (robots yield to cars).
  const blockedByCar = vehicles.some((other) => (
    other.id !== vehicle.id
    && (other.status === "entering" || other.status === "parking" || other.status === "leaving")
    && Math.hypot(preview.position.x - other.position.x, preview.position.y - other.position.y) < 6
  ));

  if (blockedByCar) {
    return { vehicle, arrived: false, yielded: true };
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
    },
    arrived: moved.arrived,
    yielded: false,
  };
}
