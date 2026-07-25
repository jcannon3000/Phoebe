import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  hasReadCacToday, hasReadFddToday, hasReadSsjeToday,
  CAC_READ_EVENT, FDD_READ_EVENT, SSJE_READ_EVENT,
  hasPrayedPsalmsToday, PSALMS_READ_EVENT,
  hasPrayedGuidedPrayerToday, GUIDED_PRAYER_READ_EVENT,
} from "@/lib/cacReadState";
import { hasPracticeDoneToday, PRACTICE_DONE_EVENT } from "@/lib/practiceCompletion";
import { getCustomAnchors, isCustomDoneToday, isCustomSkippedToday, CUSTOM_ANCHORS_EVENT, CUSTOM_DONE_EVENT, type CustomSlot, type ReadingConfig } from "@/lib/customAnchors";
import { OFFICE_DONE_EVENT } from "@/lib/officeManualLog";
import { getSideLevel, getExplicitSideLevel, getSideContemplation, getSideContemplationExplicit, useEffectiveReflectionSource, OFFICE_PREFS_EVENT } from "@/lib/officePrefs";
import { hasContemplationSideDoneToday, CONTEMPLATION_SIDE_DONE_EVENT, type ContemplationKind } from "@/lib/contemplationSideDone";

// The contemplative practice the user's rhythm is set to — the Creation Prayer
// breath or the silent sit. Read straight from localStorage (same key the
// `contemplationStyle` value below uses) so the per-side done-flag check can
// run inside state initializers/listeners that sit above that computation.
function currentContemplationKind(): ContemplationKind {
  try {
    return localStorage.getItem("phoebe:contemplation-style") === "cobreathe" ? "cobreathe" : "silent";
  } catch {
    return "silent";
  }
}
import { ROUTINE_SYNCED_EVENT } from "@/lib/routineSync";
import { useAuth } from "@/hooks/useAuth";
import { isDeviceLocalGuest } from "@/lib/guestFlag";
import { isFirstOpen } from "@/lib/firstOpen";
import { getGuestSilenceGoalMin } from "@/lib/guestSeed";
import { getGuestSilenceMinutesToday, GUEST_SILENCE_EVENT } from "@/lib/guestSilenceLog";
import { readCachedHomeLayout } from "@/lib/homeLayoutCache";

// How the user has chosen to pray the daily office — drives whether the
// Morning/Evening anchor reads "Prayer", "Devotion", or "Pray together".
export type PrayerKind = "office" | "devotion" | "community";

// ── useRhythmState ───────────────────────────────────────────────────────────
//
// The shared source of truth for "today's rhythm": the four daily anchors
// (Morning · Reflect · Silence · Evening) and the streak / garden counts.
// Extracted from the TodaysRhythm card so three surfaces can agree without
// duplicating the logic:
//   • TodaysRhythm (the full card — home was, now the closing slide + page)
//   • the header "Daily progress" pill (renders four dots from the done flags)
//   • the /daily-progress page
// Every queryKey matches what the dashboard / contemplation page already
// fetch, so React Query dedupes — calling this hook in several places adds no
// network. Reflection state is localStorage-only and live-updates off the
// read events the reflection cards fire.

function localDay(): string {
  return new Date().toLocaleDateString("en-CA");
}

// Did the user finish an office on a given side today, per the localStorage
// flags the office viewer writes synchronously (before the server query lands)?
function officeLocalDone(sides: string[]): boolean {
  const day = localDay();
  try {
    return sides.some((s) => localStorage.getItem(`phoebe:office-completed:${s}:${day}`) !== null);
  } catch {
    return false;
  }
}

export type RhythmState = {
  /** Have the done-state queries settled? Consumers fade in their first paint
   *  on this so the Next/Done split doesn't visibly reshuffle as data lands. */
  ready: boolean;
  morningDone: boolean;
  reflectDone: boolean;
  silenceDone: boolean;
  eveningDone: boolean;
  /** Whether the evening office is part of the rhythm (evening pref != "none").
   *  Off by default, so an un-set-up user's rhythm is 3 anchors, not 4. */
  eveningActive: boolean;
  /** Whether each core anchor is part of the rhythm: morning prayer (morning
   *  pref != "none"), contemplation (a goal is set), reflection (a source is
   *  chosen). A user who turns one off drops its card + dot + weekly row. */
  morningActive: boolean;
  silenceActive: boolean;
  /** The single aggregate silence GOAL card (a goal is set but neither per-side
   *  contemplation card is on) — its own dot in the pill, distinct from the two
   *  per-side contemplation dots. */
  soloSilenceActive: boolean;
  /** The silence GOAL card as the home actually RENDERS it: the solo card, OR
   *  the goal-progress card that rides ALONGSIDE per-side Creation Prayer
   *  cards (whose blurbs never show minutes). Dot/count consumers must use
   *  THIS (with silenceGoalCardDone), not soloSilenceActive, or the
   *  creation-style goal card has no dot. */
  silenceGoalCardActive: boolean;
  silenceGoalCardDone: boolean;
  /** The STANDALONE Co-Breathe card — false when per-side Creation Prayer
   *  cards replace it (DailyProgressBody suppresses the standalone card then,
   *  so a dot on bare cobreatheActive would have no card). */
  cobreatheStandaloneActive: boolean;
  /** Per-side Contemplative Prayer — the Morning / Evening Contemplation cards.
   *  Each is its own card, kept independently (a sit from one side's card clears
   *  that side; evening stays visible after the morning sit meets the goal). */
  morningContemplationActive: boolean;
  eveningContemplationActive: boolean;
  morningContemplationDone: boolean;
  eveningContemplationDone: boolean;
  reflectActive: boolean;
  /** Each reflection newsletter the user follows (cac/fdd/ssje) — one per chosen
   *  source, each its OWN card + dot + done-state. Empty when none chosen. */
  reflections: Array<{ source: "cac" | "fdd" | "ssje"; done: boolean }>;
  /** Optional practices the user added from the Customize flow (visible on the
   *  home layout) — each adds a checkmark to Daily progress. */
  examenActive: boolean;
  listeningActive: boolean;
  readingActive: boolean;
  podcastsActive: boolean;
  walkActive: boolean;
  cobreatheActive: boolean;
  prayerListActive: boolean;
  examenDone: boolean;
  listeningDone: boolean;
  readingDone: boolean;
  podcastsDone: boolean;
  walkDone: boolean;
  cobreatheDone: boolean;
  prayerListDone: boolean;
  /** User-defined custom practices (title + emoji + a per-day check) — each an
   *  extra anchor: shows as a Daily-progress card and counts as a dot. */
  customAnchors: Array<{ id: string; title: string; emoji: string; slot: CustomSlot; reading?: ReadingConfig; done: boolean; skipped: boolean }>;
  /** How many anchors exist for this user — the four core ones plus any
   *  active optional practices (gratitude / examen). The denominator of the
   *  "N of X kept" header. */
  totalAnchors: number;
  /** How many anchors are kept today (out of totalAnchors). */
  doneCount: number;
  streak: number;
  last7: number;
  keptToday: boolean;
  gardenCount: number;
  cobreatheCount: number;
  /** Office / Devotion / community — so the Morning & Evening labels match
   *  what the user actually prays (their Customize-home / Rule of Life pick). */
  prayerKind: PrayerKind;
  /** Today's contemplation minutes and the daily goal (0 = no goal) — for the
   *  Contemplation card's goal progress. */
  contemplationMin: number;
  contemplationGoalMin: number;
  /** The style a side's contemplation takes: a silent sit, or the Creation
   *  Prayer breath. Global (a side is office OR contemplation, so one flag
   *  covers whichever sides are contemplative). Drives per-side card naming +
   *  routing in DailyProgressBody. */
  contemplationStyle: "silent" | "cobreathe";
  /** "Grow my silence" ladder state when enabled (else null) — the current rung
   *  drives contemplationGoalMin; daysToNext/nextLevel feed the card. */
  silenceLadder: { level: number; levelDays: number; daysToNext: number; nextLevel: number; atMax: boolean } | null;
};

// Is an optional-practice card surfaced on the user's home layout? A card
// counts as active when the layout is the current version AND the key is in
// the saved order and NOT hidden — the same rule the dashboard applies. Cards
// absent from the order are opt-in-hidden, so a user who never added
// gratitude/examen has no extra anchor.
function homeCardActive(
  homeLayout: { order?: string[]; hidden?: string[]; v?: number } | null | undefined,
  key: string,
): boolean {
  // Honor the saved layout REGARDLESS of version — a version mismatch must never
  // silently drop a card the user added (the recurring "I lost my practice on a
  // code change" bug). The home reconciles new/removed modules by merging.
  if (!homeLayout) return false;
  const order = homeLayout.order ?? [];
  const hidden = new Set(homeLayout.hidden ?? []);
  return order.includes(key) && !hidden.has(key);
}

export function useRhythmState(): RhythmState {
  const day = localDay();
  const { user, isLoading: authLoading } = useAuth();
  // PUBLIC no-login version: a guest (flag on, auth settled, signed out OR the
  // anonymous device user) runs the WHOLE rhythm on device-local state — every
  // server query below is off, `ready` doesn't wait on them, the home layout
  // comes from the local cache the guest customizer writes, and the silence
  // goal/minutes come from the guest keys. The anonymous user exists only for
  // push — treating it as signed-in put fresh devices on empty server prefs
  // (no Silence card, the legacy no-layout Co-Breathe default). Flag off, or
  // any REAL signed-in account, and nothing changes.
  // On a genuine FIRST launch there can be no prior session, so don't wait out
  // the /api/auth/me round-trip before treating this as the device-local guest
  // — the seeded rhythm paints instantly from local state instead of blanking
  // until auth settles. Once auth resolves it's the anonymous device user, so
  // `guest` stays true; a real signed-in account is impossible on a first open.
  const guest = (!authLoading || isFirstOpen()) && isDeviceLocalGuest(user);
  // The layout that decides which optional cards are active: the signed-in
  // user's server layout, or — for a guest — the device-local cache.
  const hl = guest ? readCachedHomeLayout() : user?.homeLayout;

  // Reflection read-state. localStorage is per-device and flips instantly, but
  // doesn't sync across devices (read CAC on mobile → web wouldn't know). CAC
  // reads are also logged server-side, so we OR in a server check below; the
  // local flags keep the anchor responsive on the device that did the reading.
  const [reflectLocal, setReflectLocal] = useState(
    () => hasReadCacToday() || hasReadFddToday() || hasReadSsjeToday(),
  );
  // FDD / Psalms / Simple Guided Prayer used AS a side's morning/evening PRAYER
  // (not just a reflection) must light that side's done-state. Tracked
  // reactively with the same robust return-to-app signals as the reflection
  // read-state.
  const [prayerRead, setPrayerRead] = useState(() => ({
    fdd: hasReadFddToday(),
    psalmsMorning: hasPrayedPsalmsToday("morning"), psalmsEvening: hasPrayedPsalmsToday("evening"),
    guidedPrayerMorning: hasPrayedGuidedPrayerToday("morning"), guidedPrayerEvening: hasPrayedGuidedPrayerToday("evening"),
  }));
  useEffect(() => {
    const recheck = () => {
      setReflectLocal(hasReadCacToday() || hasReadFddToday() || hasReadSsjeToday());
      setPrayerRead({
        fdd: hasReadFddToday(),
        psalmsMorning: hasPrayedPsalmsToday("morning"), psalmsEvening: hasPrayedPsalmsToday("evening"),
        guidedPrayerMorning: hasPrayedGuidedPrayerToday("morning"), guidedPrayerEvening: hasPrayedGuidedPrayerToday("evening"),
      });
    };
    // The reflection is read on a separate surface (often the in-app browser),
    // which stamps localStorage + fires a read-event. We re-check on those
    // events, but iOS WebViews don't fire `visibilitychange` reliably when the
    // in-app browser is dismissed — so the anchor "sometimes" didn't flip on
    // return. Listen on the broader set of return-to-app signals (focus,
    // pageshow, the native resume event) plus the storage event so the check
    // is robust however the read landed.
    window.addEventListener(CAC_READ_EVENT, recheck);
    window.addEventListener(FDD_READ_EVENT, recheck);
    window.addEventListener(SSJE_READ_EVENT, recheck);
    window.addEventListener(PSALMS_READ_EVENT, recheck);
    window.addEventListener(GUIDED_PRAYER_READ_EVENT, recheck);
    window.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("storage", recheck);
    // Native shell signals: the app returning to the foreground, and — the
    // important one for reflections — the in-app browser being dismissed
    // (a reflection opened externally stamps read-state, then fires this).
    window.addEventListener("phoebe:appactive", recheck);
    window.addEventListener("phoebe:browserfinished", recheck);
    // A cross-device routine sync rewrote the local office levels / slots — force
    // a re-read so the cards reflect the synced rhythm (lib/routineSync).
    window.addEventListener(ROUTINE_SYNCED_EVENT, recheck);
    // A goal changed in-document (e.g. a guest sets a silence goal) — the
    // `storage` event only fires cross-tab, so without this the home wouldn't
    // grow the new goal card until a reload. OFFICE_PREFS_EVENT
    // and GUEST_SILENCE_EVENT fire same-document; recheck's fresh setState forces
    // the re-render that re-reads the (device-local) goals.
    window.addEventListener(OFFICE_PREFS_EVENT, recheck);
    window.addEventListener(GUEST_SILENCE_EVENT, recheck);
    return () => {
      window.removeEventListener(CAC_READ_EVENT, recheck);
      window.removeEventListener(FDD_READ_EVENT, recheck);
      window.removeEventListener(SSJE_READ_EVENT, recheck);
      window.removeEventListener(PSALMS_READ_EVENT, recheck);
      window.removeEventListener(GUIDED_PRAYER_READ_EVENT, recheck);
      window.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("storage", recheck);
      window.removeEventListener("phoebe:appactive", recheck);
      window.removeEventListener("phoebe:browserfinished", recheck);
      window.removeEventListener(ROUTINE_SYNCED_EVENT, recheck);
      window.removeEventListener(OFFICE_PREFS_EVENT, recheck);
      window.removeEventListener(GUEST_SILENCE_EVENT, recheck);
    };
  }, []);

  // Optional-practice completion (gratitude / examen). Instant local flags flip
  // the anchor the moment the user finishes; we re-check on the shared event +
  // return-to-app signals, and OR in the server rows below for cross-device.
  const [practiceLocal, setPracticeLocal] = useState(() => ({
    examen: hasPracticeDoneToday("examen"),
    listening: hasPracticeDoneToday("listening"),
    reading: hasPracticeDoneToday("reading"),
    podcasts: hasPracticeDoneToday("podcasts"),
    walk: hasPracticeDoneToday("walk"),
    prayerList: hasPracticeDoneToday("prayer-list"),
  }));
  useEffect(() => {
    const recheck = () => setPracticeLocal({
      examen: hasPracticeDoneToday("examen"),
      listening: hasPracticeDoneToday("listening"),
      reading: hasPracticeDoneToday("reading"),
      podcasts: hasPracticeDoneToday("podcasts"),
      walk: hasPracticeDoneToday("walk"),
      prayerList: hasPracticeDoneToday("prayer-list"),
    });
    window.addEventListener(PRACTICE_DONE_EVENT, recheck);
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("storage", recheck);
    window.addEventListener("phoebe:appactive", recheck);
    // Guest silence log — a finished guest sit writes device-local minutes and
    // fires this; the recheck's fresh state object re-renders the hook so the
    // guest contemplationMin below re-reads the tally.
    window.addEventListener(GUEST_SILENCE_EVENT, recheck);
    return () => {
      window.removeEventListener(PRACTICE_DONE_EVENT, recheck);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("storage", recheck);
      window.removeEventListener("phoebe:appactive", recheck);
      window.removeEventListener(GUEST_SILENCE_EVENT, recheck);
    };
  }, []);

  // Custom user-defined practices (title + emoji + a per-day check). Re-read the
  // list AND each check on the custom-anchor events + return-to-app signals so a
  // tick — here or on another surface — flips the dot live.
  const [customAnchors, setCustomAnchors] = useState(() =>
    getCustomAnchors().map((a) => ({ ...a, done: isCustomDoneToday(a.id), skipped: isCustomSkippedToday(a.id) })),
  );
  useEffect(() => {
    const recheck = () =>
      setCustomAnchors(getCustomAnchors().map((a) => ({ ...a, done: isCustomDoneToday(a.id), skipped: isCustomSkippedToday(a.id) })));
    window.addEventListener(CUSTOM_ANCHORS_EVENT, recheck);
    window.addEventListener(CUSTOM_DONE_EVENT, recheck);
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("storage", recheck);
    window.addEventListener("phoebe:appactive", recheck);
    return () => {
      window.removeEventListener(CUSTOM_ANCHORS_EVENT, recheck);
      window.removeEventListener(CUSTOM_DONE_EVENT, recheck);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("storage", recheck);
      window.removeEventListener("phoebe:appactive", recheck);
    };
  }, []);

  // Office completion — the instant local flags the office viewer AND the
  // physical-book quick-log write. ORed with the server office-history below;
  // the local flag flips the anchor the moment the office is logged, and the
  // OFFICE_DONE_EVENT lets an in-place quick-log refresh the home without a nav.
  const [officeLocal, setOfficeLocal] = useState(() => ({
    morning: officeLocalDone(["morning", "morning-devotion"]),
    evening: officeLocalDone(["evening", "early-evening-devotion", "compline"]),
  }));
  useEffect(() => {
    const recheck = () => setOfficeLocal({
      morning: officeLocalDone(["morning", "morning-devotion"]),
      evening: officeLocalDone(["evening", "early-evening-devotion", "compline"]),
    });
    window.addEventListener(OFFICE_DONE_EVENT, recheck);
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("storage", recheck);
    window.addEventListener("phoebe:appactive", recheck);
    return () => {
      window.removeEventListener(OFFICE_DONE_EVENT, recheck);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("storage", recheck);
      window.removeEventListener("phoebe:appactive", recheck);
    };
  }, []);

  // Per-side contemplation completion (which side's sit is kept today) — its
  // own day-flag so an undone evening sit stays in Next even after the morning
  // sit met the daily minutes goal. The flag is matched against the user's
  // contemplation STYLE: a side styled as Creation Prayer (the Co-Breathe
  // breath) is only kept by the breath, and a side styled as the silent sit is
  // only kept by a silent sit — they're different practices, so keeping one
  // must not tick the other's card. (Legacy flags carry no kind and satisfy
  // either, so a day already kept before this shipped doesn't flip back.)
  const [contemplationSideDone, setContemplationSideDone] = useState(() => ({
    morning: hasContemplationSideDoneToday("morning", currentContemplationKind()),
    evening: hasContemplationSideDoneToday("evening", currentContemplationKind()),
  }));
  useEffect(() => {
    const recheck = () => setContemplationSideDone({
      morning: hasContemplationSideDoneToday("morning", currentContemplationKind()),
      evening: hasContemplationSideDoneToday("evening", currentContemplationKind()),
    });
    window.addEventListener(CONTEMPLATION_SIDE_DONE_EVENT, recheck);
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("storage", recheck);
    window.addEventListener("phoebe:appactive", recheck);
    return () => {
      window.removeEventListener(CONTEMPLATION_SIDE_DONE_EVENT, recheck);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("storage", recheck);
      window.removeEventListener("phoebe:appactive", recheck);
    };
  }, []);

  const { data: officeHistory } = useQuery<{ days: Array<{ ymd: string; morning: boolean; evening: boolean }> }>({
    queryKey: ["/api/me/office-history-week"],
    queryFn: () => apiRequest("GET", "/api/me/office-history-week"),
    staleTime: 30_000,
    enabled: !guest,
  });

  // Server-backed completion rows for the optional practices (cross-device).
  // Only fetched/used for the practices the user has actually added.
  const examenActive = homeCardActive(hl, "examen");
  // Audio Divina (listening as a way of prayer) is live as a logging-first
  // practice — it appears ONLY when the user selects it in the customizer
  // (homeCardActive reads the saved home layout).
  const listeningActive = homeCardActive(hl, "listening");
  // Reading + Podcasts — logging-first practices added from the "Add to your
  // day" step; each its own home card + dot.
  const readingActive = homeCardActive(hl, "reading");
  const podcastsActive = homeCardActive(hl, "podcasts");
  // Contemplative Walk — a slotted contemplative practice, logged like reading.
  const walkActive = homeCardActive(hl, "walk");
  // Co-Breathe as a standalone anchor — added from the customizer's contemplative
  // step at a chosen time of day (separate from picking Co-Breathe as a side's
  // contemplation STYLE). Its done-state comes from /api/breath/today below.
  // On by default for an un-set-up user (no saved home layout) — Co-Breathe is
  // part of the starter rhythm (Prayer List · Contemplation · CAC · Silence ·
  // Co-Breathe). Once the user customizes, the saved layout decides. GUESTS are
  // the exception: their seeded rule (M/E Office · FDD · silence goal) has no
  // Co-Breathe — it appears only if their customizer adds it to the layout.
  const cobreatheActive = homeCardActive(hl, "cobreathe") || (!guest && !user?.homeLayout);
  // Personal prayer list — a logging-first practice (prayed through its
  // slideshow); appears only when selected in the customizer AND only when the
  // prayer-request feature is available to this account (pilot-group-only,
  // 2026-07-22). Gated here at the source so every consumer — the home card,
  // the menu progress ring, the weekly grid — treats it as inactive at once.
  const prayerRequestsEnabled = !!user?.inPilotGroup || !!user?.isSuperAdmin;
  const prayerListActive = prayerRequestsEnabled && homeCardActive(hl, "prayer-list");
  const anyExtraActive = examenActive || listeningActive || readingActive || podcastsActive || walkActive || prayerListActive;
  // Server filters rows on weekStart >= since, and today's row carries THIS
  // week's Sunday as weekStart — so we ask from the week start, then match the
  // exact localDate below. (Passing today would drop the row on any non-Sunday.)
  const weekStartDay = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay());
    return d.toLocaleDateString("en-CA");
  }, []);
  const { data: completions } = useQuery<{ completions: Array<{ section: string; localDate: string }> }>({
    queryKey: ["/api/practice-completion", weekStartDay],
    queryFn: () => apiRequest("GET", `/api/practice-completion?since=${weekStartDay}`),
    staleTime: 30_000,
    enabled: anyExtraActive && !guest,
  });
  const serverDone = (section: string) =>
    !!completions?.completions?.some((c) => c.section === section && c.localDate === day);

  // Local midnight of `day` (which is recomputed from the wall clock on every
  // render), NOT a value frozen at mount. If the app stays alive across midnight
  // — backgrounded overnight on iOS, then reopened — a mount-time `useMemo([])`
  // would keep yesterday's date in BOTH the query key and the server's
  // `todaySince` param, so contemplation-stats would keep serving/counting
  // yesterday's minutes ("residual minutes from yesterday on today's routine").
  // Deriving from `day` re-keys + refetches with today's boundary the moment the
  // date rolls over (a `recheck` re-render on app resume triggers it).
  const todaySince = useMemo(() => {
    const [y, mo, d] = day.split("-").map(Number);
    return new Date(y, mo - 1, d, 0, 0, 0, 0).toISOString();
  }, [day]);
  const tz = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
  }, []);
  const { data: contStats } = useQuery<{ todaySeconds: number }>({
    queryKey: ["/api/me/contemplation-stats", todaySince.slice(0, 10), tz],
    queryFn: () => apiRequest("GET", `/api/me/contemplation-stats?todaySince=${encodeURIComponent(todaySince)}&tz=${encodeURIComponent(tz)}`),
    staleTime: 30_000,
    enabled: !guest,
  });

  const { data: cobreathe } = useQuery<{ done: boolean; count: number }>({
    queryKey: ["/api/breath/today", day],
    queryFn: () => apiRequest("GET", `/api/breath/today?day=${day}`),
    staleTime: 60_000,
    enabled: !guest,
  });

  const { data: rhythm } = useQuery<{ streak: number; last7: number; keptToday: boolean }>({
    queryKey: ["/api/me/prayer-days", tz],
    queryFn: () => apiRequest("GET", `/api/me/prayer-days?tz=${encodeURIComponent(tz)}`),
    staleTime: 60_000,
    enabled: !guest,
  });

  // Cross-device per-side contemplation done — the server echo of the
  // localStorage day-flags (a sit posts its resolved side with the session;
  // this reads it back), so a sit done on the iPhone shows done on the web.
  // ORed with the local flags below; signed-in only (guests are one-device).
  // `kind` narrows the echo to the practice this rhythm's contemplative sides
  // are actually set to, so a silent sit never reports a Creation Prayer side
  // kept (and vice versa) — the server-side half of the same rule the local
  // day-flags follow.
  const sidesTodayKind = currentContemplationKind();
  const { data: sidesToday } = useQuery<{ morning: boolean; evening: boolean }>({
    // Date-scoped so a day rollover always re-fetches rather than serving a
    // pre-midnight cached answer (same reasoning as contemplation-stats' key).
    queryKey: ["/api/me/contemplation-sides-today", tz, day, sidesTodayKind],
    queryFn: () => apiRequest("GET", `/api/me/contemplation-sides-today?tz=${encodeURIComponent(tz)}&kind=${sidesTodayKind}`),
    staleTime: 60_000,
    enabled: !guest && !!user,
  });

  const { data: prayerStreak } = useQuery<{ gardenPrayedTodayCount?: number }>({
    queryKey: ["/api/prayer-streak"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak"),
    staleTime: 60_000,
    enabled: !guest,
  });

  // Server-backed reflection reads (CAC + FDD + SSJE) for today — so the
  // Reflect anchor is correct on a device that didn't do the reading (e.g. web,
  // after reading on mobile). OR'd with the instant local flag below.
  const { data: reflRead } = useQuery<{ cac: boolean; fdd: boolean; ssje: boolean }>({
    queryKey: ["/api/me/reflections-read", day],
    queryFn: () => apiRequest("GET", `/api/me/reflections-read?ymd=${day}`),
    staleTime: 60_000,
    enabled: !guest,
  });

  const reflectDone = reflectLocal || !!reflRead?.cac || !!reflRead?.fdd || !!reflRead?.ssje;

  // What the user prays for the office — global default (office-prefs) OR a
  // per-side override. Mirrors the home prayer card's resolution, so the
  // Morning/Evening anchors read "Devotion"/"Prayer"/"Pray together" to match.
  const { data: officePrefs } = useQuery<{ defaultPrayerLevel?: "devotion" | "office" | "intercessions"; contemplationGoalMinutes?: number; dailyStepGoal?: number; dailyStepReachedDate?: string | null; morning?: string; evening?: string }>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs"),
    staleTime: 60_000,
    enabled: !guest,
  });
  // "Grow my silence" ladder — the GET also runs the server-side daily catch-up
  // eval (advancing / easing the rung) and returns the authoritative current
  // rung. Only fetched when the user has the ladder enabled; `day` in the key
  // refetches each local day so the eval runs once a day.
  const ladderEnabled = !!user?.silenceLadder?.enabled;
  const { data: ladderData } = useQuery<{ enabled: boolean; level?: number; levelDays?: number; daysToNext?: number; nextLevel?: number; atMax?: boolean }>({
    queryKey: ["/api/me/silence-ladder", day],
    queryFn: () => apiRequest("GET", "/api/me/silence-ladder"),
    enabled: ladderEnabled,
    staleTime: 60_000,
  });
  const dpl = officePrefs?.defaultPrayerLevel;
  const ml = getSideLevel("morning");
  const el = getSideLevel("evening");
  const prayerKind: PrayerKind =
    (dpl === "office" || ml === "office" || el === "office") ? "office"
    : (dpl === "devotion" || ml === "devotion" || el === "devotion") ? "devotion"
    : (dpl === "intercessions" || ml === "intercessions" || el === "intercessions") ? "community"
    : "devotion";

  const todayOffice = officeHistory?.days?.[officeHistory.days.length - 1];
  // A side is kept when the practice that side is SET TO has been done. Every
  // level that can be a side's prayer needs a clause here — a missing one means
  // that side can never be marked kept and its dot stays unlit forever, which
  // is exactly what happened to `examen` and `creation` (reflect-sit): they
  // were selectable as a side's prayer but had no clause, so the card was
  // permanently open. `examen` is tracked by the shared practice flag;
  // `reflect-sit`/creation by the per-side contemplation day-flag (which, since
  // today, also carries WHICH contemplative practice was kept).
  const examenKept = practiceLocal.examen || serverDone("examen");
  // Same expression as morning/eveningContemplationDone below — inlined because
  // those are declared further down (after the per-side active flags) and this
  // block runs first.
  const morningSatKept = contemplationSideDone.morning || !!sidesToday?.morning;
  const eveningSatKept = contemplationSideDone.evening || !!sidesToday?.evening;
  const morningDone = !!todayOffice?.morning || officeLocal.morning
    || (ml === "fdd" && prayerRead.fdd) || (ml === "psalms" && prayerRead.psalmsMorning)
    || (ml === "guided-prayer" && prayerRead.guidedPrayerMorning)
    || (ml === "examen" && examenKept)
    || (ml === "reflect-sit" && morningSatKept);
  const eveningDone = !!todayOffice?.evening || officeLocal.evening
    || (el === "fdd" && prayerRead.fdd) || (el === "psalms" && prayerRead.psalmsEvening)
    || (el === "guided-prayer" && prayerRead.guidedPrayerEvening)
    || (el === "examen" && examenKept)
    || (el === "reflect-sit" && eveningSatKept);

  // Contemplation (was "Silence"): today's minutes = Phoebe in-app sits only
  // (a Cobreathe breath logs a contemplation sit, so it's already counted
  // here). It only counts as KEPT once the daily goal is met — if no goal is
  // set, any silence counts. GUESTS can't post prayer_sessions — their minutes
  // come from the device-local sit tally.
  const contemplationMin = guest
    ? getGuestSilenceMinutesToday()
    : Math.floor((contStats?.todaySeconds ?? 0) / 60);
  const rawGoalMin = officePrefs?.contemplationGoalMinutes ?? 0;
  // Starter rule: an un-set-up user (no saved home layout) gets a 5-minute
  // silence by default — alongside Morning/Evening Psalms + Forward Day by Day.
  // Once they customize (which writes a home layout) their chosen goal wins,
  // including 0 = "no daily goal". The column's DB default is 0, so the value
  // alone can't tell uncustomized-0 from chosen-0 — the home layout is the
  // "have they designed a rule yet?" signal (same as the reflection fallback).
  // When the ladder is on, the current rung IS the goal (the ladder GET just
  // re-evaluated it). Otherwise a saved goal, or the 5-minute starter default.
  // GUESTS have no server pref or ladder — the goal is the device-local guest
  // key (seeded at 5 min; the guest customizer's silence step rewrites it).
  const ladderLevel = ladderEnabled && typeof ladderData?.level === "number" ? ladderData.level : null;
  const contemplationGoalMin = guest
    ? getGuestSilenceGoalMin()
    : ladderLevel != null ? ladderLevel : ((!hl && rawGoalMin === 0) ? 5 : rawGoalMin);

  const examenDone = examenActive && (practiceLocal.examen || serverDone("examen"));
  const listeningDone = listeningActive && (practiceLocal.listening || serverDone("listening"));
  const readingDone = readingActive && (practiceLocal.reading || serverDone("reading"));
  const podcastsDone = podcastsActive && (practiceLocal.podcasts || serverDone("podcasts"));
  const walkDone = walkActive && (practiceLocal.walk || serverDone("walk"));
  const prayerListDone = prayerListActive && (practiceLocal.prayerList || serverDone("prayer-list"));
  // Co-Breathe is kept once a sit is completed today (server-tracked).
  const cobreatheDone = cobreatheActive && (cobreathe?.done ?? false);

  // The four core anchors plus whichever optional practices the user added.
  // Evening is an OPT-IN anchor — off by default (evening office pref "none"),
  // so an un-set-up user keeps three dots: morning · contemplation · reflection.
  // The customizer (rule-of-life) sets the evening pref to a level when enabled,
  // which flips this on. While prefs load, treat evening as off (no flash).
  // Each core anchor is part of the rhythm only when the user keeps it:
  // morning/evening prayer when the office pref isn't "none", contemplation
  // when a goal is set, reflection when a source is chosen. While prefs load we
  // fall back to each anchor's SERVER default (morning "devotion", goal 5 min,
  // reflection on, evening off) so the default-on anchors don't pop in once the
  // prefs query lands — only the genuinely-off ones stay hidden.
  const reflectionSource = useEffectiveReflectionSource();
  // Whether an office is part of the rhythm must come from its CHOSEN LEVEL
  // (set by the customizer's setSideLevel), NOT the `morning`/`evening` reminder
  // field — `commit` writes that reminder field to "none" whenever the user
  // declines a reminder, which was hiding the office anchor for anyone who
  // picked the office but no reminder. A real level (anything but "ask"/"none")
  // means the office is in the rhythm; otherwise fall back to the server pref
  // (cross-device + the un-set-up morning-on default).
  // A chosen office level (anything but the "ask"/not-chosen sentinel or null)
  // means the office is in the rhythm. null falls back to the server pref.
  const isActiveLevel = (l: typeof ml) => l != null && l !== "ask";
  // For "is this side part of the rhythm?" use the EXPLICIT level (null unless the
  // user actually chose one) — NOT getSideLevel, whose new-user defaults
  // (morning "intercessions", evening "reflect-sit") are active levels and would
  // force a side on even after the user turned it OFF in the customizer.
  const mlExplicit = getExplicitSideLevel("morning");
  const elExplicit = getExplicitSideLevel("evening");
  // Has the user designed a rule yet? A saved home layout is ONE signal (for a
  // guest, the device-local cached layout their customizer writes) — but the
  // basic /customize page sets an explicit per-side level directly WITHOUT
  // ever saving a home layout, so an explicit level on either side counts too.
  // Without this, turning a side OFF ("ask") via the basic customizer had no
  // effect: customized stayed false, the fallback branch below ignored the
  // explicit "ask" and kept the side on anyway (a stale default masquerading
  // as "the office is still your prayer").
  const customized = !!hl || mlExplicit != null || elExplicit != null;
  // A side a CUSTOMIZED user explicitly set on THIS device is authoritative —
  // "ask" means they turned it off, and that wins even over a stale server pref
  // (e.g. an office-prefs PUT that was dropped). With no explicit local level we
  // fall back to the cross-device server pref (off unless it's a real office).
  // Un-set-up users keep the starter rule (Morning + Evening on by default).
  const morningActive = customized
    ? (mlExplicit != null ? isActiveLevel(mlExplicit) : ((officePrefs?.morning ?? null) != null && officePrefs?.morning !== "none"))
    : (isActiveLevel(ml) || (officePrefs?.morning ?? "devotion") !== "none");
  const eveningActive = customized
    ? (elExplicit != null ? isActiveLevel(elExplicit) : ((officePrefs?.evening ?? null) != null && officePrefs?.evening !== "none"))
    : (isActiveLevel(el) || (officePrefs?.evening ?? "devotion") !== "none");
  // Per-side Contemplative Prayer → the home's Morning / Evening Contemplation
  // cards. A per-side card appears ONLY when the user EXPLICITLY chose
  // Contemplative Prayer on that side in the customizer (which writes the
  // per-side flag). A plain minutes goal with NO per-side pick is NOT a per-side
  // card — it renders as the single "solo silence" goal card below (the same
  // shape guests / logged-out users see), so the two views stay consistent.
  //
  // This deliberately does NOT auto-migrate a bare goal into BOTH per-side cards.
  // That old behavior added a phantom "Morning Contemplation" on login: the
  // per-side flags are device-local (not server-synced), so a signed-in user's
  // fresh session has none set, and the office-prefs GET default goal (5) then
  // flipped both sides on — a card the user never asked for. A goal is a goal;
  // per-side contemplation is only what they picked per side.
  // The contemplation STYLE (silent sit vs the Creation Prayer breath) — a side
  // is office OR contemplation, so one global flag covers whichever sides are
  // contemplative. Set by the customizer's Creation Prayer choice.
  const contemplationStyle: "silent" | "cobreathe" = (() => {
    try { return localStorage.getItem("phoebe:contemplation-style") === "cobreathe" ? "cobreathe" : "silent"; } catch { return "silent"; }
  })();
  const perSideContemplationSet = getSideContemplationExplicit("morning") !== null || getSideContemplationExplicit("evening") !== null;
  // A guest who has NOT explicitly chosen per-side contemplation keeps the ONE
  // silence goal card (their default 5-min sit renders as the aggregate solo
  // card below), NOT two per-side cards. But a guest who DID explicitly pick a
  // per-side anchor — e.g. Creation Prayer (the breath) as Morning + Evening in
  // the basic /customize editor, which sets both per-side flags — must get the
  // Morning/Evening Creation Prayer cards like any signed-in user. So the guest
  // restriction applies only to the un-chosen fallback branch, not the explicit
  // per-side pick.
  const morningContemplationActive = customized
    ? (perSideContemplationSet ? getSideContemplation("morning") : false)
    : (!guest && getSideLevel("morning") === "reflect-sit");
  const eveningContemplationActive = customized
    ? (perSideContemplationSet ? getSideContemplation("evening") : false)
    : (!guest && getSideLevel("evening") === "reflect-sit");
  // Local day-flag OR the server's cross-device echo — a sit done on another
  // device (which POSTed its contemplationSide) reads done here too.
  const morningContemplationDone = contemplationSideDone.morning || !!sidesToday?.morning;
  const eveningContemplationDone = contemplationSideDone.evening || !!sidesToday?.evening;
  // SOLO silence — a daily minutes goal with NO per-side contemplation card on
  // either side. The goal must still be visible somewhere, so it gets its own
  // single "Silence" card with a progress bar (DailyProgressBody) and exactly
  // one dot below. Guests are always in this shape (their per-side flags are
  // forced off above); a signed-in user lands here by setting minutes on the
  // Silence step without checking Contemplative Prayer on a side.
  const soloSilenceActive = contemplationGoalMin > 0 && !morningContemplationActive && !eveningContemplationActive;
  // Aggregate, for the single-silence consumers (splash / widget / prayer-mode /
  // routine-print / TodaysRhythm): active if either side is, or the solo goal
  // is; done when every active side is kept — or, solo, when today's minutes
  // have reached the goal (goal-met semantics — the progress bar stays visible
  // while under goal).
  const silenceActive = morningContemplationActive || eveningContemplationActive || soloSilenceActive;
  const silenceDone = soloSilenceActive
    ? contemplationMin >= contemplationGoalMin
    : (silenceActive
      && (!morningContemplationActive || morningContemplationDone)
      && (!eveningContemplationActive || eveningContemplationDone));
  // Creation Prayer (the breath) as the per-side style: the home suppresses the
  // standalone Co-Breathe card (the per-side cards ARE it) but ALSO renders the
  // minutes-goal card alongside (the breath cards never show goal progress).
  // These two mirror those exact render rules so dots/counts match the cards.
  const creationPerSide = contemplationStyle === "cobreathe" && (morningContemplationActive || eveningContemplationActive);
  const silenceGoalCardActive = soloSilenceActive || (creationPerSide && contemplationGoalMin > 0);
  const silenceGoalCardDone = contemplationMin >= contemplationGoalMin;
  const cobreatheStandaloneActive = cobreatheActive && !creationPerSide;
  // Each reflection newsletter the user follows is its OWN anchor (card + dot).
  // The selected set is the reflection home-modules that are on; an un-set-up
  // user with no saved layout falls back to the single effective source.
  const REFLECT_SOURCES = ["fdd", "cac", "ssje"] as const;
  const reflectDoneFor = (s: "fdd" | "cac" | "ssje"): boolean =>
    s === "cac" ? (hasReadCacToday() || !!reflRead?.cac)
      : s === "fdd" ? (hasReadFddToday() || !!reflRead?.fdd)
        : (hasReadSsjeToday() || !!reflRead?.ssje);
  const fromLayout = REFLECT_SOURCES.filter((s) => homeCardActive(hl, s));
  // New-user default rule includes a reflection (Forward Day by Day). When the
  // user has NO saved home layout (un-set-up), fall back to the single effective
  // reflection source — defaults to FDD, or "none" if they turned reflections
  // off. A user who HAS customized their layout keeps exactly the reflection
  // cards they chose there (no auto-add). (Guests: same rule against the local
  // cached layout — the seeded guest rule reaches FDD via this fallback.)
  const reflectFallback: Array<"cac" | "fdd" | "ssje"> =
    (!hl && (reflectionSource === "cac" || reflectionSource === "fdd" || reflectionSource === "ssje"))
      ? [reflectionSource]
      : [];
  const selectedReflections: Array<"cac" | "fdd" | "ssje"> =
    fromLayout.length > 0 ? [...fromLayout] : reflectFallback;
  const reflections = selectedReflections.map((s) => ({ source: s, done: reflectDoneFor(s) }));
  const reflectActive = reflections.length > 0;
  // Count contemplation PER SIDE (Morning + Evening Contemplation), matching the
  // two per-side cards the home renders — not the single `silenceActive`
  // aggregate, which under-counted the dots (2 dots for 3 cards). silenceActive/
  // silenceDone stay as aggregates for the splash/widget/what's-next consumers.
  const coreFlags = [
    ...(morningActive ? [morningDone] : []),
    ...(morningContemplationActive ? [morningContemplationDone] : []),
    // The SOLO Silence goal anchor — one goal card (with a progress bar) when
    // neither side carries a contemplation card (all guests; signed-in users
    // who set only the minutes goal), so it counts exactly one dot here and
    // the dots always match the cards.
    ...(silenceGoalCardActive ? [silenceGoalCardDone] : []),
    ...reflections.map((r) => r.done),
    ...(eveningActive ? [eveningDone] : []),
    ...(eveningContemplationActive ? [eveningContemplationDone] : []),
  ];
  const extraFlags = [
    ...(cobreatheStandaloneActive ? [cobreatheDone] : []),
    ...(listeningActive ? [listeningDone] : []),
    ...(readingActive ? [readingDone] : []),
    ...(podcastsActive ? [podcastsDone] : []),
    ...(walkActive ? [walkDone] : []),
    ...(prayerListActive ? [prayerListDone] : []),
    ...(examenActive ? [examenDone] : []),
    // "Not today" customs drop out entirely — no dot, not counted.
    ...customAnchors.filter((a) => !a.skipped).map((a) => a.done),
  ];
  const allFlags = [...coreFlags, ...extraFlags];
  const totalAnchors = allFlags.length;
  const doneCount = allFlags.filter(Boolean).length;

  // Have the queries that determine each card's done-state resolved? Until
  // they have, every "*Done" flag reads false, so the cards would all render
  // under "Next" and then visibly jump into "Done" as the data lands. Consumers
  // gate their first paint on this to fade in the settled split instead of
  // animating that reshuffle. (Cached navigations resolve synchronously, so
  // this is true on the first render and the fade just plays once.)
  // Offline, the per-anchor completions query can't load (and may not be cached
  // on a cold boot), so don't let it block the routine from painting — the
  // structure still comes from the persisted office history / prefs / layout.
  // The extras just read "not done yet" until the connection returns.
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  // A GUEST has no server queries to settle — the rhythm is device-local, so
  // the first paint is ready immediately.
  const ready = guest || (
    officeHistory !== undefined &&
    contStats !== undefined &&
    reflRead !== undefined &&
    officePrefs !== undefined &&
    (!anyExtraActive || completions !== undefined || offline));

  return {
    ready,
    morningDone,
    reflectDone,
    silenceDone,
    eveningDone,
    eveningActive,
    morningActive,
    silenceActive,
    soloSilenceActive,
    silenceGoalCardActive,
    silenceGoalCardDone,
    cobreatheStandaloneActive,
    morningContemplationActive,
    eveningContemplationActive,
    morningContemplationDone,
    eveningContemplationDone,
    reflectActive,
    reflections,
    examenActive,
    listeningActive,
    readingActive,
    podcastsActive,
    walkActive,
    cobreatheActive,
    prayerListActive,
    examenDone,
    listeningDone,
    readingDone,
    podcastsDone,
    walkDone,
    cobreatheDone,
    prayerListDone,
    customAnchors,
    totalAnchors,
    doneCount,
    streak: rhythm?.streak ?? 0,
    last7: rhythm?.last7 ?? 0,
    keptToday: !!rhythm?.keptToday,
    gardenCount: prayerStreak?.gardenPrayedTodayCount ?? 0,
    cobreatheCount: cobreathe?.count ?? 0,
    prayerKind,
    contemplationMin,
    contemplationGoalMin,
    contemplationStyle,
    silenceLadder: ladderEnabled && ladderData?.enabled && typeof ladderData.level === "number"
      ? { level: ladderData.level, levelDays: ladderData.levelDays ?? 0, daysToNext: ladderData.daysToNext ?? 0, nextLevel: ladderData.nextLevel ?? ladderData.level, atMax: !!ladderData.atMax }
      : null,
  };
}
