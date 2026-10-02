import { useLocation } from "wouter";

// "Would you like Phoebe's help?" — the character from the app icon, cut out
// from her ground, over a line in Space Grotesk and a pill into the routine
// interview. Sits at the foot of the first page of Shape your rhythm (owner,
// 2026-10-02). The interview's endpoints are admin-gated, so the caller shows
// this to admins only.
const FONT = "'Space Grotesk', system-ui, sans-serif";
const WARM = "#F0EDE6";

export function PhoebeHelpCard() {
  const [, setLocation] = useLocation();
  return (
    <div style={{ marginTop: 34, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      <img
        src="/brand/phoebe-character-420.png"
        alt=""
        aria-hidden
        width={168}
        style={{ width: 168, height: "auto", display: "block", marginBottom: -2 }}
      />
      <h2 style={{ margin: "14px 0 0", color: WARM, fontFamily: FONT, fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.25 }}>
        Would you like Phoebe's help?
      </h2>
      <button
        type="button"
        onClick={() => setLocation("/routine-interview")}
        style={{
          marginTop: 16, background: "rgba(46,107,64,0.72)", border: "1px solid rgba(110,180,130,0.55)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)", color: WARM, borderRadius: 999,
          padding: "14px 28px", fontSize: 15.5, fontWeight: 700, fontFamily: FONT, cursor: "pointer",
        }}
      >
        Shape it with me
      </button>
    </div>
  );
}
