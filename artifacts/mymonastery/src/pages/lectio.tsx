/**
 * Lectio Divina — slideshow page.
 *
 * /lectio/:momentToken/:userToken
 *
 * The practice is presented as a guided, four-beat slideshow per unlocked
 * stage (Lectio → Meditatio → Oratio):
 *
 *   1. Prompt     — the stage's question, sitting alone in quiet space
 *   2. Reading    — the Sunday Gospel
 *   3. Entry      — the user's own reflection (textarea + Share)
 *   4. Responses  — what others in the circle have heard (gated: share to see)
 *
 * If the user is catching up (today is Wed but they haven't done Lectio),
 * all incomplete unlocked stages are chained — finishing Lectio's responses
 * slide lands them on Meditatio's prompt slide, and so on.
 *
 * There is no separate Sunday gathering view anymore; on Sunday, every stage
 * is unlocked and the slideshow just walks through all three.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO, isToday } from "date-fns";
import { apiRequest } from "@/lib/queryClient";

type Stage = "lectio" | "meditatio" | "oratio";
const STAGE_ORDER: Stage[] = ["lectio", "meditatio", "oratio"];

// Stage naming: the slideshow speaks in plain English ("First Stage") so
// newcomers aren't tripped up by Latin. The Latin name still appears as a
// quieter subtitle for those who recognize the tradition.
const STAGE_ORDINAL: Record<Stage, string> = {
  lectio: "Stage 1",
  meditatio: "Stage 2",
  oratio: "Stage 3",
};
const STAGE_LATIN: Record<Stage, string> = {
  lectio: "Lectio",
  meditatio: "Meditatio",
  oratio: "Oratio",
};
// Day-of-week each stage unlocks on. Surfaced on the welcome slide so the
// rhythm is immediately legible (Mon · Lectio / Wed · Meditatio / Fri · Oratio).
const STAGE_DAY_LABEL: Record<Stage, string> = {
  lectio: "Monday",
  meditatio: "Wednesday",
  oratio: "Friday",
};
// Instructive prompt text. The three beats of each stage mirror the classic
// "read · reflect in silence · share aloud" structure of a Lectio Divina
// circle — adapted for a reading practice (you read the passage; you don't
// only listen to it read aloud).
const STAGE_PROMPT_TEXT: Record<Stage, string> = {
  lectio:
    "We read God's Word for the first time, listening for a word or phrase that God may speak to us today. We reflect in silence. Then we share the word or phrase that spoke to our heart.",
  meditatio:
    "We read God's Word for the second time. We reflect in silence on what God may be saying to us through the word or phrase that spoke to our heart. Then we share what it means to us.",
  oratio:
    "We read God's Word for the third time. We reflect in silence on how God may be calling us to act through the word or phrase that spoke to our heart. Then we share how we feel called to respond.",
};

type StageReveal = {
  label: string;
  prompt: string;
  unlocked: boolean;
  userHasSubmitted: boolean;
  myReflection: string | null;
  reflections:
    | Array<{ userName: string; isYou: boolean; text: string; createdAt: string }>
    | null;
  mutedReflections: Array<{ userName: string; text: string; createdAt: string }>;
  mutedCount: number;
  nonSubmitterNames: string[];
};

type LectioData = {
  moment: {
    id: number;
    name: string;
    intention: string;
    templateType: string;
    timezone: string;
    createdAt: string;
    allowMemberInvites?: boolean;
  };
  userName: string;
  userToken: string;
  isCreator: boolean;
  members: Array<{ name: string; email: string; isYou: boolean; joined?: boolean }>;
  memberCount: number;
  week: {
    sundayDate: string;
    phaseLabel: string;
    currentStage: Stage | null;
    unlockedStages: Stage[];
    isSunday: boolean;
  };
  reading: {
    sundayDate: string;
    sundayName: string;
    liturgicalSeason: string | null;
    liturgicalYear: string | null;
    gospelReference: string;
    gospelText: string;
    sourceUrl: string | null;
    fallbackReason?: string | null;
  };
  stages: Record<Stage, StageReveal>;
};

// Custom error carrying the server's structured error body so the error screen
// can tell us WHICH step failed (moment_lookup, user_lookup, template_check,
// reading_fetch, unknown) instead of a generic "couldn't load" message.
class LectioFetchError extends Error {
  status: number;
  stage: string | null;
  detail: string | null;
  constructor(status: number, stage: string | null, detail: string | null, message: string) {
    super(message);
    this.status = status;
    this.stage = stage;
    this.detail = detail;
  }
}

async function fetchLectio(momentToken: string, userToken: string): Promise<LectioData> {
  const res = await fetch(`/api/lectio/${momentToken}/${userToken}`, { credentials: "include" });
  if (!res.ok) {
    let stage: string | null = null;
    let detail: string | null = null;
    let errCode: string | null = null;
    try {
      const body = await res.json();
      stage = body?.stage ?? null;
      detail = body?.detail ?? null;
      errCode = body?.error ?? null;
    } catch { /* non-JSON body */ }
    throw new LectioFetchError(
      res.status,
      stage,
      detail,
      errCode ?? `HTTP ${res.status}`,
    );
  }
  return res.json() as Promise<LectioData>;
}

// ─── Palette ────────────────────────────────────────────────────────────────
// Background matches the app's standard body color (#091A10) so the Safari
// chrome (which reads the <meta name="theme-color"> value) blends with the
// page. Slide content sits directly on this background — no card wrapping.
const BG = "#091A10";
const WARM_TEXT = "#F0EDE6";
const MUTED_GREEN = "#8FAF96";
const FAINT_GREEN = "rgba(143,175,150,0.55)";
// Card (reading + all-responses). Slightly brighter than the page so the
// card reads as a raised surface. CARD_FADE_* are used for the "more
// below" gradient at the bottom of the scrollable area — the solid stop
// matches the composite of CARD_BG over BG so the fade is invisible on
// the background but opaque over text.
const CARD_BG = "rgba(32,70,46,0.78)";
const CARD_FADE_TRANSPARENT = "rgba(28,58,38,0)";
const CARD_FADE_SOLID = "rgba(28,58,38,0.98)";
const ACCENT = "#6FAF85";
const BORDER = "rgba(200,212,192,0.15)";
const BUTTON_BG = "#2D5E3F";

// Every bit of copy on this page is Space Grotesk (not Georgia/serif). We
// set it at the page root so we don't have to restate it on every slide.
const SPACE_GROTESK =
  "'Space Grotesk', system-ui, -apple-system, Segoe UI, sans-serif";

// ─── Slide model ────────────────────────────────────────────────────────────

type SlideKind = "welcome" | "status" | "prompt" | "reading" | "entry" | "responses" | "summary" | "all-responses" | "coming-soon";
// Welcome + summary slides aren't bound to a specific stage — they frame
// the whole week — so `stage` is nullable and readers must check `kind` first.
type Slide = { stage: Stage | null; kind: SlideKind };

function allStagesSubmitted(data: LectioData): boolean {
  const unlocked = STAGE_ORDER.filter((s) => data.stages[s].unlocked);
  if (unlocked.length === 0) return false;
  return unlocked.every((s) => data.stages[s].userHasSubmitted);
}

function buildSlides(data: LectioData): Slide[] {
  const slides: Slide[] = [];
  // Status slide — always shown as the landing page. On first visit it
  // serves as the welcome/onboarding screen. On subsequent visits it shows
  // the week's progress: which stages are done, which are next, who has
  // responded. This replaces the old "welcome only on first visit" approach.
  slides.push({ stage: null, kind: "status" });

  for (const s of STAGE_ORDER) {
    if (!data.stages[s].unlocked) continue;
    slides.push({ stage: s, kind: "prompt" });
    slides.push({ stage: s, kind: "reading" });
    // Skip the entry slide for stages the user has already submitted —
    // drop them straight into the responses instead.
    if (!data.stages[s].userHasSubmitted) {
      slides.push({ stage: s, kind: "entry" });
    }
    slides.push({ stage: s, kind: "responses" });
  }
  // Tack on a summary slide once the user has submitted every unlocked stage.
  if (allStagesSubmitted(data)) {
    slides.push({ stage: null, kind: "summary" });
    slides.push({ stage: null, kind: "all-responses" });
  }
  return slides;
}

// Default landing is the status slide (week overview). When the dashboard
// "Responses" pill links here it appends `?view=responses`, asking us to
// jump straight to the combined all-responses view (the "What the circle
// heard" feed) — readers want the cleaner cross-stage view, not a single
// stage's green panel.
function initialSlideIndex(data: LectioData, slides: Slide[]): number {
  if (typeof window !== "undefined") {
    const view = new URLSearchParams(window.location.search).get("view");
    if (view === "responses") {
      const allIdx = slides.findIndex((sl) => sl.kind === "all-responses");
      if (allIdx >= 0) return allIdx;
      const stage = data.currentStage;
      if (stage) {
        const idx = slides.findIndex(
          (sl) => sl.stage === stage && sl.kind === "responses",
        );
        if (idx >= 0) return idx;
      }
    }
  }
  const statusIdx = slides.findIndex((sl) => sl.kind === "status");
  if (statusIdx >= 0) return statusIdx;
  return 0;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function LectioPage() {
  const { momentToken, userToken } = useParams<{
    momentToken: string;
    userToken: string;
  }>();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const queryKey = [`/api/lectio/${momentToken}/${userToken}`];
  const { data, isLoading, error } = useQuery<LectioData, LectioFetchError>({
    queryKey,
    queryFn: () => fetchLectio(momentToken, userToken),
    refetchOnWindowFocus: false,
    retry: false,
  });

  const submitMutation = useMutation({
    mutationFn: (body: { stage: Stage; reflectionText: string }) =>
      apiRequest("POST", `/api/lectio/${momentToken}/${userToken}/reflect`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      // Refresh the dashboard bucketing too.
      qc.invalidateQueries({ queryKey: ["/api/moments"] });
    },
  });

  // Settings menu mutations — these use the session-authenticated moment
  // endpoints (the user reaches lectio from the dashboard while logged in).
  const momentId = data?.moment.id;
  const archiveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/moments/${momentId}/archive`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/moments"] });
      setLocation("/dashboard");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/moments/${momentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/moments"] });
      setLocation("/dashboard");
    },
  });
  const editMutation = useMutation({
    mutationFn: (body: { name?: string; intention?: string; allowMemberInvites?: boolean }) =>
      apiRequest("PATCH", `/api/moments/${momentId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["/api/moments"] });
    },
  });
  // Creator-only: invite a new member to the lectio circle.
  const inviteMutation = useMutation({
    mutationFn: (body: { name: string; email: string }) =>
      apiRequest("POST", `/api/moments/${momentId}/invite`, {
        people: [body],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["/api/moments"] });
    },
  });
  // Creator-only: remove a member by email.
  const removeMemberMutation = useMutation({
    mutationFn: (email: string) =>
      apiRequest(
        "DELETE",
        `/api/moments/${momentId}/members/${encodeURIComponent(email)}`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["/api/moments"] });
    },
  });

  const [menuOpen, setMenuOpen] = useState(false);

  // Lock body / html scrolling while Lectio is mounted. Without this,
  // iOS WebView lets the document body scroll behind our `100dvh +
  // overflow:hidden` root — the symptom is a slide that loads showing
  // the bottom of the page and lets the user pan it up too high.
  // Mirrors prayer-mode.tsx and prayer-list.tsx.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyHeight = body.style.height;
    const prevHtmlHeight = html.style.height;
    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    body.style.height = "100%";
    html.style.height = "100%";
    return () => {
      body.style.overflow = prevBodyOverflow;
      html.style.overflow = prevHtmlOverflow;
      body.style.height = prevBodyHeight;
      html.style.height = prevHtmlHeight;
    };
  }, []);

  const slides = useMemo<Slide[]>(() => (data ? buildSlides(data) : []), [data]);
  const [slideIdx, setSlideIdx] = useState(0);
  const [initialized, setInitialized] = useState(false);

  // Jump to the first incomplete stage on initial data load.
  useEffect(() => {
    if (data && !initialized && slides.length > 0) {
      setSlideIdx(initialSlideIndex(data, slides));
      setInitialized(true);
    }
  }, [data, initialized, slides]);

  // Re-anchor slideIdx by (stage, kind) whenever the slides array
  // rebuilds. Without this, submitting a reflection silently shifts
  // everyone to the wrong slide — the welcome slide drops out (minus
  // one) and, for a solo practitioner, the summary slide gets appended
  // (plus one), so the numeric index that pointed at `responses`
  // before the rebuild ends up at `summary` after. Anchoring by
  // (stage, kind) inside a layout effect lets React re-map the index
  // before the browser paints, so the user never sees the wrong slide.
  const prevSlidesRef = useRef<Slide[]>([]);
  useLayoutEffect(() => {
    const prev = prevSlidesRef.current;
    prevSlidesRef.current = slides;
    if (prev.length === 0 || prev === slides) return;
    const prevSlide = prev[slideIdx];
    if (!prevSlide) return;
    const sameKindAtIdx =
      slides[slideIdx] &&
      slides[slideIdx].stage === prevSlide.stage &&
      slides[slideIdx].kind === prevSlide.kind;
    if (sameKindAtIdx) return;
    const newIdx = slides.findIndex(
      (sl) => sl.stage === prevSlide.stage && sl.kind === prevSlide.kind,
    );
    if (newIdx >= 0) {
      setSlideIdx(newIdx);
    } else if (slideIdx >= slides.length) {
      setSlideIdx(Math.max(0, slides.length - 1));
    }
  }, [slides, slideIdx]);

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: BG }} className="flex items-center justify-center">
        <div style={{ color: MUTED_GREEN, fontSize: 14, letterSpacing: "0.06em" }}>
          Loading the reading…
        </div>
      </div>
    );
  }
  if (error || !data) {
    const stage = error?.stage ?? null;
    const detail = error?.detail ?? null;
    const status = error?.status ?? null;
    const headline = (() => {
      switch (stage) {
        case "moment_lookup": return "This practice link isn't valid.";
        case "template_check": return "This practice isn't a Lectio Divina practice.";
        case "user_lookup": return "Your access link for this practice isn't valid.";
        default: return "We couldn't load this reading.";
      }
    })();
    return (
      <div style={{ minHeight: "100vh", background: BG }} className="flex items-center justify-center px-6">
        <div className="text-center max-w-md" style={{ color: MUTED_GREEN }}>
          <p className="mb-2">{headline}</p>
          {(stage || detail || status) && (
            <div
              className="mb-4 mt-2 text-left rounded-lg px-3 py-2 text-xs"
              style={{
                background: "rgba(46,107,64,0.12)",
                border: "1px solid rgba(143,175,150,0.25)",
                color: FAINT_GREEN,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {status !== null && <div>status: {status}</div>}
              {stage && <div>stage: {stage}</div>}
              {detail && <div>detail: {detail}</div>}
            </div>
          )}
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => qc.refetchQueries({ queryKey })}
              className="text-sm font-semibold rounded-full px-4 py-2"
              style={{ background: BUTTON_BG, color: WARM_TEXT }}
            >
              Try again
            </button>
            <Link href="/dashboard">
              <span style={{ color: ACCENT, textDecoration: "underline", fontSize: 13 }}>Back to dashboard</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (slides.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: BG, color: WARM_TEXT }} className="flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <p style={{ color: MUTED_GREEN, fontSize: 14 }}>{data.week.phaseLabel}</p>
          <Link href="/dashboard">
            <span className="inline-block mt-6" style={{ color: ACCENT, textDecoration: "underline", fontSize: 13 }}>
              Back to dashboard
            </span>
          </Link>
        </div>
      </div>
    );
  }

  const current = slides[slideIdx];
  // stageData is only meaningful for stage-bound slides; summary has no stage.
  const stageData = current.stage ? data.stages[current.stage] : null;
  const atStart = slideIdx === 0;
  const atEnd = slideIdx === slides.length - 1;

  const next = () => setSlideIdx((i) => Math.min(i + 1, slides.length - 1));
  const prev = () => setSlideIdx((i) => Math.max(i - 1, 0));

  // Jump to a specific stage's Responses slide — used by each summary row.
  const jumpToStageResponses = (stage: Stage) => {
    const idx = slides.findIndex(
      (sl) => sl.stage === stage && sl.kind === "responses",
    );
    if (idx >= 0) setSlideIdx(idx);
  };

  // Jump to the summary slide — used by the Settings menu "Go to summary"
  // shortcut so the creator/invitee can skip past all stages to the recap.
  const jumpToSummary = () => {
    // Try summary first; if not available (stages incomplete), fall back to status
    const idx = slides.findIndex((sl) => sl.kind === "summary");
    if (idx >= 0) { setSlideIdx(idx); return; }
    const statusIdx = slides.findIndex((sl) => sl.kind === "status");
    if (statusIdx >= 0) setSlideIdx(statusIdx);
  };

  // Jump to the combined "all responses" slide — the destination of the
  // "Read all responses" CTA on the summary slide. Unlike
  // `jumpToStageResponses` (which goes to one stage's Responses slide),
  // this shows every stage's responses in a single scrollable view.
  const jumpToAllResponses = () => {
    const idx = slides.findIndex((sl) => sl.kind === "all-responses");
    if (idx >= 0) setSlideIdx(idx);
  };

  return (
    <div
      style={{
        height: "100dvh",
        overflow: "hidden",
        overscrollBehavior: "none",
        background: BG,
        color: WARM_TEXT,
        display: "flex",
        flexDirection: "column",
        fontFamily: SPACE_GROTESK,
      }}
    >
      {/* Header: fixed to the top of the viewport so it stays visible while
          the gospel card scrolls internally. Back on the left, Menu in the
          middle, stage label / gospel ref on the right. z-index 50 matches
          the bottom nav. */}
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          pointerEvents: "none",
        }}
      >
        <div
          className="max-w-2xl mx-auto w-full px-5 pb-2"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: 12,
            pointerEvents: "auto",
            paddingTop: "max(1.5rem, calc(env(safe-area-inset-top) + 0.5rem))",
          }}
        >
          <Link href="/dashboard">
            <span style={{ color: FAINT_GREEN, fontSize: 13 }}>← Back</span>
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open settings"
            className="rounded-full"
            style={{
              background: "rgba(19,44,29,0.85)",
              border: `1px solid ${BORDER}`,
              color: WARM_TEXT,
              fontFamily: SPACE_GROTESK,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.04em",
              padding: "6px 16px",
              cursor: "pointer",
            }}
          >
            Menu
          </button>
          <div style={{ textAlign: "right" }}>
            <p style={{ color: FAINT_GREEN, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase" }}>
              {current.kind === "welcome" || current.kind === "status"
                ? "This Week"
                : data.week.isSunday
                  ? "Completed"
                  : current.stage
                    ? STAGE_ORDINAL[current.stage]
                    : current.kind === "all-responses"
                      ? "All Responses"
                      : "Summary"}
            </p>
            <p style={{ color: MUTED_GREEN, fontSize: 12, marginTop: 2 }}>
              {data.reading.gospelReference}
            </p>
          </div>
        </div>
      </header>

      {/* Slide content. Main fills the gap between the fixed header and
          fixed nav. Pattern: main scrolls vertically; the inner wrapper
          has `min-height: 100%` + flex-column + `justify-content: center`
          so content sits perfectly centered when it fits and grows
          (scrollable inside main) when it doesn't. That keeps the page
          locked in place — the user can't pan the entire viewport —
          while still gracefully handling tall slides on small screens.
          Full-height slides (reading, all-responses, entry) stretch to
          fill so the textarea / scrolling card can use all the space,
          and the entry CTA sits above the keyboard via --kb-inset. */}
      {(() => {
        const isFullHeightSlide =
          current.kind === "reading" ||
          current.kind === "all-responses" ||
          current.kind === "entry";
        return (
      <main
        className="flex-1 px-5"
        style={{
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          // Header is position:fixed at the top with its own safe-area
          // padding; we just need enough top padding to clear it.
          paddingTop: "calc(env(safe-area-inset-top) + 56px)",
          // Bottom nav is position:fixed with safe-area-bottom + 16 + ~50
          // pill height. Pad enough to clear it plus keyboard inset when
          // the textarea is focused.
          paddingBottom: "calc(env(safe-area-inset-bottom) + var(--kb-inset, 0px) + 112px)",
          // FullHeight slides need to behave as a flex column so the
          // inner reading/responses card can fill and scroll internally.
          ...(isFullHeightSlide
            ? { display: "flex", flexDirection: "column" }
            : null),
        }}
      >
        <div
          className="max-w-2xl w-full mx-auto"
          style={
            isFullHeightSlide
              ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }
              : undefined
          }
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={`${current.stage}-${current.kind}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              style={
                isFullHeightSlide
                  ? { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }
                  : undefined
              }
            >
              {current.kind === "welcome" && (
                <WelcomeSlide data={data} onBegin={next} />
              )}
              {current.kind === "status" && (
                <StatusSlide
                  data={data}
                  onBegin={next}
                  onJumpToStage={(stage) => {
                    const submitted = data.stages[stage].userHasSubmitted;
                    const kind = submitted ? "responses" : "prompt";
                    const idx = slides.findIndex((sl) => sl.stage === stage && sl.kind === kind);
                    if (idx >= 0) setSlideIdx(idx);
                  }}
                  onJumpToSummary={jumpToSummary}
                />
              )}
              {current.kind === "prompt" && current.stage && (
                <PromptSlide stage={current.stage} />
              )}
              {current.kind === "reading" && <ReadingSlide reading={data.reading} />}
              {current.kind === "entry" && current.stage && stageData && (
                <EntrySlide
                  stage={current.stage}
                  stageData={stageData}
                  submitting={
                    submitMutation.isPending &&
                    submitMutation.variables?.stage === current.stage
                  }
                  onSubmit={(text) => {
                    const s = current.stage;
                    if (!s) return;
                    submitMutation.mutate(
                      { stage: s, reflectionText: text },
                      {
                        onSuccess: () => {
                          // Advance to the Responses slide once the reflection
                          // is saved.
                          next();
                        },
                      },
                    );
                  }}
                />
              )}
              {current.kind === "responses" && stageData && (
                <ResponsesSlide stageData={stageData} memberCount={data.memberCount} />
              )}
              {current.kind === "summary" && (
                <SummarySlide
                  data={data}
                  onReadResponses={jumpToAllResponses}
                  onJumpToStage={jumpToStageResponses}
                  onDone={() => setLocation("/dashboard")}
                />
              )}
              {current.kind === "all-responses" && (
                <AllResponsesSlide data={data} />
              )}
              {current.kind === "coming-soon" && (
                <ComingSoonSlide data={data} onDone={() => setLocation("/dashboard")} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
        );
      })()}

      {/* The top + bottom fades are now applied as a CSS mask on the
          scrolling text containers themselves (see ReadingSlide and
          AllResponsesSlide). That way only the glyphs fade — the
          background stays a flat dark green, so the hovering chrome
          doesn't sit on top of a visibly darker rectangle. */}

      {/* Floating nav pill at the bottom of the viewport. Fixed so scrolling
          inside a slide (e.g. the gospel card) doesn't move the nav. Hidden
          on entry slides — the textarea has its own Back / Share controls
          and the keyboard would push the pill on top of the text. */}
      {current.kind !== "entry" && (
      <nav
        aria-label="Slide navigation"
        style={{
          position: "fixed",
          left: "50%",
          bottom: "calc(env(safe-area-inset-bottom) + var(--kb-inset, 0px) + 16px)",
          transform: "translateX(-50%)",
          zIndex: 50,
          background: "rgba(19,44,29,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: `1px solid ${BORDER}`,
          borderRadius: 999,
          padding: "8px 12px",
          boxShadow: "0 8px 28px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35)",
          maxWidth: "calc(100vw - 32px)",
        }}
      >
        {(() => {
          // Build a descriptive nav:
          //   [ Back ]   STAGE · Latin    [ Action pill ]
          // The action pill tells the user what the next step in this slide
          // is ("Read" → "Reflect" → "Responses" → "Next stage"). The summary
          // slide has its own CTAs, so the pill is hidden there.
          const stageLabel = current.kind === "welcome" || current.kind === "status"
            ? "This Week"
            : current.kind === "coming-soon"
              ? "Coming Soon"
              : data.week.isSunday
                ? "Completed"
                : current.stage
                  ? `${STAGE_ORDINAL[current.stage]} · ${STAGE_LATIN[current.stage]}`
                  : current.kind === "all-responses"
                    ? "All Responses"
                    : "Summary";

          let actionLabel: string | null = null;
          // Welcome slide has its own "Begin 🌿" button, so no pill here.
          // Entry slide hides this nav entirely (the textarea owns its own
          // Back / Share controls), so no actionLabel branch is needed for it.
          if (current.kind === "prompt") {
            actionLabel = "Read";
          } else if (current.kind === "reading") {
            actionLabel = "Reflect";
          } else if (current.kind === "responses") {
            const nextSlide = slides[slideIdx + 1];
            if (nextSlide) {
              if (nextSlide.kind === "summary") actionLabel = "Summary";
              else if (nextSlide.kind === "coming-soon") actionLabel = "Next";
              else actionLabel = "Next stage";
            }
          }

          return (
            <div
              className="flex items-center gap-4"
              style={{ minWidth: 0 }}
            >
              <button
                type="button"
                onClick={prev}
                disabled={atStart}
                className="rounded-full transition-opacity disabled:opacity-20"
                style={{
                  color: WARM_TEXT,
                  background: "transparent",
                  border: `1px solid ${BORDER}`,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontFamily: SPACE_GROTESK,
                  fontWeight: 600,
                  cursor: atStart ? "default" : "pointer",
                }}
              >
                Back
              </button>

              <div
                style={{
                  textAlign: "center",
                  minWidth: 0,
                  flex: "0 0 auto",
                }}
              >
                <p
                  style={{
                    color: FAINT_GREEN,
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    margin: 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  {stageLabel}
                </p>
              </div>

              {actionLabel ? (
                <button
                  type="button"
                  onClick={next}
                  disabled={atEnd}
                  className="rounded-full transition-opacity disabled:opacity-20"
                  style={{
                    background: BUTTON_BG,
                    color: WARM_TEXT,
                    border: "none",
                    padding: "6px 16px",
                    fontSize: 12,
                    fontFamily: SPACE_GROTESK,
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    cursor: atEnd ? "default" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {actionLabel}
                </button>
              ) : (
                // Keep the layout balanced even when there's no action pill
                // (e.g. summary slide, or entry before submitting).
                <div style={{ width: 60 }} />
              )}
            </div>
          );
        })()}
      </nav>
      )}

      {/* Settings menu overlay */}
      <AnimatePresence>
        {menuOpen && (
          <SettingsMenu
            data={data}
            onClose={() => setMenuOpen(false)}
            onSaveEdit={(name, intention) => editMutation.mutate({ name, intention })}
            editPending={editMutation.isPending}
            onToggleAllowMemberInvites={(val) => editMutation.mutate({ allowMemberInvites: val })}
            onInvite={(name, email) => inviteMutation.mutate({ name, email })}
            invitePending={inviteMutation.isPending}
            onRemoveMember={(email) => removeMemberMutation.mutate(email)}
            removePendingEmail={
              removeMemberMutation.isPending
                ? (removeMemberMutation.variables as string | undefined) ?? null
                : null
            }
            onGoToSummary={() => {
              jumpToSummary();
              setMenuOpen(false);
            }}
            onLeave={() => archiveMutation.mutate()}
            leavePending={archiveMutation.isPending}
            onDelete={() => deleteMutation.mutate()}
            deletePending={deleteMutation.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Slides ─────────────────────────────────────────────────────────────────

function PromptSlide({ stage }: { stage: Stage }) {
  return (
    <div className="text-center py-4">
      <p
        style={{
          color: FAINT_GREEN,
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {STAGE_ORDINAL[stage]}
      </p>
      <p
        style={{
          color: "rgba(143,175,150,0.45)",
          fontSize: 12,
          fontStyle: "italic",
          letterSpacing: "0.04em",
          marginBottom: 26,
        }}
      >
        {STAGE_LATIN[stage]}
      </p>
      <p
        style={{
          color: WARM_TEXT,
          fontSize: 22,
          lineHeight: 1.5,
          fontWeight: 400,
          letterSpacing: "-0.005em",
          maxWidth: 520,
          margin: "0 auto",
        }}
      >
        {STAGE_PROMPT_TEXT[stage]}
      </p>
    </div>
  );
}

function ReadingSlide({ reading }: { reading: LectioData["reading"] }) {
  // The gospel is displayed as a bordered card that fills the available
  // vertical space between the fixed header and the fixed nav. The title +
  // verse reference sit at the top of the card; the gospel text itself is
  // the only thing that scrolls (inside the card), so the page chrome
  // stays put and the page never scrolls. A small gradient overlay sits
  // at the bottom of the card to hint there's more text below when the
  // user hasn't scrolled to the end.
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 18,
        boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          padding: "22px 24px 14px",
          borderBottom: `1px solid ${BORDER}`,
          textAlign: "center",
        }}
      >
        <p
          style={{
            color: FAINT_GREEN,
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          {reading.sundayName}
        </p>
        <p
          style={{
            color: MUTED_GREEN,
            fontSize: 13,
            letterSpacing: "0.04em",
          }}
        >
          {reading.gospelReference}
        </p>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          color: WARM_TEXT,
          fontSize: 18,
          lineHeight: 1.8,
          fontFamily: SPACE_GROTESK,
          whiteSpace: "pre-wrap",
          padding: "22px 24px 26px",
        }}
      >
        {reading.gospelText}
      </div>
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 56,
          pointerEvents: "none",
          background: `linear-gradient(to bottom, ${CARD_FADE_TRANSPARENT} 0%, ${CARD_FADE_SOLID} 100%)`,
          borderBottomLeftRadius: 18,
          borderBottomRightRadius: 18,
        }}
      />
    </div>
  );
}

function EntrySlide({
  stage,
  stageData,
  submitting,
  onSubmit,
}: {
  stage: Stage;
  stageData: StageReveal;
  submitting: boolean;
  onSubmit: (text: string) => void;
}) {
  const hasSubmitted = stageData.userHasSubmitted;
  const [draft, setDraft] = useState(stageData.myReflection ?? "");

  // Re-sync the draft when the server's copy changes (e.g. after a save or
  // when a new stage unlocks).
  useEffect(() => {
    setDraft(stageData.myReflection ?? "");
  }, [stageData.myReflection]);

  // Meditatio + Oratio ask for a fuller reflection (20–200 words). Lectio
  // is kept open (a single word or phrase is the whole point of that
  // stage) so no count applies there.
  const hasWordLimits = stage === "meditatio" || stage === "oratio";
  const MIN_WORDS = 20;
  const MAX_WORDS = 200;
  const wordCount = draft.trim().length === 0
    ? 0
    : draft.trim().split(/\s+/).length;
  const belowMin = hasWordLimits && wordCount < MIN_WORDS;
  const aboveMax = hasWordLimits && wordCount > MAX_WORDS;
  const canShare = !submitting && draft.trim().length > 0 && !belowMin && !aboveMax;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        paddingTop: 8,
        paddingBottom: 8,
      }}
    >
      <p
        style={{
          color: FAINT_GREEN,
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        {STAGE_ORDINAL[stage]}
      </p>
      <p
        style={{
          color: MUTED_GREEN,
          fontSize: 15,
          lineHeight: 1.5,
          marginBottom: 20,
        }}
      >
        {STAGE_PROMPT_TEXT[stage]}
      </p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Take your time…"
        style={{
          width: "100%",
          flex: 1,
          minHeight: 0,
          background: "transparent",
          border: "none",
          outline: "none",
          boxShadow: "none",
          resize: "none",
          padding: 0,
          color: WARM_TEXT,
          fontSize: 16,
          lineHeight: 1.6,
          fontFamily:
            "'Space Grotesk', system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      />
      {hasWordLimits && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 6,
            fontSize: 12,
            color: aboveMax || belowMin ? "#C79A4A" : FAINT_GREEN,
          }}
        >
          {wordCount} / {MAX_WORDS} words
          {belowMin && wordCount > 0 && ` · ${MIN_WORDS - wordCount} more to share`}
          {aboveMax && ` · ${wordCount - MAX_WORDS} over`}
        </div>
      )}
      <div className="flex items-center justify-between mt-3">
        <span style={{ color: FAINT_GREEN, fontSize: 12 }}>
          {hasSubmitted ? "You can revise anytime this week." : "Private until you share."}
        </span>
        <button
          type="button"
          onClick={() => onSubmit(draft.trim())}
          disabled={!canShare}
          className="rounded-full transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{
            background: BUTTON_BG,
            color: WARM_TEXT,
            fontSize: 13,
            fontWeight: 600,
            padding: "8px 18px",
            border: "none",
            cursor: submitting ? "wait" : canShare ? "pointer" : "not-allowed",
          }}
        >
          {submitting ? "Saving…" : hasSubmitted ? "Save" : "Share"}
        </button>
      </div>
    </div>
  );
}

function ResponsesSlide({
  stageData,
  memberCount,
}: {
  stageData: StageReveal;
  memberCount: number;
}) {
  const [showMuted, setShowMuted] = useState(false);
  const hasSubmitted = stageData.userHasSubmitted;

  if (!hasSubmitted) {
    return (
      <div className="py-6 text-center">
        <p
          style={{
            color: FAINT_GREEN,
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            marginBottom: 16,
          }}
        >
          What others heard
        </p>
        <p style={{ color: MUTED_GREEN, fontSize: 15, lineHeight: 1.6, maxWidth: 440, margin: "0 auto" }}>
          Share your own reflection to see what the others in your circle have heard.
        </p>
      </div>
    );
  }

  const reflections = stageData.reflections ?? [];

  return (
    <div className="py-2">
      <p
        style={{
          color: FAINT_GREEN,
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          marginBottom: 16,
        }}
      >
        What others heard
      </p>
      {reflections.length === 0 ? (
        <p style={{ color: MUTED_GREEN, fontSize: 14 }}>
          No reflections yet this week.
        </p>
      ) : (
        <div className="space-y-3">
          {reflections.map((r, i) => (
            <ReflectionCard
              key={i}
              name={r.userName}
              text={r.text}
              isYou={r.isYou}
              createdAt={r.createdAt}
            />
          ))}
        </div>
      )}
      {stageData.mutedCount > 0 && (
        <div style={{ marginTop: 18 }}>
          <button
            type="button"
            onClick={() => setShowMuted(v => !v)}
            style={{
              color: FAINT_GREEN,
              fontSize: 12,
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            {stageData.mutedCount} muted {stageData.mutedCount === 1 ? "response" : "responses"}
          </button>
          {showMuted && (
            <div className="space-y-3 mt-3">
              {stageData.mutedReflections.map((r, i) => (
                <ReflectionCard
                  key={i}
                  name={r.userName}
                  text={r.text}
                  isYou={false}
                  createdAt={r.createdAt}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {memberCount <= 1 && (
        <p style={{ color: FAINT_GREEN, fontSize: 12, marginTop: 18 }}>
          Invite others to read along with you.
        </p>
      )}
    </div>
  );
}

// ─── Single reflection card ─────────────────────────────────────────────────

// Format a reflection's timestamp as "Today · 2:30 PM" or "Fri · 2:30 PM"
// so the reader has a sense of when each response came in.
function formatReflectionTime(iso: string): string {
  try {
    const d = parseISO(iso);
    const time = format(d, "h:mm a");
    if (isToday(d)) return `Today · ${time}`;
    return `${format(d, "EEE")} · ${time}`;
  } catch {
    return "";
  }
}

function ReflectionCard({
  name,
  text,
  isYou,
  createdAt,
}: {
  name: string;
  text: string;
  isYou: boolean;
  createdAt?: string;
}) {
  const timeLabel = createdAt ? formatReflectionTime(createdAt) : "";
  return (
    <div
      className="rounded-xl"
      style={{
        background: isYou ? "rgba(111,175,133,0.08)" : "#0F2818",
        border: `1px solid ${isYou ? "rgba(111,175,133,0.35)" : BORDER}`,
        padding: "16px 18px",
      }}
    >
      <div
        className="flex items-baseline justify-between gap-3"
        style={{ marginBottom: 6 }}
      >
        <p
          style={{
            color: isYou ? ACCENT : MUTED_GREEN,
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          {isYou ? "You" : name}
        </p>
        {timeLabel && (
          <p
            style={{
              color: FAINT_GREEN,
              fontSize: 10,
              letterSpacing: "0.04em",
              margin: 0,
              whiteSpace: "nowrap",
            }}
          >
            {timeLabel}
          </p>
        )}
      </div>
      <p
        style={{
          color: WARM_TEXT,
          fontSize: 15,
          lineHeight: 1.65,
          fontFamily: SPACE_GROTESK,
          whiteSpace: "pre-wrap",
        }}
      >
        {text}
      </p>
    </div>
  );
}

// ─── Summary slide ──────────────────────────────────────────────────────────
// Shown as the final slide once the user has submitted a reflection for every
// unlocked stage. Lists the three stages + how many in the circle have
// responded to each, with a CTA to jump back into the responses and a quiet
// secondary link to return to the dashboard.

// ─── Welcome slide ──────────────────────────────────────────────────────────
// Shown on a user's very first visit (before they've submitted any
// reflection) — works as both the post-creation screen for the circle's
// creator and the first-time onboarding for anyone invited into an
// existing practice. Visually mirrors the summary slide (three stage
// rows) so the rhythm of Mon/Wed/Fri is legible at a glance, and ends
// with a single "Begin 🌿" call to action.

function WelcomeSlide({
  data,
  onBegin,
}: {
  data: LectioData;
  onBegin: () => void;
}) {
  const rows = STAGE_ORDER.map((s) => ({
    stage: s,
    day: STAGE_DAY_LABEL[s],
    latin: STAGE_LATIN[s],
    ordinal: STAGE_ORDINAL[s],
  }));

  const stageDescriptions: Record<Stage, string> = {
    lectio: "Read slowly. Notice a word or phrase that stirs something.",
    meditatio: "Read again. What is God saying to you through that word?",
    oratio: "Read a third time. How does God seem to be calling you to respond?",
  };

  return (
    <div className="py-2 text-center">
      <p
        style={{
          color: FAINT_GREEN,
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        Lectio Divina
      </p>
      <p
        style={{
          color: WARM_TEXT,
          fontSize: 22,
          fontWeight: 600,
          lineHeight: 1.35,
          marginBottom: 14,
          maxWidth: 440,
          marginLeft: "auto",
          marginRight: "auto",
          fontFamily: SPACE_GROTESK,
        }}
      >
        Welcome to {data.moment.name}.
      </p>
      <p
        style={{
          color: MUTED_GREEN,
          fontSize: 14,
          lineHeight: 1.7,
          marginBottom: 10,
          maxWidth: 460,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        Lectio Divina — "sacred reading" — is an ancient Christian practice of
        listening to Scripture not for information, but for transformation. You
        read the same passage three times across the week, each time with a
        different question held gently before God.
      </p>
      <p
        style={{
          color: MUTED_GREEN,
          fontSize: 14,
          lineHeight: 1.7,
          marginBottom: 22,
          maxWidth: 460,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        Each Monday, Wednesday, and Friday, a new stage unlocks. You read,
        reflect, and share what you heard with your circle. Stages stay open
        so no one falls behind.
      </p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxWidth: 440,
          margin: "0 auto 28px auto",
        }}
      >
        {rows.map((r) => (
          <div
            key={r.stage}
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              padding: "14px 16px 14px 18px",
              borderRadius: 14,
              border: `1px solid ${BORDER}`,
              background: "rgba(15,40,24,0.6)",
              width: "100%",
              textAlign: "left",
              fontFamily: SPACE_GROTESK,
              color: WARM_TEXT,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <p
                style={{
                  color: FAINT_GREEN,
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  margin: 0,
                }}
              >
                {r.day} · {r.latin}
              </p>
              <p style={{ color: WARM_TEXT, fontSize: 14, margin: "3px 0 2px 0", fontWeight: 500 }}>
                {r.ordinal}
              </p>
              <p style={{ color: MUTED_GREEN, fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                {stageDescriptions[r.stage]}
              </p>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onBegin}
        className="rounded-full"
        style={{
          background: BUTTON_BG,
          color: WARM_TEXT,
          fontFamily: SPACE_GROTESK,
          fontSize: 14,
          fontWeight: 600,
          padding: "12px 32px",
          border: "none",
          cursor: "pointer",
        }}
      >
        Begin 🌿
      </button>
    </div>
  );
}

// ─── Status slide ──────────────────────────────────────────────────────────
// Always shown as the landing page. Shows the week's reading, progress
// through the three stages, and a CTA to begin or continue.

function StatusSlide({
  data,
  onBegin,
  onJumpToStage,
  onJumpToSummary,
}: {
  data: LectioData;
  onBegin: () => void;
  onJumpToStage: (stage: Stage) => void;
  onJumpToSummary: () => void;
}) {
  const isFirstVisit = !STAGE_ORDER.some((s) => data.stages[s].userHasSubmitted);
  const allDone = allStagesSubmitted(data);
  const completedCount = STAGE_ORDER.filter((s) => data.stages[s].userHasSubmitted).length;
  const unlockedCount = data.week.unlockedStages.length;

  // Find the next stage to work on
  const nextStage = STAGE_ORDER.find(
    (s) => data.stages[s].unlocked && !data.stages[s].userHasSubmitted,
  );

  const stageDescriptions: Record<Stage, string> = {
    lectio: "Read slowly. Notice a word or phrase that stirs something.",
    meditatio: "Read again. What is God saying to you through that word?",
    oratio: "Read a third time. How does God seem to be calling you to respond?",
  };

  return (
    <div className="py-2 text-center">
      <p
        style={{
          color: FAINT_GREEN,
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        Lectio Divina
      </p>

      {/* Week reading info */}
      <p
        style={{
          color: WARM_TEXT,
          fontSize: 22,
          fontWeight: 600,
          lineHeight: 1.35,
          marginBottom: 6,
          maxWidth: 440,
          marginLeft: "auto",
          marginRight: "auto",
          fontFamily: SPACE_GROTESK,
        }}
      >
        {data.reading.sundayName}
      </p>
      <p style={{ color: MUTED_GREEN, fontSize: 14, marginBottom: 20 }}>
        {data.reading.gospelReference}
      </p>

      {/* Intro text for first-timers */}
      {isFirstVisit && (
        <p
          style={{
            color: MUTED_GREEN,
            fontSize: 14,
            lineHeight: 1.7,
            marginBottom: 20,
            maxWidth: 460,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          Lectio Divina — "sacred reading" — is an ancient practice of
          listening to Scripture. You read the same passage three times
          across the week, each time with a different question.
        </p>
      )}

      {/* Progress bar */}
      {!isFirstVisit && (
        <div
          style={{
            display: "flex",
            gap: 6,
            maxWidth: 200,
            margin: "0 auto 20px auto",
          }}
        >
          {STAGE_ORDER.map((s) => (
            <div
              key={s}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: data.stages[s].userHasSubmitted
                  ? BUTTON_BG
                  : data.stages[s].unlocked
                    ? "rgba(46,107,64,0.25)"
                    : "rgba(46,107,64,0.1)",
              }}
            />
          ))}
        </div>
      )}

      {/* Stage rows */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxWidth: 440,
          margin: "0 auto 24px auto",
        }}
      >
        {STAGE_ORDER.map((s) => {
          const stage = data.stages[s];
          const isDone = stage.userHasSubmitted;
          const isLocked = !stage.unlocked;
          const isNext = s === nextStage;
          const responseCount = stage.reflections?.length ?? 0;

          return (
            <button
              key={s}
              type="button"
              onClick={() => {
                if (!isLocked) onJumpToStage(s);
              }}
              disabled={isLocked}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                padding: "14px 16px 14px 18px",
                borderRadius: 14,
                border: `1px solid ${isNext ? "rgba(46,107,64,0.6)" : BORDER}`,
                background: isNext ? "rgba(46,107,64,0.15)" : "rgba(15,40,24,0.6)",
                width: "100%",
                textAlign: "left",
                fontFamily: SPACE_GROTESK,
                color: WARM_TEXT,
                opacity: isLocked ? 0.4 : 1,
                cursor: isLocked ? "default" : "pointer",
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  style={{
                    color: FAINT_GREEN,
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    margin: 0,
                  }}
                >
                  {STAGE_DAY_LABEL[s]} · {STAGE_LATIN[s]}
                </p>
                <p style={{ color: WARM_TEXT, fontSize: 14, margin: "3px 0 2px 0", fontWeight: 500 }}>
                  {STAGE_ORDINAL[s]}
                </p>
                <p style={{ color: MUTED_GREEN, fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                  {isLocked
                    ? `Opens ${STAGE_DAY_LABEL[s]}`
                    : stageDescriptions[s]}
                </p>
              </div>
              <div style={{ flexShrink: 0, textAlign: "right" }}>
                {isDone && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: MUTED_GREEN,
                      background: "rgba(46,107,64,0.2)",
                      padding: "4px 10px",
                      borderRadius: 99,
                    }}
                  >
                    Done {responseCount > 0 ? `· ${responseCount}` : ""}
                  </span>
                )}
                {isNext && !isDone && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: WARM_TEXT,
                      background: BUTTON_BG,
                      padding: "4px 10px",
                      borderRadius: 99,
                    }}
                  >
                    Begin
                  </span>
                )}
                {isLocked && (
                  <span style={{ fontSize: 18, opacity: 0.3 }}>🔒</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* CTA */}
      {allDone ? (
        <button
          type="button"
          onClick={onJumpToSummary}
          className="rounded-full"
          style={{
            background: BUTTON_BG,
            color: WARM_TEXT,
            fontFamily: SPACE_GROTESK,
            fontSize: 14,
            fontWeight: 600,
            padding: "12px 32px",
            border: "none",
            cursor: "pointer",
          }}
        >
          View Summary
        </button>
      ) : nextStage ? (
        <button
          type="button"
          onClick={() => onJumpToStage(nextStage)}
          className="rounded-full"
          style={{
            background: BUTTON_BG,
            color: WARM_TEXT,
            fontFamily: SPACE_GROTESK,
            fontSize: 14,
            fontWeight: 600,
            padding: "12px 32px",
            border: "none",
            cursor: "pointer",
          }}
        >
          {isFirstVisit ? "Begin 🌿" : `Continue — ${STAGE_ORDINAL[nextStage]}`}
        </button>
      ) : (
        <p style={{ color: MUTED_GREEN, fontSize: 13 }}>
          {completedCount} of {unlockedCount} stages complete. Next stage opens soon.
        </p>
      )}

      {/* Member count */}
      {data.memberCount > 1 && (
        <p style={{ color: FAINT_GREEN, fontSize: 12, marginTop: 14 }}>
          {data.memberCount} {data.memberCount === 1 ? "person" : "people"} in this circle
        </p>
      )}
    </div>
  );
}

// ─── Coming-soon slide ──────────────────────────────────────────────────────
// Shown after completing all currently-unlocked stages when future stages are
// still locked (Mon/Tue after Lectio; Wed/Thu after Meditatio).
// Lists all three stages — the done ones look normal, the locked ones are
// muted with "Come back Wednesday / Friday".

function ComingSoonSlide({
  data,
  onDone,
}: {
  data: LectioData;
  onDone: () => void;
}) {
  // Map stage → unlock day label
  const NEXT_DAY: Record<Stage, string> = {
    lectio: "Monday",
    meditatio: "Wednesday",
    oratio: "Friday",
  };
  // Which stages are locked (not yet unlocked this week)?
  const lockedStages = STAGE_ORDER.filter((s) => !data.stages[s].unlocked);

  return (
    <div className="py-2 text-center">
      <p
        style={{
          color: FAINT_GREEN,
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        You're caught up
      </p>
      <p
        style={{
          color: WARM_TEXT,
          fontSize: 22,
          lineHeight: 1.4,
          marginBottom: 8,
          maxWidth: 480,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        Well done.
      </p>
      <p
        style={{
          color: MUTED_GREEN,
          fontSize: 14,
          lineHeight: 1.6,
          marginBottom: 24,
          maxWidth: 440,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        {lockedStages.length === 2
          ? `The next two stages open Wednesday and Friday.`
          : `The next stage opens ${NEXT_DAY[lockedStages[0]]}.`}
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxWidth: 440,
          margin: "0 auto 28px auto",
        }}
      >
        {STAGE_ORDER.map((s) => {
          const locked = !data.stages[s].unlocked;
          const comesOnDay = NEXT_DAY[s];
          return (
            <div
              key={s}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                padding: "14px 16px 14px 18px",
                borderRadius: 14,
                border: locked
                  ? "1px solid rgba(46,107,64,0.2)"
                  : `1px solid ${BORDER}`,
                background: locked
                  ? "rgba(10,25,15,0.5)"
                  : "rgba(15,40,24,0.6)",
                width: "100%",
                textAlign: "left",
                fontFamily: SPACE_GROTESK,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  style={{
                    color: locked ? "rgba(111,175,133,0.3)" : FAINT_GREEN,
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    margin: 0,
                  }}
                >
                  {comesOnDay}
                </p>
                <p
                  style={{
                    color: locked ? "rgba(240,237,230,0.25)" : WARM_TEXT,
                    fontSize: 15,
                    margin: "2px 0 0 0",
                  }}
                >
                  {STAGE_LATIN[s]}
                </p>
              </div>
              <span
                className="rounded-full"
                style={{
                  background: locked
                    ? "rgba(46,107,64,0.08)"
                    : "rgba(111,175,133,0.14)",
                  color: locked ? "rgba(111,175,133,0.3)" : ACCENT,
                  border: locked
                    ? "1px solid rgba(46,107,64,0.18)"
                    : "1px solid rgba(111,175,133,0.35)",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.02em",
                  padding: "3px 10px",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {locked ? `Come back ${comesOnDay}` : "Done ✓"}
              </span>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onDone}
        style={{
          background: "transparent",
          border: "none",
          color: FAINT_GREEN,
          fontFamily: SPACE_GROTESK,
          fontSize: 13,
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        Back to dashboard
      </button>
    </div>
  );
}

function SummarySlide({
  data,
  onReadResponses,
  onJumpToStage,
  onDone,
}: {
  data: LectioData;
  onReadResponses: () => void;
  onJumpToStage: (stage: Stage) => void;
  onDone: () => void;
}) {
  const rows: Array<{ stage: Stage; count: number; unlocked: boolean }> = STAGE_ORDER.map((s) => {
    const sd = data.stages[s];
    // Response count = number of distinct members who have submitted that
    // stage. The server already filters `reflections` to the current user
    // plus others (gated), so once the user has submitted, `reflections`
    // is the full list.
    const count = sd.reflections?.length ?? 0;
    return { stage: s, count, unlocked: sd.unlocked };
  });

  return (
    <div className="py-2 text-center">
      <p
        style={{
          color: FAINT_GREEN,
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        The week's reading
      </p>
      <p
        style={{
          color: WARM_TEXT,
          fontSize: 22,
          lineHeight: 1.4,
          marginBottom: 28,
          maxWidth: 480,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        Read what others heard.
      </p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxWidth: 440,
          margin: "0 auto 28px auto",
        }}
      >
        {rows.map((r) => (
          <button
            type="button"
            key={r.stage}
            onClick={() => r.unlocked && onJumpToStage(r.stage)}
            disabled={!r.unlocked}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              padding: "14px 16px 14px 18px",
              borderRadius: 14,
              border: `1px solid ${BORDER}`,
              background: "rgba(15,40,24,0.6)",
              opacity: r.unlocked ? 1 : 0.4,
              cursor: r.unlocked ? "pointer" : "default",
              width: "100%",
              textAlign: "left",
              fontFamily: SPACE_GROTESK,
              color: WARM_TEXT,
              transition: "background 0.15s ease",
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <p
                style={{
                  color: FAINT_GREEN,
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  margin: 0,
                }}
              >
                {STAGE_ORDINAL[r.stage]}
              </p>
              <p style={{ color: WARM_TEXT, fontSize: 15, margin: "2px 0 0 0" }}>
                {STAGE_LATIN[r.stage]}
              </p>
            </div>
            <div className="flex items-center" style={{ gap: 10, flexShrink: 0 }}>
              <span
                className="rounded-full"
                style={{
                  background: "rgba(111,175,133,0.14)",
                  color: ACCENT,
                  border: "1px solid rgba(111,175,133,0.35)",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.02em",
                  padding: "3px 10px",
                  whiteSpace: "nowrap",
                }}
              >
                {r.count} {r.count === 1 ? "response" : "responses"}
              </span>
              <span
                className="rounded-full"
                style={{
                  background: BUTTON_BG,
                  color: WARM_TEXT,
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "4px 12px",
                  border: "none",
                  whiteSpace: "nowrap",
                }}
              >
                Read →
              </span>
            </div>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onReadResponses}
        className="rounded-full"
        style={{
          background: BUTTON_BG,
          color: WARM_TEXT,
          fontFamily: SPACE_GROTESK,
          fontSize: 14,
          fontWeight: 600,
          padding: "12px 28px",
          border: "none",
          cursor: "pointer",
        }}
      >
        Read all responses
      </button>
      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={onDone}
          style={{
            background: "transparent",
            border: "none",
            color: FAINT_GREEN,
            fontFamily: SPACE_GROTESK,
            fontSize: 13,
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Back to dashboard
        </button>
      </div>
    </div>
  );
}

// ─── All responses slide ────────────────────────────────────────────────────
// Single scrollable page that shows every stage's reflections in one long
// feed, grouped by stage. This is the destination of the "Read all
// responses" CTA on the summary slide — users wanted a single view they
// could scroll through instead of bouncing between three separate
// per-stage slides.

function AllResponsesSlide({ data }: { data: LectioData }) {
  type ReflectionRow = NonNullable<StageReveal["reflections"]>[number];
  const sections: Array<{
    stage: Stage;
    reflections: ReflectionRow[];
    userHasSubmitted: boolean;
  }> = STAGE_ORDER.filter((s) => data.stages[s].unlocked).map((s) => {
    const sd = data.stages[s];
    return {
      stage: s,
      reflections: sd.reflections ?? [],
      userHasSubmitted: sd.userHasSubmitted,
    };
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 18,
        boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "12px 24px 26px",
        }}
      >
        <p
          style={{
            color: WARM_TEXT,
            fontSize: 17,
            lineHeight: 1.3,
            margin: 0,
            marginBottom: 14,
            textAlign: "center",
            fontFamily: SPACE_GROTESK,
          }}
        >
          What the circle heard
        </p>
        {sections.map((section) => (
          <div key={section.stage} style={{ marginBottom: 28 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                marginBottom: 12,
                paddingBottom: 8,
                borderBottom: `1px solid ${BORDER}`,
              }}
            >
              <p
                style={{
                  color: FAINT_GREEN,
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  margin: 0,
                }}
              >
                {STAGE_ORDINAL[section.stage]}
              </p>
              <p
                style={{
                  color: MUTED_GREEN,
                  fontSize: 13,
                  letterSpacing: "0.04em",
                  margin: 0,
                }}
              >
                {STAGE_LATIN[section.stage]}
              </p>
              <p
                style={{
                  color: FAINT_GREEN,
                  fontSize: 11,
                  margin: 0,
                  marginLeft: "auto",
                }}
              >
                {section.reflections.length}{" "}
                {section.reflections.length === 1 ? "response" : "responses"}
              </p>
            </div>
            {!section.userHasSubmitted ? (
              <p
                style={{
                  color: MUTED_GREEN,
                  fontSize: 14,
                  lineHeight: 1.5,
                  fontFamily: SPACE_GROTESK,
                  fontStyle: "italic",
                }}
              >
                Share your own reflection for this stage to see what others
                heard.
              </p>
            ) : section.reflections.length === 0 ? (
              <p
                style={{
                  color: MUTED_GREEN,
                  fontSize: 14,
                  lineHeight: 1.5,
                  fontFamily: SPACE_GROTESK,
                }}
              >
                No reflections yet this week.
              </p>
            ) : (
              <div className="space-y-3">
                {section.reflections.map((r, i) => (
                  <ReflectionCard
                    key={`${section.stage}-${i}`}
                    name={r.userName}
                    text={r.text}
                    isYou={r.isYou}
                    createdAt={r.createdAt}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 56,
          pointerEvents: "none",
          background: `linear-gradient(to bottom, ${CARD_FADE_TRANSPARENT} 0%, ${CARD_FADE_SOLID} 100%)`,
          borderBottomLeftRadius: 18,
          borderBottomRightRadius: 18,
        }}
      />
    </div>
  );
}

// ─── Settings menu ──────────────────────────────────────────────────────────
// Centered modal surfaced by the Menu button in the header. Creator sees
// name / intention edit + Delete. Non-creator sees member list + Leave.

function SettingsMenu({
  data,
  onClose,
  onSaveEdit,
  editPending,
  onToggleAllowMemberInvites,
  onInvite,
  invitePending,
  onRemoveMember,
  removePendingEmail,
  onGoToSummary,
  onLeave,
  leavePending,
  onDelete,
  deletePending,
}: {
  data: LectioData;
  onClose: () => void;
  onSaveEdit: (name: string, intention: string) => void;
  editPending: boolean;
  onToggleAllowMemberInvites: (val: boolean) => void;
  onInvite: (name: string, email: string) => void;
  invitePending: boolean;
  onRemoveMember: (email: string) => void;
  removePendingEmail: string | null;
  onGoToSummary: () => void;
  onLeave: () => void;
  leavePending: boolean;
  onDelete: () => void;
  deletePending: boolean;
}) {
  const { isCreator, moment, members } = data;
  const [name, setName] = useState(moment.name);
  const [intention, setIntention] = useState(moment.intention ?? "");
  const [confirming, setConfirming] = useState<null | "leave" | "delete">(null);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [confirmRemoveEmail, setConfirmRemoveEmail] = useState<string | null>(null);
  // Collapsible advanced section — hidden by default so the menu surfaces
  // the three quick actions (Go to summary, Invite, weeks-active) first.
  const [settingsExpanded, setSettingsExpanded] = useState(false);

  const dirty = name.trim() !== moment.name || intention.trim() !== (moment.intention ?? "");
  const canSubmitInvite =
    inviteName.trim().length > 0 && /.+@.+\..+/.test(inviteEmail.trim());

  // How many full weeks this practice has been running. Based on the
  // moment's createdAt — we just compute (now − createdAt) / 7 days, with
  // a floor of 1 so a brand-new practice still reads as "1 week".
  const weeksActive = (() => {
    if (!moment.createdAt) return 1;
    const created = new Date(moment.createdAt).getTime();
    if (Number.isNaN(created)) return 1;
    const ms = Date.now() - created;
    const weeks = Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
    return Math.max(1, weeks + 1);
  })();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        fontFamily: SPACE_GROTESK,
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0F2818",
          border: `1px solid ${BORDER}`,
          borderRadius: 20,
          boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
          width: "100%",
          maxWidth: 460,
          maxHeight: "85vh",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: 24,
          color: WARM_TEXT,
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{moment.name}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              color: FAINT_GREEN,
              fontSize: 20,
              cursor: "pointer",
              padding: 4,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* ─── Quick actions (Go to summary → Invite → weeks active) ──────
            These three land at the top of the menu so the common actions
            are one tap away. The detailed practice controls (name,
            intention, members, delete) live inside the collapsible
            Settings section below. */}

        {/* 1. Go to summary — jumps past the stage slides. */}
        <button
          type="button"
          onClick={onGoToSummary}
          className="rounded-full"
          style={{
            background: BUTTON_BG,
            color: WARM_TEXT,
            border: `1px solid ${BORDER}`,
            fontFamily: SPACE_GROTESK,
            fontSize: 13,
            fontWeight: 600,
            padding: "10px 18px",
            cursor: "pointer",
            width: "100%",
            marginBottom: 14,
          }}
        >
          Go to summary →
        </button>

        {/* 2. Invite someone — visible when creator OR allowMemberInvites is on. */}
        {(isCreator || (moment.allowMemberInvites ?? true)) && (
          <div style={{ marginBottom: 14 }}>
            {showInviteForm ? (
              <div
                style={{
                  background: "rgba(0,0,0,0.25)",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Name"
                  style={{
                    width: "100%",
                    background: "rgba(0,0,0,0.3)",
                    border: `1px solid ${BORDER}`,
                    borderRadius: 8,
                    color: WARM_TEXT,
                    fontFamily: SPACE_GROTESK,
                    fontSize: 14,
                    padding: "8px 10px",
                    outline: "none",
                    marginBottom: 8,
                  }}
                />
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Email"
                  style={{
                    width: "100%",
                    background: "rgba(0,0,0,0.3)",
                    border: `1px solid ${BORDER}`,
                    borderRadius: 8,
                    color: WARM_TEXT,
                    fontFamily: SPACE_GROTESK,
                    fontSize: 14,
                    padding: "8px 10px",
                    outline: "none",
                    marginBottom: 10,
                  }}
                />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (!canSubmitInvite) return;
                      onInvite(inviteName.trim(), inviteEmail.trim());
                      setInviteName("");
                      setInviteEmail("");
                      setShowInviteForm(false);
                    }}
                    disabled={!canSubmitInvite || invitePending}
                    className="rounded-full"
                    style={{
                      background: BUTTON_BG,
                      color: WARM_TEXT,
                      fontFamily: SPACE_GROTESK,
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "6px 14px",
                      border: "none",
                      cursor: canSubmitInvite && !invitePending ? "pointer" : "not-allowed",
                      opacity: canSubmitInvite && !invitePending ? 1 : 0.5,
                    }}
                  >
                    {invitePending ? "Inviting…" : "Send invite"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowInviteForm(false);
                      setInviteName("");
                      setInviteEmail("");
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: FAINT_GREEN,
                      fontFamily: SPACE_GROTESK,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowInviteForm(true)}
                className="rounded-full"
                style={{
                  background: "transparent",
                  border: `1px dashed ${BORDER}`,
                  color: ACCENT,
                  fontFamily: SPACE_GROTESK,
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "10px 18px",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                + Invite someone
              </button>
            )}
          </div>
        )}

        {/* 3. Weeks active — read-only signal of how long this practice
            has been going. Helps people see the practice as something
            they've been building. */}
        <div
          style={{
            background: "rgba(0,0,0,0.2)",
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: "12px 16px",
            marginBottom: 18,
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span
            style={{
              color: FAINT_GREEN,
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Active for
          </span>
          <span style={{ color: WARM_TEXT, fontSize: 15, fontWeight: 600 }}>
            {weeksActive} {weeksActive === 1 ? "week" : "weeks"}
          </span>
        </div>

        {/* ─── Settings (collapsible) ─────────────────────────────────────
            Holds the less-used controls: name, intention, members list
            and the destructive actions. Collapsed by default. */}
        <button
          type="button"
          onClick={() => setSettingsExpanded((s) => !s)}
          style={{
            width: "100%",
            background: "transparent",
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            color: WARM_TEXT,
            fontFamily: SPACE_GROTESK,
            fontSize: 13,
            fontWeight: 600,
            padding: "10px 14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: settingsExpanded ? 14 : 0,
          }}
        >
          <span>Settings</span>
          <span style={{ color: FAINT_GREEN, fontSize: 14 }}>
            {settingsExpanded ? "▾" : "▸"}
          </span>
        </button>

        {settingsExpanded && (
          <>
        {/* Name / intention — editable by creator, read-only otherwise */}
        <div style={{ marginBottom: 22 }}>
          <label style={{ display: "block", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: FAINT_GREEN, marginBottom: 6 }}>
            Name
          </label>
          {isCreator ? (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: "100%",
                background: "rgba(0,0,0,0.25)",
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
                color: WARM_TEXT,
                fontFamily: SPACE_GROTESK,
                fontSize: 15,
                padding: "10px 12px",
                outline: "none",
              }}
            />
          ) : (
            <p style={{ color: WARM_TEXT, fontSize: 15, margin: 0 }}>{moment.name}</p>
          )}
        </div>

        <div style={{ marginBottom: 22 }}>
          <label style={{ display: "block", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: FAINT_GREEN, marginBottom: 6 }}>
            Intention
          </label>
          {isCreator ? (
            <textarea
              value={intention}
              onChange={(e) => setIntention(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                background: "rgba(0,0,0,0.25)",
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
                color: WARM_TEXT,
                fontFamily: SPACE_GROTESK,
                fontSize: 15,
                lineHeight: 1.5,
                padding: "10px 12px",
                outline: "none",
                boxShadow: "none",
                resize: "vertical",
              }}
            />
          ) : (
            <p style={{ color: MUTED_GREEN, fontSize: 14, margin: 0, lineHeight: 1.5 }}>
              {moment.intention || "—"}
            </p>
          )}
          {isCreator && dirty && (
            <button
              type="button"
              onClick={() => onSaveEdit(name.trim(), intention.trim())}
              disabled={editPending || name.trim().length === 0}
              className="rounded-full mt-3"
              style={{
                background: BUTTON_BG,
                color: WARM_TEXT,
                fontFamily: SPACE_GROTESK,
                fontSize: 13,
                fontWeight: 600,
                padding: "8px 18px",
                border: "none",
                cursor: editPending ? "wait" : "pointer",
              }}
            >
              {editPending ? "Saving…" : "Save changes"}
            </button>
          )}
        </div>

        {/* Invite permissions toggle — creator only */}
        {isCreator && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(0,0,0,0.2)",
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              padding: "12px 14px",
              marginBottom: 18,
            }}
          >
            <div>
              <div style={{ color: WARM_TEXT, fontSize: 14, fontWeight: 500 }}>Members can invite</div>
              <div style={{ color: FAINT_GREEN, fontSize: 12, marginTop: 2 }}>Allow any member to invite new people</div>
            </div>
            <button
              type="button"
              onClick={() => onToggleAllowMemberInvites(!(moment.allowMemberInvites ?? true))}
              style={{
                position: "relative",
                display: "inline-flex",
                height: 24,
                width: 44,
                alignItems: "center",
                borderRadius: 12,
                background: (moment.allowMemberInvites ?? true) ? "rgba(74,103,65,0.7)" : "rgba(255,255,255,0.12)",
                border: "1px solid rgba(46,107,64,0.4)",
                cursor: "pointer",
                flexShrink: 0,
                marginLeft: 12,
                transition: "background 0.2s",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  height: 16,
                  width: 16,
                  borderRadius: 8,
                  background: "#fff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  transform: (moment.allowMemberInvites ?? true) ? "translateX(22px)" : "translateX(3px)",
                  transition: "transform 0.2s",
                }}
              />
            </button>
          </div>
        )}

        {/* Members list — creators can add/remove, non-creators just see who's here. */}
        <div style={{ marginBottom: 22 }}>
          <label style={{ display: "block", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: FAINT_GREEN, marginBottom: 8 }}>
            Members
          </label>
          <div className="space-y-1">
            {members.map((m) => {
              const isRemoving = removePendingEmail === m.email;
              const isConfirming = confirmRemoveEmail === m.email;
              return (
                <div
                  key={m.email}
                  className="flex items-center justify-between gap-3"
                  style={{
                    padding: "6px 0",
                    borderBottom: `1px solid ${BORDER}`,
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: m.isYou ? ACCENT : WARM_TEXT, fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                      <span>{m.name}{m.isYou ? " · you" : ""}</span>
                      {!m.isYou && m.joined === false && (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#A8C5A0",
                          background: "rgba(46,107,64,0.2)",
                          border: "1px solid rgba(46,107,64,0.3)",
                          borderRadius: 999,
                          padding: "1px 8px",
                          letterSpacing: "0.04em",
                        }}>
                          Invited
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        color: FAINT_GREEN,
                        fontSize: 12,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.email}
                    </div>
                  </div>
                  {isCreator && !m.isYou && (
                    isConfirming ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onRemoveMember(m.email);
                            setConfirmRemoveEmail(null);
                          }}
                          disabled={isRemoving}
                          style={{
                            background: "#8A2A2A",
                            color: WARM_TEXT,
                            border: "none",
                            borderRadius: 999,
                            fontFamily: SPACE_GROTESK,
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "4px 12px",
                            cursor: isRemoving ? "wait" : "pointer",
                          }}
                        >
                          {isRemoving ? "Removing…" : "Remove"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveEmail(null)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: FAINT_GREEN,
                            fontFamily: SPACE_GROTESK,
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveEmail(m.email)}
                        aria-label={`Remove ${m.name}`}
                        style={{
                          background: "transparent",
                          border: `1px solid ${BORDER}`,
                          color: FAINT_GREEN,
                          borderRadius: 999,
                          fontFamily: SPACE_GROTESK,
                          fontSize: 11,
                          padding: "4px 10px",
                          cursor: "pointer",
                        }}
                      >
                        Remove
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>

        </div>

        {/* Danger zone */}
        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 18 }}>
          {!isCreator && (
            confirming === "leave" ? (
              <div>
                <p style={{ color: WARM_TEXT, fontSize: 14, marginBottom: 12 }}>
                  Leave "{moment.name}"? You'll stop receiving reminders and can be re-invited later.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onLeave}
                    disabled={leavePending}
                    className="rounded-full"
                    style={{
                      background: "#8A5A1A",
                      color: WARM_TEXT,
                      fontFamily: SPACE_GROTESK,
                      fontSize: 13,
                      fontWeight: 600,
                      padding: "8px 18px",
                      border: "none",
                      cursor: leavePending ? "wait" : "pointer",
                    }}
                  >
                    {leavePending ? "Leaving…" : "Yes, leave it"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: FAINT_GREEN,
                      fontFamily: SPACE_GROTESK,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming("leave")}
                className="rounded-full"
                style={{
                  background: "transparent",
                  color: "#C79A4A",
                  border: "1px solid rgba(199,154,74,0.5)",
                  fontFamily: SPACE_GROTESK,
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "8px 18px",
                  cursor: "pointer",
                }}
              >
                Leave practice
              </button>
            )
          )}
          {isCreator && (
            confirming === "delete" ? (
              <div>
                <p style={{ color: WARM_TEXT, fontSize: 14, marginBottom: 12 }}>
                  Delete "{moment.name}"? This removes it for everyone and cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={deletePending}
                    className="rounded-full"
                    style={{
                      background: "#8A2A2A",
                      color: WARM_TEXT,
                      fontFamily: SPACE_GROTESK,
                      fontSize: 13,
                      fontWeight: 600,
                      padding: "8px 18px",
                      border: "none",
                      cursor: deletePending ? "wait" : "pointer",
                    }}
                  >
                    {deletePending ? "Deleting…" : "Yes, delete it"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: FAINT_GREEN,
                      fontFamily: SPACE_GROTESK,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming("delete")}
                className="rounded-full"
                style={{
                  background: "transparent",
                  color: "#D97A7A",
                  border: "1px solid rgba(217,122,122,0.5)",
                  fontFamily: SPACE_GROTESK,
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "8px 18px",
                  cursor: "pointer",
                }}
              >
                Delete practice
              </button>
            )
          )}
        </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
