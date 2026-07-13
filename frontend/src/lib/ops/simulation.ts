import type {
  ChargingSession,
  DemoMode,
  DockBay,
  EventLogItem,
  JobPriorityExplanation,
  ParkingSpot,
  Robot,
  Vehicle,
} from "../types";
import type { DispatchDecision } from "../dispatch";
import { buildRouteToDock, LANE_BLOCK_ZONE } from "../routes";
import {
  COMPLETED_DWELL_TICKS,
  DEMO_FAULT_AFTER_CHARGE_TICKS,
  DEMO_FIRST_SPAWN_TICK,
  LOW_ROBOT_BATTERY_THRESHOLD,
  MAX_ACTIVE_VEHICLES,
  SIMULATION_TIME_SCALE,
  SPAWN_INTERVAL_MAX_TICKS,
  SPAWN_INTERVAL_MIN_TICKS,
  SPAWN_RETRY_COOLDOWN_TICKS,
  YIELD_EVENT_COOLDOWN_TICKS,
} from "./constants";
import { DEMO_VEHICLE_SPAWN_PLAN } from "./demoScenario";
import { calculateJobPriority, dispatchNextJob } from "./dispatch";
import { advanceRobotWithCollisionAvoidance, advanceVehicleWithCollisionAvoidance } from "./movement";
import { buildVehicleExitRoute } from "./routes";
import {
  applyFaultToState,
  assignRobot,
  clearSpotAfterDeparture,
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
import {
  countActiveVehicles,
  findAvailableSpot,
  findSpotById,
  getAvailablePlannedOrFallbackSpot,
  reserveSpot,
  spawnVehicle,
} from "./vehicleSpawn";

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
  spawnPlanIndex: number;
  laneBlocked: boolean;
  demoMode: DemoMode;
  lastDecision: DispatchDecision | null;
  lastJobExplanation: JobPriorityExplanation | null;
  queuedJobExplanations: JobPriorityExplanation[];
  chargeStartedTick: number | null;
  faultTriggered: boolean;
  backupAssigned: boolean;
  scriptedVehicleId: string | null;
  missedCount: number;
  eventKeys: Set<string>;
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

function pushOnce(
  events: EventLogItem[],
  keys: Set<string>,
  key: string,
  message: string,
  type: EventLogItem["type"],
): EventLogItem[] {
  if (keys.has(key)) return events;
  keys.add(key);
  return [...events, createEvent(message, type)];
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
    spawnPlanIndex: 0,
    laneBlocked: false,
    demoMode: options?.demoMode ?? "idle",
    lastDecision: null,
    lastJobExplanation: null,
    queuedJobExplanations: [],
    chargeStartedTick: null,
    faultTriggered: false,
    backupAssigned: false,
    scriptedVehicleId: null,
    missedCount: 0,
    eventKeys: new Set(),
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

function maybeSpawnVehicle(state: {
  vehicles: Vehicle[];
  spots: ParkingSpot[];
  currentTick: number;
  nextSpawnTick: number;
  spawnCount: number;
  spawnPlanIndex: number;
  scriptedVehicleId: string | null;
  eventKeys: Set<string>;
}): {
  vehicles: Vehicle[];
  spots: ParkingSpot[];
  nextSpawnTick: number;
  spawnCount: number;
  spawnPlanIndex: number;
  scriptedVehicleId: string | null;
  newEvents: EventLogItem[];
} {
  const newEvents: EventLogItem[] = [];
  let {
    vehicles,
    spots,
    currentTick,
    nextSpawnTick,
    spawnCount,
    spawnPlanIndex,
    scriptedVehicleId,
    eventKeys,
  } = state;

  if (currentTick < nextSpawnTick) {
    return { vehicles, spots, nextSpawnTick, spawnCount, spawnPlanIndex, scriptedVehicleId, newEvents };
  }

  if (countActiveVehicles(vehicles) >= MAX_ACTIVE_VEHICLES) {
    return {
      vehicles, spots, spawnCount, spawnPlanIndex, scriptedVehicleId, newEvents,
      nextSpawnTick: currentTick + SPAWN_RETRY_COOLDOWN_TICKS,
    };
  }

  const entranceBusy = vehicles.some((v) => v.status === "entering" || v.status === "parking");
  if (entranceBusy) {
    return {
      vehicles, spots, spawnCount, spawnPlanIndex, scriptedVehicleId, newEvents,
      nextSpawnTick: currentTick + SPAWN_RETRY_COOLDOWN_TICKS,
    };
  }

  if (vehicles.some((v) => v.status === "leaving")) {
    return {
      vehicles, spots, spawnCount, spawnPlanIndex, scriptedVehicleId, newEvents,
      nextSpawnTick: currentTick + SPAWN_RETRY_COOLDOWN_TICKS,
    };
  }

  let plan: (typeof DEMO_VEHICLE_SPAWN_PLAN)[number] | null =
    spawnPlanIndex < DEMO_VEHICLE_SPAWN_PLAN.length
      ? DEMO_VEHICLE_SPAWN_PLAN[spawnPlanIndex]
      : null;
  let target: ParkingSpot | null = null;

  if (plan) {
    if (currentTick < plan.spawnAtTick) {
      return {
        vehicles, spots, spawnCount, spawnPlanIndex, scriptedVehicleId, newEvents,
        nextSpawnTick: plan.spawnAtTick,
      };
    }
    if (vehicles.some((v) => v.id === plan.id)) {
      return {
        vehicles, spots, spawnCount, scriptedVehicleId, newEvents,
        spawnPlanIndex: spawnPlanIndex + 1,
        nextSpawnTick: currentTick + SPAWN_RETRY_COOLDOWN_TICKS,
      };
    }
    target = getAvailablePlannedOrFallbackSpot(plan.spotId, spots, vehicles);
    if (!target) {
      return {
        vehicles, spots, spawnCount, spawnPlanIndex, scriptedVehicleId, newEvents,
        nextSpawnTick: currentTick + SPAWN_RETRY_COOLDOWN_TICKS,
      };
    }
  } else {
    target = findAvailableSpot(spots, vehicles);
  }

  if (!target) {
    return {
      vehicles, spots, spawnCount, spawnPlanIndex, scriptedVehicleId, newEvents,
      nextSpawnTick: currentTick + SPAWN_RETRY_COOLDOWN_TICKS,
    };
  }

  const vehicle = spawnVehicle(target, currentTick, {
    plan: plan ?? undefined,
    vehicleId: plan?.id,
  });
  const reserved = reserveSpot(target, vehicle.id);
  if (!reserved) {
    return {
      vehicles, spots, spawnCount, spawnPlanIndex, scriptedVehicleId, newEvents,
      nextSpawnTick: currentTick + SPAWN_RETRY_COOLDOWN_TICKS,
    };
  }
  spots = spots.map((s) => (s.id === target!.id ? reserved : s));
  vehicles = [...vehicles, vehicle];
  spawnCount += 1;
  if (plan) {
    spawnPlanIndex += 1;
    if (plan.id === "EV-4466") scriptedVehicleId = vehicle.id;
  }

  const entered = pushOnce(
    newEvents,
    eventKeys,
    `entered:${vehicle.id}`,
    `${vehicle.id} entered garage.`,
    "arrival",
  );

  nextSpawnTick = spawnPlanIndex < DEMO_VEHICLE_SPAWN_PLAN.length
    ? DEMO_VEHICLE_SPAWN_PLAN[spawnPlanIndex].spawnAtTick
    : currentTick + SPAWN_INTERVAL_MIN_TICKS
      + Math.floor(Math.random() * (SPAWN_INTERVAL_MAX_TICKS - SPAWN_INTERVAL_MIN_TICKS + 1));

  return {
    vehicles,
    spots,
    nextSpawnTick,
    spawnCount,
    spawnPlanIndex,
    scriptedVehicleId,
    newEvents: entered,
  };
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
    spawnPlanIndex,
    lastDecision,
    lastJobExplanation,
    chargeStartedTick,
    faultTriggered,
    backupAssigned,
    scriptedVehicleId,
    missedCount,
    eventKeys,
  } = state;

  eventKeys = new Set(eventKeys);

  const isRunning = state.demoMode === "running";
  const isEnding = state.demoMode === "ended";
  const isSimulating = isRunning || isEnding;

  if (isRunning) {
    currentTick += elapsedSeconds * SIMULATION_TIME_SCALE;
  }

  if (isRunning) {
    const spawned = maybeSpawnVehicle({
      vehicles,
      spots,
      currentTick,
      nextSpawnTick,
      spawnCount,
      spawnPlanIndex,
      scriptedVehicleId,
      eventKeys,
    });
    vehicles = spawned.vehicles;
    spots = spawned.spots;
    nextSpawnTick = spawned.nextSpawnTick;
    spawnCount = spawned.spawnCount;
    spawnPlanIndex = spawned.spawnPlanIndex;
    scriptedVehicleId = spawned.scriptedVehicleId;
    newEvents.push(...spawned.newEvents);
  }

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

        // Free bay once the leaving car reaches the aisle (first exit waypoint).
        if (vehicle.status === "leaving" && vehicle.spotId && updated.routeIndex >= 1) {
          const held = findSpotById(spots, vehicle.spotId);
          if (held) {
            spots = spots.map((s) => (
              s.id === held.id ? clearSpotAfterDeparture(held, vehicle.id) : s
            ));
          }
          updated = { ...updated, spotId: null };
        }

        if (move.arrived) {
          if (vehicle.status === "entering") {
            const entrySpot = vehicle.spotId
              ? findSpotById(spots, vehicle.spotId)
              : null;
            const canPark = Boolean(
              entrySpot
              && (!entrySpot.occupiedVehicleId || entrySpot.occupiedVehicleId === vehicle.id)
              && (!entrySpot.reservedVehicleId || entrySpot.reservedVehicleId === vehicle.id)
            );
            if (canPark && entrySpot) {
              const parked = vehicleParks(updated, entrySpot);
              if (parked) {
                updated = parked.vehicle;
                spots = spots.map((s) => (s.id === entrySpot.id ? parked.spot : s));
                newEvents.push(...pushOnce(
                  [],
                  eventKeys,
                  `parked:${vehicle.id}`,
                  parked.event.message,
                  "arrival",
                ));
              }
            }
          } else if (vehicle.status === "leaving") {
            if (vehicle.spotId) {
              const held = findSpotById(spots, vehicle.spotId);
              if (held) {
                spots = spots.map((s) => (
                  s.id === held.id ? clearSpotAfterDeparture(held, vehicle.id) : s
                ));
              }
            }
            updated = { ...updated, status: "departed", spotId: null, route: [], routeIndex: 0 };
            newEvents.push(...pushOnce(
              [],
              eventKeys,
              `departed:${vehicle.id}`,
              `${vehicle.id} departed garage.`,
              "departure",
            ));
            updatedVehicles.push(updated);
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

  if (isRunning) {
    for (const vehicle of vehicles) {
      if (vehicle.status !== "parked") continue;
      if (
        scriptedVehicleId
        && !backupAssigned
        && vehicle.id !== scriptedVehicleId
      ) {
        continue;
      }
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
        newEvents.push(...pushOnce(
          [],
          eventKeys,
          `request:${vehicle.id}:${result.session.id}`,
          result.event.message,
          "request",
        ));
      }
    }
  }

  // Departures — overnight: only completed charge dwell, one at a time
  if (isRunning) {
    let alreadyLeaving = vehicles.some((v) => v.status === "leaving");
    for (const vehicle of vehicles) {
      if (alreadyLeaving) break;
      const spot = spots.find((s) => s.id === vehicle.spotId);
      if (!spot) continue;

      const departureDue = currentTick >= vehicle.expectedDepartureTick;
      const completedDwell = vehicle.status === "completed"
        && vehicle.completedAtTick != null
        && currentTick - vehicle.completedAtTick >= COMPLETED_DWELL_TICKS;

      const shouldLeave = (
        (vehicle.status === "completed" && completedDwell)
        || (departureDue && vehicle.status === "parked" && vehicle.battery >= 70)
      );

      if (!shouldLeave || vehicle.status === "leaving") continue;

      const exitRoute = buildVehicleExitRoute(spot);
      const departing = vehicleDeparts(vehicle, spot, exitRoute);
      vehicles = vehicles.map((v) => (v.id === vehicle.id ? departing.vehicle : v));
      spots = spots.map((s) => (s.id === spot.id ? departing.spot : s));
      newEvents.push(...pushOnce(
        [],
        eventKeys,
        `departing:${vehicle.id}`,
        `${vehicle.id} preparing to leave.`,
        "departure",
      ));
      alreadyLeaving = true;
    }
  }

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

  const serviceArrivals: Array<{ robotId: string; vehicleId: string }> = [];
  const dockArrivals: string[] = [];
  const yieldEvents: string[] = [];

  if (isSimulating) {
    robots = robots.map((robot) => {
      if (robot.status === "faulted" || robot.status === "charging") return robot;
      if (robot.status !== "en-route" && robot.status !== "returning") return robot;

      if (!robot.route.length || robot.routeIndex >= robot.route.length) {
        if (robot.status === "en-route" && robot.assignedVehicleId) {
          serviceArrivals.push({ robotId: robot.id, vehicleId: robot.assignedVehicleId });
          return { ...robot, status: "charging" as const, route: [], routeIndex: 0, motionState: "charging" };
        }
        if (robot.status === "returning") {
          dockArrivals.push(robot.id);
          const bay = dockBays.find((item) => item.id === robot.dockBayId);
          return {
            ...robot,
            status: "docked" as const,
            position: bay?.position ?? robot.position,
            route: [],
            routeIndex: 0,
            assignedVehicleId: null,
            motionState: "docked",
          };
        }
        return robot;
      }

      const result = advanceRobotWithCollisionAvoidance(
        robot,
        elapsedSeconds,
        robots,
        vehicles,
        spots,
        currentTick,
      );

      if (result.yielded) {
        if (!robot.lastYieldTick || currentTick - robot.lastYieldTick >= YIELD_EVENT_COOLDOWN_TICKS) {
          yieldEvents.push(robot.id);
        }
        return result.robot;
      }

      if (!result.arrived) {
        return result.robot;
      }

      if (robot.status === "en-route" && robot.assignedVehicleId) {
        serviceArrivals.push({ robotId: robot.id, vehicleId: robot.assignedVehicleId });
        return { ...result.robot, status: "charging" as const, route: [], routeIndex: 0, motionState: "charging" };
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
      newEvents.push(createEvent(`${robotId} briefly yielding to traffic.`, "yield"));
    });

    for (const arrival of serviceArrivals) {
      const started = startCharging(
        arrival.robotId,
        arrival.vehicleId,
        robots,
        vehicles,
        sessions,
        currentTick,
        spots,
      );
      robots = started.robots;
      vehicles = started.vehicles;
      sessions = started.sessions;
      newEvents.push(...pushOnce(
        [],
        eventKeys,
        `charging:${arrival.robotId}:${arrival.vehicleId}`,
        `${arrival.robotId} connected to ${arrival.vehicleId}. Charging started.`,
        "charging",
      ));
      if (chargeStartedTick == null && scriptedVehicleId === arrival.vehicleId) {
        chargeStartedTick = currentTick;
      }
    }

    for (const robotId of dockArrivals) {
      const docked = dockRobot(robotId, robots);
      robots = docked.robots;
      newEvents.push(createEvent(`${robotId} returned to dock.`, "dock"));
    }
  }

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

      newEvents.push(createEvent(`${robot.id} battery low, returning to dock.`, "returning"));
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
      const delivered = sessions.find((s) => (
        s.vehicleId === faulted.vehicleId && s.status === "interrupted"
      ))?.energyKwh ?? 0;
      newEvents.push(createEvent(
        `Connector timeout on ${faultTarget.id} while serving ${faulted.vehicleId}.`,
        "fault",
      ));
      faultTriggered = true;

      if (faulted.vehicleId) {
        const requeued = requeueVehicle(faulted.vehicleId, vehicles, sessions);
        vehicles = requeued.vehicles;
        sessions = requeued.sessions;
        newEvents.push(createEvent(
          `${faulted.vehicleId} requeued with ${delivered.toFixed(1)} kWh delivered.`,
          "fault",
        ));

        const backup = dispatchNextJob(vehicles, sessions, robots, spots, dockBays, currentTick, {
          laneBlocked: state.laneBlocked,
          reassignment: true,
          preferredVehicleId: faulted.vehicleId,
        });
        if (backup) {
          const assigned = assignRobot(backup.vehicle, backup.decision, robots, sessions, true);
          robots = assigned.robots;
          vehicles = vehicles.map((v) => (v.id === backup.vehicle.id ? assigned.vehicle : v));
          sessions = assigned.sessions;
          lastDecision = backup.decision;
          lastJobExplanation = backup.jobExplanation;
          backupAssigned = true;
          newEvents.push(createEvent(
            `Backup assigned: ${backup.decision.selectedRobotId} to ${backup.vehicle.id}.`,
            "reassignment",
          ));
        } else {
          newEvents.push(createEvent(
            `No backup robot available. ${faulted.vehicleId} remains queued.`,
            "dispatch",
          ));
        }
      }
    }
  }

  // Retry backup if fault already fired but no robot was free yet.
  if (isRunning && faultTriggered && !backupAssigned && scriptedVehicleId) {
    const requeued = requeueVehicle(scriptedVehicleId, vehicles, sessions);
    vehicles = requeued.vehicles;
    sessions = requeued.sessions;
    const backup = dispatchNextJob(vehicles, sessions, robots, spots, dockBays, currentTick, {
      laneBlocked: state.laneBlocked,
      reassignment: true,
      preferredVehicleId: scriptedVehicleId,
    });
    if (backup) {
      const assigned = assignRobot(backup.vehicle, backup.decision, robots, sessions, true);
      robots = assigned.robots;
      vehicles = vehicles.map((v) => (v.id === backup.vehicle.id ? assigned.vehicle : v));
      sessions = assigned.sessions;
      lastDecision = backup.decision;
      lastJobExplanation = backup.jobExplanation;
      backupAssigned = true;
      newEvents.push(createEvent(
        `Backup assigned: ${backup.decision.selectedRobotId} to ${backup.vehicle.id}.`,
        "reassignment",
      ));
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
      spawnPlanIndex,
      lastDecision,
      lastJobExplanation,
      queuedJobExplanations: updateQueuedExplanations(vehicles, sessions, currentTick),
      chargeStartedTick,
      faultTriggered,
      backupAssigned,
      scriptedVehicleId,
      missedCount,
      eventKeys,
    },
    newEvents,
  };
}
