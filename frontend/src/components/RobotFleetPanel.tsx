import type { Robot } from "@/lib/types";
import { batteryBarColor, ROBOT_STATUS_META } from "@/lib/statusMeta";
import { KiwiRobotTopView } from "./KiwiRobotTopView";
import { StatusPill } from "./StatusPill";

interface RobotFleetPanelProps {
  robots: Robot[];
}

/** Compact fleet list: each robot's status and battery at a glance. */
export function RobotFleetPanel({ robots }: RobotFleetPanelProps) {
  return (
    <section className="rounded-2xl border border-border bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">Robot Fleet</h2>
        <span className="text-xs text-muted">{robots.length} units</span>
      </div>

      <ul className="flex flex-col divide-y divide-border">
        {robots.map((robot) => {
          const meta = ROBOT_STATUS_META[robot.status];
          return (
            <li key={robot.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="flex h-10 w-8 shrink-0 items-center justify-center rounded-lg bg-surface px-1.5 py-1">
                <KiwiRobotTopView charging={robot.status === "charging"} className="h-full" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold">{robot.name}</span>
                  <StatusPill label={meta.label} tone={meta.tone} pulse={meta.pulse} />
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                    <div
                      className={`h-full rounded-full ${batteryBarColor(robot.battery)}`}
                      style={{ width: `${robot.battery}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-mono text-xs text-muted">
                    {robot.battery}%
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
