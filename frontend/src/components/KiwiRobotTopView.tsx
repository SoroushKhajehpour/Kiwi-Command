interface KiwiRobotTopViewProps {
  /** Renders a soft lime glow around the nozzle while delivering power. */
  charging?: boolean;
  className?: string;
}

/**
 * Top-down Kiwi Charge mobile charging robot rendered as inline SVG.
 * White cart body, dark panel section, four small wheels and a charging
 * arm extending from the nose. Nose points up; rotate via the parent.
 */
export function KiwiRobotTopView({ charging = false, className }: KiwiRobotTopViewProps) {
  return (
    <svg
      viewBox="0 0 48 78"
      className={className}
      style={{ filter: "drop-shadow(0 1.5px 2.5px rgba(23, 23, 23, 0.25))" }}
      aria-hidden
    >
      {/* Charging glow while active */}
      {charging && (
        <circle cx="24" cy="6" r="9" fill="#a8cf2d" opacity="0.45">
          <animate attributeName="opacity" values="0.45;0.15;0.45" dur="2s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Charging arm + nozzle */}
      <rect x="21" y="2" width="6" height="12" rx="2" fill="#3a3f45" />
      <rect x="18.5" y="0" width="11" height="5" rx="2.5" fill="#5d7f19" />

      {/* Wheels */}
      <rect x="1" y="20" width="7" height="13" rx="3" fill="#2b2e33" />
      <rect x="40" y="20" width="7" height="13" rx="3" fill="#2b2e33" />
      <rect x="1" y="52" width="7" height="13" rx="3" fill="#2b2e33" />
      <rect x="40" y="52" width="7" height="13" rx="3" fill="#2b2e33" />

      {/* Cart body */}
      <rect
        x="5"
        y="12"
        width="38"
        height="62"
        rx="9"
        fill="#fbfbfa"
        stroke="#c9cdd2"
        strokeWidth="1"
      />

      {/* Lime accent stripe at the arm base */}
      <rect x="10" y="17" width="28" height="4" rx="2" fill="#a8cf2d" />

      {/* Dark battery-pack panel (rear two-thirds of the cart) */}
      <rect x="9" y="26" width="30" height="43" rx="6" fill="#23262b" />
      {/* Panel vent lines */}
      <line x1="14" y1="36" x2="34" y2="36" stroke="#3a3f45" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="44" x2="34" y2="44" stroke="#3a3f45" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="52" x2="34" y2="52" stroke="#3a3f45" strokeWidth="2" strokeLinecap="round" />

      {/* Status LED */}
      <circle cx="24" cy="63" r="2.5" fill={charging ? "#a8cf2d" : "#6b7280"} />
    </svg>
  );
}
