"use client";

import { Battery, Bot, MapPin, Zap } from "lucide-react";
import type { Robot, Vehicle } from "@/lib/types";
import { batteryBarColor, VEHICLE_STATUS_META } from "@/lib/statusMeta";

interface SelectedJobPanelProps {
  vehicle: Vehicle | null;
  robot: Robot | null;
  eta: string | null;
  canDispatch: boolean;
  onRequestCharge: () => void;
  onDispatch: () => void;
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
  eta,
  canDispatch,
  onRequestCharge,
  onDispatch,
}: SelectedJobPanelProps) {
  if (!vehicle) {
    return (
      <section className="flex h-full items-center justify-center border border-border bg-white px-6 text-center">
        <p className="text-xs text-muted">Select an occupied bay on the live map.</p>
      </section>
    );
  }

  const status = VEHICLE_STATUS_META[vehicle.status];
  const primaryLabel = vehicle.status === "parked"
    ? "Request Charge"
    : vehicle.status === "waiting"
      ? "Dispatch Robot"
      : vehicle.status === "charging"
        ? "Pause Session"
        : vehicle.status === "assigned"
          ? "Send Backup Robot"
          : "Session Complete";

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
          <span className={`h-1.5 w-1.5 rounded-full ${vehicle.status === "waiting" ? "bg-warning" : "bg-kiwi-dark"}`} />
          {status.label}
        </div>
      </div>

      <div className="px-4 py-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="flex items-center gap-1.5 text-muted"><Battery className="h-3 w-3" /> State of charge</span>
          <strong className="font-mono">{vehicle.battery.toFixed(0)}%</strong>
        </div>
        <div className="mt-1.5 h-1.5 bg-surface">
          <div className={`h-full ${batteryBarColor(vehicle.battery)}`} style={{ width: `${vehicle.battery}%` }} />
        </div>
      </div>

      <div className="px-4">
        <DataRow label="Location" value={<span className="inline-flex items-center gap-1 font-mono"><MapPin className="h-3 w-3 text-muted" />{vehicle.spotId}</span>} />
        <DataRow label="Requested" value={<span className="inline-flex items-center gap-1"><Zap className="h-3 w-3 text-kiwi-dark" />{vehicle.requestedEnergyKwh ?? "—"} kWh</span>} />
        <DataRow label="Priority" value={vehicle.priority} />
        <DataRow label="Assigned unit" value={robot ? <span className="inline-flex items-center gap-1 font-mono"><Bot className="h-3 w-3 text-kiwi-dark" />{robot.name}</span> : "—"} />
        <DataRow label="Arrival estimate" value={eta ?? "—"} />
      </div>

      <div className="mt-auto border-t border-border p-2">
        <button
          type="button"
          onClick={vehicle.status === "parked" ? onRequestCharge : onDispatch}
          disabled={(vehicle.status === "waiting" && !canDispatch) || vehicle.status === "assigned" || vehicle.status === "charging" || vehicle.status === "completed"}
          className="w-full rounded-md bg-foreground px-3 py-1.5 text-[10px] font-bold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {primaryLabel}
        </button>
      </div>
    </section>
  );
}
