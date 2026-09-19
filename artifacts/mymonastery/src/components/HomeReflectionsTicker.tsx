// ── Home Explore: the reflections row ────────────────────────────────────────
//
// Owner, 2026-09-19: "add the newsletters/reflections as another row, have it
// be the second row, don't have it have the deans commentary". The daily
// reflections from lib/dailyReflections (the Reflections page's own list),
// minus VTS — the Dean's Commentary — each pill opening and marking read
// exactly as the Reflections page does. Rendered bare under the Explore
// heading; the same once-in-view fade as the other two rows.
//
// With the two Sunday commentaries DISPERSED among them (owner, 2026-09-19:
// "Put Yale Commentary & Living Church Commentary in the reflection ticker"
// · "Dispersed"): Yale after the second daily, Living Church after the
// fourth. Same gates and same opening as This Sunday (lib/sundayCommentaries).

import { useMemo, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { useLocation } from "wouter";
import { PillTicker } from "@/components/PillTicker";
import { DAILY_REFLECTIONS, openDailyReflection } from "@/lib/dailyReflections";
import { useSundayCommentaries } from "@/lib/sundayCommentaries";

export function HomeReflectionsTicker() {
  const [, setLocation] = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.25 });
  const commentaries = useSundayCommentaries();
  const pills = useMemo(() => {
    const daily = DAILY_REFLECTIONS
      .filter((d) => d.source !== "vts")
      .map((d) => ({ key: d.source, emoji: d.emoji, label: d.title, onSelect: () => openDailyReflection(d.source, setLocation) }));
    const extra = commentaries.map((c) => ({ key: c.key, emoji: c.emoji, label: c.title, onSelect: c.open }));
    // Dispersed: one commentary after every second daily, the rest at the end.
    const out: Array<{ key: string; emoji: string; label: string; onSelect: () => void }> = [];
    let e = 0;
    daily.forEach((p, i) => {
      out.push(p);
      if (i % 2 === 1 && e < extra.length) out.push(extra[e++]!);
    });
    while (e < extra.length) out.push(extra[e++]!);
    return out;
  }, [setLocation, commentaries]);
  if (pills.length === 0) return null;
  return (
    <div ref={rootRef}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
      >
        <PillTicker label="Reflections" pills={pills} />
      </motion.div>
    </div>
  );
}
