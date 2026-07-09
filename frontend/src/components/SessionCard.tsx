import { Zap } from "lucide-react";
import type { ChargingSession } from "@/lib/types";
import { SESSION_STATUS_META } from "@/lib/statusMeta";
import { StatusPill } from "./StatusPill";

interface SessionCardProps {
  session: ChargingSession;
}

/** One charging session row: vehicle, spot, status and energy delivered. */
export function SessionCard({ session }: SessionCardProps) {
  const meta = SESSION_STATUS_META[session.status];

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-white px-4 py-3">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          session.status === "active" ? "bg-kiwi/15" : "bg-surface"
        }`}
      >
        <Zap
          className={`h-4 w-4 ${session.status === "active" ? "text-kiwi-dark" : "text-muted"}`}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold">{session.vehicleId}</span>
          <span className="text-xs text-muted">
            at <span className="font-mono">{session.spotId}</span>
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {session.robotId ? (
            <>
              Robot <span className="font-mono">{session.robotId}</span> ·{" "}
            </>
          ) : null}
          Started {session.startedAt} · {session.energyKwh.toFixed(1)} kWh
        </p>
      </div>

      <StatusPill label={meta.label} tone={meta.tone} pulse={meta.pulse} />
    </div>
  );
}
