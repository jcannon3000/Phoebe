import { useMemo, useState, type CSSProperties } from "react";
import { useLocation, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useRhythmState } from "@/hooks/useRhythmState";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { pickWideBackground } from "@/lib/wideBackgrounds";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { playOpeningSwell } from "@/lib/amenFeedback";

// Novena preview — a slideshow, same shell as novena.tsx's reading deck (and
// guided-prayer/the Examen): title, then one slide per piece of context
// (History, Intention, Source), then a closing slide that starts the flow.
// Tapping Begin there moves to a final "options" slide — replace-vs-addition,
// with addition presented first/primary — instead of a separate popup.

const FONT = "'Space Grotesk', sans-serif";
const BG = "#0C1F12";
const WARM = "#F0EDE6";
const EYEBROW = "rgba(143,175,150,0.75)";
const SAGE = "#8FAF96";
const ACCENT = "rgba(143,175,150,0.5)";
const DOT_ON = "#8FAF96";
const DOT_OFF = "rgba(143,175,150,0.3)";
const FAINT = "rgba(143,175,150,0.6)";
const CARD_BG = "rgba(9,26,16, 0.4)";
const CARD_BORDER = "rgba(46,107,64,0.4)";
const PILL: CSSProperties = {
  background: "rgba(9,26,16,0.42)",
  backdropFilter: "blur(11px)",
  WebkitBackdropFilter: "blur(11px)",
  border: `1px solid ${ACCENT}`,
  color: WARM,
  fontFamily: FONT,
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};

type Novena = {
  id: number; title: string; saint: string | null; sourceNote: string | null; dayCount: number;
  history: string | null; intention: string | null; isCurrent: boolean; lastCompletedAt: string | null;
};
// After the fixed slides, "options" is the replace-vs-addition choice,
// "slot" is the morning/evening sub-choice, "added" is the confirmation.
type Stage = "deck" | "options" | "slot" | "added";

export default function NovenaDetailPage() {
  const params = useParams<{ id: string }>();
  const novenaId = Number(params.id);
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { novena: activeNovena, morningActive, eveningActive } = useRhythmState();
  const backdropPhoto = useMemo(() => pickWideBackground() ?? (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  const { data } = useQuery<{ novenas: Novena[] }>({
    queryKey: ["/api/novenas"],
    queryFn: () => apiRequest("GET", "/api/novenas"),
  });
  const novena = (data?.novenas ?? []).find((n) => n.id === novenaId) ?? null;
  const isCurrent = activeNovena?.novenaId === novenaId;
  const otherActive = activeNovena && !isCurrent;
  const bothSidesOn = morningActive && eveningActive;

  const [step, setStep] = useState(0);
  const [stage, setStage] = useState<Stage>("deck");

  const start = useMutation({
    mutationFn: (replacesSlot: "morning" | "evening" | null) =>
      apiRequest("POST", `/api/novenas/${novenaId}/start`, { confirmSwitch: true, replacesSlot }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/me/novena"] });
      qc.invalidateQueries({ queryKey: ["/api/novenas"] });
      setStage("added");
    },
  });

  if (!novena) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, color: WARM, fontFamily: FONT }} className="flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p style={{ color: EYEBROW }}>Loading…</p>
      </div>
    );
  }

  // The fixed slides — title, then only the pieces this novena actually has,
  // then the closing slide with the primary action.
  type Slide = { kind: "title" } | { kind: "history"; text: string } | { kind: "intention"; text: string } | { kind: "source"; text: string } | { kind: "close" };
  const slides: Slide[] = [
    { kind: "title" },
    ...(novena.history ? [{ kind: "history" as const, text: novena.history }] : []),
    ...(novena.intention ? [{ kind: "intention" as const, text: novena.intention }] : []),
    ...(novena.sourceNote ? [{ kind: "source" as const, text: novena.sourceNote }] : []),
    { kind: "close" },
  ];
  const slide = slides[step]!;
  const isFirst = step === 0;
  const isLast = step === slides.length - 1;

  function next() {
    if (isLast) {
      if (isCurrent) { setLocation("/novena"); return; }
      setStage("options");
      return;
    }
    setStep((s) => s + 1);
    if (step === 0) { try { playOpeningSwell(); } catch { /* non-fatal */ } }
  }
  function back() {
    if (step === 0) { setLocation("/novena-library"); return; }
    setStep((s) => s - 1);
  }

  function chooseAddition() {
    start.mutate(null);
  }
  function chooseReplace() {
    if (bothSidesOn) { setStage("slot"); return; }
    start.mutate(morningActive ? "morning" : eveningActive ? "evening" : null);
  }

  const primaryLabel = isLast ? (isCurrent ? "Continue" : "Begin") : "Continue";

  return (
    <div className="relative" style={{ minHeight: "100dvh", background: BG, color: WARM, fontFamily: FONT, isolation: "isolate", overflow: "hidden" }}>
      {backdropPhoto ? (
        <>
          <motion.img
            src={backdropPhoto}
            alt=""
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.22 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: -1 }}
          />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,22,15,0.62) 0%, rgba(8,22,15,0.80) 52%, rgba(8,22,15,0.90) 100%)" }} />
        </>
      ) : (
        <AnimatedBackground base={BG} variant="subtle" />
      )}

      <header
        className="px-5 pb-2 flex items-center justify-between"
        style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 2, paddingTop: "max(1.25rem, calc(var(--safe-top) + 0.5rem))" }}
      >
        <button
          type="button"
          onClick={() => (stage === "deck" ? back() : setStage(stage === "slot" ? "options" : "deck"))}
          style={{ color: EYEBROW, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FONT, fontSize: 13 }}
        >
          Back
        </button>
      </header>

      <main
        className="flex flex-col items-center text-center px-6 w-full"
        style={{
          maxWidth: 560, margin: "0 auto", minHeight: "100dvh", justifyContent: "center",
          paddingTop: "clamp(24px, 6dvh, 72px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 168px)",
          position: "relative", zIndex: 1,
        }}
      >
        <AnimatePresence mode="wait">
          {stage === "deck" && (
            <motion.div
              key={`slide-${step}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ maxWidth: 480, textAlign: "center" }}
            >
              {slide.kind === "title" && (
                <>
                  <p style={{ color: EYEBROW, fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 16 }}>
                    {novena.dayCount}-Day Novena{novena.saint ? ` · ${novena.saint}` : ""}
                  </p>
                  <h1 style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(24px, 6.2vw, 34px)", lineHeight: 1.2, letterSpacing: "-0.01em" }}>
                    {novena.title}
                  </h1>
                  {isCurrent && (
                    <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13, marginTop: 14 }}>
                      Day {activeNovena!.currentDay} of {activeNovena!.dayCount} · already in your routine
                    </p>
                  )}
                  {!isCurrent && novena.lastCompletedAt && (
                    <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13, marginTop: 14 }}>
                      Last completed {new Date(novena.lastCompletedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  )}
                </>
              )}
              {(slide.kind === "history" || slide.kind === "intention" || slide.kind === "source") && (
                <>
                  <p style={{ color: EYEBROW, fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 16 }}>
                    {slide.kind === "history" ? "History" : slide.kind === "intention" ? "Intention" : "Source"}
                  </p>
                  <p style={{ color: "rgba(240,237,230,0.9)", margin: 0, fontFamily: FONT, fontSize: "clamp(18px, 4.8vw, 23px)", lineHeight: 1.55, whiteSpace: "pre-line" }}>
                    {slide.text}
                  </p>
                </>
              )}
              {slide.kind === "close" && (
                <>
                  <p style={{ fontSize: 36, marginBottom: 16 }} aria-hidden>🕊️</p>
                  <p style={{ color: "rgba(240,237,230,0.9)", margin: 0, fontFamily: FONT, fontSize: "clamp(18px, 4.8vw, 23px)", lineHeight: 1.55 }}>
                    One day rides in your daily routine at a time — it only advances when you mark that day complete, never automatically by the calendar. You can stop at any point.
                  </p>
                </>
              )}
            </motion.div>
          )}

          {stage === "options" && (
            <motion.div
              key="options"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ maxWidth: 480, width: "100%" }}
            >
              {otherActive && (
                <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: "10px 14px", marginBottom: 18 }}>
                  <p style={{ fontSize: 12.5, color: SAGE, margin: 0, lineHeight: 1.5 }}>
                    This will stop <strong style={{ color: WARM }}>{activeNovena!.title}</strong>, currently in your routine.
                  </p>
                </div>
              )}
              <p style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(18px, 4.6vw, 22px)", lineHeight: 1.3, marginBottom: 10 }}>
                Add this as another practice in your routine for the next nine days?
              </p>
              <p style={{ fontSize: 13.5, color: SAGE, marginBottom: 24, lineHeight: 1.55 }}>
                It rides alongside your routine as its own card. If you'd rather it take over morning or evening prayer instead — what you normally pray there returns once the novena ends — choose that below.
              </p>
              <div className="flex flex-col gap-2.5">
                <button type="button" onClick={chooseAddition} disabled={start.isPending}
                  className="rounded-full py-3 px-6 disabled:opacity-60"
                  style={{ background: "#2D5E3F", color: WARM, fontFamily: FONT, fontSize: 14.5, fontWeight: 700, border: "none", cursor: "pointer" }}>
                  Add to my routine
                </button>
                <button type="button" onClick={chooseReplace} disabled={start.isPending}
                  className="rounded-full py-3 px-6 disabled:opacity-60"
                  style={{ background: "transparent", color: WARM, fontFamily: FONT, fontSize: 14.5, fontWeight: 700, border: `1px solid ${SAGE}`, cursor: "pointer" }}>
                  Replace morning or evening prayer instead
                </button>
              </div>
            </motion.div>
          )}

          {stage === "slot" && (
            <motion.div
              key="slot"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ maxWidth: 480, width: "100%" }}
            >
              <p style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(18px, 4.6vw, 22px)", marginBottom: 20 }}>
                Which prayer should it replace?
              </p>
              <div className="flex flex-col gap-2.5">
                <button type="button" onClick={() => start.mutate("morning")} disabled={start.isPending}
                  className="rounded-full py-3 px-6 disabled:opacity-60"
                  style={{ background: "#2D5E3F", color: WARM, fontFamily: FONT, fontSize: 14.5, fontWeight: 700, border: "none", cursor: "pointer" }}>
                  Morning prayer
                </button>
                <button type="button" onClick={() => start.mutate("evening")} disabled={start.isPending}
                  className="rounded-full py-3 px-6 disabled:opacity-60"
                  style={{ background: "#2D5E3F", color: WARM, fontFamily: FONT, fontSize: 14.5, fontWeight: 700, border: "none", cursor: "pointer" }}>
                  Evening prayer
                </button>
              </div>
            </motion.div>
          )}

          {stage === "added" && (
            <motion.div
              key="added"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ maxWidth: 480, textAlign: "center" }}
            >
              <p style={{ fontSize: 40, marginBottom: 16 }} aria-hidden>✓</p>
              <h2 style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(20px, 5vw, 26px)", marginBottom: 10 }}>
                Added to your routine
              </h2>
              <p style={{ color: SAGE, fontFamily: FONT, fontSize: 14, lineHeight: 1.55 }}>
                {novena.title} now shows as a card on your home screen.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <div className="absolute left-0 right-0 flex flex-col items-center" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)", zIndex: 2 }}>
        {stage === "deck" && (
          <div className="flex items-center justify-center gap-1.5" style={{ marginBottom: 16 }}>
            {slides.map((_, i) => (
              <span key={i} className="block rounded-full" style={{ width: 6, height: 6, background: i <= step ? DOT_ON : DOT_OFF }} />
            ))}
          </div>
        )}
        {stage === "deck" && (
          <button type="button" onClick={next} className="rounded-full py-3 px-12 transition-opacity hover:opacity-90 active:scale-[0.99]" style={PILL}>
            {primaryLabel}
          </button>
        )}
        {stage === "options" && (
          <button type="button" onClick={() => setStage("deck")} style={{ color: FAINT, background: "none", border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 12.5 }}>
            Cancel
          </button>
        )}
        {stage === "added" && (
          <button type="button" onClick={() => setLocation("/dashboard")} className="rounded-full py-3 px-12 transition-opacity hover:opacity-90 active:scale-[0.99]" style={PILL}>
            Go to home
          </button>
        )}
      </div>
    </div>
  );
}
