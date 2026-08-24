import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Layout } from "@/components/layout";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { apiRequest } from "@/lib/queryClient";
import { CobreatheBreath, DEFAULT_TOTAL_BREATHS, CYCLE_MS } from "@/components/CobreatheBreath";
import { CobreatheSummary } from "@/components/CobreatheSummary";
import { CobreatheHowToIntro } from "@/components/CobreatheHowToIntro";
import { addBreathsThisWeek } from "@/lib/cobreatheTally";
import { useAuth } from "@/hooks/useAuth";
import { usePeople } from "@/hooks/usePeople";
import { useCobreatheSync } from "@/hooks/useCobreatheSync";
import { useKeepAwake } from "@/hooks/useKeepAwake";
import { computeFingerprint } from "@/lib/cobreatheOrder";
import { pickWideBackground, WIDE_PHOTOS } from "@/lib/wideBackgrounds";
import { isNativeShell } from "@/lib/isNativeShell";
import { isDeviceLocalGuest } from "@/lib/guestFlag";
import { verifyAtPlace, type BreathPlace } from "@/lib/breathPlaces";
import { resolvePlacePhotos } from "@/lib/breathPlacePhotos";
import { attributeContemplationSit } from "@/lib/contemplationSideDone";
import { getSideContemplation, getSideLevel } from "@/lib/officePrefs";
import { addGuestSilenceMinutes } from "@/lib/guestSilenceLog";

// The Cobreathe photo library — every image in src/assets/cobreathe is bundled
// (hashed + optimized by Vite) and rotated through during the breath, one photo
// per breath, shuffled per session. Drop a new photo into that folder and it
// joins the rotation automatically; no manifest to edit.
//
// The top-level `*` glob is the SHARED, curated pool used everywhere (office /
// intercession / contemplation via @/lib/earthPhotos). Co-Breathe shows EXACTLY
// this set — the same photos that live in the curated Pictures library. (The
// old `bad/` + `animals/` Co-Breathe-only subfolders were dropped: they held
// rejected images that aren't in the library, so they're no longer shown.)
const COBREATHE_TOP_PHOTOS = Object.values(
  import.meta.glob("@/assets/cobreathe/*.{jpg,jpeg,png,avif,webp}", {
    eager: true,
    query: "?url",
    import: "default",
  }),
) as string[];
const COBREATHE_PHOTOS = [...COBREATHE_TOP_PHOTOS];

// The photo pool the breath rotates through, one per breath. On the WEB use the
// wide landscape set (proper aspect for a desktop window — the bundled photos
// are portrait and zoom/crop badly wide, owner); on iOS the wide set isn't
// bundled, so keep the bundled library.
const BREATH_PHOTOS: string[] = (!isNativeShell() && WIDE_PHOTOS.length > 0) ? WIDE_PHOTOS : COBREATHE_PHOTOS;

// (The photo-set fingerprint is derived per-render from the photos actually in
// use — see breathFingerprint — because a chosen place swaps the library.)

function wantsStart(): boolean {
  // ?start=1 — the standalone Co-Breathe card. ?begin=1 — the per-side Creation
  // Prayer home card (/cobreathe?begin=1&side=…). Both jump straight into the
  // breath (via the first-run how-it-works the first time), rather than parking
  // on the "before you begin" settings screen, so the home "Begin" behaves like
  // the office "Begin".
  try {
    const p = new URLSearchParams(window.location.search);
    return p.get("start") === "1" || p.get("begin") === "1";
  } catch { return false; }
}
// Launched from the contemplation page / sit? Those entry points pass
// ?from=contemplation, and finishing then shows the summary screen (and returns
// to /contemplation) instead of slipping straight back.
function cameFromContemplation(): boolean {
  try { return new URLSearchParams(window.location.search).get("from") === "contemplation"; } catch { return false; }
}

// Cobreathe — from "conspire", con + spirare, to breathe together.
// A short daily guided breath held as embodied prayer for climate justice: not
// synchronized in time, but everyone who keeps the practice on a given day
// shares one count, and the closing screen tells you how many people you
// breathed with — including the faces of people in your garden. Drawn from
// Laurel Kearns, "Con-spiring Together: Breathing for Justice" — ruach as
// the one breath animating all creation, reciprocal respiration with the
// green world, and "I can't breathe" as the cry that binds Earth justice to
// social justice.
//
// A finished cobreath is also logged as a contemplation prayer_session (and
// mirrored to Apple Health), so the two minutes count toward the daily
// contemplation goal like any other silence.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, serif";

// The week's intention — who this week's breath is held for. Rotates by
// week-of-year so the whole community holds the same focus at the same time.
const WEEKLY_FOCI: Array<{ emoji: string; key: string; title: string; line: string }> = [
  { emoji: "🏭", key: "clean_air", title: "Clean air", line: "for those who live beside the highways, refineries, and incinerators — whose neighborhoods were made into sacrifice zones." },
  { emoji: "✊🏾", key: "breath_taken", title: "Those whose breath is taken", line: "for every person whose 'I can't breathe' went unheard, and for an end to the violence that silences breath." },
  { emoji: "🌳", key: "green_world", title: "The green world", line: "for the forests and the phytoplankton — every second breath you take is their gift." },
  { emoji: "🌊", key: "climate", title: "A heating planet", line: "for those losing homes, harvests, and homelands to a changing climate — and for the courage to act." },
  { emoji: "🫁", key: "the_sick", title: "The sick", line: "for those breathing with asthma, COPD, or a ventilator's help — and for the air that made many of them sick." },
  { emoji: "👷🏽", key: "workers", title: "Those who breathe for us", line: "for the workers who breathe dust, fumes, and fields so the rest of us can eat and build and live." },
  { emoji: "🕊️", key: "displaced", title: "The displaced", line: "for refugees and migrants breathing unfamiliar air, far from home, and for the welcome they deserve." },
  { emoji: "🌍", key: "creation", title: "The whole creation", line: "groaning as in labor — and the ruach that has hovered over the waters since the beginning." },
];

// Local calendar day, YYYY-MM-DD (en-CA locale formats exactly that way).
function localDay(): string {
  return new Date().toLocaleDateString("en-CA");
}

// Week-of-year for rotating the weekly focus. Everyone on the same calendar
// week holds the same intention.
function weekOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d.getTime() - start.getTime()) / (7 * 86400000));
}

type Companion = { userId: number; name: string | null; avatarUrl: string | null };
type BreathState = {
  done: boolean;
  count: number;
  companions: Companion[];
  companionCount: number;
  myDays: number;
  allBreaths: number;
};

// One-time "how it works" intro shown to a first-time Co-Breather after Begin.
const COBREATHE_HOWTO_KEY = "phoebe:cobreathe-howto-seen";
function cobreatheHowtoSeen(): boolean {
  try { return localStorage.getItem(COBREATHE_HOWTO_KEY) === "1"; } catch { return false; }
}
function markCobreatheHowtoSeen(): void {
  try { localStorage.setItem(COBREATHE_HOWTO_KEY, "1"); } catch { /* private mode */ }
}

export default function CobreathePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const day = localDay();
  const focus = WEEKLY_FOCI[weekOfYear(new Date()) % WEEKLY_FOCI.length];

  const [, setLocation] = useLocation();
  // Landing on /cobreathe opens the prayer slideshow — Laurel Kearns' "Prayer of
  // Con-Spiring", the source the whole practice is drawn from — which hands into
  // the "before you begin" screen (settings + Start Breathing) and then the
  // breath. A ?start=1 quick-launch (e.g. the home card) skips both and goes
  // straight into the synced breath.
  // The Laurel Kearns "Prayer of Con-Spiring" slideshow is removed (owner) —
  // landing on /cobreathe goes straight to the "before you begin" screen for
  // everyone (a ?start=1 quick-launch still jumps into the breath).
  const [mode, setMode] = useState<"intro" | "location" | "placeStats" | "howto" | "breathing" | "done">(() =>
    // A ?start=1 quick-launch jumps in — but a FIRST-time breather still gets the
    // one-time "how it works" intro first.
    wantsStart() ? (cobreatheHowtoSeen() ? "breathing" : "howto") : "intro",
  );
  /**
   * Where they're breathing, if they named a designated place.
   *
   * Owner: "a button on the opening slide that says Enter location, that would
   * go to a second intro slide where they pick the location." Session-scoped
   * on purpose — where you are today says nothing about where you'll be
   * tomorrow, so this is never persisted as a preference.
   */
  const [place, setPlace] = useState<BreathPlace | null>(null);
  // Did the device confirm they're within the place's radius? Checked on pick
  // (see the location slide), never re-checked, and false is a normal state —
  // see lib/breathPlaces.
  const [placeVerified, setPlaceVerified] = useState(false);

  // Breath count — 12 by default, adjustable on this screen. Reads/writes
  // phoebe:cobreathe-length so the customizer's Creation Prayer "How many
  // breaths?" preset stays in sync with whatever's picked here (the home
  // card's Begin opens at whichever length was last set, from either place).
  const [lengthBreaths, setLengthBreaths] = useState<number>(() => {
    try {
      const n = parseInt(localStorage.getItem("phoebe:cobreathe-length") || "", 10);
      return [6, 12, 18, 24, 30, 36].includes(n) ? n : DEFAULT_TOTAL_BREATHS;
    } catch { return DEFAULT_TOTAL_BREATHS; }
  });
  function chooseLengthBreaths(n: number) {
    setLengthBreaths(n);
    try { localStorage.setItem("phoebe:cobreathe-length", String(n)); } catch { /* ignore */ }
  }
  // One calm LANDSCAPE behind the "before you begin" screen (the top-level
  // curated set — wide landscapes, no leaf close-ups / animals / farm), picked
  // once and faded up under a dark wash. Matches the prayer-intro slides so the
  // whole Co-Breathe flow rests on the same landscape imagery.
  const introBgPhoto = useMemo(() => {
    // A chosen place brings its own imagery to the intro slides too, so the
    // screens leading into the breath already look like where you are.
    const lib = resolvePlacePhotos(place?.photoUrls);
    if (lib.length > 0) return lib[Math.floor(Math.random() * lib.length)]!;
    // Wide landscape backdrop on the web; the bundled Co-Breathe photo on native.
    return pickWideBackground()
      ?? (COBREATHE_PHOTOS.length > 0 ? COBREATHE_PHOTOS[Math.floor(Math.random() * COBREATHE_PHOTOS.length)]! : null);
  }, [place]);
  // Location-based "breathe with a fellow" is removed — Co-Breathe never shares
  // location. Kept as a const false so the synchronized (global, location-free)
  // breath stays solo.
  const joinInPerson = false;
  // Hold the screen on while breathing — the breath has no touch input, so the
  // idle timer would otherwise dim/sleep the phone mid-sit.
  useKeepAwake(mode === "breathing");

  // Garden-mate photo sync: while breathing, follow the earliest online garden-
  // mate's photo order (or lead if first). Gated on showPresence inside the hook.
  const { user } = useAuth();
  const { data: people } = usePeople(user?.id);
  // Match live breathers to our connections by userId — the server no longer
  // broadcasts emails in cobreathe-sync (privacy), so we filter by id.
  const gardenUserIds = useMemo(
    () => new Set((people ?? []).map((p) => p.userId).filter((x): x is number => x != null)),
    [people],
  );
  // Location features removed — Co-Breathe shares NO location / presence /
  // coords. It's the global synchronized breath only (everyone who keeps the
  // practice on a given day shares one count); nothing geographic.
  /**
   * The photos this breath actually rests on — the place's own library when
   * one is chosen, the bundled landscapes otherwise.
   */
  const breathPhotos = useMemo(() => {
    // Expand any `bundled:<set>` sentinel into its real asset URLs first —
    // a place that ships with the app carries its photos on disk, not over
    // the network. See lib/breathPlacePhotos.
    const own = resolvePlacePhotos(place?.photoUrls);
    return own.length > 0 ? own : BREATH_PHOTOS;
  }, [place]);
  /**
   * The fingerprint MUST be derived from the photos in use, not from the
   * bundled set.
   *
   * Two clients only sync when their fingerprints match, precisely so that a
   * photo-set difference falls back to solo ordering instead of showing two
   * people different images at the same index. Passing the bundled constant
   * while rendering a place's library would defeat exactly that: someone at
   * St. Mark's and someone at home would match, sync, and see different
   * pictures on the same breath.
   *
   * Derived this way it does the right thing on its own — two people at the
   * same place share a library, so they match and breathe together on the same
   * image; anyone elsewhere doesn't, and orders their own.
   */
  const breathFingerprint = useMemo(() => computeFingerprint(breathPhotos), [breathPhotos]);
  const breathSync = useCobreatheSync(user, gardenUserIds, {
    fingerprint: breathFingerprint,
    active: mode === "breathing",
  });

  // Who you cobreathed WITH: capture every garden-mate seen breathing live during
  // this sit, so the first to finish still sees the others on the summary even
  // after their session ends (mirrors the contemplation co-presence capture).
  const peopleById = useMemo(
    () => new Map((people ?? []).filter((p) => p.userId != null).map((p) => [p.userId as number, p])),
    [people],
  );
  const [coBreathed, setCoBreathed] = useState<Map<number, Companion>>(() => new Map());
  useEffect(() => {
    if (mode !== "breathing" || breathSync.coBreatherIds.length === 0) return;
    setCoBreathed((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const id of breathSync.coBreatherIds) {
        if (!next.has(id)) {
          const p = peopleById.get(id);
          next.set(id, { userId: id, name: p?.name ?? null, avatarUrl: p?.avatarUrl ?? null });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [mode, breathSync.coBreatherIds, peopleById]);

  // Fellows breathing RIGHT NOW (live), with faces — passed to the breath so it
  // can show who's cobreathing alongside you, refreshed once per breath.
  const coBreathingFellows = useMemo(
    () => breathSync.coBreatherIds
      .map((id) => { const p = peopleById.get(id); return p ? { userId: id, name: (p.name ?? null) as string | null, avatarUrl: p.avatarUrl ?? null } : null; })
      .filter((x): x is NonNullable<typeof x> => x !== null),
    [breathSync.coBreatherIds, peopleById],
  );

  // Mirror the "with a fellow" mode + who we breathed with into refs, so the
  // empty-deps handleEnd below can read the LATEST values when the sit finishes
  // (it would otherwise close over the first render's empty set).
  const joinInPersonRef = useRef(joinInPerson);
  joinInPersonRef.current = joinInPerson;
  // Mirror the chosen length so the empty-deps handleEnd reads the LATEST value.
  const lengthBreathsRef = useRef(lengthBreaths);
  lengthBreathsRef.current = lengthBreaths;
  const coBreathedRef = useRef(coBreathed);
  coBreathedRef.current = coBreathed;

  // State returned by the POST — fresher than the GET cache on the done screen.
  const [doneState, setDoneState] = useState<BreathState | null>(null);
  // This week's running breath tally (per-device), shown on the concluding
  // screen — the same number the slideshow's Cobreathe close shows.
  const [weekBreaths, setWeekBreaths] = useState(0);
  // How many breaths the user actually took this sit (open-ended — can exceed 12).
  const [breathsTaken, setBreathsTaken] = useState(DEFAULT_TOTAL_BREATHS);
  const talliedRef = useRef(false);

  const { data: today } = useQuery<BreathState>({
    queryKey: ["/api/breath/today", day],
    queryFn: () => apiRequest("GET", `/api/breath/today?day=${day}`),
  });

  /**
   * The designated places, with today's counts.
   *
   * Fetched only once the reader actually opens the location slide — this is
   * an optional detour off the opening screen, and everyone who never taps it
   * (which will be most people, most days) shouldn't pay a request for it.
   */
  const { data: placesData, isLoading: placesLoading } = useQuery<{ places: BreathPlace[] }>({
    queryKey: ["/api/breath/places", day],
    queryFn: () => apiRequest("GET", `/api/breath/places?day=${day}`),
    enabled: mode === "location",
    staleTime: 60_000,
  });
  const places = placesData?.places ?? [];
  const [verifying, setVerifying] = useState(false);

  /**
   * Pick a place, then ask the device to confirm it.
   *
   * The pick lands IMMEDIATELY and the verification follows — so the choice
   * never waits on a GPS fix that may be slow indoors or never come at all.
   * A failed or denied check leaves the place chosen and simply unverified,
   * which is a real state and not an error: the breath counts either way.
   */
  const pickPlace = useCallback(async (p: BreathPlace) => {
    setPlace(p);
    setPlaceVerified(false);
    // Straight to the place's own slide — what you just joined is the
    // interesting thing, and waiting on the GPS check to show it would make
    // the tap feel unresponsive indoors, which is where chapels are.
    setMode("placeStats");
    setVerifying(true);
    try {
      setPlaceVerified(await verifyAtPlace(p));
    } finally {
      setVerifying(false);
    }
  }, []);

  /**
   * The chosen place's story — today, this month, all time.
   *
   * Keyed by day as well as id so it re-fetches across a midnight rollover
   * rather than serving yesterday's "today". Only runs on the slide that
   * shows it.
   */
  const { data: placeStats, isLoading: statsLoading } = useQuery<{
    place: { id: number; name: string; subtitle: string | null };
    today: number;
    month: { breaths: number; people: number };
    allTime: { breaths: number; people: number };
  }>({
    queryKey: ["/api/breath/places/stats", place?.id, day],
    queryFn: () => apiRequest("GET", `/api/breath/places/${place?.id}/stats?day=${day}`),
    enabled: mode === "placeStats" && !!place?.id,
    staleTime: 60_000,
  });

  const record = useMutation({
    mutationFn: (seconds: number) =>
      apiRequest<BreathState & { ok: boolean }>("POST", "/api/breath/today", {
        day,
        seconds,
        // Only the place's id and a boolean — never coordinates. See
        // lib/breathPlaces for why that distinction carries the whole design.
        placeId: place?.id ?? null,
        placeVerified,
      }),
    onSuccess: (resp) => {
      setDoneState(resp);
      queryClient.invalidateQueries({ queryKey: ["/api/breath/today", day] });
    },
  });

  // Log the breathed time as a contemplation sit — exactly once — so it lands
  // in history, stats, the daily goal, and Apple Health. Called both when the
  // set completes (so a finished Cobreathe counts even if they never tap
  // Finish) and on an early end (>=30s). Guarded so the two paths don't double.
  // Tracks what's been logged so far: the seconds already credited, and (for
  // signed-in users) the prayer_sessions row id to extend. Starts null (never
  // logged). A guest never gets an id — there's no server row for them.
  const loggedRef = useRef<{ seconds: number; id: number | null } | null>(null);
  // Latest user for the guest check inside the stable ([]) logSit callback.
  const userRef = useRef(user);
  userRef.current = user;
  const logSit = useCallback((secondsKept: number) => {
    if (secondsKept < 2) return;
    const already = loggedRef.current;
    // Nothing new to credit — this call isn't longer than what's logged.
    if (already && secondsKept <= already.seconds) return;
    // Reached the set (first log): a completed Creation Prayer always lands
    // in the daily count, even if the user never taps Finish. Breathing past
    // the 12th breath and tapping Finish calls logSit again with the FULL
    // elapsed time — extend the same row (PATCH) instead of dropping it on
    // the floor, which is what silently capped every session at ~12 breaths
    // before.
    //
    // Launched as a per-side Creation Prayer card (/cobreathe?side=morning)?
    // Stamp the side so it credits THAT side's per-side completion (like a
    // silent per-side sit), not just the aggregate.
    const sideParam = (() => {
      try {
        const s = new URLSearchParams(window.location.search).get("side");
        return s === "morning" || s === "evening" ? s : undefined;
      } catch { return undefined; }
    })();
    // Stamp the per-side day-flag LOCALLY for everyone (same instant echo the
    // silent sit gets from ContemplationTimer). For guests this is the ONLY
    // layer — their /api/me/contemplation-sides-today query is disabled, so
    // without it a guest's Morning/Evening Creation Prayer card could never
    // read "kept". Signed-in users still get the server echo below too.
    // A side can carry the breath in TWO ways: the per-side contemplation flag
    // (the customizer's Creation Prayer add-on) OR a level of "reflect-sit"
    // with a cobreathe style (what /customize-home's "Breathing together"
    // writes — it never sets the per-side flags). Gating on the flags alone
    // meant the second config skipped this stamp entirely, so its card only
    // flipped once the server echo landed — and never at all offline or for a
    // device-local guest, whose sides-today query is disabled.
    // Same key useRhythmState reads for `contemplationStyle`.
    const styleIsCobreathe = (() => {
      try { return localStorage.getItem("phoebe:contemplation-style") === "cobreathe"; } catch { return false; }
    })();
    const sideCarriesBreath = (s: "morning" | "evening") =>
      getSideContemplation(s) || (styleIsCobreathe && getSideLevel(s) === "reflect-sit");
    const morningBreath = sideCarriesBreath("morning");
    const eveningBreath = sideCarriesBreath("evening");
    // Only stamp the side flag on the first log — it's a same-day "kept"
    // marker, not a duration, so extending the sit doesn't need to redo it.
    if (!already && (morningBreath || eveningBreath)) {
      attributeContemplationSit({
        explicitSide: sideParam ?? null,
        activeSides: { morning: morningBreath, evening: eveningBreath },
        kind: "cobreathe",
      });
    }
    // PUBLIC no-login version: a GUEST has no account to POST/PATCH
    // prayer_sessions, so — exactly like ContemplationTimer — a breath logs
    // its whole minutes to the device-local silence tally the home
    // "Silence" goal card reads. Only credit the INCREMENTAL minutes beyond
    // what's already been added, so extending a sit doesn't double-count.
    if (isDeviceLocalGuest(userRef.current)) {
      const priorMinutes = already ? Math.floor(already.seconds / 60) : 0;
      const deltaMinutes = Math.floor(secondsKept / 60) - priorMinutes;
      if (deltaMinutes > 0) addGuestSilenceMinutes(deltaMinutes);
      loggedRef.current = { seconds: secondsKept, id: null };
      return;
    }
    // Reserve this length synchronously so a second call arriving before the
    // request resolves can't fire a duplicate POST or a stale PATCH.
    loggedRef.current = { seconds: secondsKept, id: already?.id ?? null };
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-sides-today"] });
    };
    if (already?.id != null) {
      // Extend the already-logged row to the fuller elapsed time.
      void apiRequest("PATCH", `/api/me/contemplation-sessions/${already.id}/duration`, {
        durationSeconds: secondsKept,
      })
        .then(invalidate)
        .catch(() => { /* best-effort */ });
      return;
    }
    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - secondsKept * 1000);
    void apiRequest<{ id: number | null }>("POST", "/api/prayer-sessions", {
      surface: "contemplation",
      source: "cobreathe",
      durationSeconds: secondsKept,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      isPrivate: false,
      ...(sideParam ? { contemplationSide: sideParam } : {}),
    })
      .then((resp) => {
        loggedRef.current = { seconds: secondsKept, id: resp?.id ?? null };
        invalidate();
      })
      .catch(() => { /* best-effort */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reaching the set records the communal breath AND logs the contemplation sit
  // right away — so a completed Creation Prayer ALWAYS lands in the daily
  // contemplation/silence count, even if the user never taps "Done" (or backs
  // out at the summary). If they keep breathing past the 12th and later tap
  // Finish, handleEnd calls logSit again with the longer elapsed time and it
  // EXTENDS the same row (see loggedRef in logSit) rather than being dropped —
  // a guaranteed early count that still grows to the real total.
  const handleReachTarget = useCallback((secondsKept: number) => {
    record.mutate(secondsKept);
    logSit(secondsKept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Captured once at mount: did we arrive from the contemplation page/sit?
  const fromContemplationRef = useRef(cameFromContemplation());

  // Finishing (or backing out). A sit only COUNTS if the user completed the set
  // (reached the 12th breath). Cancelling or bailing early does NOT log a
  // contemplation sit — nothing toward the daily goal, history, or Apple Health.
  // When it does count, it's logged with the FULL elapsed time (20 breaths = 20).
  const handleEnd = useCallback((secondsKept: number, reached: boolean) => {
    // Completion-gated: the day's Co-Breathe is only marked COMPLETE once the
    // full set (the 12th breath) is reached. An early end still shows the
    // summary of what they breathed, but does NOT count the card done, credit
    // the contemplation sit, or add them to today's communal count.
    const breaths = Math.max(0, Math.floor(secondsKept / (CYCLE_MS / 1000)));
    if (breaths < 1) { setLocation("/dashboard"); return; }
    if (reached) {
      logSit(secondsKept);          // credit the contemplation sit (full set only)
      record.mutate(secondsKept);   // count you in today's communal breath + mark done
    }
    // Heart to Heart is OFF — cobreathing with a fellow no longer starts a 1:1
    // prayer exchange (no Heart to Heart features are turned on).
    // The breaths actually taken — open-ended, NEVER floored to the target (four
    // breaths read as four, equal to any others). Drives the summary + the tally.
    setBreathsTaken(breaths);
    setMode("done");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On reaching the concluding screen, add this set to the week's tally once —
  // mirrors the slideshow overlay so both closes show the same count.
  useEffect(() => {
    if (mode !== "done") return;
    if (!talliedRef.current) { talliedRef.current = true; setWeekBreaths(addBreathsThisWeek(breathsTaken)); }
  }, [mode]);

  // Prefer the POST's snapshot once it lands; fall back to the GET while in
  // flight. The count includes me once recorded.
  const state = doneState ?? today ?? null;
  // "N other people" — subtract the caller once they're in the count.
  const others = Math.max(0, (state?.count ?? 0) - (state?.done ? 1 : 0));

  // The prayer slideshow is the intro to the practice — a full-screen immersive
  // overlay (no Layout chrome), rendered before the "before you begin" screen.
  // Its final slide's "Begin breathing" hands to the intro (Skip does too), so
  // the reader still lands on the length/settings screen before the breath.
  // Breathing is a full-screen portal — render it WITHOUT the Layout chrome
  // (app header + page background) so navigating in doesn't flash the page
  // behind the breath for a frame. (The breath's own opaque field covers the
  // screen from the first paint.)
  /**
   * The second intro slide: pick where you're breathing.
   *
   * Same shape as the opening slide it came from — eyebrow, big title, a line
   * of orientation, then the choices — so it reads as the next page of one
   * introduction rather than a settings screen bolted on.
   *
   * Each place shows how many have breathed there today, which is the whole
   * point of the feature: you're choosing to join people, not just tagging a
   * location.
   */
  if (mode === "location") {
    return (
      <Layout bgPhoto={introBgPhoto}>
        <div style={{ position: "relative", isolation: "isolate", display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
          <div className="max-w-xl mx-auto w-full flex flex-col flex-1 justify-start">
            <div className="flex flex-col items-center text-center pt-8">
              <p className="text-[11px] uppercase tracking-[0.22em] font-semibold mb-4" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}>
                {t("cobreathe.before_begin", { defaultValue: "Before you begin" })}
              </p>
              <h1 style={{ color: WARM, fontFamily: SPACE_GROTESK, fontWeight: 700, fontSize: "clamp(32px, 8.5vw, 46px)", lineHeight: 1.05, letterSpacing: "-0.02em", marginBottom: 14 }}>
                {t("cobreathe.location_title", { defaultValue: "Where are you breathing?" })}
              </h1>
              <p style={{ color: "rgba(240,237,230,0.85)", fontFamily: SPACE_GROTESK, fontSize: 15.5, lineHeight: 1.55, maxWidth: 420, marginBottom: 22 }}>
                {t("cobreathe.location_blurb", { defaultValue: "Choose a place and your breath joins everyone who has breathed there today." })}
              </p>

              <div className="w-full flex flex-col gap-2" style={{ maxWidth: 440 }}>
                {placesLoading && (
                  <p style={{ color: "rgba(200,212,192,0.7)", fontFamily: SPACE_GROTESK, fontSize: 14 }}>
                    {t("common.loading", { defaultValue: "Loading…" })}
                  </p>
                )}
                {!placesLoading && places.length === 0 && (
                  <p style={{ color: "rgba(200,212,192,0.7)", fontFamily: SPACE_GROTESK, fontSize: 14, lineHeight: 1.5 }}>
                    {t("cobreathe.location_none", { defaultValue: "No places have been set up yet. You can breathe anywhere — the practice is the same." })}
                  </p>
                )}
                {places.map((p) => {
                  const on = place?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={verifying}
                      onClick={() => pickPlace(p)}
                      className="w-full rounded-2xl py-3.5 px-4 text-left transition-opacity active:scale-[0.99]"
                      style={{
                        background: on ? "rgba(46,107,64,0.32)" : "rgba(9,26,16, 0.297)",
                        backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
                        border: `1px solid ${on ? "rgba(168,197,160,0.6)" : "rgba(168,197,160,0.25)"}`,
                        color: WARM, fontFamily: SPACE_GROTESK, cursor: verifying ? "wait" : "pointer",
                        opacity: verifying && !on ? 0.5 : 1,
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 15.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                        <span style={{ display: "block", fontSize: 13, color: "rgba(200,212,192,0.72)", marginTop: 2 }}>
                          {/* The count is the invitation. Zero is said plainly
                              rather than hidden — being the first today is a
                              real and good thing to be told. */}
                          {p.breathsToday > 0
                            ? t("cobreathe.location_count", { count: p.breathsToday, defaultValue: `${p.breathsToday} breathed here today` })
                            : t("cobreathe.location_first", { defaultValue: "Be the first here today" })}
                          {p.subtitle ? ` · ${p.subtitle}` : ""}
                        </span>
                      </span>
                      {on && (
                        <span style={{ flexShrink: 0, fontSize: 13, color: "rgba(200,212,192,0.85)" }}>
                          {verifying ? "…" : placeVerified ? "✓ here" : "✓"}
                        </span>
                      )}
                    </button>
                  );
                })}

                {place && (
                  <button
                    type="button"
                    onClick={() => { setPlace(null); setPlaceVerified(false); }}
                    style={{ background: "none", border: "none", color: "rgba(200,212,192,0.65)", fontFamily: SPACE_GROTESK, fontSize: 13.5, cursor: "pointer", padding: "8px 0", marginTop: 2 }}
                  >
                    {t("cobreathe.location_clear", { defaultValue: "Breathe without a place" })}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setMode("intro")}
                  className="w-full rounded-2xl py-4 text-center transition-opacity hover:opacity-90 active:scale-[0.99]"
                  style={{ marginTop: 10, background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: "1px solid rgba(168,197,160,0.45)", color: WARM, fontFamily: SPACE_GROTESK, fontSize: 17, fontWeight: 700, cursor: "pointer" }}
                >
                  {t("common.done", { defaultValue: "Done" })}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  /**
   * The place's own slide — what you just joined.
   *
   * Owner: "how many breaths and people have breathed there today, this month,
   * and all time."
   *
   * Today is ONE number, not two: breath_sessions is unique on (user, day), so
   * a single day's breaths and people are the same count by construction, and
   * printing them as two figures would imply a distinction that cannot exist.
   * Over a span the distinction is real and worth showing — thirty breaths
   * from three regulars is a different place from thirty people who each came
   * once — so the two spans carry both.
   */
  if (mode === "placeStats") {
    const st = placeStats;
    const row = (label: string, primary: string, secondary?: string) => (
      <div
        className="w-full rounded-2xl py-3.5 px-4"
        style={{
          background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
          border: "1px solid rgba(168,197,160,0.25)", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12,
        }}
      >
        <span style={{ color: "rgba(200,212,192,0.78)", fontFamily: SPACE_GROTESK, fontSize: 14 }}>{label}</span>
        <span style={{ textAlign: "right" }}>
          <span style={{ display: "block", color: WARM, fontFamily: SPACE_GROTESK, fontSize: 17, fontWeight: 700 }}>{primary}</span>
          {secondary && (
            <span style={{ display: "block", color: "rgba(200,212,192,0.65)", fontFamily: SPACE_GROTESK, fontSize: 12.5, marginTop: 1 }}>{secondary}</span>
          )}
        </span>
      </div>
    );
    return (
      <Layout bgPhoto={introBgPhoto}>
        <div style={{ position: "relative", isolation: "isolate", display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
          <div className="max-w-xl mx-auto w-full flex flex-col flex-1 justify-start">
            <div className="flex flex-col items-center text-center pt-8">
              <p className="text-[11px] uppercase tracking-[0.22em] font-semibold mb-4" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}>
                {verifying
                  ? t("cobreathe.place_checking", { defaultValue: "Checking you're here…" })
                  : placeVerified
                    ? t("cobreathe.place_here", { defaultValue: "You're here" })
                    : t("cobreathe.place_chosen", { defaultValue: "Breathing with" })}
              </p>
              <h1 style={{ color: WARM, fontFamily: SPACE_GROTESK, fontWeight: 700, fontSize: "clamp(30px, 8vw, 44px)", lineHeight: 1.05, letterSpacing: "-0.02em", marginBottom: 8 }}>
                {place?.name ?? ""}
              </h1>
              {place?.subtitle && (
                <p style={{ color: "rgba(200,212,192,0.72)", fontFamily: SPACE_GROTESK, fontSize: 14.5, marginBottom: 20 }}>{place.subtitle}</p>
              )}

              <div className="w-full flex flex-col gap-2" style={{ maxWidth: 440, marginTop: 14 }}>
                {statsLoading && !st && (
                  <p style={{ color: "rgba(200,212,192,0.7)", fontFamily: SPACE_GROTESK, fontSize: 14 }}>
                    {t("common.loading", { defaultValue: "Loading…" })}
                  </p>
                )}
                {st && (
                  <>
                    {/* One number: see the note above on why today can't have two. */}
                    {row(
                      t("cobreathe.stat_today", { defaultValue: "Today" }),
                      st.today === 1
                        ? t("cobreathe.stat_one_breath", { defaultValue: "1 breath" })
                        : t("cobreathe.stat_n_breaths", { count: st.today, defaultValue: `${st.today} breaths` }),
                    )}
                    {row(
                      t("cobreathe.stat_month", { defaultValue: "This month" }),
                      t("cobreathe.stat_n_breaths", { count: st.month.breaths, defaultValue: `${st.month.breaths} breaths` }),
                      t("cobreathe.stat_n_people", { count: st.month.people, defaultValue: `${st.month.people} ${st.month.people === 1 ? "person" : "people"}` }),
                    )}
                    {row(
                      t("cobreathe.stat_all_time", { defaultValue: "All time" }),
                      t("cobreathe.stat_n_breaths", { count: st.allTime.breaths, defaultValue: `${st.allTime.breaths} breaths` }),
                      t("cobreathe.stat_n_people", { count: st.allTime.people, defaultValue: `${st.allTime.people} ${st.allTime.people === 1 ? "person" : "people"}` }),
                    )}
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setMode("intro")}
                  className="w-full rounded-2xl py-4 text-center transition-opacity hover:opacity-90 active:scale-[0.99]"
                  style={{ marginTop: 12, background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: "1px solid rgba(168,197,160,0.45)", color: WARM, fontFamily: SPACE_GROTESK, fontSize: 17, fontWeight: 700, cursor: "pointer" }}
                >
                  {t("common.done", { defaultValue: "Done" })}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("location")}
                  style={{ background: "none", border: "none", color: "rgba(200,212,192,0.65)", fontFamily: SPACE_GROTESK, fontSize: 13.5, cursor: "pointer", padding: "8px 0" }}
                >
                  {t("cobreathe.place_change", { defaultValue: "Choose another place" })}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // First-time "how it works" — three slides after Begin, then the breath.
  if (mode === "howto") {
    return (
      <CobreatheHowToIntro
        onDone={() => { markCobreatheHowtoSeen(); setMode("breathing"); }}
        photos={breathPhotos}
      />
    );
  }

  if (mode === "breathing") {
    // Fade INTO the breath rather than hard-cutting from the intro — a gentle
    // half-second opacity rise as the practice takes over the screen. The
    // wrapper is a full-screen fixed layer so the fade reads cleanly over the
    // dark app background (no white flash, no jump).
    return (
      <motion.div
        style={{ position: "fixed", inset: 0, zIndex: 80 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <CobreatheBreath
          othersToday={others}
          todayCount={state?.count ?? 0}
          totalBreaths={lengthBreaths}
          // Tutorial pill on the sync/loading screen → the how-it-works slides;
          // returning to "breathing" re-mounts the breath, so it re-syncs.
          onTutorial={() => setMode("howto")}
          onReachTarget={handleReachTarget}
          onEnd={handleEnd}
          photos={breathPhotos}
          centerGlyph={place?.centerEmoji ?? null}
          followSeed={breathSync.leader?.masterSeed}
          followStartEpochMs={breathSync.leader?.startEpochMs}
          onSession={(info) => breathSync.announceSession(info.startEpochMs, info.masterSeed)}
          coBreathingFellows={coBreathingFellows}
        />
      </motion.div>
    );
  }

  // The concluding summary is ALSO a full-screen overlay rendered WITHOUT the
  // Layout — so finishing the breath swaps one full overlay for another rather
  // than mounting the whole home underneath (which flashed as it painted).
  if (mode === "done") {
    const othersDone = Math.max(0, (doneState?.count ?? 1) - 1);
    const summaryFaces: Companion[] = (() => {
      const byId = new Map<number, Companion>();
      for (const c of (doneState?.companions ?? state?.companions ?? [])) byId.set(c.userId, c);
      for (const [id, c] of coBreathed) if (!byId.has(id)) byId.set(id, c);
      if (user?.id != null) byId.delete(user.id);
      return Array.from(byId.values());
    })();
    if (!doneState && record.isError) {
      return (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center text-center px-6"
          style={{ background: "radial-gradient(120% 80% at 50% 30%, #122E20 0%, #0A1C14 65%)", paddingTop: "var(--safe-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="text-5xl mb-5">🌍</div>
          <h2 className="text-[1.4rem] font-bold mb-3 px-4" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
            {t("cobreathe.save_failed", { defaultValue: "Your breath didn't save" })}
          </h2>
          <p className="text-[14px] leading-relaxed px-6 mb-8" style={{ color: SAGE, fontFamily: SERIF, fontStyle: "italic" }}>
            {t("cobreathe.save_failed_sub", { defaultValue: "The breath you kept is real — we just couldn't reach the server to count it. Try again." })}
          </p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => record.mutate(record.variables ?? 0)} disabled={record.isPending}
              className="rounded-xl py-3 px-8"
              style={{ background: "rgba(62,124,122,0.22)", color: WARM, border: "1px solid rgba(62,124,122,0.5)", fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: 600, cursor: record.isPending ? "default" : "pointer", opacity: record.isPending ? 0.6 : 1 }}>
              {record.isPending ? t("common.saving", { defaultValue: "Saving…" }) : t("common.try_again", { defaultValue: "Try again" })}
            </button>
            <button type="button" onClick={() => setMode("intro")} className="rounded-xl py-3 px-6"
              style={{ background: "transparent", color: SAGE, border: "1px solid rgba(143,175,150,0.4)", fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              {t("common.not_now", { defaultValue: "Not now" })}
            </button>
          </div>
        </div>
      );
    }
    return (
      <CobreatheSummary
        breathsTaken={breathsTaken}
        weekBreaths={weekBreaths}
        others={othersDone}
        companions={summaryFaces}
        onContinue={() => setLocation("/")}
      />
    );
  }

  return (
    <Layout bgPhoto={introBgPhoto}>
      <div style={{ position: "relative", isolation: "isolate", display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <div className="max-w-xl mx-auto w-full flex flex-col flex-1 justify-start">
        {/* "Before you begin" intro — same shape as a devotion's opening slide
            (centered eyebrow + big title + a few lines + setting rows + Begin).
            This screen only renders in intro mode (the breath + summary return
            earlier), so the centered title can lead. */}
        <div className="flex flex-col items-center text-center pt-8">
          <p className="text-[11px] uppercase tracking-[0.22em] font-semibold mb-4" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}>
            {t("cobreathe.before_begin", { defaultValue: "Before you begin" })}
          </p>
          <h1 style={{ color: WARM, fontFamily: SPACE_GROTESK, fontWeight: 700, fontSize: "clamp(40px, 11vw, 60px)", lineHeight: 1.05, letterSpacing: "-0.02em", marginBottom: 18 }}>
            {t("cobreathe.title", { defaultValue: "Creation Prayer" })}
          </h1>
          <p style={{ color: "rgba(240,237,230,0.9)", fontFamily: SPACE_GROTESK, fontSize: 17, lineHeight: 1.55, maxWidth: 440, marginBottom: 26 }}>
            {t("cobreathe.intro_blurb", { defaultValue: "We pause to breathe with all life, in gratitude and in recognition of our need to work together to protect our common home." })}
          </p>

          <div className="w-full" style={{ maxWidth: 440 }}>
            <div style={{ height: 1, background: "rgba(200,212,192,0.14)", marginBottom: 14 }} />

            {/* Breath-count selector — restored per owner. Writes the same
                phoebe:cobreathe-length key the customizer's Creation Prayer
                "How many breaths?" step reads/writes, so a pick here stays in
                sync with that preset either direction. */}
            <div className="flex items-center justify-between" style={{ padding: "10px 2px" }}>
              <span style={{ color: "rgba(240,237,230,0.85)", fontFamily: SPACE_GROTESK, fontSize: 14.5 }}>
                {t("cobreathe.how_many_breaths", { defaultValue: "How many breaths?" })}
              </span>
              <select
                value={lengthBreaths}
                onChange={(e) => chooseLengthBreaths(parseInt(e.target.value, 10))}
                style={{
                  background: "rgba(9,26,16,0.5)",
                  color: WARM,
                  fontFamily: SPACE_GROTESK,
                  fontSize: 14.5,
                  fontWeight: 600,
                  border: "1px solid rgba(168,197,160,0.4)",
                  borderRadius: 10,
                  padding: "8px 12px",
                  cursor: "pointer",
                }}
              >
                {[6, 12, 18, 24, 30, 36].map((n) => (
                  <option key={n} value={n} style={{ background: "#091A10", color: WARM }}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <p style={{ color: "rgba(200,212,192,0.7)", fontFamily: SPACE_GROTESK, fontSize: 13.5, lineHeight: 1.5, marginTop: 4, textAlign: "center" }}>
              {t("cobreathe.invite_note", { defaultValue: "An invitation, not a goal — breathe as many as you have in you, and stop whenever you like." })}
            </p>

            <div style={{ height: 1, background: "rgba(200,212,192,0.14)", marginTop: 14, marginBottom: 14 }} />

            {/* Owner: "a button on the opening slide that says Enter location,
                that would go to a second intro slide where they pick the
                location." Once a place is chosen the button becomes the place
                — it's both the entry point and the current state, so there's
                no separate row restating what was picked. */}
            <button
              type="button"
              onClick={() => setMode("location")}
              className="w-full rounded-2xl py-3.5 px-4 mb-3 transition-opacity hover:opacity-90 active:scale-[0.99]"
              style={{
                background: place ? "rgba(46,107,64,0.28)" : "rgba(9,26,16, 0.297)",
                backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
                border: `1px solid ${place ? "rgba(168,197,160,0.55)" : "rgba(168,197,160,0.28)"}`,
                color: WARM, fontFamily: SPACE_GROTESK, fontSize: 15, fontWeight: 600,
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span aria-hidden>📍</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {place ? place.name : t("cobreathe.enter_location", { defaultValue: "Enter location" })}
                </span>
              </span>
              <span style={{ flexShrink: 0, color: "rgba(200,212,192,0.7)", fontSize: 13 }}>
                {place && placeVerified ? "✓" : "›"}
              </span>
            </button>

            {/* Begin — into the synced breath (a first-timer sees the one-time
                "how it works" intro first). */}
            <button
              type="button"
              onClick={() => setMode(cobreatheHowtoSeen() ? "breathing" : "howto")}
              className="w-full rounded-2xl py-4 text-center transition-opacity hover:opacity-90 active:scale-[0.99]"
              style={{ background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: "1px solid rgba(168,197,160,0.45)", color: WARM, fontFamily: SPACE_GROTESK, fontSize: 17, fontWeight: 700, cursor: "pointer" }}
            >
              {t("cobreathe.begin_short", { defaultValue: "Start Breathing" })}
            </button>

          </div>
        </div>

      </div>
      </div>
    </Layout>
  );
}
