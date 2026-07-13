import { calculateRouteDistance, DEMO_ROBOT_MAP_UNITS_PER_SECOND } from "./routes";
import type { GaragePosition, Robot } from "./types";

export function headingTo(from: GaragePosition, to: GaragePosition): number {
  const degrees = Math.atan2(to.x - from.x, -(to.y - from.y)) * (180 / Math.PI);
  return (degrees + 360) % 360;
}

export function routeDistance(robot: Robot): number {
  return calculateRouteDistance(robot.position, robot.route, robot.routeIndex);
}

function nextOrthogonalTarget(pos: GaragePosition, waypoint: GaragePosition): GaragePosition {
  const dx = waypoint.x - pos.x;
  const dy = waypoint.y - pos.y;
  if (Math.abs(dx) > 0.05 && Math.abs(dy) > 0.05) {
    return { x: waypoint.x, y: pos.y };
  }
  return waypoint;
}

export function advanceRobot(robot: Robot, elapsedSeconds: number): { robot: Robot; arrived: boolean } {
  if (robot.routeIndex >= robot.route.length) return { robot, arrived: true };

  let position = robot.position;
  let routeIndex = robot.routeIndex;
  let distanceBudget = DEMO_ROBOT_MAP_UNITS_PER_SECOND * elapsedSeconds;
  let heading = robot.heading;

  while (distanceBudget > 0 && routeIndex < robot.route.length) {
    const waypoint = robot.route[routeIndex];
    let target = nextOrthogonalTarget(position, waypoint);
    let distance = Math.hypot(target.x - position.x, target.y - position.y);

    if (distance < 0.001) {
      const remaining = Math.hypot(waypoint.x - position.x, waypoint.y - position.y);
      if (remaining < 0.8) {
        position = waypoint;
        routeIndex += 1;
        continue;
      }
      target = waypoint;
      distance = remaining;
    }

    heading = headingTo(position, target);

    if (distance <= distanceBudget) {
      position = target;
      distanceBudget -= distance;
      if (Math.hypot(waypoint.x - position.x, waypoint.y - position.y) < 0.8) {
        position = waypoint;
        routeIndex += 1;
      }
    } else {
      const ratio = distanceBudget / distance;
      position = {
        x: position.x + (target.x - position.x) * ratio,
        y: position.y + (target.y - position.y) * ratio,
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
