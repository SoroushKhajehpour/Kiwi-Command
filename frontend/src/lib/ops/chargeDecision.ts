import type { ChargingSession, Vehicle } from "../types";
import { formatKwh, formatPercent } from "../format";

const BATTERY_CAPACITY_KWH = 75;

export type ChargeEligibilityStatus =
  | "eligible_for_charge"
  | "deferred"
  | "not_needed"
  | "not_feasible"
  | "queued"
  | "charging"
  | "completed"
  | "missed";

export interface ChargeDecisionView {
  status: ChargeEligibilityStatus;
  reason: string;
  targetBattery: number;
  requestedKwh: number;
}

function chooseTargetBattery(vehicle: Vehicle, queueDepth: number): number {
  if (vehicle.battery < 20) return 65;
  if (vehicle.priority === "Urgent") return 70;
  if (queueDepth >= 3) return 70;
  if (vehicle.battery < 70 && queueDepth <= 1) return 90;
  return 80;
}

function estimateRequested(vehicle: Vehicle, target: number): number {
  const gap = Math.max(0, target - vehicle.battery);
  const raw = (gap / 100) * BATTERY_CAPACITY_KWH;
  return Math.round(Math.min(28, Math.max(8, raw)) * 10) / 10;
}

/** Operator-facing charge decision summary for the selected job panel. */
export function describeChargeDecision(
  vehicle: Vehicle,
  session: ChargingSession | null,
  queueDepth = 0,
): ChargeDecisionView {
  const target = vehicle.targetBattery > 0
    ? vehicle.targetBattery
    : chooseTargetBattery(vehicle, queueDepth);
  const requested = session?.requestedKwh
    ?? vehicle.requestedEnergyKwh
    ?? estimateRequested(vehicle, target);

  if (vehicle.status === "charging" || session?.status === "active") {
    return {
      status: "charging",
      reason: `Charging: ${formatPercent(vehicle.battery)} → ${formatPercent(target)}, ${formatKwh(session?.energyKwh ?? 0)} / ${formatKwh(requested)}`,
      targetBattery: target,
      requestedKwh: requested,
    };
  }

  if (
    vehicle.status === "waiting"
    || vehicle.status === "backup-needed"
    || vehicle.status === "assigned"
    || session?.status === "queued"
    || session?.status === "assigned"
    || session?.status === "en_route"
    || session?.status === "interrupted"
  ) {
    return {
      status: "queued",
      reason: `Queued: ${formatPercent(vehicle.battery)} → ${formatPercent(target)}, ${formatKwh(requested)} requested`,
      targetBattery: target,
      requestedKwh: requested,
    };
  }

  if (vehicle.status === "completed" || session?.status === "completed") {
    return {
      status: "completed",
      reason: `Completed toward ${formatPercent(target)} (not 100%)`,
      targetBattery: target,
      requestedKwh: requested,
    };
  }

  if (
    vehicle.status === "entering"
    || vehicle.status === "parking"
    || vehicle.status === "leaving"
    || vehicle.status === "departed"
  ) {
    return {
      status: "not_feasible",
      reason: `Not feasible: vehicle is ${vehicle.status}`,
      targetBattery: target,
      requestedKwh: requested,
    };
  }

  if (vehicle.battery >= target) {
    return {
      status: "not_needed",
      reason: `Not charging: battery already above target (${formatPercent(vehicle.battery)} ≥ ${formatPercent(target)})`,
      targetBattery: target,
      requestedKwh: 0,
    };
  }

  if (queueDepth >= 3 && vehicle.battery > 70) {
    return {
      status: "deferred",
      reason: "Deferred: queue is prioritizing lower-battery vehicles",
      targetBattery: target,
      requestedKwh: requested,
    };
  }

  return {
    status: "eligible_for_charge",
    reason: `Charging needed: ${formatPercent(vehicle.battery)} → ${formatPercent(target)}, ${formatKwh(requested)} requested`,
    targetBattery: target,
    requestedKwh: requested,
  };
}
