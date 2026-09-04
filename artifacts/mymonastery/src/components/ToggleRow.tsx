/**
 * A labelled switch row — the one Admin Tools has always drawn ("Pilot view
 * on", "Step debug in the customizer"), lifted out so Manage subscriptions
 * and Admin Tools are one control rather than two copies of it.
 */
export function ToggleRow({
  label,
  description,
  enabled,
  onToggle,
  emoji,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  emoji?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      role="switch"
      aria-checked={enabled}
      className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-colors text-left"
      style={{ background: "rgba(200,212,192,0.05)", border: "1px solid rgba(46,107,64,0.18)" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        {emoji && <span aria-hidden style={{ fontSize: 22, lineHeight: 1, flexShrink: 0, width: 26, textAlign: "center" }}>{emoji}</span>}
        <div style={{ minWidth: 0 }}>
          <p className="text-sm font-medium" style={{ color: "#E8E4D8" }}>{label}</p>
          <p className="text-[11px] mt-0.5" style={{ color: "rgba(143,175,150,0.6)" }}>{description}</p>
        </div>
      </div>
      <div
        className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ml-4 ${enabled ? "bg-[#2D5E3F]" : "bg-[#1A4A2E]"}`}
      >
        <div
          className={`absolute top-[3px] w-[14px] h-[14px] rounded-full shadow-sm transition-transform ${enabled ? "left-[18px]" : "left-[3px]"}`}
          style={{ background: "#F0EDE6" }}
        />
      </div>
    </button>
  );
}
