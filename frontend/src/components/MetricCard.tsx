import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  /** Small line under the value, e.g. "of 3 total". */
  detail?: string;
  icon: LucideIcon;
}

/** Compact summary card used in the dashboard's status strip. */
export function MetricCard({ label, value, detail, icon: Icon }: MetricCardProps) {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-white px-4 py-3.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-kiwi/15">
        <Icon className="h-5 w-5 text-kiwi-dark" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted">{label}</p>
        <p className="text-lg font-semibold leading-6 tracking-tight">{value}</p>
        {detail && <p className="truncate text-xs text-muted">{detail}</p>}
      </div>
    </div>
  );
}
