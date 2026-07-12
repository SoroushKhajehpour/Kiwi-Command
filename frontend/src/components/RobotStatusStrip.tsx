import type { Robot } from "@/lib/types";
import { formatPercent } from "@/lib/format";
import { ROBOT_STATUS_META, batteryBarColor } from "@/lib/statusMeta";

export function RobotStatusStrip({
  robots,
  onClearFault,
}: {
  robots: Robot[];
  onClearFault: (robotId: string) => void;
}) {
  const faultCount = robots.filter((robot) => robot.status === "faulted").length;
  return (
    <section className="flex h-full min-h-0 flex-col border border-border bg-white">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-3">
        <h2 className="text-[9px] font-bold uppercase tracking-[0.1em]">Fleet units</h2>
        <span className="text-[8px] text-muted">{robots.length - faultCount} online · {faultCount} faults</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-3">
        {robots.map((robot) => {
          const meta = ROBOT_STATUS_META[robot.status];
          return (
            <div key={robot.id} className="flex min-w-0 flex-col justify-center border-r border-border px-3 last:border-r-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-bold">{robot.name}</span>
                <span className="truncate text-[8px] font-medium text-muted">{meta.label}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 bg-surface">
                  <div className={`h-full ${batteryBarColor(robot.battery)}`} style={{ width: `${robot.battery}%` }} />
                </div>
                <span className="font-mono text-[8px] text-muted">{formatPercent(robot.battery)}</span>
              </div>
              <span className="mt-1 truncate text-[8px] text-muted">
                {robot.assignedVehicleId
                  ? `Job ${robot.assignedVehicleId}`
                  : robot.status === "docked"
                    ? `Recharging · ${robot.dockBayId}`
                    : robot.status === "faulted"
                      ? "Service required"
                      : robot.status === "idle"
                        ? "Staged"
                        : "Returning to dock"}
              </span>
              {robot.status === "faulted" && (
                <button
                  type="button"
                  onClick={() => onClearFault(robot.id)}
                  className="mt-1 self-start text-[8px] font-bold text-error hover:underline"
                >
                  Clear fault
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
