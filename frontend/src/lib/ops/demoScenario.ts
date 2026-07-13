import type { VehiclePaint } from "../types";

export interface DemoSpawnPlanEntry {
  id: string;
  model: string;
  paint: VehiclePaint;
  battery: number;
  targetBattery: number;
  spotId: string;
  spawnAtTick: number;
  departureOffset: number;
  requestedKwh: number;
  parkingCategory: "overnight" | "short_stay";
}

/** Only one scripted arrival; overnight fleet is pre-seeded. */
export const DEMO_VEHICLE_SPAWN_PLAN: DemoSpawnPlanEntry[] = [
  {
    id: "EV-4466",
    model: "Nissan Ariya",
    paint: "silver",
    battery: 29,
    targetBattery: 75,
    spotId: "A5",
    spawnAtTick: 10,
    departureOffset: 12000,
    requestedKwh: 22,
    parkingCategory: "overnight",
  },
];

export const OVERNIGHT_PROBABILITY = 0.85;
export const DEMO_TARGET_VEHICLE_ID = "EV-4466";
