"use client";

import { motion } from "framer-motion";
import { Car, MapPin } from "lucide-react";
import { COLUMN_POSITIONS, DOCK_POSITION, GARAGE_LEVEL, GARAGE_NAME } from "@/lib/mockData";
import { laneSideTarget } from "@/lib/simulation";
import type { ParkingSpot as ParkingSpotData, Robot, Vehicle } from "@/lib/types";
import { KiwiRobotTopView } from "./KiwiRobotTopView";
import { ParkingSpot } from "./ParkingSpot";

interface ParkingLotMapProps {
  spots: ParkingSpotData[];
  vehicles: Vehicle[];
  robots: Robot[];
  selectedSpotId: string | null;
  onSelectSpot: (spotId: string) => void;
}

function LaneArrow({ x }: { x: number }) {
  return (
    <svg
      viewBox="0 0 24 12"
      className="absolute top-[41%] w-[2.6%] -translate-x-1/2 -translate-y-1/2 opacity-50"
      style={{ left: `${x}%` }}
      aria-hidden
    >
      <path d="M0 6h16m-4-5 6 5-6 5" fill="none" stroke="#8f9690" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
    </svg>
  );
}

export function ParkingLotMap({
  spots,
  vehicles,
  robots,
  selectedSpotId,
  onSelectSpot,
}: ParkingLotMapProps) {
  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const spotById = new Map(spots.map((spot) => [spot.id, spot]));

  const routes = robots.flatMap((robot) => {
    if (!robot.assignedVehicleId || (robot.status !== "en-route" && robot.status !== "charging")) return [];
    const vehicle = vehicleById.get(robot.assignedVehicleId);
    const spot = vehicle ? spotById.get(vehicle.spotId) : undefined;
    return spot ? [{ robot, target: laneSideTarget(spot) }] : [];
  });

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border border-border bg-white p-4">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-kiwi-soft">
            <MapPin className="h-4 w-4 text-kiwi-dark" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-[-0.02em]">{GARAGE_NAME}</h2>
              <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[9px] font-semibold text-muted">
                {GARAGE_LEVEL}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-muted">Live vehicle and robot positioning</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted">
          <span className="flex items-center gap-1"><Car className="h-3 w-3" /> Vehicle</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-[3px] bg-kiwi" /> Robot</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-[3px] border border-kiwi-dark bg-kiwi-soft" /> Dock</span>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#d9ddd7] bg-[#e8ebe6]">
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,.48) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.48) 1px,transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="absolute inset-x-0 top-[31%] h-[38%] bg-[#dfe3dd]" />
        <div className="absolute inset-x-0 top-[31%] h-px bg-white/80" />
        <div className="absolute inset-x-0 top-[69%] h-px bg-white/80" />
        <div className="absolute inset-x-[3%] top-1/2 border-t-2 border-dashed border-white/70" />
        {[24, 50, 76].map((x) => <LaneArrow key={x} x={x} />)}

        {COLUMN_POSITIONS.map((column, index) => (
          <div
            key={index}
            className="absolute h-[5.5%] w-[2.6%] -translate-x-1/2 -translate-y-1/2 rounded-[3px] border border-gray-400/50 bg-[#c9cdc7]"
            style={{ left: `${column.x}%`, top: `${column.y}%` }}
          />
        ))}

        <div
          className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-kiwi-dark/40 bg-kiwi-soft/80"
          style={{ left: `${DOCK_POSITION.x}%`, top: `${DOCK_POSITION.y}%`, width: "7%", height: "34%" }}
        >
          <span className="font-mono text-[8px] font-bold tracking-[0.15em] text-kiwi-dark">DOCK</span>
          <div className="h-[16%] w-3/5 rounded-sm border border-kiwi-dark/30 bg-white/70" />
          <div className="h-[16%] w-3/5 rounded-sm border border-kiwi-dark/30 bg-white/70" />
        </div>

        <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {routes.map(({ robot, target }) => (
            <motion.path
              key={`${robot.id}-${robot.assignedVehicleId}`}
              d={`M ${robot.position.x} ${robot.position.y} L ${target.x} ${target.y}`}
              fill="none"
              stroke="#5E7F0E"
              strokeDasharray="2 2"
              strokeLinecap="round"
              strokeWidth="0.7"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.7 }}
            />
          ))}
        </svg>

        {spots.map((spot) => (
          <ParkingSpot
            key={spot.id}
            spot={spot}
            vehicle={spot.vehicleId ? vehicleById.get(spot.vehicleId) ?? null : null}
            isSelected={spot.id === selectedSpotId}
            onSelect={onSelectSpot}
          />
        ))}

        {robots.map((robot) => (
          <motion.div
            key={robot.id}
            className="absolute z-20 w-[3.5%]"
            initial={false}
            animate={{ left: `${robot.position.x}%`, top: `${robot.position.y}%` }}
            transition={{ duration: 1, ease: "easeInOut" }}
            style={{ x: "-50%", y: "-50%" }}
          >
            <KiwiRobotTopView charging={robot.status === "charging"} className="w-full" />
            <span className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap rounded-full border border-border bg-white/95 px-1.5 font-mono text-[8px] font-bold">
              {robot.name}
            </span>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
