// ─── Home "Practices" section — every practice, rolling past ─────────────────
//
// Owner, 2026-09-16: "Could we build one of these horizontal scrolls for all
// the practices on the practice page" · "Have it practices as the section
// title, and then have the practices. Have it after courses" · "i want them to
// roll through on a ticker". Then, that evening, "Take out the practice
// ticker" — and on 2026-09-18, "lets also bring back the practices ticker
// under courses". So it returns to where it started: right after Courses,
// under the same header recipe, so the two read as siblings.
//
// The pills are the Practices page's own list (lib/practiceDirectory), in its
// order and behind its gates. Offline, only what lib/offline's registry says
// opens with no connection rides the ticker — the Practices page's "Available"
// half, matched on the same registry key.

import { useRef } from "react";
import { useLocation } from "wouter";
import { motion, useInView } from "framer-motion";
import { PillTicker } from "@/components/PillTicker";
import { usePracticeDirectory } from "@/lib/practiceDirectory";
import { OFFLINE_PRACTICES, useOnline } from "@/lib/offline";

const FONT = "'Space Grotesk', sans-serif";
const WARM = "#F0EDE6";

/**
 * THE FOUR OFFICES RIDE SEPARATELY (owner, 2026-09-18: "List Morning Prayer,
 * Midday Prayer, Evening Prayer, And Compline all as seperate practice in the
 * ticker" · "dispersed amonth the other practices").
 *
 * The Practices PAGE keeps its single "Daily Offices" row — a list wants one
 * door to the four, and nothing was asked of that page. A ticker is the other
 * case: it is read a pill at a time, so "Daily Offices" rolling past says less
 * than Compline does, and the hour someone is actually in never appears. This
 * expansion therefore lives here and not in lib/practiceDirectory, which stays
 * the single source for WHICH practices exist and who may see them.
 *
 * Same deck, four modes — see project_midday_prayer for why each is its own
 * ?mode= rather than four pages.
 */
const OFFICE_PILLS = [
  { key: "office-morning", emoji: "🌅", label: "Morning Prayer", href: "/bcp/daily-office?mode=morning" },
  { key: "office-noonday", emoji: "☀️", label: "Midday Prayer", href: "/bcp/daily-office?mode=noonday" },
  { key: "office-evening", emoji: "🌆", label: "Evening Prayer", href: "/bcp/daily-office?mode=evening" },
  { key: "office-compline", emoji: "🌙", label: "Compline", href: "/bcp/daily-office?mode=compline" },
] as const;

/** The directory row the four above stand in for. */
const OFFICES_HREF = "/bcp/daily-office";

/**
 * Owner, 2026-09-18: "Have Sacred Image Doom Scroll be it's own practice in
 * the ticker". The scroll is reached today through Praying with Icons, which
 * means nobody finds it unless they were already going there; as a pill it is
 * its own door. The name is the owner's, and it is the joke the practice is
 * built on — the done screen tells you what you did INSTEAD of doom scrolling.
 *
 * Ticker-only, like the offices: the Practices page was not asked about, and
 * /icon-prayer already stands there for the whole practice.
 */
const SCROLL_PILL = {
  key: "sacred-image-scroll",
  emoji: "🖼️",
  // Renamed Sacred Image Browser (owner, 2026-09-18: "Call the sacred image
  // scroll Sacred Image Browser"). The done screen still says "instead of doom
  // scrolling": that is what the practice is set against, not its name.
  label: "Sacred Image Browser",
  href: "/icon-prayer?gallery=1",
} as const;

type Pill = { key: string; emoji: string; label: string; href: string };

/**
 * Spread the offices through the rest rather than letting them ride as a block
 * of four ("dispersed amonth the other practices"). Evenly spaced and
 * deterministic — a ticker that reshuffled every render would make the same
 * lap read differently twice.
 */
function disperse(others: Pill[], offices: Pill[]): Pill[] {
  if (offices.length === 0) return others;
  const gap = Math.max(1, Math.round(others.length / offices.length));
  const out: Pill[] = [];
  let next = 0;
  others.forEach((p, i) => {
    if (next < offices.length && i % gap === 0) out.push(offices[next++]!);
    out.push(p);
  });
  while (next < offices.length) out.push(offices[next++]!);
  return out;
}

export function HomePracticesTicker() {
  const [, setLocation] = useLocation();
  const practices = usePracticeDirectory();
  const online = useOnline();
  // Both hooks above the early return — see HomeLearnSection's note on the
  // hook-count crash when a section's list empties.
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.25 });

  const savedKeys = new Set(OFFLINE_PRACTICES.map((p) => p.key));
  const visible = online ? practices : practices.filter((p) => !!p.offlineKey && savedKeys.has(p.offlineKey));

  // The offices ride as four, in the place the one row held — and only when
  // that row is there, so every gate on it (and the whole offline filter)
  // still decides whether they appear at all.
  const officesShown = visible.some((p) => p.href === OFFICES_HREF);
  const others: Pill[] = visible
    .filter((p) => p.href !== OFFICES_HREF)
    .map((p) => ({ key: p.href, emoji: p.emoji, label: p.label, href: p.href }));
  // Rides with the rest, so the dispersal spaces it like anything else. Gated
  // with the icons row it belongs to: offline, or wherever that row is hidden,
  // the scroll goes with it rather than becoming a pill that leads nowhere.
  if (visible.some((p) => p.href === "/icon-prayer")) others.push({ ...SCROLL_PILL });
  const shown = officesShown ? disperse(others, OFFICE_PILLS.map((o) => ({ ...o }))) : others;

  if (shown.length === 0) return null;

  // Courses' entrance: opacity only, the header first and the row a beat
  // behind, held until the section scrolls into view.
  const enter = (i: number) => ({
    initial: { opacity: 0 },
    animate: inView ? { opacity: 1 } : { opacity: 0 },
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const, delay: i * 0.1 },
  });

  return (
    <div className="mt-6" ref={rootRef}>
      {/* HomeLearnSection's header recipe, word for word. */}
      <motion.div {...enter(0)} className="flex items-center gap-3 mb-2">
        <h3 className="text-lg font-semibold" style={{ color: WARM, fontFamily: FONT }}>Practices</h3>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
      </motion.div>
      <motion.div {...enter(1)}>
        <PillTicker
          label="Practices"
          pills={shown.map((p) => ({ key: p.key, emoji: p.emoji, label: p.label, onSelect: () => setLocation(p.href) }))}
        />
      </motion.div>
    </div>
  );
}
