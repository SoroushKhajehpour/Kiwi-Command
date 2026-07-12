"use client";

import type { ParkingSpot as ParkingSpotData, Vehicle } from "@/lib/types";
import { formatPercent } from "@/lib/format";
import { CarTopView } from "./CarTopView";

interface ParkingSpotProps {
  spot: ParkingSpotData;
  vehicle: Vehicle | null;
  isSelected: boolean;
  onSelect: (spotId: string) => void;
}

/** Battery chip color per vehicle status. */
function batteryChipClasses(vehicle: Vehicle): string {
  if (vehicle.status === "charging" || vehicle.battery >= 60) {
    return "border-kiwi/35 bg-white text-kiwi-dark";
  }
  if (vehicle.battery < 30) {
    return "border-amber-200 bg-white text-amber-700";
  }
  return "border-slate-200 bg-white text-slate-600";
}

/**
 * One painted parking bay on the garage floor. Positioned absolutely by
 * its percentage coordinates; the edge facing the driving lane stays open.
 */
export function ParkingSpot({ spot, vehicle, isSelected, onSelect }: ParkingSpotProps) {
  // rotation 0 = top row (lane below the spot); 180 = bottom row (lane above)
  const isTopRow = spot.rotation === 0;

  // Painted lines on every edge except the one opening onto the lane
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
      {/* Spot label, painted at the outer (wall-side) edge */}
      <span
        className={`absolute left-1/2 -translate-x-1/2 font-mono text-[9px] font-medium tracking-wide text-gray-400
          ${isTopRow ? "top-0.5" : "bottom-0.5"}`}
      >
        {spot.label}
      </span>

      {vehicle && (
        <>
          <CarTopView
            paint={vehicle.paint}
            className={`absolute left-1/2 top-1/2 h-[78%] -translate-x-1/2 -translate-y-1/2
              ${spot.rotation === 180 ? "rotate-180" : ""}`}
          />
          {/* Battery/status chip on the lane-facing end, readable from the lane */}
          <span
            className={`absolute left-1/2 z-10 -translate-x-1/2 rounded-full border px-1.5 py-px font-mono text-[9px] font-semibold leading-3
              ${batteryChipClasses(vehicle)}
              ${isTopRow ? "-bottom-2" : "-top-2"}`}
          >
            {formatPercent(vehicle.battery)}
          </span>
        </>
      )}
    </button>
  );
}
