import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { usePodcastPlayer, type PlayingEpisode } from "@/components/PodcastPlayer";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { FROST } from "@/lib/frost";
import { getScriptureScope, setScriptureScope, type ScriptureScope } from "@/lib/customAnchors";
import { playChime, CHIME_MS } from "@/lib/chime";

// ── Scripture Day by Day — listen reading by reading ───────────────────────
//
// The "Scripture Day by Day" podcast (Forward Movement) reads the day's four
// appointed passages aloud, in order: Old Testament → Psalm → New Testament →
// Gospel, after a short intro. The alignment pipeline (GET
// /api/podcast/scripture/timestamps) flags where each one begins/ends.
//
// Two ways to listen: tap a single reading (plays just that part), or "Listen"
// to play THROUGH the readings you've chosen (Psalms / Psalms+Gospel / All) in
// sequence, with a chime between each passage — skipping the ones not in scope
// (so Psalms & Gospel plays the psalm, chimes, then jumps to the Gospel).

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Section = {
  id: string;
  type: string;
  title: string | null;
  startSeconds: number;
  endSeconds: number | null;
  confidence: number;
  predicted?: boolean;
};
type ReadingKind = "ot" | "psalm" | "nt" | "gospel";
type Reading = { kind: ReadingKind; citation: string };

const KIND_ORDER: ReadingKind[] = ["ot", "psalm", "nt", "gospel"];
const KIND_LABEL: Record<ReadingKind, string> = {
  ot: "Old Testament", psalm: "Psalm", nt: "New Testament", gospel: "Gospel",
};
const KIND_EMOJI: Record<ReadingKind, string> = { ot: "📜", psalm: "🎵", nt: "✉️", gospel: "✝️" };

// Which readings each scope plays, in spoken order.
const SCOPE_KINDS: Record<ScriptureScope, ReadingKind[]> = {
  psalms: ["psalm"],
  "psalms-gospel": ["psalm", "gospel"],
  all: ["ot", "psalm", "nt", "gospel"],
};
const SCOPE_LABEL: Record<ScriptureScope, string> = {
  psalms: "Psalms",
  "psalms-gospel": "Psalms & Gospel",
  all: "All",
};
const SCOPES: ScriptureScope[] = ["psalms", "psalms-gospel", "all"];

type Episode = { audioUrl: string | null; durationSeconds: number | null; title: string | null; imageUrl: string | null };

export default function ScriptureReadingsPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const player = usePodcastPlayer();
  const [scope, setScope] = useState<ScriptureScope>(() => getScriptureScope());
  const chooseScope = (s: ScriptureScope) => { setScope(s); setScriptureScope(s); };

  // A leaf photo behind the page, picked once.
  const bgPhoto = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [authLoading, user, setLocation]);

  const episodeQ = useQuery<Episode>({
    queryKey: ["/api/podcast/scripture-day-by-day/today"],
    queryFn: () => apiRequest("GET", "/api/podcast/scripture-day-by-day/today"),
    enabled: !!user,
    staleTime: 30 * 60_000,
  });
  const alignQ = useQuery<{ status: string; readings?: Reading[]; sections: Section[] }>({
    queryKey: ["/api/podcast/scripture/timestamps"],
    queryFn: () => apiRequest("GET", "/api/podcast/scripture/timestamps"),
    enabled: !!user,
    staleTime: 5 * 60_000,
    // Poll while the alignment is still being computed (first open of the day).
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "done" || s === "failed" ? false : 6000;
    },
  });

  const ep = episodeQ.data;
  const audioUrl = ep?.audioUrl ?? null;
  const sections = useMemo(() => alignQ.data?.sections ?? [], [alignQ.data]);
  const aligning = alignQ.data?.status === "building" || alignQ.data?.status === "pending";

  // The section for each reading kind (buildScriptureAlignment stores id = kind).
  const sectionByKind = useMemo(() => {
    const m = new Map<ReadingKind, Section>();
    for (const s of sections) if ((KIND_ORDER as string[]).includes(s.id)) m.set(s.id as ReadingKind, s);
    return m;
  }, [sections]);

  // All sections in audio order — used to bound a reading that has no explicit
  // end: its end is the NEXT thing in the audio (even an out-of-scope reading,
  // or the intro/outro), so a passage never spills past its own part.
  const sectionsByStart = useMemo(
    () => [...sections].sort((a, b) => a.startSeconds - b.startSeconds),
    [sections],
  );
  const stopFor = (sec: Section): number | undefined => {
    if (sec.endSeconds != null) return sec.endSeconds;
    const next = sectionsByStart.find((s) => s.startSeconds > sec.startSeconds + 0.5);
    return next ? next.startSeconds : (ep?.durationSeconds ?? undefined);
  };

  // The four readings in spoken order. Prefer the feed-parsed citations (shown
  // even before alignment); fall back to the aligned section titles.
  const readings: Reading[] = useMemo(() => {
    const fromFeed = alignQ.data?.readings ?? [];
    if (fromFeed.length > 0) return [...fromFeed].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
    return KIND_ORDER
      .map((kind) => ({ kind, citation: sectionByKind.get(kind)?.title ?? "" }))
      .filter((r) => r.citation);
  }, [alignQ.data, sectionByKind]);

  // Only the readings in the chosen scope, in spoken order.
  const inScope = SCOPE_KINDS[scope];
  const shownReadings = readings.filter((r) => inScope.includes(r.kind));
  // Of those, which actually have an aligned section we can play.
  const playableKinds = inScope.filter((k) => sectionByKind.has(k));
  const canPlayThrough = !!audioUrl && playableKinds.length > 0;

  const baseEpisode = (sec: Section, onSegmentEnd?: () => void): PlayingEpisode => {
    const kind = sec.id as ReadingKind;
    const citation = readings.find((r) => r.kind === kind)?.citation || sec.title || KIND_LABEL[kind];
    return {
    showSlug: "scripture-day-by-day",
    episodeId: audioUrl!, // /today gives no guid; the day's audio url is a stable id
    // The player shows the category over the artwork (segmentEyebrow) with the
    // citation as the title.
    title: citation,
    segmentEyebrow: KIND_LABEL[kind],
    audioUrl: audioUrl!,
    imageUrl: ep?.imageUrl ?? null,
    showTitle: "Scripture Day by Day",
    showArtwork: ep?.imageUrl ?? null,
    durationSeconds: ep?.durationSeconds ?? null,
    sessionSurface: "scripture-audio",
    showHref: "/podcasts/show/scripture-day-by-day",
    startAtSeconds: sec.startSeconds,
    // Always bound the segment to this reading's part — fall back to the next
    // section's start (or the episode end) when the alignment left the end open.
    stopAtSeconds: stopFor(sec),
    onSegmentEnd,
    };
  };

  // Play just one reading (a single tap on a card).
  const playReading = (sec: Section) => {
    if (!audioUrl) return;
    markPracticeDoneToday("scripture");
    player.play(baseEpisode(sec));
  };

  // Play THROUGH the in-scope readings: passage → chime → next passage. Out-of-
  // scope readings (e.g. OT + NT for "Psalms & Gospel") are simply not queued,
  // so it jumps straight from the psalm to the Gospel.
  const playThrough = () => {
    if (!audioUrl || playableKinds.length === 0) return;
    markPracticeDoneToday("scripture");
    let i = 0;
    const step = () => {
      const sec = sectionByKind.get(playableKinds[i]);
      if (!sec) return;
      player.play(baseEpisode(sec, () => {
        i += 1;
        if (i < playableKinds.length) {
          playChime();
          window.setTimeout(step, CHIME_MS);
        }
      }));
    };
    step();
  };

  if (authLoading || !user) return null;

  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div style={{ position: "relative", minHeight: "100dvh", background: "#0a1a10", color: WARM, fontFamily: FONT, display: "flex", flexDirection: "column", isolation: "isolate" }}>
      {/* Leaves + frost — a quiet, dark frosted leaf field behind the readings. */}
      {bgPhoto && (
        <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, backgroundImage: `url(${bgPhoto})`, backgroundSize: "cover", backgroundPosition: "center" }} />
      )}
      <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, background: "linear-gradient(180deg, rgba(6,14,9,0.88) 0%, rgba(6,14,9,0.82) 45%, rgba(6,14,9,0.94) 100%)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }} />

      <header style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "max(1.1rem, calc(var(--safe-top) + 0.5rem)) 18px 6px" }}>
        <button type="button" onClick={() => setLocation("/dashboard")} style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0 }}>
          ← Back
        </button>
        <span style={{ fontSize: 12.5, color: FAINT, fontWeight: 600 }}>Scripture · {dateLabel}</span>
        <span style={{ width: 36 }} />
      </header>

      <main style={{ position: "relative", zIndex: 1, flex: 1, padding: "8px 18px 24px", maxWidth: 560, width: "100%", margin: "0 auto" }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.01em", margin: "10px 2px 4px" }}>The day's readings</h1>
        <p style={{ fontSize: 13.5, color: FAINT, margin: "0 2px 18px", lineHeight: 1.5 }}>
          Listen straight through, or tap a single reading to hear just that passage.
        </p>

        {/* Scope switcher — Psalms / Psalms & Gospel / All. */}
        <div role="tablist" aria-label="What to listen to" style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {SCOPES.map((s) => {
            const on = scope === s;
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => chooseScope(s)}
                style={{
                  flex: 1, padding: "9px 8px", borderRadius: 999, fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
                  background: on ? "rgba(46,107,64,0.85)" : "rgba(255,255,255,0.05)",
                  color: on ? WARM : SAGE,
                  border: `1px solid ${on ? "rgba(168,197,160,0.45)" : "rgba(255,255,255,0.10)"}`,
                  cursor: "pointer",
                }}
              >
                {SCOPE_LABEL[s]}
              </button>
            );
          })}
        </div>

        {/* Listen-through — plays the in-scope readings in order with a chime
            between each. */}
        <button
          type="button"
          disabled={!canPlayThrough}
          onClick={playThrough}
          style={{
            ...FROST, width: "100%", padding: "14px 16px", borderRadius: 16, marginBottom: 18,
            border: "1px solid rgba(200,212,192,0.3)", color: WARM, fontFamily: FONT, fontSize: 15.5, fontWeight: 600,
            cursor: canPlayThrough ? "pointer" : "default", opacity: canPlayThrough ? 1 : 0.55,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          }}
        >
          <span aria-hidden>▶</span> Listen{scope !== "all" ? ` · ${SCOPE_LABEL[scope]}` : ""}
        </button>

        {readings.length === 0 && (
          <p style={{ fontSize: 13.5, color: FAINT, padding: "20px 2px" }}>
            {episodeQ.isLoading || alignQ.isLoading ? "Loading today's readings…" : "Today's readings aren't available yet."}
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {shownReadings.map((r) => {
            const sec = sectionByKind.get(r.kind);
            const canPlay = !!audioUrl && !!sec;
            return (
              <button
                key={r.kind}
                type="button"
                disabled={!canPlay}
                onClick={() => { if (sec) playReading(sec); }}
                style={{
                  display: "flex", alignItems: "center", gap: 14, textAlign: "left",
                  padding: "14px 16px", borderRadius: 16, ...FROST,
                  border: "1px solid rgba(200,212,192,0.18)",
                  color: WARM, fontFamily: FONT, cursor: canPlay ? "pointer" : "default",
                  opacity: canPlay ? 1 : 0.55,
                }}
              >
                <span aria-hidden style={{ fontSize: 20, width: 24, textAlign: "center", flexShrink: 0 }}>{KIND_EMOJI[r.kind]}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.18em", fontWeight: 700, color: FAINT }}>
                    {KIND_LABEL[r.kind]}
                  </span>
                  <span style={{ display: "block", fontSize: 16.5, fontWeight: 600, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.citation || "—"}
                  </span>
                </span>
                <span aria-hidden style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 38, height: 38, borderRadius: 999, flexShrink: 0,
                  background: canPlay ? "#2D5E3F" : "transparent",
                  border: `1px solid ${canPlay ? "rgba(168,197,160,0.4)" : "rgba(143,175,150,0.25)"}`,
                  fontSize: 16,
                }}>
                  ▶
                </span>
              </button>
            );
          })}
        </div>

        {aligning && readings.length > 0 && (
          <p style={{ fontSize: 12.5, color: FAINT, marginTop: 16, padding: "0 2px", display: "flex", alignItems: "center", gap: 8 }}>
            <span aria-hidden>◌</span> Preparing the audio markers for each reading…
          </p>
        )}
      </main>
    </div>
  );
}
