interface CarTopViewProps {
  /** Body paint color (hex). */
  paint: string;
  className?: string;
}

/**
 * Top-down passenger car rendered as inline SVG.
 * Nose points up; rotate via the parent element when needed.
 */
export function CarTopView({ paint, className }: CarTopViewProps) {
  return (
    <svg
      viewBox="0 0 64 116"
      className={className}
      style={{ filter: "drop-shadow(0 2px 3px rgba(23, 23, 23, 0.22))" }}
      aria-hidden
    >
      {/* Wheels (peeking out from under the body) */}
      <rect x="2" y="20" width="10" height="20" rx="4" fill="#2b2e33" />
      <rect x="52" y="20" width="10" height="20" rx="4" fill="#2b2e33" />
      <rect x="2" y="76" width="10" height="20" rx="4" fill="#2b2e33" />
      <rect x="52" y="76" width="10" height="20" rx="4" fill="#2b2e33" />

      {/* Body: tapered toward the nose for a real silhouette */}
      <path
        d="M32 2
           C 45 2 54 8 55 20
           L 57 46 L 57 92
           C 57 105 48 112 32 112
           C 16 112 7 105 7 92
           L 7 46 L 9 20
           C 10 8 19 2 32 2 Z"
        fill={paint}
        stroke="rgba(23, 23, 23, 0.25)"
        strokeWidth="1"
      />

      {/* Side mirrors */}
      <rect x="1" y="40" width="7" height="5" rx="2" fill={paint} stroke="rgba(23,23,23,0.25)" strokeWidth="0.75" />
      <rect x="56" y="40" width="7" height="5" rx="2" fill={paint} stroke="rgba(23,23,23,0.25)" strokeWidth="0.75" />

      {/* Windshield */}
      <path
        d="M14 34 C 20 28 44 28 50 34 L 47 46 C 38 42 26 42 17 46 Z"
        fill="#3d4650"
      />

      {/* Roof */}
      <rect x="15" y="47" width="34" height="38" rx="9" fill="rgba(23, 23, 23, 0.08)" />

      {/* Rear window */}
      <path
        d="M17 88 C 26 92 38 92 47 88 L 49 97 C 43 102 21 102 15 97 Z"
        fill="#3d4650"
      />

      {/* Hood detail line */}
      <path
        d="M18 16 C 24 12 40 12 46 16"
        fill="none"
        stroke="rgba(23, 23, 23, 0.15)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
