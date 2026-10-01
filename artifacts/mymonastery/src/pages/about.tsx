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

import type React from "react";
import { useLocation } from "wouter";

const BG = "#091A10";

/**
 * NO BAR - TWO FLOATING PILLS: Back on the left, Share on the right (owner,
 * 2026-10-01: "get rid of the bar, just have back button floating in the top
 * left" · "do the same thing with the floating back" · "maybe also put a share
 * pill on the right" · "their is still issues with the about page back button").
 *
 * WHAT WAS STILL WRONG. The bar had gone, but the button that replaced it was
 * pinned 14px from the window's left edge - correct on a phone, and on a wide
 * window alone in the far corner of a screen two thousand pixels across, with
 * the page it belongs to centred a long way off. It was also a faint 55% tint
 * with no edge, which disappears over the hero. So the two pills sit in the SAME
 * column the framed page uses (max-width 1080, its own side gutter), so Back
 * lines up with the content it goes back from, and each is a solid dark pill with
 * a hairline edge.
 *
 * NO BLUR, ON PURPOSE. This used to be a full-width bar with a backdrop-filter
 * and a border, and index.css restrokes any such pair at 1.5px and rebuilds the
 * blur as an inset ::before - chrome meant for frosted CARDS - which showed as
 * an edge along the bar's top and left. These pills carry a border but no
 * backdrop-filter, so that rule has nothing to match.
 *
 * The framed page hides its own bar in this mode (html.embed in landing.html),
 * so without these there is no way back - they are drawn by the app, over the
 * frame, and cannot scroll away with the page inside it. The row itself ignores
 * pointer events, so the frame stays scrollable and tappable between the pills.
 */
const PILL: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8,
  background: "rgba(5,14,9,0.82)", border: "1px solid rgba(200,212,192,0.22)",
  borderRadius: 999, padding: "8px 18px", cursor: "pointer", pointerEvents: "auto",
  color: "#F0EDE6", fontFamily: "'Space Grotesk', system-ui, sans-serif",
  fontSize: 16, lineHeight: "24px", fontWeight: 600,
};

const SHARE_URL = "https://withphoebe.app";
const SHARE_TEXT = "Phoebe: find stability in our turbulent world through monastic wisdom.";

export default function AboutPage() {
  const [, setLocation] = useLocation();
  const back = () => {
    if (window.history.length > 1) window.history.back();
    else setLocation("/dashboard");
  };
  /**
   * The system share sheet where there is one (the iPhone app, mobile browsers,
   * Safari on a Mac); otherwise the app's own Share Phoebe page, which has the
   * link and a QR code to scan. Dismissing the sheet is not an error and must
   * not send anyone anywhere.
   */
  const share = async () => {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try { await nav.share({ title: "Phoebe", text: SHARE_TEXT, url: SHARE_URL }); return; }
      catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return;
      }
    }
    setLocation("/invite/share");
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
      <div
        style={{
          position: "absolute", zIndex: 1, left: 0, right: 0, margin: "0 auto",
          top: "calc(var(--safe-top) + 12px)", maxWidth: 1080,
          paddingInline: "clamp(14px, 5vw, 48px)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          pointerEvents: "none",
        }}
      >
        <button type="button" onClick={back} style={PILL}>← Back</button>
        <button type="button" onClick={share} style={PILL} aria-label="Share Phoebe">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
            <path d="M8 10.5V2.5M8 2.5 5 5.5M8 2.5l3 3M3.5 8v4.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Share
        </button>
      </div>
    </div>
  );
}
