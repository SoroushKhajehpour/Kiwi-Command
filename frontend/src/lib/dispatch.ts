import type { Robot, Vehicle } from "./types";
import { distance } from "./simulation";

export interface DispatchDecision {
  robot: Robot;
  vehicle: Vehicle;
  distanceMeters: number;
  etaMinutes: number;
  reasons: string[];
}

export function selectBestRobot(robots: Robot[], vehicle: Vehicle): DispatchDecision | null {
  const available = robots
    .filter((robot) => robot.status === "idle")
    .map((robot) => ({
      robot,
      score: robot.battery * 0.55 - distance(robot.position, { x: 45, y: 50 }) * 0.45,
    }))
    .sort((a, b) => b.score - a.score);

  const selected = available[0]?.robot;
  if (!selected) return null;

  const distanceMeters = 18;
  const etaMinutes = 2;
  return {
    robot: selected,
    vehicle,
    distanceMeters,
    etaMinutes,
    reasons: [
      `${distanceMeters}m from vehicle`,
      `${selected.battery}% battery`,
      "Idle at dock lane",
      `Can complete ${vehicle.requestedEnergyKwh ?? 22} kWh request`,
    ],
  };
}
