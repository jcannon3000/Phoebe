import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { usePodcastPlayer } from "@/components/PodcastPlayer";
import { AnimatedBackground } from "@/components/AnimatedBackground";

// ── Scripture Day by Day — listen reading by reading ───────────────────────
//
// The "Scripture Day by Day" podcast (Forward Movement) reads the day's four
// appointed passages aloud, in order: Old Testament → Psalm → New Testament →
// Gospel, after a short intro. The alignment pipeline (GET
// /api/podcast/scripture/timestamps) flags where each one begins/ends.
//
// Tapping a reading brings the episode up in the normal podcast player, started
// at that reading's part and stopping at its end (PlayingEpisode.startAtSeconds
// / stopAtSeconds). The four citations come straight from the feed, so they
// show immediately; the per-reading play enables once the markers are computed.

const BG = "#0C1F12";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";
const CARD = "rgba(143,175,150,0.10)";
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

type Episode = { audioUrl: string | null; durationSeconds: number | null; title: string | null; imageUrl: string | null };

export default function ScriptureReadingsPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const player = usePodcastPlayer();

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

  // The four readings in spoken order. Prefer the feed-parsed citations (shown
  // even before alignment); fall back to the aligned section titles.
  const readings: Reading[] = useMemo(() => {
    const fromFeed = alignQ.data?.readings ?? [];
    if (fromFeed.length > 0) return [...fromFeed].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
    return KIND_ORDER
      .map((kind) => ({ kind, citation: sectionByKind.get(kind)?.title ?? "" }))
      .filter((r) => r.citation);
  }, [alignQ.data, sectionByKind]);

  // Bring the episode up in the normal player, started at this reading's part
  // and stopping at its end.
  const playReading = (sec: Section) => {
    if (!audioUrl) return;
    player.play({
      showSlug: "scripture-day-by-day",
      episodeId: audioUrl, // /today gives no guid; the day's audio url is a stable id
      title: ep?.title ?? "Scripture Day by Day",
      audioUrl,
      imageUrl: ep?.imageUrl ?? null,
      showTitle: "Scripture Day by Day",
      showArtwork: ep?.imageUrl ?? null,
      durationSeconds: ep?.durationSeconds ?? null,
      sessionSurface: "scripture-audio",
      showHref: "/podcasts/show/scripture-day-by-day",
      startAtSeconds: sec.startSeconds,
      stopAtSeconds: sec.endSeconds ?? undefined,
    });
  };

  if (authLoading || !user) return null;

  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div style={{ position: "relative", minHeight: "100dvh", background: BG, color: WARM, fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <AnimatedBackground base={BG} variant="pronounced" fadeTop />

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
          Tap a reading to hear just that passage, read aloud.
        </p>

        {readings.length === 0 && (
          <p style={{ fontSize: 13.5, color: FAINT, padding: "20px 2px" }}>
            {episodeQ.isLoading || alignQ.isLoading ? "Loading today's readings…" : "Today's readings aren't available yet."}
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {readings.map((r) => {
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
                  padding: "14px 16px", borderRadius: 16, background: CARD,
                  border: "1px solid rgba(143,175,150,0.18)",
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
