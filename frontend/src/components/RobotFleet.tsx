import { Bot } from "lucide-react";
import type { Robot } from "@/lib/types";
import { batteryBarColor, ROBOT_STATUS_META } from "@/lib/statusMeta";
import { StatusPill } from "./StatusPill";

export function RobotFleet({ robots }: { robots: Robot[] }) {
  return (
    <section className="flex h-full min-h-0 flex-col rounded-[22px] border border-border bg-white p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-kiwi-dark" />
          <h2 className="text-sm font-bold tracking-[-0.02em]">Robot Fleet</h2>
        </div>
        <span className="text-[10px] font-medium text-muted">3 units</span>
      </div>
      <div className="flex flex-1 flex-col justify-between divide-y divide-border">
        {robots.map((robot) => {
          const meta = ROBOT_STATUS_META[robot.status];
          return (
            <div key={robot.id} className="py-2 first:pt-1 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-kiwi-soft">
                    <Bot className="h-3.5 w-3.5 text-kiwi-dark" />
                  </span>
                  <span className="font-mono text-[11px] font-bold">{robot.name}</span>
                </div>
                <StatusPill label={meta.label} tone={meta.tone} pulse={meta.pulse} />
              </div>
              <div className="mt-1.5 flex items-center gap-2 pl-9">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                  <div className={`h-full rounded-full ${batteryBarColor(robot.battery)}`} style={{ width: `${robot.battery}%` }} />
                </div>
                <span className="w-8 text-right font-mono text-[10px] font-semibold text-muted">{robot.battery}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
