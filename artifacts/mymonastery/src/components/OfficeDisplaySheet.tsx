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
  getOfficeBackdrop,
  getOfficeFontScale,
  setOfficeBackdrop,
  setOfficeFontScale,
  type OfficeBackdrop,
} from "@/lib/officeDisplay";
import { LEAF_PHOTOS, PLANET_PHOTOS } from "@/lib/earthPhotos";

const WARM_TEXT = "#F0EDE6";
const MUTED_GREEN = "#8FAF96";
const FAINT_GREEN = "rgba(143,175,150,0.55)";
const BORDER = "rgba(200,212,192,0.15)";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

/** Live view of the device-local display prefs — re-renders on every change
 *  (the sheet dispatches OFFICE_DISPLAY_EVENT on each write). */
export function useOfficeDisplay(): { backdrop: OfficeBackdrop; fontScale: number } {
  const [display, setDisplay] = useState(() => ({ backdrop: getOfficeBackdrop(), fontScale: getOfficeFontScale() }));
  useEffect(() => {
    const sync = () => setDisplay({ backdrop: getOfficeBackdrop(), fontScale: getOfficeFontScale() });
    window.addEventListener(OFFICE_DISPLAY_EVENT, sync);
    return () => window.removeEventListener(OFFICE_DISPLAY_EVENT, sync);
  }, []);
  return display;
}

/** The zoom + width-compensation the decks wrap their slide content in: the
 *  content renders at its original column width, just bigger — larger text
 *  wraps to a narrower measure instead of overflowing. `maxWidthPx` is the
 *  column's usual max-width (672 = Tailwind max-w-2xl). */
export function fontScaleWrapStyle(scale: number, maxWidthPx = 672): React.CSSProperties {
  if (scale === 1) return { maxWidth: maxWidthPx };
  return { zoom: scale, width: `${100 / scale}%`, maxWidth: `${maxWidthPx / scale}px` };
}

export function OfficeDisplaySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [scale, setScale] = useState(() => getOfficeFontScale());
  const [backdrop, setBackdrop] = useState<OfficeBackdrop>(() => getOfficeBackdrop());
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
          onClick={onClose}
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
