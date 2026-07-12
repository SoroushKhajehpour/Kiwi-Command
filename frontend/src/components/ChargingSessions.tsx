import { Zap } from "lucide-react";
import type { ChargingSession } from "@/lib/types";
import { SESSION_STATUS_META } from "@/lib/statusMeta";
import { StatusPill } from "./StatusPill";

export function ChargingSessions({ sessions }: { sessions: ChargingSession[] }) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border border-border bg-white p-4">
      <div className="mb-2.5 flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-kiwi-dark" />
          <h2 className="text-sm font-bold tracking-[-0.02em]">Charging Sessions</h2>
        </div>
        <span className="rounded-full bg-surface px-2 py-1 text-[10px] font-semibold text-muted">{sessions.length} today</span>
      </div>

      <div className="min-h-0 flex-1 divide-y divide-border">
        {sessions.slice(0, 4).map((session) => {
          const meta = SESSION_STATUS_META[session.status];
          return (
            <div key={session.id} className="grid grid-cols-[1fr_72px_72px_auto] items-center gap-2 py-2 first:pt-1 last:pb-0">
              <div className="min-w-0">
                <p className="truncate font-mono text-[11px] font-bold">{session.vehicleId}</p>
                <p className="mt-0.5 text-[9px] text-muted">at <span className="font-mono">{session.spotId}</span></p>
              </div>
              <div>
                <p className="text-[9px] text-muted">Robot</p>
                <p className="mt-0.5 font-mono text-[10px] font-semibold">{session.robotId ?? "—"}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted">Delivered</p>
                <p className="mt-0.5 font-mono text-[10px] font-semibold">{session.energyKwh.toFixed(1)} kWh</p>
              </div>
              <StatusPill label={meta.label} tone={meta.tone} pulse={meta.pulse} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
