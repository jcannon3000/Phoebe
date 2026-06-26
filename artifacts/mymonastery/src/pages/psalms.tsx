import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { getPsalmCycle } from "@/lib/officePrefs";
import { markPsalmsPrayed } from "@/lib/cacReadState";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

// ── /psalms — Praying the Psalms, rendered like the daily office ─────────────
//
// Opens the psalms appointed for today (per the chosen cycle: the daily-office
// lectionary, or the traditional 30-day monthly Psalter) and shows them in the
// SAME immersive dark style as Morning/Evening Prayer in the office viewer — a
// leaf backdrop, a big "Psalm N · From the Daily Office Lectionary" title slide,
// then the pointed verses with a verse-number gutter, with the BCP page number
// on every slide. Self-contained (it does NOT reuse the office viewer), so it
// never touches the office's progress/completion state — finishing marks only
// the day's Praying-the-Psalms practice (markPsalmsPrayed), per side.

const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const WARM = "#F0EDE6";
const FAINT_GREEN = "rgba(143,175,150,0.55)";
const SOFT_GREEN = "rgba(200,212,192,0.75)";
const PAGE_REF = "rgba(168,197,160,0.7)";
const BG = "#0C1F12";

const GLORIA_PATRI =
  "Glory to the Father, and to the Son, and to the Holy Spirit: as it was in the beginning, is now, and will be for ever. Amen.";

const PSALM_LOADING_QUOTES: Array<{ text: string; author: string }> = [
  { text: "My strength returns to me with my cup of coffee and the reading of the psalms.", author: "Dorothy Day" },
  { text: "In the Psalter you learn about yourself. You find depicted in it all the movements of your soul, all its changes, its ups and downs, its failures and recoveries.", author: "Athanasius" },
];

type Psalm = {
  number: number;
  title: string;
  bcpRef: string;
  content: string;
  range: [number, number] | null;
  raw: string;
};

// A rendered slide: the big title, a chunk of verses, or the doxology.
type PsalmSlide =
  | { kind: "title"; headline: string; bcpRef: string }
  | { kind: "verses"; eyebrow: string; verses: Verse[]; bcpRef: string }
  | { kind: "gloria"; eyebrow: string };

// A parsed verse: its number + the half-lines (BCP pointing keeps the second
// half on its own indented line).
type Verse = { num: string; lines: string[] };

// Split the pointed BCP text into verses (a line beginning "N " starts one;
// continuation/hemistich lines belong to the verse above), then group into
// chunks of `versesPerChunk` (4, like the office).
function parseVerses(content: string): Verse[] {
  const verses: Verse[] = [];
  let cur: Verse | null = null;
  for (const rawLine of content.split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    if (line.length === 0) continue;
    const m = line.match(/^(\d+)\s+(.*)$/);
    if (m) {
      if (cur) verses.push(cur);
      cur = { num: m[1], lines: [m[2]] };
    } else if (cur) {
      cur.lines.push(line);
    } else {
      cur = { num: "", lines: [line] };
    }
  }
  if (cur) verses.push(cur);
  return verses;
}

function refLabel(p: Psalm): string {
  return p.range ? `${p.number}:${p.range[0]}-${p.range[1]}` : `${p.number}`;
}

// Build the office-shaped slide list: ONE combined title slide, then 4-verse
// chunks across every appointed psalm (eyebrow per psalm), then a Gloria.
function buildSlides(psalms: Psalm[]): PsalmSlide[] {
  if (psalms.length === 0) return [];
  const slides: PsalmSlide[] = [];
  const titleHeadline = psalms.length === 1
    ? `Psalm ${refLabel(psalms[0])}`
    : `Psalms ${psalms.map((p) => p.number).join(" & ")}`;
  slides.push({ kind: "title", headline: titleHeadline, bcpRef: psalms[0].bcpRef || "" });

  for (const p of psalms) {
    const all = parseVerses(p.content);
    for (let i = 0; i < all.length; i += 4) {
      slides.push({
        kind: "verses",
        eyebrow: `Psalm ${refLabel(p)}`,
        verses: all.slice(i, i + 4),
        bcpRef: p.bcpRef || "",
      });
    }
  }

  slides.push({ kind: "gloria", eyebrow: psalms.length === 1 ? `Psalm ${refLabel(psalms[0])}` : "Psalms" });
  return slides;
}

export default function PsalmsPage() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const office: "morning" | "evening" = params.get("office") === "evening" ? "evening" : "morning";
  const cycleParam = params.get("cycle");
  const cycle = cycleParam === "office" || cycleParam === "monthly" ? cycleParam : getPsalmCycle();
  const today = new Date().toLocaleDateString("en-CA");

  const { data, isLoading } = useQuery<{ psalms: Psalm[] }>({
    queryKey: ["/api/psalms/today", cycle, office, today],
    queryFn: () => apiRequest("GET", `/api/psalms/today?cycle=${cycle}&office=${office}&date=${today}`),
    staleTime: 30 * 60_000,
  });
  const [loadingQuote] = useState(() => PSALM_LOADING_QUOTES[Math.floor(Math.random() * PSALM_LOADING_QUOTES.length)]);

  const slides = useMemo(() => buildSlides(data?.psalms ?? []), [data]);
  // One concluding slide after the psalm slides (index === slides.length).
  const total = slides.length + 1;
  const [index, setIndex] = useState(0);
  const onConcluding = index >= slides.length;

  // A still leaf backdrop, picked once — matching the office slideshow.
  const leaf = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  // Praying is COMPLETING — mark the day done only once the reader reaches the
  // concluding slide. Side-scoped so morning psalms don't mark evening done.
  useEffect(() => {
    if (slides.length > 0 && index >= slides.length) markPsalmsPrayed(office);
  }, [index, slides.length, office]);

  const goHome = () => setLocation("/dashboard");
  const next = () => setIndex((i) => Math.min(i + 1, slides.length));
  const back = () => { if (index <= 0) { goHome(); return; } setIndex((i) => Math.max(i - 1, 0)); };

  const eyebrowLabel = office === "evening" ? "The Psalm Appointed For This Evening" : "The Psalm Appointed For This Morning";
  const sourceLabel = cycle === "monthly" ? "From the Monthly Psalter" : "From the Daily Office Lectionary";

  // ── Loading / empty ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={{ position: "fixed", inset: 0, background: BG, display: "flex", flexDirection: "column", justifyContent: "center", padding: 36 }}>
        <p style={{ color: "#E8E4D8", fontFamily: SERIF, fontStyle: "italic", fontSize: 18, lineHeight: 1.55, margin: 0, maxWidth: 460 }}>
          &ldquo;{loadingQuote.text}&rdquo;
        </p>
        <p style={{ color: FAINT_GREEN, fontFamily: FONT, fontSize: 12.5, letterSpacing: "0.04em", margin: "12px 0 0" }}>— {loadingQuote.author}</p>
        <p style={{ color: "rgba(143,175,150,0.5)", fontFamily: FONT, fontSize: 14, marginTop: 28 }}>Gathering today's psalms…</p>
      </div>
    );
  }
  if (slides.length === 0) {
    return (
      <div style={{ position: "fixed", inset: 0, background: BG, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 32, textAlign: "center" }}>
        <p style={{ color: WARM, fontFamily: FONT, fontSize: 16 }}>No psalms found for today. Try again shortly.</p>
        <button onClick={goHome} style={{ color: FAINT_GREEN, fontFamily: FONT, fontSize: 15, background: "none", border: "none", cursor: "pointer" }}>← Home</button>
      </div>
    );
  }

  const slide = onConcluding ? null : slides[index];
  const atEnd = index >= slides.length - 1;

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, overflow: "hidden", isolation: "isolate", display: "flex", flexDirection: "column", userSelect: "none", WebkitUserSelect: "none" }}>
      {/* Leaf backdrop, darkened — the office's immersive field. */}
      {leaf && (
        <>
          <img src={leaf} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.7, zIndex: -2 }} />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(12,31,18,0.78) 0%, rgba(12,31,18,0.62) 45%, rgba(12,31,18,0.82) 100%)" }} />
        </>
      )}

      {/* Header — Back · Today's Psalms · close. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "max(0.75rem, var(--safe-top)) 20px 4px", flexShrink: 0 }}>
        <button onClick={back} style={{ background: "none", border: "none", color: FAINT_GREEN, fontFamily: FONT, fontSize: 15, cursor: "pointer", padding: 6 }}>← Back</button>
        <span style={{ borderRadius: 999, border: "1px solid rgba(168,197,160,0.3)", color: SOFT_GREEN, fontFamily: FONT, fontSize: 14, fontWeight: 600, padding: "6px 16px" }}>
          {office === "evening" ? "Evening Psalms" : "Morning Psalms"}
        </span>
        <button onClick={goHome} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 999, border: "1px solid rgba(168,197,160,0.3)", background: "none", color: FAINT_GREEN, fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>

      {/* Slide counter. */}
      {!onConcluding && (
        <div style={{ position: "absolute", top: "max(0.75rem, var(--safe-top))", right: 0, left: 0, textAlign: "center", fontSize: 12, color: "rgba(143,175,150,0.4)", fontFamily: FONT, pointerEvents: "none", zIndex: 2, marginTop: -2 }}>
          {index + 1} of {total}
        </div>
      )}

      {/* Slide body — tap the right half to advance, left half to go back. */}
      <div
        onClick={(e) => { const w = (e.currentTarget as HTMLElement).clientWidth; if (e.clientX > w / 2) next(); else back(); }}
        style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", padding: "8px 28px 0", cursor: "pointer", WebkitOverflowScrolling: "touch" }}
      >
        {slide?.kind === "title" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 16 }}>
            <p style={{ color: FAINT_GREEN, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0, fontWeight: 600 }}>{eyebrowLabel}</p>
            <h1 style={{ fontFamily: FONT, fontSize: "clamp(48px, 9vw, 88px)", fontWeight: 700, letterSpacing: "-0.02em", color: WARM, margin: 0, lineHeight: 1.0 }}>{slide.headline}</h1>
            <p style={{ fontSize: 19, fontFamily: FONT, color: SOFT_GREEN, margin: 0 }}>{sourceLabel}</p>
            {slide.bcpRef && <p style={{ marginTop: 18, fontSize: 12.5, letterSpacing: "0.12em", textTransform: "uppercase", color: PAGE_REF, fontFamily: FONT }}>{slide.bcpRef}</p>}
          </div>
        )}

        {slide?.kind === "verses" && (
          <div style={{ maxWidth: 760, width: "100%", margin: "0 auto", paddingTop: 18 }}>
            <p style={{ color: FAINT_GREEN, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", margin: "0 0 22px", fontWeight: 600 }}>
              {slide.eyebrow.replace(/^PSALM\b/i, "PSALM")}
            </p>
            {slide.verses.map((v, i) => (
              <div key={i} style={{ display: "flex", gap: 18, marginBottom: 18 }}>
                <span style={{ flexShrink: 0, width: 18, textAlign: "right", color: "rgba(143,175,150,0.45)", fontFamily: FONT, fontSize: 18, lineHeight: 1.5, paddingTop: 1 }}>{v.num}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {v.lines.map((ln, j) => (
                    <p key={j} style={{ margin: 0, color: WARM, fontFamily: FONT, fontSize: 20, lineHeight: 1.5, paddingLeft: j === 0 ? 0 : 0 }}>{ln}</p>
                  ))}
                </div>
              </div>
            ))}
            {slide.bcpRef && <p style={{ marginTop: 14, fontSize: 11.5, letterSpacing: "0.12em", textTransform: "uppercase", color: PAGE_REF, fontFamily: FONT }}>{slide.bcpRef}</p>}
          </div>
        )}

        {slide?.kind === "gloria" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 18, maxWidth: 560, margin: "0 auto" }}>
            <p style={{ color: FAINT_GREEN, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0, fontWeight: 600 }}>Doxology</p>
            <p style={{ color: WARM, fontFamily: SERIF, fontStyle: "italic", fontSize: 22, lineHeight: 1.6, margin: 0 }}>{GLORIA_PATRI}</p>
          </div>
        )}

        {onConcluding && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 18 }}>
            <div style={{ fontSize: 40 }} aria-hidden>🌿</div>
            <p style={{ color: "#E8E4D8", fontFamily: SERIF, fontStyle: "italic", fontSize: 20, lineHeight: 1.5, margin: 0, maxWidth: 420 }}>The psalms are prayed.</p>
            <p style={{ color: FAINT_GREEN, fontFamily: FONT, fontSize: 13, letterSpacing: "0.04em", margin: 0 }}>{office === "evening" ? "Evening Psalms" : "Morning Psalms"}</p>
            <button onClick={goHome} style={{ marginTop: 12, background: "rgba(46,107,64,0.4)", border: "1px solid rgba(168,197,160,0.45)", color: WARM, borderRadius: 999, padding: "11px 30px", fontSize: 15, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>Home</button>
          </div>
        )}
      </div>

      {/* Footer — Back · counter · Next/Done. */}
      {!onConcluding && (
        <div style={{ flexShrink: 0, display: "flex", justifyContent: "center", padding: "10px 0 max(1.25rem, env(safe-area-inset-bottom))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, background: "rgba(9,26,16,0.55)", backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)", border: "1px solid rgba(168,197,160,0.22)", borderRadius: 999, padding: "8px 10px 8px 18px" }}>
            <button onClick={back} style={{ background: "none", border: "none", color: SOFT_GREEN, fontFamily: FONT, fontSize: 15, fontWeight: 600, cursor: "pointer", padding: "6px 10px" }}>Back</button>
            <span style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT, fontSize: 12, letterSpacing: "0.08em" }}>{index + 1} of {total} · PSALM</span>
            <button onClick={next} style={{ background: "rgba(46,107,64,0.6)", border: "1px solid rgba(168,197,160,0.4)", color: WARM, fontFamily: FONT, fontSize: 15, fontWeight: 600, borderRadius: 999, padding: "8px 20px", cursor: "pointer" }}>{atEnd ? "Done" : "Next"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
