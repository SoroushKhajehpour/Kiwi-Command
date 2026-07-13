import type { DockBay, GaragePosition, ParkingSpot, Robot } from "./types";

export const METERS_PER_MAP_UNIT = 1.8;
export const ROBOT_METERS_PER_SECOND = 1.4;
export const DEMO_ROBOT_MAP_UNITS_PER_SECOND = 14;
const LANE_CENTER_Y = 50;

/** Blocked stretch of the main lane near P2-18. */
export const LANE_BLOCK_ZONE = {
  label: "P2-18",
  x: 52,
  y: 50,
  width: 12,
  height: 9,
  xMin: 45,
  xMax: 59,
};

export function calculateDistance(a: GaragePosition, b: GaragePosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function samePoint(a: GaragePosition, b: GaragePosition): boolean {
  return calculateDistance(a, b) < 0.01;
}

function cleanRoute(from: GaragePosition, points: GaragePosition[]): GaragePosition[] {
  return points.filter((point, index) => {
    const previous = index === 0 ? from : points[index - 1];
    return !samePoint(point, previous);
  });
}

export function getVehicleServicePoint(spot: ParkingSpot): GaragePosition {
  return {
    x: spot.position.x + 3,
    y: spot.rotation === 0 ? 28 : 72,
  };
}

export function getVehicleConnectionPoint(spot: ParkingSpot): GaragePosition {
  return {
    x: spot.position.x + 1.5,
    y: spot.rotation === 0 ? 27 : 73,
  };
}

function laneTravelCrossesBlock(fromX: number, toX: number): boolean {
  const minX = Math.min(fromX, toX);
  const maxX = Math.max(fromX, toX);
  return minX < LANE_BLOCK_ZONE.xMax && maxX > LANE_BLOCK_ZONE.xMin;
}

export function buildRouteToVehicle(
  from: GaragePosition,
  spot: ParkingSpot,
  options?: { laneBlocked?: boolean },
): GaragePosition[] {
  const servicePoint = getVehicleServicePoint(spot);

  if (options?.laneBlocked && laneTravelCrossesBlock(from.x, servicePoint.x)) {
    return cleanRoute(from, [
      { x: from.x, y: LANE_CENTER_Y },
      { x: 30, y: LANE_CENTER_Y },
      { x: 30, y: 68 },
      { x: servicePoint.x, y: 68 },
      servicePoint,
    ]);
  }

  return cleanRoute(from, [
    { x: from.x, y: LANE_CENTER_Y },
    { x: servicePoint.x, y: LANE_CENTER_Y },
    servicePoint,
  ]);
}

export function buildRouteToDock(
  from: GaragePosition,
  bay: DockBay,
  options?: { laneBlocked?: boolean },
): GaragePosition[] {
  if (options?.laneBlocked && laneTravelCrossesBlock(from.x, bay.position.x)) {
    return cleanRoute(from, [
      { x: from.x, y: LANE_CENTER_Y },
      { x: 30, y: LANE_CENTER_Y },
      { x: 30, y: 68 },
      { x: bay.position.x, y: 68 },
      { x: bay.position.x, y: LANE_CENTER_Y },
      bay.position,
    ]);
  }

  return cleanRoute(from, [
    { x: from.x, y: LANE_CENTER_Y },
    { x: bay.position.x, y: LANE_CENTER_Y },
    bay.position,
  ]);
}

export function calculateRouteDistance(
  position: GaragePosition,
  route: GaragePosition[],
  routeIndex = 0,
): number {
  let cursor = position;
  return route.slice(routeIndex).reduce((total, waypoint) => {
    const segment = calculateDistance(cursor, waypoint);
    cursor = waypoint;
    return total + segment;
  }, 0);
}

export function routeDistanceMeters(
  position: GaragePosition,
  route: GaragePosition[],
  routeIndex = 0,
): number {
  return calculateRouteDistance(position, route, routeIndex) * METERS_PER_MAP_UNIT;
}

export function etaSecondsForRoute(
  position: GaragePosition,
  route: GaragePosition[],
  routeIndex = 0,
): number {
  return routeDistanceMeters(position, route, routeIndex) / ROBOT_METERS_PER_SECOND;
}

export function getAvailableDockBay(
  robots: Robot[],
  dockBays: DockBay[],
  robotId?: string,
): DockBay | null {
  const claimed = new Set(
    robots
      .filter((robot) => robot.id !== robotId && robot.dockBayId)
      .map((robot) => robot.dockBayId),
  );
  return dockBays.find((bay) => !claimed.has(bay.id)) ?? null;
}

export function nearestDockDistanceMeters(from: GaragePosition, dockBays: DockBay[]): number {
  if (dockBays.length === 0) return 0;
  return Math.min(...dockBays.map((bay) => (
    calculateRouteDistance(from, buildRouteToDock(from, bay)) * METERS_PER_MAP_UNIT
  )));
}
