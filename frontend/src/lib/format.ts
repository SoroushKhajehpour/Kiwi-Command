import type { FaultType } from "./types";

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatKwh(value: number): string {
  return `${value.toFixed(1)} kWh`;
}

export function formatMeters(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return "—";
  return `${Math.round(meters)}m`;
}

export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder === 0 ? `${minutes}m` : `${minutes}m ${remainder}s`;
}

export function formatHeading(degrees: number): string {
  return `${Math.round(((degrees % 360) + 360) % 360)}°`;
}

export const FAULT_TYPE_LABELS: Record<FaultType, string> = {
  connector_timeout: "connector timeout",
  blocked_route: "blocked route",
  low_battery: "low battery",
  vehicle_handshake_failed: "vehicle handshake failed",
  robot_offline: "robot offline",
};
