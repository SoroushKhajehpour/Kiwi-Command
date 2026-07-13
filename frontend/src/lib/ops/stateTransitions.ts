import { advanceCharging } from "../charging";
import { formatKwh } from "../format";
import type {
  ChargingSession,
  DockBay,
  EventLogItem,
  FaultType,
  GaragePosition,
  ParkingSpot,
  Robot,
  Vehicle,
} from "../types";
import { roundKwh } from "../vehicleActions";
import type { DispatchDecision } from "../dispatch";
import { buildRouteToDock, getAvailableDockBay, getVehicleServicePoint } from "../routes";
import { CHARGE_RATE_KW } from "./constants";
import { calculateJobPriority } from "./dispatch";

export function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function createEvent(
  message: string,
  type: EventLogItem["type"],
  idSuffix = "",
): EventLogItem {
  return {
    id: `E-${Date.now()}-${idSuffix || Math.random().toString(36).slice(2, 6)}`,
    message,
    timestamp: nowLabel(),
    type,
  };
}

export function requestCharge(
  vehicle: Vehicle,
  sessions: ChargingSession[],
  currentTick: number,
  energyKwh?: number,
): { vehicle: Vehicle; session: ChargingSession; event: EventLogItem } | null {
  if (vehicle.status !== "parked" && vehicle.status !== "completed") return null;
  if (!vehicle.spotId) return null;

  const requestedKwh = roundKwh(energyKwh ?? vehicle.requestedEnergyKwh ?? 22);
  const priority = calculateJobPriority(vehicle, currentTick, 0);

  const session: ChargingSession = {
    id: `S-${Date.now()}`,
    vehicleId: vehicle.id,
    spotId: vehicle.spotId,
    robotId: null,
    status: "queued",
    energyKwh: 0,
    requestedKwh,
    etaSeconds: null,
    startedAt: nowLabel(),
    priorityScore: priority.score,
    chargeRateKw: CHARGE_RATE_KW,
    createdTick: currentTick,
  };

  const updatedVehicle: Vehicle = {
    ...vehicle,
    status: "waiting",
    assignedRobotId: null,
    requestedEnergyKwh: requestedKwh,
    priority: priority.urgencyLabel,
  };

  return {
    vehicle: updatedVehicle,
    session,
    event: createEvent(
      `${vehicle.id} requested ${formatKwh(requestedKwh)} at ${vehicle.spotId}. Priority: ${priority.urgencyLabel.toLowerCase()}.`,
      "request",
    ),
  };
}

export function assignRobot(
  vehicle: Vehicle,
  decision: DispatchDecision,
  robots: Robot[],
  sessions: ChargingSession[],
  reassignment = false,
): {
  robots: Robot[];
  vehicle: Vehicle;
  sessions: ChargingSession[];
  event: EventLogItem;
} {
  const nextRobots = robots.map((robot) => (
    robot.id === decision.selectedRobotId
      ? {
          ...robot,
          status: "en-route" as const,
          assignedVehicleId: vehicle.id,
          dockBayId: null,
          faultType: null,
          route: decision.route,
          routeIndex: 0,
          targetPosition: decision.route[decision.route.length - 1] ?? null,
          motionState: "moving" as const,
        }
      : robot
  ));

  const nextVehicle: Vehicle = {
    ...vehicle,
    assignedRobotId: decision.selectedRobotId,
    status: "assigned",
  };

  const nextSessions = sessions.map((session) => (
    session.vehicleId === vehicle.id
    && (session.status === "queued" || session.status === "interrupted" || session.status === "assigned")
      ? {
          ...session,
          status: "en_route" as const,
          robotId: decision.selectedRobotId,
          etaSeconds: decision.etaSeconds,
        }
      : session
  ));

  return {
    robots: nextRobots,
    vehicle: nextVehicle,
    sessions: nextSessions,
    event: createEvent(
      reassignment
        ? `${vehicle.id} reassigned to ${decision.selectedRobotId}`
        : `${decision.selectedRobotId} dispatched to ${vehicle.id}, ETA ${Math.round(decision.etaSeconds)}s`,
      reassignment ? "reassignment" : "dispatch",
    ),
  };
}

export function startCharging(
  robotId: string,
  vehicleId: string,
  robots: Robot[],
  vehicles: Vehicle[],
  sessions: ChargingSession[],
  currentTick: number,
  spots?: ParkingSpot[],
): {
  robots: Robot[];
  vehicles: Vehicle[];
  sessions: ChargingSession[];
  event: EventLogItem;
} {
  const robot = robots.find((item) => item.id === robotId);
  const vehicle = vehicles.find((item) => item.id === vehicleId);
  if (!robot || !vehicle || robot.status === "faulted") {
    return {
      robots,
      vehicles,
      sessions,
      event: createEvent(`${robotId} could not start charging ${vehicleId}.`, "dispatch"),
    };
  }

  const session = sessions.find((item) => (
    item.vehicleId === vehicleId
    && ["queued", "assigned", "en_route", "interrupted", "active"].includes(item.status)
  ));
  if (session?.status === "active" && session.robotId === robotId) {
    return { robots, vehicles, sessions, event: createEvent(`${robotId} already charging ${vehicleId}`, "charging") };
  }
  if (session?.status === "completed" || vehicle.status === "completed") {
    return { robots, vehicles, sessions, event: createEvent(`${vehicleId} already completed.`, "charging") };
  }

  let service = robot.position;
  if (spots && vehicle.spotId) {
    const spot = spots.find((item) => item.id === vehicle.spotId);
    if (spot) service = getVehicleServicePoint(spot);
  }

  const nextRobots = robots.map((item) => (
    item.id === robotId
      ? {
          ...item,
          status: "charging" as const,
          position: { ...service },
          route: [],
          routeIndex: 0,
          motionState: "charging" as const,
          assignedVehicleId: vehicleId,
        }
      : item
  ));
  const nextVehicles = vehicles.map((item) => (
    item.id === vehicleId
      ? { ...item, status: "charging" as const, assignedRobotId: robotId }
      : item
  ));
  const nextSessions = sessions.map((item) => (
    item.vehicleId === vehicleId
    && ["queued", "assigned", "en_route", "interrupted", "active"].includes(item.status)
      ? {
          ...item,
          status: "active" as const,
          robotId,
          startedAt: item.startedAt === "—" || !item.startedAt ? nowLabel() : item.startedAt,
          etaSeconds: null,
          startedTick: item.startedTick ?? currentTick,
        }
      : item
  ));

  return {
    robots: nextRobots,
    vehicles: nextVehicles,
    sessions: nextSessions,
    event: createEvent(`${robotId} arrived at ${vehicle.spotId ?? "bay"}. Charging started.`, "charging"),
  };
}

export function completeCharging(
  robotId: string,
  vehicleId: string,
  robots: Robot[],
  vehicles: Vehicle[],
  sessions: ChargingSession[],
  dockBays: DockBay[],
  laneBlocked: boolean,
  currentTick: number,
): {
  robots: Robot[];
  vehicles: Vehicle[];
  sessions: ChargingSession[];
  event: EventLogItem;
} {
  const nextVehicles = vehicles.map((vehicle) => (
    vehicle.id === vehicleId
      ? {
          ...vehicle,
          status: "completed" as const,
          assignedRobotId: null,
          completedAtTick: currentTick,
        }
      : vehicle
  ));
  const nextSessions = sessions.map((session) => (
    session.vehicleId === vehicleId && session.status === "active"
      ? {
          ...session,
          status: "completed" as const,
          energyKwh: roundKwh(session.requestedKwh),
          etaSeconds: null,
          completedTick: currentTick,
        }
      : session
  ));

  const bay = getAvailableDockBay(robots, dockBays, robotId);
  const robot = robots.find((item) => item.id === robotId);

  const nextRobots = robots.map((item) => {
    if (item.id !== robotId) return item;
    if (!bay || !robot) {
      return {
        ...item,
        status: "idle" as const,
        assignedVehicleId: null,
        dockBayId: null,
        route: [],
        routeIndex: 0,
        targetPosition: null,
      };
    }
    const route = buildRouteToDock(robot.position, bay, { laneBlocked });
    return {
      ...item,
      status: "returning" as const,
      assignedVehicleId: null,
      dockBayId: bay.id,
      route,
      routeIndex: 0,
      targetPosition: bay.position,
      motionState: "moving" as const,
    };
  });

  return {
    robots: nextRobots,
    vehicles: nextVehicles,
    sessions: nextSessions,
    event: createEvent(`${vehicleId} charge complete. ${robotId} returning to dock.`, "charging"),
  };
}

export function dockRobot(
  robotId: string,
  robots: Robot[],
): { robots: Robot[]; event: EventLogItem } {
  const nextRobots = robots.map((robot) => {
    if (robot.id !== robotId) return robot;
    return {
      ...robot,
      status: "docked" as const,
      route: [],
      routeIndex: 0,
      assignedVehicleId: null,
      motionState: "docked" as const,
    };
  });
  return {
    robots: nextRobots,
    event: createEvent(`${robotId} docked and started recharging`, "dock"),
  };
}

export function requeueVehicle(
  vehicleId: string,
  vehicles: Vehicle[],
  sessions: ChargingSession[],
): { vehicles: Vehicle[]; sessions: ChargingSession[] } {
  const vehiclesUpdated = vehicles.map((vehicle) => (
    vehicle.id === vehicleId ? { ...vehicle, status: "waiting" as const } : vehicle
  ));
  const sessionsUpdated = sessions.map((session) => (
    session.vehicleId === vehicleId && session.status === "interrupted"
      ? { ...session, status: "queued" as const }
      : session
  ));
  return { vehicles: vehiclesUpdated, sessions: sessionsUpdated };
}

export function clearFault(
  robotId: string,
  robots: Robot[],
  dockBays: DockBay[],
  laneBlocked: boolean,
): { robots: Robot[]; event: EventLogItem } | null {
  const robot = robots.find((item) => item.id === robotId);
  if (!robot || robot.status !== "faulted") return null;

  const bay = getAvailableDockBay(robots, dockBays, robotId);

  const nextRobots = robots.map((item) => {
    if (item.id !== robotId) return item;
    if (!bay) return { ...item, status: "idle" as const, faultType: null };
    const nearDock = Math.hypot(item.position.x - bay.position.x, item.position.y - bay.position.y) < 2;
    if (nearDock) {
      return {
        ...item,
        status: "docked" as const,
        faultType: null,
        dockBayId: bay.id,
        position: { ...bay.position },
        route: [],
        routeIndex: 0,
        targetPosition: null,
        motionState: "docked" as const,
      };
    }
    const route = buildRouteToDock(item.position, bay, { laneBlocked });
    return {
      ...item,
      status: "returning" as const,
      faultType: null,
      dockBayId: bay.id,
      route,
      routeIndex: 0,
      targetPosition: bay.position,
      motionState: "moving" as const,
    };
  });

  return {
    robots: nextRobots,
    event: createEvent(
      bay
        ? `${robotId} fault cleared. Returning to dock.`
        : `${robotId} fault cleared and available.`,
      "fault",
    ),
  };
}

export function vehicleParks(
  vehicle: Vehicle,
  spot: ParkingSpot,
): { vehicle: Vehicle; spot: ParkingSpot; event: EventLogItem } {
  const parked: Vehicle = {
    ...vehicle,
    status: "parked",
    spotId: spot.id,
    position: { ...spot.position },
    route: [],
    routeIndex: 0,
    heading: spot.rotation,
  };
  const updatedSpot: ParkingSpot = {
    ...spot,
    vehicleId: vehicle.id,
    occupiedVehicleId: vehicle.id,
    reservedVehicleId: null,
  };
  return {
    vehicle: parked,
    spot: updatedSpot,
    event: createEvent(
      `${vehicle.id} parked at ${spot.id} with ${Math.round(vehicle.battery)}% battery.`,
      "arrival",
    ),
  };
}

export function vehicleDeparts(
  vehicle: Vehicle,
  spot: ParkingSpot,
  exitRoute: GaragePosition[],
): { vehicle: Vehicle; spot: ParkingSpot; event: EventLogItem } {
  const leaving: Vehicle = {
    ...vehicle,
    status: "leaving",
    route: exitRoute,
    routeIndex: 0,
    spotId: null,
  };
  const clearedSpot: ParkingSpot = {
    ...spot,
    vehicleId: null,
    occupiedVehicleId: null,
    reservedVehicleId: null,
  };
  return {
    vehicle: leaving,
    spot: clearedSpot,
    event: createEvent(`${vehicle.id} departing garage.`, "departure"),
  };
}

export function advanceChargingStep(
  vehicle: Vehicle,
  session: ChargingSession,
  elapsedSeconds: number,
): {
  vehicle: Vehicle;
  session: ChargingSession;
  deliveredKwh: number;
  complete: boolean;
} {
  return advanceCharging(vehicle, session, elapsedSeconds);
}

export function applyFaultToState(
  robot: Robot,
  faultType: FaultType,
  robots: Robot[],
  vehicles: Vehicle[],
  sessions: ChargingSession[],
): {
  robots: Robot[];
  vehicles: Vehicle[];
  sessions: ChargingSession[];
  events: EventLogItem[];
  vehicleId: string | null;
} {
  const vehicleId = robot.assignedVehicleId;
  const label = faultType.replace(/_/g, " ");
  // Faulted robots freeze where they are — never side-step / teleport.
  const nextRobots = robots.map((item) => (
    item.id === robot.id
      ? {
          ...item,
          status: "faulted" as const,
          faultType,
          assignedVehicleId: null,
          dockBayId: null,
          route: [],
          routeIndex: 0,
          targetPosition: null,
          // keep item.position unchanged
        }
      : item
  ));

  const events: EventLogItem[] = [];
  if (vehicleId) {
    events.push(createEvent(`${robot.id} connector timeout while charging ${vehicleId}.`, "fault"));
    const session = sessions.find((s) => s.vehicleId === vehicleId && (s.status === "active" || s.status === "interrupted"));
    const delivered = session ? formatKwh(session.energyKwh) : "0.0 kWh";
    events.push(createEvent(`${vehicleId} requeued with ${delivered} already delivered.`, "fault"));
  } else {
    events.push(createEvent(`${robot.id} faulted: ${label}.`, "fault"));
  }

  const nextVehicles = vehicles.map((vehicle) => (
    vehicle.id === vehicleId
      ? { ...vehicle, status: "backup-needed" as const, assignedRobotId: null }
      : vehicle
  ));

  const nextSessions = sessions.map((session) => (
    session.vehicleId === vehicleId && session.status !== "completed"
      ? { ...session, status: "interrupted" as const, robotId: null, etaSeconds: null }
      : session
  ));

  return { robots: nextRobots, vehicles: nextVehicles, sessions: nextSessions, events, vehicleId };
}

export function shouldRequestCharge(vehicle: Vehicle): boolean {
  if (vehicle.status !== "parked") return false;
  if (vehicle.requestedEnergyKwh != null && vehicle.requestedEnergyKwh > 0) return true;
  const gap = vehicle.targetBattery - vehicle.battery;
  return vehicle.battery < 45 || gap >= 20 || vehicle.priority === "Urgent";
}

export function estimateRequestedEnergy(vehicle: Vehicle): number {
  if (vehicle.requestedEnergyKwh != null && vehicle.requestedEnergyKwh > 0) {
    return roundKwh(vehicle.requestedEnergyKwh);
  }
  const gap = Math.max(0, vehicle.targetBattery - vehicle.battery);
  return roundKwh(Math.min(35, Math.max(8, (gap / 100) * 75)));
}
