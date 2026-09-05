import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { openExternal, openOfficeReading, hasNativeBrowser } from "@/lib/openExternal";
import { X } from "lucide-react";
import { AnimatedBackground } from "@/components/AnimatedBackground";

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

/**
 * PROMPT, THEN THE TEXT — three of each, then the closing reflection.
 *
 * Owner, in three passes, and the last one settles it: "it needs to start with
 * the first prompt, then show the text the first time. Second prompt show the
 * text the second time. Third prompt show the text third time, and then the
 * closing reflection" … "there should be three prompts and text slides".
 *
 * So a round is PROMPT then TEXT, and both are beats the counter names: seven
 * in all. What went away is the TITLE card — the slide that announced a
 * reading you were about to be shown, saying nothing the prompt hadn't said.
 * A text beat IS the passage: on native it opens the reader with this deck's
 * own bottom pill over it (see onNext), and on web, which has no chrome to
 * build over someone else's tab, it is a single line and the button that
 * opens it.
 */
const PICK = 0;
const PROMPT1 = 1, TEXT1 = 2, PROMPT2 = 3, TEXT2 = 4, PROMPT3 = 5, TEXT3 = 6, CLOSE = 7;
const LAST = CLOSE;
const PROMPT_STEPS = [PROMPT1, PROMPT2, PROMPT3];
const TEXT_STEPS = [TEXT1, TEXT2, TEXT3];
/** Which round (0-2) a prompt or text beat belongs to. */
function roundOf(step: number): number {
  const i = PROMPT_STEPS.indexOf(step);
  if (i >= 0) return i;
  const t = TEXT_STEPS.indexOf(step);
  return t >= 0 ? t : 0;
}

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
    // Picking seats the first READ slide — nothing opens yet. The passage
    // opens from that slide's own Next, the way a lesson does in the office.
    guardedAdvance(() => { setChosen(o); setStep(PROMPT1); });
  };

  // "← Back" (top-left) returns to wherever this was opened from — the
  // Practices menu, usually — while ✕ goes home. Falls back to home when
  // Lectio is the first thing in the session (deep link, cold start), where
  // history.back() would leave the webview with nowhere to go.
  const leave = () => {
    if (window.history.length > 1) window.history.back();
    else setLocation("/dashboard");
  };

  const finish = () => {
    markPracticeDoneToday("lectio");
    setLocation("/dashboard");
  };

  /**
   * Open the passage for one beat — the reader with this deck's own bottom
   * pill over it on native (openOfficeReading reports its taps back as
   * phoebe:office-{prev,next}-slide), a plain tab on web, where there is no
   * chrome to build over someone else's page.
   */
  const openPassage = (n: number) => {
    if (!chosen) return;
    if (hasNativeBrowser()) {
      openOfficeReading(chosen.readUrl, {
        officeTitle: "Lectio Divina",
        // "N of M" only — the native pill appends sectionLabel itself, so
        // passing it here too read "2 OF 7 · READ · READ" (audit 2026-09-04).
        slideLabel: `${n} of ${LAST}`,
        sectionLabel: sectionLabelFor(n),
      });
      return;
    }
    void openExternal(chosen.readUrl);
  };

  const onNext = () => guardedAdvance(() => {
    if (step === LAST) { finish(); return; }
    // The passage opens on ARRIVAL now (see openedForStepRef), so Next from a
    // text beat simply moves on — the reader's own pill does the same thing
    // from over the page.
    setStep((s) => (s < LAST ? s + 1 : s));
  });

  /**
   * THE TEXT BEAT OPENS ITSELF (owner, in capitals: "THERE SHOULD BE NO TITLE
   * SLIDES FOR THE READINGS").
   *
   * It had one: arriving at a text beat showed "GOSPEL · SECOND READING /
   * John 9:18-41" and waited for another Next. That is the title card again,
   * wearing the counter's clothes. Landing on the beat now opens the passage
   * itself; the slide underneath is only what a person sees if they dismiss
   * the reader, and it offers the way back in rather than announcing
   * anything.
   *
   * Keyed by step so it fires ONCE per arrival — not on every re-render, and
   * not again when the reader closes and this deck re-renders underneath.
   */
  const openedForStepRef = useRef<number | null>(null);
  useEffect(() => {
    // Cleared on every non-text beat, so ARRIVING at a text beat always opens
    // the passage — including arriving backwards from the next prompt. The ref
    // only stops a second open at the SAME beat, which is what would otherwise
    // trap someone who just closed the reader with the X.
    if (!TEXT_STEPS.includes(step)) { openedForStepRef.current = null; return; }
    if (!chosen) return;
    if (openedForStepRef.current === step) return;
    openedForStepRef.current = step;
    openPassage(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, chosen]);

  /**
   * THE READER'S OWN PILL, stepping this deck.
   *
   * The native browser reports its floating Back/Next as
   * phoebe:office-{prev,next}-slide once it has dismissed — the same events
   * the office listens for (bcp-daily-office.tsx). Read through a ref rather
   * than closing over prev/onNext directly: this effect is mount-only, and by
   * the time a tap arrives the deck has usually moved on from the slide the
   * handlers were created on.
   *
   * Next here moves the index and NOTHING else — it must not run onNext, whose
   * arrival effect would open the passage we are stepping out of.
   */
  const readerNavRef = useRef({ prev: () => {}, next: () => {} });
  readerNavRef.current = {
    prev,
    next: () => setStep((n) => (n < LAST ? n + 1 : n)),
  };
  useEffect(() => {
    const onPrev = () => readerNavRef.current.prev();
    const onNextSlide = () => readerNavRef.current.next();
    window.addEventListener("phoebe:office-prev-slide", onPrev);
    window.addEventListener("phoebe:office-next-slide", onNextSlide);
    return () => {
      window.removeEventListener("phoebe:office-prev-slide", onPrev);
      window.removeEventListener("phoebe:office-next-slide", onNextSlide);
    };
  }, []);

  // "3 of 7 · READ" — the same shape the office uses ("{slideIdx + 1} of
  // {slides.length} · {sectionLabel}"), so the two decks read alike. Taken as
  // a function of the step because the reader needs the label for the slide it
  // was opened FROM, which is not always the one being rendered.
  const sectionLabelFor = (n: number): string =>
    PROMPT_STEPS.includes(n) ? "Reflect"
      : TEXT_STEPS.includes(n) ? "Read"
        : n === CLOSE ? "Pray" : "";
  const sectionLabel = sectionLabelFor(step);
  const stepLabel = atStart ? null : `${step} of ${LAST} · ${sectionLabel}`;

  return (
    <div style={{ position: "fixed", inset: 0, background: DECK_BG, overflow: "hidden" }}>
      {/* Backdrop — the same either/or every other deck makes (listening:523,
          examen:172, visio:986): a photo with a darkening gradient when one
          is available, the app's drifting AnimatedBackground when not. The
          leaf pool is the owner's choice for this deck specifically, so it
          stays the first option; before this the else-branch was a flat
          #091A10, the one screen in the app with a dead-still ground. */}
      {deckBackdrop ? (
        <>
          <img src={deckBackdrop} alt="" aria-hidden style={{
            position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
            opacity: 0.16, filter: "saturate(0.7)",
          }} />
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(180deg, rgba(9,26,16,0.55) 0%, rgba(9,26,16,0.88) 100%)",
          }} />
        </>
      ) : (
        <AnimatedBackground base={DECK_BG} variant="subtle" fadeTop />
      )}
      {/* Top bar — ← Back / title pill / ✕ circle. The Daily Office's header
          (bcp-daily-office.tsx ~2887) carries the comment "Mirrors Lectio's
          header": it was copied from here, and this deck then drifted to a
          bare ✕ while the office kept the full shape. This is the original
          catching back up to its copy — same grid, same frosted pill, same
          38px circle — so the two decks read as one family again.
          The title pill is left off the chooser, whose h1 already says
          "Lectio Divina" a few lines below where the pill would sit. */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, pointerEvents: "none" }}>
        <div
          style={{
            maxWidth: 672, margin: "0 auto", width: "100%", padding: "max(1.5rem, env(safe-area-inset-top)) 20px 8px",
            boxSizing: "border-box",
            display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12,
            pointerEvents: "auto",
          }}
        >
          <button
            type="button"
            onClick={leave}
            style={{ color: DECK_FAINT, fontSize: 13, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: SPACE_GROTESK }}
          >
            ← Back
          </button>
          {!atStart ? (
            <span style={{
              borderRadius: 999,
              background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
              border: `1px solid ${DECK_BORDER}`, color: WARM,
              fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", padding: "6px 16px",
              fontFamily: SPACE_GROTESK, whiteSpace: "nowrap",
            }}>
              Lectio Divina
            </span>
          ) : <span />}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setLocation("/dashboard")}
              aria-label="Close"
              style={{ width: 38, height: 38, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: `1px solid ${DECK_BORDER}`, color: WARM, cursor: "pointer", padding: 0 }}
            >
              <X size={19} />
            </button>
          </div>
        </div>
      </header>
      {/* Top padding clears the fixed header so a tall chooser list never
          slides under it; the column itself is otherwise unchanged. */}
      <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", padding: "calc(env(safe-area-inset-top) + 76px) 20px calc(env(safe-area-inset-bottom) + 96px)" }}>

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

            {/* THE TEXT BEAT — no title card (owner). The passage opens on
                arrival; this is the fallback a person meets only if they
                dismissed the reader, so it offers the way back in rather than
                announcing a reading they have already been shown. */}
            {TEXT_STEPS.includes(step) && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); openPassage(step); }}
                style={{
                  background: "transparent", border: `1px solid ${DECK_BORDER}`, borderRadius: 999,
                  color: WARM, fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: 600,
                  padding: "12px 22px", cursor: "pointer",
                }}
              >
                {chosen ? `Read ${chosen.reference} →` : "Read the passage →"}
              </button>
            )}
            {PROMPT_STEPS.includes(step) && (
              <>
                <p style={{ color: DECK_FAINT, fontFamily: SPACE_GROTESK, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", margin: "0 0 14px" }}>
                  {chosen?.reference}
                </p>
                <p className="prompt-rise" style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 21, fontWeight: 500, lineHeight: 1.6, margin: 0 }}>
                  {PROMPTS[roundOf(step)]}
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
          Lectio" — this is what brings the two back in sync).
          HIDDEN ENTIRELY ON THE CHOOSER (owner: "back button at the bottom of
          the different options on the intro page — we need to get rid of
          that"). It used to render there disabled at 20% opacity, which is a
          dimmed control rather than no control: there is nothing to go back
          to from the first screen, and nothing to advance to until a reading
          is picked, so the whole bar has no work to do. */}
      {!atStart && <nav
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
            /* No `disabled`/dimming here any more: this bar only renders
               past the chooser (see the nav's own comment), so Back always has
               somewhere to go — back to the picker from the first read, and a
               beat at a time after that. */
            style={{
              color: WARM, background: "transparent", border: `1px solid ${DECK_BORDER}`,
              borderRadius: 999, padding: "6px 14px", fontSize: 12, fontFamily: SPACE_GROTESK,
              fontWeight: 600, cursor: "pointer",
            }}
          >
            Back
          </button>
          {stepLabel && (
            <p style={{ color: DECK_FAINT, fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0, whiteSpace: "nowrap", fontFamily: SPACE_GROTESK, flex: "0 0 auto" }}>
              {stepLabel}
            </p>
          )}
          {(
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
      </nav>}
    </div>
  );
}
