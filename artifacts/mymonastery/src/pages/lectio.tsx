/**
 * Lectio Divina — reading + reflection + reveal page.
 *
 * /lectio/:momentToken/:userToken
 *
 * Shows:
 *   1. The Sunday Gospel (fetched lazily per week from the RCL source).
 *   2. The current stage prompt + a textarea, gated behind "submit to see others".
 *   3. On Sunday, a read-only scrollable "This week's journey" of all three stages.
 */

import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";

type Stage = "lectio" | "meditatio" | "oratio";

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

// ─── Palette (matches the rest of the app) ──────────────────────────────────
const BG = "#0A1F11";
const CARD_BG = "#0F2818";
const WARM_TEXT = "#F0EDE6";
const MUTED_GREEN = "#8FAF96";
const FAINT_GREEN = "rgba(143,175,150,0.55)";
const ACCENT = "#6FAF85";
const BORDER = "rgba(200,212,192,0.15)";

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
    },
  });

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
    // Friendly headline per stage — but always include the raw detail so we
    // can debug production issues without another round-trip.
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
              style={{ background: "#2D5E3F", color: "#F0EDE6" }}
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

  const { reading, week, stages } = data;
  const isSunday = week.isSunday;

  return (
    <div style={{ minHeight: "100vh", background: BG, color: WARM_TEXT }}>
      <div className="max-w-2xl mx-auto px-5 pt-8 pb-24">
        {/* Nav back */}
        <div className="mb-6">
          <Link href="/dashboard">
            <span style={{ color: FAINT_GREEN, fontSize: 13 }}>← Back</span>
          </Link>
        </div>

        {/* Header: Sunday name + reference */}
        <header className="mb-8">
          <p
            className="uppercase mb-3"
            style={{
              color: FAINT_GREEN,
              fontSize: 11,
              letterSpacing: "0.18em",
            }}
          >
            {reading.liturgicalSeason ? `${reading.liturgicalSeason} · ` : ""}
            {reading.sundayName}
          </p>
          <h1
            style={{
              fontSize: 28,
              lineHeight: 1.2,
              fontWeight: 600,
              color: WARM_TEXT,
              letterSpacing: "-0.01em",
              marginBottom: 6,
            }}
          >
            {data.moment.name}
          </h1>
          <p style={{ color: MUTED_GREEN, fontSize: 13 }}>
            {week.phaseLabel}
          </p>
        </header>

        {/* The Gospel reading */}
        <section
          className="rounded-2xl mb-10"
          style={{
            background: CARD_BG,
            border: `1px solid ${BORDER}`,
            padding: "28px 26px",
          }}
        >
          <p
            style={{
              color: MUTED_GREEN,
              fontSize: 13,
              letterSpacing: "0.04em",
              marginBottom: 18,
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
        </section>

        {/* Body: either this-week's unlocked stages, or the Sunday journey */}
        {isSunday ? (
          <SundayJourney stages={stages} />
        ) : week.unlockedStages.length > 0 ? (
          <div className="space-y-10">
            {week.unlockedStages.map((s, idx) => {
              const stageData = stages[s];
              const isCurrent = s === week.currentStage;
              return (
                <CurrentStageBlock
                  key={s}
                  stageData={stageData}
                  isCurrent={isCurrent}
                  isCatchUp={!isCurrent && !stageData.userHasSubmitted}
                  dividerAbove={idx > 0}
                  onSubmit={(text) =>
                    submitMutation.mutate({ stage: s, reflectionText: text })
                  }
                  submitting={
                    submitMutation.isPending &&
                    submitMutation.variables?.stage === s
                  }
                  memberCount={data.memberCount}
                />
              );
            })}
          </div>
        ) : (
          <div
            className="rounded-xl"
            style={{
              background: CARD_BG,
              border: `1px solid ${BORDER}`,
              padding: "24px 22px",
              color: MUTED_GREEN,
              fontSize: 14,
              textAlign: "center",
            }}
          >
            {week.phaseLabel}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Current stage block: prompt + gate + reveal ────────────────────────────

function CurrentStageBlock({
  stageData,
  isCurrent,
  isCatchUp,
  dividerAbove,
  onSubmit,
  submitting,
  memberCount,
}: {
  stageData: StageReveal;
  isCurrent: boolean;
  isCatchUp: boolean;
  dividerAbove: boolean;
  onSubmit: (text: string) => void;
  submitting: boolean;
  memberCount: number;
}) {
  const hasSubmitted = stageData.userHasSubmitted;
  const [draft, setDraft] = useState(stageData.myReflection ?? "");

  // Re-sync the draft when the server's copy changes (e.g. after a save or
  // when a new stage unlocks). Touching the textarea overrides this on
  // subsequent renders because we only sync when myReflection itself changes.
  useEffect(() => {
    setDraft(stageData.myReflection ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageData.myReflection]);

  return (
    <section>
      {dividerAbove && (
        <div
          style={{
            height: 1,
            background: BORDER,
            marginBottom: 32,
          }}
        />
      )}
      {/* Stage label */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2" style={{ flexWrap: "wrap" }}>
          <p
            style={{
              color: FAINT_GREEN,
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            {stageData.label}
          </p>
          {isCurrent && (
            <span
              style={{
                color: ACCENT,
                background: "rgba(111,175,133,0.12)",
                border: "1px solid rgba(111,175,133,0.28)",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                padding: "2px 8px",
                borderRadius: 999,
              }}
            >
              Today
            </span>
          )}
          {isCatchUp && (
            <span
              style={{
                color: FAINT_GREEN,
                background: "rgba(143,175,150,0.08)",
                border: `1px solid ${BORDER}`,
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                padding: "2px 8px",
                borderRadius: 999,
              }}
            >
              Catch up
            </span>
          )}
        </div>
        <p style={{ color: WARM_TEXT, fontSize: 18, lineHeight: 1.5 }}>
          {stageData.prompt}
        </p>
      </div>

      {/* Write / edit */}
      <div
        className="rounded-xl"
        style={{
          background: CARD_BG,
          border: `1px solid ${BORDER}`,
          padding: "20px 20px 16px 20px",
          marginBottom: 16,
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          placeholder="Take your time…"
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            color: WARM_TEXT,
            fontSize: 16,
            lineHeight: 1.6,
            fontFamily:
              "'Georgia', 'Iowan Old Style', 'Palatino', 'Times New Roman', serif",
          }}
        />
        <div className="flex items-center justify-between mt-2">
          <span style={{ color: FAINT_GREEN, fontSize: 12 }}>
            {hasSubmitted ? "You can revise anytime this week." : "Private until you share."}
          </span>
          <button
            type="button"
            onClick={() => onSubmit(draft.trim())}
            disabled={submitting || draft.trim().length === 0}
            className="rounded-full transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{
              background: "#2D5E3F",
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

      {/* Reveal — gated */}
      <AnimatePresence mode="wait">
        {hasSubmitted && stageData.reflections ? (
          <motion.div
            key="reveal"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-6"
          >
            <p
              style={{
                color: FAINT_GREEN,
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                marginBottom: 14,
              }}
            >
              What others heard
            </p>
            <div className="space-y-3">
              {stageData.reflections.map((r, i) => (
                <ReflectionCard key={i} name={r.userName} text={r.text} isYou={r.isYou} />
              ))}
            </div>
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
          </motion.div>
        ) : !hasSubmitted ? (
          <motion.div
            key="gate"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-4 text-center"
          >
            <p style={{ color: FAINT_GREEN, fontSize: 12, lineHeight: 1.6 }}>
              Share your reflection to see what others heard.
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

// ─── Sunday view: the three stages unfurled read-only ───────────────────────

function SundayJourney({ stages }: { stages: Record<Stage, StageReveal> }) {
  const order: Stage[] = ["lectio", "meditatio", "oratio"];
  return (
    <section>
      <p
        style={{
          color: FAINT_GREEN,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          marginBottom: 18,
        }}
      >
        This week's journey
      </p>
      <div className="space-y-10">
        {order.map((s) => {
          const stage = stages[s];
          return (
            <div key={s}>
              <p
                style={{
                  color: MUTED_GREEN,
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  marginBottom: 4,
                }}
              >
                {stage.label}
              </p>
              <p
                style={{
                  color: FAINT_GREEN,
                  fontSize: 13,
                  fontStyle: "italic",
                  marginBottom: 12,
                }}
              >
                {stage.prompt}
              </p>
              {stage.reflections && stage.reflections.length > 0 ? (
                <div className="space-y-3">
                  {stage.reflections.map((r, i) => (
                    <ReflectionCard key={i} name={r.userName} text={r.text} isYou={r.isYou} />
                  ))}
                </div>
              ) : (
                <p style={{ color: FAINT_GREEN, fontSize: 13 }}>
                  No reflections this week.
                </p>
              )}
              {stage.nonSubmitterNames.length > 0 && (
                <p
                  style={{
                    color: FAINT_GREEN,
                    fontSize: 12,
                    marginTop: 10,
                  }}
                >
                  Still listening: {stage.nonSubmitterNames.join(", ")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
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
        background: isYou ? "rgba(111,175,133,0.08)" : CARD_BG,
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
