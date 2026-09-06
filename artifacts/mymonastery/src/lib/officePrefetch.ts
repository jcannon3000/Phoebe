// ── officePrefetch — warm the offline office cache for the next 30 days ─────
//
// Owner: "we want to build offline features... know the lectionary for the
// next month and be able to display the offices." Runs once per calendar day,
// natively only, and only on Wi-Fi (Network.getStatus()) so it never costs
// cellular data. Silently walks the next 30 local dates and, for whichever
// side(s) the viewer's rule actually has set to a real BCP office or
// devotion, fetches and caches the SAME already-assembled response
// bcp-daily-office.tsx's own load() would fetch live — so an offline open
// later gets exactly what a live open would have shown, not an approximation.
//
// Compline is always included: it isn't tied to either side's chosen level
// (it's a standalone night office offered every evening regardless), so
// there's no "side" to gate it on.
//
// Everything here is best-effort and silent — a failed/slow prefetch just
// means fewer days are available offline, never an error the user sees.

import { useEffect } from "react";
import { isNativeShell } from "@/lib/isNativeShell";
import { getSideLevel, getSideExtra, getSideConfession, getScriptureParts, type OfficeSide } from "@/lib/officePrefs";
import { putOfficeCacheEntry, pruneOfficeCacheBefore, getOfficeCacheEntry, type OfficeCacheKey } from "@/lib/officeOfflineCache";
import { cachePassage, passageRefFromUrl, prunePassages } from "@/lib/passageCache";
import { cacheImage, pruneImages } from "@/lib/imageCache";
import { VISIO_SCHEDULE } from "@/lib/visioSchedule";
import { artworkById } from "@/lib/visioSelect";
import type { LiturgyMode } from "@/pages/bcp-daily-office";

const WINDOW_DAYS = 30;
const LAST_RUN_KEY = "phoebe:office-prefetch:last-run-day";
// Small concurrency, not one big Promise.all — 30 days × up to 3 modes
// (morning/evening/compline) is up to 90 requests; firing them all at once
// would be a thundering herd against the office-assembly endpoint for no
// real benefit (nothing here is user-facing/blocking).
const CONCURRENCY = 3;

const MODE_ENDPOINT: Record<LiturgyMode, string> = {
  "morning": "/api/office/morning",
  "evening": "/api/office/evening",
  "compline": "/api/office/compline",
  "morning-devotion": "/api/devotion/morning",
  "early-evening-devotion": "/api/devotion/early-evening",
  "creation-morning": "/api/devotion/creation-morning",
  "creation-evening": "/api/devotion/creation-evening",
  // The scripture reading assembles like an office and is prefetched like one.
  // THIS MAP IS THE THIRD MIRROR of "which decks exist" — MODE_CONFIG and
  // MODE_START_PAGE in bcp-daily-office are the other two — and adding the
  // mode without it is what broke the client typecheck.
  "scripture": "/api/office/scripture",
  "sunday": "/api/office/sunday",
};

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ymdPlusDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Which LiturgyMode a side's current level maps to, if any — mirrors
// begin-prayer.tsx's own office/devotion routing. Only "office" and
// "devotion" are in scope (per owner: "Morning/Evening Prayer, Devotion,
// Compline") — every other level (psalms, fdd, readings, examen,
// guided-prayer, reflect-sit, creation, community, custom, ask) already
// has its own offline story or isn't a BCP office at all, so it's skipped.
function modeForSide(side: OfficeSide): LiturgyMode | null {
  const level = getSideLevel(side);
  return modeForLevel(side, level);
}

function modeForLevel(side: OfficeSide, level: string | null): LiturgyMode | null {
  if (level === "office") return side === "morning" ? "morning" : "evening";
  if (level === "devotion") return side === "morning" ? "morning-devotion" : "early-evening-devotion";
  /**
   * CREATION PRAYER — it had an endpoint in MODE_ENDPOINT and no way to reach
   * it. `creation` is a real side level (WayOfLoveRuleFlow's prayFromLevel
   * returns it, and /creation-devotion?mode=creation-<side> renders through the
   * same office deck), but this function returned null for it, so
   * fetchAndCacheOne was never called with "creation-morning" or
   * "creation-evening" — the two map entries existed and nothing ever asked for
   * them. Anyone whose office IS Creation Prayer had no offline copy at all,
   * while the code read as though they did.
   */
  if (level === "creation") return side === "morning" ? "creation-morning" : "creation-evening";
  return null;
}

/**
 * A side's SECOND practice, when it's an office form that this prefetch can
 * actually cache. Same in-scope rule as modeForSide — office/devotion only;
 * every other level has its own offline story or isn't a BCP office.
 *
 * Without this the extra practice was the ONE anchor-shaped card that had no
 * offline copy: the reader could open their morning office on a plane but not
 * the devotion they keep alongside it.
 */
function extraModeForSide(side: OfficeSide): LiturgyMode | null {
  const mode = modeForLevel(side, getSideExtra(side));
  // Never duplicate the anchor's own job — same mode, same cache key.
  return mode && mode !== modeForSide(side) ? mode : null;
}

// Same confession-param shape bcp-daily-office.tsx's load() computes, baked
// into the cache key so a live open and a prefetched entry are asking for
// (and agree on) the exact same rendered content.
function confessionFor(mode: LiturgyMode, side: OfficeSide): "" | "0" | "1" {
  if (mode !== "morning" && mode !== "evening") return "";
  const c = getSideConfession(side);
  return c === null ? "" : (c ? "1" : "0");
}

async function fetchAndCacheOne(mode: LiturgyMode, date: string, confession: "" | "0" | "1", track?: "1" | "2"): Promise<void> {
  /**
   * The scripture deck is warmed for the READINGS THE PERSON KEEPS.
   *
   * Same shape bcp-daily-office.tsx's load() computes: `parts` only when fewer
   * than four are on, in both the URL and the key. Warming the all-four deck
   * for someone who unchecked one would cache a day they will never be served
   * (their key differs), so they'd have no offline copy at all.
   */
  const parts = mode === "scripture" ? getScriptureParts() : null;
  const partsValue = parts && parts.length < 4 ? parts.join(",") : "";
  const key: OfficeCacheKey = { mode, date, confession, ...(partsValue ? { parts: partsValue } : {}), ...(track ? { track } : {}) };
  try {
    const endpoint = MODE_ENDPOINT[mode];
    const sep = endpoint.includes("?") ? "&" : "?";
    const confParam = confession ? `&confession=${confession}` : "";
    const partsParam = partsValue ? `&parts=${partsValue}` : "";
    const trackParam = track ? `&track=${track}` : "";
    const res = await fetch(`${endpoint}${sep}date=${date}&locale=en${confParam}${partsParam}${trackParam}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !Array.isArray(data.slides) || data.slides.length === 0) return;
    await putOfficeCacheEntry(key, data);
  } catch { /* best-effort — offline/slow/blocked, just skip this one day */ }
}

async function runQueue(jobs: Array<() => Promise<void>>): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < jobs.length) {
      const job = jobs[i++]!;
      await job();
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
}

/** Warm the offline office cache for the next WINDOW_DAYS, if due. Safe to
 *  call on every app open — no-ops instantly unless it's a new local day, the
 *  shell is native, and the device is on Wi-Fi. */
export async function runOfficePrefetch(): Promise<void> {
  try {
    if (!isNativeShell()) return;
    const today = todayYmd();
    if (localStorage.getItem(LAST_RUN_KEY) === today) return;
    // mymonastery never imports Capacitor plugins directly (it also runs as
    // a plain web build) — window.PhoebeNative is the one bridge every
    // native-only capability goes through. isOnWifi is absent on web and on
    // an app build older than this feature; either way, treat "can't tell"
    // as "don't risk cellular data" and skip.
    const isOnWifi = (window as unknown as { PhoebeNative?: { isOnWifi?: () => Promise<boolean> } }).PhoebeNative?.isOnWifi;
    if (!isOnWifi) return;
    const onWifi = await isOnWifi().catch(() => false);
    if (!onWifi) return;

    // Mark as run for today FIRST — a slow/partial prefetch (device walked
    // away, backgrounded, lost Wi-Fi mid-run) shouldn't retry the whole
    // window every single app open for the rest of the day.
    try { localStorage.setItem(LAST_RUN_KEY, today); } catch { /* ignore */ }

    void pruneOfficeCacheBefore(today);

    const morningMode = modeForSide("morning");
    const eveningMode = modeForSide("evening");
    const morningExtraMode = extraModeForSide("morning");
    const eveningExtraMode = extraModeForSide("evening");
    const jobs: Array<() => Promise<void>> = [];
    for (let i = 0; i < WINDOW_DAYS; i++) {
      const date = ymdPlusDays(i);
      if (morningMode) jobs.push(() => fetchAndCacheOne(morningMode, date, confessionFor(morningMode, "morning")));
      if (eveningMode) jobs.push(() => fetchAndCacheOne(eveningMode, date, confessionFor(eveningMode, "evening")));
      // A side's SECOND practice gets the same offline treatment as its anchor.
      if (morningExtraMode) jobs.push(() => fetchAndCacheOne(morningExtraMode, date, confessionFor(morningExtraMode, "morning")));
      if (eveningExtraMode) jobs.push(() => fetchAndCacheOne(eveningExtraMode, date, confessionFor(eveningExtraMode, "evening")));
      // Compline has no side/level of its own — always available every
      // evening, so always warmed regardless of either side's rule.
      jobs.push(() => fetchAndCacheOne("compline", date, ""));
      /**
       * The Daily Scripture Reading, on the same footing as Compline.
       *
       * MODE_ENDPOINT has carried "scripture" — with a comment saying it "is
       * prefetched like one" — while NOTHING ever requested it. It isn't a side
       * LEVEL (it opens from Practices as /bcp/daily-office?mode=scripture), so
       * modeForSide could never yield it, and the map entry sat inert. Warmed
       * unconditionally here for the same reason Compline is: it has no side of
       * its own and is available every day.
       */
      jobs.push(() => fetchAndCacheOne("scripture", date, ""));
    }
    /**
     * THE SUNDAY READINGS, for the next four Sundays, both tracks — the This
     * Sunday deck reads them by track, and its key carries the track.
     */
    for (let i = 0; i < WINDOW_DAYS; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      if (d.getDay() !== 0 || i > 28) continue;
      const date = ymdPlusDays(i);
      jobs.push(() => fetchAndCacheOne("sunday", date, "", "1"));
      jobs.push(() => fetchAndCacheOne("sunday", date, "", "2"));
    }
    if (jobs.length > 0) await runQueue(jobs);
    await warmReadersAndPictures(morningMode, eveningMode, morningExtraMode, eveningExtraMode);
  } catch { /* best-effort — never surface a prefetch failure to the user */ }
}

/**
 * THE READERS AND THE PICTURES (owner, 2026-09-05: "have oremus pages saved
 * for the future as well just like it saves the offices … make sure future
 * pictures are saved for the next 4 weeks, and future scriptures").
 *
 * Every lesson in the decks just cached is a title card whose readUrl opens
 * bible.oremus.org — so the office was "saved" while its readings were not.
 * Walk the cached decks for the coming four weeks, collect every passage they
 * open, and keep the text (lib/passageCache). Visio's schedule names a
 * picture and a reading for each day; keep both.
 */
const READER_WINDOW_DAYS = 28;
async function warmReadersAndPictures(...modes: Array<LiturgyMode | null>): Promise<void> {
  const refs = new Set<string>();
  const images = new Set<string>();
  for (let i = 0; i < READER_WINDOW_DAYS; i++) {
    const date = ymdPlusDays(i);
    const entries: OfficeCacheKey[] = [];
    for (const m of modes) if (m) entries.push({ mode: m, date, confession: confessionFor(m, m.startsWith("evening") || m === "early-evening-devotion" || m === "creation-evening" ? "evening" : "morning") });
    entries.push({ mode: "compline", date, confession: "" });
    const parts = getScriptureParts();
    const partsValue = parts && parts.length < 4 ? parts.join(",") : "";
    entries.push({ mode: "scripture", date, confession: "", ...(partsValue ? { parts: partsValue } : {}) });
    entries.push({ mode: "sunday", date, confession: "", track: "1" } as OfficeCacheKey);
    entries.push({ mode: "sunday", date, confession: "", track: "2" } as OfficeCacheKey);
    for (const key of entries) {
      const data = (await getOfficeCacheEntry(key)) as { slides?: Array<{ metadata?: { readUrl?: unknown; gospelReadUrl?: unknown } }> } | null;
      for (const s of data?.slides ?? []) {
        for (const u of [s?.metadata?.readUrl, s?.metadata?.gospelReadUrl]) {
          const ref = typeof u === "string" ? passageRefFromUrl(u) : null;
          if (ref) refs.add(ref);
        }
      }
    }
    const v = VISIO_SCHEDULE[date];
    if (v) {
      if (v.ref) refs.add(v.ref);
      const art = artworkById(v.id);
      if (art?.img) images.add(art.img);
    }
  }
  const jobs: Array<() => Promise<void>> = [];
  for (const ref of refs) jobs.push(async () => { await cachePassage(ref); });
  for (const img of images) jobs.push(async () => { await cacheImage(img); });
  if (jobs.length > 0) await runQueue(jobs);
  void prunePassages();
  void pruneImages();
}

/** Mounted once, app-wide (see App.tsx, alongside WidgetSync) — fires the
 *  prefetch on mount and lets runOfficePrefetch's own guards decide whether
 *  there's actually anything to do. */
export function OfficeOfflinePrefetch(): null {
  useEffect(() => {
    void runOfficePrefetch();
  }, []);
  return null;
}
