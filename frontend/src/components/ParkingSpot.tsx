"use client";

import type { ParkingSpot as ParkingSpotData, Vehicle } from "@/lib/types";

interface ParkingSpotProps {
  spot: ParkingSpotData;
  vehicle: Vehicle | null;
  isSelected: boolean;
  onSelect: (spotId: string) => void;
}

/**
 * Painted parking bay only — cars are rendered separately at vehicle.position
 * so size/placement stay consistent while moving and when parked.
 */
export function ParkingSpot({ spot, vehicle, isSelected, onSelect }: ParkingSpotProps) {
  const isTopRow = spot.rotation === 0;
  const paintedEdges = isTopRow
    ? "border-l-2 border-r-2 border-t-2"
    : "border-l-2 border-r-2 border-b-2";

  return (
    <button
      type="button"
      onClick={() => onSelect(spot.id)}
      className={`group absolute -translate-x-1/2 -translate-y-1/2 rounded-sm transition-colors duration-150
        ${paintedEdges} border-white/80
        ${isSelected ? "bg-kiwi-soft/80 ring-2 ring-kiwi" : "hover:bg-white/30"}`}
      style={{
        left: `${spot.position.x}%`,
        top: `${spot.position.y}%`,
        width: "8%",
        height: "27%",
      }}
      aria-label={`Parking spot ${spot.label}${vehicle ? `, occupied by ${vehicle.id}` : ", empty"}`}
      aria-pressed={isSelected}
    >
      <span
        className={`absolute left-1/2 -translate-x-1/2 font-mono text-[9px] font-medium tracking-wide text-gray-400
          ${isTopRow ? "top-0.5" : "bottom-0.5"}`}
      >
        {spot.label}
      </span>
    </button>
  );
}
