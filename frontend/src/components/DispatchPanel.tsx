import type { DispatchDecision } from "@/lib/dispatch";
import { formatEta, formatKwh, formatMeters, formatPercent } from "@/lib/format";

export function DispatchPanel({
  decision,
  autoDispatch,
}: {
  decision: DispatchDecision | null;
  autoDispatch: boolean;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col border border-border bg-white">
      <div className="flex h-9 items-center justify-between border-b border-border px-4">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.11em]">Dispatch decision</h2>
        <span className="font-mono text-[8px] font-bold text-muted">{autoDispatch ? "AUTO" : "MANUAL"}</span>
      </div>
      {decision ? (
        <div className="min-h-0 flex-1 overflow-hidden px-4 py-2.5">
          <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-kiwi-dark">
            Why {decision.selectedRobotId}?
          </p>
          <p className="mt-0.5 text-xs font-bold">
            <span className="font-mono text-kiwi-dark">{decision.selectedRobotId}</span>
            {" → "}
            <span className="font-mono">{decision.vehicleId}</span>
          </p>
          <p className="mt-1 font-mono text-[9px] text-muted">
            {formatMeters(decision.distanceMeters)} · ETA {formatEta(decision.etaSeconds)} ·{" "}
            {formatPercent(decision.selectedBattery)} · {formatKwh(decision.requestedEnergyKwh)}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            {decision.reasons.map((reason) => (
              <div key={reason} className="flex min-w-0 items-center gap-1.5 text-[9px] text-muted">
                <span className="h-1 w-1 shrink-0 rounded-full bg-kiwi-dark" />
                <span className="truncate">{reason}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 border-t border-border pt-1.5">
            <p className="text-[8px] font-bold uppercase tracking-[0.08em] text-muted">Rejected</p>
            <div className="mt-1 flex flex-col gap-0.5">
              {decision.rejectedRobots.map((rejected) => (
                <p key={rejected.robotId} className="truncate text-[8px] text-muted">
                  <span className="font-mono font-bold text-foreground">{rejected.robotId}</span>
                  {": "}{rejected.reason}
                </p>
              ))}
              {decision.rejectedRobots.length === 0 && (
                <p className="text-[8px] text-muted">No other units rejected</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center px-4 text-[10px] text-muted">
          No dispatch decision yet.
        </div>
      )}
    </section>
  );
}
