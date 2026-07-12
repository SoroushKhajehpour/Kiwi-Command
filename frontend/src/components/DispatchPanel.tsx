import type { DispatchDecision } from "@/lib/dispatch";

export function DispatchPanel({ decision }: { decision: DispatchDecision | null }) {
  return (
    <section className="flex h-full min-h-0 flex-col border border-border bg-white">
      <div className="flex h-9 items-center justify-between border-b border-border px-4">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.11em]">Dispatch decision</h2>
        <span className="font-mono text-[8px] text-muted">AUTO / RULESET 04</span>
      </div>
      {decision ? (
        <div className="min-h-0 flex-1 px-4 py-2.5">
          <p className="text-xs font-bold">
            <span className="font-mono text-kiwi-dark">{decision.robot.name}</span>
            {" selected for "}
            <span className="font-mono">{decision.vehicle.id}</span>
          </p>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {decision.reasons.map((reason) => (
              <div key={reason} className="flex min-w-0 items-center gap-1.5 text-[9px] text-muted">
                <span className="h-1 w-1 shrink-0 rounded-full bg-kiwi-dark" />
                <span className="truncate">{reason}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex border-t border-border pt-2 text-[9px]">
            <span className="text-muted">Arrival estimate</span>
            <strong className="ml-auto font-mono">{decision.etaMinutes} min</strong>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center px-4 text-[10px] text-muted">No idle unit available for assignment.</div>
      )}
    </section>
  );
}
