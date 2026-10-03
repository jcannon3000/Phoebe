// The preset fork on the first page of Shape your rhythm, as a card (owner, 2026-10-03:
// "what if it says choose from a curated routine, and the CTA was like browse library",
// "and that replaces the preset routine card"). The character from the app icon, cut out
// from her ground, stands at the left of a framed card; the line and a pill sit to her right.
// The pill opens the preset list - the same mode the "Choose a preset routine" row opened.
const FONT = "'Space Grotesk', system-ui, sans-serif";
const WARM = "#F0EDE6";

export function PhoebeHelpCard({ onBrowse }: { onBrowse: () => void }) {
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
        <h2 style={{ margin: 0, color: WARM, fontFamily: FONT, fontSize: 25, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.2 }}>
          Choose from a curated routine
        </h2>
        <button
          type="button"
          onClick={onBrowse}
          style={{
            marginTop: 16, background: "rgba(46,107,64,0.78)", border: "1px solid rgba(110,180,130,0.55)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)", color: WARM, borderRadius: 999,
            padding: "12px 22px", fontSize: 15, fontWeight: 700, fontFamily: FONT, cursor: "pointer",
          }}
        >
          Browse library
        </button>
      </div>
    </div>
  );
}
