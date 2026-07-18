import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { useOfficePrefs, setOfficeAudioSource, type OfficeAudioSource } from "@/lib/officePrefs";
import { isNativeShell } from "@/lib/isNativeShell";
import { WIDE_PHOTOS } from "@/lib/wideBackgrounds";
import { markComplete as markCourseLessonComplete } from "@/lib/courseProgress";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";

// ≥2 minutes of actual listening to a (non-office) podcast counts the
// "Podcasts" daily practice as kept — if the user has it as a practice.
const PODCAST_PRACTICE_CREDIT_SECONDS = 120;
// Is the Podcasts optional practice on the user's home layout? (Same rule as
// useRhythmState's homeCardActive — inlined to avoid exporting it.)
function podcastsPracticeActive(homeLayout: { order?: string[]; hidden?: string[] } | null | undefined): boolean {
  if (!homeLayout) return false;
  const order = homeLayout.order ?? [];
  const hidden = new Set(homeLayout.hidden ?? []);
  return order.includes("podcasts") && !hidden.has("podcasts");
}

// ── Global podcast player ────────────────────────────────────────────────
//
// A single <audio> element + mini-player bar mounted ABOVE the router, so
// playback survives navigation — you can browse the library (or the rest
// of Phoebe) while an episode keeps playing. Pages call usePodcastPlayer()
// .play(episode) to start something.
//
// Resume: playback position is saved per episode in localStorage
// (throttled + on pause/close/background) and restored on play, so long
// CAC / Finley episodes pick up where you left off.
//
// Engagement side-effects live here (not per-page) so they fire no matter
// which screen launched playback:
//   • POST /api/podcasts/listens once per episode  → listening history
//   • POST /api/prayer-sessions (surface "podcast") → time-listening,
//     accumulated while actually playing, flushed on episode-change /
//     close / background.

export type PlayingEpisode = {
  showSlug: string;
  episodeId: string;
  title: string | null;
  audioUrl: string;
  imageUrl?: string | null;
  showTitle?: string | null;
  showArtwork?: string | null;
  durationSeconds?: number | null;
  publishedAt?: string | null;
  description?: string | null;
  // ── Office / non-podcast playback (all optional; podcast defaults) ──
  // The daily-office pages play through this same player so they get the
  // persistent mini-bar + minimize. These tags let one episode behave as
  // an office rather than a podcast without forking the player.
  //
  // Prayer-session surface to log (default "podcast"). The office passes
  // "morning-office-podcast" / "evening-office-podcast".
  sessionSurface?: string;
  // When set, a session >= 180s stamps the local office-completed flag
  // (phoebe:office-completed:<mode>:<date>) so the dashboard lights up.
  creditMode?: "morning" | "evening";
  // Skip the listening-history write — the daily office changes every day
  // and is tracked via prayer-sessions, not the podcast history.
  skipHistory?: boolean;
  /** Weekly-plan episode item — auto-complete the checklist item once ≥60%
   *  of the episode has been heard (fires once per play; the checklist's
   *  manual circle-tap remains the fallback). */
  creditWeeklyItem?: { groupSlug: string; itemId: number };
  // Hide the Recommend (♡) action — a daily office isn't a shareable ep.
  hideRecommend?: boolean;
  // Override the "view show" link target — offices have no /podcasts/show
  // page, so they link back to their own player route.
  showHref?: string;
  // Where to go once this episode finishes playing (used by the daily
  // office: when the read-aloud office ends, hand off to its closing flow /
  // newsletter). Only navigated if the full-screen player is still open, so
  // a backgrounded listen doesn't yank the user mid-task.
  afterEndHref?: string;
  // When set, finishing this episode marks the given course lesson complete —
  // so listening a Way of Love episode to its end completes that practice (and
  // finishing the series completes the course). See onEndedEv.
  courseComplete?: { courseId: string; lessonKey: string };
  // ── Segment playback (scripture readings) ──
  // Start at this offset (seconds) instead of the saved resume position — e.g.
  // tapping "Gospel" brings the episode up at the Gospel's start — and pause
  // once playback reaches stopAtSeconds, so a single reading plays just its
  // part and then stops. A later manual scrub/skip releases the stop.
  startAtSeconds?: number;
  stopAtSeconds?: number;
  // When a segment (stopAtSeconds) finishes, collapse the full-screen player
  // back to the mini-bar instead of staying open — used by the office
  // slideshow so a lesson's "Listen" returns to the slides when it ends.
  collapseOnStop?: boolean;
  // Fired once when a segment (stopAtSeconds) finishes — lets a caller chain the
  // next segment itself (the Listen-to-Scripture play-through: passage → chime →
  // next passage).
  onSegmentEnd?: () => void;
  // For a chained play-through (Listen-to-Scripture): when this segment reaches
  // stopAtSeconds, do NOT pause — keep the <audio> playing so onSegmentEnd can
  // seek straight to the next in-scope reading. Pausing here and resuming ~1.5s
  // later (after the chime) is autoplay-gated on iOS, so the next reading would
  // never start. The LAST reading in a chain leaves this false so it stops
  // normally at its end.
  seekThroughOnStop?: boolean;
  // When set, the full-screen player shows this small eyebrow over the artwork
  // above `title` — used by Listen to Scripture to label the part being read
  // ("Psalm" / "Gospel"), with the citation as the title.
  segmentEyebrow?: string | null;
};

type PlayerCtx = {
  current: PlayingEpisode | null;
  isPlaying: boolean;
  // opts.expand defaults to true (open the full-screen listener). Pass
  // { expand: false } to start playback in the mini-bar only — e.g. the
  // FDD reflection's "Listen" button, which keeps the reflection on screen.
  play: (ep: PlayingEpisode, opts?: { expand?: boolean }) => void;
  playQueue: (eps: PlayingEpisode[]) => void;
  toggle: () => void;
  isCurrent: (showSlug: string, episodeId: string) => boolean;
  // Dismiss the player (stops playback, slides the mini-bar down). Used e.g. when
  // a psalm segment finishes and the office skips past the psalm slides.
  close: () => void;
};

const Ctx = createContext<PlayerCtx | null>(null);

export function usePodcastPlayer(): PlayerCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePodcastPlayer must be used within PodcastPlayerProvider");
  return c;
}

const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const RATES = [1, 1.25, 1.5, 2];

// ── Office "now playing" backdrop ─────────────────────────────────────────
// The daily-office listener uses a full-bleed LANDSCAPE photo from the
// Cobreathe library (life-on-earth images) instead of the square episode
// artwork — the office becomes an immersive, photographic prayer space. The
// photo melts via a gradient into a solid colour sampled from the photo
// itself (the "additional background" beneath it), so each day's office takes
// on the tone of its image. Bundled (offline-safe).
const OFFICE_BG_ALL = import.meta.glob("@/assets/cobreathe/*.{jpg,jpeg,png,avif,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
// Curated to COLOR, LANDSCAPE-orientation scenes that read well full-bleed
// behind the office player. The Cobreathe library is mostly PORTRAIT (crops
// badly here) and carries jarring subjects for a prayer backdrop (a wildfire
// shot, a polar-bear close-up). It also has vintage BLACK-AND-WHITE archival
// landscapes (National Library of Norway / UW Libraries) — those were dropped
// per request: the office uses only full-color scenes now. Matched by filename
// stem; add a stem here to include one (color landscapes only).
const OFFICE_BG_ALLOW = [
  "jean-carlo-emer",   // Iceland black-sand beach + sea stacks
  "weichao-deng",      // bamboo forest
  "takahiro-taguchi",  // green hills at dawn
];
const OFFICE_BG_PHOTOS = Object.entries(OFFICE_BG_ALL)
  .filter(([path]) => OFFICE_BG_ALLOW.some((stem) => path.includes(stem)))
  .map(([, url]) => url);

// Dedicated, hand-picked office backgrounds. Drop a file into src/assets/office/
// whose name contains the side — e.g. fm-morning.jpg / morning.jpg for Morning
// Prayer — and it becomes that office's fixed backdrop (overriding the random
// Cobreathe photo). Empty/missing folder → falls back to the Cobreathe library,
// so the build never breaks waiting on the asset.
const OFFICE_DEDICATED_BG = import.meta.glob("@/assets/office/*.{jpg,jpeg,png,avif,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
function dedicatedOfficeBg(side: "morning" | "evening"): string | null {
  for (const [path, url] of Object.entries(OFFICE_DEDICATED_BG)) {
    if (path.toLowerCase().includes(side)) return url;
  }
  return null;
}

// Stable per-episode photo pick — a small string hash so the same office on
// the same day always shows the same image (no flicker across re-renders) but
// different episodes/sides get different photos.
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ── Cathedral reverb for the Forward Movement offices ─────────────────────
// The read-aloud FM office WAS routed through a Web Audio ConvolverNode so it
// sounded read in a stone chapel (dry passthrough connected first, reverb a
// pure add-on).
//
// DISABLED — createMediaElementSource() reroutes the <audio> element ENTIRELY
// into the Web Audio graph, and on iOS WKWebView that reliably yields SILENCE:
// the element "plays" (time advances) but no sound reaches the speakers, and it
// also fights Capacitor's native audio session / lock-screen controls. The
// office read-aloud is a core feature, so the cosmetic reverb is off — exactly
// the failure the original kill-switch note warned about. With this false,
// ensureReverbGraph() early-returns and the <audio> plays direct + reliably.
const OFFICE_REVERB_ENABLED = false;
const REVERB_WET = 0.32;
function makeReverbIR(ctx: AudioContext): AudioBuffer {
  const seconds = 2.8, decay = 2.4;
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return ir;
}

// Humanize an alignment section's type ("first_lesson" → "First Lesson") when
// the server didn't supply a nicer title.
function humanizeSectionType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Psalm section types — these read as the psalm REFERENCE ("Psalm 78"), never
// the Latin incipit. Mirrors PSALM_TYPES in the server alignment builder.
const PSALM_SECTION_TYPES = new Set(["psalm", "psalm_verses", "invitatory_psalm", "psalm_gloria"]);

// A daily-office alignment section (from /api/podcast/office/:side/timestamps).
type AlignSection = { id: string; type: string; title: string | null; startSeconds: number; endSeconds: number | null };

// ── Inline transport icons (white, for the photographic office player) ──
function IconX() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 6 18 18M18 6 6 18" />
    </svg>
  );
}
// Minimize-to-mini-bar chevron (the office player's top-left affordance).
function IconChevronDown() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9 12 15 18 9" />
    </svg>
  );
}
function IconShare() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" /><path d="m8 7 4-4 4 4" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}
// Circular skip arrow with the seconds centered. `forward` mirrors the arc.
function IconSkip({ secs, forward }: { secs: number; forward?: boolean }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 50, height: 50 }}>
      <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {forward
          ? (<><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></>)
          : (<><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></>)}
      </svg>
      <span style={{ position: "absolute", fontSize: 10, fontWeight: 700, fontFamily: FONT }}>{secs}</span>
    </span>
  );
}
function IconPlay() {
  return (<svg width="34" height="34" viewBox="0 0 24 24" aria-hidden><path d="M7 4.5 19.5 12 7 19.5Z" fill="currentColor" /></svg>);
}
function IconPause() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden>
      <rect x="6" y="4" width="4.2" height="16" rx="1.6" fill="currentColor" />
      <rect x="13.8" y="4" width="4.2" height="16" rx="1.6" fill="currentColor" />
    </svg>
  );
}

const posKey = (e: { showSlug: string; episodeId: string }) => `phoebe:podcast:pos:${e.showSlug}:${e.episodeId}`;
function loadPos(e: { showSlug: string; episodeId: string }): number {
  try { return Number(localStorage.getItem(posKey(e))) || 0; } catch { return 0; }
}
function savePos(e: { showSlug: string; episodeId: string }, t: number): void {
  try { if (t > 5) localStorage.setItem(posKey(e), String(Math.floor(t))); } catch { /* ignore */ }
}
function clearPos(e: { showSlug: string; episodeId: string }): void {
  try { localStorage.removeItem(posKey(e)); } catch { /* ignore */ }
}
function fmtClock(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60); const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Recognize a daily-office episode regardless of HOW it was launched: the
// dedicated launcher uses showSlug "office-morning"/"office-evening", while the
// Audio library plays the same feed under its own slug "morning-office"/
// "evening-office". Either maps to the office side — so listening to ≥60% of the
// office credits the day no matter which screen opened it.
function officeSideFromSlug(slug: string | null | undefined): "morning" | "evening" | null {
  if (!slug) return null;
  if (slug === "office-morning" || slug === "morning-office") return "morning";
  if (slug === "office-evening" || slug === "evening-office") return "evening";
  return null;
}
// Per-show playback overrides, applied for EVERY play path (no per-call-site
// wiring): an intro the listener should skip (start N seconds in) and whether
// the show uses the immersive photographic player (like the offices) instead of
// the plain podcast view. Keyed by show slug.
const SHOW_OVERRIDES: Record<string, { introSkipSeconds?: number; outroTrimSeconds?: number; immersive?: boolean }> = {
  // National Cathedral sermons open with a ~22s sign-on; skip it, and give the
  // preaching the same immersive full-screen player the offices use.
  "national-cathedral-sermons": { introSkipSeconds: 22, immersive: true },
  // Forward Day by Day opens with a ~19s intro; start past it. It also ends with
  // a ~51s outro (credits / closing) — skip it: treat the episode as finished
  // 51s early so it closes out and hands off to the next thing.
  "forward-day-by-day": { introSkipSeconds: 19, outroTrimSeconds: 51 },
  // Scripture Day by Day ends with a ~20s outro — skip it the same way.
  "scripture-day-by-day": { outroTrimSeconds: 20 },
};
function showOverride(slug: string | null | undefined) {
  return (slug && SHOW_OVERRIDES[slug]) || null;
}
// Local calendar date (YYYY-MM-DD) — the key the office-completed flag uses.
function officeYmdLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Fraction of the episode a listen must reach to count the office as prayed.
const OFFICE_CREDIT_FRACTION = 0.6;

export function PodcastPlayerProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Web Audio reverb graph (FM offices only). Created lazily, once.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const reverbWetRef = useRef<GainNode | null>(null);
  const reverbReadyRef = useRef(false);
  const resumeAudioCtx = () => {
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => { /* gesture-gated */ });
  };
  const ensureReverbGraph = useCallback(() => {
    if (reverbReadyRef.current || !OFFICE_REVERB_ENABLED) return;
    const a = audioRef.current;
    if (!a) return;
    let ctx: AudioContext | null = null;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const source = ctx.createMediaElementSource(a);
      // Dry passthrough connected FIRST — audio is never lost even if the wet
      // path below throws; reverb is a pure add-on.
      source.connect(ctx.destination);
      audioCtxRef.current = ctx;
      reverbReadyRef.current = true;
      try {
        const wet = ctx.createGain(); wet.gain.value = 0;
        const conv = ctx.createConvolver(); conv.buffer = makeReverbIR(ctx);
        const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3200;
        source.connect(conv); conv.connect(lp); lp.connect(wet); wet.connect(ctx.destination);
        reverbWetRef.current = wet;
      } catch { /* dry-only; passthrough already connected */ }
    } catch {
      // Web Audio unavailable, or createMediaElementSource threw (the element
      // was already routed). Tear down any half-built context and mark the
      // graph "ready" so we never attempt a second createMediaElementSource on
      // the same <audio> element — it keeps playing dry on its own.
      if (ctx) { try { ctx.close(); } catch { /* already closed */ } }
      audioCtxRef.current = null;
      reverbReadyRef.current = true;
    }
  }, []);

  const [current, setCurrent] = useState<PlayingEpisode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Mini-bar slide up/down: it comes UP from the bottom when playback starts and
  // slides DOWN when it stops (e.g. a psalm segment finishing and returning to
  // the office). `barMounted` keeps it in the tree through the exit transition;
  // `barUp` toggles the transform.
  const [barMounted, setBarMounted] = useState(false);
  const [barUp, setBarUp] = useState(false);
  useEffect(() => {
    if (current) {
      setBarMounted(true);
      const r = requestAnimationFrame(() => setBarUp(true));
      return () => cancelAnimationFrame(r);
    }
    setBarUp(false);
    const t = setTimeout(() => setBarMounted(false), 360);
    return () => clearTimeout(t);
  }, [current]);
  // Scrub (drag-to-seek): while dragging, scrubFrac (0..1) previews the position
  // so the bar + time labels follow the finger; the seek commits on release.
  // scrubbingRef gates the move handler so stray pointermoves don't jump it.
  const [scrubFrac, setScrubFrac] = useState<number | null>(null);
  const scrubbingRef = useRef(false);
  // Backstop: if a scrub's pointerup lands off the bar (e.g. setPointerCapture
  // failed and the finger left the 5px strip), the bar's own onScrubUp never
  // fires and the drag state would stick (a later stray pointermove could then
  // move the bar). Clear it on ANY window pointerup/cancel — on a normal release
  // the bar's onScrubUp has already run, so this is a no-op then.
  useEffect(() => {
    const clear = () => { if (scrubbingRef.current) { scrubbingRef.current = false; setScrubFrac(null); } };
    window.addEventListener("pointerup", clear);
    window.addEventListener("pointercancel", clear);
    return () => { window.removeEventListener("pointerup", clear); window.removeEventListener("pointercancel", clear); };
  }, []);
  const [rate, setRate] = useState(1);
  // Full-screen "now playing" listener (vs. the bottom mini-bar).
  const [expanded, setExpanded] = useState(false);
  // After a daily office finishes, gently offer Forward Day by Day next — an
  // optional "up next" banner, not an auto-play. Set when an office episode
  // ends (expanded), cleared when any new episode starts or the user dismisses.
  const [fddOffer, setFddOffer] = useState(false);

  const pendingSeekRef = useRef<number | null>(null);
  const lastSaveRef = useRef(0);
  // Whether playback was active when the app last went to the background,
  // so the resume handler knows to kick it back on when we return.
  const wasPlayingRef = useRef(false);
  const loggedRef = useRef<Set<string>>(new Set());
  // Queue for listen-list playback. queueRef holds the ordered episode
  // list; queueIndexRef is the index of the currently playing episode.
  // Both are refs (not state) so onEndedEv can read them without a stale
  // closure — the UI reads the list from its own query, not from here.
  const queueRef = useRef<PlayingEpisode[]>([]);
  const queueIndexRef = useRef(-1);
  // Prayer-session accumulator (time actually playing).
  const seg = useRef<{ start: number | null; acc: number; startedAt: Date | null }>({ start: null, acc: 0, startedAt: null });
  // Surface + office-credit mode for the CURRENTLY accumulating session.
  // Set when an episode starts; read by commitSession (which can't close
  // over `current`). Defaults to the podcast surface.
  const sessionMetaRef = useRef<{ surface: string; creditMode?: "morning" | "evening" }>({ surface: "podcast" });
  // The episodeId of the office episode we've already credited this play, so the
  // ≥60% office credit fires exactly once per listen.
  const officeCreditedRef = useRef<string | null>(null);
  const weeklyCreditedRef = useRef<string | null>(null);
  // Whether THIS podcast play has already credited the Podcasts daily practice
  // (so the ≥2-min credit fires once per episode play).
  const podcastCreditedRef = useRef(false);
  // Whether the outro-trim early-finish has already fired this play (so a show
  // with outroTrimSeconds — e.g. FDD — closes out exactly once).
  const outroTriggeredRef = useRef(false);
  // When set, pause once playback reaches this offset — the end of a single
  // reading played via PlayingEpisode.stopAtSeconds. Cleared after it fires or
  // on a manual seek, so continuing past it plays normally.
  const segmentStopRef = useRef<number | null>(null);

  const closeSeg = useCallback(() => {
    if (seg.current.start !== null) {
      seg.current.acc += (Date.now() - seg.current.start) / 1000;
      seg.current.start = null;
    }
  }, []);
  const openSeg = useCallback(() => {
    if (!seg.current.startedAt) seg.current.startedAt = new Date();
    if (seg.current.start === null) seg.current.start = Date.now();
  }, []);
  const commitSession = useCallback(() => {
    closeSeg();
    const total = Math.round(seg.current.acc);
    const startedAt = seg.current.startedAt;
    const { surface, creditMode } = sessionMetaRef.current;
    seg.current = { start: null, acc: 0, startedAt: null };
    if (total > 0 && startedAt && user) {
      // Listening-time row (community metrics + streak). The office "prayed
      // today" credit is handled separately by creditOfficePodcast once the
      // listener crosses 60% — so this row is left completed:false and the
      // office-history rollup only counts the ≥60% completed row.
      apiRequest("POST", "/api/prayer-sessions", {
        surface,
        durationSeconds: total,
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
      }).catch(() => { /* best-effort */ });
      void creditMode;
    }
  }, [closeSeg, user]);

  // Count an office podcast as PRAYED TODAY (≥60% listened). Stamps the local
  // office-completed flag (instant dashboard flip) and POSTs a completed=TRUE
  // office-podcast prayer-session that the office-history rollup counts (so it
  // survives a refetch / other device + feeds the streak). Fires once per play.
  const creditOfficePodcast = useCallback((side: "morning" | "evening", playedSeconds: number, startedAt: Date | null) => {
    try { localStorage.setItem(`phoebe:office-completed:${side}:${officeYmdLocal()}`, "1"); } catch { /* non-fatal */ }
    if (user) {
      const ended = new Date();
      apiRequest("POST", "/api/prayer-sessions", {
        surface: `${side}-office-podcast`,
        durationSeconds: Math.max(1, Math.round(playedSeconds)),
        completed: true,
        startedAt: (startedAt ?? ended).toISOString(),
        endedAt: ended.toISOString(),
      })
        .then(() => {
          // The rhythm/daily-progress card + streak read these — refetch so the
          // office flips to "Prayed today" without an app restart.
          queryClient.invalidateQueries({ queryKey: ["/api/me/office-history-week"] });
          queryClient.invalidateQueries({ queryKey: ["/api/me/prayer-days"] });
        })
        .catch(() => { /* best-effort — the localStorage flag already flipped the local UI */ });
    }
  }, [user, queryClient]);

  // Core episode-start logic, shared by user-tap play and queue auto-advance.
  const startEpisode = useCallback((ep: PlayingEpisode) => {
    if (!ep.audioUrl) return;
    setFddOffer(false); // any new episode clears the post-office FDD offer
    setCurrent((prev) => {
      if (prev && prev.showSlug === ep.showSlug && prev.episodeId === ep.episodeId) {
        // Same episode already loaded — jump to the requested segment (e.g.
        // tapping a different reading) without reloading the audio.
        const a = audioRef.current;
        if (a && ep.startAtSeconds != null) { a.currentTime = ep.startAtSeconds; setCurrentTime(ep.startAtSeconds); }
        segmentStopRef.current = ep.stopAtSeconds ?? null;
        a?.play().catch(() => { /* gesture-gated */ });
        return prev;
      }
      const a = audioRef.current;
      if (a && prev) savePos(prev, a.currentTime);
      commitSession(); // flushes prev's session under prev's surface
      // Switch the session surface/credit to the new episode (commitSession
      // above already used the old meta). Derive the office side from the slug
      // too, so an office played from the Audio library (feed slug, no tags)
      // still counts as the office — not just the dedicated launcher.
      const officeSide = officeSideFromSlug(ep.showSlug) ?? ep.creditMode ?? null;
      sessionMetaRef.current = officeSide
        ? { surface: `${officeSide}-office-podcast`, creditMode: officeSide }
        : { surface: ep.sessionSurface ?? "podcast", creditMode: ep.creditMode };
      officeCreditedRef.current = null;
      podcastCreditedRef.current = false;
      outroTriggeredRef.current = false;
      // A segment request (startAtSeconds) wins; else resume the saved spot;
      // else, on a fresh start, skip a show's sign-on intro.
      {
        const savedPos = loadPos(ep);
        pendingSeekRef.current = ep.startAtSeconds != null
          ? ep.startAtSeconds
          : savedPos > 0 ? savedPos : (showOverride(ep.showSlug)?.introSkipSeconds ?? 0);
      }
      segmentStopRef.current = ep.stopAtSeconds ?? null;
      return ep;
    });
  }, [commitSession]);

  const play = useCallback((ep: PlayingEpisode, opts?: { expand?: boolean }) => {
    // User-initiated tap: clear any running queue. Open full-screen unless
    // the caller asked to stay in the mini-bar (expand: false).
    queueRef.current = [];
    queueIndexRef.current = -1;
    setExpanded(opts?.expand !== false);
    startEpisode(ep);
  }, [startEpisode]);

  const playQueue = useCallback((eps: PlayingEpisode[]) => {
    if (eps.length === 0) return;
    queueRef.current = eps;
    queueIndexRef.current = 0;
    setExpanded(true);
    startEpisode(eps[0]);
  }, [startEpisode]);

  // Tapping the post-office "up next: Forward Day by Day" offer — fetch today's
  // FDD episode and play it in the same full-screen player.
  const playFddNext = useCallback(async () => {
    try {
      const ep = await apiRequest<{ feedTitle: string | null; title: string | null; audioUrl: string | null; durationSeconds: number | null; publishedAt: string | null; imageUrl: string | null }>("GET", "/api/podcast/forward-day-by-day/today");
      if (!ep?.audioUrl) { setFddOffer(false); return; }
      play({
        showSlug: "forward-day-by-day",
        episodeId: ep.audioUrl,
        title: ep.title,
        audioUrl: ep.audioUrl,
        imageUrl: ep.imageUrl,
        showTitle: ep.feedTitle ?? "Forward Day by Day",
        showArtwork: ep.imageUrl,
        durationSeconds: ep.durationSeconds,
        publishedAt: ep.publishedAt,
        sessionSurface: "fdd-audio",
        showHref: "/podcast/forward-day-by-day",
      });
    } catch { setFddOffer(false); }
  }, [play]);

  // Point the audio at the current episode + autoplay when it changes.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    a.src = current.audioUrl;
    a.playbackRate = rate;
    a.load();
    // If a prior FM office rerouted this shared element through an AudioContext
    // that iOS later suspended, a programmatic play() would run silently. Resume
    // it first so auto-advance / return-to-app playback isn't muted.
    resumeAudioCtx();
    a.play().catch(() => { /* iOS may gate autoplay; the bar's play button covers it */ });

    // Listening history — once per episode per session. Offices opt out
    // (skipHistory): they change daily and are tracked via prayer-sessions.
    const key = `${current.showSlug}:${current.episodeId}`;
    if (user && !current.skipHistory && !loggedRef.current.has(key)) {
      loggedRef.current.add(key);
      apiRequest("POST", "/api/podcasts/listens", {
        showSlug: current.showSlug,
        episodeId: current.episodeId,
        episodeTitle: current.title ?? undefined,
        episodeAudioUrl: current.audioUrl,
        episodeImageUrl: current.imageUrl ?? current.showArtwork ?? undefined,
        durationSeconds: current.durationSeconds ?? undefined,
        publishedAt: current.publishedAt ?? undefined,
        showTitle: current.showTitle ?? undefined,
        showArtwork: current.showArtwork ?? undefined,
      })
        .then(() => queryClient.invalidateQueries({ queryKey: ["/api/podcasts/me"] }))
        .catch(() => { /* best-effort */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.showSlug, current?.episodeId]);

  // ── One-time import of partially-listened episodes into the listen list ──
  // On first load after the user signs in, scan localStorage for any saved
  // resume positions (phoebe:podcast:pos:*). Cross-reference with the full
  // listen history (which stores episode snapshots) and POST any partial
  // episodes to the listen list so they appear in the queue automatically.
  // A localStorage flag prevents re-running on subsequent loads.
  useEffect(() => {
    if (!user) return;
    const importFlag = "phoebe:partial-import:v1";
    try { if (localStorage.getItem(importFlag)) return; } catch { return; }

    const prefix = "phoebe:podcast:pos:";
    const partials: { showSlug: string; episodeId: string }[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k?.startsWith(prefix)) continue;
        const pos = Number(localStorage.getItem(k));
        if (pos < 30) continue; // not meaningfully started
        const rest = k.slice(prefix.length);
        const firstColon = rest.indexOf(":");
        if (firstColon < 0) continue;
        partials.push({ showSlug: rest.slice(0, firstColon), episodeId: rest.slice(firstColon + 1) });
      }
    } catch { /* private mode */ }

    if (partials.length === 0) {
      try { localStorage.setItem(importFlag, "done"); } catch { /* ignore */ }
      return;
    }

    type ListenRow = {
      showSlug: string; episodeId: string;
      episodeTitle: string | null; episodeAudioUrl: string | null;
      episodeImageUrl: string | null; durationSeconds: number | null;
      publishedAt: string | null; showTitle: string | null; showArtwork: string | null;
    };
    apiRequest("GET", "/api/podcasts/listens")
      .then((data: { listens: ListenRow[] }) => {
        const map = new Map(data.listens.map((l) => [`${l.showSlug}:${l.episodeId}`, l]));
        const toAdd = partials.map((p) => map.get(`${p.showSlug}:${p.episodeId}`)).filter(Boolean) as ListenRow[];
        return Promise.all(
          toAdd.map((ep) =>
            apiRequest("POST", "/api/podcasts/listen-list", {
              showSlug: ep.showSlug,
              episodeId: ep.episodeId,
              episodeTitle: ep.episodeTitle ?? undefined,
              episodeAudioUrl: ep.episodeAudioUrl ?? undefined,
              episodeImageUrl: ep.episodeImageUrl ?? undefined,
              durationSeconds: ep.durationSeconds ?? undefined,
              publishedAt: ep.publishedAt ?? undefined,
              showTitle: ep.showTitle ?? undefined,
              showArtwork: ep.showArtwork ?? undefined,
            }).catch(() => { /* best-effort, skip duplicates */ })
          )
        );
      })
      .then(() => {
        try { localStorage.setItem(importFlag, "done"); } catch { /* ignore */ }
        queryClient.invalidateQueries({ queryKey: ["/api/podcasts/listen-list"] });
        queryClient.invalidateQueries({ queryKey: ["/api/podcasts/me"] });
      })
      .catch(() => { /* don't set flag — will retry next session */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Save position on background; re-sync + resume on return.
  //
  // iOS suspends the WebView's <audio> after the app sits in the background
  // (or under memory pressure / an audio interruption), and the element's
  // play/pause events don't reliably fire across that gap. So on return the
  // bar could show "playing" while it's actually silent, with nothing
  // resuming it — the "came back and it won't play" bug. On hide we remember
  // whether we were playing; on show we reconcile isPlaying with the
  // element's real state and, if we were playing, kick it back on (reloading
  // the source first if WKWebView evicted the buffer, then seeking to the
  // saved position).
  useEffect(() => {
    // Reconcile playback when the app returns to the foreground. If we
    // intended to be playing (wasPlayingRef, which now tracks the user's
    // play/pause intent — see onPlayEv / toggle) but the element is paused
    // — iOS silently pauses a suspended WebView's audio — kick it back on,
    // reloading + reseeking first when WKWebView evicted the decoded buffer
    // (readyState < HAVE_CURRENT_DATA). Throttled so the several foreground
    // events below don't stack reload/play calls.
    let lastResume = 0;
    const resumeForeground = () => {
      const a = audioRef.current;
      if (!a) return;
      // Web Audio suspends on background (iOS) — resume it so the reverb'd office
      // isn't left silent on return.
      const rc = audioCtxRef.current;
      if (rc && rc.state === "suspended") rc.resume().catch(() => { /* ignore */ });
      const now = Date.now();
      if (now - lastResume < 800) return;
      lastResume = now;
      if (wasPlayingRef.current && a.paused) {
        const resumeAt = current ? loadPos(current) : a.currentTime;
        if (a.readyState < 2) {
          pendingSeekRef.current = resumeAt;
          a.load();
        }
        a.play()
          .then(() => { setIsPlaying(true); openSeg(); })
          .catch(() => { setIsPlaying(false); }); // iOS gated it — a tap will start it
      } else {
        // Element kept its state — just make the UI match reality.
        setIsPlaying(!a.paused);
        if (!a.paused) openSeg();
      }
    };
    const onVis = () => {
      const a = audioRef.current;
      if (!a) return;
      if (document.visibilityState === "hidden") {
        if (current) savePos(current, a.currentTime);
        closeSeg();
        return;
      }
      resumeForeground();
    };
    const onHide = () => {
      const a = audioRef.current;
      if (a && current) savePos(current, a.currentTime);
      commitSession();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    // WKWebView delivers visibilitychange / focus / pageshow INCONSISTENTLY
    // on native resume (sometimes none of them fire) — `phoebe:appactive`,
    // which the Capacitor shell dispatches from appStateChange→isActive, is
    // the reliable "back in foreground" signal (see App.tsx / amenFeedback).
    // Listen to all of them so audio resumes no matter which the OS sends.
    window.addEventListener("phoebe:appactive", resumeForeground);
    window.addEventListener("pageshow", resumeForeground);
    window.addEventListener("focus", resumeForeground);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("phoebe:appactive", resumeForeground);
      window.removeEventListener("pageshow", resumeForeground);
      window.removeEventListener("focus", resumeForeground);
    };
  }, [current, closeSeg, commitSession, openSeg]);

  // Lock-screen / Control Center controls (MediaSession API). Publishes
  // now-playing metadata + routes remote play/pause/seek back to the same
  // <audio> element, and keeps iOS's media controls in sync with what's
  // actually playing — which also helps the OS keep our audio session
  // associated across backgrounding.
  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms) return;
    if (!current) {
      ms.metadata = null;
      ms.playbackState = "none";
      return;
    }
    const art = current.imageUrl || current.showArtwork;
    ms.metadata = new MediaMetadata({
      title: current.title ?? current.showTitle ?? "Phoebe",
      artist: current.showTitle ?? "",
      album: "Phoebe",
      artwork: art ? [{ src: art, sizes: "512x512", type: "image/jpeg" }] : [],
    });
    ms.setActionHandler("play", () => { wasPlayingRef.current = true; audioRef.current?.play().catch(() => { /* ignore */ }); });
    ms.setActionHandler("pause", () => { wasPlayingRef.current = false; audioRef.current?.pause(); });
    ms.setActionHandler("seekbackward", () => skip(-15));
    ms.setActionHandler("seekforward", () => skip(30));
    ms.setActionHandler("seekto", (d) => { if (d.seekTime != null) seekTo(d.seekTime); });
    return () => {
      for (const act of ["play", "pause", "seekbackward", "seekforward", "seekto"] as const) {
        try { ms.setActionHandler(act, null); } catch { /* unsupported action */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  // ── <audio> event handlers ──────────────────────────────────────────────
  // MediaSession sync helpers (lock-screen scrubber + play/pause state).
  // No-ops where the API or a valid duration isn't available.
  const syncMediaPlaybackState = () => {
    const a = audioRef.current; const ms = navigator.mediaSession;
    if (a && ms) ms.playbackState = a.paused ? "paused" : "playing";
  };
  const syncMediaPosition = () => {
    const a = audioRef.current; const ms = navigator.mediaSession;
    if (!a || !ms?.setPositionState || !isFinite(a.duration) || a.duration <= 0) return;
    try {
      ms.setPositionState({ duration: a.duration, playbackRate: a.playbackRate || 1, position: Math.min(a.currentTime, a.duration) });
    } catch { /* invalid position state — ignore */ }
  };

  const onLoadedMeta = () => {
    const a = audioRef.current; if (!a) return;
    setDuration(a.duration || 0);
    const target = pendingSeekRef.current;
    pendingSeekRef.current = null;
    if (target != null && target > 5 && (!a.duration || target < a.duration - 10)) {
      try { a.currentTime = target; } catch { /* ignore */ }
    }
    syncMediaPosition();
  };
  const onTimeUpdate = () => {
    const a = audioRef.current; if (!a || !current) return;
    setCurrentTime(a.currentTime);
    syncMediaPosition();
    // Segment stop — when playing a single reading (stopAtSeconds), pause at its
    // end. Fires once; cleared so a manual resume plays straight on.
    if (segmentStopRef.current != null && a.currentTime >= segmentStopRef.current - 0.2) {
      segmentStopRef.current = null;
      // A chained play-through seeks straight to the next reading in onSegmentEnd
      // — keep playing so iOS doesn't gate the (gapless) continuation. A single
      // reading (or the last reading in a chain) pauses at its end as before.
      if (!current.seekThroughOnStop) a.pause();
      if (current.collapseOnStop) setExpanded(false);
      current.onSegmentEnd?.();
      return;
    }
    // Office credit: the moment the listener crosses 60% of the episode, count
    // the office as prayed today (works whether opened from the office launcher
    // or the Audio library). Fires once per play.
    const officeSide = officeSideFromSlug(current.showSlug) ?? current.creditMode ?? null;
    if (
      officeSide &&
      segmentStopRef.current == null && // don't credit a whole office during a single-reading segment play
      officeCreditedRef.current !== current.episodeId &&
      isFinite(a.duration) && a.duration > 0 &&
      a.currentTime / a.duration >= OFFICE_CREDIT_FRACTION
    ) {
      officeCreditedRef.current = current.episodeId;
      const played = seg.current.acc + (seg.current.start !== null ? (Date.now() - seg.current.start) / 1000 : 0);
      creditOfficePodcast(officeSide, played > 1 ? played : a.currentTime, seg.current.startedAt);
    }
    // Weekly-plan episode credit — ≥60% heard completes the checklist item
    // (60% not 100%: outros, and grace). Fires once per play.
    if (
      current.creditWeeklyItem &&
      weeklyCreditedRef.current !== current.episodeId &&
      isFinite(a.duration) && a.duration > 0 &&
      a.currentTime / a.duration >= OFFICE_CREDIT_FRACTION
    ) {
      weeklyCreditedRef.current = current.episodeId;
      const { groupSlug, itemId } = current.creditWeeklyItem;
      apiRequest("POST", `/api/groups/${groupSlug}/weekly-plan/complete`, { itemId, done: true })
        .then(() => queryClient.invalidateQueries({ queryKey: [`/api/groups/${groupSlug}/weekly-plan`] }))
        .catch(() => { /* best-effort — the manual circle-tap still works */ });
    }
    // Podcast practice credit: ≥2 min of ACTUAL listening (accumulated play
    // time, so skipping ahead doesn't count) to a real podcast — not an office
    // — counts the "Podcasts" daily practice as kept, when the user has it.
    if (!officeSide && !podcastCreditedRef.current && podcastsPracticeActive(user?.homeLayout)) {
      const playedPod = seg.current.acc + (seg.current.start !== null ? (Date.now() - seg.current.start) / 1000 : 0);
      if (playedPod >= PODCAST_PRACTICE_CREDIT_SECONDS) {
        podcastCreditedRef.current = true;
        markPracticeDoneToday("podcasts");
      }
    }
    // Outro trim — a show with outroTrimSeconds (FDD) ends its last N seconds of
    // credits/closing, so we treat the episode as finished that early: pause and
    // run the normal end flow (auto-advance the queue / hand off to the next
    // thing / close out). Fires once per play.
    const outroTrim = showOverride(current.showSlug)?.outroTrimSeconds ?? 0;
    if (
      outroTrim > 0 &&
      !outroTriggeredRef.current &&
      isFinite(a.duration) && a.duration > 0 &&
      a.currentTime >= a.duration - outroTrim
    ) {
      outroTriggeredRef.current = true;
      a.pause();
      const hasQueueNext = queueIndexRef.current >= 0 && queueIndexRef.current + 1 < queueRef.current.length;
      const hasHandoff = !!current.afterEndHref && expanded;
      if (hasQueueNext || hasHandoff) {
        // Advance the queue / hand off to the next thing.
        onEndedEv();
      } else {
        // Nothing queued — just close the player out (the listen is finished).
        closePlayer();
      }
      return;
    }
    const now = Date.now();
    if (now - lastSaveRef.current > 5000) { lastSaveRef.current = now; savePos(current, a.currentTime); }
  };
  // wasPlayingRef = the user's INTENT to be playing. Set it true whenever
  // audio actually starts; do NOT clear it in onPauseEv (iOS pauses
  // suspended audio on background, and that must not read as "user stopped"
  // — otherwise resume on return is skipped). It's cleared only on explicit
  // user stops: toggle-to-pause, lock-screen pause, ended, and close.
  const onPlayEv = () => { wasPlayingRef.current = true; setIsPlaying(true); openSeg(); syncMediaPlaybackState(); };
  const onPauseEv = () => {
    setIsPlaying(false); closeSeg(); syncMediaPlaybackState();
    const a = audioRef.current; if (a && current) savePos(current, a.currentTime);
  };
  const onEndedEv = () => {
    wasPlayingRef.current = false;
    setIsPlaying(false); closeSeg(); syncMediaPlaybackState();
    if (current) clearPos(current);
    commitSession();
    // A tagged course lesson finished → mark it complete (e.g. a Way of Love
    // episode completes that practice; finishing the series completes the course).
    if (current?.courseComplete) {
      markCourseLessonComplete(current.courseComplete.courseId, current.courseComplete.lessonKey);
    }
    // Auto-advance through the listen-list queue if one is active.
    const nextIdx = queueIndexRef.current + 1;
    if (nextIdx > 0 && nextIdx < queueRef.current.length) {
      queueIndexRef.current = nextIdx;
      const next = queueRef.current[nextIdx];
      if (next) setTimeout(() => startEpisode(next), 400);
      return;
    }
    // Post-playback hand-off (the daily office → its closing flow / whatever
    // the user has set next). Only when the full-screen player is still open,
    // so a backgrounded listen that happens to finish doesn't yank the user.
    const after = current?.afterEndHref;
    if (after && expanded) {
      setExpanded(false);
      setLocation(after);
      return;
    }
    // No explicit handoff: if a daily office just finished (and we're still in
    // the full-screen player), gently offer Forward Day by Day next — an
    // optional "up next" banner, never an auto-play.
    if (expanded && /office-podcast$/.test(current?.sessionSurface ?? "")) {
      setFddOffer(true);
    }
  };

  const toggle = useCallback(() => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) {
      wasPlayingRef.current = true;
      // Resume the reverb AudioContext in this user gesture (iOS keeps it
      // suspended until a tap; without this the office would play silent once
      // routed through Web Audio).
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => { /* ignore */ });
      // If WKWebView evicted the decoded buffer while suspended, readyState
      // drops and a bare play() can stall — reload to the saved spot first
      // so a manual tap after returning to the app always recovers.
      if (a.readyState < 2 && current) { pendingSeekRef.current = loadPos(current); a.load(); }
      a.play().catch(() => { /* ignore */ });
    } else {
      wasPlayingRef.current = false;
      a.pause();
    }
  }, [current]);
  const seekTo = (t: number) => { segmentStopRef.current = null; const a = audioRef.current; if (a) { a.currentTime = t; setCurrentTime(t); } };
  const skip = (delta: number) => {
    const a = audioRef.current; if (!a) return;
    const max = a.duration && isFinite(a.duration) ? a.duration : a.currentTime + delta;
    seekTo(Math.max(0, Math.min(max, a.currentTime + delta)));
  };
  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    const a = audioRef.current; if (a) a.playbackRate = next;
  };
  const skipToNext = useCallback(() => {
    const nextIdx = queueIndexRef.current + 1;
    // nextIdx <= 0 means no queue was loaded (queueIndexRef starts at -1).
    if (nextIdx <= 0 || nextIdx >= queueRef.current.length) return;
    const a = audioRef.current;
    if (a && current) savePos(current, a.currentTime);
    commitSession();
    queueIndexRef.current = nextIdx;
    const next = queueRef.current[nextIdx];
    if (next) startEpisode(next);
  }, [current, commitSession, startEpisode]);

  // ── Office source toggle (Forward Movement ↔ Church of England) ────────
  // Visible only when the currently-playing episode is a daily office.
  // Fetches the new source's episode and hands it to the same player so
  // the user stays in the full-screen listener without navigating away.
  const { officeAudioSource } = useOfficePrefs();
  const sourceSwitchingRef = useRef(false);
  const [sourceSwitching, setSourceSwitching] = useState(false);

  // ── Preload today's office so tapping play starts fast ─────────────────────
  // The <audio> src isn't set until play, and iOS ignores <audio preload> until
  // a user gesture — so we warm the OPENING of the time-appropriate office audio
  // into the HTTP cache with a plain ranged fetch (which iOS honours). First
  // ~512KB ≈ the opening minute, so playback starts with no download wait.
  // Native only, best-effort, once per URL.
  const preloadSide = new Date().getHours() < 17 ? "morning" : "evening";
  const { data: preloadEp } = useQuery<{ audioUrl: string | null }>({
    queryKey: [`/api/podcast/${preloadSide}-office/today`, officeAudioSource, "preload"],
    queryFn: () => apiRequest("GET", `/api/podcast/${preloadSide}-office/today?source=${encodeURIComponent(officeAudioSource)}`),
    enabled: !!user && isNativeShell(),
    staleTime: 30 * 60_000,
  });
  const warmedRef = useRef<string | null>(null);
  useEffect(() => {
    const url = preloadEp?.audioUrl;
    if (!url || warmedRef.current === url) return;
    warmedRef.current = url;
    try { void fetch(url, { headers: { Range: "bytes=0-524287" } }).catch(() => { /* best-effort */ }); }
    catch { /* ignore */ }
  }, [preloadEp?.audioUrl]);

  const switchOfficeSource = useCallback(async (newSource: OfficeAudioSource) => {
    if (!current || sourceSwitchingRef.current) return;
    setOfficeAudioSource(newSource);
    const apiSlug = current.showSlug === "office-morning" ? "morning-office" : "evening-office";
    const side = current.showSlug === "office-morning" ? "morning" : "evening";
    sourceSwitchingRef.current = true;
    setSourceSwitching(true);
    try {
      const ep: { audioUrl: string | null; title: string | null; imageUrl: string | null; feedTitle: string | null; durationSeconds: number | null; publishedAt: string | null } =
        await apiRequest("GET", `/api/podcast/${apiSlug}/today?source=${encodeURIComponent(newSource)}`);
      if (ep?.audioUrl) {
        const sideLabel = side === "evening" ? "Evening" : "Morning";
        const blurb = newSource === "church-of-england"
          ? `Common Worship ${sideLabel} Prayer from the Church of England, read aloud. A new recording every day.`
          : newSource === "gregory"
          ? `${sideLabel} Prayer from the Book of Common Prayer, sung in plainchant. A new recording every day.`
          : `The full order of ${sideLabel} Prayer from the Book of Common Prayer, read aloud. A new episode every ${side === "evening" ? "evening" : "morning"}.`;
        play({
          ...current,
          audioUrl: ep.audioUrl,
          title: ep.title,
          imageUrl: ep.imageUrl ?? current.imageUrl,
          episodeId: ep.audioUrl,
          showTitle: ep.feedTitle ?? current.showTitle,
          showArtwork: ep.imageUrl ?? current.showArtwork,
          durationSeconds: ep.durationSeconds ?? null,
          publishedAt: ep.publishedAt ?? null,
          description: blurb,
        }, { expand: true });
      }
    } catch { /* keep current source playing */ }
    finally { sourceSwitchingRef.current = false; setSourceSwitching(false); }
  }, [current, play]);

  const closePlayer = () => {
    const a = audioRef.current;
    if (a && current) savePos(current, a.currentTime);
    wasPlayingRef.current = false;
    commitSession();
    if (a) a.pause();
    setCurrent(null); setIsPlaying(false); setCurrentTime(0); setDuration(0); setExpanded(false);
  };

  const isCurrent = useCallback(
    (slug: string, id: string) => !!current && current.showSlug === slug && current.episodeId === id,
    [current],
  );

  // Drag-to-seek (scrub) — Pointer Events cover mouse + touch in one path. A
  // plain tap is a down+up at one spot, so this also replaces the old
  // click-to-seek. While dragging we only move the local preview (scrubFrac);
  // the real seek commits on release so we don't churn a.currentTime per frame.
  const trackFrac = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 ? Math.max(0, Math.min(1, (clientX - r.left) / r.width)) : 0;
  };
  const onScrubDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = audioRef.current; if (!a || !a.duration || !isFinite(a.duration)) return;
    scrubbingRef.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    setScrubFrac(trackFrac(e.clientX, e.currentTarget));
  };
  const onScrubMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return;
    setScrubFrac(trackFrac(e.clientX, e.currentTarget));
  };
  const onScrubUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    const a = audioRef.current;
    const frac = trackFrac(e.clientX, e.currentTarget);
    if (a && a.duration && isFinite(a.duration)) seekTo(frac * a.duration);
    setScrubFrac(null);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* unsupported */ }
  };
  // Spread onto each track. touchAction:none keeps a drag from scrolling the page.
  const scrubHandlers = {
    onPointerDown: onScrubDown,
    onPointerMove: onScrubMove,
    onPointerUp: onScrubUp,
    onPointerCancel: onScrubUp,
  };

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  // ── Office immersive backdrop ──────────────────────────────────────────
  // When the now-playing episode is a daily office, choose a stable landscape
  // photo from the library and sample a dark solid colour from it for the
  // gradient + the "additional background" the photo melts into.
  // Office regardless of launch path (the office launcher's "office-morning" OR
  // the Audio library's "morning-office").
  const officeSide = officeSideFromSlug(current?.showSlug) ?? current?.creditMode ?? null;
  // The immersive photographic player (full-bleed LANDSCAPE photo melting into a
  // sampled colour) is now used for ALL audio — offices, podcasts, FDD, sermons,
  // everything — so every listen happens in the same prayerful space. officeSide
  // stays null for non-offices, so only the daily office is credited as the
  // office and gets the FM/CoE source toggle; the RENDER is shared everywhere.
  // Reverb engages only for the Forward Movement office. Build the graph + ramp
  // the wet signal in; for everything else (other podcasts, CoE office) the wet
  // gain rides to 0 so playback is the untouched dry signal.
  const reverbOn = OFFICE_REVERB_ENABLED && officeSide !== null && officeAudioSource === "forward-movement";
  useEffect(() => {
    if (reverbOn) ensureReverbGraph();
    const ctx = audioCtxRef.current;
    const wet = reverbWetRef.current;
    if (!ctx) return;
    resumeAudioCtx();
    if (wet) {
      try { wet.gain.setTargetAtTime(reverbOn ? REVERB_WET : 0, ctx.currentTime, 0.25); } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reverbOn]);
  const officeBg = useMemo(() => {
    if (!current) return null;
    // A full-bleed LANDSCAPE backdrop for every listen (offices + podcasts). We
    // deliberately do NOT fall back to a show's square artwork. On the WEB use a
    // Wide photo (not bundled into iOS), ROTATING to a fresh one each time a new
    // episode/office opens (the memo recomputes on `current` change); on native
    // fall back to a dedicated office photo, else the bundled Cobreathe library.
    const seed = current?.episodeId || current?.showSlug || "audio";
    if (!isNativeShell() && WIDE_PHOTOS.length > 0) {
      return WIDE_PHOTOS[Math.floor(Math.random() * WIDE_PHOTOS.length)]!;
    }
    if (officeSide) {
      const dedicated = dedicatedOfficeBg(officeSide);
      if (dedicated) return dedicated;
    }
    if (OFFICE_BG_PHOTOS.length === 0) return null;
    return OFFICE_BG_PHOTOS[hashStr(seed) % OFFICE_BG_PHOTOS.length];
  }, [current, officeSide, current?.episodeId, current?.showSlug]);
  const [officeRgb, setOfficeRgb] = useState<{ r: number; g: number; b: number }>({ r: 18, g: 30, b: 22 });
  useEffect(() => {
    if (!officeBg) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 8; c.height = 8;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        // Sample the LOWER band of the photo — that's what the gradient blends
        // into, so the seam between photo and solid colour disappears.
        ctx.drawImage(img, 0, Math.floor(img.naturalHeight * 0.6), img.naturalWidth, Math.floor(img.naturalHeight * 0.4), 0, 0, 8, 8);
        const d = ctx.getImageData(0, 0, 8, 8).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        // Darken (mix toward black) so warm-white text always reads on it.
        const k = 0.46;
        if (!cancelled) setOfficeRgb({ r: Math.round((r / n) * k), g: Math.round((g / n) * k), b: Math.round((b / n) * k) });
      } catch { /* tainted / unavailable — keep the default deep green */ }
    };
    img.src = officeBg;
    return () => { cancelled = true; };
  }, [officeBg]);
  const oSolid = `rgb(${officeRgb.r},${officeRgb.g},${officeRgb.b})`;
  const oRgba = (a: number) => `rgba(${officeRgb.r},${officeRgb.g},${officeRgb.b},${a})`;
  const remaining = duration > 0 ? Math.max(0, duration - currentTime) : 0;
  // During a scrub the bar + clocks follow the finger (scrubFrac); otherwise
  // they track the playing position as normal.
  const displayPct = scrubFrac != null ? scrubFrac * 100 : pct;
  const displayTime = scrubFrac != null && duration > 0 ? scrubFrac * duration : currentTime;
  const displayRemaining = duration > 0 ? Math.max(0, duration - displayTime) : 0;
  // The mini-bar shows the landscape backdrop photo for every kind of audio,
  // matching the full-screen immersive player (no square feed artwork anywhere).
  const miniArt = officeBg;

  // ── Synced liturgy section titles ("transcription / section title") ───────
  // The read-aloud office is time-aligned server-side: each liturgical part
  // (Invitatory, Psalm, First Lesson…) has a start/end second. We poll the
  // alignment for the playing side and surface the ACTIVE part's name as the
  // player's live title, so it updates as the office is read — the "section
  // title" feature, now on the immersive player (no longer beta-gated). Only
  // Forward Movement is aligned; Church of England gracefully falls back to the
  // episode title.
  // Reuses the unified `officeSide` derived above (covers both launch paths).
  const alignSide: "morning" | "evening" = officeSide ?? "morning";
  const { data: alignData } = useQuery<{ status: string; sections: AlignSection[] }>({
    queryKey: [`/api/podcast/office/${alignSide}/timestamps`],
    queryFn: () => apiRequest("GET", `/api/podcast/office/${alignSide}/timestamps`),
    // Transcription (the live liturgy-section title that tracked the audio) is
    // turned off for the offices — the player shows the plain episode title and
    // we no longer poll the alignment.
    enabled: false,
    staleTime: 5 * 60_000,
    refetchInterval: (q) => { const s = q.state.data?.status; return s === "done" || s === "failed" ? false : 6000; },
  });
  const officeSectionTitle = useMemo(() => {
    if (!officeSide) return null;
    const secs = (alignData?.sections ?? [])
      .filter((s) => s.type !== "appeal")
      .slice()
      .sort((a, b) => a.startSeconds - b.startSeconds);
    if (secs.length === 0) return null;
    // The active part is the last one whose start has passed (small lead so the
    // title arrives just as the reader does), as long as we're before its end.
    let active: AlignSection | null = null;
    for (const s of secs) {
      if (currentTime + 0.25 >= s.startSeconds) active = s; else break;
    }
    if (active && active.endSeconds != null && currentTime >= active.endSeconds + 0.5) {
      // Past the end of the last matched part with nothing after — hold it.
    }
    if (!active) return null;
    const title = (active.title && active.title.trim()) || "";
    // Psalm parts always read as the reference ("Psalm 78"). New alignments
    // serve that directly; for an older cached title that's still the Latin
    // incipit (or empty), fall back to "The Psalm Appointed" — never show Latin.
    if (PSALM_SECTION_TYPES.has(active.type)) {
      return /^psalms?\b/i.test(title) ? title : t("podcasts.psalm_appointed", { defaultValue: "The Psalm Appointed" });
    }
    return title || humanizeSectionType(active.type);
  }, [officeSide, alignData, currentTime, t]);
  // The title shown on the immersive office player: the live liturgy part when
  // we have one, else the episode title.
  const officeTitle = officeSectionTitle ?? current?.title ?? t("podcasts.now_playing_fallback");

  const shareOffice = () => {
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string; url?: string }) => Promise<void> };
    if (typeof nav.share !== "function") return;
    nav.share({
      title: current?.showTitle ?? "The Daily Office",
      text: current?.title ?? "",
      url: typeof window !== "undefined" ? window.location.origin : undefined,
    }).catch(() => { /* user dismissed */ });
  };
  const canShare = typeof navigator !== "undefined" && typeof (navigator as { share?: unknown }).share === "function";

  // The skip-back / play-pause / skip-forward (+ next) buttons. Extracted so the
  // immersive player can place them in the vertical middle (podcasts/office) OR
  // down in the lower block (Listen-to-Scripture, where the centered passage
  // title takes the middle — mirroring an office lesson title slide).
  const transportRow = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 30 }}>
      <button type="button" onClick={() => skip(-15)} aria-label={t("podcasts.a11y_back15")}
        style={{ background: "none", border: "none", color: "#FFFFFF", cursor: "pointer", padding: 4, lineHeight: 0 }}>
        <IconSkip secs={15} />
      </button>
      <button type="button" onClick={toggle} aria-label={isPlaying ? t("podcasts.a11y_pause") : t("podcasts.a11y_play")}
        style={{
          width: 96, height: 96, borderRadius: "50%", border: "none", cursor: "pointer",
          background: "rgba(18,20,18,0.34)", color: "#FFFFFF",
          backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
        }}>
        {isPlaying ? <IconPause /> : <IconPlay />}
      </button>
      <button type="button" onClick={() => skip(30)} aria-label={t("podcasts.a11y_forward30")}
        style={{ background: "none", border: "none", color: "#FFFFFF", cursor: "pointer", padding: 4, lineHeight: 0 }}>
        <IconSkip secs={30} forward />
      </button>
      {queueIndexRef.current >= 0 && queueIndexRef.current + 1 < queueRef.current.length && (
        <button type="button" onClick={skipToNext}
          aria-label={t("podcasts.a11y_next", { defaultValue: "Next episode" })}
          style={{ background: "none", border: "none", color: "#FFFFFF", fontSize: 26, lineHeight: 0, padding: 4, cursor: "pointer" }}>
          ⏭
        </button>
      )}
    </div>
  );

  return (
    <Ctx.Provider value={{ current, isPlaying, play, playQueue, toggle, isCurrent, close: closePlayer }}>
      {children}

      {/* One persistent audio element for the whole app. */}
      <audio
        ref={audioRef}
        onLoadedMetadata={onLoadedMeta}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlayEv}
        onPause={onPauseEv}
        onEnded={onEndedEv}
        preload="auto"
      />

      {barMounted && (
        <div
          style={{
            position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60,
            background: "#0A1A0F", borderTop: "1px solid rgba(168,197,160,0.18)",
            paddingBottom: "env(safe-area-inset-bottom)", fontFamily: FONT,
            boxShadow: "0 -6px 22px rgba(0,0,0,0.35)",
            transform: barUp ? "translateY(0)" : "translateY(110%)",
            transition: "transform 0.36s cubic-bezier(0.22, 1, 0.36, 1)",
            willChange: "transform",
          }}
        >
          {/* Tappable progress track. */}
          <div
            {...scrubHandlers}
            style={{ height: 5, background: "rgba(143,175,150,0.15)", cursor: "pointer", touchAction: "none" }}
            role="slider"
            aria-label={t("podcasts.a11y_seek")}
            aria-valuenow={Math.round(displayPct)}
          >
            <div style={{ width: `${displayPct}%`, height: "100%", background: "#A8C5A0" }} />
          </div>

          <div className="w-full max-w-2xl mx-auto" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px" }}>
            {/* Artwork + title → tap to expand the full-screen listener. */}
            <button
              type="button"
              onClick={() => setExpanded(true)}
              style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, cursor: "pointer", minWidth: 0, flex: 1 }}
            >
              {miniArt ? (
                <img src={miniArt} alt=""
                  style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0, background: "rgba(143,175,150,0.12)" }} />
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0, background: "rgba(46,107,64,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎧</div>
              )}
              <div style={{ minWidth: 0, textAlign: "left" }}>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: "#F0EDE6", margin: 0, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "44vw" }}>
                  {officeTitle}
                </p>
                <p style={{ fontSize: 10.5, color: "rgba(143,175,150,0.8)", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "44vw" }}>
                  {fmtClock(currentTime)}{duration > 0 ? ` / ${fmtClock(duration)}` : ""}{current?.showTitle ? ` · ${current.showTitle}` : ""}
                </p>
              </div>
            </button>

            {/* Transport */}
            <button type="button" onClick={() => skip(-15)} aria-label={t("podcasts.a11y_back15")}
              style={{ background: "none", border: "none", color: "rgba(168,197,160,0.95)", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: "4px 2px", flexShrink: 0 }}>
              ⟲15
            </button>
            <button type="button" onClick={toggle} aria-label={isPlaying ? t("podcasts.a11y_pause") : t("podcasts.a11y_play")}
              style={{ width: 38, height: 38, borderRadius: "50%", background: "#A8C5A0", color: "#0A1A0F", border: "none", fontSize: 16, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isPlaying ? "⏸" : "▶"}
            </button>
            <button type="button" onClick={() => skip(30)} aria-label={t("podcasts.a11y_forward30")}
              style={{ background: "none", border: "none", color: "rgba(168,197,160,0.95)", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: "4px 2px", flexShrink: 0 }}>
              30⟳
            </button>
            <button type="button" onClick={cycleRate} aria-label={t("podcasts.a11y_speed")}
              style={{ background: "rgba(46,107,64,0.25)", border: "1px solid rgba(46,107,64,0.4)", color: "#C8D4C0", fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "4px 8px", cursor: "pointer", flexShrink: 0 }}>
              {rate}×
            </button>
            <button type="button" onClick={closePlayer} aria-label={t("podcasts.a11y_close")}
              style={{ background: "none", border: "none", color: "rgba(143,175,150,0.7)", fontSize: 18, cursor: "pointer", padding: "0 2px", flexShrink: 0 }}>
              ✕
            </button>
          </div>
        </div>
      )}
      {/* ── Immersive OFFICE listener ──────────────────────────────────────
          The daily office gets a photographic full-screen player: a landscape
          library photo up top, melting through a gradient into a colour
          sampled from the photo, with the transport over the image and the
          time / title / scrubber on the solid colour below. */}
      {current && expanded && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 70, fontFamily: FONT, color: "#F6F0E6",
            background: oSolid,
            display: "flex", flexDirection: "column", overflow: "hidden",
            paddingTop: "max(0.75rem, var(--safe-top))",
            paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
          }}
        >
          {/* Photo + gradient backdrop. The photo fills the top ~66%; the
              gradient fades it into the solid colour so there's no seam. */}
          <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            {officeBg && (
              <img
                src={officeBg}
                alt=""
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "68%", objectFit: "cover" }}
              />
            )}
            <div
              style={{
                position: "absolute", inset: 0,
                background: `linear-gradient(to bottom, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.06) 14%, ${oRgba(0)} 32%, ${oRgba(0.45)} 48%, ${oRgba(0.86)} 60%, ${oSolid} 67%)`,
              }}
            />
          </div>

          {/* Foreground column */}
          <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {/* Top bar: minimize chevron (left) · share (right) */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 18px", flexShrink: 0 }}>
              <button type="button" onClick={() => setExpanded(false)} aria-label={t("podcasts.a11y_minimize")}
                style={{ background: "none", border: "none", color: "#FFFFFF", cursor: "pointer", padding: 6, lineHeight: 0, opacity: 0.95 }}>
                <IconChevronDown />
              </button>
              {canShare ? (
                <button type="button" onClick={shareOffice} aria-label={t("common.share", { defaultValue: "Share" })}
                  style={{ background: "none", border: "none", color: "#FFFFFF", cursor: "pointer", padding: 6, lineHeight: 0, opacity: 0.95 }}>
                  <IconShare />
                </button>
              ) : <span style={{ width: 34 }} />}
            </div>


            {/* Vertical middle. For Listen-to-Scripture (segmentEyebrow set) the
                passage TITLE sits here — big, centred, serif, like an office
                lesson title slide — and the transport moves down to the lower
                block. For podcasts/office the transport stays centred here. */}
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0, padding: "0 28px" }}>
              {current.segmentEyebrow ? (
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.22em", color: "rgba(246,240,230,0.9)", margin: 0, textShadow: "0 1px 10px rgba(0,0,0,0.55)" }}>
                    {current.segmentEyebrow}
                  </p>
                  <p style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 700, color: "#F6F0E6", margin: "12px 0 0", lineHeight: 1.22, letterSpacing: "-0.01em", textShadow: "0 1px 14px rgba(0,0,0,0.6)" }}>
                    {current.title}
                  </p>
                </div>
              ) : transportRow}
            </div>

            {/* Lower block on the solid colour: big remaining time, scrubber,
                title, show, and the office source toggle. */}
            <div style={{ flexShrink: 0, padding: "0 26px" }}>
              {/* Scripture: the transport lives down here (the title took the
                  middle). Podcasts/office already have it in the middle. */}
              {current.segmentEyebrow && (
                <div style={{ marginBottom: 22 }}>{transportRow}</div>
              )}
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <span style={{ fontFamily: SERIF, fontSize: 58, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1, color: "#F6F0E6" }}>
                  {duration > 0 ? fmtClock(displayRemaining) : fmtClock(displayTime)}
                </span>
              </div>

              <div {...scrubHandlers} role="slider" aria-label={t("podcasts.a11y_seek")} aria-valuenow={Math.round(displayPct)}
                style={{ position: "relative", padding: "11px 0", marginTop: 5, cursor: "pointer", touchAction: "none" }}>
                <div style={{ height: 5, borderRadius: 999, background: "rgba(246,240,230,0.22)", overflow: "hidden" }}>
                  <div style={{ width: `${displayPct}%`, height: "100%", background: "#F6F0E6" }} />
                </div>
                <div style={{ position: "absolute", top: "50%", left: `${displayPct}%`, width: 14, height: 14, borderRadius: "50%", background: "#F6F0E6", transform: "translate(-50%, -50%)", boxShadow: "0 1px 5px rgba(0,0,0,0.45)", pointerEvents: "none" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(246,240,230,0.7)", margin: "2px 1px 0" }}>
                <span>{fmtClock(displayTime)}</span>
                <span>{duration > 0 ? `-${fmtClock(displayRemaining)}` : "--:--"}</span>
              </div>

              {/* The verse is already shown over the photo for scripture
                  segments — don't repeat it here. */}
              {!current.segmentEyebrow && (
                <h2 style={{ fontFamily: SERIF, fontSize: 25, fontWeight: 700, margin: "16px 0 0", lineHeight: 1.18, color: "#F6F0E6", transition: "opacity 0.3s" }}>
                  {officeTitle}
                </h2>
              )}
              {/* Show line: a plain label for offices, a tappable "view show"
                  link for podcasts (so the immersive player keeps the library's
                  show navigation). */}
              {officeSide !== null ? (
                <p style={{ fontSize: 14, color: "rgba(246,240,230,0.72)", margin: "5px 0 0", fontFamily: FONT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {current.showTitle ?? ""}
                </p>
              ) : (
                <button type="button"
                  onClick={() => { setExpanded(false); setLocation(current.showHref ?? `/podcasts/show/${current.showSlug}`); }}
                  style={{ background: "none", border: "none", padding: 0, margin: "5px 0 0", fontFamily: FONT, fontSize: 14, color: "rgba(246,240,230,0.78)", cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", display: "block", textAlign: "left" }}>
                  {current.showTitle ?? t("podcasts.view_show")}
                </button>
              )}

              {officeSide !== null ? (
                /* Forward Movement ↔ Church of England ↔ Gregory — offices only */
                <div
                  role="tablist"
                  aria-label={t("podcasts.office_tradition_aria", { defaultValue: "Prayer tradition" })}
                  style={{ display: "inline-flex", flexWrap: "wrap", justifyContent: "center", gap: 4, maxWidth: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, padding: 4, margin: "16px 0 0" }}
                >
                  {(["forward-movement", "church-of-england", "gregory"] as const).map((s) => {
                    const active = officeAudioSource === s;
                    const i18nKey = s === "gregory" ? "podcasts.office_source_gregory" : s === "church-of-england" ? "podcasts.office_source_coe" : "podcasts.office_source_fm";
                    const label = s === "gregory" ? "Gregorian" : s === "church-of-england" ? "Church of England" : "Forward Movement";
                    return (
                      <button key={s} type="button" role="tab" aria-selected={active}
                        onClick={() => switchOfficeSource(s)} disabled={sourceSwitching}
                        style={{
                          borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 600, fontFamily: FONT,
                          cursor: sourceSwitching ? "wait" : "pointer", whiteSpace: "nowrap",
                          background: active ? "rgba(255,255,255,0.18)" : "transparent",
                          border: `1px solid ${active ? "rgba(255,255,255,0.3)" : "transparent"}`,
                          color: active ? "#FFFFFF" : "rgba(246,240,230,0.6)",
                          transition: "background 0.15s, color 0.15s",
                        }}>
                        {t(i18nKey, { defaultValue: label })}
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* Podcast actions: playback speed. */
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 0" }}>
                  <button type="button" onClick={cycleRate} aria-label={t("podcasts.a11y_speed")}
                    style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", color: "#F6F0E6", fontSize: 12, fontWeight: 700, borderRadius: 999, padding: "6px 12px", cursor: "pointer", fontFamily: FONT }}>
                    {rate}×
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Post-office "up next" — gently offer Forward Day by Day after the daily
          office finishes. Optional: Listen plays today's FDD episode; Not now
          dismisses. Sits above the full-screen office player. */}
      {current && expanded && fddOffer && (
        <div
          style={{
            position: "fixed", left: 0, right: 0, zIndex: 80,
            bottom: "max(1.25rem, env(safe-area-inset-bottom))",
            display: "flex", justifyContent: "center", padding: "0 16px", fontFamily: FONT,
          }}
        >
          <div
            style={{
              width: "100%", maxWidth: 460,
              background: "rgba(9,26,16,0.86)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
              border: "1px solid rgba(96,141,209,0.45)", borderRadius: 18,
              padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
              boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(150,178,214,0.85)" }}>
                {t("podcasts.fdd_up_next_eyebrow", { defaultValue: "Up next" })}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 15, fontWeight: 600, color: "#F0EDE6" }}>
                {t("podcasts.fdd_up_next_title", { defaultValue: "Forward Day by Day" })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFddOffer(false)}
              style={{ background: "none", border: "none", color: "rgba(143,175,150,0.85)", fontSize: 13, fontFamily: FONT, cursor: "pointer", padding: "8px 6px", flexShrink: 0 }}
            >
              {t("podcasts.fdd_up_next_dismiss", { defaultValue: "Not now" })}
            </button>
            <button
              type="button"
              onClick={playFddNext}
              style={{ flexShrink: 0, background: "rgba(96,141,209,0.85)", color: "#F0EDE6", border: "1px solid rgba(96,141,209,0.6)", borderRadius: 999, padding: "9px 18px", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              🎧 {t("podcasts.fdd_up_next_listen", { defaultValue: "Listen" })}
            </button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
