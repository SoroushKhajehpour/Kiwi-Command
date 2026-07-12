import type { GaragePosition, ParkingSpot, Robot } from "./types";

const LANE_CENTER_Y = 50;
export const ROBOT_SPEED = 14;

function samePoint(a: GaragePosition, b: GaragePosition): boolean {
  return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
}

function uniqueWaypoints(points: GaragePosition[]): GaragePosition[] {
  return points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]));
}

export function servicePosition(spot: ParkingSpot): GaragePosition {
  return { x: spot.position.x, y: spot.rotation === 0 ? 27 : 73 };
}

/** Route via the center driving lane so robots never cut through parked cars. */
export function buildServiceRoute(from: GaragePosition, spot: ParkingSpot): GaragePosition[] {
  const target = servicePosition(spot);
  return uniqueWaypoints([
    { x: from.x, y: LANE_CENTER_Y },
    { x: target.x, y: LANE_CENTER_Y },
    target,
  ]).filter((point) => !samePoint(point, from));
}

export function buildDockRoute(from: GaragePosition, dock: GaragePosition): GaragePosition[] {
  return uniqueWaypoints([
    { x: from.x, y: LANE_CENTER_Y },
    { x: dock.x, y: LANE_CENTER_Y },
    dock,
  ]).filter((point) => !samePoint(point, from));
}

export function headingTo(from: GaragePosition, to: GaragePosition): number {
  const degrees = Math.atan2(to.x - from.x, -(to.y - from.y)) * (180 / Math.PI);
  return (degrees + 360) % 360;
}

export function routeDistance(robot: Robot): number {
  const remaining = robot.route.slice(robot.routeIndex);
  let from = robot.position;
  return remaining.reduce((total, point) => {
    const distance = Math.hypot(point.x - from.x, point.y - from.y);
    from = point;
    return total + distance;
  }, 0);
}

export function advanceRobot(robot: Robot, elapsedSeconds: number): { robot: Robot; arrived: boolean } {
  if (robot.routeIndex >= robot.route.length) return { robot, arrived: true };

  let position = robot.position;
  let routeIndex = robot.routeIndex;
  let distanceBudget = ROBOT_SPEED * elapsedSeconds;
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
