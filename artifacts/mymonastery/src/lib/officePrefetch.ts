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
import { sundayYmdsNY } from "@/lib/sundayDate";
import { passageRefFromUrl, purgeExtractedPassages } from "@/lib/passageCache";
import { cachePage, hasSavedPage, prunePagesExcept, prunePages } from "@/lib/pageCache";
import { cacheImage, hasCachedImage, pruneImages, pruneImagesExcept } from "@/lib/imageCache";
import { cacheDay, getCachedDay, pruneDays, pruneDaysBefore } from "@/lib/dayContentCache";
import { VISIO_SCHEDULE } from "@/lib/visioSchedule";
import { chooseArtwork, readingUrl } from "@/lib/visioSelect";
import type { LiturgyMode } from "@/pages/bcp-daily-office";

const WINDOW_DAYS = 30;
/** How many Sundays of readings the phone holds — the owner asked for four. */
const SUNDAYS_AHEAD = 4;
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
/**
 * THE DAY-STAMP CARRIES THE SAVING RULES, and moves when they do.
 *
 * v3: the page saver started inlining stylesheets (3e42d8d9) and pages saved
 * before that stopped counting as saved (f83e996e) — so every device holding
 * yesterday's pages needs a fresh walk, and the day-stamp would otherwise
 * have refused one until tomorrow. That is the second time a correctness fix
 * has been invisible for a day because THIS key said the work was done: bump
 * it whenever what a run SAVES changes, not only when a run's plumbing does.
 */
const LAST_RUN_KEY = "phoebe:office-prefetch:last-run-day:v4";
/** The day a pass found the whole window already on the device. While this is
 *  today, an open costs nothing at all. */
// v4: the Sunday decks moved from the key "next" to their own dates, so a
// phone stamped complete under v3 holds three empty Sundays and would not
// look again today. THE RULE: change WHAT is saved or HOW it is keyed and
// these stamps move with it, or the day-stamp blocks the very re-fetch the
// change needs.
const COMPLETE_KEY = "phoebe:office-prefetch:complete-day:v4";
/** …and while it is NOT complete, don't re-walk more often than this. */
const LAST_CHECK_KEY = "phoebe:office-prefetch:last-check";
const RECHECK_MS = 5 * 60 * 1000;
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

/** Wraps the saver so a pass can tell "already here" from "just fetched". */
async function fetchAndCacheOneCounting(
  mode: LiturgyMode, date: string, confession: "" | "0" | "1",
  counters: { noteFetched: () => void }, track?: "1" | "2",
): Promise<boolean> {
  const outcome = await fetchAndCacheOne(mode, date, confession, track);
  if (outcome !== "present") counters.noteFetched();
  return outcome === "saved";
}

async function fetchAndCacheOne(mode: LiturgyMode, date: string, confession: "" | "0" | "1", track?: "1" | "2"): Promise<"present" | "saved" | "failed"> {
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
  // Already here — the open costs one read and no network.
  if (await getOfficeCacheEntry(key)) return "present";
  try {
    const endpoint = MODE_ENDPOINT[mode];
    const sep = endpoint.includes("?") ? "&" : "?";
    const confParam = confession ? `&confession=${confession}` : "";
    const partsParam = partsValue ? `&parts=${partsValue}` : "";
    const trackParam = track ? `&track=${track}` : "";
    // Bounded: an unbounded call here stalls the whole sequential walk for up
    // to a minute per day on a dead-but-"connected" network (see boundedFetch).
    const res = await boundedFetch(`${endpoint}${sep}date=${date}&locale=en${confParam}${partsParam}${trackParam}`);
    /**
     * A DECK THIS ACCOUNT MAY NOT HAVE IS NOT A FAILURE. Compline is
     * beta-gated and answers 401/403 for most people — counted as failed, it
     * meant every pass "fetched something", so the window was never recorded
     * complete and every phone re-walked all thirty days on every open.
     */
    if (res.status === 401 || res.status === 403) return "present";
    if (!res.ok) return "failed";
    const data = await res.json();
    if (!data || !Array.isArray(data.slides) || data.slides.length === 0) return "failed";
    return (await putOfficeCacheEntry(key, data)) ? "saved" : "failed";
  } catch { /* best-effort — offline/slow/blocked, just skip this one day */ }
  return "failed";
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
    /**
     * EVERY OPEN ASKS WHETHER THE FOUR WEEKS ARE COMPLETE (owner, 2026-09-06:
     * "when the user opens the app it should be checking in the background if
     * it has everything saved for the next 4 weeks and start downloading what
     * it doesn't have").
     *
     * The old gate refused a second run on the same day, which is why a walk
     * interrupted halfway — or invalidated by a build that changed what it
     * saves — left gaps until tomorrow. Every saver here already skips what is
     * present, so a run on a complete device fetches nothing; the cost is a
     * few hundred IndexedDB reads. So: run unless we finished a complete pass
     * today, and never more often than once every few minutes.
     */
    if (!opts?.force) {
      if (localStorage.getItem(COMPLETE_KEY) === today) return;
      const last = Number(localStorage.getItem(LAST_CHECK_KEY) ?? 0);
      if (Number.isFinite(last) && Date.now() - last < RECHECK_MS) return;
    }
    try { localStorage.setItem(LAST_CHECK_KEY, String(Date.now())); } catch { /* ignore */ }
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
    /** Anything that had to be FETCHED this pass. Zero means the window was
     *  already whole, which is what lets an open be free. */
    let fetchedCount = 0;
    const noteFetched = () => { fetchedCount += 1; };
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
      if (morningMode) jobs.push(async () => { if (await fetchAndCacheOneCounting(morningMode, date, confessionFor(morningMode, "morning"), { noteFetched })) noteSaved(); });
      if (eveningMode) jobs.push(async () => { if (await fetchAndCacheOneCounting(eveningMode, date, confessionFor(eveningMode, "evening"), { noteFetched })) noteSaved(); });
      // A side's SECOND practice gets the same offline treatment as its anchor.
      if (morningExtraMode) jobs.push(async () => { if (await fetchAndCacheOneCounting(morningExtraMode, date, confessionFor(morningExtraMode, "morning"), { noteFetched })) noteSaved(); });
      if (eveningExtraMode) jobs.push(async () => { if (await fetchAndCacheOneCounting(eveningExtraMode, date, confessionFor(eveningExtraMode, "evening"), { noteFetched })) noteSaved(); });
      // Compline has no side/level of its own — always available every
      // evening, so always warmed regardless of either side's rule.
      jobs.push(async () => { if (await fetchAndCacheOneCounting("compline", date, "", { noteFetched })) noteSaved(); });
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
      jobs.push(async () => { if (await fetchAndCacheOneCounting("scripture", date, "", { noteFetched })) noteSaved(); });
    }
    /**
     * THE SUNDAY READINGS, for the next FOUR Sundays, both tracks — the This
     * Sunday deck reads them by track, and its key carries the track.
     *
     * It said "four Sundays" and saved one. The loop walked the window's
     * Sundays but passed the literal "next" every time, because the endpoint
     * ignored ?date= and had a single answer — so this fetched the coming
     * Sunday four times over and the other three were blank offline. The
     * endpoint takes a date now; each Sunday is saved under its own.
     *
     * The dates come from sundayYmdsNY, the same helper the deck asks with:
     * the RCL rolls over on New York's clock, and a viewer whose own Sunday
     * starts hours earlier must not key a deck the server would never build.
     */
    for (const sundayYmd of sundayYmdsNY(SUNDAYS_AHEAD)) {
      jobs.push(async () => { if (await fetchAndCacheOneCounting("sunday", sundayYmd, "", { noteFetched }, "1")) noteSaved(); });
      jobs.push(async () => { if (await fetchAndCacheOneCounting("sunday", sundayYmd, "", { noteFetched }, "2")) noteSaved(); });
    }
    if (jobs.length > 0) await runQueue(jobs);
    await warmReadersAndPictures({ onWifi, noteSaved, noteFetched }, morningMode, eveningMode, morningExtraMode, eveningExtraMode);
    /**
     * A PASS THAT FETCHED NOTHING found everything already here — record the
     * day, and the next open returns immediately. A pass that fetched
     * something might still have gaps (a failure, a page that timed out), so
     * it deliberately does NOT record completeness: the next open looks again.
     */
    // …and not while the pictures are still waiting for Wi-Fi: a cellular pass
    // fetches no images, so "nothing fetched" would freeze the day complete
    // with the paintings missing.
    if (fetchedCount === 0 && onWifi) {
      try { localStorage.setItem(COMPLETE_KEY, today); } catch { /* ignore */ }
    }
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
async function warmReadersAndPictures(ctx: { onWifi: boolean; noteSaved: () => void; noteFetched: () => void }, ...modes: Array<LiturgyMode | null>): Promise<void> {
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
    // The four Sunday decks are keyed by THEIR Sunday, not by the day being
    // walked, so they are read once for the whole window rather than on each
    // of its Sundays — the same eight entries, four times over.
    if (i === 0) {
      for (const sundayYmd of sundayYmdsNY(SUNDAYS_AHEAD)) {
        entries.push({ mode: "sunday", date: sundayYmd, confession: "", track: "1" } as OfficeCacheKey);
        entries.push({ mode: "sunday", date: sundayYmd, confession: "", track: "2" } as OfficeCacheKey);
      }
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
  /**
   * Visio's own window — the month ahead, pictures and the readings behind them.
   *
   * ASK THE SAME QUESTION THE PAGE ASKS. This read the schedule's id straight,
   * while visio.tsx resolves the day through chooseArtwork — and those two
   * answers part company exactly when a work is deleted at /admin/art-library:
   * artworkById refuses it (rightly — a deleted work must be unreachable), the
   * page substitutes one for the whole week, and this saved nothing at all. A
   * deletion would have quietly emptied a week of the offline practice.
   *
   * Empty lessons are the honest argument: for a scheduled day chooseArtwork
   * decides on the schedule and its week-level substitute, neither of which
   * reads them. Every one of the 1096 scheduled days resolves today, so this
   * changes nothing now; it is what keeps it true after a deletion.
   */
  for (let i = 0; i < VISIO_WINDOW_DAYS; i++) {
    const ymd = ymdPlusDays(i);
    if (!VISIO_SCHEDULE[ymd]) continue; // unscheduled days match on the day's lessons, which we don't have
    const chosen = chooseArtwork(ymd, []);
    // The substitute brings its OWN reading — saving the scheduled ref would
    // have paired next week's picture with a passage no one will open.
    if (chosen?.ref) { const u = readingUrl(chosen.ref); if (u) pageUrls.add(u); }
    if (chosen?.art?.img) images.add(chosen.art.img);
  }
  /**
   * TWO PASSES, because the second depends on the first: the day-lists must be
   * saved before Lectio's reading URLs are known, and those URLs are pages to
   * save. Everything that does not depend on a day-list runs in the first.
   */
  const jobs: Array<() => Promise<void>> = [];
  // THE PICTURES ARE THE ONLY THING THAT WAITS FOR WI-FI — megabytes each,
  // where a day of text is a few dozen KB. On cellular the rest still saves
  // and the paintings arrive at the next launch on Wi-Fi.
  if (ctx.onWifi) for (const img of images) jobs.push(async () => {
    if (await hasCachedImage(img)) return;
    ctx.noteFetched();
    if (await cacheImage(img)) ctx.noteSaved();
  });
  /**
   * …AND THE LISTS THAT MAKE THE DAY. Lectio offers a choice of the day's
   * three lessons and the Psalms page asks for the psalm appointed; both are
   * server calls, so a device with every passage saved still opened Lectio on
   * an empty picker. Kept for the same four weeks, and for both offices'
   * psalms since either page can be opened.
   */
  for (let i = 0; i < READER_WINDOW_DAYS; i++) {
    const date = ymdPlusDays(i);
    /**
     * LECTIO'S OWN READINGS. Its three lessons come from a day-list, not from
     * a cached deck, so the loop above — which harvests readUrls out of the
     * decks — never saw them: the picker was saved and the readings behind it
     * were not ("lectio divina is not loading readings offline"). Read the
     * day back after saving it and add its pages to the set.
     */
    jobs.push(async () => {
      const url = `/api/lectio/today?date=${date}`;
      if (!(await getCachedDay(url))) { ctx.noteFetched(); if (await cacheDay(url)) ctx.noteSaved(); }
      const day = await getCachedDay<{ options?: Array<{ readUrl?: unknown }> }>(url);
      for (const o of day?.options ?? []) {
        if (typeof o?.readUrl === "string" && passageRefFromUrl(o.readUrl)) pageUrls.add(o.readUrl);
      }
    });
    for (const office of ["morning", "evening"] as const) {
      for (const cycle of PSALM_CYCLES) {
        jobs.push(async () => {
          const u = `/api/psalms/today?cycle=${cycle}&office=${office}&date=${date}`;
          if (await getCachedDay(u)) return;
          ctx.noteFetched();
          if (await cacheDay(u)) ctx.noteSaved();
        });
      }
    }
  }
  if (jobs.length > 0) await runQueue(jobs);
  // …now the day-lists are here, so their readings can be saved too.
  const pageJobs = Array.from(pageUrls).map((url) => async () => {
    if (await hasSavedPage(url)) return;
    ctx.noteFetched();
    if (await cachePage(url)) ctx.noteSaved();
  });
  if (pageJobs.length > 0) await runQueue(pageJobs);
  /**
   * THEN SWEEP WHAT IS BEHIND US. Once a day, connected: the past goes and the
   * window rolls forward (the fetches above skip what is already here, so each
   * run only adds the new far end). Day-lists and pictures are named exactly —
   * a date in the key, a URL in the schedule. Passages are keyed by reference,
   * not by date, and the same reading returns through the year, so those age
   * out instead of being swept.
   */
  void pruneDaysBefore(todayYmd());
  // …only when this pass actually saw the window. A pass that found no decks
  // (a captive portal, a level just changed) would otherwise sweep every saved
  // page away — the prune-and-fetch rule again, from the other side.
  if (pageUrls.size >= 8) void prunePagesExcept(pageUrls);
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
