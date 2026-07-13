import { formatEta, formatKwh } from "./format";
import { etaSecondsForRoute } from "./routes";
import type { ChargingSession, DockBay, EventLogItem, FleetMetric, Robot, Vehicle } from "./types";

export interface DerivedOperationsMetrics {
  commandBar: FleetMetric[];
  dockOccupancy: number;
  faultsToday: number;
  utilization: number;
}

export function deriveOperationsMetrics(
  robots: Robot[],
  vehicles: Vehicle[],
  sessions: ChargingSession[],
  events: EventLogItem[],
  energyToday: number,
  dockBays: DockBay[],
  missedCount = 0,
): DerivedOperationsMetrics {
  const available = robots.filter((robot) => (
    (robot.status === "idle" || robot.status === "docked")
    && !robot.assignedVehicleId
  )).length;
  const activeJobs = vehicles.filter((vehicle) => (
    vehicle.status === "assigned" || vehicle.status === "charging"
  )).length;
  const queueDepth = sessions.filter((session) => (
    session.status === "queued" || session.status === "interrupted"
  )).length;
  const enRouteEtas = robots
    .filter((robot) => robot.status === "en-route")
    .map((robot) => etaSecondsForRoute(robot.position, robot.route, robot.routeIndex));
  const averageEta = enRouteEtas.length > 0
    ? enRouteEtas.reduce((total, value) => total + value, 0) / enRouteEtas.length
    : null;
  const faultsToday = events.filter((event) => event.type === "fault").length;
  const healthyRobots = robots.filter((robot) => robot.status !== "faulted");
  const busyRobots = healthyRobots.filter((robot) => robot.status !== "idle" && robot.status !== "docked");
  const utilization = healthyRobots.length > 0 ? busyRobots.length / healthyRobots.length * 100 : 0;
  const dockOccupancy = Math.min(dockBays.length, robots.filter((robot) => robot.dockBayId).length);
  const carsInGarage = vehicles.filter((v) => v.status !== "departed").length;

  return {
    commandBar: [
      { id: "fleet", label: "Fleet online", value: `${healthyRobots.length}/${robots.length}` },
      { id: "available", label: "Available", value: `${available}` },
      { id: "active", label: "Jobs active", value: `${activeJobs}` },
      { id: "queue", label: "Queue depth", value: `${queueDepth}` },
      { id: "energy", label: "Energy today", value: formatKwh(energyToday) },
      { id: "eta", label: "Avg ETA", value: formatEta(averageEta) },
      { id: "cars", label: "Cars in garage", value: `${carsInGarage}` },
      { id: "missed", label: "Missed", value: missedCount > 0 ? `${missedCount}` : "—" },
    ],
    dockOccupancy,
    faultsToday,
    utilization,
  };
}
