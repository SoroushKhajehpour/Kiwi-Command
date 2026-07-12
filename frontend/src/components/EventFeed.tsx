import type { EventLogItem } from "@/lib/types";

export function EventFeed({ events }: { events: EventLogItem[] }) {
  return (
    <section className="flex h-full min-h-0 flex-col border border-border bg-white" aria-live="polite">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.11em]">Recent activity</h2>
        <span className="text-[8px] text-muted">Garage local time</span>
      </div>
      <div className="min-h-0 flex-1 divide-y divide-border overflow-hidden px-4">
        {events.slice(0, 5).map((event) => (
          <div key={event.id} className="grid grid-cols-[36px_1fr] items-center py-2 text-[9px]">
            <time className="font-mono text-muted">{event.timestamp}</time>
            <p className="truncate font-medium">{event.message}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
