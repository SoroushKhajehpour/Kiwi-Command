"use client";

import { useMemo, useState } from "react";
import { ChargingSessions } from "@/components/ChargingSessions";
import { DispatchIntelligence } from "@/components/DispatchIntelligence";
import { Header } from "@/components/Header";
import { MetricsGrid } from "@/components/MetricsGrid";
import { ParkingLotMap } from "@/components/ParkingLotMap";
import { RobotFleet } from "@/components/RobotFleet";
import { SelectedRequestPanel } from "@/components/SelectedRequestPanel";
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
import { etaLabel, hasArrived, laneSideTarget, stepToward } from "@/lib/simulation";
import type { ChargingSession, EventLogItem, FleetMetric, Robot, Vehicle } from "@/lib/types";

const CHARGE_TARGET = 90;
const CHARGE_TICK_PERCENT = 18;
const CHARGE_TICK_KWH = 6.2;

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

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.spotId === selectedSpotId) ?? null,
    [vehicles, selectedSpotId],
  );
  const assignedRobot = useMemo(
    () => robots.find((robot) => robot.id === selectedVehicle?.assignedRobotId) ?? null,
    [robots, selectedVehicle],
  );
  const idleRobot = robots.find((robot) => robot.status === "idle") ?? null;

  const eta = useMemo(() => {
    if (!selectedVehicle || !assignedRobot) return null;
    const spot = PARKING_SPOTS.find((item) => item.id === selectedVehicle.spotId);
    return spot ? etaLabel(assignedRobot.position, laneSideTarget(spot)) : null;
  }, [selectedVehicle, assignedRobot]);

  const metrics = useMemo<FleetMetric[]>(() => BASE_METRICS.map((metric) => {
    if (metric.id === "robots") return { ...metric, value: `${robots.length}/3` };
    if (metric.id === "active") return { ...metric, value: `${sessions.filter((session) => session.status === "active").length}` };
    if (metric.id === "waiting") return { ...metric, value: `${vehicles.filter((vehicle) => vehicle.status === "waiting").length}` };
    if (metric.id === "energy") return { ...metric, value: `${energyToday.toFixed(1)} kWh` };
    return metric;
  }), [energyToday, robots.length, sessions, vehicles]);

  function addEvent(message: string, type: EventLogItem["type"]) {
    setEvents((current) => [
      { id: `E-${Date.now()}`, message, timestamp: nowLabel(), type },
      ...current,
    ]);
  }

  function requestChargeFor(vehicleId: string) {
    const vehicle = vehicles.find((item) => item.id === vehicleId);
    if (!vehicle || vehicle.status !== "parked") return;

    const requestedEnergyKwh = vehicle.requestedEnergyKwh ?? 22;
    setVehicles((current) => current.map((item) => (
      item.id === vehicleId
        ? { ...item, status: "waiting", requestedEnergyKwh, priority: "Normal" }
        : item
    )));
    setSessions((current) => [{
      id: `S-${Date.now()}`,
      vehicleId,
      spotId: vehicle.spotId,
      robotId: null,
      status: "queued",
      energyKwh: 0,
      startedAt: nowLabel(),
    }, ...current]);
    addEvent(`${vehicle.id} requested ${requestedEnergyKwh} kWh at ${vehicle.spotId}`, "request");
  }

  function handleHeaderRequestCharge() {
    if (selectedVehicle?.status === "parked") {
      requestChargeFor(selectedVehicle.id);
      return;
    }
    const waiting = vehicles.find((vehicle) => vehicle.id === "EV-4466" && vehicle.status === "waiting")
      ?? vehicles.find((vehicle) => vehicle.status === "waiting");
    if (waiting) {
      setSelectedSpotId(waiting.spotId);
      return;
    }
    const parked = [...vehicles]
      .filter((vehicle) => vehicle.status === "parked")
      .sort((a, b) => a.battery - b.battery)[0];
    if (parked) {
      setSelectedSpotId(parked.spotId);
      requestChargeFor(parked.id);
    }
  }

  function handleDispatchRobot() {
    if (!selectedVehicle || selectedVehicle.status !== "waiting" || !idleRobot) return;
    const vehicleId = selectedVehicle.id;
    const robotId = idleRobot.id;

    setRobots((current) => current.map((robot) => (
      robot.id === robotId
        ? { ...robot, status: "en-route", assignedVehicleId: vehicleId }
        : robot
    )));
    setVehicles((current) => current.map((vehicle) => (
      vehicle.id === vehicleId
        ? { ...vehicle, assignedRobotId: robotId, status: "assigned" }
        : vehicle
    )));
    setSessions((current) => current.map((session) => (
      session.vehicleId === vehicleId && session.status === "queued"
        ? { ...session, robotId }
        : session
    )));
    addEvent(`${robotId} dispatched to ${vehicleId}`, "dispatch");
  }

  function handleSimulateUpdate() {
    if (!selectedVehicle?.assignedRobotId) return;
    const robot = robots.find((item) => item.id === selectedVehicle.assignedRobotId);
    const spot = PARKING_SPOTS.find((item) => item.id === selectedVehicle.spotId);
    if (!robot || !spot) return;

    if (robot.status === "en-route") {
      const target = laneSideTarget(spot);
      const next = stepToward(robot.position, target);
      const arrived = hasArrived(next, target);
      setRobots((current) => current.map((item) => (
        item.id === robot.id ? { ...item, position: next, status: arrived ? "charging" : "en-route" } : item
      )));
      if (arrived) {
        setVehicles((current) => current.map((vehicle) => (
          vehicle.id === selectedVehicle.id ? { ...vehicle, status: "charging" } : vehicle
        )));
        setSessions((current) => current.map((session) => (
          session.vehicleId === selectedVehicle.id && session.status === "queued"
            ? { ...session, status: "active", startedAt: nowLabel() }
            : session
        )));
        addEvent(`${robot.id} started charging ${selectedVehicle.id}`, "charging");
      }
    } else if (robot.status === "charging") {
      const battery = Math.min(100, selectedVehicle.battery + CHARGE_TICK_PERCENT);
      const complete = battery >= CHARGE_TARGET;
      setVehicles((current) => current.map((vehicle) => (
        vehicle.id === selectedVehicle.id
          ? { ...vehicle, battery, status: complete ? "completed" : "charging", assignedRobotId: complete ? null : vehicle.assignedRobotId }
          : vehicle
      )));
      setSessions((current) => current.map((session) => (
        session.vehicleId === selectedVehicle.id && session.status === "active"
          ? { ...session, energyKwh: session.energyKwh + CHARGE_TICK_KWH, status: complete ? "completed" : "active" }
          : session
      )));
      setEnergyToday((current) => current + CHARGE_TICK_KWH);
      if (complete) {
        setRobots((current) => current.map((item) => (
          item.id === robot.id ? { ...item, status: "returning", assignedVehicleId: null } : item
        )));
        addEvent(`${selectedVehicle.id} charge completed`, "charging");
      }
    }

    setRobots((current) => current.map((item) => {
      if (item.status !== "returning") return item;
      const next = stepToward(item.position, DOCK_POSITION);
      return hasArrived(next, DOCK_POSITION)
        ? { ...item, position: next, status: "idle" }
        : { ...item, position: next };
    }));
  }

  const intelligenceTarget = vehicles.find((vehicle) => vehicle.id === "EV-4466") ?? selectedVehicle;
  const intelligenceRobot = assignedRobot ?? idleRobot;

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-surface">
      <Header onRequestCharge={handleHeaderRequestCharge} />
      <main className="mx-auto grid min-h-0 w-full max-w-[1440px] flex-1 grid-cols-1 gap-3.5 overflow-y-auto p-4 lg:grid-cols-12 lg:grid-rows-[minmax(0,1.65fr)_minmax(250px,.95fr)] lg:overflow-hidden xl:px-7">
        <div className="min-h-[420px] lg:col-span-8 lg:min-h-0">
          <ParkingLotMap
            spots={PARKING_SPOTS}
            vehicles={vehicles}
            robots={robots}
            selectedSpotId={selectedSpotId}
            onSelectSpot={setSelectedSpotId}
          />
        </div>
        <div className="min-h-[420px] lg:col-span-4 lg:min-h-0">
          <SelectedRequestPanel
            vehicle={selectedVehicle}
            assignedRobot={assignedRobot}
            eta={eta}
            hasIdleRobot={Boolean(idleRobot)}
            onRequestCharge={() => selectedVehicle && requestChargeFor(selectedVehicle.id)}
            onDispatchRobot={handleDispatchRobot}
            onSimulateUpdate={handleSimulateUpdate}
          />
        </div>
        <div className="min-h-[240px] lg:col-span-3 lg:min-h-0"><RobotFleet robots={robots} /></div>
        <div className="min-h-[240px] lg:col-span-4 lg:min-h-0"><ChargingSessions sessions={sessions} /></div>
        <div className="min-h-[240px] lg:col-span-2 lg:min-h-0"><MetricsGrid metrics={metrics} /></div>
        <div className="min-h-[240px] lg:col-span-3 lg:min-h-0">
          <DispatchIntelligence
            candidateRobot={intelligenceRobot}
            targetVehicle={intelligenceTarget}
            events={events}
            eta={assignedRobot && eta ? eta : "3 min"}
          />
        </div>
      </main>
    </div>
  );
}
