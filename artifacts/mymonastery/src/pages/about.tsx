// ── About ───────────────────────────────────────────────────────────────────
//
// Owner, 2026-09-28: "Have that be what comes up when you go to about" — the
// product page (public/landing.html, the same page a first-time web visitor
// sees) is the About page now, shown inside the app.
//
// It is framed rather than navigated to, so the person stays in the app: with
// ?embed=1 the page's own top bar reads "← Back" (owner: "if they are logged
// in the top back should be back") and returns them to wherever they came
// from, the Start praying buttons are hidden (owner: "it doesnt need the start
// praying"), the App Store link hides inside the iPhone app, and every link
// that leaves the page (Privacy, Terms, the app) opens in the app, not in the
// frame. See the embed block in landing.html.
//
// The previous About page (the essay, the slideshow button, Privacy and Terms)
// is in git history; the slideshow still lives at /overview-deck, and Privacy
// and Terms are in the page's footer.

import { useLocation } from "wouter";

const BG = "#091A10";
const BAR_H = 52;

/**
 * THE BAR LIVES HERE, NOT IN THE FRAME (owner, 2026-09-30: "On the about page
 * in the app, the top bar doesnt stick to the top"). The landing page's own
 * bar is sticky INSIDE the framed page, and on the iPhone a framed page does
 * not always scroll inside itself, so the bar scrolled away with everything
 * else. Drawn by the app, outside the frame, it cannot scroll at all. The
 * framed page hides its own bar in this mode (html.embed in landing.html).
 */
export default function AboutPage() {
  const [, setLocation] = useLocation();
  const back = () => {
    if (window.history.length > 1) window.history.back();
    else setLocation("/dashboard");
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: BG, zIndex: 40 }}>
      <div
        style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 1,
          paddingTop: "var(--safe-top)",
          background: "rgba(9,26,16,0.86)",
          backdropFilter: "saturate(160%) blur(18px)", WebkitBackdropFilter: "saturate(160%) blur(18px)",
          borderBottom: "1px solid rgba(200,212,192,0.1)",
        }}
      >
        <div style={{ height: BAR_H, display: "flex", alignItems: "center", padding: "0 16px" }}>
          <button
            type="button"
            onClick={back}
            style={{ background: "none", border: "none", color: "#F0EDE6", fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: 16, lineHeight: "24px", fontWeight: 600, cursor: "pointer", padding: "8px 4px" }}
          >
            ← Back
          </button>
        </div>
      </div>
      <iframe
        src="/landing.html?embed=1"
        title="About Phoebe"
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0,
          top: `calc(var(--safe-top) + ${BAR_H}px)`,
          width: "100%", height: `calc(100% - var(--safe-top) - ${BAR_H}px)`,
          display: "block", border: 0, background: BG,
        }}
      />
    </div>
  );
}
