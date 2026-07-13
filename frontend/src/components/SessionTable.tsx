import { formatEta, formatKwh } from "@/lib/format";
import { etaSecondsForRoute } from "@/lib/routes";
import type { ChargingSession, Robot } from "@/lib/types";
import { SESSION_STATUS_META } from "@/lib/statusMeta";

export function SessionTable({ sessions, robots }: { sessions: ChargingSession[]; robots: Robot[] }) {
  return (
    <section className="flex h-full min-h-0 flex-col border border-border bg-white">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-3">
        <h2 className="text-[9px] font-bold uppercase tracking-[0.1em]">Job queue</h2>
        <span className="text-[8px] text-muted">{sessions.length} sessions today</span>
      </div>
      <div className="grid grid-cols-[1fr_36px_50px_90px_45px_58px] border-b border-border bg-[#fbfcfa] px-3 py-1 text-[7px] font-bold uppercase tracking-[0.08em] text-muted">
        <span>Vehicle / bay</span><span>Pri</span><span>Unit</span><span>Delivered</span><span>ETA</span><span>State</span>
      </div>
      <div className="min-h-0 flex-1 divide-y divide-border overflow-hidden">
        {sessions.slice(0, 4).map((session) => {
          const status = SESSION_STATUS_META[session.status];
          const robot = robots.find((item) => item.id === session.robotId);
          const eta = robot?.status === "en-route"
            ? etaSecondsForRoute(robot.position, robot.route, robot.routeIndex)
            : session.etaSeconds;
          return (
            <div key={session.id} className="grid grid-cols-[1fr_36px_50px_90px_45px_58px] items-center px-3 py-1.5 text-[8px]">
              <span className="truncate font-mono font-bold">{session.vehicleId} <span className="font-sans font-normal text-muted">· {session.spotId}</span></span>
              <span className="font-mono text-muted">{session.priorityScore}</span>
              <span className="font-mono text-muted">{session.robotId ?? "—"}</span>
              <span className="font-mono">{formatKwh(session.energyKwh)} / {formatKwh(session.requestedKwh)}</span>
              <span className="font-mono text-muted">{formatEta(eta)}</span>
              <span className={session.status === "active" ? "font-semibold text-kiwi-dark" : "text-muted"}>{status.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
