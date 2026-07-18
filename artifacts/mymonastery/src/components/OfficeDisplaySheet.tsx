/**
 * OfficeDisplaySheet — the shared "Display" settings sheet for the office-style
 * slideshow surfaces: text size (A− / A+, stepped, live serif sample) and the
 * backdrop (Leaves / Planet / Plain). Drops DOWN from the top, opened by the ⚙
 * circle beside each deck's close X.
 *
 * One sheet, several decks: the Daily Office (bcp-daily-office), the
 * intercessions slideshow (prayer-mode — the office hands off into it
 * mid-liturgy, so the reader's chosen size/backdrop must survive the seam),
 * and the Psalms deck. All write the same device-local officeDisplay prefs;
 * every consumer re-reads live via OFFICE_DISPLAY_EVENT (useOfficeDisplay).
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import {
  OFFICE_DISPLAY_EVENT,
  OFFICE_FONT_SCALES,
  OFFICE_FONT_FAMILIES,
  getOfficeBackdrop,
  getOfficeFont,
  getOfficeFontScale,
  getOfficePrayingMode,
  setOfficeBackdrop,
  setOfficeFont,
  setOfficeFontScale,
  setOfficePrayingMode,
  type OfficeBackdrop,
  type OfficeFont,
  type OfficePrayingMode,
} from "@/lib/officeDisplay";
import { LEAF_PHOTOS, PLANET_PHOTOS } from "@/lib/earthPhotos";
import { isNativeShell } from "@/lib/isNativeShell";

const WARM_TEXT = "#F0EDE6";
const MUTED_GREEN = "#8FAF96";
const FAINT_GREEN = "rgba(143,175,150,0.55)";
const BORDER = "rgba(200,212,192,0.15)";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

/** Live view of the device-local display prefs — re-renders on every change
 *  (writers dispatch OFFICE_DISPLAY_EVENT; the praying-mode toggle in
 *  Settings rides the same event). */
export function useOfficeDisplay(): { backdrop: OfficeBackdrop; fontScale: number; prayingMode: OfficePrayingMode; font: OfficeFont } {
  const [display, setDisplay] = useState(() => ({ backdrop: getOfficeBackdrop(), fontScale: getOfficeFontScale(), prayingMode: getOfficePrayingMode(), font: getOfficeFont() }));
  useEffect(() => {
    const sync = () => setDisplay({ backdrop: getOfficeBackdrop(), fontScale: getOfficeFontScale(), prayingMode: getOfficePrayingMode(), font: getOfficeFont() });
    window.addEventListener(OFFICE_DISPLAY_EVENT, sync);
    return () => window.removeEventListener(OFFICE_DISPLAY_EVENT, sync);
  }, []);
  return display;
}

// iOS WebKit (Safari or the Capacitor shell). CSS `zoom` is unreliable for
// TEXT there — long-standing WebKit regressions leave glyphs unscaled (or,
// on iPadOS, scaled inversely) while the box math still applies, so A+/A−
// read as "just adding or removing padding" and A− overflowed the right
// edge. The maxTouchPoints clause catches iPadOS, whose Safari masquerades
// as macOS in the user agent.
const IS_IOS_WEBKIT = (() => {
  try {
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  } catch { return false; }
})();

/** The text-scaling style the decks wrap their slide content in.
 *
 *  iOS: `-webkit-text-size-adjust: N%` — WebKit's own text-scaling mode on
 *  iPhone (honored in WKWebView): glyphs grow/shrink and REWRAP inside the
 *  same fixed column, no width games. (iPadOS may ignore it — a graceful
 *  no-op with zero layout damage, unlike the zoom path.)
 *
 *  Everywhere else: CSS zoom with width compensation — the content renders
 *  at its original column width, just bigger, wrapping at a proportionally
 *  narrower measure instead of overflowing. `maxWidthPx` is the column's
 *  usual max-width (672 = Tailwind max-w-2xl). */
export function fontScaleWrapStyle(scale: number, maxWidthPx = 672): React.CSSProperties {
  // The native shell is iOS-only, so treat it as WebKit even when the UA sniff
  // misses (some WKWebView builds report a UA that fails the iPhone/iPad test —
  // that fell through to the `zoom` path, whose width-compensation + mx-auto
  // CENTERED the column into a narrow band with the text pushed off the left
  // edge, since zoom doesn't scale WebKit glyphs anyway). text-size-adjust
  // keeps the column full-width and left-aligned.
  if (IS_IOS_WEBKIT || isNativeShell()) {
    return { maxWidth: maxWidthPx, WebkitTextSizeAdjust: `${Math.round(scale * 100)}%` };
  }
  if (scale === 1) return { maxWidth: maxWidthPx };
  return { zoom: scale, width: `${100 / scale}%`, maxWidth: `${maxWidthPx / scale}px` };
}

export function OfficeDisplaySheet({
  open,
  onClose,
  // Show the "Praying" (on my own / together) row — only the full offices
  // carry the Officiant/People rubrics + salutation, so the psalms deck and
  // the intercessions slideshow leave it off.
  showPrayingMode = false,
}: { open: boolean; onClose: () => void; showPrayingMode?: boolean }) {
  const [scale, setScale] = useState(() => getOfficeFontScale());
  const [backdrop, setBackdrop] = useState<OfficeBackdrop>(() => getOfficeBackdrop());
  const [font, setFontState] = useState<OfficeFont>(() => getOfficeFont());
  const [praying, setPrayingState] = useState<OfficePrayingMode>(() => getOfficePrayingMode());
  const pickFont = (f: OfficeFont) => { setFontState(f); setOfficeFont(f); };
  const pickPraying = (m: OfficePrayingMode) => { setPrayingState(m); setOfficePrayingMode(m); };
  const scales = OFFICE_FONT_SCALES as readonly number[];
  const idx = scales.reduce((best, s, i) => (Math.abs(s - scale) < Math.abs(scales[best]! - scale) ? i : best), 0);
  const step = (d: number) => {
    const next = scales[Math.max(0, Math.min(scales.length - 1, idx + d))]!;
    setScale(next);
    setOfficeFontScale(next);
  };
  const pick = (b: OfficeBackdrop) => { setBackdrop(b); setOfficeBackdrop(b); };
  const swatchBase: React.CSSProperties = {
    width: 52, height: 52, borderRadius: 14, overflow: "hidden", position: "relative",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 0, cursor: "pointer",
  };
  const BACKDROPS: Array<{ id: OfficeBackdrop; label: string; swatch: React.ReactNode }> = [
    { id: "leaves", label: "Leaves", swatch: LEAF_PHOTOS.length > 0 ? <img src={LEAF_PHOTOS[0]} alt="" aria-hidden style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span aria-hidden>🍃</span> },
    { id: "planet", label: "Planet", swatch: PLANET_PHOTOS.length > 0 ? <img src={PLANET_PHOTOS[0]} alt="" aria-hidden style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span aria-hidden>🌍</span> },
    { id: "plain", label: "Plain", swatch: <div aria-hidden style={{ position: "absolute", inset: 0, background: "#0C1F12" }} /> },
    // Paper — the light mode: a warm letter-writing ground with black ink.
    { id: "paper", label: "Paper", swatch: <div aria-hidden style={{ position: "absolute", inset: 0, background: "#F3ECDC" }} /> },
  ];
  const FONT_CHOICES: Array<{ id: OfficeFont; label: string }> = [
    { id: "grotesk", label: "Grotesk" },
    { id: "georgia", label: "Georgia" },
    { id: "arial", label: "Arial" },
  ];
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="office-display"
          className="fixed inset-0"
          style={{ zIndex: 80, background: "rgba(4,12,7,0.45)" }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          // Close on backdrop tap — but STOP the click from bubbling to whatever
          // is behind the sheet (the office deck's tap-to-advance / swipe nav),
          // so dismissing the menu stays on the SAME slide instead of paging.
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ y: "-100%" }} animate={{ y: 0 }} exit={{ y: "-100%" }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-b-3xl px-5 pb-6"
            style={{
              background: "#0c1f13",
              borderBottom: `1px solid rgba(46,107,64,0.4)`,
              paddingTop: "max(1.25rem, var(--safe-top))",
              maxWidth: 560, margin: "0 auto",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <p style={{ color: WARM_TEXT, fontFamily: SPACE_GROTESK, fontSize: 16, fontWeight: 600 }}>Display</p>
              <button type="button" onClick={onClose} aria-label="Close display settings"
                style={{ width: 28, height: 28, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(46,107,64,0.25)", border: `1px solid ${BORDER}`, color: WARM_TEXT, cursor: "pointer", padding: 0 }}>
                <X size={14} />
              </button>
            </div>

            {/* Text size — stepped A− / A+ with a live sample. */}
            <p style={{ color: FAINT_GREEN, fontFamily: SPACE_GROTESK, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Text size</p>
            <div className="flex items-center gap-3 mb-6">
              <button type="button" onClick={() => step(-1)} disabled={idx === 0} aria-label="Smaller text"
                style={{ width: 44, height: 40, borderRadius: 12, background: "rgba(9,26,16,0.6)", border: `1px solid rgba(46,107,64,0.35)`, color: WARM_TEXT, fontFamily: SPACE_GROTESK, fontSize: 14, cursor: "pointer", opacity: idx === 0 ? 0.4 : 1 }}>
                A−
              </button>
              <div className="flex-1 text-center" style={{ color: WARM_TEXT, fontFamily: "Georgia, serif", fontSize: 19 * scale, lineHeight: 1.2 }}>
                Be still, and know
              </div>
              <button type="button" onClick={() => step(1)} disabled={idx === scales.length - 1} aria-label="Larger text"
                style={{ width: 44, height: 40, borderRadius: 12, background: "rgba(9,26,16,0.6)", border: `1px solid rgba(46,107,64,0.35)`, color: WARM_TEXT, fontFamily: SPACE_GROTESK, fontSize: 17, cursor: "pointer", opacity: idx === scales.length - 1 ? 0.4 : 1 }}>
                A+
              </button>
            </div>

            {/* Backdrop — leaves / planet / plain. */}
            <p style={{ color: FAINT_GREEN, fontFamily: SPACE_GROTESK, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Background</p>
            <div className="flex gap-4">
              {BACKDROPS.map((b) => (
                <button key={b.id} type="button" onClick={() => pick(b.id)} className="flex flex-col items-center gap-1.5" style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  <div style={{ ...swatchBase, border: backdrop === b.id ? "2px solid #7ED28C" : "1px solid rgba(143,175,150,0.3)" }}>
                    {b.swatch}
                  </div>
                  <span style={{ color: backdrop === b.id ? WARM_TEXT : MUTED_GREEN, fontFamily: SPACE_GROTESK, fontSize: 12, fontWeight: backdrop === b.id ? 600 : 500 }}>{b.label}</span>
                </button>
              ))}
            </div>

            {/* Typeface — each chip previews itself. */}
            <p style={{ color: FAINT_GREEN, fontFamily: SPACE_GROTESK, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, margin: "20px 0 8px" }}>Type</p>
            <div className="flex gap-4">
              {FONT_CHOICES.map((f) => (
                <button key={f.id} type="button" onClick={() => pickFont(f.id)} className="flex flex-col items-center gap-1.5" style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  <div style={{ ...swatchBase, border: font === f.id ? "2px solid #7ED28C" : "1px solid rgba(143,175,150,0.3)", background: "rgba(9,26,16,0.6)" }}>
                    <span aria-hidden style={{ color: WARM_TEXT, fontFamily: OFFICE_FONT_FAMILIES[f.id], fontSize: 21 }}>Aa</span>
                  </div>
                  <span style={{ color: font === f.id ? WARM_TEXT : MUTED_GREEN, fontFamily: SPACE_GROTESK, fontSize: 12, fontWeight: font === f.id ? 600 : 500 }}>{f.label}</span>
                </button>
              ))}
            </div>

            {/* Praying — on my own vs together. Only the full offices carry
                the Officiant/People rubrics + the salutation, so this row is
                hidden on the psalms + intercessions decks. */}
            {showPrayingMode && (
              <>
                <p style={{ color: FAINT_GREEN, fontFamily: SPACE_GROTESK, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, margin: "20px 0 8px" }}>Praying</p>
                <div className="flex gap-2.5">
                  {([
                    { id: "individual" as const, label: "On my own", sub: "A clean, personal reading" },
                    { id: "communal" as const, label: "Together", sub: "Officiant & People parts" },
                  ]).map((m) => {
                    const on = praying === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => pickPraying(m.id)}
                        className="flex-1 text-left rounded-2xl px-3.5 py-3"
                        style={{
                          background: on ? "rgba(46,107,64,0.4)" : "rgba(9,26,16,0.6)",
                          border: on ? "2px solid #7ED28C" : "1px solid rgba(143,175,150,0.3)",
                          cursor: "pointer",
                        }}
                      >
                        <span className="block" style={{ color: WARM_TEXT, fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: on ? 700 : 600 }}>{m.label}</span>
                        <span className="block" style={{ color: MUTED_GREEN, fontFamily: SPACE_GROTESK, fontSize: 11.5, marginTop: 2 }}>{m.sub}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
