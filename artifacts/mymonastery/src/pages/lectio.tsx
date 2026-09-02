import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { openExternal } from "@/lib/openExternal";

// Lectio Divina — sit with one of today's three lessons (Old Testament,
// New Testament, Gospel), read three times, a different question held each
// time, closing with space to lift anything up in prayer. Deck chrome
// matches Visio/Audio Divina (owner: siblings, not a drawer).
//
// This app has no in-app Bible text outside the Psalms — a lesson is
// always a reference + an external read link (see api-server's
// assembleLesson.ts). So each round is: hold the question, tap out to
// actually read the passage, come back. The deck never claims to know
// whether you read it; like Audio Divina's "listen in the way that's best
// for you," the reading itself happens away from the screen.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const DECK_BG = "#091A10";
const DECK_FAINT = "rgba(143,175,150,0.55)";
const DECK_BORDER = "rgba(46,107,64,0.38)";
const FROST_CTA = {
  background: "rgba(9,26,16, 0.462)",
  backdropFilter: "blur(12.6px)",
  WebkitBackdropFilter: "blur(12.6px)",
  border: "1px solid rgba(200,212,192,0.28)",
} as const;

type LessonOption = { kind: "oldTestament" | "newTestament" | "gospel"; reference: string; readUrl: string };
const KIND_LABEL: Record<LessonOption["kind"], string> = {
  oldTestament: "Old Testament",
  newTestament: "New Testament",
  gospel: "Gospel",
};

const PROMPTS = [
  "As you read the passage for the first time, pay attention to any word or phrase that might be touching your heart.",
  "As you return to this passage a second time, consider how God may be speaking to you in this moment.",
  "As you return to the reading a final time, consider what God may be calling you to do through the reading.",
];

const PICK = 0, PROMPT1 = 1, PROMPT2 = 2, PROMPT3 = 3, CLOSE = 4;
const LAST = CLOSE;

export default function LectioPage() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(PICK);
  const [chosen, setChosen] = useState<LessonOption | null>(null);
  // Leaf backgrounds specifically (owner) — not the general wide-background
  // pool, which can surface unrelated photos.
  const deckBackdrop = useMemo(
    () => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );

  const { data, isLoading } = useQuery<{ date: string | null; options: LessonOption[] }>({
    queryKey: ["/api/lectio/today"],
    queryFn: () => apiRequest("GET", "/api/lectio/today") as Promise<{ date: string | null; options: LessonOption[] }>,
  });
  const options = data?.options ?? [];

  const next = () => { if (step < LAST) setStep((s) => s + 1); };
  const prev = () => { if (step > PICK) setStep((s) => s - 1); };

  const openPassage = () => { if (chosen) void openExternal(chosen.readUrl); };

  const finish = () => {
    markPracticeDoneToday("lectio");
    setLocation("/dashboard");
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: DECK_BG, overflow: "hidden" }}>
      {deckBackdrop && (
        <img src={deckBackdrop} alt="" aria-hidden style={{
          position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
          opacity: 0.16, filter: "saturate(0.7)",
        }} />
      )}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(180deg, rgba(9,26,16,0.55) 0%, rgba(9,26,16,0.88) 100%)",
      }} />
      <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", padding: "calc(env(safe-area-inset-top) + 18px) 20px calc(env(safe-area-inset-bottom) + 20px)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            onClick={() => { if (step === PICK) setLocation("/dashboard"); else prev(); }}
            style={{ userSelect: "none", WebkitTapHighlightColor: "transparent", background: "none", border: "none", color: SAGE, fontFamily: SPACE_GROTESK, fontSize: 14, cursor: "pointer", padding: 6 }}
          >
            {step === PICK ? "← Dashboard" : "← Back"}
          </button>
          <button
            onClick={() => setLocation("/dashboard")}
            aria-label="Close"
            style={{ background: "none", border: "none", color: DECK_FAINT, fontSize: 20, cursor: "pointer", padding: 6 }}
          >
            ✕
          </button>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            style={{ width: "100%", maxWidth: 480 }}
          >
            {step === PICK && (
              <>
                <h1 className="prompt-rise" style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.25, margin: "0 0 10px" }}>
                  Lectio Divina
                </h1>
                <p style={{ color: SAGE, fontFamily: SPACE_GROTESK, fontSize: 16, lineHeight: 1.6, margin: "0 0 24px" }}>
                  Meditate on today's readings.
                </p>
                {isLoading && (
                  <p style={{ color: DECK_FAINT, fontFamily: SPACE_GROTESK, fontSize: 14 }}>Loading today's readings…</p>
                )}
                {!isLoading && options.length === 0 && (
                  <p style={{ color: DECK_FAINT, fontFamily: SPACE_GROTESK, fontSize: 14 }}>No readings could be found for today.</p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {options.map((o) => (
                    <button
                      key={o.kind}
                      onClick={() => { setChosen(o); next(); }}
                      style={{
                        userSelect: "none", WebkitTapHighlightColor: "transparent",
                        display: "block", width: "100%", boxSizing: "border-box",
                        textAlign: "left", borderRadius: 999, padding: "14px 20px",
                        fontFamily: SPACE_GROTESK, cursor: "pointer",
                        ...FROST_CTA, border: `1px solid ${DECK_BORDER}`,
                      }}
                    >
                      <span style={{ display: "block", color: DECK_FAINT, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 4 }}>
                        {KIND_LABEL[o.kind]}
                      </span>
                      <span style={{ display: "block", color: WARM, fontSize: 16, fontWeight: 600 }}>{o.reference}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {(step === PROMPT1 || step === PROMPT2 || step === PROMPT3) && (
              <>
                {/* The reference itself is the way out to the passage — a
                    separate "Read the passage" button next to Continue read
                    as two competing actions on the same slide (owner). */}
                <button
                  onClick={openPassage}
                  style={{
                    userSelect: "none", WebkitTapHighlightColor: "transparent",
                    background: "none", border: "none", cursor: "pointer", padding: 0,
                    color: DECK_FAINT, fontFamily: SPACE_GROTESK, fontSize: 10.5,
                    letterSpacing: "0.16em", textTransform: "uppercase", margin: "0 0 14px",
                    textDecoration: "underline", textUnderlineOffset: 3,
                  }}
                >
                  {chosen?.reference} →
                </button>
                <p className="prompt-rise" style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 21, fontWeight: 500, lineHeight: 1.6, margin: 0 }}>
                  {PROMPTS[step - PROMPT1]}
                </p>
              </>
            )}

            {step === CLOSE && (
              <p className="prompt-rise" style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 21, fontWeight: 500, lineHeight: 1.6, margin: 0 }}>
                Take time to lift anything on your heart up to God in prayer.
              </p>
            )}
          </motion.div>
        </div>

        {step !== PICK && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <button
              onClick={step === LAST ? finish : next}
              style={{
                userSelect: "none", WebkitTapHighlightColor: "transparent",
                width: "100%", maxWidth: 420, borderRadius: 999, padding: "14px 20px",
                fontSize: 16, fontWeight: 600, fontFamily: SPACE_GROTESK, cursor: "pointer",
                background: "rgba(46,107,64,0.55)", border: `1px solid ${DECK_BORDER}`, color: WARM,
              }}
            >
              {step === LAST ? "Done" : "Continue"}
            </button>
            <span style={{ color: DECK_FAINT, fontFamily: SPACE_GROTESK, fontSize: 11, letterSpacing: "0.12em" }}>
              {step} / {LAST}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
