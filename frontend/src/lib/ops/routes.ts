export * from "../routes";

import type { GaragePosition, ParkingSpot } from "../types";
import {
  BOTTOM_ROW_LANE_Y,
  GARAGE_ENTRANCE,
  GARAGE_EXIT,
  LANE_CENTER_Y,
  TOP_ROW_LANE_Y,
} from "./constants";

function cleanRoute(from: GaragePosition, points: GaragePosition[]): GaragePosition[] {
  return points.filter((point, index) => {
    const previous = index === 0 ? from : points[index - 1];
    return Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.01;
  });
}

export function aisleYForRow(row: "top" | "bottom"): number {
  return row === "top" ? TOP_ROW_LANE_Y : BOTTOM_ROW_LANE_Y;
}

export function vehicleLanePoint(spot: ParkingSpot): GaragePosition {
  return { x: spot.position.x, y: aisleYForRow(spot.row) };
}

/** Route from garage entrance to a parking spot via main lane. */
export function buildVehicleEntryRoute(
  spot: ParkingSpot,
  from: GaragePosition = GARAGE_ENTRANCE,
): GaragePosition[] {
  const lane = vehicleLanePoint(spot);
  return cleanRoute(from, [
    { x: from.x, y: LANE_CENTER_Y },
    { x: spot.position.x, y: LANE_CENTER_Y },
    lane,
    spot.position,
  ]);
}

/** Route from parked spot to garage exit — vertical to aisle first, never through neighbors. */
export function buildVehicleExitRoute(
  spot: ParkingSpot,
  from: GaragePosition = spot.position,
  to: GaragePosition = GARAGE_EXIT,
): GaragePosition[] {
  const lane = vehicleLanePoint(spot);
  return cleanRoute(from, [
    { x: from.x, y: lane.y },
    lane,
    { x: spot.position.x, y: LANE_CENTER_Y },
    { x: to.x, y: LANE_CENTER_Y },
    to,
  ]);
}

/** Peel onto a parallel aisle around a blocker, then resume to destination. */
export function buildDetourAroundObstacle(
  from: GaragePosition,
  destination: GaragePosition,
  blocker: GaragePosition,
): GaragePosition[] {
  let detourY: number;
  if (Math.abs(blocker.y - LANE_CENTER_Y) < 6) {
    detourY = destination.y <= LANE_CENTER_Y ? TOP_ROW_LANE_Y : BOTTOM_ROW_LANE_Y;
  } else if (blocker.y < LANE_CENTER_Y) {
    detourY = BOTTOM_ROW_LANE_Y;
  } else {
    detourY = TOP_ROW_LANE_Y;
  }

  const close = Math.hypot(from.x - blocker.x, from.y - blocker.y) < 7;
  const stepSize = close ? 12 : 6;
  const step = detourY > from.y ? stepSize : -stepSize;
  let midY = from.y + step;
  if ((step > 0 && midY > detourY) || (step < 0 && midY < detourY)) {
    midY = detourY;
  }

  let passX = blocker.x + (destination.x >= from.x ? 16 : -16);
  passX = Math.max(8, Math.min(92, passX));

  return cleanRoute(from, [
    { x: from.x, y: midY },
    { x: from.x, y: detourY },
    { x: passX, y: detourY },
    { x: destination.x, y: detourY },
    destination,
  ]);
}
