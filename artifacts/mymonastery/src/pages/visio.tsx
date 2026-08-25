/**
 * Visio Divina — praying with an image.
 *
 * The sibling of Audio Divina: there, sacred listening; here, sacred looking.
 * Four beats — the image alone, the image with the day's passage, one question,
 * then the close. Deliberately slow: the first slide has nothing on it but the
 * painting, because the practice IS the looking and any text would be read
 * instead.
 *
 * Completion is finishing the deck, the same bar the office keeps — marked on
 * the closing slide, not on arrival. markPracticeDoneToday carries the local
 * flag and the server write, so the card, the dot, the weekly row, the widget
 * and yesterday's ordering all move together.
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { artworkForDay } from "@/lib/visioArtworks";
import { openExternal } from "@/lib/openExternal";

const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.85)";
const FAINT = "rgba(143,175,150,0.55)";
const BORDER = "rgba(46,107,64,0.38)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

export default function VisioPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const today = useMemo(() => {
    try { return new Date().toLocaleDateString("en-CA"); } catch { return "1970-01-01"; }
  }, []);
  const art = useMemo(() => artworkForDay(today), [today]);

  // 0 the image · 1 the passage · 2 the question · 3 the close.
  const [step, setStep] = useState(0);
  const TOTAL = 4;
  const atEnd = step >= TOTAL - 1;
  const close = () => setLocation("/dashboard");
  const next = () => {
    if (!atEnd) { setStep((s) => s + 1); return; }
    // Kept by finishing, not by opening.
    try { markPracticeDoneToday("visio"); } catch { /* non-fatal */ }
    close();
  };
  const prev = () => { if (step > 0) setStep((s) => s - 1); };

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, isolation: "isolate", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header — Back / title / close, matching the office's reader chrome. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top) + 12px) 16px 8px", gap: 10 }}>
        <button
          type="button"
          onClick={prev}
          disabled={step === 0}
          style={{ background: "none", border: "none", color: step === 0 ? "transparent" : SAGE, fontFamily: FONT, fontSize: 14, cursor: step === 0 ? "default" : "pointer", padding: 6 }}
        >
          ← {t("common.back", { defaultValue: "Back" })}
        </button>
        <span style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" }}>
          {t("visio.title", { defaultValue: "Visio Divina" })}
        </span>
        <button
          type="button"
          onClick={close}
          aria-label={t("common.close", { defaultValue: "Close" })}
          style={{ width: 32, height: 32, borderRadius: 999, background: "rgba(9,26,16,0.5)", border: `1px solid ${BORDER}`, color: WARM, cursor: "pointer", padding: 0 }}
        >
          ✕
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 20px", gap: 16, overflowY: "auto" }}>
        {/* The painting is on screen for the first three beats — the passage and
            the question are read WITH it, not instead of it. */}
        {step < 3 && (
          <img
            src={art.image}
            alt={`${art.title} — ${art.artist}`}
            style={{ maxWidth: "100%", maxHeight: step === 0 ? "72vh" : "42vh", objectFit: "contain", borderRadius: 10, boxShadow: "0 18px 60px rgba(0,0,0,0.45)" }}
          />
        )}

        {step === 0 && (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: WARM, fontFamily: SERIF, fontSize: 19, fontStyle: "italic", margin: 0 }}>{art.title}</p>
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, margin: "6px 0 0" }}>{art.artist} · {art.date}</p>
          </div>
        )}

        {step === 1 && (
          <div style={{ maxWidth: 560 }}>
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: "0 0 8px" }}>{art.scriptureRef}</p>
            <p style={{ color: WARM, fontFamily: SERIF, fontSize: 18, lineHeight: 1.7, margin: 0 }}>{art.scripture}</p>
          </div>
        )}

        {step === 2 && (
          <p style={{ color: WARM, fontFamily: SERIF, fontSize: 20, fontStyle: "italic", lineHeight: 1.6, textAlign: "center", maxWidth: 480, margin: 0 }}>
            {art.prompt}
          </p>
        )}

        {step === 3 && (
          <div style={{ textAlign: "center", maxWidth: 520 }}>
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
              {t("visio.close_eyebrow", { defaultValue: "Visio Divina complete" })}
            </p>
            <p style={{ color: WARM, fontFamily: SERIF, fontSize: 22, fontStyle: "italic", margin: "12px 0 18px" }}>
              {t("visio.close_line", { defaultValue: "Thank you for looking slowly." })}
            </p>
            {/* Attribution, because ACT asks for it and because a painting has a
                maker. The essay link is the natural next step for anyone who
                wants to know more, and it opens out rather than in. */}
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 11.5, lineHeight: 1.55, margin: 0 }}>{art.attribution}</p>
            {art.essayUrl && (
              <button
                type="button"
                onClick={() => openExternal(art.essayUrl!)}
                style={{ marginTop: 12, background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, textDecoration: "underline", cursor: "pointer", padding: 6 }}
              >
                {t("visio.read_essay", { defaultValue: "Read about this image" })}
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ padding: "10px 20px calc(env(safe-area-inset-bottom) + 18px)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={next}
          style={{ width: "100%", maxWidth: 420, background: "rgba(46,107,64,0.55)", border: `1px solid ${BORDER}`, color: WARM, borderRadius: 999, padding: "14px 20px", fontSize: 16, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
        >
          {atEnd ? t("common.done", { defaultValue: "Done" }) : t("common.continue", { defaultValue: "Continue" })}
        </button>
        <span style={{ color: FAINT, fontFamily: FONT, fontSize: 11, letterSpacing: "0.12em" }}>{step + 1} / {TOTAL}</span>
      </div>
    </div>
  );
}
