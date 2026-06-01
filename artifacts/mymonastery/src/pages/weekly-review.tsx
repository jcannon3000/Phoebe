/**
 * Weekly review — the Sunday-evening Way of Love examen (beta).
 *
 * The guided version of /this-week: a slideshow that walks the four WEEKLY
 * practices (Worship, Bless, Go, Rest), each as three slides — anchor (name +
 * definition + a question), look-back (kept last week? + weeks-kept streak +
 * your commitment), and set-this-week — then a covenant that records the
 * review. Recording posts a `weekly_review` practice-completion, which credits
 * Turn for the day (Turn counts any completion). Nothing is rebuilt: the
 * commitments, the completion model, and the Bless intention cycle are the same
 * surfaces /this-week and the home already use. The Sunday push points here.
 */

import { useState, useMemo, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import BlessSubScreen from "@/components/BlessSubScreen";
import { SECTIONS, commitmentLines, type SectionKey, type WolSelections, type CompletionRow } from "./home-beta";

const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.6)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD = "rgba(46,107,64,0.12)";
const CARD_B = "rgba(46,107,64,0.28)";
const CTA = "#2D5E3F";
const CHIP_B = "rgba(168,197,160,0.6)";

const WEEKLY_KEYS: SectionKey[] = ["worship", "bless", "go", "rest"];

function pad(n: number) { return String(n).padStart(2, "0"); }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function sundayStart(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addWeeks(d: Date, n: number) { return addDays(d, n * 7); }

// One reflective question per practice, for the anchor slide.
const QUESTION: Record<string, string> = {
  worship: "How did you gather last week?",
  bless: "Who did you bless last week?",
  go: "Where did you cross a boundary?",
  rest: "Did you find true rest?",
};
const SET_PROMPT: Record<string, string> = {
  worship: "When will you gather this week?",
  go: "Where will you go beyond yourself?",
  rest: "When will you rest?",
};

type Slide =
  | { kind: "intro" }
  | { kind: "anchor"; key: SectionKey }
  | { kind: "lookback"; key: SectionKey }
  | { kind: "set"; key: SectionKey }
  | { kind: "covenant" };

const eyebrow = { color: SAGE_DIM, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "1.2px", fontWeight: 700, fontFamily: FONT, margin: 0 };

export default function WeeklyReviewPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { rawIsBeta, isLoading: betaLoading } = useBetaStatus();
  const qc = useQueryClient();

  const wolQ = useQuery<{ selections: WolSelections }>({
    queryKey: ["/api/rule-of-life/wol"],
    queryFn: () => apiRequest("GET", "/api/rule-of-life/wol"),
    enabled: !!user,
    staleTime: 60_000,
  });
  const compQ = useQuery<{ completions: CompletionRow[] }>({
    queryKey: ["/api/practice-completion"],
    queryFn: () => apiRequest("GET", "/api/practice-completion"),
    enabled: !!user,
    staleTime: 15_000,
  });

  const today = ymd(new Date());
  const thisWeekStart = ymd(sundayStart(new Date()));
  const lastWeekStart = ymd(addWeeks(sundayStart(new Date()), -1));
  const weekRange = `${sundayStart(new Date()).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${addDays(sundayStart(new Date()), 6).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  const rows = useMemo(() => compQ.data?.completions ?? [], [compQ.data]);
  const selections = wolQ.data?.selections ?? {};

  const def = (key: SectionKey) => SECTIONS.find((s) => s.key === key)!;
  const doneLastWeek = (key: SectionKey) => rows.some((r) => r.section === key && r.weekStart === lastWeekStart);
  // Consecutive weeks kept. Counts the current week when it's already kept,
  // otherwise falls back to the run ending last week — identical to the
  // /this-week page (way-of-love-week.tsx) so the same streak reads the same
  // on both screens instead of diverging by one mid-week.
  const weeksKept = (key: SectionKey): number => {
    let run = 0;
    const ws = sundayStart(new Date());
    for (let i = 0; i < 60; i++) {
      const has = rows.some((r) => r.section === key && r.weekStart === ymd(addWeeks(ws, -i)));
      if (has) run++;
      else if (i > 0) break;
    }
    return run;
  };
  const lastKept = WEEKLY_KEYS.filter(doneLastWeek);

  const slides: Slide[] = useMemo(
    () => [
      { kind: "intro" as const },
      ...WEEKLY_KEYS.flatMap((key) => [
        { kind: "anchor" as const, key },
        { kind: "lookback" as const, key },
        { kind: "set" as const, key },
      ]),
      { kind: "covenant" as const },
    ],
    [],
  );

  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const isLast = index === slides.length - 1;

  const finishMut = useMutation({
    // Recording the review credits Turn (any completion's day counts) and
    // matches the Sunday sender's "already reviewed this week" check
    // (section=weekly_review, weekStart = this Sunday).
    mutationFn: () => apiRequest("POST", "/api/practice-completion", { section: "weekly_review", localDate: today, weekStart: thisWeekStart }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/practice-completion"] });
      setLocation("/dashboard");
    },
  });

  if (authLoading || !user || (!betaLoading && !rawIsBeta)) return null;

  const next = () => { if (!isLast) setIndex((i) => i + 1); };
  const back = () => { if (index === 0) setLocation("/this-week"); else setIndex((i) => i - 1); };
  const progressPct = ((index + 1) / slides.length) * 100;

  const commitCard = (key: SectionKey) => {
    const lines = commitmentLines(def(key), selections);
    return lines.length > 0 ? (
      <div style={{ marginTop: 18, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "12px 14px" }}>
        <p style={{ ...eyebrow, fontSize: 10.5, letterSpacing: "0.08em" }}>Your commitment</p>
        <p style={{ color: WARM, fontSize: 14, fontFamily: FONT, lineHeight: 1.45, margin: "6px 0 0" }}>{lines.join(" · ")}</p>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => setLocation("/rule-of-life")}
        style={{ marginTop: 18, background: "none", border: "none", padding: 0, color: "rgba(168,197,160,0.95)", fontSize: 14, fontFamily: FONT, textDecoration: "underline", cursor: "pointer", textAlign: "left" }}
      >
        Set your {def(key).title} practice →
      </button>
    );
  };

  let body: ReactNode = null;
  if (slide.kind === "intro") {
    body = (
      <>
        <p style={eyebrow}>A new week</p>
        <h1 style={{ color: WARM, fontSize: 28, fontWeight: 600, fontFamily: FONT, margin: "12px 0 0" }}>{weekRange}</h1>
        <p style={{ color: SAGE, fontSize: 15.5, fontFamily: FONT, fontStyle: "italic", lineHeight: 1.55, margin: "12px 0 0" }}>
          The weekly practices reset. Look back on the week that was, and set the one ahead.
        </p>
        <div style={{ marginTop: 24, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "14px 16px" }}>
          <p style={{ color: WARM, fontSize: 15, fontWeight: 600, fontFamily: FONT, margin: 0 }}>
            {lastKept.length > 0 ? `Last week you kept ${lastKept.length} of ${WEEKLY_KEYS.length}.` : "A fresh start this week."}
          </p>
          {lastKept.length > 0 && (
            <p style={{ color: SAGE, fontSize: 13, fontFamily: FONT, margin: "4px 0 0" }}>
              {lastKept.map((k) => def(k).title.split(" ")[0]).join(", ")}.
            </p>
          )}
        </div>
      </>
    );
  } else if (slide.kind === "anchor") {
    body = (
      <>
        <p style={eyebrow}>{def(slide.key).title}</p>
        <span style={{ fontSize: 40, marginTop: 10 }} aria-hidden>{def(slide.key).emoji}</span>
        <h1 style={{ color: WARM, fontSize: 26, fontWeight: 600, fontFamily: FONT, margin: "8px 0 0" }}>{def(slide.key).title}</h1>
        <p style={{ color: SAGE, fontSize: 15, fontFamily: FONT, fontStyle: "italic", lineHeight: 1.55, margin: "8px 0 0" }}>{def(slide.key).definition}</p>
        <p style={{ color: WARM, fontSize: 16, fontFamily: FONT, fontStyle: "italic", lineHeight: 1.6, margin: "22px 0 0" }}>{QUESTION[slide.key]}</p>
      </>
    );
  } else if (slide.kind === "lookback") {
    const kept = doneLastWeek(slide.key);
    const wk = weeksKept(slide.key);
    body = (
      <>
        <p style={eyebrow}>{def(slide.key).title} · last week</p>
        <h1 style={{ color: WARM, fontSize: 24, fontWeight: 600, fontFamily: FONT, margin: "10px 0 0" }}>
          {kept ? "You kept it." : "Not last week."}
        </h1>
        <p style={{ color: SAGE, fontSize: 14.5, fontFamily: FONT, lineHeight: 1.55, margin: "8px 0 0" }}>
          {kept ? "Carried through. " : "A new week is a clean page. "}
          {wk > 0 ? `🌱 Kept ${wk} week${wk === 1 ? "" : "s"} running.` : ""}
        </p>
        {commitCard(slide.key)}
      </>
    );
  } else if (slide.kind === "set") {
    if (slide.key === "bless") {
      body = (
        <>
          <p style={eyebrow}>Bless · this week</p>
          <h1 style={{ color: WARM, fontSize: 24, fontWeight: 600, fontFamily: FONT, margin: "10px 0 10px" }}>Set this week's intentions</h1>
          <BlessSubScreen weekStart={thisWeekStart} today={today} />
        </>
      );
    } else {
      body = (
        <>
          <p style={eyebrow}>{def(slide.key).title} · this week</p>
          <h1 style={{ color: WARM, fontSize: 24, fontWeight: 600, fontFamily: FONT, margin: "10px 0 0" }}>Carry it into this week</h1>
          {commitmentLines(def(slide.key), selections).length > 0 && (
            <p style={{ color: SAGE, fontSize: 14.5, fontFamily: FONT, lineHeight: 1.5, margin: "8px 0 0" }}>
              {commitmentLines(def(slide.key), selections).join(" · ")}
            </p>
          )}
          <p style={{ color: SAGE, fontSize: 14.5, fontFamily: FONT, fontStyle: "italic", lineHeight: 1.55, margin: "14px 0 0" }}>{SET_PROMPT[slide.key]}</p>
          <button
            type="button"
            onClick={() => setLocation("/this-week")}
            style={{ marginTop: 18, alignSelf: "flex-start", background: CARD, border: `1px solid ${CARD_B}`, color: SAGE, borderRadius: 999, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
          >
            Adjust on This Week →
          </button>
        </>
      );
    }
  } else {
    body = (
      <>
        <p style={eyebrow}>Your week, set</p>
        <p style={{ color: WARM, fontSize: 17, fontFamily: FONT, fontStyle: "italic", lineHeight: 1.7, margin: "16px 0 0" }}>
          With God's help, I will keep these this week — gathering, blessing, going beyond myself, and resting in grace. A beginning, not a finish line.
        </p>
        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 8 }}>
          {WEEKLY_KEYS.map((k) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 17 }} aria-hidden>{def(k).emoji}</span>
              <span style={{ color: WARM, fontSize: 14.5, fontFamily: FONT }}>{def(k).title}</span>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <Layout>
      <div style={{ flex: 1, minHeight: 0, background: BG, position: "relative", display: "flex", flexDirection: "column" }}>
        <AnimatedBackground base={BG} variant="subtle" fadeTop />
        <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", padding: "16px 20px 40px", maxWidth: 480, margin: "0 auto", width: "100%" }}>
          <button onClick={back} style={{ background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", padding: "6px 0", display: "flex", alignItems: "center", gap: 6 }}>
            <ChevronLeft size={18} /> <span style={{ fontSize: 14, fontFamily: FONT }}>Back</span>
          </button>
          <div style={{ height: 3, background: CARD_B, borderRadius: 2, overflow: "hidden", margin: "6px 0 18px" }}>
            <div style={{ width: `${progressPct}%`, height: "100%", background: SAGE, transition: "width 0.3s ease" }} />
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              style={{ flex: 1, display: "flex", flexDirection: "column" }}
            >
              {body}
            </motion.div>
          </AnimatePresence>

          <button
            onClick={() => (isLast ? finishMut.mutate() : next())}
            disabled={finishMut.isPending}
            style={{ marginTop: 20, background: CTA, border: `1px solid ${CHIP_B}`, color: WARM, borderRadius: 12, padding: "14px 20px", fontSize: 16, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
          >
            {isLast ? (finishMut.isPending ? "Setting your week…" : "Begin the week →") : "Continue"}
          </button>
        </div>
      </div>
    </Layout>
  );
}
