import type { PillTone } from "@/components/StatusPill";
import type { RobotStatus, SessionStatus, VehicleStatus } from "./types";

/** Display label + pill tone for each status union, shared across panels. */

export const ROBOT_STATUS_META: Record<RobotStatus, { label: string; tone: PillTone; pulse?: boolean }> = {
  idle: { label: "Idle", tone: "neutral" },
  docked: { label: "Docked", tone: "kiwi" },
  "en-route": { label: "En route", tone: "amber" },
  charging: { label: "Charging", tone: "kiwi", pulse: true },
  returning: { label: "Returning to dock", tone: "neutral" },
  faulted: { label: "Faulted", tone: "red", pulse: true },
};

export const VEHICLE_STATUS_META: Record<VehicleStatus, { label: string; tone: PillTone; pulse?: boolean }> = {
  parked: { label: "Parked", tone: "neutral" },
  waiting: { label: "Waiting for charge", tone: "amber" },
  assigned: { label: "Robot assigned", tone: "kiwi", pulse: true },
  charging: { label: "Charging", tone: "kiwi", pulse: true },
  completed: { label: "Charge complete", tone: "kiwi" },
};

export const SESSION_STATUS_META: Record<SessionStatus, { label: string; tone: PillTone; pulse?: boolean }> = {
  queued: { label: "Queued", tone: "amber" },
  active: { label: "Active", tone: "kiwi", pulse: true },
  completed: { label: "Completed", tone: "neutral" },
};

/** Battery bar color: red under 20%, amber under 40%, kiwi otherwise. */
export function batteryBarColor(percent: number): string {
  if (percent < 20) return "bg-red-400";
  if (percent < 40) return "bg-amber-400";
  return "bg-kiwi";
}
