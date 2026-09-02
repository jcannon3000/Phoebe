import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { openExternal } from "@/lib/openExternal";

// Lectio Divina — sit with one of today's three lessons (Old Testament,
// New Testament, Gospel). Owner's corrected order: pick a lesson → the
// FIRST prompt comes up right away (nothing opened yet) → Next opens the
// passage AND brings up the second prompt → Next opens it again AND
// brings up the third prompt → Next opens it a final time AND brings up
// the closing "lift it up in prayer" slide. Three opens total, each
// following its own prompt rather than preceding it.
//
// READING THE PASSAGE FOLLOWS THE DAILY OFFICE'S OWN PRECEDENT, not a new
// pattern: bcp-daily-office.tsx's lessonReadUrl/next() removed the lesson
// slide's own "Read Online" button entirely — the SAME Next tap that
// advances the deck is what opens the passage. No separate "reading"
// slide, no pill.
//
// BOTTOM NAV mirrors that same deck's own pill exactly (its comment even
// says "Mirrors Lectio" — this brings the two back in sync): a single
// fixed, centered pill holding Back · step counter · Next/Done, not a
// full-width Continue button with a separate top-left back link.

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

  const atStart = step === PICK;
  const prev = () => { if (step > PICK) setStep((s) => s - 1); };

  // A ref, not state — must be readable/settable synchronously within the
  // SAME event so a second tap arriving before the next render (a fast
  // double-tap) is caught. Guards against opening the passage twice AND
  // skipping a prompt: setStep's updater is relative ("s + 1"), so two
  // calls in a row advance two steps, silently dropping whichever prompt
  // sat between them.
  const advancing = useRef(false);
  const guardedAdvance = (fn: () => void) => {
    if (advancing.current) return;
    advancing.current = true;
    fn();
    window.setTimeout(() => { advancing.current = false; }, 600);
  };

  const pickLesson = (o: LessonOption) => {
    // Picking just seats the first prompt — nothing opens yet. Reading
    // happens on the way OUT of each prompt, not on the way in.
    guardedAdvance(() => { setChosen(o); setStep(PROMPT1); });
  };

  const finish = () => {
    markPracticeDoneToday("lectio");
    setLocation("/dashboard");
  };

  const onNext = () => guardedAdvance(() => {
    if (step === LAST) { finish(); return; }
    // Every prompt (1, 2, and 3) opens the passage on its way to the next
    // beat — the third open lands on the closing slide, not on a fourth
    // prompt.
    if (chosen) void openExternal(chosen.readUrl);
    setStep((s) => (s < LAST ? s + 1 : s));
  });

  const stepLabel = atStart ? null : `${step} of ${LAST}`;

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
      <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", padding: "calc(env(safe-area-inset-top) + 18px) 20px calc(env(safe-area-inset-bottom) + 96px)" }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => setLocation("/dashboard")}
            aria-label="Close"
            style={{ background: "none", border: "none", color: DECK_FAINT, fontSize: 20, cursor: "pointer", padding: 6 }}
          >
            ✕
          </button>
        </div>

        {/* min-height: 0 + overflow-y: auto — a flex child otherwise refuses
            to shrink below its content's natural height (default min-height:
            auto), which on a short viewport pushes the bottom nav below the
            fold with nothing to scroll it back into view. Same trap
            eleanor-6e found in spirituals's own footer rework. */}
        <div style={{ flex: "1 1 0%", minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
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
                {/* A brief splash while today's readings resolve (owner) —
                    the deck's own chrome rather than a bare line of text,
                    so opening Lectio never flashes an empty picker. */}
                {isLoading && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "12px 0" }}>
                    <div className="lectio-spin" style={{
                      width: 28, height: 28, borderRadius: "50%",
                      border: `2px solid ${DECK_BORDER}`, borderTopColor: SAGE,
                    }} />
                    <p style={{ color: DECK_FAINT, fontFamily: SPACE_GROTESK, fontSize: 13 }}>Finding today's readings…</p>
                    <style>{"@keyframes lectio-spin { to { transform: rotate(360deg); } } .lectio-spin { animation: lectio-spin 0.8s linear infinite; }"}</style>
                  </div>
                )}
                {!isLoading && options.length === 0 && (
                  <p style={{ color: DECK_FAINT, fontFamily: SPACE_GROTESK, fontSize: 14 }}>No readings could be found for today.</p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {options.map((o) => (
                    <button
                      key={o.kind}
                      onClick={() => pickLesson(o)}
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
                <p style={{ color: DECK_FAINT, fontFamily: SPACE_GROTESK, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", margin: "0 0 14px" }}>
                  {chosen?.reference}
                </p>
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
      </div>

      {/* Bottom nav pill — Back · step counter · Next/Done. Matches the
          Daily Office's own bottom pill exactly (its own comment: "Mirrors
          Lectio" — this is what brings the two back in sync). */}
      <nav
        aria-label="Slide navigation"
        style={{
          position: "fixed", left: "50%", bottom: "calc(env(safe-area-inset-bottom) + 16px)",
          transform: "translateX(-50%)", zIndex: 50,
          background: "rgba(9,26,16, 0.462)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
          border: `1px solid ${DECK_BORDER}`, borderRadius: 999, padding: "8px 12px",
          boxShadow: "0 8px 28px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35)",
          maxWidth: "calc(100vw - 32px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
          <button
            type="button"
            onClick={prev}
            disabled={atStart}
            style={{
              color: WARM, background: "transparent", border: `1px solid ${DECK_BORDER}`,
              borderRadius: 999, padding: "6px 14px", fontSize: 12, fontFamily: SPACE_GROTESK,
              fontWeight: 600, cursor: atStart ? "default" : "pointer", opacity: atStart ? 0.2 : 1,
            }}
          >
            Back
          </button>
          {stepLabel && (
            <p style={{ color: DECK_FAINT, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0, whiteSpace: "nowrap", fontFamily: SPACE_GROTESK, flex: "0 0 auto" }}>
              {stepLabel}
            </p>
          )}
          {!atStart && (
            <button
              type="button"
              onClick={onNext}
              style={{
                background: "rgba(46,107,64,0.55)", color: WARM, border: "none",
                borderRadius: 999, padding: "6px 16px", fontSize: 12, fontFamily: SPACE_GROTESK,
                fontWeight: 600, letterSpacing: "0.02em", cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {step === LAST ? "Done" : "Next"}
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
