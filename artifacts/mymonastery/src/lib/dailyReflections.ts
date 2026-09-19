// ── The daily reflections, and how one is opened ─────────────────────────────
//
// ONE place for both surfaces that open a daily reflection: the Reflections
// page (pages/menu-newsletters.tsx) and the home's Explore row
// (components/HomeReflectionsTicker.tsx, owner 2026-09-19: "add the
// newsletters/reflections as another row"). Lifted out of the page so the two
// can't drift in which sources exist, what they're called, or how opening one
// marks it read (reference_second_renderer_drift).
//
// Which sources exist comes from TRACKED_REFLECTION_SOURCES, and their names
// and emoji from the home card's own maps, as the page always did.

import { PUBLICATION_NAME, REFLECTION_EMOJI } from "@/components/DailyProgressBody";
import { TRACKED_REFLECTION_SOURCES, UNOFFERED_REFLECTION_SOURCES } from "@/lib/officePrefs";
import { warmedHtml } from "@/lib/warmedPages";
import { openExternalThenMarkRead } from "@/lib/openExternal";
import {
  reflectionSourceUrl,
  reflectionInAppRoute,
  markCacRead, markFddRead, markSsjeRead, markVtsRead,
  markNouwenRead, markSojoRead, markGristRead, markPaygRead,
  type TrackedReflection,
} from "@/lib/cacReadState";

/** The publisher line the Reflections page shows under each name. */
export const REFLECTION_PUBLISHER: Record<TrackedReflection, string> = {
  cac: "Center for Action & Contemplation",
  sojo: "Sojourners",
  fdd: "Forward Movement",
  ssje: "Society of St. John the Evangelist",
  nouwen: "Henri Nouwen Society",
  grist: "The day's climate reporting",
  vts: "Virginia Theological Seminary · weekdays",
  payg: "The Jesuits in Britain · listen",
};

export type DailyReflection = { source: TrackedReflection; emoji: string; title: string; publisher: string };

/** Every daily reflection that is offered, in the rhythm's order. */
export const DAILY_REFLECTIONS: readonly DailyReflection[] = TRACKED_REFLECTION_SOURCES
  .filter((s) => !UNOFFERED_REFLECTION_SOURCES.has(s))
  .map((source) => ({ source, emoji: REFLECTION_EMOJI[source], title: PUBLICATION_NAME[source], publisher: REFLECTION_PUBLISHER[source] }));

export const MARK_REFLECTION_READ: Record<TrackedReflection, (dwellMs?: number) => void> = {
  cac: markCacRead, fdd: markFddRead, ssje: markSsjeRead, vts: markVtsRead,
  nouwen: markNouwenRead, sojo: markSojoRead, grist: markGristRead, payg: markPaygRead,
};

/**
 * Open one. Read-gated like the home card (owner, 2026-09-04: a long piece
 * counts only once scrolled through). In-app sources open their own screen and
 * mark themselves there: the VTS reader marks on the first step, the Pray As
 * You Go player once the session has been heard.
 */
export function openDailyReflection(source: TrackedReflection, go: (path: string) => void): void {
  const inApp = reflectionInAppRoute(source);
  if (inApp) { if (source === "vts") MARK_REFLECTION_READ[source](); go(inApp); return; }
  // This morning's copy when the walk got one — see lib/warmedPages.
  const src = reflectionSourceUrl(source);
  openExternalThenMarkRead(src, (ms) => MARK_REFLECTION_READ[source](ms), { reader: true, savedHtml: warmedHtml(src) });
}
