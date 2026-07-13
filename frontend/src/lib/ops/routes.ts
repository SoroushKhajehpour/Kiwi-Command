export * from "../routes";

import type { GaragePosition, ParkingSpot } from "../types";
import { GARAGE_ENTRANCE, GARAGE_EXIT } from "./constants";

const LANE_CENTER_Y = 50;

function cleanRoute(from: GaragePosition, points: GaragePosition[]): GaragePosition[] {
  return points.filter((point, index) => {
    const previous = index === 0 ? from : points[index - 1];
    return Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.01;
  });
}

/** Route from garage entrance to a parking spot via main lane. */
export function buildVehicleEntryRoute(
  spot: ParkingSpot,
  from: GaragePosition = GARAGE_ENTRANCE,
): GaragePosition[] {
  const approachY = spot.row === "top" ? 28 : 72;
  return cleanRoute(from, [
    { x: from.x, y: LANE_CENTER_Y },
    { x: spot.position.x, y: LANE_CENTER_Y },
    { x: spot.position.x, y: approachY },
    spot.position,
  ]);
}

/** Route from parked spot to garage exit via main lane — vertical first, never diagonal. */
export function buildVehicleExitRoute(
  spot: ParkingSpot,
  from: GaragePosition = spot.position,
  to: GaragePosition = GARAGE_EXIT,
): GaragePosition[] {
  const approachY = spot.row === "top" ? 28 : 72;
  return cleanRoute(from, [
    { x: from.x, y: approachY },
    { x: spot.position.x, y: approachY },
    { x: spot.position.x, y: LANE_CENTER_Y },
    { x: to.x, y: LANE_CENTER_Y },
    to,
  ]);
}
