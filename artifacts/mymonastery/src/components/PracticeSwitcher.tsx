/**
 * "Choose a different practice" — a one-day swap, offered on the opening
 * slide of every anchor practice's slideshow.
 *
 * Owner: "on the opening slide of the BCP practice slideshows, but also
 * things like Simple Guided Prayer and the Examen — choose a different
 * practice pill. That brings a dropdown, similar UI to the table of contents,
 * emoji on the left and the name, you click it and it goes into that
 * practice. But more than navigation: for that day only it replaces, for
 * example, Simple Guided Prayer with the Psalms on the home screen — the
 * second line of the Psalms card, when it's undone, says 'Switched from
 * Simple Guided Prayer'. But then tomorrow it'll be Simple Guided Prayer
 * again."
 *
 * The swap itself is officePrefs' day-swap (getSideLevel consults it first),
 * which is what makes this MORE than navigation with no extra wiring: the
 * home card, begin-prayer's routing, the completion signal and the undo-lift
 * all key on getSideLevel, so they all follow today's practice together.
 *
 * The sheet mirrors the office's Skip Ahead sheet (bcp-daily-office's
 * SkipAheadSheet) — same top drop, same row shape — so "a menu of places to
 * go" looks the same wherever the app offers one.
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getSideDaySwap, setSideDaySwap, clearSideDaySwap, getSideLevel, getSideCustomName,
  getExplicitSideLevel, getSideExtra,
  type OfficeSide, type OfficeLevel,
} from "@/lib/officePrefs";
import { useRhythmState } from "@/hooks/useRhythmState";

const FONT = "'Space Grotesk', system-ui, sans-serif";

/**
 * EVERY practice with an in-app flow a swap can walk straight into — the
 * full menu, not the four it launched with (owner, recording the Examen's
 * sheet: "this is not showing all the available practices"). What a given
 * person actually sees is this MINUS what their routine already keeps — see
 * the filter in the component (same owner note: "…but also showing a
 * practice already in my routine").
 */
const SWITCHABLE: Array<{
  level: OfficeLevel;
  emoji: (side: OfficeSide) => string;
  name: (side: OfficeSide) => string;
  href: (side: OfficeSide) => string;
}> = [
  {
    level: "office",
    emoji: (s) => (s === "morning" ? "🌅" : "🌙"),
    name: (s) => (s === "morning" ? "Morning Prayer" : "Evening Prayer"),
    href: (s) => `/bcp/daily-office?mode=${s}`,
  },
  {
    level: "devotion",
    emoji: () => "🕊️",
    name: (s) => (s === "morning" ? "Morning Devotion" : "Early Evening Devotion"),
    href: (s) => `/bcp/daily-office?mode=${s === "morning" ? "morning-devotion" : "early-evening-devotion"}`,
  },
  // NOTE the param name: the psalms page reads `?office=`, not `?side=` — a
  // side= here silently opened MORNING psalms for an evening swap.
  { level: "psalms", emoji: () => "📜", name: () => "Praying the Psalms", href: (s) => `/psalms?office=${s}` },
  { level: "guided-prayer", emoji: () => "🙌", name: () => "Simple Guided Prayer", href: (s) => `/guided-prayer?side=${s}` },
  { level: "examen", emoji: () => "🌗", name: () => "The Examen", href: (s) => `/examen?side=${s}` },
  { level: "compline", emoji: () => "🌙", name: () => "Compline", href: () => "/bcp/daily-office?mode=compline" },
  { level: "reflect-sit", emoji: () => "🕯️", name: () => "Contemplative Prayer", href: () => "/contemplation?begin=1" },
  { level: "creation", emoji: () => "🌍", name: () => "Creation Prayer", href: () => "/cobreathe" },
];

/**
 * The display name of a level, for the "Switched from …" line. Side-aware
 * because the office's own name is the side's ("Morning Prayer"), and a
 * custom practice's name is whatever the person called it.
 */
export function swapLevelName(level: OfficeLevel | null, side: OfficeSide): string | null {
  if (!level) return null;
  switch (level) {
    case "office": return side === "morning" ? "Morning Prayer" : "Evening Prayer";
    case "devotion": return "the Daily Devotion";
    case "psalms": return "the Psalms";
    case "guided-prayer": return "Simple Guided Prayer";
    case "examen": return "the Examen";
    case "readings": return "Daily Scripture Readings";
    case "fdd": return "your reflection";
    case "compline": return "Compline";
    case "creation": return "Creation Prayer";
    case "reflect-sit": return "Contemplation";
    case "custom": return getSideCustomName(side) || "your own practice";
    default: return null;
  }
}

/**
 * The home card's second line while a swapped day is still undone —
 * "Switched from Simple Guided Prayer" — or null when today is just today.
 */
export function daySwapNote(side: OfficeSide): string | null {
  const swap = getSideDaySwap(side);
  if (!swap) return null;
  const from = swapLevelName(swap.from, side);
  return from ? `Switched from ${from}` : null;
}

export function PracticeSwitcher({ side, current }: {
  side: OfficeSide;
  /** The practice whose opener this pill sits on — left out of the menu. */
  current: OfficeLevel;
}) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  // What the routine already keeps — silence and Creation Prayer come from
  // the same computation every other surface reads (the one-computation rule).
  const { silenceActive, cobreatheActive } = useRhythmState();

  /**
   * The menu = every switchable practice MINUS what their routine already
   * keeps (owner, on seeing his own Evening Prayer offered as "a different
   * practice": a swap is for praying something DIFFERENT today). Already-kept
   * means: the practice whose opener this pill sits on, either side's anchor,
   * either side's extra, an active silence goal (reflect-sit), an active
   * Creation Prayer card. "ask" (no explicit anchor) excludes nothing.
   */
  const kept = new Set<OfficeLevel | null>([
    current,
    getExplicitSideLevel("morning"), getExplicitSideLevel("evening"),
    getSideExtra("morning"), getSideExtra("evening"),
  ]);
  const options = SWITCHABLE.filter((p) => {
    if (kept.has(p.level)) return false;
    if (p.level === "reflect-sit" && silenceActive) return false;
    if (p.level === "creation" && cobreatheActive) return false;
    return true;
  });

  const choose = (level: OfficeLevel, href: string) => {
    setOpen(false);
    /**
     * Picking what today WOULD have been clears the swap instead of recording
     * a swap-to-itself — the "switched from" line would otherwise claim a
     * switch that no longer exists. `base` is the swap's own `from` when one
     * is standing (getSideLevel already answers with the swap).
     */
    const standing = getSideDaySwap(side);
    const base = standing ? standing.from : getSideLevel(side);
    if (level === base) clearSideDaySwap(side);
    else setSideDaySwap(side, level);
    setLocation(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={{
          background: "rgba(46,107,64,0.18)", border: "1px solid rgba(143,175,150,0.35)",
          color: "rgba(200,212,192,0.9)", borderRadius: 999, padding: "9px 18px",
          fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: "pointer",
        }}
      >
        {t("practice_switch.pill", { defaultValue: "Choose a different practice" })} <span aria-hidden>▾</span>
      </button>
      {/**
        * PORTALED to <body>, and it has to be. The pill sits inside a deck
        * slide that framer-motion TRANSFORMS (the fade/rise), and a transform
        * makes that ancestor the containing block for position:fixed — so the
        * "fixed inset-0" sheet was laying itself out against the SLIDE's box,
        * not the viewport. Measured: the ✕ rendered at y = −49, off screen
        * (owner, on the phone: "the x doesn't work" — it was under the status
        * bar, tappable by nobody). From <body>, fixed means the viewport
        * again on every page that mounts this.
        */}
      {typeof document !== "undefined" && createPortal(
      <AnimatePresence>
        {open && (
          <motion.div
            key="practice-switcher"
            className="fixed inset-0"
            style={{ zIndex: 90, background: "rgba(4,12,7,0.6)" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ y: "-100%" }} animate={{ y: 0 }} exit={{ y: "-100%" }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-b-3xl px-5 pb-6"
              style={{
                background: "#0c1f13", borderBottom: "1px solid rgba(46,107,64,0.4)",
                paddingTop: "max(1.25rem, env(safe-area-inset-top))",
                maxWidth: 560, margin: "0 auto", maxHeight: "85dvh",
                display: "flex", flexDirection: "column",
              }}
            >
              <div className="flex items-center justify-between mb-2" style={{ flexShrink: 0 }}>
                <p style={{ color: "#F0EDE6", fontFamily: FONT, fontSize: 16, fontWeight: 600, margin: 0 }}>
                  {t("practice_switch.title", { defaultValue: "A different practice today" })}
                </p>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close"
                  style={{ width: 28, height: 28, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(46,107,64,0.25)", border: "1px solid rgba(143,175,150,0.3)", color: "#F0EDE6", cursor: "pointer", padding: 0 }}>
                  <X size={14} />
                </button>
              </div>
              <p style={{ color: "rgba(143,175,150,0.8)", fontFamily: FONT, fontSize: 12.5, lineHeight: 1.5, margin: "0 0 14px" }}>
                {t("practice_switch.sub", { defaultValue: "Just for today — tomorrow your rhythm is back to normal." })}
              </p>
              <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                {options.map((p) => (
                  <button
                    key={p.level}
                    type="button"
                    onClick={() => choose(p.level, p.href(side))}
                    className="w-full text-left flex items-center gap-3 rounded-2xl px-3.5 py-3"
                    style={{ background: "rgba(9,26,16,0.6)", border: "1px solid rgba(143,175,150,0.3)", cursor: "pointer" }}
                  >
                    <span aria-hidden style={{ fontSize: 20, flexShrink: 0 }}>{p.emoji(side)}</span>
                    <span style={{ color: "#F0EDE6", fontFamily: FONT, fontSize: 14, fontWeight: 600 }}>{p.name(side)}</span>
                  </button>
                ))}
                {options.length === 0 && (
                  <p style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT, fontSize: 13.5, lineHeight: 1.55, margin: "4px 0 8px", textAlign: "center" }}>
                    {t("practice_switch.none", { defaultValue: "Everything else is already part of your rhythm." })}
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body)}
    </>
  );
}
