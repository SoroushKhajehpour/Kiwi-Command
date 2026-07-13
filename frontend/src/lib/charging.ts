import type { ChargingSession, Vehicle } from "./types";
import { roundKwh } from "./vehicleActions";

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
  const requested = session.requestedKwh;
  const remaining = Math.max(0, requested - session.energyKwh);
  const deliveredKwh = Math.min(remaining, DEMO_CHARGING_KWH_PER_SECOND * elapsedSeconds);
  const rawEnergy = session.energyKwh + deliveredKwh;
  const complete = rawEnergy >= requested - 0.0001;
  const energyKwh = complete ? roundKwh(requested) : roundKwh(Math.min(rawEnergy, requested));
  const batteryGain = deliveredKwh / VEHICLE_BATTERY_CAPACITY_KWH * 100;

  return {
    vehicle: {
      ...vehicle,
      battery: Math.min(100, vehicle.battery + batteryGain),
      // Keep assignedRobotId until completion handler clears it for history consistency.
      status: complete ? "completed" : "charging",
      assignedRobotId: complete ? null : vehicle.assignedRobotId,
    },
    session: {
      ...session,
      energyKwh,
      status: complete ? "completed" : "active",
      etaSeconds: complete ? null : calculateChargingEta({ ...session, energyKwh }),
    },
    deliveredKwh: roundKwh(deliveredKwh),
    complete,
  };
}
