import type { ParkingSpot as ParkingSpotData, Vehicle } from "@/lib/types";
import { ParkingSpot } from "./ParkingSpot";

interface VehicleMarkerProps {
  spot: ParkingSpotData;
  vehicle: Vehicle | null;
  selected: boolean;
  onSelect: (spotId: string) => void;
}

export function VehicleMarker({ spot, vehicle, selected, onSelect }: VehicleMarkerProps) {
  return (
    <ParkingSpot
      spot={spot}
      vehicle={vehicle}
      isSelected={selected}
      onSelect={onSelect}
    />
  );
}
