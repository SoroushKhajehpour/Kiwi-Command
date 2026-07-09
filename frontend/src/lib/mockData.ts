import type {
  ChargingSession,
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
  { id: "EV-4712", spotId: "P2-15", model: "Hyundai Ioniq 5", paint: PAINT.silver, battery: 76, status: "parked", assignedRobotId: null },
  { id: "EV-3390", spotId: "P2-16", model: "VW ID.4", paint: PAINT.white, battery: 58, status: "parked", assignedRobotId: null },
  { id: "EV-4821", spotId: "P2-18", model: "Tesla Model 3", paint: PAINT.charcoal, battery: 18, status: "waiting", assignedRobotId: null },
  { id: "EV-2054", spotId: "P2-20", model: "Kia EV6", paint: PAINT.black, battery: 64, status: "charging", assignedRobotId: "R-02" },
  { id: "EV-1177", spotId: "P2-22", model: "Polestar 2", paint: PAINT.white, battery: 92, status: "completed", assignedRobotId: null },
  { id: "EV-3568", spotId: "A2", model: "Ford Mustang Mach-E", paint: PAINT.gray, battery: 41, status: "parked", assignedRobotId: null },
  { id: "EV-2903", spotId: "A4", model: "BMW i4", paint: PAINT.black, battery: 83, status: "parked", assignedRobotId: null },
  { id: "EV-4466", spotId: "A5", model: "Nissan Ariya", paint: PAINT.silver, battery: 29, status: "parked", assignedRobotId: null },
  { id: "EV-1730", spotId: "A8", model: "Tesla Model Y", paint: PAINT.white, battery: 67, status: "parked", assignedRobotId: null },
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
    assignedVehicleId: null,
  },
  {
    id: "R-02",
    name: "R-02",
    status: "charging",
    battery: 64,
    position: { x: 63, y: 27 }, // lane-side of P2-20, nozzle at the car
    assignedVehicleId: "EV-2054",
  },
  {
    id: "R-03",
    name: "R-03",
    status: "returning",
    battery: 41,
    position: { x: 42, y: 52 },
    assignedVehicleId: null,
  },
];

export const INITIAL_SESSIONS: ChargingSession[] = [
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
    vehicleId: "EV-1177",
    spotId: "P2-22",
    robotId: "R-03",
    status: "completed",
    energyKwh: 31.8,
    startedAt: "13:22",
  },
];

/** Running total for the "Energy delivered today" metric card. */
export const ENERGY_DELIVERED_TODAY_KWH = 148.6;
