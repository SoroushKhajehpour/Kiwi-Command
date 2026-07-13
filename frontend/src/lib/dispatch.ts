import {
  buildRouteToVehicle,
  etaSecondsForRoute,
  getVehicleServicePoint,
  nearestDockDistanceMeters,
  routeDistanceMeters,
} from "./routes";
import { formatEta } from "./format";
import type { DockBay, GaragePosition, ParkingSpot, Robot, Vehicle } from "./types";

const ROBOT_CAPACITY_KWH = 100;
const RESERVE_PERCENT = 10;
const DELIVERY_EFFICIENCY = 0.9;
const TRAVEL_KWH_PER_METER = 0.01;

export interface RejectedRobot {
  robotId: string;
  reason: string;
}

export interface CandidateScore {
  robotId: string;
  score: number;
}

export interface DispatchDecision {
  vehicleId: string;
  selectedRobotId: string;
  selectedScore: number;
  selectedBattery: number;
  requestedEnergyKwh: number;
  distanceMeters: number;
  returnDistanceMeters: number;
  etaSeconds: number;
  route: GaragePosition[];
  reasons: string[];
  rejectedRobots: RejectedRobot[];
  candidateScores: CandidateScore[];
}

export interface DispatchOptions {
  laneBlocked?: boolean;
}

function statusRejection(robot: Robot): string | null {
  if (robot.status === "faulted") return "faulted";
  if (robot.assignedVehicleId) return `already assigned to ${robot.assignedVehicleId}`;
  if (robot.status === "charging") return "already charging";
  if (robot.status === "returning") return "returning to dock";
  if (robot.status === "en-route") return "already en route";
  if (robot.status !== "idle" && robot.status !== "docked") return "unavailable";
  if (robot.battery < 20) return `battery critical at ${Math.round(robot.battery)}%`;
  return null;
}

function batteryPenalty(battery: number): number {
  if (battery < 35) return 50;
  if (battery < 50) return 20;
  return 0;
}

function statusPenalty(robot: Robot): number {
  return robot.status === "docked" ? 0 : 2;
}

function deliverableEnergyKwh(robot: Robot, travelMeters: number): number {
  const usableBatteryKwh = Math.max(0, robot.battery - RESERVE_PERCENT) / 100 * ROBOT_CAPACITY_KWH;
  return usableBatteryKwh * DELIVERY_EFFICIENCY - travelMeters * TRAVEL_KWH_PER_METER;
}

export function selectBestRobot(
  robots: Robot[],
  vehicle: Vehicle,
  spots: ParkingSpot[],
  dockBays: DockBay[],
  options: DispatchOptions = {},
): DispatchDecision | null {
  if (!vehicle.spotId) return null;
  const spot = spots.find((item) => item.id === vehicle.spotId);
  if (!spot) return null;

  const requestedKwh = vehicle.requestedEnergyKwh ?? 22;
  const rejectedRobots: RejectedRobot[] = [];
  const eligible: Array<{
    robot: Robot;
    route: GaragePosition[];
    distanceMeters: number;
    returnDistanceMeters: number;
    etaSeconds: number;
    score: number;
  }> = [];

  for (const robot of robots) {
    const rejection = statusRejection(robot);
    if (rejection) {
      rejectedRobots.push({ robotId: robot.id, reason: rejection });
      continue;
    }

    const route = buildRouteToVehicle(robot.position, spot, { laneBlocked: options.laneBlocked });
    const distanceMeters = routeDistanceMeters(robot.position, route);
    const servicePoint = getVehicleServicePoint(spot);
    const returnDistanceMeters = nearestDockDistanceMeters(servicePoint, dockBays);
    const totalTravelMeters = distanceMeters + returnDistanceMeters;
    const deliverableKwh = deliverableEnergyKwh(robot, totalTravelMeters);

    if (deliverableKwh < requestedKwh) {
      rejectedRobots.push({
        robotId: robot.id,
        reason: `insufficient energy (${deliverableKwh.toFixed(1)} kWh available)`,
      });
      continue;
    }

    const energyFeasibilityPenalty = deliverableKwh < requestedKwh + 4 ? 12 : 0;
    const distanceWeight = vehicle.priority === "Urgent" ? 1.6 : 1.2;
    const priorityAdjustment = vehicle.priority === "Urgent" ? -8 : 0;
    const score = distanceMeters * distanceWeight
      + returnDistanceMeters * 0.25
      + batteryPenalty(robot.battery)
      + energyFeasibilityPenalty
      + statusPenalty(robot)
      + priorityAdjustment;

    eligible.push({
      robot,
      route,
      distanceMeters,
      returnDistanceMeters,
      etaSeconds: etaSecondsForRoute(robot.position, route),
      score,
    });
  }

  eligible.sort((a, b) => a.score - b.score);
  const selected = eligible[0];
  if (!selected) return null;

  eligible.slice(1).forEach((candidate) => rejectedRobots.push({
    robotId: candidate.robot.id,
    reason: `higher route cost (${Math.round(candidate.distanceMeters)}m, ${Math.round(candidate.robot.battery)}% battery)`,
  }));

  return {
    vehicleId: vehicle.id,
    selectedRobotId: selected.robot.id,
    selectedScore: selected.score,
    selectedBattery: selected.robot.battery,
    requestedEnergyKwh: requestedKwh,
    distanceMeters: selected.distanceMeters,
    returnDistanceMeters: selected.returnDistanceMeters,
    etaSeconds: selected.etaSeconds,
    route: selected.route,
    reasons: [
      `${Math.round(selected.distanceMeters)}m route to ${vehicle.spotId}`,
      `ETA ${formatEta(selected.etaSeconds)}`,
      `${Math.round(selected.robot.battery)}% battery`,
      selected.robot.status === "docked"
        ? `Ready in ${selected.robot.dockBayId ?? "dock"}`
        : "Idle and unassigned",
      `Can complete ${requestedKwh.toFixed(1)} kWh and return to dock`,
    ],
    rejectedRobots,
    candidateScores: eligible.map((candidate) => ({
      robotId: candidate.robot.id,
      score: candidate.score,
    })),
  };
}
