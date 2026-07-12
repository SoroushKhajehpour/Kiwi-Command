import type { ChargingSession, Vehicle } from "./types";

export const DEMO_CHARGING_KWH_PER_SECOND = 0.7;
const VEHICLE_BATTERY_CAPACITY_KWH = 75;

export function calculateChargingEta(session: ChargingSession): number {
  const remaining = Math.max(0, session.requestedKwh - session.energyKwh);
  return remaining / DEMO_CHARGING_KWH_PER_SECOND;
}

export function advanceCharging(
  vehicle: Vehicle,
  session: ChargingSession,
  elapsedSeconds: number,
): { vehicle: Vehicle; session: ChargingSession; deliveredKwh: number; complete: boolean } {
  const remaining = Math.max(0, session.requestedKwh - session.energyKwh);
  const deliveredKwh = Math.min(remaining, DEMO_CHARGING_KWH_PER_SECOND * elapsedSeconds);
  const energyKwh = session.energyKwh + deliveredKwh;
  const batteryGain = deliveredKwh / VEHICLE_BATTERY_CAPACITY_KWH * 100;
  const complete = energyKwh >= session.requestedKwh - 0.001;

  return {
    vehicle: {
      ...vehicle,
      battery: Math.min(100, vehicle.battery + batteryGain),
      status: complete ? "completed" : "charging",
      assignedRobotId: complete ? null : vehicle.assignedRobotId,
    },
    session: {
      ...session,
      energyKwh,
      status: complete ? "completed" : "active",
      etaSeconds: complete ? null : calculateChargingEta({ ...session, energyKwh }),
    },
    deliveredKwh,
    complete,
  };
}
