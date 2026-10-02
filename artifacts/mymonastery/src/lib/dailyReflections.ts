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
  markNouwenRead, markSojoRead, markGristRead, markPaygRead, markTaizePrayerRead,
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
  taizeprayer: "Brother Matthew · Taizé",
};

export type DailyReflection = { source: TrackedReflection; emoji: string; title: string; publisher: string };

/**
 * THE ORDER THEY ARE SHOWN IN (owner, 2026-10-01: "Put Daily Devotion first" ·
 * "Then 'Daily Prayer from Taize'" · "The Daily Meditation from the CAC" ·
 * "Then SSJE" · "Then Forward" · "Then Haigriophay"). Henri Nouwen's devotion,
 * Brother Matthew's prayer from Taizé, the CAC's meditation, SSJE, Forward Day by
 * Day - and then the saint of the day, which the Reflections page adds itself
 * after this list, so it is last without being named here. Anything not named
 * follows in the rhythm's own order.
 *
 * Sorted HERE and not in TRACKED_REFLECTION_SOURCES, because that array is the
 * rhythm's order and the pickers, the migrations and the card pipeline all read
 * it - this list is only what is SHOWN, to the Reflections page and the home's
 * Reflections row, which is why the two cannot disagree.
 */
const SHOWN_FIRST: readonly TrackedReflection[] = ["nouwen", "taizeprayer", "cac", "ssje", "fdd"];
const shownRank = (s: TrackedReflection): number => {
  const i = SHOWN_FIRST.indexOf(s);
  return i === -1 ? SHOWN_FIRST.length : i;
};

/** Every daily reflection that is offered, led by the five the owner named. */
export const DAILY_REFLECTIONS: readonly DailyReflection[] = TRACKED_REFLECTION_SOURCES
  .filter((s) => !UNOFFERED_REFLECTION_SOURCES.has(s))
  .map((source, i) => ({ source, i }))
  // Array.sort is stable, but the index makes "the rest keep their order" explicit.
  .sort((a, b) => shownRank(a.source) - shownRank(b.source) || a.i - b.i)
  .map(({ source }) => ({ source, emoji: REFLECTION_EMOJI[source], title: PUBLICATION_NAME[source], publisher: REFLECTION_PUBLISHER[source] }));

export const MARK_REFLECTION_READ: Record<TrackedReflection, (dwellMs?: number) => void> = {
  cac: markCacRead, fdd: markFddRead, ssje: markSsjeRead, vts: markVtsRead,
  nouwen: markNouwenRead, sojo: markSojoRead, grist: markGristRead, payg: markPaygRead,
  taizeprayer: markTaizePrayerRead,
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
