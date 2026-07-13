import type { ParkingSpot, Vehicle } from "./types";

/** Resolve the vehicle for the currently selected parking bay. */
export function getVehicleBySelectedSpot(
  selectedSpotId: string | null,
  vehicles: Vehicle[],
  spots: ParkingSpot[] = [],
): Vehicle | null {
  if (!selectedSpotId) return null;

  const bySpotId = vehicles.find((vehicle) => (
    vehicle.spotId === selectedSpotId
    && vehicle.status !== "departed"
  ));
  if (bySpotId) return bySpotId;

  const spot = spots.find((item) => item.id === selectedSpotId);
  const occupiedId = spot?.occupiedVehicleId ?? spot?.vehicleId ?? null;
  if (!occupiedId) return null;

  return vehicles.find((vehicle) => (
    vehicle.id === occupiedId && vehicle.status !== "departed"
  )) ?? null;
}
