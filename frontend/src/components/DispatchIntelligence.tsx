import { Activity, Bot, Clock, MapPin, Radio } from "lucide-react";
import type { EventLogItem, Robot, Vehicle } from "@/lib/types";

interface DispatchIntelligenceProps {
  candidateRobot: Robot | null;
  targetVehicle: Vehicle | null;
  events: EventLogItem[];
  eta: string;
}

export function DispatchIntelligence({
  candidateRobot,
  targetVehicle,
  events,
  eta,
}: DispatchIntelligenceProps) {
  const assignment = candidateRobot && targetVehicle
    ? `${candidateRobot.name} → ${targetVehicle.id}`
    : "Fleet balanced";

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border border-border bg-white p-4"
      aria-live="polite"
    >
      <div className="mb-2.5 flex items-center gap-2">
        <Radio className="h-4 w-4 text-kiwi-dark" />
        <h2 className="text-sm font-bold tracking-[-0.02em]">Dispatch Intelligence</h2>
      </div>

      <div className="rounded-xl border border-kiwi/25 bg-kiwi-soft/70 px-3 py-2.5">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-kiwi-dark">Next best assignment</p>
        <p className="mt-1 font-mono text-xs font-bold">{assignment}</p>
        {candidateRobot && targetVehicle && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-muted">
            <span className="flex items-center gap-1"><MapPin className="h-2.5 w-2.5" /> 18m away</span>
            <span className="flex items-center gap-1"><Bot className="h-2.5 w-2.5" /> {candidateRobot.battery}% battery</span>
            <span className="flex items-center gap-1"><Activity className="h-2.5 w-2.5" /> Currently idle</span>
            <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {eta}</span>
          </div>
        )}
      </div>

      <div className="mt-2.5 min-h-0 flex-1">
        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-muted">Recent events</p>
        <div className="divide-y divide-border">
          {events.slice(0, 3).map((event) => (
            <div key={event.id} className="flex items-start gap-2 py-1.5 first:pt-0">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-kiwi-dark" />
              <p className="min-w-0 flex-1 truncate text-[10px] font-medium">{event.message}</p>
              <time className="font-mono text-[9px] text-muted">{event.timestamp}</time>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
