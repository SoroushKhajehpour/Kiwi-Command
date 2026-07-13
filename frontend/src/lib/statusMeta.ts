import type { PillTone } from "@/components/StatusPill";
import type { RobotStatus, SessionStatus, VehicleStatus } from "./types";

export const ROBOT_STATUS_META: Record<RobotStatus, { label: string; tone: PillTone; pulse?: boolean }> = {
  idle: { label: "Idle", tone: "neutral" },
  docked: { label: "Docked", tone: "kiwi" },
  "en-route": { label: "En route", tone: "amber" },
  charging: { label: "Charging", tone: "kiwi", pulse: true },
  returning: { label: "Returning to dock", tone: "neutral" },
  faulted: { label: "Faulted", tone: "red", pulse: true },
  yielding: { label: "Yielding", tone: "amber" },
};

export const VEHICLE_STATUS_META: Record<VehicleStatus, { label: string; tone: PillTone; pulse?: boolean }> = {
  entering: { label: "Entering garage", tone: "amber", pulse: true },
  parking: { label: "Parking", tone: "amber" },
  parked: { label: "Parked", tone: "neutral" },
  waiting: { label: "Waiting for charge", tone: "amber" },
  assigned: { label: "Robot assigned", tone: "kiwi", pulse: true },
  en_route: { label: "En route", tone: "amber", pulse: true },
  charging: { label: "Charging", tone: "kiwi", pulse: true },
  completed: { label: "Charge complete", tone: "kiwi" },
  leaving: { label: "Leaving garage", tone: "neutral" },
  departed: { label: "Departed", tone: "neutral" },
  "backup-needed": { label: "Backup needed", tone: "red", pulse: true },
};

export const SESSION_STATUS_META: Record<SessionStatus, { label: string; tone: PillTone; pulse?: boolean }> = {
  queued: { label: "Queued", tone: "amber" },
  assigned: { label: "Assigned", tone: "kiwi" },
  en_route: { label: "En route", tone: "amber", pulse: true },
  active: { label: "Active", tone: "kiwi", pulse: true },
  completed: { label: "Completed", tone: "neutral" },
  interrupted: { label: "Interrupted", tone: "red" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  missed: { label: "Missed", tone: "red" },
};

export function batteryBarColor(percent: number): string {
  if (percent < 20) return "bg-red-400";
  if (percent < 40) return "bg-amber-400";
  return "bg-kiwi";
}
