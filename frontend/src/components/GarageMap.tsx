"use client";

import { Activity } from "lucide-react";
import { COLUMN_POSITIONS, DOCK_POSITION, GARAGE_LEVEL, GARAGE_NAME } from "@/lib/mockData";
import type { FleetMetric, ParkingSpot, Robot, Vehicle } from "@/lib/types";
import { RobotMarker } from "./RobotMarker";
import { VehicleMarker } from "./VehicleMarker";

interface GarageMapProps {
  spots: ParkingSpot[];
  vehicles: Vehicle[];
  robots: Robot[];
  metrics: FleetMetric[];
  selectedSpotId: string | null;
  onSelectSpot: (spotId: string) => void;
}

function LaneArrow({ x }: { x: number }) {
  return (
    <svg
      viewBox="0 0 24 12"
      className="absolute top-[41%] w-[2.8%] -translate-x-1/2 -translate-y-1/2 opacity-45"
      style={{ left: `${x}%` }}
      aria-hidden
    >
      <path d="M0 6h16m-4-5 6 5-6 5" fill="none" stroke="#737a74" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

export function GarageMap({
  spots,
  vehicles,
  robots,
  metrics,
  selectedSpotId,
  onSelectSpot,
}: GarageMapProps) {
  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const movingRobots = robots.filter((robot) => robot.routeIndex < robot.route.length);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden border border-border bg-white">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3.5">
        <div className="flex items-center gap-2.5">
          <Activity className="h-3.5 w-3.5 text-kiwi-dark" />
          <h2 className="text-xs font-bold">{GARAGE_NAME}</h2>
          <span className="font-mono text-[9px] text-muted">{GARAGE_LEVEL}</span>
        </div>
        <div className="flex items-center gap-4 text-[9px] text-muted">
          <span>Network <strong className="font-semibold text-kiwi-dark">Healthy</strong></span>
          <span>Dock <strong className="font-semibold text-foreground">2/3</strong></span>
          <span>Mode <strong className="font-semibold text-foreground">AUTO</strong></span>
        </div>
      </div>

      <div className="grid h-12 shrink-0 grid-cols-6 border-b border-border bg-[#fbfcfa]">
        {metrics.map((metric) => (
          <div key={metric.id} className="flex min-w-0 flex-col justify-center border-r border-border px-3 last:border-r-0">
            <span className="truncate text-[8px] font-semibold uppercase tracking-[0.08em] text-muted">{metric.label}</span>
            <span className="mt-0.5 truncate font-mono text-[11px] font-bold">{metric.value}</span>
          </div>
        ))}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#e7eae5]">
        <div
          className="absolute inset-0 opacity-35"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,.58) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.58) 1px,transparent 1px)",
            backgroundSize: "42px 42px",
          }}
        />
        <div className="absolute inset-x-0 top-[31%] h-[38%] bg-[#dce0da]" />
        <div className="absolute inset-x-0 top-[31%] h-px bg-white/80" />
        <div className="absolute inset-x-0 top-[69%] h-px bg-white/80" />
        <div className="absolute inset-x-[3%] top-1/2 border-t border-dashed border-white" />

        <span className="absolute left-[11%] top-[4%] z-10 font-mono text-[8px] font-bold tracking-[0.16em] text-gray-500">P2 NORTH ROW</span>
        <span className="absolute bottom-[3%] left-[11%] z-10 font-mono text-[8px] font-bold tracking-[0.16em] text-gray-500">A ROW</span>
        <span className="absolute left-[46%] top-[53%] z-10 font-mono text-[8px] tracking-[0.12em] text-gray-500">P2 MAIN LANE</span>

        {[24, 50, 76].map((x) => <LaneArrow key={x} x={x} />)}

        {COLUMN_POSITIONS.map((column, index) => (
          <div
            key={index}
            className="absolute h-[5.5%] w-[2.6%] -translate-x-1/2 -translate-y-1/2 border border-gray-400/60 bg-[#c5cac3]"
            style={{ left: `${column.x}%`, top: `${column.y}%` }}
          >
            <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-kiwi-dark/70" />
          </div>
        ))}

        {[{ x: 13, y: 35 }, { x: 94, y: 65 }].map((sensor, index) => (
          <div
            key={index}
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 border border-gray-500 bg-gray-300"
            style={{ left: `${sensor.x}%`, top: `${sensor.y}%` }}
            title="Lidar reference beacon"
          />
        ))}

        <div
          className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center border-2 border-dashed border-kiwi-dark/50 bg-kiwi-soft/75"
          style={{ left: `${DOCK_POSITION.x}%`, top: `${DOCK_POSITION.y}%`, width: "7.5%", height: "35%" }}
        >
          <span className="font-mono text-[7px] font-bold tracking-[0.14em] text-kiwi-dark">DOCK BAY</span>
          <span className="mt-1 font-mono text-[7px] text-kiwi-dark/70">2 / 3</span>
        </div>

        <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {movingRobots.map((robot) => {
            const points = [robot.position, ...robot.route.slice(robot.routeIndex)]
              .map((point) => `${point.x},${point.y}`)
              .join(" ");
            return (
              <g key={`${robot.id}-${robot.assignedVehicleId}`}>
                <polyline points={points} fill="none" stroke="#A7D421" strokeOpacity=".18" strokeWidth="2.4" strokeLinejoin="round" />
                <polyline points={points} fill="none" stroke="#5E7F0E" strokeDasharray="1.8 1.5" strokeWidth=".55" strokeLinejoin="round" />
              </g>
            );
          })}
        </svg>

        {spots.map((spot) => (
          <VehicleMarker
            key={spot.id}
            spot={spot}
            vehicle={spot.vehicleId ? vehicleById.get(spot.vehicleId) ?? null : null}
            selected={spot.id === selectedSpotId}
            onSelect={onSelectSpot}
          />
        ))}

        {robots.map((robot) => <RobotMarker key={robot.id} robot={robot} />)}
      </div>
    </section>
  );
}
