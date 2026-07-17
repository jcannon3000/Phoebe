import { useEffect, useMemo, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { getPsalmCycle, setPsalmCycle, getSideLevel, type PsalmCycle } from "@/lib/officePrefs";
import { markPsalmsPrayed } from "@/lib/cacReadState";
import { LEAF_PHOTOS, PLANET_PHOTOS } from "@/lib/earthPhotos";
import { OfficeDisplaySheet, useOfficeDisplay, fontScaleWrapStyle } from "@/components/OfficeDisplaySheet";
import { officeThemeStyle } from "@/lib/officeDisplay";
import { usePodcastPlayer } from "@/components/PodcastPlayer";
import { PracticeIntro } from "@/components/PracticeIntro";
import { hasSeenIntro, markIntroSeen } from "@/lib/practiceIntros";
import { PointedLine } from "@/components/PointedLine";

// ── /psalms — Praying the Psalms, rendered like the daily office ─────────────
//
// Opens with a "before you begin" chooser (lectionary + format, the same pill
// UI the office intro uses), then renders today's appointed psalms in the SAME
// immersive dark style as Morning/Evening Prayer — a leaf backdrop, a big
// "Psalm N · From the Daily Office Lectionary" title slide, then the pointed
// verses with a verse-number gutter, the BCP page on every slide. "Physical
// BCP" shows a page-number guide instead. Self-contained (it does NOT reuse the
// office viewer), so finishing marks only the day's Praying-the-Psalms practice.

const FONT = "var(--office-font, 'Space Grotesk', system-ui, sans-serif)";
const SERIF = "Georgia, 'Times New Roman', serif";
const WARM = "var(--oh-ink, #F0EDE6)";
const FAINT_GREEN = "rgba(var(--ot-sage, 143,175,150),0.55)";
const SOFT_GREEN = "rgba(var(--ot-mist, 200,212,192),0.75)";
const PAGE_REF = "rgba(var(--ot-fern, 168,197,160),0.7)";
const BG = "var(--oh-bg, #0C1F12)";
// The EXACT background prayer-mode.tsx's closing phase starts at
// (phaseBg for phase==="closing"/"blessing"). Finishing here fades a solid
// overlay of THIS color in (not just this screen's own opacity to 0) so the
// route swap lands on an already-matching frame — the destination's own
// backdrop photo then fades in over it with no perceptible cut, instead of
// the screen dimming to ITS OWN background (a different shade) and still
// hard-cutting to the closing slide's flat starting color.
const CLOSING_BG = "var(--oh-closing, #11291C)";

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

// A rendered slide: the big psalm title, a chunk of verses, or the doxology.
type PsalmSlide =
  | { kind: "title"; headline: string; bcpRef: string }
  | { kind: "verses"; eyebrow: string; verses: Verse[]; bcpRef: string }
  | { kind: "gloria"; eyebrow: string };

// A parsed verse: its number + the half-lines (BCP pointing keeps the second
// half on its own indented line — `indented` drives that visual offset, same
// as the office's parsePsalmContent in bcp-daily-office.tsx).
type PsalmVerseLine = { text: string; indented: boolean };
type Verse = { num: string; lines: PsalmVerseLine[] };

// Split the pointed BCP text into verses (a line beginning "N " starts one;
// continuation/hemistich lines belong to the verse above — a LEADING space in
// the source marks the second hemistich, mirrored here as `indented`), then
// group into chunks of 4 (like the office).
function parseVerses(content: string): Verse[] {
  const verses: Verse[] = [];
  let cur: Verse | null = null;
  for (const rawLine of content.split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    if (line.length === 0) continue;
    const m = line.match(/^(\d+)\s+(.*)$/);
    if (m) {
      if (cur) verses.push(cur);
      cur = { num: m[1], lines: [{ text: m[2], indented: false }] };
    } else if (cur) {
      const indented = /^\s/.test(rawLine);
      cur.lines.push({ text: line.trim(), indented });
    } else {
      cur = { num: "", lines: [{ text: line.trim(), indented: false }] };
    }
  }
  if (cur) verses.push(cur);
  return verses;
}

function refLabel(p: Psalm): string {
  return p.range ? `${p.number}:${p.range[0]}-${p.range[1]}` : `${p.number}`;
}

// Psalm NUMBERS in a citation ("Psalm 107:33-43, 108" → [107, 108]) — used to
// match today's appointed psalm(s) to the Scripture Day by Day psalm segment.
// The podcast reads specific verses, so we match on number, not verse.
function psalmNumbersFromCitation(s: string): number[] {
  return s.replace(/.*?psalms?\s*/i, "").split(/[,&]/).map((p) => {
    const m = p.trim().match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : NaN;
  }).filter((n) => Number.isFinite(n) && n >= 1 && n <= 150);
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
  // When Praying the Psalms IS this side's prayer, finishing hands off to the
  // office's closing flow (the reflection / newsletter "next thing").
  const isDailyPrayer = getSideLevel(office) === "psalms";
  const today = new Date().toLocaleDateString("en-CA");
  const sideLabel = office === "evening" ? "Evening Psalms" : "Morning Psalms";

  // Chooser state — the lectionary + format, seeded from URL / saved pref.
  const [cycle, setCycle] = useState<PsalmCycle>(() => {
    const c = params.get("cycle");
    return c === "office" || c === "monthly" ? c : getPsalmCycle();
  });
  const [format, setFormat] = useState<"screen" | "book" | "listen">(() => (params.get("book") === "1" ? "book" : "screen"));
  // Coming from the Daily Prayer chooser (?begin=1) the user already picked their
  // lectionary + format there, so skip the "before you begin" intro and drop
  // straight into the reading (or the physical-book guide). Only the home Psalms
  // card / a bare /psalms link still opens on the chooser.
  const skipIntro = params.get("begin") === "1";
  // intro = the "before you begin" chooser; read = the verse slideshow; guide =
  // the physical-book page-number list.
  const [step, setStep] = useState<"intro" | "read" | "guide">(
    skipIntro ? (params.get("book") === "1" ? "guide" : "read") : "intro",
  );

  const { data, isLoading } = useQuery<{ psalms: Psalm[] }>({
    queryKey: ["/api/psalms/today", cycle, office, today],
    queryFn: () => apiRequest("GET", `/api/psalms/today?cycle=${cycle}&office=${office}&date=${today}`),
    staleTime: 30 * 60_000,
  });

  // Scripture Day by Day reads the day's psalm aloud — offer "Listen" when its
  // psalm segment matches today's appointed psalm(s).
  const player = usePodcastPlayer();
  const scriptureEpisodeQ = useQuery<{ audioUrl: string | null; durationSeconds: number | null; title: string | null; imageUrl: string | null }>({
    queryKey: ["/api/podcast/scripture-day-by-day/today"],
    queryFn: () => apiRequest("GET", "/api/podcast/scripture-day-by-day/today"),
    staleTime: 30 * 60_000,
  });
  const scriptureAlignQ = useQuery<{ status: string; sections: Array<{ id: string; title: string | null; startSeconds: number; endSeconds: number | null }> }>({
    queryKey: ["/api/podcast/scripture/timestamps"],
    queryFn: () => apiRequest("GET", "/api/podcast/scripture/timestamps"),
    staleTime: 5 * 60_000,
    refetchInterval: (q) => { const s = q.state.data?.status; return s === "done" || s === "failed" ? false : 8000; },
  });
  // The podcast psalm segment, but only when it matches a psalm appointed today.
  const psalmSeg = useMemo(() => {
    const seg = (scriptureAlignQ.data?.sections ?? []).find((s) => s.id === "psalm");
    if (!seg || !scriptureEpisodeQ.data?.audioUrl) return null;
    const podcastNums = psalmNumbersFromCitation(seg.title ?? "");
    const dayNums = (data?.psalms ?? []).map((p) => p.number);
    return dayNums.some((n) => podcastNums.includes(n)) ? seg : null;
  }, [scriptureAlignQ.data, scriptureEpisodeQ.data, data]);
  const canListen = !!psalmSeg;
  const [loadingQuote] = useState(() => PSALM_LOADING_QUOTES[Math.floor(Math.random() * PSALM_LOADING_QUOTES.length)]);

  const slides = useMemo(() => buildSlides(data?.psalms ?? []), [data]);
  const total = slides.length;
  const [index, setIndex] = useState(0);
  // Finishing hands off to a DIFFERENT page (/prayer-mode's closing slide, or
  // /dashboard) — an instant route swap cuts from this screen's bright leaf
  // photo straight to the destination's flat starting background (its own
  // photo fades in separately), which read as a flash. Fade this screen OUT
  // first so the transition settles to a shared dark tone before the swap.
  const [leaving, setLeaving] = useState(false);
  // First-ever visit gets a one-card intro to what the Psalms ARE (what it is /
  // where it comes from / what to do), so a beginner isn't dropped into a
  // lectionary chooser unguided.
  const [introDismissed, setIntroDismissed] = useState(false);

  // Display prefs (text size + backdrop) — the same device-local officeDisplay
  // prefs as the office deck, changed live from the ⚙ sheet.
  const display = useOfficeDisplay();
  const [displayOpen, setDisplayOpen] = useState(false);

  // A still backdrop, picked once per backdrop choice — Leaves (default),
  // Planet (landscapes minus the animals), or none for Plain (solid green).
  const bgPhotoSet = (display.backdrop === "plain" || display.backdrop === "paper") ? [] : display.backdrop === "planet" ? PLANET_PHOTOS : LEAF_PHOTOS;
  const leaf = useMemo(
    () => (bgPhotoSet.length > 0 ? bgPhotoSet[Math.floor(Math.random() * bgPhotoSet.length)]! : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [display.backdrop],
  );

  // ── Resume — a phone call at Psalm 78 shouldn't restart the deck. ─────────
  // Same per-day progress-key pattern as the office slideshow: restore once
  // the slides exist, persist on every advance, clear on finish. Keyed by
  // side + day + lectionary so yesterday's place (or the other office's)
  // never bleeds in; stale keys from previous days are pruned on mount.
  const progressKey = `phoebe:psalms-progress:${office}:${today}:${cycle}`;
  const restoredRef = useRef(false);
  useEffect(() => {
    try {
      const stale: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("phoebe:psalms-progress:") && !k.includes(`:${today}:`)) stale.push(k);
      }
      for (const k of stale) localStorage.removeItem(k);
    } catch { /* private mode */ }
  }, [today]);
  useEffect(() => {
    if (restoredRef.current || step !== "read" || slides.length === 0) return;
    restoredRef.current = true;
    try {
      const n = parseInt(localStorage.getItem(progressKey) ?? "", 10);
      if (Number.isFinite(n) && n > 0 && n < slides.length) setIndex(n);
    } catch { /* private mode */ }
  }, [step, slides.length, progressKey]);
  useEffect(() => {
    if (step !== "read" || index <= 0) return;
    try { localStorage.setItem(progressKey, String(index)); } catch { /* private mode */ }
  }, [index, step, progressKey]);

  // Swipe left → next, right → prev — same thresholds as the office deck
  // (horizontal must dominate vertical so long-psalm scrolling isn't hijacked).
  const swipeXRef = useRef<number | null>(null);
  const swipeYRef = useRef<number | null>(null);
  const handleSwipeTouchStart = (e: React.TouchEvent) => {
    swipeXRef.current = e.touches[0].clientX;
    swipeYRef.current = e.touches[0].clientY;
  };
  const makeSwipeTouchEnd = (onNext: () => void, onPrev: () => void) => (e: React.TouchEvent) => {
    if (swipeXRef.current === null || swipeYRef.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeXRef.current;
    const dy = e.changedTouches[0].clientY - swipeYRef.current;
    swipeXRef.current = null;
    swipeYRef.current = null;
    if (Math.abs(dy) > Math.abs(dx)) return; // primarily vertical — let scroll handle it
    if (Math.abs(dx) < 50) return;            // too small — ignore
    if (dx < 0) onNext();
    else onPrev();
  };

  const goHome = () => setLocation("/dashboard");
  // Finishing the psalms = the day's Praying-the-Psalms is kept (side-scoped).
  // Fade out FIRST, then swap routes — the destination's own fade-in picks up
  // from the same dark tone this settles to, so the handoff reads as one
  // continuous dim-then-lighten instead of a hard, flashing cut.
  const finish = () => {
    markPsalmsPrayed(office);
    try { localStorage.removeItem(progressKey); } catch { /* private mode */ }
    setLeaving(true);
    window.setTimeout(() => {
      if (isDailyPrayer) setLocation(`/prayer-mode?closingOnly=1&side=${office}`);
      else goHome();
    }, 240);
  };
  const beginFromIntro = () => {
    setPsalmCycle(cycle); // remember the chosen lectionary
    if (format === "listen" && psalmSeg && scriptureEpisodeQ.data?.audioUrl) {
      const ep = scriptureEpisodeQ.data;
      const audioUrl = ep.audioUrl as string; // guarded above
      player.play({
        showSlug: "scripture-day-by-day",
        episodeId: audioUrl,
        title: ep.title ?? "Scripture Day by Day",
        audioUrl,
        imageUrl: ep.imageUrl ?? null,
        showTitle: "Scripture Day by Day",
        showArtwork: ep.imageUrl ?? null,
        durationSeconds: ep.durationSeconds ?? null,
        sessionSurface: "scripture-audio",
        showHref: "/podcasts/show/scripture-day-by-day",
        startAtSeconds: psalmSeg.startSeconds,
        stopAtSeconds: psalmSeg.endSeconds ?? undefined,
        collapseOnStop: true,
      });
      markPsalmsPrayed(office); // hearing the day's psalm counts as praying it
      return;
    }
    if (format === "book") setStep("guide");
    else { setIndex(0); setStep("read"); }
  };
  const advance = () => {
    if (index >= slides.length - 1) { finish(); return; }
    setIndex((i) => i + 1);
  };
  // Back from the first slide / the guide: normally returns to the chooser, but
  // when we skipped it (came from Daily Prayer) there's no chooser to return to,
  // so leave the way they came in.
  const backToChooser = () => { if (skipIntro) goHome(); else setStep("intro"); };
  const back = () => {
    if (index > 0) { setIndex((i) => i - 1); return; }
    backToChooser(); // at the first slide → back to the chooser (or out)
  };

  const eyebrowLabel = office === "evening" ? "The Psalm Appointed For This Evening" : "The Psalm Appointed For This Morning";
  const sourceLabel = cycle === "monthly" ? "From the Monthly Psalter" : "From the Daily Office Lectionary";

  // ── First-run intro — teach the practice before the chooser. ─────────────
  if (!introDismissed && !hasSeenIntro("psalms")) {
    const dismiss = () => { markIntroSeen("psalms"); setIntroDismissed(true); };
    return <PracticeIntro intro="psalms" onBegin={dismiss} onSkip={dismiss} />;
  }

  // ── Loading / empty ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={{ position: "fixed", inset: 0, background: BG, display: "flex", flexDirection: "column", justifyContent: "center", padding: 36 }}>
        <p style={{ color: "var(--oh-ink2, #E8E4D8)", fontFamily: SERIF, fontStyle: "italic", fontSize: 18, lineHeight: 1.55, margin: 0, maxWidth: 460 }}>
          &ldquo;{loadingQuote.text}&rdquo;
        </p>
        <p style={{ color: FAINT_GREEN, fontFamily: FONT, fontSize: 12.5, letterSpacing: "0.04em", margin: "12px 0 0" }}>— {loadingQuote.author}</p>
        <p style={{ color: "rgba(var(--ot-sage, 143,175,150),0.5)", fontFamily: FONT, fontSize: 14, marginTop: 28 }}>Gathering today's psalms…</p>
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

  // Shared chrome — landscape backdrop + header (Back · side label · close).
  // Leaf backdrop, matching the office — a little brighter than before (owner).
  const Backdrop = leaf ? (
    <>
      <img src={leaf} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.8, filter: "blur(3px)", transform: "scale(1.02)", zIndex: -2 }} />
      <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(var(--ot-wash3, 12,31,18),0.85) 0%, rgba(var(--ot-wash3, 12,31,18),0.7) 45%, rgba(var(--ot-wash3, 12,31,18),0.9) 100%)" }} />
    </>
  ) : null;
  const header = (onBack: () => void) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "max(0.75rem, var(--safe-top)) 20px 4px", flexShrink: 0 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: FAINT_GREEN, fontFamily: FONT, fontSize: 15, cursor: "pointer", padding: 6 }}>← Back</button>
      <span style={{ borderRadius: 999, border: "1px solid rgba(var(--ot-fern, 168,197,160),0.3)", color: SOFT_GREEN, fontFamily: FONT, fontSize: 14, fontWeight: 600, padding: "6px 16px" }}>{sideLabel}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => setDisplayOpen(true)} aria-label="Display settings" style={{ width: 34, height: 34, borderRadius: 999, border: "1px solid rgba(var(--ot-fern, 168,197,160),0.3)", background: "none", color: FAINT_GREEN, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}><Settings2 size={15} /></button>
        <button onClick={goHome} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 999, border: "1px solid rgba(var(--ot-fern, 168,197,160),0.3)", background: "none", color: FAINT_GREEN, fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </span>
    </div>
  );

  // ── Intro chooser — same pill UI as the office "before you begin" ─────────
  if (step === "intro") {
    const pill = (label: string, value: string, opts: Array<{ value: string; label: string }>, onChange: (v: string) => void) => (
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", borderRadius: 14, padding: "15px 18px", background: "rgba(var(--ot-card2, 24,46,34),0.4)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(var(--ot-fern, 168,197,160),0.3)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}>
        <span style={{ color: WARM, fontFamily: FONT, fontSize: 15.5, fontWeight: 600 }}>{label}</span>
        <span style={{ color: SOFT_GREEN, fontFamily: FONT, fontSize: 14.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
          {opts.find((o) => o.value === value)?.label}<span aria-hidden style={{ opacity: 0.7 }}>▾</span>
        </span>
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, appearance: "none", WebkitAppearance: "none", MozAppearance: "none", border: "none", outline: "none", cursor: "pointer", background: "transparent", color: WARM }}>
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
    return (
      <div style={{ ...officeThemeStyle(display.backdrop, display.font), position: "fixed", inset: 0, background: BG, overflow: "hidden", isolation: "isolate", display: "flex", flexDirection: "column" }}>
        {Backdrop}
        <OfficeDisplaySheet open={displayOpen} onClose={() => setDisplayOpen(false)} />
        {header(goHome)}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "8px 28px", gap: 16 }}>
          <p style={{ color: FAINT_GREEN, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0, fontWeight: 600 }}>Before you begin</p>
          <h1 className="title-glow-breathe" style={{ fontFamily: FONT, fontSize: "clamp(40px, 8vw, 72px)", fontWeight: 700, letterSpacing: "-0.02em", color: WARM, margin: 0, lineHeight: 1.05 }}>{sideLabel}</h1>
          <p style={{ fontSize: 16, lineHeight: 1.6, fontFamily: FONT, color: "rgba(var(--ot-mist, 200,212,192),0.85)", margin: "0 0 8px" }}>The psalms appointed for today, from the Book of Common Prayer.</p>
          <div style={{ width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 10 }}>
            {pill("Lectionary", cycle, [
              { value: "office", label: "Daily Office Lectionary" },
              { value: "monthly", label: "Monthly Psalter" },
            ], (v) => setCycle(v as PsalmCycle))}
            {pill("Format", format, [
              { value: "screen", label: "Digital" },
              { value: "book", label: "Physical" },
              ...(canListen ? [{ value: "listen", label: "Listen" }] : []),
            ], (v) => setFormat(v as "screen" | "book" | "listen"))}
          </div>
        </div>
        <div style={{ flexShrink: 0, padding: "10px 28px max(1.25rem, env(safe-area-inset-bottom))", display: "flex", justifyContent: "center" }}>
          <button onClick={beginFromIntro} style={{ width: "100%", maxWidth: 380, background: "rgba(var(--ot-green, 46,107,64),0.6)", border: "1px solid rgba(var(--ot-fern, 168,197,160),0.45)", color: WARM, borderRadius: 999, padding: "14px 24px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}>
            Begin <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Physical-BCP guide — one card per psalm with its page number ─────────
  if (step === "guide") {
    const psalms = data?.psalms ?? [];
    return (
      <div style={{ ...officeThemeStyle(display.backdrop, display.font), position: "fixed", inset: 0, background: BG, overflow: "hidden", isolation: "isolate", display: "flex", flexDirection: "column" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 999, background: CLOSING_BG, opacity: leaving ? 1 : 0, transition: "opacity 240ms ease", pointerEvents: "none" }} />
        {Backdrop}
        <OfficeDisplaySheet open={displayOpen} onClose={() => setDisplayOpen(false)} />
        {header(backToChooser)}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 24px max(1.5rem, env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <p style={{ color: FAINT_GREEN, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: "8px 0 4px", fontWeight: 600 }}>{eyebrowLabel}</p>
          <h1 style={{ fontFamily: FONT, fontSize: "clamp(30px, 7vw, 44px)", fontWeight: 700, letterSpacing: "-0.02em", color: WARM, margin: "0 0 6px", textAlign: "center" }}>{sideLabel}</h1>
          <p style={{ fontSize: 14.5, fontFamily: FONT, color: SOFT_GREEN, margin: "0 0 22px", textAlign: "center" }}>Find them in your Book of Common Prayer.</p>
          <div style={{ width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", gap: 12 }}>
            {psalms.map((p) => (
              <div key={p.number + "-" + p.raw} style={{ display: "flex", alignItems: "center", gap: 14, borderRadius: 16, padding: "16px 18px", background: "rgba(var(--ot-card, 22,46,32),0.45)", backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)", border: "1px solid rgba(var(--ot-fern, 168,197,160),0.22)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, color: WARM, fontFamily: FONT, fontSize: 18, fontWeight: 700 }}>Psalm {refLabel(p)}</p>
                  {p.title && <p style={{ margin: "2px 0 0", color: "rgba(var(--ot-mist, 200,212,192),0.6)", fontFamily: SERIF, fontStyle: "italic", fontSize: 14 }}>{p.title}</p>}
                </div>
                <span style={{ flexShrink: 0, color: PAGE_REF, fontFamily: FONT, fontSize: 13, fontWeight: 600, letterSpacing: "0.04em" }}>{p.bcpRef || ""}</span>
              </div>
            ))}
          </div>
          <button onClick={finish} style={{ marginTop: 26, background: "rgba(var(--ot-green, 46,107,64),0.6)", border: "1px solid rgba(var(--ot-fern, 168,197,160),0.4)", color: WARM, borderRadius: 999, padding: "12px 30px", fontSize: 15, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
            I've prayed them <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Read — the verse slideshow ───────────────────────────────────────────
  const slide = slides[index];
  const atEnd = index >= slides.length - 1;
  return (
    <div style={{ ...officeThemeStyle(display.backdrop, display.font), position: "fixed", inset: 0, background: BG, overflow: "hidden", isolation: "isolate", display: "flex", flexDirection: "column", userSelect: "none", WebkitUserSelect: "none" }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 999, background: CLOSING_BG, opacity: leaving ? 1 : 0, transition: "opacity 240ms ease", pointerEvents: "none" }} />
      {Backdrop}
      <OfficeDisplaySheet open={displayOpen} onClose={() => setDisplayOpen(false)} />
      {header(back)}

      {/* Slide body — tap the right half to advance, left half to go back.
          Horizontal padding (20px) matches the office's own slide column
          (`px-5`) so the two surfaces read at the same width. */}
      <div
        onClick={(e) => { const w = (e.currentTarget as HTMLElement).clientWidth; if (e.clientX > w / 2) advance(); else back(); }}
        onTouchStart={handleSwipeTouchStart}
        onTouchEnd={makeSwipeTouchEnd(advance, back)}
        style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", padding: "8px 20px 0", cursor: "pointer", WebkitOverflowScrolling: "touch" }}
      >
        {/* Text size (A− / A+): zoom + width compensation on the slide content
            only — the tap container above stays unzoomed so its left/right
            halves keep measuring correctly. */}
        <div style={{ width: "100%", margin: "0 auto", flex: 1, display: "flex", flexDirection: "column", ...fontScaleWrapStyle(display.fontScale, 600) }}>
        {slide?.kind === "title" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 16 }}>
            <p style={{ color: FAINT_GREEN, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0, fontWeight: 600 }}>{eyebrowLabel}</p>
            <h1 style={{ fontFamily: FONT, fontSize: "clamp(48px, 9vw, 88px)", fontWeight: 700, letterSpacing: "-0.02em", color: WARM, margin: 0, lineHeight: 1.0 }}>{slide.headline}</h1>
            <p style={{ fontSize: 19, fontFamily: FONT, color: SOFT_GREEN, margin: 0 }}>{sourceLabel}</p>
            {slide.bcpRef && <p style={{ marginTop: 18, fontSize: 12.5, letterSpacing: "0.12em", textTransform: "uppercase", color: PAGE_REF, fontFamily: FONT }}>{slide.bcpRef}</p>}
          </div>
        )}

        {slide?.kind === "verses" && (
          // Width, gutter, and typography match the office's own psalm-verse
          // slide (bcp-daily-office.tsx) exactly — same maxWidth, verse-number
          // gutter, and PointedLine hemistich treatment (the second half of a
          // pointed verse indents, and a trailing " *" never orphans).
          <div style={{ maxWidth: 600, width: "100%", margin: "0 auto", paddingTop: 18 }}>
            <p style={{ color: FAINT_GREEN, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", margin: "0 0 22px", fontWeight: 600 }}>
              {slide.eyebrow.replace(/^PSALM\b/i, "PSALM")}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {slide.verses.map((v, i) => (
                <div key={i} style={{ display: "flex", gap: 7 }}>
                  <span style={{ flex: "0 0 auto", minWidth: 16, textAlign: "left", color: "rgba(var(--ot-sage, 143,175,150),0.45)", fontFamily: FONT, fontSize: 13, lineHeight: 1.6, paddingTop: 2 }}>{v.num}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {v.lines.map((ln, j) => (
                      <PointedLine
                        key={j}
                        text={ln.text}
                        style={{ margin: 0, color: WARM, fontFamily: FONT, fontSize: 19, lineHeight: 1.6, paddingLeft: ln.indented ? 16 : 0, whiteSpace: "pre-wrap" }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {slide.bcpRef && <p style={{ marginTop: 14, fontSize: 11.5, letterSpacing: "0.12em", textTransform: "uppercase", color: PAGE_REF, fontFamily: FONT }}>{slide.bcpRef}</p>}
          </div>
        )}

        {slide?.kind === "gloria" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 18, maxWidth: 560, margin: "0 auto" }}>
            <p style={{ color: FAINT_GREEN, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0, fontWeight: 600 }}>Doxology</p>
            <p style={{ color: WARM, fontFamily: SERIF, fontStyle: "italic", fontSize: 22, lineHeight: 1.6, margin: 0 }}>{GLORIA_PATRI}</p>
          </div>
        )}
        </div>
      </div>

      {/* Footer — Back · section label · Next/Done. */}
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "center", padding: "10px 0 max(1.25rem, env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: "rgba(var(--ot-deep, 9,26,16),0.55)", backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)", border: "1px solid rgba(var(--ot-fern, 168,197,160),0.22)", borderRadius: 999, padding: "8px 10px 8px 18px" }}>
          <button onClick={back} style={{ background: "none", border: "none", color: SOFT_GREEN, fontFamily: FONT, fontSize: 15, fontWeight: 600, cursor: "pointer", padding: "6px 10px" }}>Back</button>
          <span style={{ color: "rgba(var(--ot-sage, 143,175,150),0.55)", fontFamily: FONT, fontSize: 12, letterSpacing: "0.08em" }}>PSALM {index + 1} / {total}</span>
          <button onClick={advance} style={{ background: "rgba(var(--ot-green, 46,107,64),0.6)", border: "1px solid rgba(var(--ot-fern, 168,197,160),0.4)", color: WARM, fontFamily: FONT, fontSize: 15, fontWeight: 600, borderRadius: 999, padding: "8px 20px", cursor: "pointer" }}>{atEnd ? "Done" : "Next"}</button>
        </div>
      </div>
    </div>
  );
}
