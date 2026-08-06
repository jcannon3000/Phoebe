import { useState, useMemo, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useRhythmState } from "@/hooks/useRhythmState";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { pickWideBackground } from "@/lib/wideBackgrounds";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { playOpeningSwell, triggerSubmitFeedback } from "@/lib/amenFeedback";
import { PointedLine } from "@/components/PointedLine";

// ── Novena — today's day, as a slideshow ────────────────────────────────────
// Same shell as guided-prayer.tsx / the Examen: one passage per slide, dots +
// a frosted pill, the reader's own pace, no timer. The day's text (already
// paragraph-separated in the seed data) becomes the slides directly — intro
// names the day and where they are in the novena, then one slide per
// paragraph, then a close that marks the day complete.
//
// A day whose body starts with "Psalm <n>" (novenaDaysTable.psalmNumber, the
// GET /me/novena route splices the real BCP text ahead of the day's own
// body) renders that block with the SAME verse-numbered, left-aligned
// layout the Daily Office psalm slides use (bcp-daily-office.tsx) — not as
// one more centered paragraph — so a psalm reads the same wherever it
// appears in the app. Every other paragraph (the devotion/prayer text
// itself) is left-aligned too, matching the office's own reading slides.

const FONT = "'Space Grotesk', sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const BG = "#0C1F12";
const WARM = "#F0EDE6";
const WARM_TEXT = "rgba(240,237,230,0.92)";
const FAINT_GREEN = "rgba(143,175,150,0.65)";
const ACCENT = "rgba(143,175,150,0.5)";
const EYEBROW = "rgba(143,175,150,0.75)";
const DOT_ON = "#8FAF96";
const DOT_OFF = "rgba(143,175,150,0.3)";
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

function localDay(): string {
  return new Date().toLocaleDateString("en-CA");
}

// A minimal port of bcp-daily-office.tsx's parsePsalmContent — same source
// format (bcp_texts), same verse/hemistich/Gloria parsing, so a psalm reads
// identically wherever it's shown in the app.
type PsalmLine = { text: string; indented: boolean };
type PsalmEntry = { kind: "verse"; number: string; lines: PsalmLine[] } | { kind: "doxology"; text: string };
function parsePsalmContent(content: string): PsalmEntry[] {
  const result: PsalmEntry[] = [];
  const gloriaMatch = content.match(/\n\s*\n?\s*(Glory to the Father[\s\S]+)$/);
  const psalmBody = gloriaMatch ? content.slice(0, content.length - gloriaMatch[1].length).trimEnd() : content;
  const gloria = gloriaMatch ? gloriaMatch[1].trim() : null;
  const rawLines = psalmBody.split("\n");
  let current: { number: string; lines: PsalmLine[] } | null = null;
  for (const raw of rawLines) {
    const line = raw.replace(/\s+$/, "");
    if (line === "") continue;
    const verseMatch = line.match(/^(\d+)\s+(.*)$/);
    if (verseMatch) {
      if (current) result.push({ kind: "verse", ...current });
      current = { number: verseMatch[1], lines: [{ text: verseMatch[2], indented: false }] };
    } else if (current) {
      const indented = /^\s/.test(raw);
      current.lines.push({ text: line.trim(), indented });
    }
  }
  if (current) result.push({ kind: "verse", ...current });
  if (gloria) result.push({ kind: "doxology", text: gloria });
  return result;
}

function PsalmSlide({ psalmNumber, content }: { psalmNumber: string; content: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 600, textAlign: "left", width: "100%" }}>
      <p style={{ color: FAINT_GREEN, fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", margin: "0 0 4px" }}>
        Psalm {psalmNumber}
      </p>
      {parsePsalmContent(content).map((v, i) => (
        v.kind === "verse" ? (
          <div key={i} style={{ display: "flex", gap: 7 }}>
            <span style={{ flex: "0 0 auto", minWidth: 16, color: FAINT_GREEN, fontSize: 13, fontFamily: FONT, lineHeight: 1.6, paddingTop: 2 }}>
              {v.number}
            </span>
            <div style={{ flex: 1 }}>
              {v.lines.map((ln, li) => (
                <PointedLine
                  key={li}
                  text={ln.text}
                  style={{ fontSize: 17, lineHeight: 1.6, color: WARM_TEXT, margin: 0, paddingLeft: ln.indented ? 16 : 0, fontFamily: FONT, whiteSpace: "pre-wrap" }}
                />
              ))}
            </div>
          </div>
        ) : (
          <p key={i} style={{ fontSize: 17, lineHeight: 1.6, color: WARM_TEXT, margin: 0, fontFamily: FONT, whiteSpace: "pre-wrap" }}>{v.text}</p>
        )
      ))}
    </div>
  );
}

export default function NovenaPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { novena, novenaDone } = useRhythmState();
  const backdropPhoto = useMemo(() => pickWideBackground() ?? (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  // The day's body, split into slides. A "Psalm <n>" paragraph immediately
  // followed by the psalm's own text (see GET /me/novena's splice) becomes
  // ONE psalm slide, rendered like the office's psalm slides; every other
  // paragraph is its own plain text slide.
  type Slide = { kind: "psalm"; number: string; content: string } | { kind: "text"; text: string };
  const slides = useMemo<Slide[]>(() => {
    const raw = (novena?.day?.body ?? "").split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    const out: Slide[] = [];
    for (let i = 0; i < raw.length; i++) {
      const m = raw[i]!.match(/^Psalm (\d+)$/);
      if (m && raw[i + 1]) {
        out.push({ kind: "psalm", number: m[1]!, content: raw[i + 1]! });
        i++;
      } else {
        out.push({ kind: "text", text: raw[i]! });
      }
    }
    return out;
  }, [novena?.day?.body]);

  // step 0 = intro, 1..N = slides, N+1 = closing.
  const [step, setStep] = useState(0);

  const complete = useMutation({
    mutationFn: () => apiRequest("POST", "/api/me/novena/complete", { localDate: localDay() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/me/novena"] });
      try { triggerSubmitFeedback(); } catch { /* non-fatal */ }
      setLocation("/dashboard");
    },
  });

  const stop = useMutation({
    mutationFn: () => apiRequest("POST", "/api/me/novena/stop"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/me/novena"] });
      setLocation("/novena-library");
    },
  });

  if (!novena) {
    return (
      <div style={{ minHeight: "100dvh", background: BG, color: WARM, fontFamily: FONT }} className="flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p style={{ color: EYEBROW }}>No novena in progress.</p>
        <button
          onClick={() => setLocation("/novena-library")}
          className="px-5 py-2.5 rounded-full text-sm font-semibold"
          style={{ background: "#2D5E3F", color: WARM }}
        >
          Browse novenas
        </button>
      </div>
    );
  }

  const isIntro = step === 0;
  const isClosing = step === slides.length + 1;
  const slideIndex = !isIntro && !isClosing ? step - 1 : -1;
  const slide = slideIndex >= 0 ? slides[slideIndex] : null;

  const primary = isIntro
    ? { label: "Begin", onClick: () => { setStep(1); try { playOpeningSwell(); } catch { /* non-fatal */ } } }
    : isClosing
      ? (novenaDone
          ? { label: "Done", onClick: () => setLocation("/dashboard") }
          : { label: complete.isPending ? "Marking…" : "Amen — mark today complete", onClick: () => complete.mutate() })
      : { label: "Continue", onClick: () => setStep((s) => s + 1) };

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
          onClick={() => {
            if (step > 0 && step < slides.length + 1) setStep((s) => s - 1);
            else setLocation("/dashboard");
          }}
          style={{ color: EYEBROW, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FONT, fontSize: 13 }}
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => stop.mutate()}
          style={{ color: EYEBROW, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FONT, fontSize: 12, opacity: 0.75 }}
        >
          Stop this novena
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
          {isIntro && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ maxWidth: 480, textAlign: "center" }}
            >
              <p style={{ color: EYEBROW, fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 6, lineHeight: 1.5 }}>
                {novena.title}{novena.saint ? ` — ${novena.saint}` : ""}
              </p>
              <p style={{ color: EYEBROW, fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 16 }}>
                Day {novena.displayDayNumber} of {novena.dayCount}
              </p>
              <h1 style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(22px, 5.6vw, 32px)", lineHeight: 1.2, letterSpacing: "-0.01em" }}>
                {novena.day?.title ?? `Day ${novena.displayDayNumber}`}
              </h1>
            </motion.div>
          )}

          {slide && slide.kind === "psalm" && (
            <motion.div
              key={`s-${slideIndex}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="w-full"
              style={{ maxWidth: 560 }}
            >
              <PsalmSlide psalmNumber={slide.number} content={slide.content} />
            </motion.div>
          )}

          {slide && slide.kind === "text" && (
            <motion.div
              key={`s-${slideIndex}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="w-full"
              style={{ maxWidth: 560, textAlign: "left" }}
            >
              <p style={{ color: WARM_TEXT, margin: 0, fontFamily: FONT, fontSize: "clamp(16px, 4.4vw, 19px)", lineHeight: 1.65, whiteSpace: "pre-line" }}>
                {slide.text}
              </p>
            </motion.div>
          )}

          {isClosing && (
            <motion.div
              key="closing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ maxWidth: 480, textAlign: "center" }}
            >
              <p style={{ fontSize: 40, marginBottom: 18 }} aria-hidden>🕊️</p>
              <h2 style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(22px, 5.6vw, 32px)", lineHeight: 1.2, letterSpacing: "-0.01em", marginBottom: 12 }}>
                {novenaDone ? "Day kept" : "Amen"}
              </h2>
              <p style={{ color: "rgba(240,237,230,0.86)", margin: 0, fontFamily: FONT, fontSize: "clamp(15px, 4.2vw, 17px)", lineHeight: 1.55 }}>
                {novenaDone
                  ? `Day ${novena.displayDayNumber} of ${novena.dayCount} is prayed. Come back tomorrow for the next day.`
                  : "Mark today's day complete when you're ready."}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <div className="absolute left-0 right-0 flex flex-col items-center" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)", zIndex: 2 }}>
        {slide && (
          <div className="flex items-center justify-center gap-1.5" style={{ marginBottom: 16 }}>
            {slides.map((_, i) => (
              <span key={i} className="block rounded-full" style={{ width: 6, height: 6, background: i <= slideIndex ? DOT_ON : DOT_OFF }} />
            ))}
          </div>
        )}
        <button type="button" onClick={primary.onClick} className="rounded-full py-3 px-12 transition-opacity hover:opacity-90 active:scale-[0.99]" style={PILL}>
          {primary.label}
        </button>
      </div>
    </div>
  );
}
