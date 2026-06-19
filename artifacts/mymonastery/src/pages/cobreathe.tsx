import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { CobreatheBreath, DEFAULT_TOTAL_BREATHS, CYCLE_MS } from "@/components/CobreatheBreath";
import { CobreatheSummary } from "@/components/CobreatheSummary";
import { addBreathsThisWeek } from "@/lib/cobreatheTally";
import { useAuth } from "@/hooks/useAuth";
import { usePeople } from "@/hooks/usePeople";
import { useCobreatheSync } from "@/hooks/useCobreatheSync";
import { useBetaStatus } from "@/hooks/useDemo";
import { BreathNearInvite } from "@/components/BreathNearInvite";
import { useKeepAwake } from "@/hooks/useKeepAwake";
import { computeFingerprint } from "@/lib/cobreatheOrder";
import { getBreathBucket } from "@/lib/breathGeohash";
import { COBREATHE_INTRO_SEEN_KEY } from "@/pages/cobreathe-about";

// The Cobreathe photo library — every image in src/assets/cobreathe is bundled
// (hashed + optimized by Vite) and rotated through during the breath, one photo
// per breath, shuffled per session. Drop a new photo into that folder and it
// joins the rotation automatically; no manifest to edit.
const COBREATHE_PHOTOS = Object.values(
  import.meta.glob("@/assets/cobreathe/*.{jpg,jpeg,png,avif,webp}", {
    eager: true,
    query: "?url",
    import: "default",
  }),
) as string[];

// Fingerprint of the bundled photo set — two clients only sync if it matches,
// so a build/version drift (different photos) safely falls back to solo order.
const COBREATHE_FINGERPRINT = computeFingerprint(COBREATHE_PHOTOS);

function wantsStart(): boolean {
  try { return new URLSearchParams(window.location.search).get("start") === "1"; } catch { return false; }
}
// True once the user has seen the one-page Cobreathe intro at least once.
function introSeen(): boolean {
  try { return localStorage.getItem(COBREATHE_INTRO_SEEN_KEY) === "1"; } catch { return false; }
}
// Launched from the contemplation page / sit? Those entry points pass
// ?from=contemplation, and finishing then shows the summary screen (and returns
// to /contemplation) instead of slipping straight back.
function cameFromContemplation(): boolean {
  try { return new URLSearchParams(window.location.search).get("from") === "contemplation"; } catch { return false; }
}

// Cobreathe — from "conspire", con + spirare, to breathe together.
// A short daily guided breath held as embodied prayer for justice: not
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

// Two-letter fallback for a companion with no avatar.
function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "·";
}

// First names, prose-joined: "Maria", "Maria and James", "Maria, James, and 3 others".
function companionLine(companions: Companion[], totalCount: number): string {
  const names = companions.map((c) => (c.name ?? "").trim().split(/\s+/)[0]).filter(Boolean).slice(0, 2);
  if (names.length === 0) return "";
  const extra = totalCount - names.length;
  if (extra <= 0) return names.join(" and ");
  return `${names.join(", ")}, and ${extra} other${extra === 1 ? "" : "s"}`;
}

// Overlapping face row for garden members who cobreathed today.
function Faces({ companions }: { companions: Companion[] }) {
  if (companions.length === 0) return null;
  return (
    <div className="flex items-center">
      {companions.slice(0, 6).map((c, i) => (
        <div
          key={c.userId}
          className="w-7 h-7 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0"
          style={{
            marginLeft: i === 0 ? 0 : -8,
            border: "1.5px solid #0F2818",
            background: "rgba(62,124,122,0.45)",
            zIndex: 10 - i,
          }}
        >
          {c.avatarUrl ? (
            <img src={c.avatarUrl} alt={c.name ?? ""} className="w-full h-full object-cover" />
          ) : (
            <span style={{ color: WARM, fontSize: 10, fontWeight: 700, fontFamily: SPACE_GROTESK }}>
              {initials(c.name ?? "")}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function CobreathePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const day = localDay();
  const focus = WEEKLY_FOCI[weekOfYear(new Date()) % WEEKLY_FOCI.length];

  const [, setLocation] = useLocation();
  // Opened with ?start=1 → go straight into the breath, BUT only once the user
  // has been through the intro slideshow. First-timers are sent through the
  // slideshow first (the effect below), which begins the breath at its end.
  // First-time users see a single intro page (the practice + the why) before the
  // breath; after that, starting goes straight in.
  const [mode, setMode] = useState<"intro" | "options" | "breathing" | "done">(() =>
    wantsStart() && introSeen() ? "options" : "intro",
  );
  // Per-sit opt-in to an IN-PERSON session: share presence + a coarse location
  // bucket so the breath can show who's breathing near you right now. Chosen on
  // the options slide below; never persisted, just this sit.
  const [joinInPerson, setJoinInPerson] = useState(false);
  // Hold the screen on while breathing — the breath has no touch input, so the
  // idle timer would otherwise dim/sleep the phone mid-sit.
  useKeepAwake(mode === "breathing");
  useEffect(() => {
    if (wantsStart() && !introSeen()) setLocation("/cobreathe/about");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apple Music over the breath (native plugin CobreatheMusic; no-ops on web and
  // until a real catalog playlist + an Apple Music subscription exist). Opt-in.
  // Start when the breath is active AND the user enabled it; stop on exit/unmount.
  const [musicOn, setMusicOn] = useState<boolean>(() => {
    try { return localStorage.getItem("phoebe:cobreathe-music") === "1"; } catch { return false; }
  });
  const toggleMusic = () => setMusicOn((on) => {
    const next = !on;
    try { localStorage.setItem("phoebe:cobreathe-music", next ? "1" : "0"); } catch { /* ignore */ }
    return next;
  });
  useEffect(() => {
    const ev = (mode === "breathing" && musicOn) ? "phoebe:cobreathe-music-start" : "phoebe:cobreathe-music-stop";
    window.dispatchEvent(new CustomEvent(ev));
  }, [mode, musicOn]);
  useEffect(() => () => { window.dispatchEvent(new CustomEvent("phoebe:cobreathe-music-stop")); }, []);
  // The toggle only appears when music can ACTUALLY play: iOS + the native
  // CobreatheMusic plugin registered + a real playlist configured (native-shell
  // sets __cobreatheMusicReady). Never a control that silently does nothing.
  const musicAvailable = (() => {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string; Plugins?: Record<string, unknown> } }).Capacitor;
    return cap?.getPlatform?.() === "ios"
      && !!cap?.Plugins?.["CobreatheMusic"]
      && (window as unknown as { __cobreatheMusicReady?: boolean }).__cobreatheMusicReady === true;
  })();

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
  // "Same air" (beta): share a coarse location bucket while breathing so we can
  // surface who's nearby. Only when beta AND the user has opted in.
  const { isBeta } = useBetaStatus();
  const shareBreathLocation = isBeta && !!user?.shareBreathLocation;
  const breathSync = useCobreatheSync(user, gardenUserIds, {
    fingerprint: COBREATHE_FINGERPRINT,
    active: mode === "breathing",
    // Opting into an in-person session shares location for this sit and turns
    // presence on for it (overriding the global setting), so "same air" works
    // even if the persistent toggle is off. `shareCoords` (in-person only) shares
    // PRECISE coords for the map; the plain coarse toggle stays geohash-only.
    shareLocation: shareBreathLocation || joinInPerson,
    presence: joinInPerson,
    shareCoords: joinInPerson,
  });

  // "Same air" peak for the after-glow: nearby state clears the moment breathing
  // stops, so hold onto the high-water mark of this sit to show on the summary.
  const [peakNear, setPeakNear] = useState<{ count: number; fellows: typeof breathSync.nearbyFellows }>({ count: 0, fellows: [] });
  useEffect(() => {
    if (mode === "breathing" && breathSync.nearbyCount > peakNear.count) {
      setPeakNear({ count: breathSync.nearbyCount, fellows: breathSync.nearbyFellows });
    }
  }, [mode, breathSync.nearbyCount, breathSync.nearbyFellows, peakNear.count]);

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

  const record = useMutation({
    mutationFn: (seconds: number) =>
      apiRequest<BreathState & { ok: boolean }>("POST", "/api/breath/today", {
        day,
        seconds,
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
  const sitLoggedRef = useRef(false);
  const logSit = useCallback((secondsKept: number) => {
    if (sitLoggedRef.current || secondsKept < 30) return;
    sitLoggedRef.current = true;
    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - secondsKept * 1000);
    void apiRequest("POST", "/api/prayer-sessions", {
      surface: "contemplation",
      source: "cobreathe",
      durationSeconds: secondsKept,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      isPrivate: false,
    })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-sessions"] });
      })
      .catch(() => { /* best-effort */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reaching the 12th breath records the day's communal breath (the count +
  // who's breathing). We do NOT log the contemplation sit here — the breath
  // keeps going past 12, and we want history/stats to credit the FULL length
  // the user actually sat, not just the first twelve. The sit is logged on
  // finish (handleEnd) with the real elapsed time.
  const handleReachTarget = useCallback((secondsKept: number) => {
    record.mutate(secondsKept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Captured once at mount: did we arrive from the contemplation page/sit?
  const fromContemplationRef = useRef(cameFromContemplation());

  // Finishing (or backing out). A sit only COUNTS if the user completed the set
  // (reached the 12th breath). Cancelling or bailing early does NOT log a
  // contemplation sit — nothing toward the daily goal, history, or Apple Health.
  // When it does count, it's logged with the FULL elapsed time (20 breaths = 20).
  const handleEnd = useCallback((secondsKept: number, reached: boolean) => {
    const fromContemplation = fromContemplationRef.current;
    if (!reached) {
      // X / bailed early — does not count. Go to the home screen. (The office
      // slideshow runs Cobreathe as a separate overlay (CobreatheOverlay) whose
      // X returns to the slideshow — "unless you're in the slideshow, go back".)
      setLocation("/dashboard");
      return;
    }
    logSit(secondsKept);
    record.mutate(secondsKept);
    // Cobreathing one-to-one with a fellow STARTS a Heart to Heart with them
    // (and counts toward Walking Together). Only when the user opted into the
    // "Breathe with a fellow" mode AND someone was actually breathing live with
    // them; the server filters the ids to real fellows before pairing.
    if (joinInPersonRef.current) {
      const ids = Array.from(coBreathedRef.current.keys());
      if (ids.length > 0) {
        void apiRequest("POST", "/api/breath/together-with", { fellowIds: ids }).catch(() => { /* best-effort */ });
      }
    }
    // The actual breaths taken — open-ended, so derive from elapsed (one breath
    // per CYCLE_MS). Floored at the 12 target. Drives the summary headline + tally.
    setBreathsTaken(Math.max(DEFAULT_TOTAL_BREATHS, Math.round(secondsKept / (CYCLE_MS / 1000))));
    // From the contemplation page → show the summary screen; otherwise return
    // straight to contemplation as before.
    if (fromContemplation) setMode("done"); else setLocation("/contemplation");
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
  const withLine = state ? companionLine(state.companions, state.companionCount) : "";

  // Pre-practice options slide — reached from the contemplation picker and the
  // intro "Begin" CTA. Lets the user opt into an in-person session (share a
  // coarse location to see who's breathing near them) before tapping Start.
  if (mode === "options") {
    return (
      <Layout>
        {/* A calm begin slide — like the start of a contemplation sit: a soft
            light-green gradient field, the content resting in the centre. No
            globe emoji here (the globe lives in the breath itself). */}
        <div
          className="flex flex-col w-full"
          style={{
            minHeight: "calc(100dvh - var(--safe-top) - 56px)",
            background: "radial-gradient(130% 80% at 50% 14%, rgba(70,140,96,0.34) 0%, rgba(34,82,56,0.20) 40%, rgba(12,36,23,0.04) 66%, rgba(10,24,16,0) 80%)",
          }}
        >
          <div className="flex flex-col flex-1 w-full max-w-md mx-auto px-6 pt-5 pb-10">
            <button
              type="button"
              onClick={() => { if (cameFromContemplation()) setLocation("/contemplation"); else setMode("intro"); }}
              className="self-start text-[13px] transition-opacity hover:opacity-80"
              style={{ color: SAGE, fontFamily: SPACE_GROTESK, background: "transparent", cursor: "pointer" }}
            >
              ← {t("common.back", { defaultValue: "Back" })}
            </button>

            {/* Title + the one choice, resting in the centre of the field. */}
            <div className="flex-1 flex flex-col justify-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-center" style={{ color: "rgba(180,210,188,0.75)", fontFamily: SPACE_GROTESK }}>
                {t("cobreathe.title", { defaultValue: "Cobreathe" })}
              </p>
              <h1 className="text-[30px] font-bold mt-2.5 mb-2 text-center leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                {t("cobreathe.options_title", { defaultValue: "Twelve breaths, together" })}
              </h1>
              <p className="text-[14.5px] mb-8 text-center leading-relaxed mx-auto" style={{ color: SAGE, fontFamily: SERIF, fontStyle: "italic", maxWidth: 300 }}>
                {t("cobreathe.options_sub", { defaultValue: "A shared breath for climate justice. Choose how you'll breathe, then begin." })}
              </p>

              {/* In-person session opt-in — share a coarse location for this sit. */}
              <button
                type="button"
                role="switch"
                aria-checked={joinInPerson}
                onClick={() => {
                  const next = !joinInPerson;
                  setJoinInPerson(next);
                  // Warm the location grant NOW (on the slide) rather than mid-breath.
                  if (next) getBreathBucket({ force: false }).catch(() => undefined);
                }}
                className="w-full rounded-2xl p-4 flex items-start gap-3 text-left transition-colors active:scale-[0.99]"
                style={{
                  background: joinInPerson ? "rgba(46,107,64,0.30)" : "rgba(20,46,30,0.45)",
                  border: `1px solid ${joinInPerson ? "rgba(110,180,130,0.65)" : "rgba(110,160,128,0.28)"}`,
                  backdropFilter: "blur(2px)",
                }}
              >
                <span style={{ fontSize: 22, lineHeight: 1.1 }} aria-hidden>📍</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                    {t("cobreathe.in_person_title", { defaultValue: "Breathe with a fellow" })}
                  </span>
                  <span className="block text-[12.5px] mt-0.5 leading-snug" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                    {t("cobreathe.in_person_sub", { defaultValue: "Share your location to breathe one-to-one with your fellows — together in person, or joined across the miles on a map. Just for this sit." })}
                  </span>
                </span>
                <span className="shrink-0 mt-0.5 relative" style={{ width: 44, height: 26, borderRadius: 999, background: joinInPerson ? "rgba(46,107,64,0.9)" : "rgba(143,175,150,0.25)", border: `1px solid ${joinInPerson ? "rgba(110,180,130,0.7)" : "rgba(143,175,150,0.35)"}`, transition: "background 0.16s" }}>
                  <span style={{ position: "absolute", top: 2, left: joinInPerson ? 20 : 2, width: 20, height: 20, borderRadius: 999, background: "#F0EDE6", transition: "left 0.16s ease" }} />
                </span>
              </button>
            </div>

            {/* Start the breath — anchored at the foot of the field. */}
            <button
              type="button"
              onClick={() => { setPeakNear({ count: 0, fellows: [] }); setCoBreathed(new Map()); setMode("breathing"); }}
              className="w-full rounded-2xl py-4 text-center transition-opacity hover:opacity-90 active:scale-[0.99]"
              style={{ background: "#2D5E3F", color: WARM, border: "1px solid rgba(140,195,160,0.6)", fontFamily: SPACE_GROTESK, fontSize: 16.5, fontWeight: 700, cursor: "pointer", boxShadow: "0 6px 22px rgba(8,30,18,0.45)" }}
            >
              {t("cobreathe.start", { defaultValue: "Start" })}
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  // Breathing is a full-screen portal — render it WITHOUT the Layout chrome
  // (app header + page background) so navigating in doesn't flash the page
  // behind the breath for a frame. (The breath's own opaque field covers the
  // screen from the first paint.)
  if (mode === "breathing") {
    return (
      <CobreatheBreath
        othersToday={others}
        todayCount={state?.count ?? 0}
        onReachTarget={handleReachTarget}
        onEnd={handleEnd}
        photos={COBREATHE_PHOTOS}
        followSeed={breathSync.leader?.masterSeed}
        followStartEpochMs={breathSync.leader?.startEpochMs}
        onSession={(info) => breathSync.announceSession(info.startEpochMs, info.masterSeed)}
        nearbyCount={breathSync.nearbyCount}
        nearbyFellows={breathSync.nearbyFellows}
        mapFellows={breathSync.mapFellows}
        myLoc={breathSync.myLoc}
        coBreathingFellows={coBreathingFellows}
      />
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
          <div className="text-5xl mb-5">🌬️</div>
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
        nearCount={peakNear.count}
        nearFellows={peakNear.fellows}
        onContinue={() => setLocation("/")}
      />
    );
  }

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full flex flex-col flex-1">
        {/* Header */}
        <div className="flex items-start gap-3 mb-5">
          <div
            className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0"
            style={{ background: "rgba(62,124,122,0.18)", border: "1px solid rgba(62,124,122,0.35)" }}
          >
            🌬️
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                {t("cobreathe.title", { defaultValue: "Cobreathe" })}
              </h1>
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: "rgba(193,127,36,0.18)", border: "1px solid rgba(193,127,36,0.45)", color: "#D9A45B", fontFamily: SPACE_GROTESK }}
              >
                {t("common.beta", { defaultValue: "Beta" })}
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: SAGE }}>
              {t("cobreathe.subtitle", { defaultValue: "An embodied prayer for justice" })}
            </p>
          </div>
        </div>

        {mode === "intro" && (
          <>
            {/* ── Stats hero — who has breathed today, leading the page.
                The big number is the practice's heartbeat; faces make the
                "we" concrete; the small row underneath carries your own
                days and the all-time count. */}
            <div
              className="rounded-2xl p-5 mb-4"
              style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.30)" }}
            >
              <div className="flex items-center gap-4">
                <span className="text-3xl">🫁</span>
                <div className="flex-1 min-w-0">
                  <p className="leading-none" style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 34, fontWeight: 700 }}>
                    {state?.count ?? 0}
                  </p>
                  <p className="text-[12.5px] mt-1.5 leading-snug" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                    {today?.done
                      ? others === 0
                        ? t("cobreathe.stats_done_first", { defaultValue: "breathed today — you were the first breath of the day" })
                        : t("cobreathe.stats_done", { count: others, defaultValue: `breathed today, you among them — with ${others} other ${others === 1 ? "person" : "people"}` })
                      : (state?.count ?? 0) === 0
                        ? t("cobreathe.stats_none_yet", { defaultValue: "have breathed yet today — yours can be the first breath" })
                        : t("cobreathe.stats_count", { defaultValue: "breathed today — join your breath to theirs" })}
                  </p>
                </div>
              </div>
              {state && state.companions.length > 0 && (
                <div className="flex items-center gap-2 mt-3.5">
                  <Faces companions={state.companions} />
                  <p className="text-[12px]" style={{ color: "rgba(143,175,150,0.75)", fontFamily: SPACE_GROTESK }}>
                    {t("cobreathe.including", { names: withLine, defaultValue: `including ${withLine}` })}
                  </p>
                </div>
              )}
              {state && (state.myDays > 0 || state.allBreaths > 0) && (
                <div className="flex gap-3 mt-4 pt-3.5" style={{ borderTop: "1px solid rgba(46,107,64,0.22)" }}>
                  <div className="flex-1">
                    <p className="leading-none" style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 19, fontWeight: 700 }}>
                      {state.myDays}
                    </p>
                    <p className="text-[11px] mt-1" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SPACE_GROTESK }}>
                      {t("cobreathe.stats_my_days", { defaultValue: "days you've breathed" })}
                    </p>
                  </div>
                  <div className="flex-1">
                    <p className="leading-none" style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 19, fontWeight: 700 }}>
                      {state.allBreaths.toLocaleString()}
                    </p>
                    <p className="text-[11px] mt-1" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SPACE_GROTESK }}>
                      {t("cobreathe.stats_all", { defaultValue: "breaths held across Phoebe" })}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ── CTA — right under the stats, above the teaching. */}
            <button
              type="button"
              onClick={() => setMode("options")}
              className="w-full rounded-xl py-3.5 text-center transition-opacity hover:opacity-90 active:scale-[0.99]"
              style={{
                background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)",
                fontFamily: SPACE_GROTESK, fontSize: 16, fontWeight: 600, cursor: "pointer",
              }}
            >
              {today?.done
                ? t("cobreathe.begin_again", { defaultValue: "Breathe again" })
                : t("cobreathe.begin", { defaultValue: "Cobreathe — twelve breaths" })}
            </button>

            {/* Apple Music over the breath — opt-in. Shown ONLY when it can
                actually play: iOS + the native CobreatheMusic plugin registered
                + a real playlist configured. Never a control that does nothing. */}
            {musicAvailable && (
              <button type="button" onClick={toggleMusic} aria-pressed={musicOn}
                className="mt-3 mx-auto flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold active:scale-[0.97]"
                style={{
                  background: musicOn ? "rgba(46,107,64,0.85)" : "rgba(46,107,64,0.10)",
                  color: musicOn ? WARM : "rgba(143,175,150,0.9)",
                  border: `1px solid ${musicOn ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.3)"}`,
                  fontFamily: SPACE_GROTESK,
                }}>
                ♪ {musicOn
                  ? t("cobreathe.music_on", { defaultValue: "Music on" })
                  : t("cobreathe.music_off", { defaultValue: "Play music while you breathe" })}
              </button>
            )}

            <p className="text-[12px] mt-3 text-center px-4" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SERIF, fontStyle: "italic" }}>
              {t("cobreathe.caption", { defaultValue: "About two and a half minutes — it counts toward your contemplation goal. Sit comfortably; let the circle pace you." })}
            </p>

            {/* "Same air" opt-in (beta) — shown once, only before the breath. */}
            <BreathNearInvite />

            <div className="mb-6" />

            {/* ── Information — the weekly intention, then the teaching. */}

            {/* This week's intention */}
            <div
              className="rounded-2xl p-4 mb-4 flex gap-3"
              style={{ background: "rgba(193,127,36,0.08)", border: "1px solid rgba(193,127,36,0.28)" }}
            >
              <span className="text-2xl leading-none mt-0.5">{focus.emoji}</span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: "#D9A45B", fontFamily: SPACE_GROTESK }}>
                  {t("cobreathe.this_week", { defaultValue: "This week we breathe for" })}
                </p>
                <p className="text-[14px] font-bold mb-0.5" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                  {t(`cobreathe.focus.${focus.key}.title`, { defaultValue: focus.title })}
                </p>
                <p className="text-[13px] leading-relaxed" style={{ color: SAGE, fontFamily: SERIF, fontStyle: "italic" }}>
                  {t(`cobreathe.focus.${focus.key}.line`, { defaultValue: focus.line })}
                </p>
              </div>
            </div>

            {/* Learn more — the con-spire framing, the essay, and the justice
                grounding now live on their own page so this screen stays
                focused on the breath. */}
            <div className="flex justify-center mt-2">
              <Link
                href="/cobreathe/about"
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 transition-opacity hover:opacity-90"
                style={{
                  background: "rgba(62,124,122,0.12)",
                  border: "1px solid rgba(62,124,122,0.32)",
                  color: "#A8CFC4",
                  fontFamily: SPACE_GROTESK,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                🌬️ {t("cobreathe.learn_more", { defaultValue: "Learn more about cobreathing" })}
              </Link>
            </div>
          </>
        )}

      </div>
    </Layout>
  );
}
