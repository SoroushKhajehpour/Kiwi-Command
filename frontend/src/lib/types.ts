/**
 * Core domain types for Kiwi Command.
 * These mirror what the FastAPI backend will eventually serve,
 * so swapping mock data for API responses should be low-friction.
 */

export type RobotStatus = "idle" | "en-route" | "charging" | "returning";

export type VehicleStatus = "parked" | "waiting" | "assigned" | "charging" | "completed";

export type SessionStatus = "queued" | "active" | "completed";

/** Position on the garage canvas, in percentages (0–100) of its width/height. */
export interface GaragePosition {
  x: number;
  y: number;
}

export interface Robot {
  id: string;
  name: string;
  status: RobotStatus;
  battery: number;
  position: GaragePosition;
  /** Vehicle this robot is currently serving, if any. */
  assignedVehicleId: string | null;
}

export interface Vehicle {
  id: string;
  spotId: string;
  model: string;
  /** Neutral paint color used by CarTopView (hex). */
  paint: string;
  battery: number;
  status: VehicleStatus;
  assignedRobotId: string | null;
  requestedEnergyKwh: number | null;
  priority: "Normal" | "Urgent";
}

export interface ParkingSpot {
  id: string;
  label: string;
  position: GaragePosition;
  /** Degrees. 0 = car nose pointing up; 180 = nose pointing down. */
  rotation: number;
  vehicleId: string | null;
}

export interface ChargingSession {
  id: string;
  vehicleId: string;
  spotId: string;
  robotId: string | null;
  status: SessionStatus;
  energyKwh: number;
  /** Human-readable start time, e.g. "14:05". */
  startedAt: string;
}

export interface FleetMetric {
  id: string;
  label: string;
  value: string;
  detail?: string;
}

export interface EventLogItem {
  id: string;
  message: string;
  timestamp: string;
  type: "dispatch" | "request" | "charging" | "returning";
}
