import type { ChargingSession, EventLogItem, Robot, Vehicle } from "./types";
import {
  createDemoFleetRobots,
  createEmptyGarageSpots,
} from "./mockData";

/** Overnight demo baseline: occupied garage, distinct dock slots, A5 free for scripted arrival. */
export function createDemoResetState(): {
  vehicles: Vehicle[];
  robots: Robot[];
  sessions: ChargingSession[];
  events: EventLogItem[];
  energyToday: number;
  selectedSpotId: string | null;
  spots: ReturnType<typeof createEmptyGarageSpots>;
} {
  const spots = createEmptyGarageSpots().map((spot) => {
    const occ: Record<string, string> = {
      "P2-15": "EV-4712",
      "P2-18": "EV-4821",
      "P2-20": "EV-2054",
      "P2-22": "EV-7391",
      A2: "EV-3568",
      A8: "EV-1730",
    };
    const vehicleId = occ[spot.id] ?? null;
    return {
      ...spot,
      vehicleId,
      occupiedVehicleId: vehicleId,
      reservedVehicleId: null,
    };
  });

  // Overnight cars stay parked (no seed jobs) so robots stay free for EV-4466 backup.
  const vehicles: Vehicle[] = [
    { id: "EV-4712", spotId: "P2-15", model: "Polestar 2", paint: "white", battery: 76, status: "parked", assignedRobotId: null, requestedEnergyKwh: null, priority: "Normal", position: { x: 27, y: 16 }, targetBattery: 80, route: [], routeIndex: 0, heading: 0, arrivalTick: 0, expectedDepartureTick: 14000 },
    { id: "EV-4821", spotId: "P2-18", model: "Hyundai IONIQ 5", paint: "charcoal", battery: 18, status: "parked", assignedRobotId: null, requestedEnergyKwh: 28, priority: "Urgent", position: { x: 54, y: 16 }, targetBattery: 80, route: [], routeIndex: 0, heading: 0, arrivalTick: 0, expectedDepartureTick: 12000 },
    { id: "EV-2054", spotId: "P2-20", model: "Tesla Model 3", paint: "black", battery: 64, status: "parked", assignedRobotId: null, requestedEnergyKwh: null, priority: "Normal", position: { x: 72, y: 16 }, targetBattery: 70, route: [], routeIndex: 0, heading: 0, arrivalTick: 0, expectedDepartureTick: 13000 },
    { id: "EV-7391", spotId: "P2-22", model: "Kia EV6", paint: "white", battery: 88, status: "parked", assignedRobotId: null, requestedEnergyKwh: null, priority: "Normal", position: { x: 90, y: 16 }, targetBattery: 90, route: [], routeIndex: 0, heading: 0, arrivalTick: 0, expectedDepartureTick: 15000 },
    { id: "EV-3568", spotId: "A2", model: "Ford Mustang Mach-E", paint: "silver", battery: 41, status: "parked", assignedRobotId: null, requestedEnergyKwh: 22, priority: "Normal", position: { x: 27, y: 84 }, targetBattery: 80, route: [], routeIndex: 0, heading: 180, arrivalTick: 0, expectedDepartureTick: 11000 },
    { id: "EV-1730", spotId: "A8", model: "Tesla Model Y", paint: "blue", battery: 67, status: "parked", assignedRobotId: null, requestedEnergyKwh: null, priority: "Normal", position: { x: 81, y: 84 }, targetBattery: 85, route: [], routeIndex: 0, heading: 180, arrivalTick: 0, expectedDepartureTick: 16000 },
  ];

  return {
    selectedSpotId: null,
    energyToday: 0,
    vehicles,
    spots,
    robots: createDemoFleetRobots(),
    sessions: [],
    events: [
      { id: "E-demo-ready", message: "Demo started. Garage simulation running.", timestamp: "00:00", type: "dispatch" },
    ],
  };
}

export { DEMO_TARGET_VEHICLE_ID } from "./ops/demoScenario";
