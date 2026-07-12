import { Activity, BatteryCharging, Bot, Clock, Gauge, Timer } from "lucide-react";
import type { FleetMetric } from "@/lib/types";

const ICONS = {
  robots: Bot,
  active: Activity,
  waiting: Timer,
  energy: BatteryCharging,
  eta: Clock,
  utilization: Gauge,
} as const;

export function MetricsGrid({ metrics }: { metrics: FleetMetric[] }) {
  return (
    <section className="flex h-full min-h-0 flex-col rounded-[22px] border border-border bg-white p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <Activity className="h-4 w-4 text-kiwi-dark" />
        <h2 className="text-sm font-bold tracking-[-0.02em]">Key Metrics</h2>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5">
        {metrics.map((metric) => {
          const Icon = ICONS[metric.id as keyof typeof ICONS] ?? Activity;
          return (
            <div key={metric.id} className="flex min-w-0 flex-col justify-center rounded-xl border border-border bg-surface/55 px-2.5 py-1.5">
              <div className="flex items-center gap-1 text-[9px] font-medium text-muted">
                <Icon className="h-2.5 w-2.5 shrink-0 text-kiwi-dark" />
                <span className="truncate">{metric.label}</span>
              </div>
              <p className="mt-1 truncate text-[13px] font-bold tracking-[-0.03em]">{metric.value}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
