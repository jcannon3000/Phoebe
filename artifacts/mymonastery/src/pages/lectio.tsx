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

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";

type Stage = "lectio" | "meditatio" | "oratio";
const STAGE_ORDER: Stage[] = ["lectio", "meditatio", "oratio"];

// Stage naming: the slideshow speaks in plain English ("First Stage") so
// newcomers aren't tripped up by Latin. The Latin name still appears as a
// quieter subtitle for those who recognize the tradition.
const STAGE_ORDINAL: Record<Stage, string> = {
  lectio: "First Stage",
  meditatio: "Second Stage",
  oratio: "Third Stage",
};
const STAGE_LATIN: Record<Stage, string> = {
  lectio: "Lectio",
  meditatio: "Meditatio",
  oratio: "Oratio",
};
// Instructive prompt text. More hand-holding than a bare question — the user
// is told how to *approach* the passage at this stage, then what to notice.
const STAGE_PROMPT_TEXT: Record<Stage, string> = {
  lectio:
    "As you read this Sunday's gospel, notice the word or phrase that is speaking to you. Let it rise on its own; don't chase it.",
  meditatio:
    "Return to the passage. Sit with the word or phrase you noticed. What is it stirring in you?",
  oratio:
    "Read the passage one last time. Listen for how it is calling you to act, to pray, or to become.",
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
  nonSubmitterNames: string[];
};

type LectioData = {
  moment: { id: number; name: string; templateType: string; timezone: string };
  userName: string;
  userToken: string;
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
// page. Cards on top of it are a slightly lighter green to float visually.
const BG = "#091A10";
const CARD_BG = "#132C1D";
const WARM_TEXT = "#F0EDE6";
const MUTED_GREEN = "#8FAF96";
const FAINT_GREEN = "rgba(143,175,150,0.55)";
const ACCENT = "#6FAF85";
const BORDER = "rgba(200,212,192,0.15)";
const BUTTON_BG = "#2D5E3F";

// Shared card wrapper for every slide. Keeps the slides visually consistent
// — a lighter rounded panel sitting on the standard background — and gives
// individual slides (like the gospel reading) a fixed height they can scroll
// inside without moving the page.
function SlideCard({
  children,
  padded = true,
  scrollable = false,
}: {
  children: React.ReactNode;
  padded?: boolean;
  scrollable?: boolean;
}) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 20,
        boxShadow: "0 4px 24px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.25)",
        padding: padded ? "28px 24px" : 0,
        maxHeight: scrollable ? "min(64vh, 560px)" : undefined,
        overflowY: scrollable ? "auto" : undefined,
        WebkitOverflowScrolling: "touch",
      }}
    >
      {children}
    </div>
  );
}

// ─── Slide model ────────────────────────────────────────────────────────────

type SlideKind = "prompt" | "reading" | "entry" | "responses";
type Slide = { stage: Stage; kind: SlideKind };

function buildSlides(data: LectioData): Slide[] {
  const slides: Slide[] = [];
  for (const s of STAGE_ORDER) {
    if (!data.stages[s].unlocked) continue;
    slides.push({ stage: s, kind: "prompt" });
    slides.push({ stage: s, kind: "reading" });
    slides.push({ stage: s, kind: "entry" });
    slides.push({ stage: s, kind: "responses" });
  }
  return slides;
}

// Where to land the user when they first open the page: the prompt slide of
// the first unlocked stage they haven't submitted yet. Falls back to index 0
// if everything is already done.
function initialSlideIndex(data: LectioData, slides: Slide[]): number {
  for (const s of STAGE_ORDER) {
    if (data.stages[s].unlocked && !data.stages[s].userHasSubmitted) {
      const idx = slides.findIndex((sl) => sl.stage === s && sl.kind === "prompt");
      if (idx >= 0) return idx;
    }
  }
  return 0;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function LectioPage() {
  const { momentToken, userToken } = useParams<{
    momentToken: string;
    userToken: string;
  }>();
  const qc = useQueryClient();

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
  const stageData = data.stages[current.stage];
  const atStart = slideIdx === 0;
  const atEnd = slideIdx === slides.length - 1;

  const next = () => setSlideIdx((i) => Math.min(i + 1, slides.length - 1));
  const prev = () => setSlideIdx((i) => Math.max(i - 1, 0));

  return (
    <div style={{ minHeight: "100vh", background: BG, color: WARM_TEXT, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header className="max-w-2xl mx-auto w-full px-5 pt-6 pb-2 flex items-center justify-between">
        <Link href="/dashboard">
          <span style={{ color: FAINT_GREEN, fontSize: 13 }}>← Back</span>
        </Link>
        <div className="text-right">
          <p style={{ color: FAINT_GREEN, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase" }}>
            {STAGE_ORDINAL[current.stage]}
          </p>
          <p style={{ color: MUTED_GREEN, fontSize: 12, marginTop: 2 }}>
            {data.reading.gospelReference}
          </p>
        </div>
      </header>

      {/* Slide content */}
      <main
        className="flex-1 flex items-center justify-center px-5 py-6"
        style={{ paddingBottom: 112 /* room for floating nav pill */ }}
      >
        <div className="max-w-2xl w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${current.stage}-${current.kind}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              {current.kind === "prompt" && (
                <SlideCard>
                  <PromptSlide stage={current.stage} />
                </SlideCard>
              )}
              {current.kind === "reading" && (
                <SlideCard scrollable>
                  <ReadingSlide reading={data.reading} />
                </SlideCard>
              )}
              {current.kind === "entry" && (
                <SlideCard>
                  <EntrySlide
                    stage={current.stage}
                    stageData={stageData}
                    submitting={
                      submitMutation.isPending &&
                      submitMutation.variables?.stage === current.stage
                    }
                    onSubmit={(text) => {
                      submitMutation.mutate(
                        { stage: current.stage, reflectionText: text },
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
                </SlideCard>
              )}
              {current.kind === "responses" && (
                <SlideCard>
                  <ResponsesSlide stageData={stageData} memberCount={data.memberCount} />
                </SlideCard>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Floating nav pill at the bottom of the viewport. Fixed so scrolling
          inside a slide (e.g. the gospel card) doesn't move the nav. */}
      <nav
        aria-label="Slide navigation"
        style={{
          position: "fixed",
          left: "50%",
          bottom: 24,
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
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={prev}
            disabled={atStart}
            aria-label="Previous"
            className="rounded-full transition-opacity disabled:opacity-20"
            style={{
              color: WARM_TEXT,
              background: "transparent",
              border: `1px solid ${BORDER}`,
              padding: "8px 14px",
              fontSize: 13,
              cursor: atStart ? "default" : "pointer",
            }}
          >
            ←
          </button>

          <div className="flex items-center gap-1.5">
            {slides.map((sl, i) => {
              const isActive = i === slideIdx;
              const isStageBreak = i > 0 && slides[i - 1].stage !== sl.stage;
              return (
                <div key={i} className="flex items-center gap-1.5">
                  {isStageBreak && (
                    <div style={{ width: 10, height: 1, background: BORDER }} />
                  )}
                  <button
                    type="button"
                    onClick={() => setSlideIdx(i)}
                    aria-label={`${sl.stage} ${sl.kind}`}
                    style={{
                      width: isActive ? 10 : 6,
                      height: isActive ? 10 : 6,
                      borderRadius: 999,
                      background: isActive ? ACCENT : "rgba(143,175,150,0.25)",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      transition: "all 0.2s ease",
                    }}
                  />
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={next}
            disabled={atEnd}
            aria-label="Next"
            className="rounded-full transition-opacity disabled:opacity-20"
            style={{
              color: WARM_TEXT,
              background: "transparent",
              border: `1px solid ${BORDER}`,
              padding: "8px 14px",
              fontSize: 13,
              cursor: atEnd ? "default" : "pointer",
            }}
          >
            →
          </button>
        </div>
      </nav>
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
  return (
    <div className="py-2">
      <p
        style={{
          color: FAINT_GREEN,
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          marginBottom: 18,
          textAlign: "center",
        }}
      >
        {reading.sundayName}
      </p>
      <p
        style={{
          color: MUTED_GREEN,
          fontSize: 13,
          letterSpacing: "0.04em",
          marginBottom: 22,
          textAlign: "center",
        }}
      >
        {reading.gospelReference}
      </p>
      <div
        style={{
          color: WARM_TEXT,
          fontSize: 18,
          lineHeight: 1.8,
          fontFamily:
            "'Georgia', 'Iowan Old Style', 'Palatino', 'Times New Roman', serif",
          whiteSpace: "pre-wrap",
        }}
      >
        {reading.gospelText}
      </div>
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

  return (
    <div className="py-2">
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
        rows={7}
        placeholder="Take your time…"
        style={{
          width: "100%",
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
      <div className="flex items-center justify-between mt-3">
        <span style={{ color: FAINT_GREEN, fontSize: 12 }}>
          {hasSubmitted ? "You can revise anytime this week." : "Private until you share."}
        </span>
        <button
          type="button"
          onClick={() => onSubmit(draft.trim())}
          disabled={submitting || draft.trim().length === 0}
          className="rounded-full transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{
            background: BUTTON_BG,
            color: WARM_TEXT,
            fontSize: 13,
            fontWeight: 600,
            padding: "8px 18px",
            border: "none",
            cursor: submitting ? "wait" : "pointer",
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
            <ReflectionCard key={i} name={r.userName} text={r.text} isYou={r.isYou} />
          ))}
        </div>
      )}
      {stageData.nonSubmitterNames.length > 0 && (
        <p
          style={{
            color: FAINT_GREEN,
            fontSize: 12,
            marginTop: 18,
            lineHeight: 1.6,
          }}
        >
          Still listening: {stageData.nonSubmitterNames.join(", ")}
        </p>
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

function ReflectionCard({
  name,
  text,
  isYou,
}: {
  name: string;
  text: string;
  isYou: boolean;
}) {
  return (
    <div
      className="rounded-xl"
      style={{
        background: isYou ? "rgba(111,175,133,0.08)" : "#0F2818",
        border: `1px solid ${isYou ? "rgba(111,175,133,0.35)" : BORDER}`,
        padding: "16px 18px",
      }}
    >
      <p
        style={{
          color: isYou ? ACCENT : MUTED_GREEN,
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {isYou ? "You" : name}
      </p>
      <p
        style={{
          color: WARM_TEXT,
          fontSize: 15,
          lineHeight: 1.65,
          fontFamily:
            "'Georgia', 'Iowan Old Style', 'Palatino', 'Times New Roman', serif",
          whiteSpace: "pre-wrap",
        }}
      >
        {text}
      </p>
    </div>
  );
}
