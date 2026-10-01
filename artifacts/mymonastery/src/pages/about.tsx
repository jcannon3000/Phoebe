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

/**
 * NO BAR — JUST THE BACK BUTTON (owner, 2026-10-01: "get rid of the bar, just
 * have back button floating in the top left"), after "there is still that
 * border on the top and left of the back bar".
 *
 * THE BORDER WAS NOT ONE WE DREW. The bar carried a backdrop-filter and a
 * border, and index.css has an app-wide rule for exactly that pair — it
 * restrokes such elements at 1.5px and rebuilds the blur as an inset ::before,
 * so the chrome meant for frosted CARDS landed on a full-width bar and showed
 * as an edge along its top and left. Taking the bar away takes the rule's
 * target away with it; the button has no background, no border and no blur, so
 * nothing matches.
 *
 * The framed page hides its own bar in this mode (html.embed in landing.html),
 * so without this button there is no way back — it is drawn by the app, over
 * the frame, and cannot scroll away with the page inside it.
 */
export default function AboutPage() {
  const [, setLocation] = useLocation();
  const back = () => {
    if (window.history.length > 1) window.history.back();
    else setLocation("/dashboard");
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: BG, zIndex: 40 }}>
      {/* The page itself, edge to edge now that nothing sits above it. */}
      <iframe
        src="/landing.html?embed=1"
        title="About Phoebe"
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          display: "block", border: 0, background: BG,
        }}
      />
      <button
        type="button"
        onClick={back}
        style={{
          position: "absolute", zIndex: 1,
          top: "calc(var(--safe-top) + 12px)", left: 14,
          background: "rgba(9,26,16,0.55)", border: "none", borderRadius: 999,
          padding: "7px 14px", cursor: "pointer",
          color: "#F0EDE6", fontFamily: "'Space Grotesk', system-ui, sans-serif",
          fontSize: 16, lineHeight: "24px", fontWeight: 600,
        }}
      >
        ← Back
      </button>
    </div>
  );
}
