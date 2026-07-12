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
import {
  BASE_METRICS,
  DOCK_POSITION,
  ENERGY_DELIVERED_TODAY_KWH,
  INITIAL_EVENTS,
  INITIAL_ROBOTS,
  INITIAL_SESSIONS,
  INITIAL_VEHICLES,
  PARKING_SPOTS,
} from "@/lib/mockData";
import { advanceRobot, buildDockRoute, buildServiceRoute } from "@/lib/movement";
import type { ChargingSession, EventLogItem, FleetMetric, Robot, Vehicle } from "@/lib/types";

const CHARGE_TARGET = 90;
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
  const [lastDecision, setLastDecision] = useState<DispatchDecision | null>(
    initialTarget ? selectBestRobot(INITIAL_ROBOTS, initialTarget) : null,
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
        return { ...advanced.robot, status: "idle" as const, route: [], routeIndex: 0, assignedVehicleId: null };
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
            ? { ...session, status: "active" as const, startedAt: nowLabel() }
            : session
        ));
        serviceArrivals.forEach((arrival, index) => newEvents.push({
          id: `E-arrive-${Date.now()}-${index}`,
          message: `${arrival.robotId} connected to ${arrival.vehicleId}`,
          timestamp: nowLabel(),
          type: "charging",
        }));
      }

      if (dockArrivals.length > 0) {
        dockArrivals.forEach((robotId, index) => newEvents.push({
          id: `E-dock-${Date.now()}-${index}`,
          message: `${robotId} returned to dock`,
          timestamp: nowLabel(),
          type: "returning",
        }));
      }

      if (chargeElapsed >= 0.5) {
        const chargingRobots = nextRobots.filter((robot) => robot.status === "charging" && robot.assignedVehicleId);
        const completed: Array<{ robotId: string; vehicleId: string }> = [];
        const gain = 0.35 * (chargeElapsed / 0.5);
        const energyGain = 0.08 * (chargeElapsed / 0.5);
        chargeElapsed = 0;

        if (chargingRobots.length > 0) {
          nextVehicles = nextVehicles.map((vehicle) => {
            const robot = chargingRobots.find((item) => item.assignedVehicleId === vehicle.id);
            if (!robot) return vehicle;
            const battery = Math.min(100, vehicle.battery + gain);
            const complete = battery >= CHARGE_TARGET;
            if (complete) completed.push({ robotId: robot.id, vehicleId: vehicle.id });
            return {
              ...vehicle,
              battery,
              status: complete ? "completed" as const : "charging" as const,
              assignedRobotId: complete ? null : vehicle.assignedRobotId,
            };
          });
          nextSessions = nextSessions.map((session) => {
            const isCharging = chargingRobots.some((robot) => robot.assignedVehicleId === session.vehicleId);
            if (!isCharging || session.status !== "active") return session;
            const complete = completed.some((item) => item.vehicleId === session.vehicleId);
            return { ...session, energyKwh: session.energyKwh + energyGain, status: complete ? "completed" as const : "active" as const };
          });
          setEnergyToday((current) => current + energyGain * chargingRobots.length);
        }

        if (completed.length > 0) {
          nextRobots = nextRobots.map((robot) => {
            const job = completed.find((item) => item.robotId === robot.id);
            if (!job) return robot;
            const route = buildDockRoute(robot.position, DOCK_POSITION);
            return {
              ...robot,
              status: "returning" as const,
              assignedVehicleId: null,
              route,
              routeIndex: 0,
              targetPosition: DOCK_POSITION,
            };
          });
          robotsChanged = true;
          completed.forEach((job, index) => newEvents.push({
            id: `E-complete-${Date.now()}-${index}`,
            message: `${job.vehicleId} charge complete; ${job.robotId} returning`,
            timestamp: nowLabel(),
            type: "charging",
          }));
        }
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

  const metrics = useMemo<FleetMetric[]>(() => BASE_METRICS.map((metric) => {
    if (metric.id === "robots") return { ...metric, value: `${robots.length}/3` };
    if (metric.id === "active") return { ...metric, value: `${robots.filter((robot) => robot.status === "charging" || robot.status === "en-route").length}` };
    if (metric.id === "waiting") return { ...metric, value: `${vehicles.filter((vehicle) => vehicle.status === "waiting").length}` };
    if (metric.id === "energy") return { ...metric, value: `${energyToday.toFixed(1)} kWh` };
    return metric;
  }), [energyToday, robots, vehicles]);

  function addEvent(message: string, type: EventLogItem["type"]) {
    setEvents((current) => [{ id: `E-${Date.now()}`, message, timestamp: nowLabel(), type }, ...current]);
  }

  function requestChargeFor(vehicle: Vehicle): Vehicle {
    const requested = { ...vehicle, status: "waiting" as const, requestedEnergyKwh: vehicle.requestedEnergyKwh ?? 22, priority: "Normal" as const };
    const nextVehicles = vehiclesRef.current.map((item) => item.id === vehicle.id ? requested : item);
    const nextSessions: ChargingSession[] = [{
      id: `S-${Date.now()}`,
      vehicleId: vehicle.id,
      spotId: vehicle.spotId,
      robotId: null,
      status: "queued",
      energyKwh: 0,
      startedAt: nowLabel(),
    }, ...sessionsRef.current];
    vehiclesRef.current = nextVehicles;
    sessionsRef.current = nextSessions;
    setVehicles(nextVehicles);
    setSessions(nextSessions);
    addEvent(`${vehicle.id} requested ${requested.requestedEnergyKwh} kWh at ${vehicle.spotId}`, "request");
    return requested;
  }

  function dispatchVehicle(vehicle: Vehicle) {
    if (vehicle.status !== "waiting") return;
    const decision = selectBestRobot(robotsRef.current, vehicle);
    const spot = PARKING_SPOTS.find((item) => item.id === vehicle.spotId);
    if (!decision || !spot) return;

    const route = buildServiceRoute(decision.robot.position, spot);
    const nextRobots = robotsRef.current.map((robot) => (
      robot.id === decision.robot.id
        ? {
            ...robot,
            status: "en-route" as const,
            assignedVehicleId: vehicle.id,
            route,
            routeIndex: 0,
            targetPosition: route[route.length - 1] ?? null,
          }
        : robot
    ));
    const nextVehicles = vehiclesRef.current.map((item) => (
      item.id === vehicle.id ? { ...item, assignedRobotId: decision.robot.id, status: "assigned" as const } : item
    ));
    const nextSessions = sessionsRef.current.map((session) => (
      session.vehicleId === vehicle.id && session.status === "queued"
        ? { ...session, robotId: decision.robot.id }
        : session
    ));

    robotsRef.current = nextRobots;
    vehiclesRef.current = nextVehicles;
    sessionsRef.current = nextSessions;
    setRobots(nextRobots);
    setVehicles(nextVehicles);
    setSessions(nextSessions);
    setLastDecision(decision);
    addEvent(`${decision.robot.id} dispatched to ${vehicle.id}`, "dispatch");
  }

  function handleHeaderRequestCharge() {
    const target = vehiclesRef.current.find((vehicle) => vehicle.id === "EV-4466")
      ?? vehiclesRef.current.find((vehicle) => vehicle.status === "waiting");
    if (!target) return;
    setSelectedSpotId(target.spotId);
    if (target.status === "waiting") dispatchVehicle(target);
  }

  const eta = assignedRobot?.status === "en-route" ? "2 min" : assignedRobot?.status === "charging" ? "Arrived" : null;

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-surface">
      <Header onRequestCharge={handleHeaderRequestCharge} />
      <main className="mx-auto grid min-h-0 w-full max-w-[1440px] flex-1 grid-cols-1 gap-2 overflow-y-auto p-3 lg:grid-cols-12 lg:overflow-hidden xl:px-6">
        <div className="grid min-h-[620px] gap-2 lg:col-span-8 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_132px]">
          <GarageMap
            spots={PARKING_SPOTS}
            vehicles={vehicles}
            robots={robots}
            metrics={metrics}
            selectedSpotId={selectedSpotId}
            onSelectSpot={setSelectedSpotId}
          />
          <div className="grid min-h-0 grid-cols-12 gap-2">
            <div className="col-span-5 min-h-0"><RobotStatusStrip robots={robots} /></div>
            <div className="col-span-7 min-h-0"><SessionTable sessions={sessions} /></div>
          </div>
        </div>

        <aside className="grid min-h-[620px] gap-2 lg:col-span-4 lg:min-h-0 lg:grid-rows-[276px_150px_minmax(0,1fr)]">
          <SelectedJobPanel
            vehicle={selectedVehicle}
            robot={assignedRobot}
            eta={eta}
            canDispatch={Boolean(selectBestRobot(robots, selectedVehicle ?? INITIAL_VEHICLES[0]))}
            onRequestCharge={() => selectedVehicle && requestChargeFor(selectedVehicle)}
            onDispatch={() => selectedVehicle && dispatchVehicle(selectedVehicle)}
          />
          <DispatchPanel decision={lastDecision} />
          <EventFeed events={events} />
        </aside>
      </main>
    </div>
  );
}
