import type { ChargingSession, Robot, SessionStatus, Vehicle } from "./types";

const ACTIVE_SESSION_STATUSES: SessionStatus[] = [
  "queued",
  "assigned",
  "en_route",
  "active",
];

const IN_PROGRESS_STATUSES: SessionStatus[] = ["assigned", "en_route", "active"];

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

/** Newest session for a vehicle. Prefer active/interrupted over completed. */
export function getLatestSessionForVehicle(
  vehicleId: string,
  sessions: ChargingSession[],
): ChargingSession | null {
  const matches = sessions.filter((session) => session.vehicleId === vehicleId);
  if (matches.length === 0) return null;
  const active = matches.find((session) => ACTIVE_SESSION_STATUSES.includes(session.status)
    || session.status === "interrupted");
  return active ?? matches[0] ?? null;
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
  autoDispatch = true,
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
  const sessionInProgress = latestSession
    ? IN_PROGRESS_STATUSES.includes(latestSession.status)
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
      // Session may already be queued while vehicle status lags on one frame.
      if (sessionActive) {
        if (autoDispatch) {
          return {
            label: "Waiting for dispatch",
            variant: "disabled",
            disabled: true,
            actionType: "none",
          };
        }
        return {
          label: "Dispatch Robot",
          variant: "primary",
          disabled: !canDispatch,
          actionType: "dispatch",
        };
      }
      return {
        label: "Request Charge",
        variant: "primary",
        disabled: false,
        actionType: "request",
      };
    case "waiting":
      if (autoDispatch) {
        return {
          label: "Waiting for dispatch",
          variant: "disabled",
          disabled: true,
          actionType: "none",
        };
      }
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
    case "en_route":
      if (!sessionInProgress || !assignedRobot) {
        return {
          label: autoDispatch ? "Waiting for dispatch" : "Dispatch Robot",
          variant: autoDispatch ? "disabled" : "primary",
          disabled: autoDispatch || !canDispatch,
          actionType: autoDispatch ? "none" : "dispatch",
        };
      }
      return {
        label: "Job In Progress",
        variant: "disabled",
        disabled: true,
        actionType: "none",
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
