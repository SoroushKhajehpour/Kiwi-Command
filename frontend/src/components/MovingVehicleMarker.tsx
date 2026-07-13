"use client";

import { formatPercent } from "@/lib/format";
import type { Vehicle } from "@/lib/types";
import { CarTopView } from "./CarTopView";

const MOVING_STATUSES = new Set(["entering", "parking", "leaving"]);

/**
 * Single floor marker for all cars — same size whether moving or parked.
 * Avoids the pop when switching between transit and bay-embedded cars.
 */
export function MovingVehicleMarker({
  vehicle,
  onSelect,
}: {
  vehicle: Vehicle;
  onSelect?: (spotId: string) => void;
}) {
  const moving = MOVING_STATUSES.has(vehicle.status);
  const selectable = Boolean(vehicle.spotId && onSelect && vehicle.status !== "departed");

  return (
    <div
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
      onClick={() => {
        if (selectable && vehicle.spotId) onSelect?.(vehicle.spotId);
      }}
      onKeyDown={(event) => {
        if (!selectable || !vehicle.spotId) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.(vehicle.spotId);
        }
      }}
      className={`absolute z-25 w-[5.2%] -translate-x-1/2 -translate-y-1/2 will-change-[left,top] ${
        selectable ? "cursor-pointer" : "pointer-events-none"
      }`}
      style={{
        left: `${vehicle.position.x}%`,
        top: `${vehicle.position.y}%`,
        transition: moving ? "left 160ms linear, top 160ms linear" : "none",
      }}
    >
      <div
        className="origin-center will-change-transform"
        style={{
          transform: `rotate(${vehicle.heading}deg)`,
          transition: moving ? "transform 180ms ease-out" : "none",
        }}
      >
        <CarTopView paint={vehicle.paint} className="h-auto w-full" />
      </div>
      <span className="pointer-events-none absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-white/95 px-1 py-px font-mono text-[7px] font-bold leading-3 text-foreground shadow-sm">
        {vehicle.id}
      </span>
      <span className="pointer-events-none absolute left-1/2 bottom-full mb-0.5 -translate-x-1/2 whitespace-nowrap rounded-full border border-slate-200 bg-white px-1 py-px font-mono text-[7px] font-semibold leading-3 text-slate-600 shadow-sm">
        {formatPercent(vehicle.battery)}
      </span>
    </div>
  );
}
