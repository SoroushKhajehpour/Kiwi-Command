import type { DispatchDecision } from "../dispatch";
import type {
  ChargingSession,
  DemoMode,
  DockBay,
  EventLogItem,
  GaragePosition,
  ParkingSpot,
  Robot,
  Vehicle,
  VehiclePaint,
  VehiclePriority,
} from "../types";
import type { ApiDispatchDecision, ApiEvent, ApiParkingSpot, ApiRobot, ApiSession, ApiSystemState, ApiVehicle } from "./types";

function mapPosition(p: { x: number; y: number }): GaragePosition {
  return { x: p.x, y: p.y };
}

function mapRobotStatus(status: string): Robot["status"] {
  if (status === "en_route") return "en-route";
  return status as Robot["status"];
}

function mapVehicleStatus(status: string): Vehicle["status"] {
  if (status === "backup_needed") return "backup-needed";
  return status as Vehicle["status"];
}

function mapVehiclePriority(priority: string): VehiclePriority {
  if (priority === "urgent") return "Urgent";
  if (priority === "low") return "Low";
  return "Normal";
}

function formatEventTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return iso;
  }
}

export function mapEvent(event: ApiEvent): EventLogItem {
  return {
    id: event.id,
    message: event.message,
    timestamp: formatEventTime(event.timestamp),
    type: event.type as EventLogItem["type"],
  };
}

export function mapRobot(robot: ApiRobot): Robot {
  return {
    id: robot.id,
    name: robot.name,
    status: mapRobotStatus(robot.status),
    battery: robot.battery,
    position: mapPosition(robot.position),
    targetPosition: robot.route.at(-1) ? mapPosition(robot.route.at(-1)!) : null,
    route: robot.route.map(mapPosition),
    routeIndex: robot.route_index,
    heading: robot.heading,
    dockBayId: robot.dock_bay_id,
    assignedVehicleId: robot.assigned_vehicle_id,
    faultType: robot.fault_type as Robot["faultType"],
    lastYieldTick: robot.last_yield_tick,
  };
}

export function mapVehicle(vehicle: ApiVehicle): Vehicle {
  return {
    id: vehicle.id,
    spotId: vehicle.spot_id,
    model: vehicle.model,
    paint: vehicle.paint as VehiclePaint,
    battery: vehicle.battery,
    status: mapVehicleStatus(vehicle.status),
    assignedRobotId: vehicle.assigned_robot_id,
    requestedEnergyKwh: vehicle.requested_energy_kwh || null,
    priority: mapVehiclePriority(vehicle.priority),
    position: mapPosition(vehicle.position),
    targetBattery: vehicle.target_battery,
    route: vehicle.route.map(mapPosition),
    routeIndex: vehicle.route_index,
    heading: vehicle.heading,
    arrivalTick: vehicle.arrival_tick,
    expectedDepartureTick: vehicle.expected_departure_tick,
    completedAtTick: vehicle.completed_at_tick ?? undefined,
  };
}

export function mapSpot(spot: ApiParkingSpot): ParkingSpot {
  const rotation = spot.row === "top" ? 0 : 180;
  return {
    id: spot.id,
    label: spot.id,
    position: mapPosition(spot.position),
    rotation,
    row: spot.row as ParkingSpot["row"],
    servicePoint: mapPosition(spot.service_point),
    vehicleId: spot.occupied_vehicle_id,
    occupiedVehicleId: spot.occupied_vehicle_id,
    reservedVehicleId: spot.reserved_vehicle_id ?? null,
  };
}

export function mapSession(session: ApiSession): ChargingSession {
  return {
    id: session.id,
    vehicleId: session.vehicle_id,
    spotId: session.spot_id,
    robotId: session.robot_id,
    status: session.status as ChargingSession["status"],
    energyKwh: session.delivered_energy_kwh,
    requestedKwh: session.requested_energy_kwh,
    etaSeconds: null,
    startedAt: session.started_tick != null ? String(session.started_tick) : "—",
    priorityScore: session.priority_score,
    chargeRateKw: session.charge_rate_kw,
    createdTick: session.created_tick,
    startedTick: session.started_tick ?? undefined,
    completedTick: session.completed_tick ?? undefined,
  };
}

export function mapDispatchDecision(
  decision: ApiDispatchDecision | null,
  vehicles: ApiVehicle[],
): DispatchDecision | null {
  if (!decision || !decision.selected_robot_id || !decision.vehicle_id) return null;
  const vehicle = vehicles.find((v) => v.id === decision.vehicle_id);
  const selectedRobotBattery = 80;
  return {
    vehicleId: decision.vehicle_id,
    selectedRobotId: decision.selected_robot_id,
    selectedScore: decision.selected_score ?? 0,
    selectedBattery: selectedRobotBattery,
    requestedEnergyKwh: vehicle?.requested_energy_kwh ?? 22,
    distanceMeters: decision.distance_meters ?? 0,
    returnDistanceMeters: 0,
    etaSeconds: decision.eta_seconds ?? 0,
    reasons: decision.reasons,
    rejectedRobots: decision.rejected_robots.map((r) => ({
      robotId: r.robot_id,
      reason: r.reason,
    })),
    candidateScores: [],
    route: decision.route.map(mapPosition),
  };
}

export function mapDockBay(bay: {
  id: string;
  position: { x: number; y: number };
  label?: string | null;
  orientation?: string | null;
}): DockBay {
  return {
    id: bay.id,
    position: mapPosition(bay.position),
    label: bay.label ?? bay.id.replace("dock-", ""),
    orientation: (bay.orientation === "horizontal" || bay.orientation === "vertical")
      ? bay.orientation
      : undefined,
  };
}

export interface MappedTelemetry {
  demoMode: DemoMode;
  vehicles: Vehicle[];
  robots: Robot[];
  sessions: ChargingSession[];
  events: EventLogItem[];
  spots: ParkingSpot[];
  dockBays: DockBay[];
  energyToday: number;
  lastDecision: DispatchDecision | null;
  laneBlocked: boolean;
  missedCount: number;
  tick: number;
  autoDispatch: boolean;
  jobPriorityReasons: string[];
}

export function mapSystemState(state: ApiSystemState): MappedTelemetry {
  return {
    demoMode: state.demo_mode as DemoMode,
    vehicles: state.vehicles.map(mapVehicle),
    robots: state.robots.map(mapRobot),
    sessions: state.sessions.map(mapSession),
    events: state.events.map(mapEvent),
    spots: state.parking_spots.map(mapSpot),
    dockBays: state.dock_bays.map(mapDockBay),
    energyToday: state.metrics.energy_today_kwh,
    lastDecision: mapDispatchDecision(state.last_decision, state.vehicles),
    laneBlocked: state.blocked_lane_active,
    missedCount: state.metrics.missed_requests,
    tick: state.tick,
    autoDispatch: state.auto_dispatch,
    jobPriorityReasons: state.last_decision?.job_priority_reasons ?? [],
  };
}
