export type PillTone = "kiwi" | "neutral" | "amber" | "red";

interface StatusPillProps {
  label: string;
  tone?: PillTone;
  /** Gently pulses the dot — used for in-progress states like charging. */
  pulse?: boolean;
}

const TONE_STYLES: Record<PillTone, { pill: string; dot: string }> = {
  kiwi: { pill: "bg-kiwi/15 text-kiwi-dark", dot: "bg-kiwi-dark" },
  neutral: { pill: "bg-gray-100 text-muted", dot: "bg-gray-400" },
  amber: { pill: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  red: { pill: "bg-red-50 text-red-700", dot: "bg-red-500" },
};

/** Small rounded status chip with a colored dot, e.g. "System Online". */
export function StatusPill({ label, tone = "neutral", pulse = false }: StatusPillProps) {
  const styles = TONE_STYLES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles.pill}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${styles.dot} ${pulse ? "animate-pulse" : ""}`}
      />
      {label}
    </span>
  );
}
