"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { advanceCharging } from "@/lib/charging";
import { DispatchPanel } from "@/components/DispatchPanel";
import { EventFeed } from "@/components/EventFeed";
import { GarageMap } from "@/components/GarageMap";
import { Header } from "@/components/Header";
import { RobotStatusStrip } from "@/components/RobotStatusStrip";
import { SelectedJobPanel } from "@/components/SelectedJobPanel";
import { SessionTable } from "@/components/SessionTable";
import { selectBestRobot, type DispatchDecision } from "@/lib/dispatch";
import {
  createDemoResetState,
  DEMO_CHARGE_BEFORE_FAULT_MS,
  DEMO_POST_RESET_MS,
  DEMO_TARGET_VEHICLE_ID,
} from "@/lib/demoScenario";
import { FAULT_TYPE_LABELS, formatKwh } from "@/lib/format";
import {
  DOCK_BAYS,
  ENERGY_DELIVERED_TODAY_KWH,
  INITIAL_EVENTS,
  INITIAL_ROBOTS,
  INITIAL_SESSIONS,
  INITIAL_VEHICLES,
  PARKING_SPOTS,
} from "@/lib/mockData";
import { deriveOperationsMetrics } from "@/lib/metrics";
import { advanceRobot } from "@/lib/movement";
import {
  buildRouteToDock,
  etaSecondsForRoute,
  getAvailableDockBay,
  LANE_BLOCK_ZONE,
  routeDistanceMeters,
} from "@/lib/routes";
import {
  getLatestSessionForVehicle,
  getSelectedVehicleAction,
  hasActiveSessionForVehicle,
} from "@/lib/vehicleActions";
import type { ChargingSession, EventLogItem, FaultType, Robot, Vehicle } from "@/lib/types";

const initialTarget = INITIAL_VEHICLES.find((vehicle) => vehicle.id === "EV-4466") ?? null;

function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function cloneRobots(robots: Robot[]): Robot[] {
  return robots.map((robot) => ({
    ...robot,
    position: { ...robot.position },
    targetPosition: robot.targetPosition ? { ...robot.targetPosition } : null,
    route: robot.route.map((point) => ({ ...point })),
  }));
}

export default function Home() {
  const [vehicles, setVehicles] = useState<Vehicle[]>(INITIAL_VEHICLES);
  const [robots, setRobots] = useState<Robot[]>(() => cloneRobots(INITIAL_ROBOTS));
  const [sessions, setSessions] = useState<ChargingSession[]>(INITIAL_SESSIONS);
  const [events, setEvents] = useState<EventLogItem[]>(INITIAL_EVENTS);
  const [energyToday, setEnergyToday] = useState(ENERGY_DELIVERED_TODAY_KWH);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>("A5");
  const [autoDispatch, setAutoDispatch] = useState(true);
  const [laneBlocked, setLaneBlocked] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
  const [telemetryTick, setTelemetryTick] = useState(0);
  const [lastDecision, setLastDecision] = useState<DispatchDecision | null>(
    initialTarget ? selectBestRobot(INITIAL_ROBOTS, initialTarget, PARKING_SPOTS, DOCK_BAYS) : null,
  );

  const robotsRef = useRef(robots);
  const vehiclesRef = useRef(vehicles);
  const sessionsRef = useRef(sessions);
  const laneBlockedRef = useRef(laneBlocked);
  const autoDispatchRef = useRef(autoDispatch);
  const demoTimersRef = useRef<number[]>([]);
  const demoCancelRef = useRef(false);

  useEffect(() => { robotsRef.current = robots; }, [robots]);
  useEffect(() => { vehiclesRef.current = vehicles; }, [vehicles]);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  useEffect(() => { laneBlockedRef.current = laneBlocked; }, [laneBlocked]);
  useEffect(() => { autoDispatchRef.current = autoDispatch; }, [autoDispatch]);

  useEffect(() => {
    let previousTime = performance.now();
    let chargeElapsed = 0;

    const timer = window.setInterval(() => {
      const currentTime = performance.now();
      const elapsedSeconds = Math.min((currentTime - previousTime) / 1000, 0.1);
      previousTime = currentTime;
      chargeElapsed += elapsedSeconds;
      setTelemetryTick((tick) => tick + 1);

      let robotsChanged = false;
      const serviceArrivals: Array<{ robotId: string; vehicleId: string }> = [];
      const dockArrivals: string[] = [];

      let nextRobots = robotsRef.current.map((robot) => {
        if ((robot.status !== "en-route" && robot.status !== "returning") || robot.routeIndex >= robot.route.length) {
          return robot;
        }
        const advanced = advanceRobot(robot, elapsedSeconds);
        robotsChanged = true;

        if (!advanced.arrived) return advanced.robot;
        if (robot.status === "en-route" && robot.assignedVehicleId) {
          serviceArrivals.push({ robotId: robot.id, vehicleId: robot.assignedVehicleId });
          return { ...advanced.robot, status: "charging" as const, route: [], routeIndex: 0 };
        }
        dockArrivals.push(robot.id);
        const bay = DOCK_BAYS.find((item) => item.id === robot.dockBayId);
        return {
          ...advanced.robot,
          status: "docked" as const,
          position: bay?.position ?? advanced.robot.position,
          route: [],
          routeIndex: 0,
          assignedVehicleId: null,
        };
      });

      let nextVehicles = vehiclesRef.current;
      let nextSessions = sessionsRef.current;
      const newEvents: EventLogItem[] = [];

      if (serviceArrivals.length > 0) {
        nextVehicles = nextVehicles.map((vehicle) => (
          serviceArrivals.some((arrival) => arrival.vehicleId === vehicle.id)
            ? { ...vehicle, status: "charging" as const }
            : vehicle
        ));
        nextSessions = nextSessions.map((session) => (
          serviceArrivals.some((arrival) => arrival.vehicleId === session.vehicleId)
            && (session.status === "queued" || session.status === "assigned" || session.status === "en_route" || session.status === "interrupted")
            ? { ...session, status: "active" as const, startedAt: nowLabel(), etaSeconds: null }
            : session
        ));
        serviceArrivals.forEach((arrival, index) => newEvents.push({
          id: `E-arrive-${Date.now()}-${index}`,
          message: `${arrival.robotId} arrived and started charging ${arrival.vehicleId}`,
          timestamp: nowLabel(),
          type: "charging",
        }));
      }

      if (dockArrivals.length > 0) {
        dockArrivals.forEach((robotId, index) => newEvents.push({
          id: `E-dock-${Date.now()}-${index}`,
          message: `${robotId} docked and started recharging`,
          timestamp: nowLabel(),
          type: "dock",
        }));
      }

      if (chargeElapsed >= 0.5) {
        const chargingRobots = nextRobots.filter((robot) => robot.status === "charging" && robot.assignedVehicleId);
        const completed: Array<{ robotId: string; vehicleId: string }> = [];
        const chargingElapsed = chargeElapsed;
        chargeElapsed = 0;

        if (chargingRobots.length > 0) {
          let deliveredTotal = 0;
          const updatedVehicles = [...nextVehicles];
          const updatedSessions = [...nextSessions];

          chargingRobots.forEach((robot) => {
            const vehicleIndex = updatedVehicles.findIndex((vehicle) => vehicle.id === robot.assignedVehicleId);
            const sessionIndex = updatedSessions.findIndex((session) => (
              session.vehicleId === robot.assignedVehicleId && session.status === "active"
            ));
            if (vehicleIndex < 0 || sessionIndex < 0) return;

            const result = advanceCharging(
              updatedVehicles[vehicleIndex],
              updatedSessions[sessionIndex],
              chargingElapsed,
            );
            updatedVehicles[vehicleIndex] = result.vehicle;
            updatedSessions[sessionIndex] = result.session;
            deliveredTotal += result.deliveredKwh;
            if (result.complete) completed.push({ robotId: robot.id, vehicleId: result.vehicle.id });
          });

          nextVehicles = updatedVehicles;
          nextSessions = updatedSessions;
          nextRobots = nextRobots.map((robot) => {
            if (robot.status !== "charging" || !robot.assignedVehicleId) return robot;
            const deliveredByRobot = deliveredTotal / Math.max(1, chargingRobots.length);
            return { ...robot, battery: Math.max(0, robot.battery - deliveredByRobot * 0.45) };
          });
          robotsChanged = true;
          if (deliveredTotal > 0) setEnergyToday((current) => current + deliveredTotal);
        }

        if (completed.length > 0) {
          const claimedDockBays = new Set(
            nextRobots
              .filter((robot) => !completed.some((job) => job.robotId === robot.id))
              .map((robot) => robot.dockBayId)
              .filter((dockBayId): dockBayId is string => Boolean(dockBayId)),
          );
          nextRobots = nextRobots.map((robot) => {
            const job = completed.find((item) => item.robotId === robot.id);
            if (!job) return robot;
            const bay = DOCK_BAYS.find((item) => !claimedDockBays.has(item.id)) ?? null;
            if (!bay) {
              return {
                ...robot,
                status: "idle" as const,
                assignedVehicleId: null,
                dockBayId: null,
                route: [],
                routeIndex: 0,
                targetPosition: null,
              };
            }
            claimedDockBays.add(bay.id);
            const route = buildRouteToDock(robot.position, bay, { laneBlocked: laneBlockedRef.current });
            return {
              ...robot,
              status: "returning" as const,
              assignedVehicleId: null,
              dockBayId: bay.id,
              route,
              routeIndex: 0,
              targetPosition: bay.position,
            };
          });
          robotsChanged = true;
          completed.forEach((job, index) => newEvents.push({
            id: `E-complete-${Date.now()}-${index}`,
            message: `${job.vehicleId} charge complete. ${job.robotId} returning to dock.`,
            timestamp: nowLabel(),
            type: "charging",
          }));
        }

        nextRobots = nextRobots.map((robot) => {
          if (robot.status !== "docked" || robot.battery >= 95) {
            return robot.battery >= 95 && robot.status === "docked"
              ? { ...robot, status: "idle" as const }
              : robot;
          }
          const battery = Math.min(95, robot.battery + 0.18 * (chargingElapsed / 0.5));
          return battery >= 95 ? { ...robot, battery, status: "idle" as const } : { ...robot, battery };
        });
        robotsChanged = true;
      }

      if (robotsChanged) {
        robotsRef.current = nextRobots;
        setRobots(nextRobots);
      }
      if (nextVehicles !== vehiclesRef.current) {
        vehiclesRef.current = nextVehicles;
        setVehicles(nextVehicles);
      }
      if (nextSessions !== sessionsRef.current) {
        sessionsRef.current = nextSessions;
        setSessions(nextSessions);
      }
      if (newEvents.length > 0) setEvents((current) => [...newEvents.reverse(), ...current]);
    }, 50);

    return () => window.clearInterval(timer);
  }, []);

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.spotId === selectedSpotId) ?? null,
    [vehicles, selectedSpotId],
  );

  const operationsMetrics = useMemo(
    () => deriveOperationsMetrics(robots, vehicles, sessions, events, energyToday, DOCK_BAYS),
    [energyToday, events, robots, sessions, vehicles],
  );

  function clearDemoTimers() {
    demoTimersRef.current.forEach((id) => window.clearTimeout(id));
    demoTimersRef.current = [];
  }

  function scheduleDemo(callback: () => void, delayMs: number) {
    const id = window.setTimeout(() => {
      if (demoCancelRef.current) return;
      callback();
    }, delayMs);
    demoTimersRef.current.push(id);
  }

  function addEvent(message: string, type: EventLogItem["type"]) {
    setEvents((current) => [{
      id: `E-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      message,
      timestamp: nowLabel(),
      type,
    }, ...current]);
  }

  function requestChargeFor(vehicle: Vehicle, energyKwh = vehicle.requestedEnergyKwh ?? 22): Vehicle | null {
    if (hasActiveSessionForVehicle(vehicle.id, sessionsRef.current)) return null;
    if (vehicle.status === "waiting" || vehicle.status === "backup-needed") return vehicle;
    if (vehicle.status !== "parked" && vehicle.status !== "completed") return null;

    const requested = {
      ...vehicle,
      status: "waiting" as const,
      assignedRobotId: null,
      requestedEnergyKwh: energyKwh,
      priority: vehicle.priority,
    };
    const nextVehicles = vehiclesRef.current.map((item) => (item.id === vehicle.id ? requested : item));
    const nextSessions: ChargingSession[] = [{
      id: `S-${Date.now()}`,
      vehicleId: vehicle.id,
      spotId: vehicle.spotId,
      robotId: null,
      status: "queued",
      energyKwh: 0,
      requestedKwh: energyKwh,
      etaSeconds: null,
      startedAt: nowLabel(),
    }, ...sessionsRef.current];
    vehiclesRef.current = nextVehicles;
    sessionsRef.current = nextSessions;
    setVehicles(nextVehicles);
    setSessions(nextSessions);
    addEvent(`${vehicle.id} requested ${formatKwh(energyKwh)} at ${vehicle.spotId}`, "request");
    return requested;
  }

  function dispatchVehicle(vehicle: Vehicle, reassignment = false): DispatchDecision | null {
    if (vehicle.status !== "waiting" && vehicle.status !== "backup-needed") return null;
    const decision = selectBestRobot(
      robotsRef.current,
      vehicle,
      PARKING_SPOTS,
      DOCK_BAYS,
      { laneBlocked: laneBlockedRef.current },
    );
    if (!decision) {
      const nextVehicles = vehiclesRef.current.map((item) => (
        item.id === vehicle.id
          ? { ...item, status: "backup-needed" as const, assignedRobotId: null }
          : item
      ));
      vehiclesRef.current = nextVehicles;
      setVehicles(nextVehicles);
      addEvent(`No backup robot available. ${vehicle.id} remains queued.`, "dispatch");
      setLastDecision(null);
      return null;
    }

    if (laneBlockedRef.current) {
      addEvent(`Lane block detected near ${LANE_BLOCK_ZONE.label}. Routing adjusted.`, "dispatch");
    }

    const nextRobots = robotsRef.current.map((robot) => (
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
          }
        : robot
    ));
    const nextVehicles = vehiclesRef.current.map((item) => (
      item.id === vehicle.id
        ? { ...item, assignedRobotId: decision.selectedRobotId, status: "assigned" as const }
        : item
    ));
    const nextSessions = sessionsRef.current.map((session) => (
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

    robotsRef.current = nextRobots;
    vehiclesRef.current = nextVehicles;
    sessionsRef.current = nextSessions;
    setRobots(nextRobots);
    setVehicles(nextVehicles);
    setSessions(nextSessions);
    setLastDecision(decision);
    addEvent(
      reassignment
        ? `${vehicle.id} reassigned to ${decision.selectedRobotId}`
        : `${decision.selectedRobotId} dispatched to ${vehicle.id}`,
      reassignment ? "reassignment" : "dispatch",
    );
    return decision;
  }

  function handlePrimaryVehicleAction() {
    if (!selectedVehicle) return;
    const latest = getLatestSessionForVehicle(selectedVehicle.id, sessionsRef.current);
    const canDispatchNow = Boolean(
      (selectedVehicle.status === "waiting" || selectedVehicle.status === "backup-needed")
      && selectBestRobot(robotsRef.current, selectedVehicle, PARKING_SPOTS, DOCK_BAYS, {
        laneBlocked: laneBlockedRef.current,
      }),
    );
    const action = getSelectedVehicleAction(
      selectedVehicle,
      latest,
      robotsRef.current.find((robot) => robot.id === selectedVehicle.assignedRobotId) ?? null,
      canDispatchNow,
    );

    switch (action.actionType) {
      case "request":
      case "new-request": {
        const request = requestChargeFor(selectedVehicle);
        if (request && autoDispatchRef.current) dispatchVehicle(request);
        break;
      }
      case "dispatch":
      case "backup":
        dispatchVehicle(selectedVehicle);
        break;
      case "fault": {
        const robot = robotsRef.current.find((item) => item.id === selectedVehicle.assignedRobotId);
        if (robot) simulateFault(robot);
        break;
      }
      default:
        break;
    }
  }

  function simulateFault(
    robot: Robot,
    faultType: FaultType = "connector_timeout",
    forceReassign = false,
  ) {
    if (robot.status === "faulted") return;
    const vehicleId = robot.assignedVehicleId;
    const label = FAULT_TYPE_LABELS[faultType];

    const nextRobots = robotsRef.current.map((item) => (
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
          }
        : item
    ));
    const nextVehicles = vehiclesRef.current.map((vehicle) => (
      vehicle.id === vehicleId
        ? { ...vehicle, status: "backup-needed" as const, assignedRobotId: null }
        : vehicle
    ));
    const nextSessions = sessionsRef.current.map((session) => (
      session.vehicleId === vehicleId && session.status !== "completed"
        ? { ...session, status: "interrupted" as const, robotId: null, etaSeconds: null }
        : session
    ));

    robotsRef.current = nextRobots;
    vehiclesRef.current = nextVehicles;
    sessionsRef.current = nextSessions;
    setRobots(nextRobots);
    setVehicles(nextVehicles);
    setSessions(nextSessions);

    if (!vehicleId) {
      addEvent(`${robot.id} faulted: ${label}`, "fault");
      return;
    }

    addEvent(`${robot.id} faulted while serving ${vehicleId}: ${label}`, "fault");
    addEvent(`${vehicleId} job returned to queue`, "fault");

    const waitingVehicle = nextVehicles.find((vehicle) => vehicle.id === vehicleId);
    if ((forceReassign || autoDispatchRef.current) && waitingVehicle) {
      const restoredSessions = sessionsRef.current.map((session) => (
        session.vehicleId === vehicleId && session.status === "interrupted"
          ? { ...session, status: "queued" as const }
          : session
      ));
      const restoredVehicles = vehiclesRef.current.map((vehicle) => (
        vehicle.id === vehicleId ? { ...vehicle, status: "waiting" as const } : vehicle
      ));
      sessionsRef.current = restoredSessions;
      vehiclesRef.current = restoredVehicles;
      setSessions(restoredSessions);
      setVehicles(restoredVehicles);
      dispatchVehicle({ ...waitingVehicle, status: "waiting" }, true);
    }
  }

  function clearFault(robotId: string) {
    const robot = robotsRef.current.find((item) => item.id === robotId);
    if (!robot || robot.status !== "faulted") return;
    const bay = getAvailableDockBay(robotsRef.current, DOCK_BAYS, robotId);
    const nextRobots = robotsRef.current.map((item) => {
      if (item.id !== robotId) return item;
      if (!bay) return { ...item, status: "idle" as const, faultType: null };
      const route = buildRouteToDock(item.position, bay, { laneBlocked: laneBlockedRef.current });
      return {
        ...item,
        status: "returning" as const,
        faultType: null,
        dockBayId: bay.id,
        route,
        routeIndex: 0,
        targetPosition: bay.position,
      };
    });
    robotsRef.current = nextRobots;
    setRobots(nextRobots);
    addEvent(`${robotId} fault cleared; returning to ${bay?.id ?? "staging"}`, "fault");
  }

  function toggleDispatchMode() {
    const nextMode = !autoDispatch;
    setAutoDispatch(nextMode);
    addEvent(`Dispatch mode changed to ${nextMode ? "AUTO" : "MANUAL"}`, "dispatch");
    if (nextMode) {
      const waiting = vehiclesRef.current.find((vehicle) => (
        vehicle.status === "waiting" || vehicle.status === "backup-needed"
      ));
      if (waiting) dispatchVehicle({ ...waiting, status: "waiting" });
    }
  }

  function toggleLaneBlock() {
    const next = !laneBlocked;
    setLaneBlocked(next);
    addEvent(
      next
        ? `Lane block detected near ${LANE_BLOCK_ZONE.label}. Routing adjusted.`
        : `Lane block near ${LANE_BLOCK_ZONE.label} cleared`,
      "dispatch",
    );
  }

  function applyResetState(message: string, options?: { forDemo?: boolean }) {
    clearDemoTimers();
    if (!options?.forDemo) {
      demoCancelRef.current = true;
      setDemoRunning(false);
    }
    const snapshot = createDemoResetState();
    const nextRobots = cloneRobots(snapshot.robots);
    robotsRef.current = nextRobots;
    vehiclesRef.current = snapshot.vehicles;
    sessionsRef.current = snapshot.sessions;
    setRobots(nextRobots);
    setVehicles(snapshot.vehicles);
    setSessions(snapshot.sessions);
    setEnergyToday(snapshot.energyToday);
    setSelectedSpotId(snapshot.selectedSpotId);
    setLaneBlocked(false);
    setAutoDispatch(true);
    const target = snapshot.vehicles.find((vehicle) => vehicle.id === DEMO_TARGET_VEHICLE_ID) ?? null;
    setLastDecision(
      target
        ? selectBestRobot(
          nextRobots,
          { ...target, status: "waiting", requestedEnergyKwh: 22 },
          PARKING_SPOTS,
          DOCK_BAYS,
        )
        : null,
    );
    setEvents([
      { id: `E-reset-${Date.now()}`, message, timestamp: nowLabel(), type: "dispatch" },
      ...snapshot.events,
    ]);
  }

  function resetScenario() {
    applyResetState("Scenario reset to demo baseline");
  }

  function runDemoScenario() {
    clearDemoTimers();
    demoCancelRef.current = false;
    setDemoRunning(true);
    applyResetState("Demo scenario started", { forDemo: true });

    scheduleDemo(() => {
      const target = vehiclesRef.current.find((vehicle) => vehicle.id === DEMO_TARGET_VEHICLE_ID);
      if (!target) {
        setDemoRunning(false);
        return;
      }
      setSelectedSpotId(target.spotId);
      const requested = requestChargeFor({ ...target, status: "parked" }, 22);
      if (!requested) {
        setDemoRunning(false);
        return;
      }
      dispatchVehicle(requested);
    }, DEMO_POST_RESET_MS);

    const pollForCharging = () => {
      const robot = robotsRef.current.find((item) => item.assignedVehicleId === DEMO_TARGET_VEHICLE_ID);
      if (demoCancelRef.current) {
        setDemoRunning(false);
        return;
      }
      if (robot?.status === "charging") {
        scheduleDemo(() => {
          const active = robotsRef.current.find((item) => item.assignedVehicleId === DEMO_TARGET_VEHICLE_ID);
          if (active?.status === "charging") {
            simulateFault(active, "connector_timeout", true);
          }
          setDemoRunning(false);
          addEvent("Demo scenario complete — review dispatch and event feed", "dispatch");
        }, DEMO_CHARGE_BEFORE_FAULT_MS);
        return;
      }
      if (!robot || robot.status === "faulted") {
        setDemoRunning(false);
        return;
      }
      scheduleDemo(pollForCharging, 400);
    };

    scheduleDemo(pollForCharging, DEMO_POST_RESET_MS + 700);
  }

  useEffect(() => () => clearDemoTimers(), []);

  const selectedSession = selectedVehicle
    ? getLatestSessionForVehicle(selectedVehicle.id, sessions)
    : null;
  const isSelectedJobActive = Boolean(
    selectedVehicle
    && (selectedVehicle.status === "assigned" || selectedVehicle.status === "charging"),
  );
  const assignedRobot = isSelectedJobActive && selectedVehicle?.assignedRobotId
    ? robots.find((robot) => robot.id === selectedVehicle.assignedRobotId) ?? null
    : null;
  const lastRobotId = selectedSession?.robotId ?? null;

  const selectedEtaSeconds = assignedRobot?.status === "en-route"
    ? etaSecondsForRoute(assignedRobot.position, assignedRobot.route, assignedRobot.routeIndex)
    : null;
  const routeRemainingMeters = assignedRobot && assignedRobot.route.length > 0
    ? routeDistanceMeters(assignedRobot.position, assignedRobot.route, assignedRobot.routeIndex)
    : assignedRobot?.status === "charging"
      ? 0
      : null;
  const telemetryAgeSeconds = 0.4 + (telemetryTick % 16) * 0.05;

  const canDispatch = Boolean(
    selectedVehicle
    && (selectedVehicle.status === "waiting" || selectedVehicle.status === "backup-needed")
    && selectBestRobot(robots, selectedVehicle, PARKING_SPOTS, DOCK_BAYS, { laneBlocked }),
  );
  const primaryAction = getSelectedVehicleAction(
    selectedVehicle,
    selectedSession,
    assignedRobot,
    canDispatch,
  );
  const canFault = Boolean(
    assignedRobot
    && (assignedRobot.status === "en-route" || assignedRobot.status === "charging"),
  );
  const activeJobCount = vehicles.filter((vehicle) => (
    vehicle.status === "assigned" || vehicle.status === "charging"
  )).length;

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-surface">
      <Header
        autoDispatch={autoDispatch}
        onToggleDispatchMode={toggleDispatchMode}
        demoRunning={demoRunning}
        laneBlocked={laneBlocked}
        canSimulateFault={canFault}
        primaryDisabled={primaryAction.disabled}
        primaryLabel={primaryAction.label}
        activeJobCount={activeJobCount}
        onRunDemo={runDemoScenario}
        onResetScenario={resetScenario}
        onPrimaryAction={handlePrimaryVehicleAction}
        onSimulateFault={() => assignedRobot && simulateFault(assignedRobot)}
        onToggleLaneBlock={toggleLaneBlock}
      />
      <main className="mx-auto grid min-h-0 w-full max-w-[1440px] flex-1 grid-cols-1 gap-2 overflow-y-auto p-3 lg:grid-cols-12 lg:overflow-hidden xl:px-6">
        <div className="grid min-h-[620px] gap-2 lg:col-span-8 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_132px]">
          <GarageMap
            spots={PARKING_SPOTS}
            vehicles={vehicles}
            robots={robots}
            metrics={operationsMetrics.commandBar}
            selectedSpotId={selectedSpotId}
            autoDispatch={autoDispatch}
            dockOccupancy={operationsMetrics.dockOccupancy}
            laneBlocked={laneBlocked}
            onSelectSpot={setSelectedSpotId}
          />
          <div className="grid min-h-0 grid-cols-12 gap-2">
            <div className="col-span-5 min-h-0"><RobotStatusStrip robots={robots} onClearFault={clearFault} /></div>
            <div className="col-span-7 min-h-0"><SessionTable sessions={sessions} robots={robots} /></div>
          </div>
        </div>

        <aside className="grid min-h-[620px] gap-2 lg:col-span-4 lg:min-h-0 lg:grid-rows-[300px_210px_minmax(0,1fr)]">
          <SelectedJobPanel
            vehicle={selectedVehicle}
            robot={assignedRobot}
            lastRobotId={lastRobotId}
            session={selectedSession}
            etaSeconds={selectedEtaSeconds}
            routeRemainingMeters={routeRemainingMeters}
            telemetryAgeSeconds={telemetryAgeSeconds}
            action={primaryAction}
            onPrimaryAction={handlePrimaryVehicleAction}
          />
          <DispatchPanel decision={lastDecision} autoDispatch={autoDispatch} />
          <EventFeed events={events} />
        </aside>
      </main>
    </div>
  );
}
