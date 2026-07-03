import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { PRACTICE_INTROS, type PracticeIntroKey } from "@/lib/practiceIntros";

// A one-card, full-screen first-run intro for a contemplative practice — what it
// is, where it comes from, what to do — so someone can begin without being
// taught. Drop it in front of a practice's start screen, gated on hasSeenIntro().

const CREAM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const BG = "#0C1F12";
const FONT = "'Space Grotesk', system-ui, sans-serif";

export function PracticeIntro({
  intro,
  onBegin,
  onSkip,
  beginLabel,
}: {
  intro: PracticeIntroKey;
  onBegin: () => void;
  onSkip?: () => void;
  beginLabel?: string;
}) {
  const { t } = useTranslation();
  const c = PRACTICE_INTROS[intro];
  // A leaf photo behind frosted-glass content — matches the rest of the app.
  const leaf = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);
  const Row = ({ label, text }: { label: string; text: string }) => (
    <div style={{ marginTop: 15 }}>
      <p style={{ color: SAGE_DIM, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "1.3px", fontFamily: FONT, margin: 0, fontWeight: 600 }}>{label}</p>
      <p style={{ color: CREAM, fontSize: 14.5, fontFamily: FONT, lineHeight: 1.55, margin: "4px 0 0" }}>{text}</p>
    </div>
  );
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", flexDirection: "column", padding: "0 26px", background: BG, overflowY: "auto", isolation: "isolate" }}>
      {/* Leaf backdrop + legibility wash (falls back to the ambient glow). */}
      {leaf ? (
        <>
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -2, backgroundImage: `url(${leaf})`, backgroundSize: "cover", backgroundPosition: "center" }} />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,22,15,0.70) 0%, rgba(8,22,15,0.84) 52%, rgba(8,22,15,0.93) 100%)" }} />
        </>
      ) : (
        <AnimatedBackground base={BG} variant="subtle" />
      )}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 400, margin: "0 auto", width: "100%", paddingTop: "calc(env(safe-area-inset-top) + 44px)", paddingBottom: "calc(env(safe-area-inset-bottom) + 28px)" }}>
        <div style={{ textAlign: "center" }}>
          <span style={{ fontSize: 40 }} aria-hidden>{c.emoji}</span>
          <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "1.4px", fontFamily: FONT, margin: "12px 0 6px", fontWeight: 600 }}>{c.eyebrow}</p>
          <h1 style={{ color: CREAM, fontSize: 24, fontWeight: 700, fontFamily: FONT, margin: 0 }}>{c.title}</h1>
        </div>
        {/* Frosted-glass card holding the what / where / how. */}
        <div style={{ marginTop: 20, borderRadius: 22, padding: "6px 18px 20px", background: "rgba(9,26,16,0.42)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: "1px solid rgba(46,107,64,0.38)" }}>
          <Row label={t("practice_intro.what", { defaultValue: "What it is" })} text={c.what} />
          <Row label={t("practice_intro.from", { defaultValue: "Where it comes from" })} text={c.from} />
          <Row label={t("practice_intro.how", { defaultValue: "What to do" })} text={c.how} />
        </div>
        <button onClick={onBegin} style={{ marginTop: 22, width: "100%", padding: "15px 0", borderRadius: 999, border: "none", background: CREAM, color: "#12261A", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
          {beginLabel ?? t("practice_intro.begin", { defaultValue: "Begin" })}
        </button>
        {onSkip && (
          <button onClick={onSkip} style={{ marginTop: 12, background: "none", border: "none", color: SAGE, fontSize: 13.5, fontFamily: FONT, cursor: "pointer", alignSelf: "center" }}>
            {t("practice_intro.skip", { defaultValue: "Skip" })}
          </button>
        )}
      </div>
    </div>
  );
}
