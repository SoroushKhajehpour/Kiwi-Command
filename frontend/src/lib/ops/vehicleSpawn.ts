import type { ParkingSpot, Vehicle, VehiclePaint } from "../types";
import { GARAGE_ENTRANCE } from "./constants";
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

export function resetVehicleCounter(start = 9000): void {
  vehicleCounter = start;
}

export function findAvailableSpot(spots: ParkingSpot[]): ParkingSpot | null {
  return spots.find((spot) => !spot.occupiedVehicleId) ?? null;
}

export function generateVehicleProfile(
  currentTick: number,
  options?: { deterministic?: boolean; spotId?: string },
): Omit<Vehicle, "id" | "spotId" | "position" | "route" | "routeIndex" | "heading" | "status"> {
  const battery = options?.deterministic ? 29 : randomBetween(15, 75);
  const targetBattery = options?.deterministic ? 75 : randomBetween(70, 90);
  const departureOffset = options?.deterministic ? 30 : randomBetween(18, 50);

  const priority = calculateVehiclePriority(
    {
      id: "temp",
      spotId: null,
      model: "",
      paint: "silver",
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

  return {
    model: options?.deterministic ? "Nissan Ariya" : pick(MODELS),
    paint: options?.deterministic ? "silver" : pick(PAINTS),
    battery,
    assignedRobotId: null,
    requestedEnergyKwh: null,
    priority,
    targetBattery,
    arrivalTick: currentTick,
    expectedDepartureTick: currentTick + departureOffset,
  };
}

export function spawnVehicle(
  spot: ParkingSpot,
  currentTick: number,
  options?: { deterministic?: boolean; vehicleId?: string },
): Vehicle {
  vehicleCounter += 1;
  const profile = generateVehicleProfile(currentTick, {
    deterministic: options?.deterministic,
    spotId: spot.id,
  });

  return {
    id: options?.vehicleId ?? `EV-${vehicleCounter}`,
    spotId: null,
    ...profile,
    status: "entering",
    position: { ...GARAGE_ENTRANCE },
    route: buildVehicleEntryRoute(spot),
    routeIndex: 0,
    heading: 90,
  };
}
