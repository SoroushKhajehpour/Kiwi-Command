import { Activity } from "lucide-react";
import { DOCK_BAYS, GARAGE_LEVEL, GARAGE_NAME } from "@/lib/mockData";
import { getVehicleConnectionPoint, LANE_BLOCK_ZONE } from "@/lib/routes";
import type { DemoMode, DockBay, FleetMetric, ParkingSpot, Robot, Vehicle } from "@/lib/types";
import { MovingVehicleMarker } from "./MovingVehicleMarker";
import { RobotMarker } from "./RobotMarker";
import { VehicleMarker } from "./VehicleMarker";

interface GarageMapProps {
  spots: ParkingSpot[];
  vehicles: Vehicle[];
  robots: Robot[];
  metrics: FleetMetric[];
  selectedSpotId: string | null;
  autoDispatch: boolean;
  demoMode: DemoMode;
  dockOccupancy: number;
  dockBays?: DockBay[];
  laneBlocked?: boolean;
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
  autoDispatch,
  demoMode,
  dockOccupancy,
  dockBays = DOCK_BAYS,
  laneBlocked = false,
  onSelectSpot,
}: GarageMapProps) {
  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const floorVehicles = vehicles.filter((v) => v.status !== "departed");
  const movingVehicles = vehicles.filter((v) => (
    v.status === "entering" || v.status === "parking" || v.status === "leaving"
  ));
  const movingRobots = robots.filter((robot) => (
    (robot.status === "en-route" || robot.status === "returning")
    && robot.route.length > 0
    && robot.routeIndex < robot.route.length
  ));
  const spotById = new Map(spots.map((spot) => [spot.id, spot]));

  const chargingConnections = robots.flatMap((robot) => {
    if (robot.status !== "charging" || !robot.assignedVehicleId) return [];
    const vehicle = vehicleById.get(robot.assignedVehicleId);
    const spot = vehicle?.spotId ? spotById.get(vehicle.spotId) : undefined;
    return spot ? [{ robot, connection: getVehicleConnectionPoint(spot) }] : [];
  });

  const metricCols = Math.min(8, Math.max(6, metrics.length));
  const docks = dockBays.length > 0 ? dockBays : DOCK_BAYS;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden border border-border bg-white">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3.5">
        <div className="flex items-center gap-2.5">
          <Activity className="h-3.5 w-3.5 text-kiwi-dark" />
          <h2 className="text-xs font-bold">{GARAGE_NAME}</h2>
          <span className="font-mono text-[9px] text-muted">{GARAGE_LEVEL}</span>
        </div>
        <div className="flex items-center gap-4 text-[9px] text-muted">
          <span>
            Network{" "}
            <strong className="font-semibold text-kiwi-dark">
              {demoMode !== "idle" ? "Demo live" : "Simulation live"}
            </strong>
          </span>
          <span>Dock <strong className="font-semibold text-foreground">{dockOccupancy}/{docks.length}</strong></span>
          <span>Mode <strong className="font-semibold text-foreground">{autoDispatch ? "AUTO" : "MANUAL"}</strong></span>
          {laneBlocked && <span className="font-semibold text-error">Lane blocked</span>}
        </div>
      </div>

      <div
        className="grid h-12 shrink-0 border-b border-border bg-[#fbfcfa]"
        style={{ gridTemplateColumns: `repeat(${metricCols}, minmax(0, 1fr))` }}
      >
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
        <span className="absolute left-[1.5%] top-[48%] z-10 font-mono text-[7px] font-bold tracking-[0.1em] text-gray-500">IN</span>
        <span className="absolute right-[1.5%] top-[48%] z-10 font-mono text-[7px] font-bold tracking-[0.1em] text-gray-500">OUT</span>

        {[24, 50, 76].map((x) => <LaneArrow key={x} x={x} />)}

        {laneBlocked && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 border border-dashed border-error/60 bg-red-500/10"
            style={{
              left: `${LANE_BLOCK_ZONE.x}%`,
              top: `${LANE_BLOCK_ZONE.y}%`,
              width: `${LANE_BLOCK_ZONE.width}%`,
              height: `${LANE_BLOCK_ZONE.height}%`,
            }}
          >
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-[7px] font-bold tracking-[0.1em] text-error/80">
              BLOCKED
            </span>
          </div>
        )}

        {docks.map((bay) => {
          const label = bay.label ?? bay.id.replace("dock-", "");
          return (
            <div
              key={bay.id}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2 border border-dashed border-kiwi-dark/45 bg-kiwi-soft/55"
              style={{
                left: `${bay.position.x}%`,
                top: `${bay.position.y}%`,
                width: bay.id === "dock-C" ? "3.2%" : "5.5%",
                height: bay.id === "dock-C" ? "6.5%" : "7%",
              }}
            >
              <span className="absolute left-1/2 top-0.5 -translate-x-1/2 whitespace-nowrap font-mono text-[6px] font-bold tracking-[0.12em] text-kiwi-dark">
                DOCK {label}
              </span>
            </div>
          );
        })}

        <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {movingRobots.map((robot) => {
            const points = [robot.position, ...robot.route.slice(robot.routeIndex)]
              .map((point) => `${point.x},${point.y}`)
              .join(" ");
            return (
              <g key={`route-${robot.id}`}>
                <polyline points={points} fill="none" stroke="#A7D421" strokeOpacity=".18" strokeWidth="2.4" strokeLinejoin="round" />
                <polyline points={points} fill="none" stroke="#5E7F0E" strokeDasharray="1.8 1.5" strokeWidth=".55" strokeLinejoin="round" />
              </g>
            );
          })}
          {movingVehicles.map((vehicle) => {
            const points = [vehicle.position, ...vehicle.route.slice(vehicle.routeIndex)]
              .map((point) => `${point.x},${point.y}`)
              .join(" ");
            return (
              <g key={`vroute-${vehicle.id}`}>
                <polyline points={points} fill="none" stroke="#94a3b8" strokeOpacity=".2" strokeWidth="1.8" strokeLinejoin="round" />
                <polyline points={points} fill="none" stroke="#64748b" strokeDasharray="1.5 1.2" strokeWidth=".4" strokeLinejoin="round" />
              </g>
            );
          })}
          {chargingConnections.map(({ robot, connection }) => (
            <line
              key={`cable-${robot.id}`}
              x1={robot.position.x}
              y1={robot.position.y}
              x2={connection.x}
              y2={connection.y}
              stroke="#A7D421"
              strokeLinecap="round"
              strokeWidth="1.1"
              opacity="0.95"
            />
          ))}
        </svg>

        {spots.map((spot) => {
          const vehicle = spot.occupiedVehicleId
            ? vehicleById.get(spot.occupiedVehicleId) ?? null
            : spot.vehicleId
              ? vehicleById.get(spot.vehicleId) ?? null
              : null;
          const selectable = vehicle && vehicle.status !== "departed" && vehicle.status !== "leaving"
            ? vehicle
            : null;
          return (
            <VehicleMarker
              key={spot.id}
              spot={spot}
              vehicle={selectable}
              selected={spot.id === selectedSpotId}
              onSelect={onSelectSpot}
            />
          );
        })}

        {floorVehicles.map((vehicle) => (
          <MovingVehicleMarker
            key={vehicle.id}
            vehicle={vehicle}
            onSelect={onSelectSpot}
          />
        ))}

        {robots.map((robot) => <RobotMarker key={robot.id} robot={robot} />)}
      </div>
    </section>
  );
}
