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
//
// AND THE CHURCHES' NEWEST SERMONS (owner, 2026-09-19: "In the ticker with the
// reflections put the last sermons from each feed"), dispersed the same way.
// The Sermons page's own source of truth, in ONE request:
// /api/podcasts/sermon-sources?latest=1 carries each church's newest episode
// that IS a sermon — never the cathedral's two-minute Prayer for the Day — so
// the home pays one cached call rather than a fan-out, and nothing here
// blocks the paint: the row renders its reflections and the sermons join when
// the answer arrives. A church silent for more than 90 days gets no pill, the
// same rule the Sermons page keeps.

import { useMemo, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PillTicker } from "@/components/PillTicker";
import { DAILY_REFLECTIONS, openDailyReflection } from "@/lib/dailyReflections";
import { useSundayCommentaries } from "@/lib/sundayCommentaries";
import { apiRequest } from "@/lib/queryClient";


type SermonSource = {
  slug: string;
  title: string;
  latest?: { id: string; title: string | null; publishedAt: string | null; preacher: string | null } | null;
};

export function HomeReflectionsTicker() {
  const [, setLocation] = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.25 });
  const commentaries = useSundayCommentaries();
  const pills = useMemo(() => {
    const daily = DAILY_REFLECTIONS
      .filter((d) => d.source !== "vts")
      .map((d) => ({ key: d.source, emoji: d.emoji, label: d.title, onSelect: () => openDailyReflection(d.source, setLocation) }));
    type Pill = { key: string; emoji: string; label: string; onSelect: () => void };
    const extra: Pill[] = commentaries.map((c) => ({ key: c.key as string, emoji: c.emoji, label: c.title, onSelect: c.open }));
    /**
     * NO SERMON PILLS (owner, 2026-09-19: "Take the sermons out of the
     * tickers"). They were a pill per church carrying its newest sermon; the
     * row is the day's reading and the Sunday commentaries again, and sermons
     * are a tap away under Menu → Sermons, which is where they are chosen
     * rather than met in passing.
     */
    /**
     * DISPERSED, not clumped (owner, of the commentaries: "Dispersed"). It was
     * one extra after every second daily, which was right for two of them; with
     * the sermons there can be seven, and the tail of the row became all
     * sermons. So the gap is measured against how many there are: evenly
     * spaced through the dailies, and anything left over still lands at the
     * end rather than being dropped.
     */
    const out: Pill[] = [];
    const step = extra.length > 0 ? Math.max(1, Math.floor(daily.length / (extra.length + 1))) : 0;
    let e = 0;
    daily.forEach((p, i) => {
      out.push(p);
      if (step > 0 && (i + 1) % step === 0 && e < extra.length) out.push(extra[e++]!);
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
