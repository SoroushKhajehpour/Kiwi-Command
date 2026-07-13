import { advanceRobot as advanceRobotBase, headingTo } from "../movement";
import type { GaragePosition, ParkingSpot, Robot, Vehicle } from "../types";
import { VEHICLE_MAP_UNITS_PER_SECOND } from "./constants";
import { isPositionSafeForRobot, isPositionSafeForVehicle } from "./collision";

export { headingTo } from "../movement";

export function advanceRobot(robot: Robot, elapsedSeconds: number) {
  return advanceRobotBase(robot, elapsedSeconds);
}

function advanceAlongRoute(
  position: GaragePosition,
  routeIndex: number,
  route: GaragePosition[],
  heading: number,
  speed: number,
  elapsedSeconds: number,
): { position: GaragePosition; routeIndex: number; heading: number; arrived: boolean } {
  if (routeIndex >= route.length) {
    return { position, routeIndex, heading, arrived: true };
  }

  let nextPosition = position;
  let nextIndex = routeIndex;
  let distanceBudget = speed * elapsedSeconds;
  let nextHeading = heading;

  while (distanceBudget > 0 && nextIndex < route.length) {
    const waypoint = route[nextIndex];
    const segmentDistance = Math.hypot(waypoint.x - nextPosition.x, waypoint.y - nextPosition.y);
    nextHeading = headingTo(nextPosition, waypoint);

    if (segmentDistance <= distanceBudget) {
      nextPosition = waypoint;
      distanceBudget -= segmentDistance;
      nextIndex += 1;
    } else {
      const ratio = distanceBudget / segmentDistance;
      nextPosition = {
        x: nextPosition.x + (waypoint.x - nextPosition.x) * ratio,
        y: nextPosition.y + (waypoint.y - nextPosition.y) * ratio,
      };
      distanceBudget = 0;
    }
  }

  return {
    position: nextPosition,
    routeIndex: nextIndex,
    heading: nextHeading,
    arrived: nextIndex >= route.length,
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
  if (
    (robot.status !== "en-route" && robot.status !== "returning" && robot.status !== "yielding")
    || robot.routeIndex >= robot.route.length
  ) {
    return { robot, arrived: robot.routeIndex >= robot.route.length, yielded: false };
  }

  const preview = advanceAlongRoute(
    robot.position,
    robot.routeIndex,
    robot.route,
    robot.heading,
    14,
    elapsedSeconds,
  );

  const safe = isPositionSafeForRobot(preview.position, robot.id, robots, vehicles, spots);
  if (!safe) {
    return {
      robot: {
        ...robot,
        status: "yielding",
        motionState: "yielding",
        lastYieldTick: currentTick,
      },
      arrived: false,
      yielded: true,
    };
  }

  const advanced = advanceRobotBase({
    ...robot,
    status: robot.status === "yielding" ? "en-route" : robot.status,
    motionState: "moving",
  }, elapsedSeconds);

  return {
    robot: {
      ...advanced.robot,
      motionState: "moving",
      status: robot.status === "yielding" ? "en-route" : robot.status,
    },
    arrived: advanced.arrived,
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
  const moving = vehicle.status === "entering" || vehicle.status === "parking" || vehicle.status === "leaving";
  if (!moving || vehicle.routeIndex >= vehicle.route.length) {
    return { vehicle, arrived: vehicle.routeIndex >= vehicle.route.length, yielded: false };
  }

  const preview = advanceAlongRoute(
    vehicle.position,
    vehicle.routeIndex,
    vehicle.route,
    vehicle.heading,
    VEHICLE_MAP_UNITS_PER_SECOND,
    elapsedSeconds,
  );

  if (!isPositionSafeForVehicle(preview.position, vehicle.id, robots, vehicles)) {
    return { vehicle, arrived: false, yielded: true };
  }

  const advanced = advanceAlongRoute(
    vehicle.position,
    vehicle.routeIndex,
    vehicle.route,
    vehicle.heading,
    VEHICLE_MAP_UNITS_PER_SECOND,
    elapsedSeconds,
  );

  return {
    vehicle: {
      ...vehicle,
      position: advanced.position,
      routeIndex: advanced.routeIndex,
      heading: advanced.heading,
    },
    arrived: advanced.arrived,
    yielded: false,
  };
}
