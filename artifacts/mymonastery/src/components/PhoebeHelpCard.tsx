// The card on the first page of Shape your rhythm. The character from the app icon, cut out
// from her ground, stands at the left of a framed card; the line and a pill sit to her right.
// It began as the preset fork (owner, 2026-10-03: "choose from a curated routine ... browse
// library"); on 2026-10-04 the preset row went back to the top of the list and this card
// became the way in to a leader: "Have a leader design a routine for you" (/with/:slug).
const FONT = "'Space Grotesk', system-ui, sans-serif";
const WARM = "#F0EDE6";

export function PhoebeHelpCard({ onAsk }: { onAsk: () => void }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "flex-end", gap: 14,
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(143,175,150,0.22)",
        borderRadius: 22, paddingLeft: 12, overflow: "hidden",
      }}
    >
      {/* She is cut at the waist in the source art, so she stands on the card's
          bottom edge rather than floating inside it. */}
      <img
        src="/brand/phoebe-character-420.png"
        alt=""
        aria-hidden
        width={118}
        style={{ width: 118, height: "auto", display: "block", flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0, padding: "20px 18px 20px 0", textAlign: "left" }}>
        <h2 style={{ margin: 0, color: WARM, fontFamily: FONT, fontSize: 22, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.2 }}>
          Have a leader design a routine for you
        </h2>
        <button
          type="button"
          onClick={onAsk}
          style={{
            marginTop: 16, background: "rgba(46,107,64,0.78)", border: "1px solid rgba(110,180,130,0.55)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)", color: WARM, borderRadius: 999,
            padding: "12px 22px", fontSize: 15, fontWeight: 700, fontFamily: FONT, cursor: "pointer",
          }}
        >
          Ask a leader
        </button>
      </div>
    </div>
  );
}
