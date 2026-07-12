import type {
  ChargingSession,
  EventLogItem,
  FleetMetric,
  GaragePosition,
  ParkingSpot,
  Robot,
  Vehicle,
} from "./types";

/**
 * Mock fleet/garage state used until the FastAPI backend is connected.
 * Everything the dashboard renders is derived from these constants.
 */

export const GARAGE_NAME = "Lakeshore West Garage";
export const GARAGE_LEVEL = "Level P2";

/** Where robots park and recharge between jobs. */
export const DOCK_POSITION: GaragePosition = { x: 5, y: 50 };

/** Structural concrete columns drawn on the garage floor. */
export const COLUMN_POSITIONS: GaragePosition[] = [
  { x: 31.5, y: 33 },
  { x: 58.5, y: 33 },
  { x: 85.5, y: 33 },
  { x: 31.5, y: 67 },
  { x: 58.5, y: 67 },
  { x: 85.5, y: 67 },
];

/* Neutral paint colors for CarTopView */
const PAINT = {
  white: "#f4f4f3",
  silver: "#d6d8da",
  gray: "#a5abb3",
  charcoal: "#4b5563",
  black: "#26282c",
};

export const INITIAL_VEHICLES: Vehicle[] = [
  { id: "EV-4712", spotId: "P2-15", model: "Polestar 2", paint: PAINT.silver, battery: 76, status: "parked", assignedRobotId: null, requestedEnergyKwh: null, priority: "Normal" },
  { id: "EV-4821", spotId: "P2-18", model: "Hyundai IONIQ 5", paint: PAINT.charcoal, battery: 18, status: "waiting", assignedRobotId: null, requestedEnergyKwh: 28, priority: "Urgent" },
  { id: "EV-2054", spotId: "P2-20", model: "Tesla Model 3", paint: PAINT.black, battery: 64, status: "charging", assignedRobotId: "R-02", requestedEnergyKwh: 24, priority: "Normal" },
  { id: "EV-7391", spotId: "P2-22", model: "Kia EV6", paint: PAINT.white, battery: 92, status: "completed", assignedRobotId: null, requestedEnergyKwh: 18.8, priority: "Normal" },
  { id: "EV-3568", spotId: "A2", model: "Ford Mustang Mach-E", paint: PAINT.gray, battery: 41, status: "parked", assignedRobotId: null, requestedEnergyKwh: null, priority: "Normal" },
  { id: "EV-4466", spotId: "A5", model: "Nissan Ariya", paint: PAINT.silver, battery: 29, status: "waiting", assignedRobotId: null, requestedEnergyKwh: 22, priority: "Normal" },
  { id: "EV-1730", spotId: "A8", model: "Tesla Model Y", paint: PAINT.white, battery: 67, status: "parked", assignedRobotId: null, requestedEnergyKwh: null, priority: "Normal" },
];

/**
 * Two rows of spots facing a central driving lane.
 * Top row (P2-xx) noses point up; bottom row (A-x) noses point down.
 */
const topRowX = [18, 27, 36, 45, 54, 63, 72, 81, 90];
const bottomRowX = topRowX;

export const PARKING_SPOTS: ParkingSpot[] = [
  ...topRowX.map((x, i) => {
    const label = `P2-${14 + i}`;
    return {
      id: label,
      label,
      position: { x, y: 16 },
      rotation: 0,
      vehicleId: INITIAL_VEHICLES.find((v) => v.spotId === label)?.id ?? null,
    };
  }),
  ...bottomRowX.map((x, i) => {
    const label = `A${i + 1}`;
    return {
      id: label,
      label,
      position: { x, y: 84 },
      rotation: 180,
      vehicleId: INITIAL_VEHICLES.find((v) => v.spotId === label)?.id ?? null,
    };
  }),
];

export const INITIAL_ROBOTS: Robot[] = [
  {
    id: "R-01",
    name: "R-01",
    status: "idle",
    battery: 82,
    position: DOCK_POSITION,
    targetPosition: null,
    route: [],
    routeIndex: 0,
    heading: 0,
    assignedVehicleId: null,
  },
  {
    id: "R-02",
    name: "R-02",
    status: "charging",
    battery: 64,
    position: { x: 63, y: 27 }, // lane-side of P2-20, nozzle at the car
    targetPosition: null,
    route: [],
    routeIndex: 0,
    heading: 0,
    assignedVehicleId: "EV-2054",
  },
  {
    id: "R-03",
    name: "R-03",
    status: "returning",
    battery: 41,
    position: { x: 42, y: 52 },
    targetPosition: DOCK_POSITION,
    route: [{ x: 42, y: 50 }, { x: 5, y: 50 }],
    routeIndex: 0,
    heading: 270,
    assignedVehicleId: null,
  },
];

export const INITIAL_SESSIONS: ChargingSession[] = [
  {
    id: "S-1045",
    vehicleId: "EV-4466",
    spotId: "A5",
    robotId: null,
    status: "queued",
    energyKwh: 0,
    startedAt: "15:48",
  },
  {
    id: "S-1044",
    vehicleId: "EV-4821",
    spotId: "P2-18",
    robotId: null,
    status: "queued",
    energyKwh: 0,
    startedAt: "15:42",
  },
  {
    id: "S-1043",
    vehicleId: "EV-2054",
    spotId: "P2-20",
    robotId: "R-02",
    status: "active",
    energyKwh: 12.4,
    startedAt: "15:07",
  },
  {
    id: "S-1039",
    vehicleId: "EV-7391",
    spotId: "P2-22",
    robotId: "R-03",
    status: "completed",
    energyKwh: 18.8,
    startedAt: "13:22",
  },
];

/** Running total for the "Energy delivered today" metric card. */
export const ENERGY_DELIVERED_TODAY_KWH = 148.6;

export const BASE_METRICS: FleetMetric[] = [
  { id: "robots", label: "Fleet online", value: "3/3" },
  { id: "active", label: "Jobs active", value: "1" },
  { id: "waiting", label: "Queue depth", value: "2" },
  { id: "energy", label: "Energy today", value: "148.6 kWh" },
  { id: "eta", label: "Avg ETA", value: "4.2 min" },
  { id: "utilization", label: "Robot utilization", value: "67%" },
];

export const INITIAL_EVENTS: EventLogItem[] = [
  { id: "E-102", message: "EV-4466 requested 22 kWh at A5", timestamp: "01:04", type: "request" },
  { id: "E-101", message: "R-03 returned to dock", timestamp: "01:02", type: "returning" },
  { id: "E-103", message: "R-02 charging EV-2054", timestamp: "00:58", type: "charging" },
];
