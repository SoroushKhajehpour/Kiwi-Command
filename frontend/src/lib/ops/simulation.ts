import type {
  ChargingSession,
  DemoMode,
  DispatchDecision,
  DockBay,
  EventLogItem,
  JobPriorityExplanation,
  ParkingSpot,
  Robot,
  Vehicle,
} from "../types";
import { buildRouteToDock, LANE_BLOCK_ZONE } from "../routes";
import {
  COMPLETED_DWELL_TICKS,
  DEMO_FAULT_AFTER_CHARGE_TICKS,
  DEMO_FIRST_SPAWN_SPOT,
  DEMO_FIRST_SPAWN_TICK,
  LOW_ROBOT_BATTERY_THRESHOLD,
  SIMULATION_TIME_SCALE,
  SPAWN_INTERVAL_MAX_TICKS,
  SPAWN_INTERVAL_MIN_TICKS,
  YIELD_EVENT_COOLDOWN_TICKS,
} from "./constants";
import { calculateJobPriority, dispatchNextJob } from "./dispatch";
import { advanceRobotWithCollisionAvoidance, advanceVehicleWithCollisionAvoidance } from "./movement";
import { buildVehicleExitRoute } from "./routes";
import {
  applyFaultToState,
  assignRobot,
  completeCharging,
  createEvent,
  dockRobot,
  advanceChargingStep,
  estimateRequestedEnergy,
  requeueVehicle,
  shouldRequestCharge,
  requestCharge,
  startCharging,
  vehicleDeparts,
  vehicleParks,
} from "./stateTransitions";
import { findAvailableSpot, spawnVehicle } from "./vehicleSpawn";

export interface GarageSimState {
  vehicles: Vehicle[];
  robots: Robot[];
  sessions: ChargingSession[];
  spots: ParkingSpot[];
  events: EventLogItem[];
  energyToday: number;
  currentTick: number;
  nextSpawnTick: number;
  spawnCount: number;
  laneBlocked: boolean;
  demoMode: DemoMode;
  lastDecision: DispatchDecision | null;
  lastJobExplanation: JobPriorityExplanation | null;
  queuedJobExplanations: JobPriorityExplanation[];
  chargeStartedTick: number | null;
  faultTriggered: boolean;
  scriptedVehicleId: string | null;
  missedCount: number;
}

export interface TickResult {
  state: GarageSimState;
  newEvents: EventLogItem[];
}

function cloneSpots(spots: ParkingSpot[]): ParkingSpot[] {
  return spots.map((spot) => ({
    ...spot,
    position: { ...spot.position },
    servicePoint: { ...spot.servicePoint },
  }));
}

export function createInitialSimState(
  robots: Robot[],
  spots: ParkingSpot[],
  options?: {
    demoMode?: DemoMode;
    vehicles?: Vehicle[];
    sessions?: ChargingSession[];
    events?: EventLogItem[];
    energyToday?: number;
  },
): GarageSimState {
  return {
    vehicles: options?.vehicles ?? [],
    robots: robots.map((robot) => ({
      ...robot,
      position: { ...robot.position },
      route: robot.route.map((point) => ({ ...point })),
    })),
    sessions: options?.sessions ?? [],
    spots: cloneSpots(spots),
    events: options?.events ?? [],
    energyToday: options?.energyToday ?? 0,
    currentTick: 0,
    nextSpawnTick: DEMO_FIRST_SPAWN_TICK,
    spawnCount: 0,
    laneBlocked: false,
    demoMode: options?.demoMode ?? "idle",
    lastDecision: null,
    lastJobExplanation: null,
    queuedJobExplanations: [],
    chargeStartedTick: null,
    faultTriggered: false,
    scriptedVehicleId: null,
    missedCount: 0,
  };
}

function updateQueuedExplanations(
  vehicles: Vehicle[],
  sessions: ChargingSession[],
  currentTick: number,
): JobPriorityExplanation[] {
  return sessions
    .filter((session) => session.status === "queued")
    .map((session) => {
      const vehicle = vehicles.find((item) => item.id === session.vehicleId);
      if (!vehicle) return null;
      const priority = calculateJobPriority(vehicle, currentTick, session.createdTick);
      return {
        vehicleId: vehicle.id,
        spotId: vehicle.spotId ?? session.spotId,
        priorityScore: priority.score,
        reasons: priority.reasons,
      };
    })
    .filter((item): item is JobPriorityExplanation => item !== null)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 3);
}

function findSpotForRouteEnd(spots: ParkingSpot[], route: GaragePosition[]): ParkingSpot | null {
  const last = route.at(-1);
  if (!last) return null;
  return spots.find((s) => (
    Math.abs(s.position.x - last.x) < 1
    && Math.abs(s.position.y - last.y) < 1
  )) ?? null;
}

export function tickSimulation(
  state: GarageSimState,
  elapsedSeconds: number,
  dockBays: DockBay[],
): TickResult {
  const newEvents: EventLogItem[] = [];
  let {
    vehicles,
    robots,
    sessions,
    spots,
    energyToday,
    currentTick,
    nextSpawnTick,
    spawnCount,
    lastDecision,
    lastJobExplanation,
    chargeStartedTick,
    faultTriggered,
    scriptedVehicleId,
    missedCount,
  } = state;

  const isRunning = state.demoMode === "running";
  const isEnding = state.demoMode === "ended";
  const isSimulating = isRunning || isEnding;

  if (isRunning) {
    currentTick += elapsedSeconds * SIMULATION_TIME_SCALE;
  }

  // Spawn vehicles
  if (isRunning && currentTick >= nextSpawnTick) {
    const available = findAvailableSpot(spots);
    if (available) {
      const deterministic = spawnCount === 0;
      const targetSpot = deterministic
        ? spots.find((s) => s.id === DEMO_FIRST_SPAWN_SPOT && !s.occupiedVehicleId) ?? available
        : available;

      if (!targetSpot.occupiedVehicleId) {
        const vehicle = spawnVehicle(targetSpot, currentTick, {
          deterministic,
          vehicleId: deterministic ? "EV-4466" : undefined,
        });
        vehicles = [...vehicles, vehicle];
        spawnCount += 1;
        newEvents.push(createEvent(`${vehicle.id} entered garage`, "arrival"));
        nextSpawnTick = currentTick + SPAWN_INTERVAL_MIN_TICKS
          + Math.floor(Math.random() * (SPAWN_INTERVAL_MAX_TICKS - SPAWN_INTERVAL_MIN_TICKS + 1));
      }
    }
  }

  // Move vehicles
  if (isRunning) {
    const updatedVehicles: Vehicle[] = [];

    for (const vehicle of vehicles) {
      if (vehicle.status === "departed") continue;

      if (vehicle.status === "entering" || vehicle.status === "parking" || vehicle.status === "leaving") {
        const move = advanceVehicleWithCollisionAvoidance(
          vehicle,
          elapsedSeconds,
          robots,
          vehicles,
          currentTick,
        );

        if (move.yielded) {
          updatedVehicles.push(vehicle);
          continue;
        }

        let updated = move.vehicle;

        if (move.arrived) {
          if (vehicle.status === "entering") {
            const entrySpot = findSpotForRouteEnd(spots, vehicle.route);
            if (entrySpot && !entrySpot.occupiedVehicleId) {
              const parked = vehicleParks(updated, entrySpot);
              updated = parked.vehicle;
              spots = spots.map((s) => (s.id === entrySpot.id ? parked.spot : s));
              newEvents.push(parked.event);
              if (spawnCount === 1) scriptedVehicleId = updated.id;
            }
          } else if (vehicle.status === "leaving") {
            updated = { ...updated, status: "departed" };
            newEvents.push(createEvent(`${vehicle.id} departed garage`, "departure"));
            continue;
          }
        }

        updatedVehicles.push(updated);
      } else {
        updatedVehicles.push(vehicle);
      }
    }

    vehicles = updatedVehicles;
  }

  // Auto charge requests
  if (isRunning) {
    for (const vehicle of vehicles) {
      if (vehicle.status !== "parked") continue;
      if (!shouldRequestCharge(vehicle)) continue;

      const hasActive = sessions.some((s) => (
        s.vehicleId === vehicle.id
        && ["queued", "assigned", "en_route", "active", "interrupted"].includes(s.status)
      ));
      if (hasActive) continue;

      const energy = estimateRequestedEnergy(vehicle);
      const result = requestCharge(
        { ...vehicle, requestedEnergyKwh: energy },
        sessions,
        currentTick,
        energy,
      );
      if (result) {
        vehicles = vehicles.map((v) => (v.id === vehicle.id ? result.vehicle : v));
        sessions = [result.session, ...sessions];
        newEvents.push(result.event);
        newEvents.push(createEvent(
          `${vehicle.id} prioritized for dispatch (score ${result.session.priorityScore})`,
          "prioritized",
        ));
      }
    }
  }

  // Departures
  if (isRunning) {
    for (const vehicle of vehicles) {
      const spot = spots.find((s) => s.id === vehicle.spotId);
      if (!spot) continue;

      const departureDue = currentTick >= vehicle.expectedDepartureTick;
      const completedDwell = vehicle.status === "completed"
        && vehicle.completedAtTick != null
        && currentTick - vehicle.completedAtTick >= COMPLETED_DWELL_TICKS;

      const shouldLeave = (
        (vehicle.status === "completed" && completedDwell)
        || (departureDue && ["parked", "waiting", "backup-needed"].includes(vehicle.status))
      );

      if (!shouldLeave || vehicle.status === "leaving") continue;

      if (
        departureDue
        && (vehicle.status === "waiting" || vehicle.status === "backup-needed")
      ) {
        sessions = sessions.map((s) => (
          s.vehicleId === vehicle.id && s.status === "queued"
            ? { ...s, status: "missed" as const }
            : s
        ));
        missedCount += 1;
        newEvents.push(createEvent(`${vehicle.id} left without service — queue too long`, "missed"));
      }

      const exitRoute = buildVehicleExitRoute(spot);
      const departing = vehicleDeparts(vehicle, spot, exitRoute);
      vehicles = vehicles.map((v) => (v.id === vehicle.id ? departing.vehicle : v));
      spots = spots.map((s) => (s.id === spot.id ? departing.spot : s));
      newEvents.push(departing.event);
    }
  }

  // Auto dispatch
  if (isRunning) {
    const hasAvailableRobot = robots.some((robot) => (
      (robot.status === "idle" || robot.status === "docked")
      && !robot.assignedVehicleId
      && robot.battery >= 20
    ));

    if (hasAvailableRobot) {
      const dispatchResult = dispatchNextJob(
        vehicles,
        sessions,
        robots,
        spots,
        dockBays,
        currentTick,
        { laneBlocked: state.laneBlocked },
      );

      if (dispatchResult) {
        if (state.laneBlocked) {
          newEvents.push(createEvent(
            `Lane block detected near ${LANE_BLOCK_ZONE.label}. Routing adjusted.`,
            "dispatch",
          ));
        }
        const assigned = assignRobot(dispatchResult.vehicle, dispatchResult.decision, robots, sessions);
        robots = assigned.robots;
        vehicles = vehicles.map((v) => (v.id === dispatchResult.vehicle.id ? assigned.vehicle : v));
        sessions = assigned.sessions;
        lastDecision = dispatchResult.decision;
        lastJobExplanation = dispatchResult.jobExplanation;
        newEvents.push(assigned.event);
      }
    }
  }

  // Robot movement (demo simulating only)
  const serviceArrivals: Array<{ robotId: string; vehicleId: string }> = [];
  const dockArrivals: string[] = [];
  const yieldEvents: string[] = [];

  if (isSimulating) {
  robots = robots.map((robot) => {
    if (robot.status === "faulted" || robot.status === "charging") return robot;

    const moving = robot.status === "en-route" || robot.status === "returning" || robot.status === "yielding";
    if (!moving || robot.routeIndex >= robot.route.length) return robot;

    const activeStatus = robot.status === "yielding" ? "en-route" : robot.status;
    const result = advanceRobotWithCollisionAvoidance(
      { ...robot, status: activeStatus },
      elapsedSeconds,
      robots,
      vehicles,
      spots,
      currentTick,
    );

    if (result.yielded) {
      const lastYield = robot.lastYieldTick ?? 0;
      if (currentTick - lastYield >= YIELD_EVENT_COOLDOWN_TICKS) {
        yieldEvents.push(robot.id);
      }
      return { ...result.robot, status: "yielding" as const, lastYieldTick: currentTick };
    }

    if (!result.arrived) {
      return { ...result.robot, status: activeStatus as Robot["status"] };
    }

    if (robot.status === "en-route" || robot.status === "yielding") {
      if (robot.assignedVehicleId) {
        serviceArrivals.push({ robotId: robot.id, vehicleId: robot.assignedVehicleId });
        return { ...result.robot, status: "charging" as const, route: [], routeIndex: 0, motionState: "charging" };
      }
    }

    dockArrivals.push(robot.id);
    const bay = dockBays.find((item) => item.id === robot.dockBayId);
    return {
      ...result.robot,
      status: "docked" as const,
      position: bay?.position ?? result.robot.position,
      route: [],
      routeIndex: 0,
      assignedVehicleId: null,
      motionState: "docked",
    };
  });

  yieldEvents.forEach((robotId) => {
    newEvents.push(createEvent(`${robotId} yielding to vehicle traffic`, "yield"));
  });

  for (const arrival of serviceArrivals) {
    const started = startCharging(arrival.robotId, arrival.vehicleId, robots, vehicles, sessions, currentTick);
    robots = started.robots;
    vehicles = started.vehicles;
    sessions = started.sessions;
    newEvents.push(started.event);
    if (chargeStartedTick == null && scriptedVehicleId === arrival.vehicleId) {
      chargeStartedTick = currentTick;
    }
  }

  for (const robotId of dockArrivals) {
    const docked = dockRobot(robotId, robots);
    robots = docked.robots;
    newEvents.push(docked.event);
  }
  }

  // Charging + dock recharge
  const chargingRobots = robots.filter((robot) => robot.status === "charging" && robot.assignedVehicleId);
  const completed: Array<{ robotId: string; vehicleId: string }> = [];
  let deliveredTotal = 0;

  if (chargingRobots.length > 0) {
    const updatedVehicles = [...vehicles];
    const updatedSessions = [...sessions];

    chargingRobots.forEach((robot) => {
      const vehicleIndex = updatedVehicles.findIndex((v) => v.id === robot.assignedVehicleId);
      const sessionIndex = updatedSessions.findIndex((s) => (
        s.vehicleId === robot.assignedVehicleId && s.status === "active"
      ));
      if (vehicleIndex < 0 || sessionIndex < 0) return;

      const result = advanceChargingStep(
        updatedVehicles[vehicleIndex],
        updatedSessions[sessionIndex],
        elapsedSeconds,
      );
      updatedVehicles[vehicleIndex] = result.vehicle;
      updatedSessions[sessionIndex] = result.session;
      deliveredTotal += result.deliveredKwh;
      if (result.complete) completed.push({ robotId: robot.id, vehicleId: result.vehicle.id });
    });

    vehicles = updatedVehicles;
    sessions = updatedSessions;
    robots = robots.map((robot) => {
      if (robot.status !== "charging" || !robot.assignedVehicleId) return robot;
      const share = deliveredTotal / Math.max(1, chargingRobots.length);
      return { ...robot, battery: Math.max(0, robot.battery - share * 0.45) };
    });
    energyToday += deliveredTotal;
  }

  for (const job of completed) {
    const done = completeCharging(
      job.robotId,
      job.vehicleId,
      robots,
      vehicles,
      sessions,
      dockBays,
      state.laneBlocked,
      currentTick,
    );
    robots = done.robots;
    vehicles = done.vehicles;
    sessions = done.sessions;
    newEvents.push(done.event);
  }

  robots = robots.map((robot) => {
    if (robot.status !== "docked" || robot.battery >= 95) {
      return robot.battery >= 95 && robot.status === "docked"
        ? { ...robot, status: "idle" as const }
        : robot;
    }
    const battery = Math.min(95, robot.battery + 0.18 * (elapsedSeconds / 0.5));
    return battery >= 95 ? { ...robot, battery, status: "idle" as const } : { ...robot, battery };
  });

  if (isRunning) {
    robots = robots.map((robot) => {
      if (robot.battery >= LOW_ROBOT_BATTERY_THRESHOLD) return robot;
      if (robot.status !== "idle" && robot.status !== "docked") return robot;
      if (robot.assignedVehicleId) return robot;

      const claimed = new Set(robots.filter((r) => r.dockBayId).map((r) => r.dockBayId));
      const bay = dockBays.find((b) => b.id === robot.dockBayId)
        ?? dockBays.find((b) => !claimed.has(b.id));
      if (!bay || robot.dockBayId === bay.id) return robot;

      newEvents.push(createEvent(`${robot.id} battery low, returning to dock`, "returning"));
      return {
        ...robot,
        status: "returning" as const,
        dockBayId: bay.id,
        route: buildRouteToDock(robot.position, bay, { laneBlocked: state.laneBlocked }),
        routeIndex: 0,
        targetPosition: bay.position,
      };
    });
  }

  // Scripted fault
  if (
    isRunning
    && !faultTriggered
    && chargeStartedTick != null
    && currentTick - chargeStartedTick >= DEMO_FAULT_AFTER_CHARGE_TICKS
    && scriptedVehicleId
  ) {
    const faultTarget = robots.find((r) => (
      r.assignedVehicleId === scriptedVehicleId && r.status === "charging"
    ));
    if (faultTarget) {
      const faulted = applyFaultToState(faultTarget, "connector_timeout", robots, vehicles, sessions);
      robots = faulted.robots;
      vehicles = faulted.vehicles;
      sessions = faulted.sessions;
      newEvents.push(...faulted.events);
      faultTriggered = true;

      if (faulted.vehicleId) {
        const requeued = requeueVehicle(faulted.vehicleId, vehicles, sessions);
        vehicles = requeued.vehicles;
        sessions = requeued.sessions;

        const backup = dispatchNextJob(vehicles, sessions, robots, spots, dockBays, currentTick, {
          laneBlocked: state.laneBlocked,
          reassignment: true,
        });
        if (backup) {
          const assigned = assignRobot(backup.vehicle, backup.decision, robots, sessions, true);
          robots = assigned.robots;
          vehicles = vehicles.map((v) => (v.id === backup.vehicle.id ? assigned.vehicle : v));
          sessions = assigned.sessions;
          lastDecision = backup.decision;
          lastJobExplanation = backup.jobExplanation;
          newEvents.push(createEvent(`Backup assigned: ${backup.decision.selectedRobotId}.`, "reassignment"));
          newEvents.push(assigned.event);
        } else {
          newEvents.push(createEvent(
            `No backup robot available. ${faulted.vehicleId} remains queued.`,
            "dispatch",
          ));
        }
      }
    }
  }

  return {
    state: {
      ...state,
      vehicles,
      robots,
      sessions,
      spots,
      energyToday,
      currentTick,
      nextSpawnTick,
      spawnCount,
      lastDecision,
      lastJobExplanation,
      queuedJobExplanations: updateQueuedExplanations(vehicles, sessions, currentTick),
      chargeStartedTick,
      faultTriggered,
      scriptedVehicleId,
      missedCount,
    },
    newEvents,
  };
}
