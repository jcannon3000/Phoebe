import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  questionsFor, EMPTY_ANSWERS, recommend, applyRhythm,
  type FinderAnswers, type RecommendedRhythm,
} from "@/lib/rhythmFinder";
import { useAuth } from "@/hooks/useAuth";
import { isDeviceLocalGuest } from "@/lib/guestFlag";
import { markFinderSkip, clearFinderSkip, firstRunPending, skipFirstRun } from "@/lib/finderEntry";

// Find Your Rhythm — three questions, then two follow-ups chosen from the
// answers, that recommend a rule of life and, on a tap, write it into the same
// settings the customizers use. It is the OPENING of Shape your rhythm (owner,
// 2026-10-01: "Lets have it start with three questions" · "Then ask two follow
// ups based on that"); lib/finderEntry is how the flow sends people here.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.6)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, serif";
const GROUND = "radial-gradient(120% 90% at 50% 12%, #143524 0%, #0C2417 60%, #081A11 100%)";
const CARD = "rgba(255,255,255,0.04)";
const CARD_B = "rgba(255,255,255,0.10)";
const CARD_ON = "rgba(46,107,64,0.34)";
const CARD_ON_B = "rgba(110,180,130,0.55)";

const toggle = (arr: string[], x: string) => arr.includes(x) ? arr.filter((v) => v !== x) : [...arr, x];

const PRAYER_LABEL: Record<RecommendedRhythm["prayer"], string> = {
  "guided-prayer": "Simple Guided Prayer", office: "the Daily Office", readings: "the day's Scripture readings", contemplation: "silent Contemplation",
};
const EXTRA_LINE: Record<RecommendedRhythm["extras"][number], string> = {
  examen: "The Examen, to notice God in your day.",
  listening: "Audio Divina — music as a way of prayer.",
  cobreathe: "Breathing Together, a few breaths with all creation.",
  lectio: "Lectio Divina, to pray slowly with a reading.",
  walk: "A contemplative walk.",
};
const SOURCE_LABEL: Record<"cac" | "nouwen" | "taizeprayer", string> = {
  cac: "CAC Daily Meditation", nouwen: "Nouwen Daily Devotion", taizeprayer: "Taizé Daily Prayer",
};

export default function FindYourRhythmPage() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const guest = !authLoading && isDeviceLocalGuest(user);
  // A device with no rhythm yet reached this from the home, before anything has
  // been set up. Read ONCE: applying the answers is what makes it false.
  const [firstRun] = useState(() => firstRunPending());
  // Opening the questions retires any earlier "I'll adjust it myself" — it was
  // for that one trip into the customizer, not for good.
  useEffect(() => { clearFinderSkip(); }, []);
  const [answers, setAnswers] = useState<FinderAnswers>(EMPTY_ANSWERS);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"questions" | "result">("questions");
  const [applying, setApplying] = useState(false);

  // Three openers, then — once they are answered — the two follow-ups they lead
  // to. Recomputed each render; an index only ever points at a question whose
  // predecessors are settled, so it stays valid as the list grows from 3 to 5.
  const visible = useMemo(() => questionsFor(answers), [answers]);
  const q = visible[Math.min(idx, visible.length - 1)];
  const total = visible.length;

  const rec = useMemo(() => recommend(answers), [answers]);

  const answered = (() => {
    if (!q) return false;
    const v = answers[q.id];
    return Array.isArray(v) ? v.length > 0 : !!v;
  })();

  // On the first open there is no page behind this one to go back to — the home
  // would just send them here again — so the first question's way out is Skip,
  // which hands them the standard routine instead.
  const back = () => {
    if (idx > 0) setIdx(idx - 1);
    else if (firstRun) { skipFirstRun(); navigate("/dashboard"); }
    else navigate("/");
  };
  const next = () => {
    if (idx < total - 1) setIdx(idx + 1);
    else setPhase("result");
  };

  const setMulti = (id: keyof FinderAnswers, optId: string) =>
    setAnswers((a) => ({ ...a, [id]: toggle(a[id] as string[], optId) }));
  const setSingle = (id: keyof FinderAnswers, optId: string) => {
    setAnswers((a) => ({ ...a, [id]: optId }));
    // gentle auto-advance for single-choice
    window.setTimeout(() => setIdx((i) => Math.min(i + 1, total - 1)), 220);
  };

  async function apply() {
    setApplying(true);
    await applyRhythm(rec, { guest }).catch(() => { /* best-effort */ });
    navigate("/");
  }

  /**
   * EDIT IT, STARTING FROM THIS (owner, 2026-10-01: "let them edit the routine
   * on the last slide, which they would go through the manual flow with the
   * recommendations as the starting place").
   *
   * The recommendation is WRITTEN FIRST, then the manual flow opens on it. The
   * flow seeds itself from what is saved — a person with a prayer on either
   * side opens it at the way-to-pray step with their choices already in place —
   * so there is nothing to hand across but the saved rhythm itself. The skip
   * note is belt and braces: it keeps the flow from sending them back here if
   * the save somehow left no side set.
   */
  async function editFromHere() {
    setApplying(true);
    await applyRhythm(rec, { guest }).catch(() => { /* best-effort */ });
    markFinderSkip();
    // A device with no account edits in the light customizer — the full flow
    // needs one — and it opens on the rhythm that was just saved.
    navigate(guest ? "/customize" : "/rule-of-life");
  }

  // ——— Result ———
  if (phase === "result") {
    const lines: string[] = [];
    lines.push(`Pray each ${rec.sides.evening ? "morning and evening" : "morning"} with ${PRAYER_LABEL[rec.prayer]}.`);
    // A SIT, not an allowance (lib/rhythmFinder's silenceMinutes is the length
    // of one session now, never a daily quota). "20 minutes of silence a day"
    // promised a total the rhythm no longer keeps.
    if (rec.silenceMinutes > 0) lines.push(`A sit of ${rec.silenceMinutes} minutes.`);
    if (rec.reflectionSource) lines.push(`A daily reflection — ${SOURCE_LABEL[rec.reflectionSource]}.`);
    if (rec.eveningLevel === "examen") lines.push("The Examen to close your day.");
    for (const x of rec.extras) lines.push(EXTRA_LINE[x]);

    return (
      <div className="fixed inset-0 z-[60] overflow-y-auto" style={{ background: GROUND, paddingTop: "calc(env(safe-area-inset-top) + 28px)", paddingBottom: "calc(env(safe-area-inset-bottom) + 28px)" }}>
        <div className="max-w-md mx-auto px-7">
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="uppercase tracking-[0.28em] text-[11px]" style={{ color: SAGE, fontFamily: FONT }}>
            Shaped for you
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="text-[26px] font-bold leading-tight mt-2" style={{ color: WARM, fontFamily: FONT }}>
            A rhythm of prayer, shaped from your answers
          </motion.h1>

          <div className="mt-6 rounded-2xl p-5" style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.22)" }}>
            {lines.map((l, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 + i * 0.06 }} className="flex gap-3 items-start" style={{ marginTop: i ? 12 : 0 }}>
                <span style={{ color: SAGE }} aria-hidden>✦</span>
                <p className="text-[15px] leading-snug" style={{ color: WARM, fontFamily: FONT }}>{l}</p>
              </motion.div>
            ))}
          </div>

          {rec.reasons.length > 0 && (
            <div className="mt-5">
              <p className="uppercase tracking-[0.2em] text-[10.5px] mb-2" style={{ color: SAGE_DIM, fontFamily: FONT }}>Why</p>
              {rec.reasons.map((r, i) => (
                <p key={i} className="text-[13.5px] leading-relaxed mb-2" style={{ color: "rgba(240,237,230,0.8)", fontFamily: SERIF, fontStyle: "italic" }}>{r}</p>
              ))}
            </div>
          )}

          <button
            onClick={apply}
            disabled={applying}
            className="w-full mt-7 py-4 rounded-2xl text-[16px] font-semibold active:scale-[0.98] transition-transform disabled:opacity-60"
            style={{ background: "rgba(46,107,64,0.92)", color: WARM, fontFamily: FONT }}
          >
            {applying ? "Setting it up…" : "Set this up for me"}
          </button>
          {/* A full button, not a link — editing is the other way to finish. */}
          <button
            onClick={editFromHere}
            disabled={applying}
            className="w-full mt-3 py-4 rounded-2xl text-[16px] font-semibold active:scale-[0.98] transition-transform disabled:opacity-60"
            style={{ background: "transparent", color: WARM, border: `1px solid ${CARD_ON_B}`, fontFamily: FONT }}
          >
            Edit my routine
          </button>

          <button onClick={() => { setPhase("questions"); setIdx(0); }} className="w-full mt-5 py-2 text-[12.5px]" style={{ color: SAGE_DIM, fontFamily: FONT }}>
            Start over
          </button>
        </div>
      </div>
    );
  }

  // ——— Questions ———
  if (!q) return null;
  const selected = answers[q.id];
  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: GROUND, paddingTop: "calc(env(safe-area-inset-top) + 16px)", paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}>
      {/* progress */}
      <div className="px-7">
        <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div style={{ width: `${((idx + 1) / total) * 100}%`, height: "100%", background: SAGE, transition: "width 0.3s ease" }} />
        </div>
        <button onClick={back} className="mt-3 text-[14px] inline-flex items-center gap-1.5" style={{ color: SAGE_DIM, fontFamily: FONT }}>
          ← <span>{idx === 0 ? (firstRun ? "Skip — use the standard routine" : "Close") : "Back"}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-7 pt-4">
        <AnimatePresence mode="wait">
          <motion.div key={q.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
            <p className="uppercase tracking-[0.26em] text-[11px]" style={{ color: SAGE, fontFamily: FONT }}>{q.eyebrow}</p>
            <h1 className="text-[23px] font-bold leading-tight mt-2" style={{ color: WARM, fontFamily: FONT }}>{q.prompt}</h1>
            {q.sub && <p className="text-[13.5px] mt-2 leading-snug" style={{ color: SAGE, fontFamily: FONT }}>{q.sub}</p>}

            <div className="mt-6 flex flex-col gap-2.5">
              {
                q.options.map((opt) => {
                  const on = q.kind === "multi" ? (selected as string[]).includes(opt.id) : selected === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => q.kind === "multi" ? setMulti(q.id, opt.id) : setSingle(q.id, opt.id)}
                      className="w-full flex items-start gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors active:scale-[0.99]"
                      style={{ background: on ? CARD_ON : CARD, border: `1px solid ${on ? CARD_ON_B : CARD_B}` }}
                    >
                      <span className="text-[20px] leading-none flex-shrink-0 mt-0.5" aria-hidden>{opt.emoji}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-medium" style={{ color: WARM, fontFamily: FONT }}>{opt.label}</span>
                        {opt.sub && <span className="block text-[12.5px] mt-0.5" style={{ color: SAGE, fontFamily: FONT }}>{opt.sub}</span>}
                      </span>
                      {on && <span style={{ color: SAGE }} aria-hidden>✓</span>}
                    </button>
                  );
                })
              }
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="px-7 pt-3">
        <button
          onClick={next}
          disabled={!answered}
          className="w-full py-4 rounded-2xl text-[16px] font-semibold active:scale-[0.98] transition-transform disabled:opacity-40"
          style={{ background: "rgba(46,107,64,0.92)", color: WARM, fontFamily: FONT }}
        >
          {idx === total - 1 ? "See my rhythm" : "Continue"}
        </button>
      </div>
    </div>
  );
}
