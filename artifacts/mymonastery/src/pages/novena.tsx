import { useMemo, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useRhythmState } from "@/hooks/useRhythmState";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { pickWideBackground } from "@/lib/wideBackgrounds";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { triggerSubmitFeedback } from "@/lib/amenFeedback";
import { PointedLine } from "@/components/PointedLine";

// ── Novena — today's day, on ONE PAGE ───────────────────────────────────────
//
// Owner, 2026-09-23, bringing novenas back: "We dont need a slideshow, just
// have then be like a relfection, the daily prayer on one page." So this is
// not a deck any more — no intro slide, no Continue, no dots, no closing
// slide. The day reads the way a reflection does: who this novena is to,
// where you are in the nine days, then the whole of today's prayer in one
// scroll, with the day marked complete at the foot of it.
//
// A day whose body starts with "Psalm <n>" (novenaDaysTable.psalmNumber, the
// GET /me/novena route splices the real BCP text ahead of the day's own body)
// renders that block with the SAME verse-numbered layout the Daily Office
// psalm slides use (bcp-daily-office.tsx), so a psalm reads the same wherever
// it appears in the app. Every other paragraph is the devotion/prayer text.
//
// ENTRANCE FADES IN PLACE — no rise (reference_page_rise_end_snap).

const FONT = "'Space Grotesk', sans-serif";
const BG = "#0C1F12";
const WARM = "#F0EDE6";
const WARM_TEXT = "rgba(240,237,230,0.92)";
const FAINT_GREEN = "rgba(143,175,150,0.65)";
const ACCENT = "rgba(143,175,150,0.5)";
const EYEBROW = "rgba(143,175,150,0.75)";
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

function PsalmBlock({ psalmNumber, content }: { psalmNumber: string; content: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, textAlign: "left", width: "100%" }}>
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

  // The day's body, in order. A "Psalm <n>" paragraph immediately followed by
  // the psalm's own text (see GET /me/novena's splice) becomes ONE psalm
  // block; every other paragraph is a paragraph.
  type Block = { kind: "psalm"; number: string; content: string } | { kind: "text"; text: string };
  const blocks = useMemo<Block[]>(() => {
    const raw = (novena?.day?.body ?? "").split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    const out: Block[] = [];
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
      <div style={{ minHeight: "var(--app-dvh)", background: BG, color: WARM, fontFamily: FONT }} className="flex flex-col items-center justify-center gap-4 px-6 text-center">
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

  return (
    <div className="relative" style={{ minHeight: "var(--app-dvh)", background: BG, color: WARM, fontFamily: FONT, isolation: "isolate" }}>
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

      <div
        style={{
          position: "relative", zIndex: 1, maxWidth: 600, margin: "0 auto", boxSizing: "border-box",
          padding: "max(1.25rem, calc(var(--safe-top) + 0.5rem)) 22px calc(env(safe-area-inset-bottom, 0px) + 40px)",
        }}
      >
        <header className="flex items-center justify-between" style={{ marginBottom: 22 }}>
          <button
            type="button"
            onClick={() => setLocation("/dashboard")}
            style={{ color: EYEBROW, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FONT, fontSize: 13 }}
          >
            Back
          </button>
        </header>

        <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45, ease: "easeOut" }}>
          {/* Don't repeat the saint's name if the title already ends with it
              (e.g. "A Novena of St. Francis of Assisi") — only append when it
              adds something (e.g. "…of Our Lady of Mount Carmel" + "The
              Blessed Virgin Mary, under her title of Mount Carmel"). */}
          <p style={{ color: EYEBROW, fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", margin: "0 0 6px", lineHeight: 1.5 }}>
            {novena.title}{novena.saint && !novena.title.endsWith(novena.saint) ? ` — ${novena.saint}` : ""}
          </p>
          <p style={{ color: EYEBROW, fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", margin: "0 0 14px" }}>
            Day {novena.displayDayNumber} of {novena.dayCount}
          </p>
          <h1 style={{ color: WARM, fontFamily: FONT, fontWeight: 700, fontSize: "clamp(22px, 5.6vw, 30px)", lineHeight: 1.2, letterSpacing: "-0.01em", margin: "0 0 26px" }}>
            {novena.day?.title ?? `Day ${novena.displayDayNumber}`}
          </h1>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {blocks.map((b, i) => (
              b.kind === "psalm" ? (
                <PsalmBlock key={i} psalmNumber={b.number} content={b.content} />
              ) : (
                <p key={i} style={{ color: WARM_TEXT, margin: 0, fontFamily: FONT, fontSize: "clamp(16px, 4.4vw, 18px)", lineHeight: 1.65, whiteSpace: "pre-line" }}>
                  {b.text}
                </p>
              )
            ))}
          </div>

          {/* The end of the page IS the closing — mark it kept here rather
              than on a slide of its own. */}
          <div className="flex flex-col items-center" style={{ marginTop: 38, gap: 16 }}>
            {novenaDone ? (
              <>
                <p style={{ color: FAINT_GREEN, fontFamily: FONT, fontSize: 13.5, textAlign: "center", margin: 0, lineHeight: 1.55 }}>
                  Day {novena.displayDayNumber} of {novena.dayCount} is prayed. Come back tomorrow for the next day.
                </p>
                <button type="button" onClick={() => setLocation("/dashboard")} className="rounded-full py-3 px-12 transition-opacity hover:opacity-90 active:scale-[0.99]" style={PILL}>
                  Done
                </button>
              </>
            ) : (
              <button type="button" onClick={() => complete.mutate()} disabled={complete.isPending} className="rounded-full py-3 px-10 transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-60" style={PILL}>
                {complete.isPending ? "Marking…" : "Amen — mark today complete"}
              </button>
            )}
            <button
              type="button"
              onClick={() => stop.mutate()}
              style={{ color: EYEBROW, background: "none", border: "none", padding: 4, cursor: "pointer", fontFamily: FONT, fontSize: 12, opacity: 0.75 }}
            >
              Stop this novena
            </button>
          </div>
        </motion.main>
      </div>
    </div>
  );
}
