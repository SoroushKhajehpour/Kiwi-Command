"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Battery, Bot, Clock, MapPin, Play, Zap } from "lucide-react";
import type { Robot, Vehicle } from "@/lib/types";
import { batteryBarColor, VEHICLE_STATUS_META } from "@/lib/statusMeta";
import { StatusPill } from "./StatusPill";

interface SelectedRequestPanelProps {
  vehicle: Vehicle | null;
  assignedRobot: Robot | null;
  eta: string | null;
  hasIdleRobot: boolean;
  onRequestCharge: () => void;
  onDispatchRobot: () => void;
  onSimulateUpdate: () => void;
}

function Detail({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 text-xs font-semibold">{value}</div>
    </div>
  );
}

export function SelectedRequestPanel({
  vehicle,
  assignedRobot,
  eta,
  hasIdleRobot,
  onRequestCharge,
  onDispatchRobot,
  onSimulateUpdate,
}: SelectedRequestPanelProps) {
  if (!vehicle) {
    return (
      <section className="flex h-full min-h-0 flex-col justify-center rounded-[22px] border border-border bg-white p-6">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-kiwi-soft">
          <MapPin className="h-5 w-5 text-kiwi-dark" />
        </div>
        <h2 className="mt-3 text-center text-sm font-bold">Select a vehicle</h2>
        <p className="mx-auto mt-1 max-w-[250px] text-center text-xs leading-5 text-muted">
          Choose an occupied parking spot to review its charge request and dispatch status.
        </p>
      </section>
    );
  }

  const status = VEHICLE_STATUS_META[vehicle.status];
  const canDispatch = vehicle.status === "waiting" && !assignedRobot && hasIdleRobot;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border border-border bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Selected Request</p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <h2 className="font-mono text-xl font-bold tracking-[-0.04em]">{vehicle.id}</h2>
            <span className="text-xs text-muted">{vehicle.model}</span>
          </div>
        </div>
        <StatusPill label={status.label} tone={status.tone} pulse={status.pulse} />
      </div>

      <div className="mt-4 rounded-2xl bg-kiwi-soft/70 p-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Battery className="h-3.5 w-3.5" /> Vehicle battery
          </span>
          <span className="font-mono text-sm font-bold">{vehicle.battery}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
          <motion.div
            className={`h-full rounded-full ${batteryBarColor(vehicle.battery)}`}
            initial={false}
            animate={{ width: `${vehicle.battery}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Detail icon={MapPin} label="Parking spot" value={<span className="font-mono">{vehicle.spotId}</span>} />
        <Detail icon={Zap} label="Requested energy" value={vehicle.requestedEnergyKwh ? `${vehicle.requestedEnergyKwh} kWh` : "—"} />
        <Detail
          icon={vehicle.priority === "Urgent" ? AlertTriangle : Clock}
          label="Priority"
          value={<span className={vehicle.priority === "Urgent" ? "text-warning" : ""}>{vehicle.priority}</span>}
        />
        <Detail
          icon={Bot}
          label="Assigned robot"
          value={assignedRobot ? <span className="font-mono text-kiwi-dark">{assignedRobot.name}</span> : "—"}
        />
        <Detail icon={Clock} label="Estimated arrival" value={eta ?? "—"} />
        <Detail icon={Zap} label="Delivery state" value={status.label} />
      </div>

      <div className="mt-auto pt-3">
        {vehicle.status === "parked" && (
          <button type="button" onClick={onRequestCharge} className="w-full rounded-full bg-kiwi px-4 py-2.5 text-sm font-bold hover:bg-[#b2dc31]">
            Request Charge
          </button>
        )}
        {vehicle.status === "waiting" && !assignedRobot && (
          <motion.button
            type="button"
            onClick={onDispatchRobot}
            disabled={!canDispatch}
            whileTap={canDispatch ? { scale: 0.98 } : undefined}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Bot className="h-4 w-4" />
            {hasIdleRobot ? "Dispatch Robot" : "No robots available"}
          </motion.button>
        )}
        {assignedRobot && vehicle.status !== "completed" && (
          <button type="button" onClick={onSimulateUpdate} className="flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-bold hover:bg-surface">
            <Play className="h-4 w-4" /> Simulate Update
          </button>
        )}
        <p className="mt-2 text-center text-[10px] leading-4 text-muted">
          System assigns the best available robot based on distance, battery, and availability.
        </p>
      </div>
    </section>
  );
}
