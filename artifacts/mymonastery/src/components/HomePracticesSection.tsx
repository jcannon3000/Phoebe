// ─── Home "Practices" section — every practice, rolling past ─────────────────
//
// Owner, 2026-09-16: "Could we build one of these horizontal scrolls for all
// the practices on the practice page" · "Have it practices as the section
// title, and then have the practices. Have it after courses" · "i want them to
// roll through on a ticker". So: right after Courses, under the same header
// recipe so the two read as siblings, one pill per practice on a PillTicker.
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

export function HomePracticesSection() {
  const [, setLocation] = useLocation();
  const practices = usePracticeDirectory();
  const online = useOnline();
  // Both hooks above the early return — see HomeLearnSection's note on the
  // hook-count crash when a section's list empties.
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.25 });
  const savedKeys = new Set(OFFLINE_PRACTICES.map((p) => p.key));
  const shown = online ? practices : practices.filter((p) => !!p.offlineKey && savedKeys.has(p.offlineKey));
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
          pills={shown.map((p) => ({ key: p.href, emoji: p.emoji, label: p.label, onSelect: () => setLocation(p.href) }))}
        />
      </motion.div>
    </div>
  );
}
