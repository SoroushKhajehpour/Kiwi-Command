import { calculateRouteDistance, DEMO_ROBOT_MAP_UNITS_PER_SECOND } from "./routes";
import type { GaragePosition, Robot } from "./types";

export function headingTo(from: GaragePosition, to: GaragePosition): number {
  const degrees = Math.atan2(to.x - from.x, -(to.y - from.y)) * (180 / Math.PI);
  return (degrees + 360) % 360;
}

export function routeDistance(robot: Robot): number {
  return calculateRouteDistance(robot.position, robot.route, robot.routeIndex);
}

export function advanceRobot(robot: Robot, elapsedSeconds: number): { robot: Robot; arrived: boolean } {
  if (robot.routeIndex >= robot.route.length) return { robot, arrived: true };

  let position = robot.position;
  let routeIndex = robot.routeIndex;
  let distanceBudget = DEMO_ROBOT_MAP_UNITS_PER_SECOND * elapsedSeconds;
  let heading = robot.heading;

  while (distanceBudget > 0 && routeIndex < robot.route.length) {
    const waypoint = robot.route[routeIndex];
    const distance = Math.hypot(waypoint.x - position.x, waypoint.y - position.y);
    heading = headingTo(position, waypoint);

    if (distance <= distanceBudget) {
      position = waypoint;
      distanceBudget -= distance;
      routeIndex += 1;
    } else {
      const ratio = distanceBudget / distance;
      position = {
        x: position.x + (waypoint.x - position.x) * ratio,
        y: position.y + (waypoint.y - position.y) * ratio,
      };
      distanceBudget = 0;
    }
  }

  const arrived = routeIndex >= robot.route.length;
  return {
    robot: {
      ...robot,
      position,
      routeIndex,
      heading,
      targetPosition: arrived ? null : robot.route[robot.route.length - 1],
    },
    arrived,
  };
}
