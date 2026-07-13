import type { ChargingSession, EventLogItem, Robot, Vehicle } from "./types";
import {
  createDemoFleetRobots,
  createEmptyGarageSpots,
  DOCK_BAYS,
} from "./mockData";

/** Clean autonomous demo baseline: empty garage, 3 docked robots. */
export function createDemoResetState(): {
  vehicles: Vehicle[];
  robots: Robot[];
  sessions: ChargingSession[];
  events: EventLogItem[];
  energyToday: number;
  selectedSpotId: string | null;
  spots: ReturnType<typeof createEmptyGarageSpots>;
} {
  return {
    selectedSpotId: null,
    energyToday: 0,
    vehicles: [],
    spots: createEmptyGarageSpots(),
    robots: createDemoFleetRobots(),
    sessions: [],
    events: [
      { id: "E-demo-ready", message: "Autonomous demo ready — click Run Demo to start", timestamp: "00:00", type: "dispatch" },
    ],
  };
}

export const DEMO_TARGET_VEHICLE_ID = "EV-4466";
