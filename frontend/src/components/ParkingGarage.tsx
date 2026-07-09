"use client";

import { motion } from "framer-motion";
import type { ParkingSpot as ParkingSpotData, Robot, Vehicle } from "@/lib/types";
import { COLUMN_POSITIONS, DOCK_POSITION, GARAGE_LEVEL, GARAGE_NAME } from "@/lib/mockData";
import { KiwiRobotTopView } from "./KiwiRobotTopView";
import { ParkingSpot } from "./ParkingSpot";

interface ParkingGarageProps {
  spots: ParkingSpotData[];
  vehicles: Vehicle[];
  robots: Robot[];
  selectedSpotId: string | null;
  onSelectSpot: (spotId: string) => void;
}

/** Small painted direction arrow on the lane floor. */
function LaneArrow({ x, y }: { x: number; y: number }) {
  return (
    <svg
      viewBox="0 0 24 12"
      className="absolute w-[2.5%] -translate-x-1/2 -translate-y-1/2 opacity-60"
      style={{ left: `${x}%`, top: `${y}%` }}
      aria-hidden
    >
      <path d="M0 6 H16 M12 1 L18 6 L12 11" fill="none" stroke="#9aa0a6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Top-down map of the garage level: parking bays, lane markings, columns,
 * the robot dock and the live robot positions. Robot movement animates
 * smoothly whenever a robot's position changes.
 */
export function ParkingGarage({
  spots,
  vehicles,
  robots,
  selectedSpotId,
  onSelectSpot,
}: ParkingGarageProps) {
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const spotById = new Map(spots.map((s) => [s.id, s]));

  /** Point the nozzle at the car being served; otherwise nose up. */
  function robotRotation(robot: Robot): number {
    if (!robot.assignedVehicleId) return 0;
    const vehicle = vehicleById.get(robot.assignedVehicleId);
    const spot = vehicle ? spotById.get(vehicle.spotId) : undefined;
    if (!spot) return 0;
    return spot.position.y > robot.position.y ? 180 : 0;
  }

  return (
    <section className="flex flex-col rounded-2xl border border-border bg-white p-4">
      {/* Canvas header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold tracking-tight">{GARAGE_NAME}</h2>
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted">
            {GARAGE_LEVEL}
          </span>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[3px] bg-gray-500" /> Vehicle
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[3px] bg-kiwi" /> Robot
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[3px] border border-kiwi-dark/50 bg-kiwi/20" /> Dock
          </span>
        </div>
      </div>

      {/* Garage floor */}
      <div className="relative aspect-[16/8.5] w-full overflow-hidden rounded-xl border border-border bg-[#e7e9e6]">
        {/* Subtle concrete texture via faint grid */}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Central driving lane */}
        <div className="absolute inset-x-0 top-[31%] h-[38%] bg-[#dfe2de]" />
        {/* Lane edge lines */}
        <div className="absolute inset-x-0 top-[31%] h-px bg-white/70" />
        <div className="absolute inset-x-0 top-[69%] h-px bg-white/70" />
        {/* Dashed center line */}
        <div className="absolute inset-x-[3%] top-1/2 border-t-2 border-dashed border-white/70" />

        <LaneArrow x={24} y={40.5} />
        <LaneArrow x={50} y={40.5} />
        <LaneArrow x={76} y={40.5} />

        {/* Concrete columns */}
        {COLUMN_POSITIONS.map((col, i) => (
          <div
            key={i}
            className="absolute h-[5.5%] w-[2.6%] -translate-x-1/2 -translate-y-1/2 rounded-[3px] border border-gray-400/60 bg-[#c8ccc7]"
            style={{ left: `${col.x}%`, top: `${col.y}%` }}
          />
        ))}

        {/* Robot dock */}
        <div
          className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-kiwi-dark/40 bg-kiwi/10 px-1 py-2"
          style={{ left: `${DOCK_POSITION.x}%`, top: `${DOCK_POSITION.y}%`, width: "7%", height: "34%" }}
        >
          <span className="font-mono text-[9px] font-semibold tracking-widest text-kiwi-dark">
            DOCK
          </span>
          {/* Charging pads */}
          <div className="h-[18%] w-3/5 rounded-sm border border-kiwi-dark/30 bg-white/60" />
          <div className="h-[18%] w-3/5 rounded-sm border border-kiwi-dark/30 bg-white/60" />
        </div>

        {/* Parking bays + cars */}
        {spots.map((spot) => (
          <ParkingSpot
            key={spot.id}
            spot={spot}
            vehicle={spot.vehicleId ? vehicleById.get(spot.vehicleId) ?? null : null}
            isSelected={spot.id === selectedSpotId}
            onSelect={onSelectSpot}
          />
        ))}

        {/* Robots (animate between positions) */}
        {robots.map((robot) => (
          <motion.div
            key={robot.id}
            className="absolute z-20 w-[3.4%]"
            initial={false}
            animate={{ left: `${robot.position.x}%`, top: `${robot.position.y}%` }}
            transition={{ type: "tween", duration: 1.1, ease: "easeInOut" }}
            style={{ x: "-50%", y: "-50%" }}
          >
            <KiwiRobotTopView
              charging={robot.status === "charging"}
              className={`w-full ${robotRotation(robot) === 180 ? "rotate-180" : ""}`}
            />
            <span className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 rounded-full border border-border bg-white/95 px-1.5 font-mono text-[9px] font-semibold text-foreground">
              {robot.name}
            </span>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
