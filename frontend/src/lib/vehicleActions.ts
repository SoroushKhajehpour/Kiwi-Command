import type { ChargingSession, Robot, SessionStatus, Vehicle } from "./types";

const ACTIVE_SESSION_STATUSES: SessionStatus[] = [
  "queued",
  "assigned",
  "en_route",
  "active",
];

export type VehicleActionType =
  | "request"
  | "dispatch"
  | "none"
  | "fault"
  | "backup"
  | "new-request";

export interface SelectedVehicleAction {
  label: string;
  variant: "primary" | "danger" | "disabled";
  disabled: boolean;
  actionType: VehicleActionType;
}

/** Newest session for a vehicle (sessions are prepended on create). */
export function getLatestSessionForVehicle(
  vehicleId: string,
  sessions: ChargingSession[],
): ChargingSession | null {
  return sessions.find((session) => session.vehicleId === vehicleId) ?? null;
}

export function hasActiveSessionForVehicle(
  vehicleId: string,
  sessions: ChargingSession[],
): boolean {
  return sessions.some((session) => (
    session.vehicleId === vehicleId
    && ACTIVE_SESSION_STATUSES.includes(session.status)
  ));
}

export function isSessionComplete(session: ChargingSession): boolean {
  return session.status === "completed"
    || session.energyKwh >= session.requestedKwh - 0.0001;
}

/**
 * Single source of truth for header + selected-job primary button labels.
 * Uses vehicle status first, with session as a safety check for "completed".
 */
export function getSelectedVehicleAction(
  vehicle: Vehicle | null,
  latestSession: ChargingSession | null,
  assignedRobot: Robot | null,
  canDispatch: boolean,
): SelectedVehicleAction {
  if (!vehicle) {
    return {
      label: "Select Vehicle",
      variant: "disabled",
      disabled: true,
      actionType: "none",
    };
  }

  const sessionDone = latestSession?.status === "completed";
  const sessionActive = latestSession
    ? ACTIVE_SESSION_STATUSES.includes(latestSession.status)
    : false;

  // Prefer session truth when vehicle status lags.
  if (sessionDone || (vehicle.status === "completed" && !sessionActive)) {
    return {
      label: "Request New Charge",
      variant: "primary",
      disabled: false,
      actionType: "new-request",
    };
  }

  switch (vehicle.status) {
    case "parked":
      return {
        label: "Request Charge",
        variant: "primary",
        disabled: false,
        actionType: "request",
      };
    case "waiting":
      return {
        label: "Dispatch Robot",
        variant: "primary",
        disabled: !canDispatch,
        actionType: "dispatch",
      };
    case "backup-needed":
      return {
        label: "Send Backup Robot",
        variant: "primary",
        disabled: !canDispatch,
        actionType: "backup",
      };
    case "assigned":
      return {
        label: "Simulate Robot Fault",
        variant: "danger",
        disabled: !(assignedRobot?.status === "en-route" || assignedRobot?.status === "charging"),
        actionType: "fault",
      };
    case "charging":
      return {
        label: "Simulate Robot Fault",
        variant: "danger",
        disabled: !assignedRobot || assignedRobot.status !== "charging",
        actionType: "fault",
      };
    default:
      return {
        label: "Unavailable",
        variant: "disabled",
        disabled: true,
        actionType: "none",
      };
  }
}

export function roundKwh(value: number): number {
  return Math.round(value * 10) / 10;
}
