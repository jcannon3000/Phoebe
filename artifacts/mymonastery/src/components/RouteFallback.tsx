// ─── The leaf loading screen ─────────────────────────────────────────────
//
// What every lazy route shows while its chunk arrives — and what a video
// course shows on iOS while it hands itself to the reader (owner, 2026-09-19:
// "If there needs to be a loading splash using a leaf loading splash").
//
// It lives here rather than in App.tsx because a PAGE needs it, and a page
// importing App would close a circle (App imports the pages). One copy, so
// two screens meant to look alike cannot drift apart.
//
// THE SAME LEAF THE OFFICE'S VEIL USES, NOT A FOREST PATH (owner, 2026-10-02,
// from a screen recording of an office opening: "they shouldnt see the dark
// path" · "it should go straight to the leaf splash with the quote" · "this is
// happening on many slideshows"). This screen used to be a dark forest photograph,
// so every slideshow opened on that, then on its own page, then on whatever
// followed — a different picture each time, dark then bright then dark. It is now
// the app-open splash's own leaf under the office veil's own wash, so the screen
// before the office and the office's first screen are the same screen. When the
// address is an office deck, the opening versicle is on it too, from the same
// lines the veil reads (lib/officeVeil), so what arrives next only fades the
// spinner away.

import { SPLASH_PHOTO } from "@/lib/earthPhotos";
import splashForestPath from "@/assets/splash/forest-path.jpg";
import { officeModeFromLocation, officeVeilOpening } from "@/lib/officeVeil";

export function RouteFallback() {
  // Read from the address, not from state: this renders before the page has run any
  // code of its own. Null for every route that is not an office deck.
  const officeMode = officeModeFromLocation();
  const opening = officeMode ? officeVeilOpening(officeMode) : null;
  return (
    <div
      style={{
        position: "fixed", inset: 0, minHeight: "var(--app-dvh)", background: "#091A10",
        isolation: "isolate", overflow: "hidden",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 40px",
      }}
    >
      <img
        src={SPLASH_PHOTO || splashForestPath}
        alt=""
        aria-hidden
        decoding="async"
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "cover", zIndex: -1,
        }}
      />
      {/* The office veil's own wash and its own soft green centre, value for value. */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0, zIndex: -1,
          background: "linear-gradient(180deg, rgba(var(--ot-wash2, 8,18,12),calc(0.62 * var(--bg-wash, 1))) 0%, rgba(var(--ot-wash2, 8,18,12),calc(0.5 * var(--bg-wash, 1))) 45%, rgba(var(--ot-wash2, 8,18,12),calc(0.78 * var(--bg-wash, 1))) 100%)",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0, zIndex: -1,
          background: "radial-gradient(120% 95% at 50% 34%, rgba(var(--ot-green, 46,107,64),0.20) 0%, rgba(var(--ot-green, 46,107,64),0.12) 28%, rgba(var(--ot-green, 46,107,64),0.05) 54%, rgba(var(--ot-green, 46,107,64),0) 82%)",
        }}
      />
      {opening && (
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <p style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontSize: 24, lineHeight: 1.55, color: "var(--oh-ink2, #E8E4D8)", textAlign: "center", maxWidth: 460, margin: 0 }}>
            {opening.text}
          </p>
          <p style={{ fontFamily: "var(--office-font, 'Space Grotesk', system-ui, sans-serif)", fontSize: 12, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--oh-sage, #8FAF96)", margin: 0 }}>
            {opening.cite}
          </p>
        </div>
      )}
      {/* Same size and placement as the office veil's spinner, so it does not jump
          when the deck takes over. */}
      <div
        aria-hidden
        className="animate-spin"
        style={{
          position: "absolute", bottom: 64, left: "50%", marginLeft: -11,
          width: 22, height: 22, borderRadius: "50%",
          border: "2px solid rgba(143,175,150,0.25)",
          borderTopColor: "rgba(143,175,150,0.85)",
        }}
      />
    </div>
  );
}
