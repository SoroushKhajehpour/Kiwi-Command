"use client";

import { Battery, Bot, MapPin, Zap } from "lucide-react";
import { DEMO_CHARGING_KWH_PER_SECOND } from "@/lib/charging";
import { formatEta, formatHeading, formatKwh, formatMeters, formatPercent } from "@/lib/format";
import { ROBOT_METERS_PER_SECOND } from "@/lib/routes";
import type { SelectedVehicleAction } from "@/lib/vehicleActions";
import type { ChargingSession, Robot, Vehicle } from "@/lib/types";
import { batteryBarColor, ROBOT_STATUS_META, VEHICLE_STATUS_META } from "@/lib/statusMeta";

interface SelectedJobPanelProps {
  vehicle: Vehicle | null;
  robot: Robot | null;
  lastRobotId: string | null;
  session: ChargingSession | null;
  etaSeconds: number | null;
  routeRemainingMeters: number | null;
  telemetryAgeSeconds: number;
  action: SelectedVehicleAction;
  onPrimaryAction: () => void;
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] border-t border-border py-1.5 text-[10px]">
      <span className="text-muted">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}

export function SelectedJobPanel({
  vehicle,
  robot,
  lastRobotId,
  session,
  etaSeconds,
  routeRemainingMeters,
  telemetryAgeSeconds,
  action,
  onPrimaryAction,
}: SelectedJobPanelProps) {
  if (!vehicle) {
    return (
      <section className="flex h-full items-center justify-center border border-border bg-white px-6 text-center">
        <p className="text-xs text-muted">Select an occupied bay on the live map.</p>
      </section>
    );
  }

  const status = VEHICLE_STATUS_META[vehicle.status];
  const displayedStatus = vehicle.status === "assigned" && robot?.status === "en-route"
    ? "En route"
    : status.label;
  const waitingLike = vehicle.status === "waiting" || vehicle.status === "backup-needed";
  const isActiveJob = vehicle.status === "assigned" || vehicle.status === "charging";
  const showLiveTelemetry = Boolean(robot && isActiveJob);
  const moving = robot?.status === "en-route" || robot?.status === "returning";
  const requestedKwh = session?.requestedKwh ?? vehicle.requestedEnergyKwh;
  const deliveredLabel = session
    ? `${formatKwh(session.energyKwh)} / ${formatKwh(session.requestedKwh)}`
    : "—";

  return (
    <section className="flex h-full min-h-0 flex-col border border-border bg-white">
      <div className="flex items-start justify-between border-b border-border px-4 py-2">
        <div>
          <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-muted">Selected job</p>
          <div className="mt-1 flex items-baseline gap-2">
            <h2 className="font-mono text-lg font-bold">{vehicle.id}</h2>
            <span className="text-[10px] text-muted">{vehicle.model}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 pt-1 text-[10px] font-semibold">
          <span className={`h-1.5 w-1.5 rounded-full ${waitingLike ? "bg-warning" : "bg-kiwi-dark"}`} />
          {displayedStatus}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="px-4 py-2">
          <div className="flex items-center justify-between text-[10px]">
            <span className="flex items-center gap-1.5 text-muted"><Battery className="h-3 w-3" /> State of charge</span>
            <strong className="font-mono">{formatPercent(vehicle.battery)}</strong>
          </div>
          <div className="mt-1.5 h-1.5 bg-surface">
            <div className={`h-full ${batteryBarColor(vehicle.battery)}`} style={{ width: `${Math.min(100, Math.max(0, vehicle.battery))}%` }} />
          </div>
        </div>

        <div className="px-4">
          <DataRow label="Location" value={<span className="inline-flex items-center gap-1 font-mono"><MapPin className="h-3 w-3 text-muted" />{vehicle.spotId ?? "In transit"}</span>} />
          <DataRow
            label="Requested"
            value={
              <span className="inline-flex items-center gap-1">
                <Zap className="h-3 w-3 text-kiwi-dark" />
                {requestedKwh != null ? formatKwh(requestedKwh) : "—"}
              </span>
            }
          />
          <DataRow
            label="Assigned unit"
            value={
              isActiveJob && robot
                ? (
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Bot className="h-3 w-3 text-kiwi-dark" />
                    {robot.name}
                  </span>
                )
                : vehicle.status === "completed" && lastRobotId
                  ? `Last unit ${lastRobotId}`
                  : "—"
            }
          />
          <DataRow label="Arrival estimate" value={isActiveJob ? formatEta(etaSeconds) : "—"} />
          <DataRow label="Delivered" value={deliveredLabel} />
          {showLiveTelemetry && robot && (
            <>
              <DataRow label="Unit status" value={ROBOT_STATUS_META[robot.status].label} />
              <DataRow label="Unit battery" value={formatPercent(robot.battery)} />
              <DataRow label="Speed / heading" value={`${moving ? ROBOT_METERS_PER_SECOND.toFixed(1) : "0.0"} m/s · ${formatHeading(robot.heading)}`} />
              <DataRow label="Route left" value={`${formatMeters(routeRemainingMeters)} · ${telemetryAgeSeconds.toFixed(1)}s ago`} />
            </>
          )}
          {vehicle.status === "charging" && (
            <DataRow label="Charge rate" value={`${DEMO_CHARGING_KWH_PER_SECOND.toFixed(1)} kWh/s accelerated`} />
          )}
        </div>
      </div>

      <div className="mt-auto border-t border-border p-2">
        <button
          type="button"
          onClick={onPrimaryAction}
          disabled={action.disabled}
          className={`w-full rounded-md px-3 py-1.5 text-[10px] font-bold text-white transition-colors disabled:cursor-not-allowed disabled:bg-gray-300 ${
            action.variant === "danger"
              ? "bg-error hover:bg-red-600"
              : "bg-foreground hover:bg-black"
          }`}
        >
          {action.label}
        </button>
      </div>
    </section>
  );
}
