import type { GaragePosition, ParkingSpot } from "./types";

/**
 * Tiny movement model for the local simulation.
 * Distances are in canvas percentage units; one "Simulate Update" click
 * moves a robot STEP_DISTANCE units along a straight line to its target.
 */

const STEP_DISTANCE = 24;

/** Where a robot parks to serve a car: lane-side of the spot, nozzle facing it. */
export function laneSideTarget(spot: ParkingSpot): GaragePosition {
  return { x: spot.position.x, y: spot.rotation === 0 ? 27 : 73 };
}

export function distance(a: GaragePosition, b: GaragePosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** One simulation step toward the target; snaps to it when within range. */
export function stepToward(from: GaragePosition, to: GaragePosition): GaragePosition {
  const d = distance(from, to);
  if (d <= STEP_DISTANCE) return to;
  const t = STEP_DISTANCE / d;
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
}

export function hasArrived(position: GaragePosition, target: GaragePosition): boolean {
  return distance(position, target) < 0.01;
}

/** Rough ETA label from remaining travel distance, e.g. "~2 min". */
export function etaLabel(from: GaragePosition, to: GaragePosition): string {
  return `~${Math.max(1, Math.ceil(distance(from, to) / STEP_DISTANCE))} min`;
}
