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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Maximize2,
  Play,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { isNativeShell } from "@/lib/isNativeShell";
import {
  videoLabel,
  type CourseIndex,
  type JourneyCourse,
  type JourneyUnit,
} from "@/lib/spiritualJourney";
import { useCourseProgress } from "@/lib/courseProgress";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

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

// ─── YouTube IFrame API loader (singleton) ───────────────────────────────────

let ytApiPromise: Promise<any> | null = null;
function loadYouTubeApi(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      try { prev?.(); } catch { /* ignore other consumers */ }
      resolve(w.YT);
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

// ─── In-app player ───────────────────────────────────────────────────────────
// Creates a single YT.Player and swaps videos with cue/load so navigating
// between lessons doesn't tear down and rebuild the iframe (which flickers).

function LessonPlayer({
  videoId,
  autoplay,
  onEnded,
  onPlaying,
}: {
  videoId: string;
  autoplay: boolean;
  onEnded: () => void;
  onPlaying?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const endedRef = useRef(false);

  const desiredRef = useRef(videoId);
  const autoplayRef = useRef(autoplay);
  const onEndedRef = useRef(onEnded);
  const onPlayingRef = useRef(onPlaying);
  desiredRef.current = videoId;
  autoplayRef.current = autoplay;
  onEndedRef.current = onEnded;
  onPlayingRef.current = onPlaying;

  // Create the player once.
  useEffect(() => {
    let cancelled = false;
    const initial = desiredRef.current;
    loadYouTubeApi().then((YT) => {
      if (cancelled || !hostRef.current) return;
      playerRef.current = new YT.Player(hostRef.current, {
        videoId: initial,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          autoplay: autoplayRef.current ? 1 : 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (e: any) => {
            readyRef.current = true;
            // If the desired video changed while the API was loading, honour it.
            if (desiredRef.current !== initial) {
              if (autoplayRef.current) e.target.loadVideoById(desiredRef.current);
              else e.target.cueVideoById(desiredRef.current);
            }
          },
          onStateChange: (e: any) => {
            // 1 === YT.PlayerState.PLAYING — covers pressing play INSIDE the
            // iframe on the initially-cued video (no openVideo call happens).
            if (e.data === 1) onPlayingRef.current?.();
            // 0 === YT.PlayerState.ENDED
            if (e.data === 0 && !endedRef.current) {
              endedRef.current = true;
              onEndedRef.current();
            }
          },
        },
      });
    });
    return () => {
      cancelled = true;
      try { playerRef.current?.destroy(); } catch { /* ignore */ }
      playerRef.current = null;
      readyRef.current = false;
    };
    // Intentionally create-once; video swaps handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the video when the selection changes.
  useEffect(() => {
    endedRef.current = false;
    const p = playerRef.current;
    if (p && readyRef.current) {
      if (autoplayRef.current) p.loadVideoById(videoId);
      else p.cueVideoById(videoId);
    }
  }, [videoId]);

  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
      return;
    }
    // Prefer the actual YT iframe so fullscreen fills the screen with the video
    // (falls back to the wrapper before the iframe has mounted).
    const iframe = wrapRef.current?.querySelector("iframe") as HTMLElement | null;
    const target = iframe ?? wrapRef.current;
    target?.requestFullscreen?.();
  }, []);

  return (
    <div
      ref={wrapRef}
      className="relative w-full overflow-hidden rounded-2xl bg-black"
      style={{ aspectRatio: "16 / 9", border: `1px solid ${C.border}` }}
    >
      {/* YT.Player replaces this node with its iframe. */}
      <div ref={hostRef} className="absolute inset-0 h-full w-full" />
      <button
        onClick={toggleFullscreen}
        aria-label={isFs ? "Exit fullscreen" : "Fullscreen"}
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg opacity-70 transition-opacity hover:opacity-100"
        style={{ background: "rgba(9,26,16,0.72)", color: C.text, backdropFilter: "blur(4px)" }}
      >
        <Maximize2 size={15} />
      </button>
    </div>
  );
}

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

// ─── Page ────────────────────────────────────────────────────────────────────

export function CoursePage({ course, index }: { course: JourneyCourse; index: CourseIndex }) {
  const { completedCount, isComplete, toggleComplete, markComplete, setLast, lastId, markStarted } = useCourseProgress(course.id);
  // Leaf backdrop (frosted-glass cards float over it) — one photo per visit.
  const leafBg = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

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
    // An explicit open counts as STARTING the course (the home's Learn band
    // keys on this) — merely landing on the page does not.
    markStarted();
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

  // ── Web-only gate ──────────────────────────────────────────────────────────
  if (isNativeShell()) {
    return (
      <Layout bgPhoto={leafBg}>
        <div className="mx-auto w-full max-w-md px-2 py-16 text-center">
          <p className="text-4xl">🎓</p>
          <h1 className="mt-4 text-xl font-bold" style={{ color: C.text, fontFamily: C.font }}>
            {course.title}
          </h1>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: C.sage }}>
            This guided course plays best on the web. Open{" "}
            <span style={{ color: C.dim }}>withphoebe.app</span> in your browser to watch{" "}
            {course.author}'s series and track your progress.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout bgPhoto={leafBg}>
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
            <LessonPlayer videoId={activeId} autoplay={autoplay} onEnded={handleEnded} onPlaying={markStarted} />

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
                          <PracticeBridge compact />
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
            {course.practiceBridge && (
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
          </div>
        </div>
      </div>
    </Layout>
  );
}
