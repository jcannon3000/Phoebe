import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  hasReadCacToday, hasReadFddToday, hasReadSsjeToday,
  CAC_READ_EVENT, FDD_READ_EVENT, SSJE_READ_EVENT,
  hasPrayedPsalmsToday, PSALMS_READ_EVENT,
} from "@/lib/cacReadState";
import { hasPracticeDoneToday, PRACTICE_DONE_EVENT } from "@/lib/practiceCompletion";
import { getCustomAnchors, isCustomDoneToday, isCustomSkippedToday, CUSTOM_ANCHORS_EVENT, CUSTOM_DONE_EVENT, type CustomSlot, type ReadingConfig } from "@/lib/customAnchors";
import { OFFICE_DONE_EVENT } from "@/lib/officeManualLog";
import { getSideLevel, getExplicitSideLevel, getSideContemplation, getSideContemplationExplicit, useEffectiveReflectionSource } from "@/lib/officePrefs";
import { hasContemplationSideDoneToday, CONTEMPLATION_SIDE_DONE_EVENT } from "@/lib/contemplationSideDone";
import { ROUTINE_SYNCED_EVENT } from "@/lib/routineSync";
import { useAuth } from "@/hooks/useAuth";
import { isDeviceLocalGuest } from "@/lib/guestFlag";
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
  gratitudeActive: boolean;
  examenActive: boolean;
  listeningActive: boolean;
  journalingActive: boolean;
  lectioActive: boolean;
  readingActive: boolean;
  podcastsActive: boolean;
  walkActive: boolean;
  cobreatheActive: boolean;
  prayerListActive: boolean;
  scriptureActive: boolean;
  gratitudeDone: boolean;
  examenDone: boolean;
  listeningDone: boolean;
  journalingDone: boolean;
  lectioDone: boolean;
  readingDone: boolean;
  podcastsDone: boolean;
  walkDone: boolean;
  cobreatheDone: boolean;
  prayerListDone: boolean;
  scriptureDone: boolean;
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
  const guest = !authLoading && isDeviceLocalGuest(user);
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
  // FDD / Psalms used AS a side's morning/evening PRAYER (not just a reflection)
  // must light that side's done-state. Tracked reactively with the same robust
  // return-to-app signals as the reflection read-state.
  const [prayerRead, setPrayerRead] = useState(() => ({ fdd: hasReadFddToday(), psalmsMorning: hasPrayedPsalmsToday("morning"), psalmsEvening: hasPrayedPsalmsToday("evening") }));
  useEffect(() => {
    const recheck = () => {
      setReflectLocal(hasReadCacToday() || hasReadFddToday() || hasReadSsjeToday());
      setPrayerRead({ fdd: hasReadFddToday(), psalmsMorning: hasPrayedPsalmsToday("morning"), psalmsEvening: hasPrayedPsalmsToday("evening") });
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
    return () => {
      window.removeEventListener(CAC_READ_EVENT, recheck);
      window.removeEventListener(FDD_READ_EVENT, recheck);
      window.removeEventListener(SSJE_READ_EVENT, recheck);
      window.removeEventListener(PSALMS_READ_EVENT, recheck);
      window.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("storage", recheck);
      window.removeEventListener("phoebe:appactive", recheck);
      window.removeEventListener("phoebe:browserfinished", recheck);
      window.removeEventListener(ROUTINE_SYNCED_EVENT, recheck);
    };
  }, []);

  // Optional-practice completion (gratitude / examen). Instant local flags flip
  // the anchor the moment the user finishes; we re-check on the shared event +
  // return-to-app signals, and OR in the server rows below for cross-device.
  const [practiceLocal, setPracticeLocal] = useState(() => ({
    gratitude: hasPracticeDoneToday("gratitude"),
    examen: hasPracticeDoneToday("examen"),
    listening: hasPracticeDoneToday("listening"),
    journaling: hasPracticeDoneToday("journaling"),
    lectio: hasPracticeDoneToday("lectio"),
    reading: hasPracticeDoneToday("reading"),
    podcasts: hasPracticeDoneToday("podcasts"),
    walk: hasPracticeDoneToday("walk"),
    prayerList: hasPracticeDoneToday("prayer-list"),
    scripture: hasPracticeDoneToday("scripture"),
  }));
  useEffect(() => {
    const recheck = () => setPracticeLocal({
      gratitude: hasPracticeDoneToday("gratitude"),
      examen: hasPracticeDoneToday("examen"),
      listening: hasPracticeDoneToday("listening"),
      journaling: hasPracticeDoneToday("journaling"),
      lectio: hasPracticeDoneToday("lectio"),
      reading: hasPracticeDoneToday("reading"),
      podcasts: hasPracticeDoneToday("podcasts"),
      walk: hasPracticeDoneToday("walk"),
      prayerList: hasPracticeDoneToday("prayer-list"),
      scripture: hasPracticeDoneToday("scripture"),
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

  // Per-side contemplation completion (which side's silent sit is kept today) —
  // its own day-flag so an undone evening sit stays in Next even after the
  // morning sit met the daily minutes goal.
  const [contemplationSideDone, setContemplationSideDone] = useState(() => ({
    morning: hasContemplationSideDoneToday("morning"),
    evening: hasContemplationSideDoneToday("evening"),
  }));
  useEffect(() => {
    const recheck = () => setContemplationSideDone({
      morning: hasContemplationSideDoneToday("morning"),
      evening: hasContemplationSideDoneToday("evening"),
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
  const gratitudeActive = homeCardActive(hl, "gratitude");
  const examenActive = homeCardActive(hl, "examen");
  // Audio Divina (listening as a way of prayer) is live as a logging-first
  // practice — it appears ONLY when the user selects it in the customizer
  // (homeCardActive reads the saved home layout).
  const listeningActive = homeCardActive(hl, "listening");
  const journalingActive = homeCardActive(hl, "journaling");
  // Lectio Divina — sacred reading as a logging-first practice (same shape as
  // Audio Divina); appears only when selected in the customizer.
  const lectioActive = homeCardActive(hl, "lectio");
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
  // slideshow); appears only when selected in the customizer.
  const prayerListActive = homeCardActive(hl, "prayer-list");
  // Listen to Scripture — the day's appointed readings, heard one passage at a
  // time (Scripture Day by Day); a slotted contemplative practice.
  const scriptureActive = homeCardActive(hl, "scripture");
  const anyExtraActive = gratitudeActive || examenActive || listeningActive || journalingActive || lectioActive || readingActive || podcastsActive || walkActive || prayerListActive || scriptureActive;
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

  const todaySince = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
  }, []);
  const tz = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
  }, []);
  const { data: contStats } = useQuery<{ todaySeconds: number; healthMinutesToday: number }>({
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
  const { data: sidesToday } = useQuery<{ morning: boolean; evening: boolean }>({
    queryKey: ["/api/me/contemplation-sides-today", tz],
    queryFn: () => apiRequest("GET", `/api/me/contemplation-sides-today?tz=${encodeURIComponent(tz)}`),
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
  const morningDone = !!todayOffice?.morning || officeLocal.morning
    || (ml === "fdd" && prayerRead.fdd) || (ml === "psalms" && prayerRead.psalmsMorning);
  const eveningDone = !!todayOffice?.evening || officeLocal.evening
    || (el === "fdd" && prayerRead.fdd) || (el === "psalms" && prayerRead.psalmsEvening);

  // Contemplation (was "Silence"): today's minutes = Phoebe sits + any external
  // Apple Health mindful minutes (a Cobreathe breath logs a contemplation sit,
  // so it's already counted here). It only counts as KEPT once the daily goal is
  // met — if no goal is set, any silence counts. GUESTS can't post
  // prayer_sessions — their minutes come from the device-local sit tally.
  const contemplationMin = guest
    ? getGuestSilenceMinutesToday()
    : Math.floor((contStats?.todaySeconds ?? 0) / 60) + (contStats?.healthMinutesToday ?? 0);
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

  const gratitudeDone = gratitudeActive && (practiceLocal.gratitude || serverDone("gratitude"));
  const examenDone = examenActive && (practiceLocal.examen || serverDone("examen"));
  const listeningDone = listeningActive && (practiceLocal.listening || serverDone("listening"));
  const journalingDone = journalingActive && (practiceLocal.journaling || serverDone("journaling"));
  const lectioDone = lectioActive && (practiceLocal.lectio || serverDone("lectio"));
  const readingDone = readingActive && (practiceLocal.reading || serverDone("reading"));
  const podcastsDone = podcastsActive && (practiceLocal.podcasts || serverDone("podcasts"));
  const walkDone = walkActive && (practiceLocal.walk || serverDone("walk"));
  const prayerListDone = prayerListActive && (practiceLocal.prayerList || serverDone("prayer-list"));
  const scriptureDone = scriptureActive && (practiceLocal.scripture || serverDone("scripture"));
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
  // Has the user designed a rule yet? A saved home layout is the signal (for a
  // guest, the device-local cached layout their customizer writes).
  const customized = !!hl;
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
  // cards. Explicit per-side flags win; a customized user with a legacy single
  // silence goal (no per-side pick yet) migrates to BOTH sides; an un-set-up user
  // falls back to the reflect-sit default (evening only for a fresh rhythm).
  // "Has the user made an EXPLICIT per-side pick?" — a written 0 or 1 for either
  // side. Only then do we read the per-side flags; otherwise a legacy single goal
  // migrates to both sides. (Checking `=== true` here would wrongly re-migrate a
  // user who deliberately turned BOTH sides off.)
  const perSideContemplationSet = getSideContemplationExplicit("morning") !== null || getSideContemplationExplicit("evening") !== null;
  // GUESTS never get the per-side cards — their silence is ONE goal card with a
  // progress bar (DailyProgressBody), so both per-side flags stay off and the
  // aggregate below carries the anchor instead.
  const morningContemplationActive = !guest && (customized
    ? (perSideContemplationSet ? getSideContemplation("morning") : contemplationGoalMin > 0)
    : (getSideLevel("morning") === "reflect-sit"));
  const eveningContemplationActive = !guest && (customized
    ? (perSideContemplationSet ? getSideContemplation("evening") : contemplationGoalMin > 0)
    : (getSideLevel("evening") === "reflect-sit"));
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
    ...(soloSilenceActive ? [silenceDone] : []),
    ...reflections.map((r) => r.done),
    ...(eveningActive ? [eveningDone] : []),
    ...(eveningContemplationActive ? [eveningContemplationDone] : []),
  ];
  const extraFlags = [
    ...(cobreatheActive ? [cobreatheDone] : []),
    ...(listeningActive ? [listeningDone] : []),
    ...(lectioActive ? [lectioDone] : []),
    ...(readingActive ? [readingDone] : []),
    ...(podcastsActive ? [podcastsDone] : []),
    ...(walkActive ? [walkDone] : []),
    ...(gratitudeActive ? [gratitudeDone] : []),
    ...(prayerListActive ? [prayerListDone] : []),
    ...(scriptureActive ? [scriptureDone] : []),
    ...(examenActive ? [examenDone] : []),
    ...(journalingActive ? [journalingDone] : []),
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
    morningContemplationActive,
    eveningContemplationActive,
    morningContemplationDone,
    eveningContemplationDone,
    reflectActive,
    reflections,
    gratitudeActive,
    examenActive,
    listeningActive,
    journalingActive,
    lectioActive,
    readingActive,
    podcastsActive,
    walkActive,
    cobreatheActive,
    prayerListActive,
    scriptureActive,
    gratitudeDone,
    examenDone,
    listeningDone,
    journalingDone,
    lectioDone,
    readingDone,
    podcastsDone,
    walkDone,
    cobreatheDone,
    prayerListDone,
    scriptureDone,
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
    silenceLadder: ladderEnabled && ladderData?.enabled && typeof ladderData.level === "number"
      ? { level: ladderData.level, levelDays: ladderData.levelDays ?? 0, daysToNext: ladderData.daysToNext ?? 0, nextLevel: ladderData.nextLevel ?? ladderData.level, atMax: !!ladderData.atMax }
      : null,
  };
}
