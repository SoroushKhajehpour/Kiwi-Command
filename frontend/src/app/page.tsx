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
import { formatKwh } from "@/lib/format";
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
} from "@/lib/routes";
import type { ChargingSession, EventLogItem, Robot, Vehicle } from "@/lib/types";

const initialTarget = INITIAL_VEHICLES.find((vehicle) => vehicle.id === "EV-4466") ?? null;

function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function Home() {
  const [vehicles, setVehicles] = useState<Vehicle[]>(INITIAL_VEHICLES);
  const [robots, setRobots] = useState<Robot[]>(INITIAL_ROBOTS);
  const [sessions, setSessions] = useState<ChargingSession[]>(INITIAL_SESSIONS);
  const [events, setEvents] = useState<EventLogItem[]>(INITIAL_EVENTS);
  const [energyToday, setEnergyToday] = useState(ENERGY_DELIVERED_TODAY_KWH);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>("A5");
  const [autoDispatch, setAutoDispatch] = useState(true);
  const [lastDecision, setLastDecision] = useState<DispatchDecision | null>(
    initialTarget ? selectBestRobot(INITIAL_ROBOTS, initialTarget, PARKING_SPOTS, DOCK_BAYS) : null,
  );

  const robotsRef = useRef(robots);
  const vehiclesRef = useRef(vehicles);
  const sessionsRef = useRef(sessions);

  useEffect(() => { robotsRef.current = robots; }, [robots]);
  useEffect(() => { vehiclesRef.current = vehicles; }, [vehicles]);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  useEffect(() => {
    let previousTime = performance.now();
    let chargeElapsed = 0;

    const timer = window.setInterval(() => {
      const currentTime = performance.now();
      const elapsedSeconds = Math.min((currentTime - previousTime) / 1000, 0.1);
      previousTime = currentTime;
      chargeElapsed += elapsedSeconds;

      let robotsChanged = false;
      const serviceArrivals: Array<{ robotId: string; vehicleId: string }> = [];
      const dockArrivals: string[] = [];

      let nextRobots = robotsRef.current.map((robot) => {
        if ((robot.status !== "en-route" && robot.status !== "returning") || robot.routeIndex >= robot.route.length) return robot;
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
          serviceArrivals.some((arrival) => arrival.vehicleId === session.vehicleId) && session.status === "queued"
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
          type: "returning",
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
            const route = buildRouteToDock(robot.position, bay);
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
            message: `${job.vehicleId} charge complete; ${job.robotId} returning to dock`,
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
  const assignedRobot = robots.find((robot) => robot.id === selectedVehicle?.assignedRobotId) ?? null;

  const operationsMetrics = useMemo(
    () => deriveOperationsMetrics(robots, vehicles, sessions, events, energyToday, DOCK_BAYS),
    [energyToday, events, robots, sessions, vehicles],
  );

  function addEvent(message: string, type: EventLogItem["type"]) {
    setEvents((current) => [{ id: `E-${Date.now()}`, message, timestamp: nowLabel(), type }, ...current]);
  }

  function requestChargeFor(vehicle: Vehicle): Vehicle | null {
    const duplicate = sessionsRef.current.some((session) => (
      session.vehicleId === vehicle.id && session.status !== "completed"
    ));
    if (duplicate || (vehicle.status !== "parked" && vehicle.status !== "completed")) return null;

    const requested = { ...vehicle, status: "waiting" as const, requestedEnergyKwh: vehicle.requestedEnergyKwh ?? 22, priority: "Normal" as const };
    const nextVehicles = vehiclesRef.current.map((item) => item.id === vehicle.id ? requested : item);
    const nextSessions: ChargingSession[] = [{
      id: `S-${Date.now()}`,
      vehicleId: vehicle.id,
      spotId: vehicle.spotId,
      robotId: null,
      status: "queued",
      energyKwh: 0,
      requestedKwh: requested.requestedEnergyKwh,
      etaSeconds: null,
      startedAt: nowLabel(),
    }, ...sessionsRef.current];
    vehiclesRef.current = nextVehicles;
    sessionsRef.current = nextSessions;
    setVehicles(nextVehicles);
    setSessions(nextSessions);
    addEvent(`${vehicle.id} requested ${formatKwh(requested.requestedEnergyKwh)} at ${vehicle.spotId}`, "request");
    return requested;
  }

  function dispatchVehicle(vehicle: Vehicle, reassignment = false): DispatchDecision | null {
    if (vehicle.status !== "waiting") return null;
    const decision = selectBestRobot(robotsRef.current, vehicle, PARKING_SPOTS, DOCK_BAYS);
    if (!decision) {
      addEvent(`No eligible robot available for ${vehicle.id}; job remains queued`, "dispatch");
      setLastDecision(null);
      return null;
    }

    const nextRobots = robotsRef.current.map((robot) => (
      robot.id === decision.selectedRobotId
        ? {
            ...robot,
            status: "en-route" as const,
            assignedVehicleId: vehicle.id,
            dockBayId: null,
            route: decision.route,
            routeIndex: 0,
            targetPosition: decision.route[decision.route.length - 1] ?? null,
          }
        : robot
    ));
    const nextVehicles = vehiclesRef.current.map((item) => (
      item.id === vehicle.id ? { ...item, assignedRobotId: decision.selectedRobotId, status: "assigned" as const } : item
    ));
    const nextSessions = sessionsRef.current.map((session) => (
      session.vehicleId === vehicle.id && session.status === "queued"
        ? { ...session, robotId: decision.selectedRobotId, etaSeconds: decision.etaSeconds }
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
        ? `${vehicle.id} reassigned to backup ${decision.selectedRobotId}`
        : `${decision.selectedRobotId} dispatched to ${vehicle.id}`,
      reassignment ? "reassignment" : "dispatch",
    );
    return decision;
  }

  function handleHeaderRequestCharge() {
    if (!selectedVehicle) return;
    if (selectedVehicle.status === "parked" || selectedVehicle.status === "completed") {
      const request = requestChargeFor(selectedVehicle);
      if (request && autoDispatch) dispatchVehicle(request);
      return;
    }
    if (selectedVehicle.status === "waiting") dispatchVehicle(selectedVehicle);
  }

  function simulateFault(robot: Robot) {
    if (robot.status === "faulted") return;
    const vehicleId = robot.assignedVehicleId;
    const nextRobots = robotsRef.current.map((item) => (
      item.id === robot.id
        ? {
            ...item,
            status: "faulted" as const,
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
        ? { ...vehicle, status: "waiting" as const, assignedRobotId: null }
        : vehicle
    ));
    const nextSessions = sessionsRef.current.map((session) => (
      session.vehicleId === vehicleId && session.status !== "completed"
        ? { ...session, status: "queued" as const, robotId: null, etaSeconds: null }
        : session
    ));

    robotsRef.current = nextRobots;
    vehiclesRef.current = nextVehicles;
    sessionsRef.current = nextSessions;
    setRobots(nextRobots);
    setVehicles(nextVehicles);
    setSessions(nextSessions);

    if (!vehicleId) {
      addEvent(`${robot.id} faulted; unit removed from service`, "fault");
      return;
    }

    const waitingVehicle = nextVehicles.find((vehicle) => vehicle.id === vehicleId);
    addEvent(`${robot.id} faulted while serving ${vehicleId}; job returned to queue`, "fault");
    if (autoDispatch && waitingVehicle) dispatchVehicle(waitingVehicle, true);
  }

  function clearFault(robotId: string) {
    const robot = robotsRef.current.find((item) => item.id === robotId);
    if (!robot || robot.status !== "faulted") return;
    const bay = getAvailableDockBay(robotsRef.current, DOCK_BAYS, robotId);
    const nextRobots = robotsRef.current.map((item) => {
      if (item.id !== robotId) return item;
      if (!bay) return { ...item, status: "idle" as const };
      const route = buildRouteToDock(item.position, bay);
      return {
        ...item,
        status: "returning" as const,
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
      const waiting = vehiclesRef.current.find((vehicle) => vehicle.status === "waiting");
      if (waiting) dispatchVehicle(waiting);
    }
  }

  const selectedSession = sessions.find((session) => (
    session.vehicleId === selectedVehicle?.id && session.status !== "completed"
  )) ?? sessions.find((session) => session.vehicleId === selectedVehicle?.id) ?? null;
  const selectedEtaSeconds = assignedRobot?.status === "en-route"
    ? etaSecondsForRoute(assignedRobot.position, assignedRobot.route, assignedRobot.routeIndex)
    : null;
  const canRequest = Boolean(
    selectedVehicle
    && (selectedVehicle.status === "parked" || (selectedVehicle.status === "completed" && selectedVehicle.battery < 95)),
  );
  const canDispatch = Boolean(
    selectedVehicle?.status === "waiting"
    && selectBestRobot(robots, selectedVehicle, PARKING_SPOTS, DOCK_BAYS),
  );
  const headerLabel = !selectedVehicle
    ? "Select Vehicle"
    : selectedVehicle.status === "waiting"
      ? "Dispatch Robot"
      : canRequest
        ? "Request Charge"
        : "Job In Progress";

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-surface">
      <Header
        onRequestCharge={handleHeaderRequestCharge}
        requestLabel={headerLabel}
        requestDisabled={!selectedVehicle || (!canRequest && selectedVehicle.status !== "waiting")}
        autoDispatch={autoDispatch}
        onToggleDispatchMode={toggleDispatchMode}
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
            session={selectedSession}
            etaSeconds={selectedEtaSeconds}
            canDispatch={canDispatch}
            onRequestCharge={handleHeaderRequestCharge}
            onDispatch={() => selectedVehicle && dispatchVehicle(selectedVehicle)}
            onSimulateFault={() => assignedRobot && simulateFault(assignedRobot)}
          />
          <DispatchPanel decision={lastDecision} autoDispatch={autoDispatch} />
          <EventFeed events={events} />
        </aside>
      </main>
    </div>
  );
}
