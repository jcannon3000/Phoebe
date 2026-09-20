// ─── CoursePage — the shared Coursera-style course shell (web only) ───────────
//
// One component, two courses (Centering Prayer + The Spiritual Journey — see
// lib/spiritualJourney.ts). Videos play in-app via the YouTube IFrame API (so
// we detect when one ends and offer the next), can go fullscreen, and
// completion is tracked device-locally (lib/courseProgress.ts).
//
// Design (owner, 2026-07-03): no back link — the header starts at the top;
// each unit can be SKIPPED (marks its lessons complete so the course meets you
// where you are); and a course that teaches a PRACTICE (course.practiceBridge)
// carries a "put it into practice" bridge — sit now for 15 or 20 minutes, or
// make it a daily morning/evening rhythm (the customizer's Centering preset).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Play,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { YouTubePlayer } from "@/components/YouTubePlayer";
import { isNativeShell } from "@/lib/isNativeShell";
import { canEmbedVideoHere, isInReaderWatch, openVideoInReader, youtubePoster } from "@/lib/videoEmbed";
import { collectFromReader, pushToApp, readerCoursePath, readerRelayToken, seedFromApp } from "@/lib/courseRelay";
import {
  videoLabel,
  type CourseIndex,
  type JourneyCourse,
  type JourneyUnit,
} from "@/lib/spiritualJourney";
import { isCourseHiddenFromHome, setCourseHiddenFromHome, useCourseProgress } from "@/lib/courseProgress";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { pickWideBackground } from "@/lib/wideBackgrounds";

// Palette (mirrors church-deck / MenuHub). Cards are FROSTED glass — translucent
// green over the leaf backdrop + a backdrop blur — matching the rest of the app.
const C = {
  bg: "#091A10",
  card: "rgba(9,26,16,0.46)",
  cardHi: "rgba(18,45,28,0.55)",
  line: "rgba(200,212,192,0.12)",
  border: "rgba(46,107,64,0.38)",
  text: "#F0EDE6",
  sage: "#8FAF96",
  dim: "#C8D4C0",
  green: "#2D5E3F",
  greenSoft: "rgba(46,107,64,0.16)",
  font: "'Space Grotesk', sans-serif",
} as const;

const FROST = {
  backdropFilter: "blur(11.34px)",
  WebkitBackdropFilter: "blur(11.34px)",
} as const;

// ─── Practice bridge — learning flows into praying ──────────────────────────
// Shown on practice courses (Centering Prayer): sit NOW at Keating's lengths,
// or make it a daily rhythm (the customizer's Centering preset — two sits with
// the CAC reflection — chosen for morning/evening there).

function PracticeBridge({ compact }: { compact?: boolean }) {
  const [, setLocation] = useLocation();
  return (
    <div
      className="rounded-2xl px-4 py-4"
      style={{ background: C.cardHi, border: `1px solid ${C.border}`, ...FROST }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.7)" }}>
        Put it into practice
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: C.dim }}>
        {compact
          ? "You've learned the method — now pray it."
          : "This course teaches a prayer, and the prayer is learned by praying. Fr. Keating taught two sits a day — begin with one."}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => setLocation("/contemplation?begin=1&sit=15")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-semibold transition-opacity hover:opacity-90"
          style={{ background: C.green, color: C.text }}
        >
          🕯️ Sit 15 min
        </button>
        <button
          onClick={() => setLocation("/contemplation?begin=1&sit=20")}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-semibold transition-opacity hover:opacity-90"
          style={{ background: C.green, color: C.text }}
        >
          🕯️ Sit 20 min
        </button>
      </div>
      <button
        onClick={() => setLocation("/rule-of-life?adopt=centering")}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-medium transition-opacity hover:opacity-80"
        style={{ background: "rgba(46,107,64,0.12)", color: C.sage, border: `1px solid ${C.border}` }}
      >
        Make it a daily rhythm — morning or evening
      </button>
    </div>
  );
}

// ─── Syllabus (units → lessons → parts) ──────────────────────────────────────

function UnitBlock({
  unit,
  activeId,
  isComplete,
  onOpen,
  onToggleComplete,
  onSkipUnit,
  defaultOpen,
}: {
  unit: JourneyUnit;
  activeId: string;
  isComplete: (id: string) => boolean;
  onOpen: (id: string) => void;
  onToggleComplete: (id: string) => void;
  onSkipUnit: (videoIds: string[]) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Keep the unit that owns the active video open.
  const ownsActive = unit.lessons.some((l) => l.parts.some((p) => p.id === activeId));
  useEffect(() => {
    if (ownsActive) setOpen(true);
  }, [ownsActive]);

  const videoIds = unit.lessons.flatMap((l) => l.parts.map((p) => p.id));
  const doneCount = videoIds.filter(isComplete).length;
  const unitDone = doneCount === videoIds.length;

  return (
    <div className="rounded-2xl" style={{ background: C.card, border: `1px solid ${C.border}`, ...FROST }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
          style={
            unitDone
              ? { background: C.green, color: C.text }
              : { background: C.greenSoft, color: C.sage, border: `1px solid ${C.border}` }
          }
        >
          {unitDone ? <Check size={13} /> : doneCount}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold" style={{ color: C.text, fontFamily: C.font }}>
            {unit.title}
          </p>
          <p className="text-[11px]" style={{ color: C.sage }}>
            {doneCount} / {videoIds.length} complete
          </p>
        </div>
        <ChevronDown
          size={16}
          style={{ color: C.sage, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-2">
              {unit.lessons.map((lesson, li) => (
                <div key={li} className="mb-1 last:mb-0">
                  {lesson.parts.length > 1 && (
                    <p className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(143,175,150,0.65)" }}>
                      {lesson.talk ? `${lesson.talk}. ` : ""}{lesson.title}
                    </p>
                  )}
                  {lesson.parts.map((part) => {
                    const active = part.id === activeId;
                    const done = isComplete(part.id);
                    const rowLabel =
                      lesson.parts.length > 1
                        ? part.label
                        : `${lesson.talk ? `${lesson.talk}. ` : ""}${lesson.title}`;
                    return (
                      <div
                        key={part.id}
                        className="flex items-center gap-1 rounded-xl"
                        style={active ? { background: C.greenSoft } : undefined}
                      >
                        <button
                          onClick={() => onToggleComplete(part.id)}
                          aria-label={done ? "Mark not complete" : "Mark complete"}
                          className="flex h-9 w-9 shrink-0 items-center justify-center"
                        >
                          {done ? (
                            <CheckCircle2 size={18} style={{ color: "#5FBF7F" }} />
                          ) : (
                            <Circle size={18} style={{ color: "rgba(143,175,150,0.45)" }} />
                          )}
                        </button>
                        <button
                          onClick={() => onOpen(part.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-left"
                        >
                          <span
                            className="truncate text-[13px]"
                            style={{
                              color: active ? C.text : done ? C.sage : C.dim,
                              fontWeight: active ? 600 : 400,
                              fontFamily: C.font,
                            }}
                          >
                            {rowLabel}
                          </span>
                          {active && <Play size={12} className="shrink-0" style={{ color: "#5FBF7F" }} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
              {/* Skip the unit — the course meets you where you are: already
                  familiar with this ground? Mark it and move on (each lesson's
                  circle can still unmark individually). */}
              {!unitDone && (
                <button
                  onClick={() => onSkipUnit(videoIds)}
                  className="mb-1 mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-medium transition-opacity hover:opacity-80"
                  style={{ color: "rgba(143,175,150,0.75)", border: `1px dashed ${C.border}` }}
                >
                  <Check size={13} /> Skip this unit — mark it complete
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * INSIDE THE READER, NO APP CHROME (audit, 2026-09-18). On iOS this page is
 * opened in the in-app reader at withphoebe.app (lib/videoEmbed), and wrapped
 * in <Layout> it carried the Phoebe wordmark and the Menu drawer — a second
 * copy of the app inside the first, where tapping the wordmark wandered off to
 * the web home and the drawer offered "Sign in". The reader supplies Done; the
 * page is just the course.
 */
/**
 * THE READER'S OWN GROUND. Inside the reader there is no Layout, so the page
 * used to be flat #0C1F12 while the same course on the web sat on leaves
 * (owner, 2026-09-19: "Can it have a leaf backround?"). Same photo and the
 * same scrim the icon gallery uses, laid down here.
 *
 * isolation + absolute inset-0, never position:fixed — see memory's
 * page-backdrop pattern; a fixed backdrop bleeds through the safe-area padding
 * on iOS. No entrance animation either.
 */
export function ReaderShell({ children, photo }: { children: ReactNode; photo: string | null }) {
  return (
    <div
      style={{
        position: "relative", isolation: "isolate", minHeight: "100dvh",
        background: C.bg, color: C.text,
        padding: "calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(env(safe-area-inset-bottom, 0px) + 28px)",
      }}
    >
      {photo && (
        <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, overflow: "hidden" }}>
          <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.38 }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(5,13,8,0.74), rgba(5,13,8,0.66) 45%, rgba(5,13,8,0.8))" }} />
          {/* THE JOIN WITH THE NATIVE BAR (owner, 2026-09-19: "Can the top bar
              match or no?"). The bar takes this page's ground colour exactly —
              it probes it — but the page's own top band is a photograph, so a
              flat bar over leaf texture still read as a separate slab. The
              first inch fades from the ground colour, and the two become one
              surface. Below it the photo is at full strength as before. */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 120, background: `linear-gradient(180deg, ${C.bg} 0%, ${C.bg} 18%, rgba(9,26,16,0) 100%)` }} />
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * WHEN THE READER WAS LAST OPENED for a course, so returning from it cannot
 * bounce straight back in. The page stays mounted while the reader is up, so a
 * ref would normally be enough; this also covers the case where coming back
 * remounts the page (a refetched progress query, a re-entered route). Module
 * level, because the guard has to outlive the component.
 */
const lastReaderOpenAt = new Map<string, number>();
const REOPEN_GUARD_MS = 1500;

/** Seconds of real playback that count as having started the course. */
const START_AFTER_S = 30;

// ─── Page ────────────────────────────────────────────────────────────────────

export function CoursePage({ course, index }: { course: JourneyCourse; index: CourseIndex }) {
  const { completed, completedCount, isComplete, toggleComplete, markComplete, setLast, lastId, markStarted, started } = useCourseProgress(course.id);
  const inReader = isInReaderWatch();
  const [hiddenFromHome, setHiddenFromHome] = useState(() => isCourseHiddenFromHome(course.id));
  // Leaf backdrop (frosted-glass cards float over it) — one photo per visit,
  // and the same one behind the reader view (see ReaderShell).
  const leafBg = useMemo(() => pickWideBackground() ?? (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  // Which video is on-screen. Seed from ?v= or the last watched, else the first.
  const [activeId, setActiveId] = useState<string>(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("v");
      if (q && index.get(q)) return q;
    } catch { /* ignore */ }
    if (lastId && index.get(lastId)) return lastId;
    return index.firstId;
  });
  const [autoplay, setAutoplay] = useState(false);
  const [justEnded, setJustEnded] = useState(false);
  const playerTopRef = useRef<HTMLDivElement>(null);

  const active = index.get(activeId);
  const next = active ? index.next(activeId) : undefined;
  const prev = active ? index.prev(activeId) : undefined;
  const activeDone = isComplete(activeId);

  // Remember where we are (Resume) + reflect it in the URL for shareable links.
  useEffect(() => {
    setLast(activeId);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("v", activeId);
      window.history.replaceState(null, "", url.toString());
    } catch { /* ignore */ }
  }, [activeId, setLast]);

  const openVideo = useCallback((id: string, opts?: { autoplay?: boolean }) => {
    if (!index.get(id)) return;
    // Opening a lesson is NOT starting the course any more: thirty seconds of
    // it playing is (onPlayedSeconds, owner 2026-09-19). Opening still stamps
    // the lesson as the one to come back to, through setLast below.
    setActiveId(id);
    setAutoplay(!!opts?.autoplay);
    setJustEnded(false);
    // Bring the player into view (helps on mobile where the syllabus is long).
    requestAnimationFrame(() => {
      playerTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [index]);

  const handleEnded = useCallback(() => {
    markComplete(activeId);
    setJustEnded(true);
  }, [activeId, markComplete]);

  const skipUnit = useCallback((videoIds: string[]) => {
    for (const id of videoIds) markComplete(id);
  }, [markComplete]);

  const pct = Math.round((completedCount / Math.max(1, index.total)) * 100);

  /**
   * THE READER'S HALF OF THE HAND-BACK (lib/courseRelay). Seed from the app's
   * progress once, before first paint, and resume where the app says — unless
   * the URL already names a lesson (a reload inside the reader).
   */
  useLayoutEffect(() => {
    if (!inReader) return;
    const seeded = seedFromApp(course.id);
    let pinned = false;
    try { pinned = !!new URLSearchParams(window.location.search).get("v"); } catch { /* ignore */ }
    if (seeded?.resumeId && !pinned && index.get(seeded.resumeId)) setActiveId(seeded.resumeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** …and after every change, send the snapshot back under the code. */
  const completedKey = useMemo(() => [...completed].sort().join("."), [completed]);
  useEffect(() => {
    if (!inReader) return;
    const token = readerRelayToken();
    if (!token) return;
    const t = window.setTimeout(() => { void pushToApp(course.id, token); }, 400);
    return () => window.clearTimeout(t);
  }, [inReader, course.id, completedKey, lastId, started]);

  /**
   * THE APP'S HALF: when the reader closes (phoebe:browserfinished), when the
   * app comes back to the front, and on arriving here, take back whatever was
   * watched in the reader. Only where this page hands off to the reader.
   */
  const handsOffToReader = isNativeShell() && !canEmbedVideoHere();
  useEffect(() => {
    if (!handsOffToReader) return;
    const collect = () => { void collectFromReader(course.id); };
    const onVisible = () => { if (document.visibilityState === "visible") collect(); };
    collect();
    window.addEventListener("phoebe:browserfinished", collect);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("phoebe:browserfinished", collect);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [handsOffToReader, course.id]);

  /** Start the course and hand this page to the reader. */
  const openCourseInReader = useCallback(() => {
    // NOT markStarted(): opening is not starting any more — thirty seconds of
    // watching is (see onPlayedSeconds), and the reader relays that home.
    lastReaderOpenAt.set(course.id, Date.now());
    return openVideoInReader(readerCoursePath(course.id, window.location.pathname));
  }, [course.id]);

  /**
   * STRAIGHT INTO THE READER (owner, 2026-09-19: "When we tap a centering
   * prayer course, skip this slide and go straight to the browser").
   *
   * Tapping a video course on iOS used to land on the poster below — a still,
   * a play button and one more tap to get what they had already asked for.
   * Now the tap opens the reader itself, from wherever the course was tapped:
   * every door (the home's Continue card, /learn, /menu/learn, a Courses row)
   * comes through this page, so opening on arrival covers them all.
   *
   * The poster is still the page underneath, which is where the reader closes
   * back to — by then with the progress it just collected — and it is what a
   * person sees if the reader refuses to open at all. Both reasons it must NOT
   * reopen on its own: once per arrival, and never within a moment of the last
   * open, or closing the reader would throw them back into it.
   */
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!handsOffToReader) return;
    const openNow = () => {
      if (autoOpenedRef.current) return;
      // Not while the app is in the background: a course page built behind the
      // reader (or off screen) must not steal the front when it comes back.
      // This is a WAIT, not a refusal — see the listener below.
      if (document.visibilityState !== "visible") return;
      const last = lastReaderOpenAt.get(course.id) ?? 0;
      if (Date.now() - last < REOPEN_GUARD_MS) return;
      autoOpenedRef.current = true;
      openCourseInReader();
    };
    openNow();
    /**
     * ONE SHOT, BUT NOT A WASTED ONE. This used to mark itself done before
     * testing visibility, so a page that mounted while the app was not in
     * front — a cold start still on the splash, a route built behind
     * something — spent its only attempt and left the person on the poster
     * with no way back but another tap. Now the attempt is spent only when
     * the reader actually opens, and becoming visible tries again.
     */
    const onVisible = () => { if (document.visibilityState === "visible") openNow(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [handsOffToReader, course.id, openCourseInReader]);

  /**
   * WHERE YOUTUBE WON'T EMBED — the iOS shell, whose capacitor:// origin the
   * player refuses (lib/videoEmbed). This used to be a dead end: "this guided
   * course plays best on the web … open withphoebe.app in your browser". It now
   * hands the SAME course page to the in-app reader, where the origin is real,
   * so the course plays full screen inside Phoebe with our own chrome (owner,
   * 2026-09-18: "can we bring that into mobile … in a seamless experience").
   *
   * Android needs none of this — it embeds in place, a few lines down.
   */
  /**
   * THIRTY SECONDS OF WATCHING IS STARTING THE COURSE (owner, 2026-09-19:
   * "once I've started 30 seconds, act as if I've started the course and show
   * it on the Home Screen and stuff").
   *
   * It used to be the tap — pressing play, or opening the reader — which put a
   * course on the home for anyone who looked at it for a moment and left. The
   * count is real playing time from YouTubePlayer's own ticker, so a video
   * opened and left paused never gets there. markStarted is idempotent, so
   * this cannot double-fire and a resumed lesson does not re-start anything.
   * On iOS the watching happens in the reader, and `started` rides the relay
   * home like the rest of the progress.
   */
  const onPlayedSeconds = useCallback((secs: number) => {
    if (secs >= START_AFTER_S) markStarted();
  }, [markStarted]);

  /**
   * NAME THE PAGE, for the reader's top bar (owner, 2026-09-19: "The top of
   * that reader shouldn't say Phoebe it should be related to the content, or
   * course"). The native bar takes the document's title and refuses only the
   * literal "Phoebe", which is what every page of ours is called until it says
   * otherwise. The lesson is named too, since that is what they are watching.
   */
  useEffect(() => {
    if (!inReader) return;
    const was = document.title;
    document.title = active ? `${course.title} · ${active.lessonTitle}` : course.title;
    return () => { document.title = was; };
  }, [inReader, course.title, active]);

  /** The quiet "off my home screen" line — the bottom of both shells. */
  const removeFromHome = (
    <button
      type="button"
      onClick={() => { setCourseHiddenFromHome(course.id, !hiddenFromHome); setHiddenFromHome((v) => !v); }}
      className="text-[12px] underline underline-offset-2 transition-opacity hover:opacity-80"
      style={{ color: "rgba(143,175,150,0.75)", background: "none", border: "none", padding: 0, cursor: "pointer" }}
    >
      {hiddenFromHome ? "Show this course on my home screen" : "Remove from my home screen"}
    </button>
  );

  if (handsOffToReader) {
    return (
      <Layout bgPhoto={leafBg}>
        <div className="mx-auto w-full max-w-md px-2 py-10">
          <h1 className="text-2xl font-bold" style={{ color: C.text, fontFamily: C.font }}>
            {course.title}
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: C.sage }}>with {course.author}</p>
          <button
            onClick={openCourseInReader}
            className="mt-4 w-full overflow-hidden rounded-2xl text-left transition-opacity active:opacity-90"
            style={{ border: `1px solid ${C.border}`, background: "#000" }}
          >
            <span className="relative block w-full" style={{ aspectRatio: "16 / 9" }}>
              <img
                src={youtubePoster(activeId)}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                style={{ opacity: 0.72 }}
              />
              <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ background: C.green, color: C.text }}
                >
                  <Play size={22} style={{ marginLeft: 3 }} />
                </span>
              </span>
            </span>
            <span className="block px-4 py-3" style={{ background: C.greenSoft }}>
              <span className="block text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.7)" }}>
                {completedCount} of {index.total} lessons complete
              </span>
              <span className="mt-0.5 block text-[15px] font-semibold" style={{ color: C.text, fontFamily: C.font }}>
                {active ? active.lessonTitle : course.title}
              </span>
            </span>
          </button>
          <p className="mt-3 text-[13px] leading-relaxed" style={{ color: C.dim }}>
            {course.tagline}
          </p>
          <div className="mt-6 flex justify-center">{removeFromHome}</div>
        </div>
      </Layout>
    );
  }

  // One element tree, placed in whichever wrapper fits. (Not a component
  // defined here: a new component type each render would remount the whole
  // page — the player included — every time anything changed.)
  const body = (
    <>
      <div className="mx-auto w-full max-w-5xl">
        {/* Header — starts right at the top (no back link; the header IS the page). */}
        <div className="mb-5">
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-bold" style={{ color: C.text, fontFamily: C.font }}>
              {course.title}
            </h1>
            <span className="text-lg">🎓</span>
          </div>
          <p className="mt-0.5 text-sm" style={{ color: C.sage }}>
            with {course.author}
          </p>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed" style={{ color: C.dim }}>
            {course.tagline}
          </p>

          {/* Overall progress */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-[11px]" style={{ color: C.sage }}>
              <span>{completedCount} of {index.total} lessons complete</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(200,212,192,0.12)" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: "linear-gradient(90deg,#2D5E3F,#5FBF7F)" }}
              />
            </div>
          </div>

        </div>

        <div className="h-px" style={{ background: C.line }} />

        <div className="mt-5 flex flex-col gap-6 lg:flex-row">
          {/* Main: player + lesson detail */}
          <div className="min-w-0 flex-1" ref={playerTopRef}>
            {/* EDGE TO EDGE (owner: "Can the video be full width and not
                rounded courners"). The page is a centred column, so the video
                steps out of it: full viewport width, no frame, no corners. On
                a wide screen it sits in its column as before. */}
            <div className="video-bleed">
              <YouTubePlayer
                videoId={activeId}
                autoplay={autoplay}
                onEnded={handleEnded}
                onPlayedSeconds={onPlayedSeconds}
                frame="bleed"
              />
            </div>

            {active && (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.7)" }}>
                  Unit · {active.unitTitle}
                </p>
                <h2 className="mt-1 text-lg font-bold leading-snug" style={{ color: C.text, fontFamily: C.font }}>
                  {active.talk ? `${active.talk}. ` : ""}{active.lessonTitle}
                </h2>
                {active.multiPart && (
                  <p className="mt-0.5 text-sm" style={{ color: C.sage }}>
                    {active.partLabel}
                  </p>
                )}
                <p className="mt-1 text-[11px]" style={{ color: "rgba(143,175,150,0.6)" }}>
                  Lesson {active.index} of {index.total} · playing inside Phoebe — tap ⛶ for fullscreen
                </p>

                {/* Mark complete */}
                <button
                  onClick={() => toggleComplete(activeId)}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                  style={
                    activeDone
                      ? { background: C.greenSoft, color: "#5FBF7F", border: `1px solid ${C.border}` }
                      : { background: C.green, color: C.text }
                  }
                >
                  {activeDone ? (
                    <><CheckCircle2 size={17} /> Completed — tap to unmark</>
                  ) : (
                    <><Circle size={17} /> Mark this lesson complete</>
                  )}
                </button>

                {/* Prev / Next */}
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={() => prev && openVideo(prev.id, { autoplay: false })}
                    disabled={!prev}
                    className="flex flex-1 items-center justify-center gap-1 rounded-xl py-2.5 text-[13px] font-medium transition-opacity hover:opacity-80 disabled:opacity-30"
                    style={{ background: "rgba(46,107,64,0.12)", color: C.sage, border: `1px solid ${C.border}` }}
                  >
                    <ChevronLeft size={15} /> Previous
                  </button>
                  <button
                    onClick={() => next && openVideo(next.id, { autoplay: true })}
                    disabled={!next}
                    className="flex flex-1 items-center justify-center gap-1 rounded-xl py-2.5 text-[13px] font-medium transition-opacity hover:opacity-80 disabled:opacity-30"
                    style={{ background: "rgba(46,107,64,0.12)", color: C.sage, border: `1px solid ${C.border}` }}
                  >
                    Next <ChevronRight size={15} />
                  </button>
                </div>

                {/* Up-next card, revealed when the video finishes */}
                <AnimatePresence>
                  {justEnded && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="mt-4 rounded-2xl px-4 py-4"
                      style={{ background: C.cardHi, border: `1px solid ${C.border}`, ...FROST }}
                    >
                      <p className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "#5FBF7F" }}>
                        <Check size={15} /> Lesson complete
                      </p>
                      {next ? (
                        <>
                          <p className="mt-2 text-[11px] uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.7)" }}>
                            Up next
                          </p>
                          <p className="mt-0.5 text-sm font-medium" style={{ color: C.text, fontFamily: C.font }}>
                            {videoLabel(next)}
                          </p>
                          <button
                            onClick={() => openVideo(next.id, { autoplay: true })}
                            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
                            style={{ background: C.green, color: C.text }}
                          >
                            <Play size={14} /> Continue
                          </button>
                        </>
                      ) : course.practiceBridge ? (
                        // The course's real ending isn't a video — it's the sit.
                        <div className="mt-2">
                          {inReader ? (
                            <p className="text-sm leading-relaxed" style={{ color: C.sage }}>
                              You've learned the method — now pray it. Tap Done, and begin a sit in Phoebe.
                            </p>
                          ) : (
                            <PracticeBridge compact />
                          )}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm leading-relaxed" style={{ color: C.sage }}>
                          You've reached the end of the journey. May it bear fruit in your prayer. 🙏🏽
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Syllabus */}
          <div className="lg:w-[360px] lg:shrink-0">
            {/* Practice courses put the PRAYER above the syllabus — the point of
                the course is the practice, so it's never below the fold. */}
            {course.practiceBridge && !inReader && (
              <div className="mb-4">
                <PracticeBridge />
              </div>
            )}
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.7)" }}>
              Course contents · {course.units.length} {course.units.length === 1 ? "unit" : "units"}
            </p>
            <div className="space-y-2">
              {course.units.map((unit) => (
                <UnitBlock
                  key={unit.id}
                  unit={unit}
                  activeId={activeId}
                  isComplete={isComplete}
                  onOpen={(id) => openVideo(id, { autoplay: false })}
                  onToggleComplete={toggleComplete}
                  onSkipUnit={skipUnit}
                  defaultOpen={unit.lessons.some((l) => l.parts.some((p) => p.id === activeId))}
                />
              ))}
            </div>
            <p className="mt-4 px-1 text-[11px] italic leading-relaxed" style={{ color: "rgba(143,175,150,0.5)" }}>
              Videos courtesy of Contemplative Outreach on YouTube. Your progress is saved on this device.
            </p>
            {/* AT THE BOTTOM (owner, 2026-09-19: "Make sure at the bottom of
                the page they can remove the course from their Home Screen?").
                It used to sit under the progress bar, where it read as part of
                the course's own controls. Quiet, like "Discard session": it
                changes what the home SHOWS, never what you've done — the
                progress stays, the course stays in Courses, and the same line
                puts it back. In the reader too, where it rides the relay home
                with everything else watched there. */}
            <div className="mt-6 flex justify-center">{removeFromHome}</div>
          </div>
        </div>
      </div>
    </>
  );
  return inReader ? <ReaderShell photo={leafBg}>{body}</ReaderShell> : <Layout bgPhoto={leafBg}>{body}</Layout>;
}
