import type { ParkingSpot, Vehicle, VehiclePaint } from "../types";
import { GARAGE_ENTRANCE } from "./constants";
import type { DemoSpawnPlanEntry } from "./demoScenario";
import { buildVehicleEntryRoute } from "./routes";
import { calculateVehiclePriority } from "./dispatch";

const MODELS = [
  "Tesla Model 3",
  "Tesla Model Y",
  "Hyundai IONIQ 5",
  "Kia EV6",
  "Ford Mustang Mach-E",
  "Nissan Ariya",
  "Polestar 2",
  "BMW i4",
];

const PAINTS: VehiclePaint[] = ["white", "black", "charcoal", "silver", "blue", "green"];

let vehicleCounter = 9000;

function randomBetween(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function headingToFirst(from: { x: number; y: number }, route: { x: number; y: number }[]): number {
  if (!route.length) return 90;
  const to = route[0];
  const degrees = (Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}

export function resetVehicleCounter(start = 9000): void {
  vehicleCounter = start;
}

export function findAvailableSpot(spots: ParkingSpot[], vehicles: Vehicle[] = []): ParkingSpot | null {
  const claimed = new Set(
    vehicles
      .filter((v) => v.status !== "departed" && v.spotId)
      .map((v) => v.spotId as string),
  );
  return spots.find((spot) => (
    !spot.occupiedVehicleId
    && !spot.reservedVehicleId
    && !claimed.has(spot.id)
  )) ?? null;
}

export function getAvailablePlannedOrFallbackSpot(
  plannedSpotId: string,
  spots: ParkingSpot[],
  vehicles: Vehicle[],
): ParkingSpot | null {
  const planned = findSpotById(spots, plannedSpotId);
  if (planned && !planned.occupiedVehicleId && !planned.reservedVehicleId) {
    const claimed = vehicles.some((v) => v.status !== "departed" && v.spotId === planned.id);
    if (!claimed) return planned;
  }
  return findAvailableSpot(spots, vehicles);
}

export function findSpotById(spots: ParkingSpot[], spotId: string): ParkingSpot | null {
  return spots.find((spot) => spot.id === spotId) ?? null;
}

export function countActiveVehicles(vehicles: Vehicle[]): number {
  return vehicles.filter((v) => v.status !== "departed").length;
}

export function reserveSpot(spot: ParkingSpot, vehicleId: string): ParkingSpot | null {
  if (spot.occupiedVehicleId && spot.occupiedVehicleId !== vehicleId) {
    return null;
  }
  return { ...spot, reservedVehicleId: vehicleId };
}

export function spawnVehicle(
  spot: ParkingSpot,
  currentTick: number,
  options?: { plan?: DemoSpawnPlanEntry; vehicleId?: string },
): Vehicle {
  vehicleCounter += 1;
  const plan = options?.plan;
  const overnight = Math.random() < 0.85;
  const battery = plan?.battery ?? randomBetween(15, 75);
  const targetBattery = plan?.targetBattery ?? randomBetween(70, 90);
  const departureOffset = plan?.departureOffset
    ?? (overnight ? randomBetween(8000, 16000) : randomBetween(2500, 5000));
  const model = plan?.model ?? pick(MODELS);
  const paint = plan?.paint ?? pick(PAINTS);
  const requestedEnergyKwh = plan && plan.requestedKwh > 0 ? plan.requestedKwh : null;

  const priority = calculateVehiclePriority(
    {
      id: "temp",
      spotId: spot.id,
      model,
      paint,
      battery,
      status: "parked",
      assignedRobotId: null,
      requestedEnergyKwh: null,
      priority: "Normal",
      position: GARAGE_ENTRANCE,
      targetBattery,
      route: [],
      routeIndex: 0,
      heading: 90,
      arrivalTick: currentTick,
      expectedDepartureTick: currentTick + departureOffset,
    },
    currentTick,
  );

  const route = buildVehicleEntryRoute(spot);
  const position = { ...GARAGE_ENTRANCE };

  return {
    id: options?.vehicleId ?? plan?.id ?? `EV-${vehicleCounter}`,
    spotId: spot.id,
    model,
    paint,
    battery,
    assignedRobotId: null,
    requestedEnergyKwh,
    priority,
    targetBattery,
    arrivalTick: currentTick,
    expectedDepartureTick: currentTick + departureOffset,
    status: "entering",
    position,
    route,
    routeIndex: 0,
    heading: headingToFirst(position, route),
  };
}
