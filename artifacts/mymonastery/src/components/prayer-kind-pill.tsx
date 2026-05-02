// Optional pill that decorates a prayer-request card / slide with the
// author's framing at submission time. Default kind ("request") renders
// nothing — the card is its own clue. The other three kinds get a small
// rounded badge styled to match the streak / letter-status pills used
// elsewhere on the dashboard.

const KIND_LABEL: Record<string, { label: string; color: string }> = {
  "life-event": { label: "Life event", color: "#8FAF96" },
  "justice": { label: "For justice", color: "#C9A24E" },
};

export function PrayerKindPill({ kind, className }: { kind: string | null | undefined; className?: string }) {
  if (!kind || kind === "request") return null;
  const meta = KIND_LABEL[kind];
  if (!meta) return null;
  // rgba string built from the hex so the badge fill is a soft tint of
  // the primary color; border is the same color at higher alpha. Hex →
  // rgb math kept inline since the palette is fixed.
  const hex = meta.color.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase shrink-0 ${className ?? ""}`}
      style={{
        color: meta.color,
        background: `rgba(${r},${g},${b},0.10)`,
        border: `1px solid rgba(${r},${g},${b},0.35)`,
        letterSpacing: "0.06em",
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      {meta.label}
    </span>
  );
}
