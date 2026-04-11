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
  };
  userName: string;
  userToken: string;
  isCreator: boolean;
  members: Array<{ name: string; email: string; isYou: boolean }>;
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
const ACCENT = "#6FAF85";
const BORDER = "rgba(200,212,192,0.15)";
const BUTTON_BG = "#2D5E3F";

// Every bit of copy on this page is Space Grotesk (not Georgia/serif). We
// set it at the page root so we don't have to restate it on every slide.
const SPACE_GROTESK =
  "'Space Grotesk', system-ui, -apple-system, Segoe UI, sans-serif";

// ─── Slide model ────────────────────────────────────────────────────────────

type SlideKind = "prompt" | "reading" | "entry" | "responses" | "summary" | "all-responses";
// Summary slide isn't bound to a specific stage — it summarizes the whole
// week — so `stage` is nullable and readers must check `kind` first.
type Slide = { stage: Stage | null; kind: SlideKind };

function allStagesSubmitted(data: LectioData): boolean {
  const unlocked = STAGE_ORDER.filter((s) => data.stages[s].unlocked);
  if (unlocked.length === 0) return false;
  return unlocked.every((s) => data.stages[s].userHasSubmitted);
}

function buildSlides(data: LectioData): Slide[] {
  const slides: Slide[] = [];
  for (const s of STAGE_ORDER) {
    if (!data.stages[s].unlocked) continue;
    slides.push({ stage: s, kind: "prompt" });
    slides.push({ stage: s, kind: "reading" });
    slides.push({ stage: s, kind: "entry" });
    slides.push({ stage: s, kind: "responses" });
  }
  // Tack on a summary slide once the user has submitted every unlocked stage.
  // This is the "you've finished the week's reading" moment — it lists the
  // three stages, how many of the circle have responded to each, and lets
  // the user jump back into the responses to read what others heard.
  //
  // The `all-responses` slide is a single scrollable page that lists the
  // responses from all three stages together. It's the destination of the
  // "Read all responses" CTA on the summary slide.
  if (allStagesSubmitted(data)) {
    slides.push({ stage: null, kind: "summary" });
    slides.push({ stage: null, kind: "all-responses" });
  }
  return slides;
}

// Where to land the user when they first open the page:
//   - if they've already submitted every unlocked stage for the week, go
//     straight to the summary slide
//   - otherwise, open them on the prompt slide of the first unlocked stage
//     they haven't finished yet
//   - fall back to index 0 if nothing else matches
function initialSlideIndex(data: LectioData, slides: Slide[]): number {
  if (allStagesSubmitted(data)) {
    const summaryIdx = slides.findIndex((sl) => sl.kind === "summary");
    if (summaryIdx >= 0) return summaryIdx;
  }
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
    mutationFn: (body: { name?: string; intention?: string }) =>
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
    const idx = slides.findIndex((sl) => sl.kind === "summary");
    if (idx >= 0) setSlideIdx(idx);
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
        height: "100vh",
        overflow: "hidden",
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
          className="max-w-2xl mx-auto w-full px-5 pt-6 pb-2"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: 12,
            pointerEvents: "auto",
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
              {data.week.isSunday
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

      {/* Slide content. Main is flex-1 inside a fixed-height viewport so it
          takes all the space between the top of the window and the bottom.
          Full-height slides (reading, all-responses) get top/bottom padding
          so they fit cleanly between the fixed header and the fixed nav —
          and their scrolling happens inside their own card, not on the
          page. Other slides center their content. */}
      {(() => {
        const isFullHeightSlide =
          current.kind === "reading" || current.kind === "all-responses";
        return (
      <main
        className={`flex-1 flex px-5 ${
          isFullHeightSlide
            ? "items-stretch justify-center"
            : "items-center justify-center"
        }`}
        style={{
          minHeight: 0,
          paddingTop: isFullHeightSlide ? 80 : 96,
          paddingBottom: isFullHeightSlide ? 104 : 112,
        }}
      >
        <div
          className="max-w-2xl w-full"
          style={
            isFullHeightSlide
              ? { display: "flex", flexDirection: "column", minHeight: 0 }
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
          inside a slide (e.g. the gospel card) doesn't move the nav. */}
      <nav
        aria-label="Slide navigation"
        style={{
          position: "fixed",
          left: "50%",
          bottom: 26,
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
          const stageLabel = data.week.isSunday
            ? "Completed"
            : current.stage
              ? `${STAGE_ORDINAL[current.stage]} · ${STAGE_LATIN[current.stage]}`
              : current.kind === "all-responses"
                ? "All Responses"
                : "Summary";

          let actionLabel: string | null = null;
          if (current.kind === "prompt") {
            actionLabel = "Read";
          } else if (current.kind === "reading") {
            actionLabel = "Reflect";
          } else if (current.kind === "entry") {
            // Only offer the nav pill once the user has already submitted —
            // otherwise they should use the Share button on the slide itself.
            if (stageData?.userHasSubmitted) actionLabel = "Responses";
          } else if (current.kind === "responses") {
            const nextSlide = slides[slideIdx + 1];
            if (nextSlide) {
              actionLabel = nextSlide.kind === "summary" ? "Summary" : "Next stage";
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

      {/* Settings menu overlay */}
      <AnimatePresence>
        {menuOpen && (
          <SettingsMenu
            data={data}
            onClose={() => setMenuOpen(false)}
            onSaveEdit={(name, intention) => editMutation.mutate({ name, intention })}
            editPending={editMutation.isPending}
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
  // stays put and the page never scrolls.
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        background: "rgba(19,44,29,0.55)",
        border: `1px solid ${BORDER}`,
        borderRadius: 18,
        boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
        overflow: "hidden",
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
        background: "rgba(19,44,29,0.55)",
        border: `1px solid ${BORDER}`,
        borderRadius: 18,
        boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "22px 24px 26px",
        }}
      >
        <p
          style={{
            color: FAINT_GREEN,
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            marginBottom: 6,
            textAlign: "center",
          }}
        >
          The week's reading
        </p>
        <p
          style={{
            color: WARM_TEXT,
            fontSize: 20,
            lineHeight: 1.4,
            marginBottom: 24,
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

        {/* 2. Invite someone — creators only. Collapsible form in place. */}
        {isCreator && (
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
                    <div style={{ color: m.isYou ? ACCENT : WARM_TEXT, fontSize: 14, fontWeight: 500 }}>
                      {m.name}{m.isYou ? " · you" : ""}
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
