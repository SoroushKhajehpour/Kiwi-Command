/**
 * Core domain types for Kiwi Command.
 * These mirror what the FastAPI backend will eventually serve,
 * so swapping mock data for API responses should be low-friction.
 */

export type DemoMode = "idle" | "running" | "paused" | "ended";

export type RobotStatus =
  | "idle"
  | "docked"
  | "en-route"
  | "charging"
  | "returning"
  | "faulted"
  | "yielding";

export type RobotMotionState = "moving" | "yielding" | "docked" | "charging";

export type VehicleStatus =
  | "entering"
  | "parking"
  | "parked"
  | "waiting"
  | "assigned"
  | "en_route"
  | "charging"
  | "completed"
  | "leaving"
  | "departed"
  | "backup-needed";

export type VehiclePriority = "Low" | "Normal" | "Urgent";

export type SessionStatus =
  | "queued"
  | "assigned"
  | "en_route"
  | "active"
  | "completed"
  | "interrupted"
  | "cancelled"
  | "missed";

export type VehiclePaint = "white" | "black" | "charcoal" | "silver" | "blue" | "green";

export type FaultType =
  | "connector_timeout"
  | "blocked_route"
  | "low_battery"
  | "vehicle_handshake_failed"
  | "robot_offline";

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
  targetPosition: GaragePosition | null;
  route: GaragePosition[];
  routeIndex: number;
  /** Compass-like heading in degrees; 0 points up, 90 points right. */
  heading: number;
  dockBayId: string | null;
  /** Vehicle this robot is currently serving, if any. */
  assignedVehicleId: string | null;
  faultType: FaultType | null;
  motionState?: RobotMotionState;
  lastYieldTick?: number;
}

export interface Vehicle {
  id: string;
  spotId: string | null;
  model: string;
  paint: VehiclePaint;
  battery: number;
  status: VehicleStatus;
  assignedRobotId: string | null;
  requestedEnergyKwh: number | null;
  priority: VehiclePriority;
  position: GaragePosition;
  targetBattery: number;
  route: GaragePosition[];
  routeIndex: number;
  heading: number;
  arrivalTick: number;
  expectedDepartureTick: number;
  completedAtTick?: number;
}

export interface ParkingSpot {
  id: string;
  label: string;
  position: GaragePosition;
  /** Degrees. 0 = car nose pointing up; 180 = nose pointing down. */
  rotation: number;
  row: "top" | "bottom";
  servicePoint: GaragePosition;
  vehicleId: string | null;
  occupiedVehicleId: string | null;
  reservedVehicleId?: string | null;
}

export interface ChargingSession {
  id: string;
  vehicleId: string;
  spotId: string;
  robotId: string | null;
  status: SessionStatus;
  energyKwh: number;
  requestedKwh: number;
  etaSeconds: number | null;
  /** Human-readable start time, e.g. "14:05". */
  startedAt: string;
  priorityScore: number;
  chargeRateKw: number;
  createdTick: number;
  startedTick?: number;
  completedTick?: number;
}

export interface FleetMetric {
  id: string;
  label: string;
  value: string;
  detail?: string;
}

export type EventLogType =
  | "dispatch"
  | "request"
  | "charging"
  | "returning"
  | "dock"
  | "fault"
  | "reassignment"
  | "arrival"
  | "departure"
  | "prioritized"
  | "yield"
  | "missed";

export interface EventLogItem {
  id: string;
  message: string;
  timestamp: string;
  type: EventLogType;
}

export interface DockBay {
  id: string;
  position: GaragePosition;
  label?: string;
  orientation?: "horizontal" | "vertical";
}

export interface JobPriorityExplanation {
  vehicleId: string;
  spotId: string;
  priorityScore: number;
  reasons: string[];
}
