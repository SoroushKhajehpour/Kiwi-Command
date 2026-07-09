"use client";

import { motion } from "framer-motion";
import { Bot, MousePointerClick, Play, Zap } from "lucide-react";
import type { Robot, Vehicle } from "@/lib/types";
import { batteryBarColor, VEHICLE_STATUS_META } from "@/lib/statusMeta";
import { StatusPill } from "./StatusPill";

interface SelectedAssetPanelProps {
  vehicle: Vehicle | null;
  assignedRobot: Robot | null;
  /** e.g. "~2 min" while a robot is en route. */
  eta: string | null;
  /** True when at least one robot is idle and can take the job. */
  hasIdleRobot: boolean;
  onRequestCharge: () => void;
  onAssignRobot: () => void;
  onSimulateUpdate: () => void;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-right text-sm font-medium">{children}</span>
    </div>
  );
}

function ActionButton({
  label,
  icon: Icon,
  variant,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ElementType;
  variant: "primary" | "dark" | "outline";
  disabled?: boolean;
  onClick: () => void;
}) {
  const variantClasses = {
    primary: "bg-kiwi text-foreground hover:bg-[#b4d93c]",
    dark: "bg-foreground text-white hover:bg-[#2e2e2e]",
    outline: "border border-border bg-white text-foreground hover:bg-surface",
  }[variant];

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      className={`flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors
        disabled:cursor-not-allowed disabled:opacity-40 ${variantClasses}`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </motion.button>
  );
}

/**
 * Right-side detail panel for the vehicle selected on the garage map.
 * Action availability is driven entirely by the vehicle's status.
 */
export function SelectedAssetPanel({
  vehicle,
  assignedRobot,
  eta,
  hasIdleRobot,
  onRequestCharge,
  onAssignRobot,
  onSimulateUpdate,
}: SelectedAssetPanelProps) {
  if (!vehicle) {
    return (
      <section className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-white p-8 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface">
          <MousePointerClick className="h-5 w-5 text-muted" />
        </div>
        <div>
          <p className="text-sm font-medium">No vehicle selected</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Click a parking spot on the map to view vehicle details and manage charging.
          </p>
        </div>
      </section>
    );
  }

  const statusMeta = VEHICLE_STATUS_META[vehicle.status];

  return (
    <section className="rounded-2xl border border-border bg-white p-5">
      <div className="mb-1 flex items-start justify-between">
        <div>
          <h2 className="font-mono text-base font-semibold tracking-tight">{vehicle.id}</h2>
          <p className="text-xs text-muted">{vehicle.model}</p>
        </div>
        <StatusPill label={statusMeta.label} tone={statusMeta.tone} pulse={statusMeta.pulse} />
      </div>

      {/* Battery */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted">Battery</span>
          <span className="font-mono font-semibold">{vehicle.battery}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface">
          <motion.div
            className={`h-full rounded-full ${batteryBarColor(vehicle.battery)}`}
            initial={false}
            animate={{ width: `${vehicle.battery}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
      </div>

      <div className="mt-4 divide-y divide-border border-y border-border">
        <DetailRow label="Spot">
          <span className="font-mono">{vehicle.spotId}</span>
        </DetailRow>
        <DetailRow label="Charge request">{statusMeta.label}</DetailRow>
        <DetailRow label="Assigned robot">
          {assignedRobot ? (
            <span className="inline-flex items-center gap-1.5 font-mono">
              <Bot className="h-3.5 w-3.5 text-kiwi-dark" />
              {assignedRobot.name}
            </span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </DetailRow>
        <DetailRow label="ETA">{eta ?? <span className="text-muted">—</span>}</DetailRow>
      </div>

      {/* Actions driven by vehicle status */}
      <div className="mt-4 flex flex-col gap-2">
        {vehicle.status === "parked" && (
          <ActionButton label="Request Charge" icon={Zap} variant="primary" onClick={onRequestCharge} />
        )}
        {vehicle.status === "waiting" && !assignedRobot && (
          <ActionButton
            label={hasIdleRobot ? "Assign Robot" : "No idle robots"}
            icon={Bot}
            variant="dark"
            disabled={!hasIdleRobot}
            onClick={onAssignRobot}
          />
        )}
        {assignedRobot && vehicle.status !== "completed" && (
          <ActionButton label="Simulate Update" icon={Play} variant="outline" onClick={onSimulateUpdate} />
        )}
      </div>
    </section>
  );
}
