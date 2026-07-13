import type {
  ChargingSession,
  EventLogItem,
  DockBay,
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

export const DOCK_BAYS: DockBay[] = [
  { id: "dock-A", position: { x: 7, y: 16 }, label: "A", orientation: "horizontal" },
  { id: "dock-B", position: { x: 6, y: 76 }, label: "B", orientation: "horizontal" },
  { id: "dock-C", position: { x: 96, y: 72 }, label: "C", orientation: "vertical" },
];

const topRowX = [18, 27, 36, 45, 54, 63, 72, 81, 90];
const bottomRowX = topRowX;

function makeSpot(
  id: string,
  position: GaragePosition,
  rotation: number,
  row: "top" | "bottom",
  vehicleId: string | null,
): ParkingSpot {
  return {
    id,
    label: id,
    position,
    rotation,
    row,
    servicePoint: {
      x: position.x + 3.2,
      y: rotation === 0 ? 27 : 73,
    },
    vehicleId,
    occupiedVehicleId: vehicleId,
  };
}

export const INITIAL_VEHICLES: Vehicle[] = [
  { id: "EV-4712", spotId: "P2-15", model: "Polestar 2", paint: "white", battery: 76, status: "parked", assignedRobotId: null, requestedEnergyKwh: null, priority: "Normal", position: { x: 27, y: 16 }, targetBattery: 80, route: [], routeIndex: 0, heading: 0, arrivalTick: 0, expectedDepartureTick: 120 },
  { id: "EV-4821", spotId: "P2-18", model: "Hyundai IONIQ 5", paint: "charcoal", battery: 18, status: "waiting", assignedRobotId: null, requestedEnergyKwh: 28, priority: "Urgent", position: { x: 54, y: 16 }, targetBattery: 75, route: [], routeIndex: 0, heading: 0, arrivalTick: 0, expectedDepartureTick: 80 },
  { id: "EV-2054", spotId: "P2-20", model: "Tesla Model 3", paint: "black", battery: 64, status: "charging", assignedRobotId: "R-02", requestedEnergyKwh: 24, priority: "Normal", position: { x: 72, y: 16 }, targetBattery: 85, route: [], routeIndex: 0, heading: 0, arrivalTick: 0, expectedDepartureTick: 100 },
  { id: "EV-7391", spotId: "P2-22", model: "Kia EV6", paint: "white", battery: 92, status: "completed", assignedRobotId: null, requestedEnergyKwh: 18.8, priority: "Normal", position: { x: 90, y: 16 }, targetBattery: 90, route: [], routeIndex: 0, heading: 0, arrivalTick: 0, expectedDepartureTick: 60 },
  { id: "EV-3568", spotId: "A2", model: "Ford Mustang Mach-E", paint: "silver", battery: 41, status: "parked", assignedRobotId: null, requestedEnergyKwh: null, priority: "Normal", position: { x: 27, y: 84 }, targetBattery: 80, route: [], routeIndex: 0, heading: 180, arrivalTick: 0, expectedDepartureTick: 140 },
  { id: "EV-4466", spotId: "A5", model: "Nissan Ariya", paint: "silver", battery: 29, status: "waiting", assignedRobotId: null, requestedEnergyKwh: 22, priority: "Normal", position: { x: 54, y: 84 }, targetBattery: 75, route: [], routeIndex: 0, heading: 180, arrivalTick: 0, expectedDepartureTick: 90 },
  { id: "EV-1730", spotId: "A8", model: "Tesla Model Y", paint: "blue", battery: 67, status: "parked", assignedRobotId: null, requestedEnergyKwh: null, priority: "Normal", position: { x: 81, y: 84 }, targetBattery: 85, route: [], routeIndex: 0, heading: 180, arrivalTick: 0, expectedDepartureTick: 150 },
];

export const PARKING_SPOTS: ParkingSpot[] = [
  ...topRowX.map((x, i) => {
    const label = `P2-${14 + i}`;
    const vehicleId = INITIAL_VEHICLES.find((v) => v.spotId === label)?.id ?? null;
    return makeSpot(label, { x, y: 16 }, 0, "top", vehicleId);
  }),
  ...bottomRowX.map((x, i) => {
    const label = `A${i + 1}`;
    const vehicleId = INITIAL_VEHICLES.find((v) => v.spotId === label)?.id ?? null;
    return makeSpot(label, { x, y: 84 }, 180, "bottom", vehicleId);
  }),
];

export const INITIAL_ROBOTS: Robot[] = [
  {
    id: "R-01",
    name: "R-01",
    status: "docked",
    battery: 82,
    position: DOCK_BAYS[0].position,
    targetPosition: null,
    route: [],
    routeIndex: 0,
    heading: 0,
      dockBayId: "dock-A",
    assignedVehicleId: null,
    faultType: null,
  },
  {
    id: "R-02",
    name: "R-02",
    status: "charging",
    battery: 64,
    position: { x: 75.2, y: 27 },
    targetPosition: null,
    route: [],
    routeIndex: 0,
    heading: 0,
    dockBayId: null,
    assignedVehicleId: "EV-2054",
    faultType: null,
    motionState: "charging",
  },
  {
    id: "R-03",
    name: "R-03",
    status: "returning",
    battery: 41,
    position: { x: 42, y: 52 },
    targetPosition: DOCK_BAYS[1].position,
    route: [{ x: 42, y: 50 }, { x: 8, y: 50 }, DOCK_BAYS[1].position],
    routeIndex: 0,
    heading: 270,
    dockBayId: "dock-B",
    assignedVehicleId: null,
    faultType: null,
    motionState: "moving",
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
    requestedKwh: 22,
    etaSeconds: null,
    startedAt: "15:48",
    priorityScore: 70,
    chargeRateKw: 7,
    createdTick: 0,
  },
  {
    id: "S-1044",
    vehicleId: "EV-4821",
    spotId: "P2-18",
    robotId: null,
    status: "queued",
    energyKwh: 0,
    requestedKwh: 28,
    etaSeconds: null,
    startedAt: "15:42",
    priorityScore: 120,
    chargeRateKw: 7,
    createdTick: 0,
  },
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
    priorityScore: 50,
    chargeRateKw: 7,
    createdTick: 0,
    startedTick: 5,
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
    priorityScore: 50,
    chargeRateKw: 7,
    createdTick: 0,
    completedTick: 40,
  },
];

export const ENERGY_DELIVERED_TODAY_KWH = 148.6;

export const INITIAL_EVENTS: EventLogItem[] = [
  { id: "E-102", message: "EV-4466 requested 22.0 kWh at A5", timestamp: "01:04", type: "request" },
  { id: "E-101", message: "R-03 returned to dock", timestamp: "01:02", type: "returning" },
  { id: "E-103", message: "R-02 charging EV-2054", timestamp: "00:58", type: "charging" },
];

/** Empty garage baseline for autonomous demo — 3 docked robots only. */
export function createEmptyGarageSpots(): ParkingSpot[] {
  return [
    ...topRowX.map((x, i) => makeSpot(`P2-${14 + i}`, { x, y: 16 }, 0, "top", null)),
    ...bottomRowX.map((x, i) => makeSpot(`A${i + 1}`, { x, y: 84 }, 180, "bottom", null)),
  ];
}

export function createDemoFleetRobots(): Robot[] {
  return [
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
      dockBayId: "dock-A",
      assignedVehicleId: null,
      faultType: null,
      motionState: "docked",
    },
    {
      id: "R-02",
      name: "R-02",
      status: "docked",
      battery: 78,
      position: { ...DOCK_BAYS[1].position },
      targetPosition: null,
      route: [],
      routeIndex: 0,
      heading: 0,
      dockBayId: "dock-B",
      assignedVehicleId: null,
      faultType: null,
      motionState: "docked",
    },
    {
      id: "R-03",
      name: "R-03",
      status: "docked",
      battery: 91,
      position: { ...DOCK_BAYS[2].position },
      targetPosition: null,
      route: [],
      routeIndex: 0,
      heading: 0,
      dockBayId: "dock-C",
      assignedVehicleId: null,
      faultType: null,
      motionState: "docked",
    },
  ];
}
