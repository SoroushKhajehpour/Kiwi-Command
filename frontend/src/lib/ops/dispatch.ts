export {
  selectBestRobot,
  type DispatchDecision,
  type DispatchOptions,
  type RejectedRobot,
} from "../dispatch";

import type { ChargingSession, DockBay, JobPriorityExplanation, ParkingSpot, Robot, Vehicle } from "../types";
import { selectBestRobot, type DispatchDecision } from "../dispatch";

export interface JobPriorityResult {
  score: number;
  urgencyLabel: Vehicle["priority"];
  reasons: string[];
}

export function calculateVehiclePriority(vehicle: Vehicle, currentTick: number): Vehicle["priority"] {
  const departureSoon = vehicle.expectedDepartureTick - currentTick;
  if (vehicle.battery < 20 || (departureSoon <= 10 && (vehicle.requestedEnergyKwh ?? 0) > 15)) {
    return "Urgent";
  }
  if (vehicle.battery < 45 || (vehicle.requestedEnergyKwh ?? 0) >= 15) {
    return "Normal";
  }
  return "Low";
}

export function calculateJobPriority(
  vehicle: Vehicle,
  currentTick: number,
  queuedSinceTick: number,
): JobPriorityResult {
  const urgencyLabel = calculateVehiclePriority(vehicle, currentTick);
  const waitMinutes = Math.max(0, currentTick - queuedSinceTick);
  const departureMinutes = Math.max(0, vehicle.expectedDepartureTick - currentTick);

  let score = urgencyLabel === "Urgent" ? 100 : urgencyLabel === "Normal" ? 50 : 10;
  const reasons: string[] = [];

  if (vehicle.battery < 20) {
    score += 40;
    reasons.push(`${Math.round(vehicle.battery)}% battery`);
  } else if (vehicle.battery < 35) {
    score += 20;
    reasons.push(`${Math.round(vehicle.battery)}% battery`);
  }

  if (departureMinutes <= 10) {
    score += 40;
    reasons.push(`departure in ${departureMinutes} simulated min`);
  } else if (departureMinutes <= 20) {
    score += 20;
    reasons.push(`departure in ${departureMinutes} simulated min`);
  }

  if (waitMinutes > 0) {
    score += waitMinutes * 2;
    reasons.push(`waited ${waitMinutes} min`);
  }

  const requested = vehicle.requestedEnergyKwh ?? 0;
  if (requested > 0) {
    reasons.push(`requested ${requested.toFixed(1)} kWh`);
  }

  if (requested <= 15 && requested > 0) {
    score += 5;
  }

  return { score, urgencyLabel, reasons };
}

export function explainJobPriority(
  vehicle: Vehicle,
  session: ChargingSession,
  currentTick: number,
): JobPriorityExplanation {
  const priority = calculateJobPriority(vehicle, currentTick, session.createdTick);
  return {
    vehicleId: vehicle.id,
    spotId: vehicle.spotId ?? session.spotId,
    priorityScore: priority.score,
    reasons: priority.reasons.length > 0 ? priority.reasons : ["Standard queue priority"],
  };
}

export function selectNextJobToDispatch(
  vehicles: Vehicle[],
  sessions: ChargingSession[],
  currentTick: number,
): { vehicle: Vehicle; session: ChargingSession; explanation: JobPriorityExplanation } | null {
  const queued = sessions.filter((session) => session.status === "queued" || session.status === "interrupted");
  if (queued.length === 0) return null;

  const ranked = queued
    .map((session) => {
      const vehicle = vehicles.find((item) => item.id === session.vehicleId);
      if (!vehicle || (vehicle.status !== "waiting" && vehicle.status !== "backup-needed")) {
        return null;
      }
      const priority = calculateJobPriority(vehicle, currentTick, session.createdTick);
      return {
        vehicle,
        session: { ...session, priorityScore: priority.score },
        explanation: {
          vehicleId: vehicle.id,
          spotId: vehicle.spotId ?? session.spotId,
          priorityScore: priority.score,
          reasons: priority.reasons,
        },
        score: priority.score,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.score - a.score);

  return ranked[0] ?? null;
}

export function dispatchNextJob(
  vehicles: Vehicle[],
  sessions: ChargingSession[],
  robots: Robot[],
  spots: ParkingSpot[],
  dockBays: DockBay[],
  currentTick: number,
  options?: { laneBlocked?: boolean; reassignment?: boolean; preferredVehicleId?: string },
): {
  vehicle: Vehicle;
  session: ChargingSession;
  decision: DispatchDecision;
  jobExplanation: JobPriorityExplanation;
} | null {
  let next = selectNextJobToDispatch(vehicles, sessions, currentTick);
  if (options?.preferredVehicleId) {
    const preferredSession = sessions.find((session) => (
      session.vehicleId === options.preferredVehicleId
      && (session.status === "queued" || session.status === "interrupted")
    ));
    const preferredVehicle = vehicles.find((vehicle) => vehicle.id === options.preferredVehicleId);
    if (preferredSession && preferredVehicle) {
      next = {
        vehicle: preferredVehicle,
        session: preferredSession,
        explanation: explainJobPriority(preferredVehicle, preferredSession, currentTick),
      };
    }
  }
  if (!next) return null;

  const decision = selectBestRobot(
    robots,
    next.vehicle,
    spots,
    dockBays,
    { laneBlocked: options?.laneBlocked },
  );
  if (!decision) return null;

  return {
    vehicle: next.vehicle,
    session: next.session,
    decision,
    jobExplanation: next.explanation,
  };
}
