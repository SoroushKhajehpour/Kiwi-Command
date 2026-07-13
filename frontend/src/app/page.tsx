"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DispatchPanel } from "@/components/DispatchPanel";
import { EventFeed } from "@/components/EventFeed";
import { GarageMap } from "@/components/GarageMap";
import { Header } from "@/components/Header";
import { RobotStatusStrip } from "@/components/RobotStatusStrip";
import { SelectedJobPanel } from "@/components/SelectedJobPanel";
import { SessionTable } from "@/components/SessionTable";
import { selectBestRobot, type DispatchDecision } from "@/lib/dispatch";
import { createDemoResetState } from "@/lib/demoScenario";
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
import { assignRobot, clearFault, createEvent, requestCharge } from "@/lib/ops/stateTransitions";
import {
  createInitialSimState,
  tickSimulation,
  type GarageSimState,
} from "@/lib/ops/simulation";
import { resetVehicleCounter } from "@/lib/ops/vehicleSpawn";
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
import type {
  ChargingSession,
  DemoMode,
  EventLogItem,
  FaultType,
  JobPriorityExplanation,
  ParkingSpot,
  Robot,
  Vehicle,
} from "@/lib/types";
import { advanceCharging } from "@/lib/charging";

const initialTarget = INITIAL_VEHICLES.find((vehicle) => vehicle.id === "EV-4466") ?? null;

function cloneRobots(robots: Robot[]): Robot[] {
  return robots.map((robot) => ({
    ...robot,
    position: { ...robot.position },
    targetPosition: robot.targetPosition ? { ...robot.targetPosition } : null,
    route: robot.route.map((point) => ({ ...point })),
  }));
}

function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function Home() {
  const [vehicles, setVehicles] = useState<Vehicle[]>(INITIAL_VEHICLES);
  const [robots, setRobots] = useState<Robot[]>(() => cloneRobots(INITIAL_ROBOTS));
  const [sessions, setSessions] = useState<ChargingSession[]>(INITIAL_SESSIONS);
  const [events, setEvents] = useState<EventLogItem[]>(INITIAL_EVENTS);
  const [energyToday, setEnergyToday] = useState(ENERGY_DELIVERED_TODAY_KWH);
  const [spots, setSpots] = useState<ParkingSpot[]>(PARKING_SPOTS);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>("A5");
  const [autoDispatch, setAutoDispatch] = useState(true);
  const [laneBlocked, setLaneBlocked] = useState(false);
  const [demoMode, setDemoMode] = useState<DemoMode>("idle");
  const [telemetryTick, setTelemetryTick] = useState(0);
  const [lastDecision, setLastDecision] = useState<DispatchDecision | null>(
    initialTarget ? selectBestRobot(INITIAL_ROBOTS, initialTarget, PARKING_SPOTS, DOCK_BAYS) : null,
  );
  const [lastJobExplanation, setLastJobExplanation] = useState<JobPriorityExplanation | null>(null);
  const [queuedJobExplanations, setQueuedJobExplanations] = useState<JobPriorityExplanation[]>([]);
  const [missedCount, setMissedCount] = useState(0);

  const simStateRef = useRef<GarageSimState | null>(null);
  const robotsRef = useRef(robots);
  const vehiclesRef = useRef(vehicles);
  const sessionsRef = useRef(sessions);
  const laneBlockedRef = useRef(laneBlocked);
  const autoDispatchRef = useRef(autoDispatch);
  const demoModeRef = useRef(demoMode);

  useEffect(() => { robotsRef.current = robots; }, [robots]);
  useEffect(() => { vehiclesRef.current = vehicles; }, [vehicles]);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  useEffect(() => { laneBlockedRef.current = laneBlocked; }, [laneBlocked]);
  useEffect(() => { autoDispatchRef.current = autoDispatch; }, [autoDispatch]);
  useEffect(() => { demoModeRef.current = demoMode; }, [demoMode]);

  useEffect(() => {
    let previousTime = performance.now();
    let chargeElapsed = 0;

    const timer = window.setInterval(() => {
      const currentTime = performance.now();
      const elapsedSeconds = Math.min((currentTime - previousTime) / 1000, 0.1);
      previousTime = currentTime;
      chargeElapsed += elapsedSeconds;
      setTelemetryTick((tick) => tick + 1);

      const mode = demoModeRef.current;

      if (mode !== "idle") {
        if (!simStateRef.current) return;
        const result = tickSimulation(simStateRef.current, elapsedSeconds, DOCK_BAYS);
        simStateRef.current = { ...result.state, laneBlocked: laneBlockedRef.current };

        setVehicles(result.state.vehicles);
        setRobots(result.state.robots);
        setSessions(result.state.sessions);
        setSpots(result.state.spots);
        setEnergyToday(result.state.energyToday);
        setLastDecision(result.state.lastDecision);
        setLastJobExplanation(result.state.lastJobExplanation);
        setQueuedJobExplanations(result.state.queuedJobExplanations);
        setMissedCount(result.state.missedCount);

        if (result.newEvents.length > 0) {
          setEvents((current) => [...result.newEvents.reverse(), ...current]);
        }
        return;
      }

      // Manual idle-mode simulation loop
      let robotsChanged = false;
      const serviceArrivals: Array<{ robotId: string; vehicleId: string }> = [];
      const dockArrivals: string[] = [];
      let nextRobots = robotsRef.current.map((r) => r);
      let nextVehicles = vehiclesRef.current.map((v) => v);
      let nextSessions = sessionsRef.current.map((s) => s);
      const newEvents: EventLogItem[] = [];

      nextRobots = nextRobots.map((robot) => {
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

      if (serviceArrivals.length > 0) {
        nextVehicles = nextVehicles.map((vehicle) => (
          serviceArrivals.some((a) => a.vehicleId === vehicle.id)
            ? { ...vehicle, status: "charging" as const }
            : vehicle
        ));
        nextSessions = nextSessions.map((session) => (
          serviceArrivals.some((a) => a.vehicleId === session.vehicleId)
          && ["queued", "assigned", "en_route", "interrupted"].includes(session.status)
            ? { ...session, status: "active" as const, startedAt: nowLabel(), etaSeconds: null }
            : session
        ));
        serviceArrivals.forEach((a, i) => newEvents.push(createEvent(
          `${a.robotId} arrived and started charging ${a.vehicleId}`,
          "charging",
          `arrive-${i}`,
        )));
      }

      dockArrivals.forEach((robotId, i) => {
        newEvents.push(createEvent(`${robotId} docked and started recharging`, "dock", `dock-${i}`));
      });

      if (chargeElapsed >= 0.5) {
        const chargingRobots = nextRobots.filter((r) => r.status === "charging" && r.assignedVehicleId);
        const completed: Array<{ robotId: string; vehicleId: string }> = [];
        const chargingElapsed = chargeElapsed;
        chargeElapsed = 0;

        if (chargingRobots.length > 0) {
          let deliveredTotal = 0;
          chargingRobots.forEach((robot) => {
            const vi = nextVehicles.findIndex((v) => v.id === robot.assignedVehicleId);
            const si = nextSessions.findIndex((s) => s.vehicleId === robot.assignedVehicleId && s.status === "active");
            if (vi < 0 || si < 0) return;
            const result = advanceCharging(nextVehicles[vi], nextSessions[si], chargingElapsed);
            nextVehicles[vi] = result.vehicle;
            nextSessions[si] = result.session;
            deliveredTotal += result.deliveredKwh;
            if (result.complete) completed.push({ robotId: robot.id, vehicleId: result.vehicle.id });
          });
          nextRobots = nextRobots.map((robot) => {
            if (robot.status !== "charging" || !robot.assignedVehicleId) return robot;
            return { ...robot, battery: Math.max(0, robot.battery - (deliveredTotal / chargingRobots.length) * 0.45) };
          });
          robotsChanged = true;
          if (deliveredTotal > 0) setEnergyToday((c) => c + deliveredTotal);
        }

        if (completed.length > 0) {
          const claimed = new Set(
            nextRobots.filter((r) => !completed.some((j) => j.robotId === r.id))
              .map((r) => r.dockBayId).filter(Boolean),
          );
          nextRobots = nextRobots.map((robot) => {
            const job = completed.find((j) => j.robotId === robot.id);
            if (!job) return robot;
            const bay = DOCK_BAYS.find((b) => !claimed.has(b.id)) ?? null;
            if (!bay) return { ...robot, status: "idle" as const, assignedVehicleId: null, dockBayId: null, route: [], routeIndex: 0, targetPosition: null };
            claimed.add(bay.id);
            return {
              ...robot,
              status: "returning" as const,
              assignedVehicleId: null,
              dockBayId: bay.id,
              route: buildRouteToDock(robot.position, bay, { laneBlocked: laneBlockedRef.current }),
              routeIndex: 0,
              targetPosition: bay.position,
            };
          });
          robotsChanged = true;
          completed.forEach((job, i) => newEvents.push(createEvent(
            `${job.vehicleId} charge complete. ${job.robotId} returning to dock.`,
            "charging",
            `complete-${i}`,
          )));
        }

        nextRobots = nextRobots.map((robot) => {
          if (robot.status !== "docked" || robot.battery >= 95) {
            return robot.battery >= 95 && robot.status === "docked" ? { ...robot, status: "idle" as const } : robot;
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

  const selectedVehicle = useMemo(() => {
    if (selectedSpotId) {
      const atSpot = vehicles.find((v) => v.spotId === selectedSpotId);
      if (atSpot) return atSpot;
    }
    return vehicles.find((v) => v.status === "entering" || v.status === "leaving") ?? null;
  }, [vehicles, selectedSpotId]);

  const operationsMetrics = useMemo(
    () => deriveOperationsMetrics(robots, vehicles, sessions, events, energyToday, DOCK_BAYS, missedCount),
    [energyToday, events, missedCount, robots, sessions, vehicles],
  );

  function addEvent(message: string, type: EventLogItem["type"]) {
    setEvents((current) => [createEvent(message, type), ...current]);
  }

  function requestChargeFor(vehicle: Vehicle, energyKwh = vehicle.requestedEnergyKwh ?? 22): Vehicle | null {
    if (hasActiveSessionForVehicle(vehicle.id, sessionsRef.current)) return null;
    if (vehicle.status === "waiting" || vehicle.status === "backup-needed") return vehicle;
    if (vehicle.status !== "parked" && vehicle.status !== "completed") return null;

    const result = requestCharge(vehicle, sessionsRef.current, 0, energyKwh);
    if (!result) return null;

    const nextVehicles = vehiclesRef.current.map((item) => (item.id === vehicle.id ? result.vehicle : item));
    vehiclesRef.current = nextVehicles;
    sessionsRef.current = [result.session, ...sessionsRef.current];
    setVehicles(nextVehicles);
    setSessions(sessionsRef.current);
    addEvent(result.event.message, result.event.type);
    return result.vehicle;
  }

  function dispatchVehicle(vehicle: Vehicle, reassignment = false): DispatchDecision | null {
    if (vehicle.status !== "waiting" && vehicle.status !== "backup-needed") return null;
    const decision = selectBestRobot(
      robotsRef.current,
      vehicle,
      spots,
      DOCK_BAYS,
      { laneBlocked: laneBlockedRef.current },
    );
    if (!decision) {
      const nextVehicles = vehiclesRef.current.map((item) => (
        item.id === vehicle.id ? { ...item, status: "backup-needed" as const, assignedRobotId: null } : item
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

    const assigned = assignRobot(vehicle, decision, robotsRef.current, sessionsRef.current, reassignment);
    robotsRef.current = assigned.robots;
    vehiclesRef.current = vehiclesRef.current.map((item) => (item.id === vehicle.id ? assigned.vehicle : item));
    sessionsRef.current = assigned.sessions;
    setRobots(assigned.robots);
    setVehicles(vehiclesRef.current);
    setSessions(assigned.sessions);
    setLastDecision(decision);
    addEvent(assigned.event.message, assigned.event.type);
    return decision;
  }

  function handlePrimaryVehicleAction() {
    if (!selectedVehicle || demoMode !== "idle") return;
    const latest = getLatestSessionForVehicle(selectedVehicle.id, sessions);
    const canDispatchNow = Boolean(
      (selectedVehicle.status === "waiting" || selectedVehicle.status === "backup-needed")
      && selectBestRobot(robots, selectedVehicle, spots, DOCK_BAYS, { laneBlocked }),
    );
    const action = getSelectedVehicleAction(
      selectedVehicle,
      latest,
      robots.find((r) => r.id === selectedVehicle.assignedRobotId) ?? null,
      canDispatchNow,
    );

    switch (action.actionType) {
      case "request":
      case "new-request": {
        const request = requestChargeFor(selectedVehicle);
        if (request && autoDispatch) dispatchVehicle(request);
        break;
      }
      case "dispatch":
      case "backup":
        dispatchVehicle(selectedVehicle);
        break;
      case "fault": {
        const robot = robots.find((r) => r.id === selectedVehicle.assignedRobotId);
        if (robot) simulateFault(robot);
        break;
      }
      default:
        break;
    }
  }

  function simulateFault(robot: Robot, faultType: FaultType = "connector_timeout", forceReassign = false) {
    if (robot.status === "faulted" || demoMode !== "idle") return;
    const vehicleId = robot.assignedVehicleId;
    const label = FAULT_TYPE_LABELS[faultType];

    setRobots((current) => current.map((item) => (
      item.id === robot.id
        ? { ...item, status: "faulted" as const, faultType, assignedVehicleId: null, dockBayId: null, route: [], routeIndex: 0, targetPosition: null }
        : item
    )));
    setVehicles((current) => current.map((v) => (
      v.id === vehicleId ? { ...v, status: "backup-needed" as const, assignedRobotId: null } : v
    )));
    setSessions((current) => current.map((s) => (
      s.vehicleId === vehicleId && s.status !== "completed"
        ? { ...s, status: "interrupted" as const, robotId: null, etaSeconds: null }
        : s
    )));

    if (!vehicleId) {
      addEvent(`${robot.id} faulted: ${label}`, "fault");
      return;
    }
    addEvent(`${robot.id} faulted while serving ${vehicleId}: ${label}`, "fault");
    addEvent(`${vehicleId} job returned to queue`, "fault");

    if (forceReassign || autoDispatchRef.current) {
      const nextSessions = sessionsRef.current.map((s) => (
        s.vehicleId === vehicleId && s.status === "interrupted" ? { ...s, status: "queued" as const } : s
      ));
      const nextVehicles = vehiclesRef.current.map((v) => (
        v.id === vehicleId ? { ...v, status: "waiting" as const } : v
      ));
      sessionsRef.current = nextSessions;
      vehiclesRef.current = nextVehicles;
      setSessions(nextSessions);
      setVehicles(nextVehicles);
      const target = nextVehicles.find((v) => v.id === vehicleId);
      if (target) dispatchVehicle(target, true);
    }
  }

  function handleClearFault(robotId: string) {
    const result = clearFault(robotId, robots, DOCK_BAYS, laneBlocked);
    if (!result) return;
    setRobots(result.robots);
    addEvent(result.event.message, result.event.type);
  }

  function toggleDispatchMode() {
    if (demoMode !== "idle") return;
    const nextMode = !autoDispatch;
    setAutoDispatch(nextMode);
    addEvent(`Dispatch mode changed to ${nextMode ? "AUTO" : "MANUAL"}`, "dispatch");
    if (nextMode) {
      const waiting = vehicles.find((v) => v.status === "waiting" || v.status === "backup-needed");
      if (waiting) dispatchVehicle({ ...waiting, status: "waiting" });
    }
  }

  function toggleLaneBlock() {
    if (demoMode === "running") return;
    const next = !laneBlocked;
    setLaneBlocked(next);
    if (simStateRef.current) simStateRef.current = { ...simStateRef.current, laneBlocked: next };
    addEvent(
      next ? `Lane block detected near ${LANE_BLOCK_ZONE.label}. Routing adjusted.` : `Lane block near ${LANE_BLOCK_ZONE.label} cleared`,
      "dispatch",
    );
  }

  function restoreIdleState() {
    setVehicles(INITIAL_VEHICLES);
    setRobots(cloneRobots(INITIAL_ROBOTS));
    setSessions(INITIAL_SESSIONS);
    setSpots(PARKING_SPOTS);
    setEnergyToday(ENERGY_DELIVERED_TODAY_KWH);
    setSelectedSpotId("A5");
    setLaneBlocked(false);
    setAutoDispatch(true);
    setMissedCount(0);
    setLastJobExplanation(null);
    setQueuedJobExplanations([]);
    simStateRef.current = null;
    const target = INITIAL_VEHICLES.find((v) => v.id === "EV-4466") ?? null;
    setLastDecision(target ? selectBestRobot(INITIAL_ROBOTS, target, PARKING_SPOTS, DOCK_BAYS) : null);
    setEvents([
      createEvent("Scenario reset to manual baseline", "dispatch"),
      ...INITIAL_EVENTS,
    ]);
  }

  function startDemo() {
    resetVehicleCounter(9000);
    const snapshot = createDemoResetState();
    const simState = createInitialSimState(snapshot.robots, snapshot.spots, {
      demoMode: "running",
      vehicles: snapshot.vehicles,
      sessions: snapshot.sessions,
      events: snapshot.events,
      energyToday: snapshot.energyToday,
    });
    simStateRef.current = { ...simState, laneBlocked: false };
    setDemoMode("running");
    setVehicles(snapshot.vehicles);
    setRobots(cloneRobots(snapshot.robots));
    setSessions(snapshot.sessions);
    setSpots(snapshot.spots);
    setEnergyToday(snapshot.energyToday);
    setSelectedSpotId(snapshot.selectedSpotId);
    setLaneBlocked(false);
    setAutoDispatch(true);
    setLastDecision(null);
    setLastJobExplanation(null);
    setQueuedJobExplanations([]);
    setMissedCount(0);
    setEvents(snapshot.events);
  }

  function pauseDemo() {
    if (demoMode !== "running") return;
    setDemoMode("paused");
    if (simStateRef.current) simStateRef.current = { ...simStateRef.current, demoMode: "paused" };
    addEvent("Demo paused", "dispatch");
  }

  function resumeDemo() {
    if (demoMode !== "paused") return;
    setDemoMode("running");
    if (simStateRef.current) simStateRef.current = { ...simStateRef.current, demoMode: "running" };
    addEvent("Demo resumed", "dispatch");
  }

  function endDemo() {
    if (demoMode !== "running" && demoMode !== "paused") return;
    setDemoMode("ended");
    if (simStateRef.current) simStateRef.current = { ...simStateRef.current, demoMode: "ended" };
    addEvent("Demo ended — in-flight jobs will finish", "dispatch");
  }

  function resetScenario() {
    setDemoMode("idle");
    restoreIdleState();
  }

  const selectedSession = selectedVehicle
    ? getLatestSessionForVehicle(selectedVehicle.id, sessions)
    : null;
  const isSelectedJobActive = Boolean(
    selectedVehicle && (selectedVehicle.status === "assigned" || selectedVehicle.status === "charging"),
  );
  const assignedRobot = isSelectedJobActive && selectedVehicle?.assignedRobotId
    ? robots.find((r) => r.id === selectedVehicle.assignedRobotId) ?? null
    : null;
  const lastRobotId = selectedSession?.robotId ?? null;

  const selectedEtaSeconds = assignedRobot?.status === "en-route"
    ? etaSecondsForRoute(assignedRobot.position, assignedRobot.route, assignedRobot.routeIndex)
    : null;
  const routeRemainingMeters = assignedRobot && assignedRobot.route.length > 0
    ? routeDistanceMeters(assignedRobot.position, assignedRobot.route, assignedRobot.routeIndex)
    : assignedRobot?.status === "charging" ? 0 : null;
  const telemetryAgeSeconds = 0.4 + (telemetryTick % 16) * 0.05;

  const canDispatch = Boolean(
    selectedVehicle
    && (selectedVehicle.status === "waiting" || selectedVehicle.status === "backup-needed")
    && selectBestRobot(robots, selectedVehicle, spots, DOCK_BAYS, { laneBlocked }),
  );
  const primaryAction = getSelectedVehicleAction(
    selectedVehicle,
    selectedSession,
    assignedRobot,
    canDispatch,
  );
  const canFault = Boolean(
    assignedRobot && (assignedRobot.status === "en-route" || assignedRobot.status === "charging"),
  );
  const activeJobCount = vehicles.filter((v) => v.status === "assigned" || v.status === "charging").length;

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-surface">
      <Header
        autoDispatch={autoDispatch}
        demoMode={demoMode}
        laneBlocked={laneBlocked}
        canSimulateFault={canFault}
        primaryDisabled={primaryAction.disabled}
        primaryLabel={primaryAction.label}
        activeJobCount={activeJobCount}
        onRunDemo={startDemo}
        onPauseDemo={pauseDemo}
        onResumeDemo={resumeDemo}
        onEndDemo={endDemo}
        onResetScenario={resetScenario}
        onToggleDispatchMode={toggleDispatchMode}
        onPrimaryAction={handlePrimaryVehicleAction}
        onSimulateFault={() => assignedRobot && simulateFault(assignedRobot)}
        onToggleLaneBlock={toggleLaneBlock}
      />
      <main className="mx-auto grid min-h-0 w-full max-w-[1440px] flex-1 grid-cols-1 gap-2 overflow-y-auto p-3 lg:grid-cols-12 lg:overflow-hidden xl:px-6">
        <div className="grid min-h-[620px] gap-2 lg:col-span-8 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_132px]">
          <GarageMap
            spots={spots}
            vehicles={vehicles}
            robots={robots}
            metrics={operationsMetrics.commandBar}
            selectedSpotId={selectedSpotId}
            autoDispatch={autoDispatch}
            demoMode={demoMode}
            dockOccupancy={operationsMetrics.dockOccupancy}
            laneBlocked={laneBlocked}
            onSelectSpot={setSelectedSpotId}
          />
          <div className="grid min-h-0 grid-cols-12 gap-2">
            <div className="col-span-5 min-h-0"><RobotStatusStrip robots={robots} onClearFault={handleClearFault} /></div>
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
          <DispatchPanel
            decision={lastDecision}
            jobExplanation={lastJobExplanation}
            queuedJobs={queuedJobExplanations}
            autoDispatch={autoDispatch}
          />
          <EventFeed events={events} />
        </aside>
      </main>
    </div>
  );
}
