import type { ChargingSession, EventLogItem, Robot, Vehicle } from "./types";
import { DOCK_BAYS } from "./mockData";

/** Clean interview baseline: R-01 + R-03 docked, R-02 busy, EV-4466 parked ready. */
export function createDemoResetState(): {
  vehicles: Vehicle[];
  robots: Robot[];
  sessions: ChargingSession[];
  events: EventLogItem[];
  energyToday: number;
  selectedSpotId: string;
} {
  return {
    selectedSpotId: "A5",
    energyToday: 148.6,
    vehicles: [
      { id: "EV-4712", spotId: "P2-15", model: "Polestar 2", paint: "white", battery: 76, status: "parked", assignedRobotId: null, requestedEnergyKwh: null, priority: "Normal" },
      { id: "EV-4821", spotId: "P2-18", model: "Hyundai IONIQ 5", paint: "charcoal", battery: 18, status: "parked", assignedRobotId: null, requestedEnergyKwh: null, priority: "Normal" },
      { id: "EV-2054", spotId: "P2-20", model: "Tesla Model 3", paint: "black", battery: 64, status: "charging", assignedRobotId: "R-02", requestedEnergyKwh: 24, priority: "Normal" },
      { id: "EV-7391", spotId: "P2-22", model: "Kia EV6", paint: "white", battery: 92, status: "completed", assignedRobotId: null, requestedEnergyKwh: 18.8, priority: "Normal" },
      { id: "EV-3568", spotId: "A2", model: "Ford Mustang Mach-E", paint: "silver", battery: 41, status: "parked", assignedRobotId: null, requestedEnergyKwh: null, priority: "Normal" },
      { id: "EV-4466", spotId: "A5", model: "Nissan Ariya", paint: "silver", battery: 29, status: "parked", assignedRobotId: null, requestedEnergyKwh: 22, priority: "Normal" },
      { id: "EV-1730", spotId: "A8", model: "Tesla Model Y", paint: "blue", battery: 67, status: "parked", assignedRobotId: null, requestedEnergyKwh: null, priority: "Normal" },
    ],
    robots: [
      {
        id: "R-01",
        name: "R-01",
        status: "docked",
        battery: 82,
        position: { ...DOCK_BAYS[0].position },
        targetPosition: null,
        route: [],
        routeIndex: 0,
        heading: 0,
        dockBayId: "dock-1",
        assignedVehicleId: null,
        faultType: null,
      },
      {
        id: "R-02",
        name: "R-02",
        status: "charging",
        battery: 64,
        position: { x: 66, y: 28 },
        targetPosition: null,
        route: [],
        routeIndex: 0,
        heading: 0,
        dockBayId: null,
        assignedVehicleId: "EV-2054",
        faultType: null,
      },
      {
        id: "R-03",
        name: "R-03",
        status: "docked",
        battery: 78,
        position: { ...DOCK_BAYS[1].position },
        targetPosition: null,
        route: [],
        routeIndex: 0,
        heading: 0,
        dockBayId: "dock-2",
        assignedVehicleId: null,
        faultType: null,
      },
    ],
    sessions: [
      {
        id: "S-1043",
        vehicleId: "EV-2054",
        spotId: "P2-20",
        robotId: "R-02",
        status: "active",
        energyKwh: 12.4,
        requestedKwh: 24,
        etaSeconds: null,
        startedAt: "15:07",
      },
      {
        id: "S-1039",
        vehicleId: "EV-7391",
        spotId: "P2-22",
        robotId: "R-03",
        status: "completed",
        energyKwh: 18.8,
        requestedKwh: 18.8,
        etaSeconds: null,
        startedAt: "13:22",
      },
    ],
    events: [
      { id: "E-demo-ready", message: "Demo ready — EV-4466 staged at A5", timestamp: "00:00", type: "dispatch" },
    ],
  };
}

export const DEMO_TARGET_VEHICLE_ID = "EV-4466";
export const DEMO_CHARGE_BEFORE_FAULT_MS = 3200;
export const DEMO_POST_RESET_MS = 500;
