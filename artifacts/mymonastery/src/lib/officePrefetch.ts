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
import { boundedFetch } from "@/lib/boundedFetch";
import { isNativeShell } from "@/lib/isNativeShell";
import { isReallyOnline } from "@/lib/offline";
import { getSideLevel, getSideExtra, getSideConfession, getScriptureParts, type OfficeSide } from "@/lib/officePrefs";
import { putOfficeCacheEntry, pruneOfficeCacheBefore, getOfficeCacheEntry, type OfficeCacheKey } from "@/lib/officeOfflineCache";
import { passageRefFromUrl, purgeExtractedPassages } from "@/lib/passageCache";
import { cachePage, prunePagesExcept, prunePages } from "@/lib/pageCache";
import { cacheImage, pruneImages, pruneImagesExcept } from "@/lib/imageCache";
import { cacheDay, pruneDays, pruneDaysBefore } from "@/lib/dayContentCache";
import { VISIO_SCHEDULE } from "@/lib/visioSchedule";
import { artworkById, readingUrl } from "@/lib/visioSelect";
import type { LiturgyMode } from "@/pages/bcp-daily-office";

const WINDOW_DAYS = 30;
/**
 * The day-stamp is VERSIONED, and the version is bumped whenever a bug kept a
 * run from saving anything.
 *
 * The original code wrote this stamp BEFORE the first fetch and refused to run
 * off Wi-Fi, so on 2026-09-06 every device stamped the day and saved nothing —
 * and then skipped the rest of the day, including after both bugs were fixed.
 * The owner rebuilt three times and saw no change, because the fixed code was
 * being asked to do work the old code had already marked done. A new key name
 * gives every device exactly one more run today; tomorrow's date-check works
 * as it always did.
 */
const LAST_RUN_KEY = "phoebe:office-prefetch:last-run-day:v2";
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

async function fetchAndCacheOne(mode: LiturgyMode, date: string, confession: "" | "0" | "1", track?: "1" | "2"): Promise<boolean> {
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
    // Bounded: an unbounded call here stalls the whole sequential walk for up
    // to a minute per day on a dead-but-"connected" network (see boundedFetch).
    const res = await boundedFetch(`${endpoint}${sep}date=${date}&locale=en${confParam}${partsParam}${trackParam}`);
    if (!res.ok) return false;
    const data = await res.json();
    if (!data || !Array.isArray(data.slides) || data.slides.length === 0) return false;
    await putOfficeCacheEntry(key, data);
    return true;
  } catch { /* best-effort — offline/slow/blocked, just skip this one day */ }
  return false;
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
 *  call on every app open — no-ops instantly unless it's a new local day and
 *  the shell is native. TEXT saves on any connection; only the pictures wait
 *  for Wi-Fi (see the note inside). */
export async function runOfficePrefetch(opts?: { force?: boolean }): Promise<void> {
  try {
    // `force` is the Admin Tools button — save now, on this device, whatever
    // the day stamp says and wherever the app is running.
    if (!isNativeShell() && !opts?.force) return;
    const today = todayYmd();
    if (!opts?.force && localStorage.getItem(LAST_RUN_KEY) === today) return;
    /**
     * THE REAL CONNECTION, not the simulate-offline switch.
     *
     * isOnline() honours that switch, which is right for every surface a
     * person sees and wrong here: turn the switch on to walk the offline app
     * and the daily save stops running, so the phone stays empty and the tool
     * built to test offline is what breaks it. Saving asks the device.
     */
    if (!isReallyOnline()) return;
    /**
     * WI-FI GATES THE PICTURES, NOT THE WHOLE LAYER.
     *
     * This used to return unless the device was on Wi-Fi, so a person on
     * cellular all day — or whose Wi-Fi was asleep at the moment the app
     * opened — saved nothing, ever, and found out in Airplane Mode. The owner
     * did: his phone had no office at all on the day this was meant to hold
     * thirty. The intent was "never cost them data they didn't expect", and
     * that is about the BLOBS: a day of decks and passages is a few dozen KB,
     * one painting is megabytes. So the text saves on any connection and the
     * pictures wait for Wi-Fi.
     *
     * mymonastery never imports Capacitor plugins directly (it also runs as a
     * plain web build) — window.PhoebeNative is the one bridge. When it can't
     * answer, treat that as "not Wi-Fi": the text still saves, the pictures
     * wait for a launch where we can tell.
     */
    const isOnWifi = (window as unknown as { PhoebeNative?: { isOnWifi?: () => Promise<boolean> } }).PhoebeNative?.isOnWifi;
    const onWifi = isOnWifi ? await isOnWifi().catch(() => false) : false;

    /**
     * THE DAY IS STAMPED ON THE FIRST THING SAVED, not before the first fetch.
     *
     * It was stamped up front so a slow or interrupted run wouldn't re-walk
     * the window on every app open — but that meant a run which started and
     * then failed (connection dropped a second later, app backgrounded, a 500)
     * marked the day done with an empty cache and no retry until tomorrow.
     * Stamping on the first success keeps the original intent — one full walk
     * a day — while a run that saves nothing simply tries again next open.
     */
    let stamped = false;
    const noteSaved = () => {
      if (stamped) return;
      stamped = true;
      try { localStorage.setItem(LAST_RUN_KEY, today); } catch { /* ignore */ }
    };

    void pruneOfficeCacheBefore(today);

    const morningMode = modeForSide("morning");
    const eveningMode = modeForSide("evening");
    const morningExtraMode = extraModeForSide("morning");
    const eveningExtraMode = extraModeForSide("evening");
    const jobs: Array<() => Promise<void>> = [];
    for (let i = 0; i < WINDOW_DAYS; i++) {
      const date = ymdPlusDays(i);
      if (morningMode) jobs.push(async () => { if (await fetchAndCacheOne(morningMode, date, confessionFor(morningMode, "morning"))) noteSaved(); });
      if (eveningMode) jobs.push(async () => { if (await fetchAndCacheOne(eveningMode, date, confessionFor(eveningMode, "evening"))) noteSaved(); });
      // A side's SECOND practice gets the same offline treatment as its anchor.
      if (morningExtraMode) jobs.push(async () => { if (await fetchAndCacheOne(morningExtraMode, date, confessionFor(morningExtraMode, "morning"))) noteSaved(); });
      if (eveningExtraMode) jobs.push(async () => { if (await fetchAndCacheOne(eveningExtraMode, date, confessionFor(eveningExtraMode, "evening"))) noteSaved(); });
      // Compline has no side/level of its own — always available every
      // evening, so always warmed regardless of either side's rule.
      jobs.push(async () => { if (await fetchAndCacheOne("compline", date, "")) noteSaved(); });
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
      jobs.push(async () => { if (await fetchAndCacheOne("scripture", date, "")) noteSaved(); });
    }
    /**
     * THE SUNDAY READINGS, for the next four Sundays, both tracks — the This
     * Sunday deck reads them by track, and its key carries the track.
     */
    for (let i = 0; i < WINDOW_DAYS; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      if (d.getDay() !== 0 || i > 28) continue;
      const date = ymdPlusDays(i);
      jobs.push(async () => { if (await fetchAndCacheOne("sunday", date, "", "1")) noteSaved(); });
      jobs.push(async () => { if (await fetchAndCacheOne("sunday", date, "", "2")) noteSaved(); });
    }
    if (jobs.length > 0) await runQueue(jobs);
    await warmReadersAndPictures({ onWifi, noteSaved }, morningMode, eveningMode, morningExtraMode, eveningExtraMode);
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
/**
 * VISIO LOOKS FURTHER AHEAD — the owner asked for "the next month of Visio
 * pictures with the oremus readings behind them". The schedule holds one work
 * per WEEK, so five weeks is five or six pictures, not thirty-five.
 */
const VISIO_WINDOW_DAYS = 35;
/**
 * THE TWO PSALTERS THAT EXIST — "office" and "monthly" (officePrefs
 * getPsalmCycle). This asked for "daily", which is not one of them; the server
 * coerces an unknown cycle to "office" so the fetch SUCCEEDED, stamped the day
 * and saved 56 day-lists under a key the page would never ask for. Offline the
 * Psalms read "No psalms found for today".
 *
 * Both are saved rather than just the current one: the page carries a picker,
 * and switching psalter with no connection should not empty the screen.
 */
const PSALM_CYCLES = ["office", "monthly"] as const;
async function warmReadersAndPictures(ctx: { onWifi: boolean; noteSaved: () => void }, ...modes: Array<LiturgyMode | null>): Promise<void> {
  /**
   * THE PAGES THEMSELVES, not their text (owner, 2026-09-06: "you should not
   * be extracting text, that's a copyright issue … have the page downloaded
   * just like how Safari mobile has a read later"). We collect the reading
   * URLs the cached decks open and save each page whole; the native reader
   * loads the saved page and runs its own chrome over it, so the offline
   * reading is the online reading.
   */
  const pageUrls = new Set<string>();
  const images = new Set<string>();
  for (let i = 0; i < READER_WINDOW_DAYS; i++) {
    const date = ymdPlusDays(i);
    const entries: OfficeCacheKey[] = [];
    for (const m of modes) if (m) entries.push({ mode: m, date, confession: confessionFor(m, m.startsWith("evening") || m === "early-evening-devotion" || m === "creation-evening" ? "evening" : "morning") });
    entries.push({ mode: "compline", date, confession: "" });
    const parts = getScriptureParts();
    const partsValue = parts && parts.length < 4 ? parts.join(",") : "";
    entries.push({ mode: "scripture", date, confession: "", ...(partsValue ? { parts: partsValue } : {}) });
    // Only Sundays hold a Sunday deck — asking for the other six days was 168
    // reads that could never hit.
    if (new Date(`${date}T12:00:00`).getDay() === 0) {
      entries.push({ mode: "sunday", date, confession: "", track: "1" } as OfficeCacheKey);
      entries.push({ mode: "sunday", date, confession: "", track: "2" } as OfficeCacheKey);
    }
    for (const key of entries) {
      const data = (await getOfficeCacheEntry(key)) as { slides?: Array<{ metadata?: { readUrl?: unknown; gospelReadUrl?: unknown } }> } | null;
      for (const s of data?.slides ?? []) {
        for (const u of [s?.metadata?.readUrl, s?.metadata?.gospelReadUrl]) {
          // passageRefFromUrl is only the test for "is this a reading link";
          // what we save is the URL itself.
          if (typeof u === "string" && passageRefFromUrl(u)) pageUrls.add(u);
        }
      }
    }
  }
  // Visio's own window — the month ahead, pictures and the readings behind them.
  for (let i = 0; i < VISIO_WINDOW_DAYS; i++) {
    const v = VISIO_SCHEDULE[ymdPlusDays(i)];
    if (!v) continue;
    if (v.ref) { const u = readingUrl(v.ref); if (u) pageUrls.add(u); }
    const art = artworkById(v.id);
    if (art?.img) images.add(art.img);
  }
  const jobs: Array<() => Promise<void>> = [];
  for (const url of pageUrls) jobs.push(async () => { if (await cachePage(url)) ctx.noteSaved(); });
  // THE PICTURES ARE THE ONLY THING THAT WAITS FOR WI-FI — megabytes each,
  // where a day of text is a few dozen KB. On cellular the rest still saves
  // and the paintings arrive at the next launch on Wi-Fi.
  if (ctx.onWifi) for (const img of images) jobs.push(async () => { if (await cacheImage(img)) ctx.noteSaved(); });
  /**
   * …AND THE LISTS THAT MAKE THE DAY. Lectio offers a choice of the day's
   * three lessons and the Psalms page asks for the psalm appointed; both are
   * server calls, so a device with every passage saved still opened Lectio on
   * an empty picker. Kept for the same four weeks, and for both offices'
   * psalms since either page can be opened.
   */
  for (let i = 0; i < READER_WINDOW_DAYS; i++) {
    const date = ymdPlusDays(i);
    jobs.push(async () => { if (await cacheDay(`/api/lectio/today?date=${date}`)) ctx.noteSaved(); });
    for (const office of ["morning", "evening"] as const) {
      for (const cycle of PSALM_CYCLES) {
        jobs.push(async () => { if (await cacheDay(`/api/psalms/today?cycle=${cycle}&office=${office}&date=${date}`)) ctx.noteSaved(); });
      }
    }
  }
  if (jobs.length > 0) await runQueue(jobs);
  /**
   * THEN SWEEP WHAT IS BEHIND US. Once a day, connected: the past goes and the
   * window rolls forward (the fetches above skip what is already here, so each
   * run only adds the new far end). Day-lists and pictures are named exactly —
   * a date in the key, a URL in the schedule. Passages are keyed by reference,
   * not by date, and the same reading returns through the year, so those age
   * out instead of being swept.
   */
  void pruneDaysBefore(todayYmd());
  void prunePagesExcept(pageUrls);
  // The extracted text every device saved earlier today goes — it should not
  // have been stored at all.
  void purgeExtractedPassages();
  // Only when we actually fetched pictures this run — on cellular `images`
  // was never filled, and sweeping to it would delete every saved painting.
  if (ctx.onWifi) void pruneImagesExcept(images);
  void prunePages();
  void pruneImages();
  void pruneDays();
}

/** Mounted once, app-wide (see App.tsx, alongside WidgetSync) — fires the
 *  prefetch on mount and lets runOfficePrefetch's own guards decide whether
 *  there's actually anything to do. */
export function OfficeOfflinePrefetch(): null {
  useEffect(() => {
    void runOfficePrefetch();
    /**
     * …AND ON EVERY RETURN TO THE APP. This ran once per MOUNT, which on a
     * phone that is never force-quit means once per install: the WebView
     * stays alive across midnight, so the day rolls over and nothing is ever
     * saved again. The shell already announces every foreground as
     * phoebe:appactive (eight other components listen); the day-stamp guard
     * inside makes each extra call a no-op until the date actually changes.
     */
    const again = () => { void runOfficePrefetch(); };
    const onVisible = () => { if (document.visibilityState === "visible") again(); };
    window.addEventListener("phoebe:appactive", again);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("phoebe:appactive", again);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
