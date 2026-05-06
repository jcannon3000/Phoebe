import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import type { Slide } from "@/components/MorningPrayer/types";

// ── Daily Office viewer ─────────────────────────────────────────────────────
// Visual chrome mirrors Lectio: dark forest background, top-bar with
// Back / Menu / eyebrow+reference, body centered, bottom pill with
// Back · section-label · Next. The slide content itself is rendered
// inline below — no SlideView dependency, since SlideView's chrome
// fights with this layout.

const BG = "#091A10";
const WARM_TEXT = "#F0EDE6";
const MUTED_GREEN = "#8FAF96";
const FAINT_GREEN = "rgba(143,175,150,0.55)";
const BORDER = "rgba(200,212,192,0.15)";
const BUTTON_BG = "#2D5E3F";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

interface OfficeViewerProps {
  office: "morning" | "evening";
  onBack: () => void;
}

interface OfficeDayInfo {
  weekdayLabel?: string;
  sundayLabel?: string;
  feastName?: string | null;
}

// Friendly section label for the bottom pill, derived from the slide
// type. Keeps the chrome readable when the eyebrow is verbose
// (e.g. "VENITE · PSALM 95").
const SECTION_LABEL: Record<string, string> = {
  opening: "Opening",
  opening_sentence: "Opening Sentence",
  confession: "Confession",
  absolution: "Absolution",
  invitatory: "Invitatory",
  invitatory_psalm: "Invitatory Psalm",
  psalm: "Psalm",
  lesson: "Lesson",
  canticle: "Canticle",
  creed: "Creed",
  lords_prayer: "Lord's Prayer",
  suffrages: "Suffrages",
  collect: "Collect",
  prayer_for_mission: "Prayer for Mission",
  intercessions: "Intercessions",
  general_thanksgiving: "General Thanksgiving",
  closing: "Closing",
};

// Parse a 1979 BCP Psalter content blob into a structured list for the
// renderer. The data file (api-server/src/seeds/bcpPsalter.ts) stores
// each psalm with:
//   • Each verse begins with `<number><space>` at the start of a line.
//   • The first hemistich ends with " *" before a newline.
//   • The second hemistich follows on the next line, indented by two
//     spaces.
//   • A trailing Gloria Patri block is appended by the assembler,
//     prefixed by a leading newline and beginning with "Glory to the
//     Father" — has no verse number and shouldn't get one rendered.
//
// We split into "verse" entries (numbered, two lines, hemistichs) and
// a "doxology" entry for the Gloria. The renderer visualises each.
type PsalmLine = { text: string; indented: boolean };
type PsalmEntry =
  | { kind: "verse"; number: string; lines: PsalmLine[] }
  | { kind: "doxology"; text: string };

function parsePsalmContent(content: string): PsalmEntry[] {
  const result: PsalmEntry[] = [];
  // Split off the Gloria Patri (always preceded by a blank line +
  // begins with "Glory to the Father"). It's the only non-numbered
  // block we expect to see.
  const gloriaMatch = content.match(/\n\s*\n?\s*(Glory to the Father[\s\S]+)$/);
  const psalmBody = gloriaMatch
    ? content.slice(0, content.length - gloriaMatch[1].length).trimEnd()
    : content;
  const gloria = gloriaMatch ? gloriaMatch[1].trim() : null;

  // Walk the psalm body line by line. A line that starts with digits
  // followed by a space opens a new verse; the rest of its line is
  // the first hemistich. Subsequent indented lines (leading spaces)
  // belong to the same verse as additional hemistichs.
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
      // Any continuation line — indentation in the source signals
      // that this is the second (or third) hemistich of the verse.
      const indented = /^\s/.test(raw);
      current.lines.push({ text: line.trim(), indented });
    }
  }
  if (current) result.push({ kind: "verse", ...current });
  if (gloria) result.push({ kind: "doxology", text: gloria });
  return result;
}

function OfficeViewer({ office, onBack }: OfficeViewerProps) {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [officeDay, setOfficeDay] = useState<OfficeDayInfo | null>(null);
  const [slideIdx, setSlideIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const officeTitle = office === "morning" ? "Morning Prayer" : "Evening Prayer";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/office/${office}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const fetched: Slide[] = data.slides ?? [];
        if (fetched.length === 0) throw new Error("No slides returned");
        setSlides(fetched);
        setOfficeDay(data.officeDay ?? null);
        setSlideIdx(0);
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Failed to load ${office} prayer:`, err);
          setError(`${officeTitle} couldn't load (${msg}).`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [office, officeTitle]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SPACE_GROTESK }}>
        <p style={{ color: MUTED_GREEN, fontSize: 14, letterSpacing: "0.06em" }}>Preparing today's office…</p>
      </div>
    );
  }

  if (error || slides.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32, textAlign: "center", fontFamily: SPACE_GROTESK }}>
        <p style={{ fontSize: 18, color: WARM_TEXT }}>{error ?? `${officeTitle} is not available right now.`}</p>
        <button onClick={onBack} style={{ fontSize: 14, color: MUTED_GREEN, background: "none", border: "none", cursor: "pointer" }}>
          ← Back to Daily Offices
        </button>
      </div>
    );
  }

  const currentSlide = slides[slideIdx];
  const atStart = slideIdx === 0;
  const atEnd = slideIdx === slides.length - 1;
  const sectionLabel = SECTION_LABEL[currentSlide.type] ?? currentSlide.type.toUpperCase();
  const refLabel = officeDay?.feastName ?? officeDay?.weekdayLabel ?? officeDay?.sundayLabel ?? "";

  function next() { if (!atEnd) setSlideIdx(slideIdx + 1); }
  function prev() { if (!atStart) setSlideIdx(slideIdx - 1); }

  return (
    <div
      style={{
        height: "100dvh",
        overflow: "hidden",
        overscrollBehavior: "none",
        background: BG,
        color: WARM_TEXT,
        display: "flex",
        flexDirection: "column",
        fontFamily: SPACE_GROTESK,
      }}
    >
      {/* Top bar — Back / Menu / eyebrow+ref. Mirrors Lectio's header. */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, pointerEvents: "none" }}>
        <div
          className="max-w-2xl mx-auto w-full px-5 pb-2"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: 12,
            pointerEvents: "auto",
            paddingTop: "max(1.5rem, calc(env(safe-area-inset-top) + 0.5rem))",
          }}
        >
          <button
            type="button"
            onClick={onBack}
            style={{ color: FAINT_GREEN, fontSize: 13, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: SPACE_GROTESK }}
          >
            ← Back
          </button>
          <span
            className="rounded-full"
            style={{
              background: "rgba(19,44,29,0.85)",
              border: `1px solid ${BORDER}`,
              color: WARM_TEXT,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.04em",
              padding: "6px 16px",
            }}
          >
            {officeTitle}
          </span>
          <div style={{ textAlign: "right", minWidth: 0 }}>
            {refLabel && (
              <p style={{ color: MUTED_GREEN, fontSize: 12, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {refLabel}
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Body. Top padding bumped from safe+88 → max(120, safe+108)
          so the bar clears on web (where safe-area-inset-top is 0)
          without forcing the slide content to ride up under the
          fixed header. The earlier value left the title sitting too
          close to the bar; the user reported "loads a little too low"
          as shorthand for content reading too compressed against the
          header strip. Inner content is left-aligned now (was center)
          so liturgical text reads like a missal page rather than a
          centered poster. */}
      <main
        className="flex-1 px-5"
        style={{
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
          paddingTop: "max(120px, calc(env(safe-area-inset-top) + 108px))",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 112px)",
        }}
      >
        <div
          className="max-w-2xl w-full mx-auto"
          style={{ minHeight: "100%", display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "left", gap: 20 }}
        >
          {currentSlide.emoji && (
            <div style={{ fontSize: 40, lineHeight: 1 }}>{currentSlide.emoji}</div>
          )}
          {/* Section eyebrow — moved here from the top-right corner of
              the fixed header. Sits above the title so the user can
              tell at a glance which part of the office they're in
              without glancing up at the corner. */}
          <p
            style={{
              color: FAINT_GREEN,
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              margin: 0,
              fontWeight: 600,
            }}
          >
            {currentSlide.eyebrow || sectionLabel}
          </p>
          {currentSlide.title && (
            <h2
              style={{
                // Psalms get italic + serif because the title slot
                // carries the Latin incipit ("Deus, judicium" etc.)
                // which BCP convention italicises. Other slide types
                // keep the bolder Space Grotesk treatment.
                fontSize: currentSlide.type === "psalm" ? 18 : 22,
                fontWeight: currentSlide.type === "psalm" ? 400 : 600,
                fontStyle: currentSlide.type === "psalm" ? "italic" : "normal",
                fontFamily: currentSlide.type === "psalm"
                  ? "Georgia, 'Times New Roman', serif"
                  : SPACE_GROTESK,
                color: WARM_TEXT,
                letterSpacing: "-0.01em",
                margin: 0,
              }}
            >
              {currentSlide.title}
            </h2>
          )}
          {/* Psalms render as a structured list of verses — verse number
              on the left, asterisk visible at the half-verse caesura,
              second hemistich indented, and a clear gap between
              verses. Mirrors the 1979 BCP Psalter page format. The
              Gloria Patri (which the assembler appends to every
              psalm) renders as an unnumbered italic doxology at the
              bottom. The fallback continues to use whiteSpace pre-
              wrap for any non-psalm long-text slide.
              The data is already in the right shape — verses begin
              with `<digit><space>`, hemistichs are split by " *\n  "
              — so the parser just walks line by line. */}
          {currentSlide.type === "psalm" && currentSlide.content ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 600 }}>
              {parsePsalmContent(currentSlide.content).map((v, i) => (
                v.kind === "verse" ? (
                  <div key={i} style={{ display: "flex", gap: 10 }}>
                    <span
                      style={{
                        flex: "0 0 auto",
                        minWidth: 22,
                        color: FAINT_GREEN,
                        fontSize: 13,
                        fontFamily: SPACE_GROTESK,
                        lineHeight: 1.6,
                        paddingTop: 2,
                      }}
                    >
                      {v.number}
                    </span>
                    <div style={{ flex: 1 }}>
                      {v.lines.map((ln, li) => (
                        <p
                          key={li}
                          style={{
                            fontSize: 16,
                            lineHeight: 1.6,
                            color: WARM_TEXT,
                            margin: 0,
                            paddingLeft: ln.indented ? 24 : 0,
                            fontFamily: "Georgia, 'Times New Roman', serif",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {ln.text}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : (
                  // Gloria Patri — italic, no verse number, separated
                  // by a hairline rule above to mark it as a doxology
                  // not part of the numbered psalm body.
                  <div
                    key={i}
                    style={{
                      borderTop: "1px solid rgba(143,175,150,0.18)",
                      paddingTop: 12,
                      marginTop: 4,
                    }}
                  >
                    <p
                      style={{
                        fontSize: 15,
                        lineHeight: 1.7,
                        color: WARM_TEXT,
                        fontFamily: "Georgia, 'Times New Roman', serif",
                        fontStyle: "italic",
                        margin: 0,
                      }}
                    >
                      {v.text}
                    </p>
                  </div>
                )
              ))}
            </div>
          ) : currentSlide.isCallAndResponse && currentSlide.callAndResponseLines ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 560 }}>
              {currentSlide.callAndResponseLines.map((line, i) => (
                <div key={i}>
                  <p style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: FAINT_GREEN, margin: 0, marginBottom: 4 }}>
                    {line.speaker === "officiant" ? "Officiant" : line.speaker === "people" ? "People" : "All"}
                  </p>
                  <p style={{ fontSize: 17, lineHeight: 1.6, color: WARM_TEXT, margin: 0, fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic" }}>
                    {line.text}
                  </p>
                </div>
              ))}
            </div>
          ) : currentSlide.content ? (
            <p
              style={{
                fontSize: 17,
                lineHeight: 1.7,
                color: WARM_TEXT,
                margin: 0,
                whiteSpace: "pre-wrap",
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontStyle: "italic",
                maxWidth: 600,
              }}
            >
              {currentSlide.content}
            </p>
          ) : null}
          {currentSlide.bcpReference && (
            <p style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: FAINT_GREEN, margin: 0, marginTop: 8 }}>
              {currentSlide.bcpReference}
            </p>
          )}
        </div>
      </main>

      {/* Bottom nav pill — Back · section · Next/Done. Mirrors Lectio. */}
      <nav
        aria-label="Slide navigation"
        style={{
          position: "fixed",
          left: "50%",
          bottom: "calc(env(safe-area-inset-bottom) + 16px)",
          transform: "translateX(-50%)",
          zIndex: 50,
          background: "rgba(19,44,29,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: `1px solid ${BORDER}`,
          borderRadius: 999,
          padding: "8px 12px",
          boxShadow: "0 8px 28px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35)",
          maxWidth: "calc(100vw - 32px)",
        }}
      >
        <div className="flex items-center gap-4" style={{ minWidth: 0 }}>
          <button
            type="button"
            onClick={prev}
            disabled={atStart}
            className="rounded-full transition-opacity disabled:opacity-20"
            style={{
              color: WARM_TEXT,
              background: "transparent",
              border: `1px solid ${BORDER}`,
              padding: "6px 14px",
              fontSize: 12,
              fontFamily: SPACE_GROTESK,
              fontWeight: 600,
              cursor: atStart ? "default" : "pointer",
            }}
          >
            Back
          </button>
          <p
            style={{
              color: FAINT_GREEN,
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              margin: 0,
              whiteSpace: "nowrap",
              flex: "0 0 auto",
            }}
          >
            {slideIdx + 1} · {sectionLabel}
          </p>
          <button
            type="button"
            onClick={atEnd ? onBack : next}
            className="rounded-full transition-opacity"
            style={{
              background: BUTTON_BG,
              color: WARM_TEXT,
              border: "none",
              padding: "6px 16px",
              fontSize: 12,
              fontFamily: SPACE_GROTESK,
              fontWeight: 600,
              letterSpacing: "0.02em",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {atEnd ? "Done" : "Next"}
          </button>
        </div>
      </nav>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function BcpDailyOfficePage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [showOffice, setShowOffice] = useState<"morning" | "evening" | null>(null);

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  if (isLoading || !user) return null;

  if (showOffice === "morning") {
    return <OfficeViewer office="morning" onBack={() => setShowOffice(null)} />;
  }
  if (showOffice === "evening") {
    return <OfficeViewer office="evening" onBack={() => setShowOffice(null)} />;
  }

  const hour = new Date().getHours();
  const isMorning = hour < 14;
  const isEvening = hour >= 14;

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        <div className="mb-6">
          <Link href="/bcp" className="text-sm mb-3 inline-block" style={{ color: "#8FAF96" }}>
            ← Book of Common Prayer
          </Link>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            Daily Offices 📖
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Morning Prayer and Evening Prayer for today
          </p>
        </div>

        <div className="space-y-3">
          {/* Morning Prayer */}
          <button
            onClick={() => setShowOffice("morning")}
            className="w-full text-left p-5 rounded-2xl transition-all hover:shadow-md active:scale-[0.99]"
            style={{
              background: isMorning ? "rgba(46,107,64,0.18)" : "rgba(46,107,64,0.08)",
              border: `1px solid ${isMorning ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.18)"}`,
            }}
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl">🌅</span>
              <div className="flex-1">
                <p className="font-semibold text-base" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                  Morning Prayer
                </p>
                <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>Rite II · The Daily Office</p>
                {isMorning && <p className="text-xs mt-1.5 font-medium" style={{ color: "#6FAF85" }}>Available now</p>}
              </div>
              <span className="text-sm" style={{ color: "#8FAF96" }}>→</span>
            </div>
          </button>

          {/* Evening Prayer */}
          <button
            onClick={() => setShowOffice("evening")}
            className="w-full text-left p-5 rounded-2xl transition-all hover:shadow-md active:scale-[0.99]"
            style={{
              background: isEvening ? "rgba(26,28,46,0.4)" : "rgba(26,28,46,0.15)",
              border: `1px solid ${isEvening ? "rgba(139,157,195,0.25)" : "rgba(46,107,64,0.18)"}`,
            }}
          >
            <div className="flex items-center gap-4">
              <span className="text-3xl">🌙</span>
              <div className="flex-1">
                <p className="font-semibold text-base" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                  Evening Prayer
                </p>
                <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>Rite II · The Daily Office</p>
                {isEvening && <p className="text-xs mt-1.5 font-medium" style={{ color: "#8B9DC3" }}>Available now</p>}
              </div>
              <span className="text-sm" style={{ color: "#8FAF96" }}>→</span>
            </div>
          </button>
        </div>

        <div className="mt-8 rounded-xl px-5 py-4 text-center" style={{ background: "rgba(92,122,95,0.04)", border: "1px dashed rgba(46,107,64,0.2)" }}>
          <p className="text-xs" style={{ color: "rgba(143,175,150,0.5)" }}>
            Want to pray the office daily with others?
          </p>
          <Link href="/moment/new" className="text-xs font-semibold mt-1 inline-block" style={{ color: "#6FAF85" }}>
            Start a Daily Office practice →
          </Link>
        </div>
      </div>
    </Layout>
  );
}
