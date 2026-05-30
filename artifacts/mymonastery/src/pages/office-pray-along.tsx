import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { usePrayerSession } from "@/hooks/usePrayerSession";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { useTranslation } from "react-i18next";

// ── /podcast/{morning,evening}-office — "pray along" ──────────────────────
//
// Replaces the bare audio player for the read-aloud office: the Forward
// Movement recording plays while the office TEXT advances on screen in time
// with it. The current slide is driven by the per-slide timestamps produced
// by the alignment pipeline (GET /api/podcast/office/:side/timestamps).
//
// "Follow the recording": the timeline IS the alignment — the slides the
// reader actually read, in the order/timing they were read. Slides the reader
// skipped (e.g. the antiphon) never got a real audio window, so they aren't
// in the timeline; the office's canonical assembly is untouched. Each timed
// section is enriched with the office slide's text (joined by id) so a per-
// user assembly difference degrades to "no body text" rather than breaking.
//
// Listening credits the office (usePrayerSession, morning/evening-prayer).

const BG = "#0C1F12";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

type CARLine = { speaker: string; text: string };
type Slide = {
  id: string;
  type: string;
  eyebrow: string;
  title: string | null;
  content: string;
  isCallAndResponse: boolean;
  callAndResponseLines: CARLine[] | null;
  metadata?: Record<string, unknown> | null;
};
type AlignSection = {
  id: string;
  type: string;
  title: string | null;
  startSeconds: number;
  endSeconds: number | null;
  confidence: number;
  predicted?: boolean;
};
type Row = { sec: AlignSection; slide?: Slide };

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// A short label for the chapter rail — the slide's eyebrow reads best
// ("FIRST LESSON", "PSALM 27"); fall back to a type label.
const TYPE_LABEL: Record<string, string> = {
  opening_sentence: "Opening", confession: "Confession", absolution: "Absolution",
  invitatory: "Invitatory", invitatory_psalm: "Invitatory Psalm", antiphon: "Antiphon",
  psalm: "Psalm", psalm_gloria: "Gloria", lesson: "Lesson", canticle: "Canticle",
  creed: "The Creed", lords_prayer: "Lord's Prayer", suffrages: "Suffrages",
  collect: "Collect", prayer_for_mission: "Prayer for Mission",
  general_thanksgiving: "Thanksgiving", closing: "Closing",
};
function railLabel(row: Row): string {
  const eb = row.slide?.eyebrow?.trim();
  if (eb) return eb.replace(/\s+/g, " ");
  return TYPE_LABEL[row.sec.type] ?? row.sec.type.replace(/_/g, " ");
}

export default function OfficePrayAlongPage() {
  const [location, setLocation] = useLocation();
  const side: "morning" | "evening" = location.includes("evening") ? "evening" : "morning";
  const apiSlug = `${side}-office`;
  // flow=daily → reached from the home-screen "Begin prayer" full daily flow;
  // on completion continue into the community intercessions + closing tail.
  // Absent (chosen directly from the chooser/menu) → office-only: jump to the
  // weekly-progress slide.
  const fullFlow = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("flow") === "daily";
  }, []);
  const { t } = useTranslation();
  const { user, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [authLoading, user, setLocation]);

  const episodeQ = useQuery<{ audioUrl: string | null; durationSeconds: number | null; title: string | null; imageUrl: string | null }>({
    queryKey: [`/api/podcast/${apiSlug}/today`, "forward-movement"],
    queryFn: () => apiRequest("GET", `/api/podcast/${apiSlug}/today?source=forward-movement`),
    enabled: !!user,
    staleTime: 30 * 60_000,
  });
  const officeQ = useQuery<{ slides: Slide[] }>({
    queryKey: [`/api/office/${side}`],
    queryFn: () => apiRequest("GET", `/api/office/${side}`),
    enabled: !!user,
    staleTime: 30 * 60_000,
  });
  const alignQ = useQuery<{ status: string; sections: AlignSection[] }>({
    queryKey: [`/api/podcast/office/${side}/timestamps`],
    queryFn: () => apiRequest("GET", `/api/podcast/office/${side}/timestamps`),
    enabled: !!user,
    staleTime: 5 * 60_000,
    // The first open computes the alignment on demand (status "building").
    // Poll until it's "done" (or "failed") so the read-along fills in without
    // a manual refresh; stop polling once resolved.
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "done" || s === "failed" ? false : 6000;
    },
  });

  const audioUrl = episodeQ.data?.audioUrl ?? null;
  const slides = officeQ.data?.slides ?? [];
  const sections = alignQ.data?.sections ?? [];

  // Timeline = alignment sections (what was read, when), enriched with the
  // office slide's text by id. Drop near-zero windows (skipped slides).
  // Forward Movement's closing donation appeal — the player stops here and
  // hands off to the community intercessions (it isn't part of the office).
  const appealStart = useMemo(
    () => sections.find((s) => s.type === "appeal")?.startSeconds ?? null,
    [sections],
  );

  const timeline: Row[] = useMemo(() => {
    const byId = new Map(slides.map((s) => [s.id, s]));
    return sections
      .filter((sec) => sec.type !== "appeal")
      .filter((sec) => appealStart == null || sec.startSeconds < appealStart - 0.5)
      .filter((sec) => sec.endSeconds == null || sec.endSeconds - sec.startSeconds >= 1.5)
      .slice()
      .sort((a, b) => a.startSeconds - b.startSeconds)
      .map((sec) => ({ sec, slide: byId.get(sec.id) }));
  }, [slides, sections, appealStart]);

  // Credit the office while they listen.
  const slidesSeenRef = useRef(0);
  usePrayerSession(side === "evening" ? "evening-prayer" : "morning-prayer", slidesSeenRef);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [complete, setComplete] = useState(false);

  // Active section = last one whose start has passed.
  useEffect(() => {
    if (timeline.length === 0) return;
    let idx = 0;
    for (let i = 0; i < timeline.length; i++) {
      if (timeline[i].sec.startSeconds <= current + 0.25) idx = i;
      else break;
    }
    setActiveIdx((prev) => {
      if (idx !== prev) slidesSeenRef.current = Math.max(slidesSeenRef.current, idx + 1);
      return idx;
    });
  }, [current, timeline]);

  const seekTo = (sec: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(sec, duration || sec));
    setCurrent(a.currentTime);
    if (a.paused) a.play().catch(() => {});
  };
  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  // Keep the active chapter chip scrolled into view.
  const railRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const rail = railRef.current;
    const chip = rail?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    if (rail && chip) {
      const target = chip.offsetLeft - rail.clientWidth / 2 + chip.clientWidth / 2;
      rail.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    }
  }, [activeIdx]);

  // On completion: stamp the office prayed-today flag (sync-immediate; the
  // server already credits via usePrayerSession), then hand off. Office-only
  // jumps straight to the weekly-progress slide; the full daily flow waits on
  // the card below to continue into the community intercessions.
  useEffect(() => {
    if (!complete) return;
    try {
      const d = new Date();
      const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      localStorage.setItem(`phoebe:office-completed:${side}:${ymd}`, "1");
    } catch { /* private mode */ }
    if (!fullFlow) setLocation(`/prayer-mode?progressOnly=1&side=${side}`);
  }, [complete, fullFlow, side, setLocation]);

  if (authLoading || !user) return null;

  const loading = episodeQ.isLoading || officeQ.isLoading || alignQ.isLoading;
  const active = timeline[activeIdx];
  const notAligned = !loading && timeline.length === 0;
  const endCap = appealStart != null ? appealStart : duration;
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div style={{ position: "relative", minHeight: "100dvh", background: BG, color: WARM, fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <AnimatedBackground base={BG} variant="pronounced" fadeTop />

      {/* Header */}
      <header style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "max(1.1rem, calc(env(safe-area-inset-top) + 0.5rem)) 18px 6px" }}>
        <button type="button" onClick={() => setLocation("/dashboard")} style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0 }}>
          ← {t("common.back", { defaultValue: "Back" })}
        </button>
        <span style={{ fontSize: 12.5, color: FAINT, fontWeight: 600 }}>
          {side === "evening" ? "Evening Prayer" : "Morning Prayer"} · {dateLabel}
        </span>
        <span style={{ width: 36 }} />
      </header>

      {/* Body — the active slide, large */}
      <main style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", maxWidth: 640, margin: "0 auto", padding: "8px 22px 12px", boxSizing: "border-box", textAlign: "center" }}>
        {loading ? (
          <p style={{ color: FAINT, fontSize: 14 }}>{t("common.loading", { defaultValue: "Loading…" })}</p>
        ) : !audioUrl ? (
          <p style={{ color: FAINT, fontSize: 14, lineHeight: 1.5 }}>
            {t("podcasts.office_error", { defaultValue: "Today's recording isn't available yet." })}
          </p>
        ) : complete ? (
          fullFlow ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <div style={{ fontSize: 40 }}>🕯️</div>
              <p style={{ fontSize: 19, fontWeight: 600, margin: 0 }}>{t("prayalong.complete", { defaultValue: "The office is complete." })}</p>
              <p style={{ fontSize: 14, color: SAGE, lineHeight: 1.5, margin: 0, maxWidth: 320 }}>
                {t("prayalong.complete_sub", { defaultValue: "Continue into the prayers your community is holding." })}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6, width: "100%", maxWidth: 320 }}>
                <button type="button" onClick={() => setLocation(`/prayer-mode?afterOffice=1&side=${side}`)} style={{ padding: "13px 0", borderRadius: 14, background: "#2D5E3F", color: WARM, border: "1px solid rgba(168,197,160,0.4)", fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                  {t("prayalong.to_intercessions", { defaultValue: "Community intercessions →" })}
                </button>
                <button type="button" onClick={() => setLocation("/dashboard")} style={{ padding: "11px 0", borderRadius: 14, background: "transparent", color: SAGE, border: "none", fontFamily: FONT, fontSize: 14, cursor: "pointer" }}>
                  {t("common.done", { defaultValue: "Done" })}
                </button>
              </div>
            </div>
          ) : (
            <p style={{ color: FAINT, fontSize: 14 }}>{t("common.loading", { defaultValue: "Loading…" })}</p>
          )
        ) : notAligned ? (
          <div style={{ color: FAINT, fontSize: 14, lineHeight: 1.6 }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>🎧</div>
            <p style={{ margin: 0 }}>{t("prayalong.not_ready", { defaultValue: "The read-along for today's recording isn't ready yet — you can still listen below." })}</p>
          </div>
        ) : active ? (
          <SlideBody row={active} />
        ) : null}
      </main>

      {/* Chapter rail */}
      {timeline.length > 0 && (
        <div
          ref={railRef}
          style={{ position: "relative", zIndex: 1, display: "flex", gap: 8, overflowX: "auto", padding: "6px 16px 10px", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
        >
          {timeline.map((row, i) => {
            const on = i === activeIdx;
            return (
              <button
                key={row.sec.id}
                data-idx={i}
                type="button"
                onClick={() => seekTo(row.sec.startSeconds)}
                style={{
                  flex: "0 0 auto", padding: "7px 12px", borderRadius: 999, cursor: "pointer",
                  fontFamily: FONT, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                  background: on ? "#2D5E3F" : "rgba(46,107,64,0.16)",
                  color: on ? WARM : "rgba(168,197,160,0.9)",
                  border: `1px solid ${on ? "rgba(168,197,160,0.5)" : "rgba(46,107,64,0.4)"}`,
                  opacity: row.sec.predicted ? 0.8 : 1,
                }}
              >
                <span style={{ opacity: 0.7, marginRight: 6, fontVariantNumeric: "tabular-nums" }}>{fmt(row.sec.startSeconds)}</span>
                {railLabel(row)}
              </button>
            );
          })}
        </div>
      )}

      {/* Audio controls */}
      <footer style={{ position: "relative", zIndex: 1, padding: "10px 20px max(1.1rem, calc(env(safe-area-inset-bottom) + 0.6rem))", borderTop: "1px solid rgba(46,107,64,0.25)", background: "rgba(9,26,16,0.55)", backdropFilter: "blur(6px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: FAINT, fontVariantNumeric: "tabular-nums", width: 38, textAlign: "right" }}>{fmt(current)}</span>
          <input
            type="range"
            min={0}
            max={endCap || 1}
            value={Math.min(current, endCap || current)}
            step={1}
            onChange={(e) => seekTo(Number(e.target.value))}
            style={{ flex: 1, accentColor: "#8FAF96", height: 4 }}
            aria-label={t("prayalong.scrub", { defaultValue: "Seek" })}
          />
          <span style={{ fontSize: 11, color: FAINT, fontVariantNumeric: "tabular-nums", width: 38 }}>{fmt(endCap)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 22, marginTop: 8 }}>
          <button type="button" onClick={() => seekTo(current - 15)} style={ctrlStyle} aria-label="Back 15 seconds">⏪</button>
          <button
            type="button"
            onClick={togglePlay}
            disabled={!audioUrl}
            style={{ ...ctrlStyle, width: 56, height: 56, borderRadius: 999, background: "#2D5E3F", border: "1px solid rgba(168,197,160,0.4)", fontSize: 24, opacity: audioUrl ? 1 : 0.4 }}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <button type="button" onClick={() => seekTo(current + 15)} style={ctrlStyle} aria-label="Forward 15 seconds">⏩</button>
        </div>
      </footer>

      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="auto"
          onLoadedMetadata={(e) => setDuration((e.currentTarget.duration || episodeQ.data?.durationSeconds) ?? 0)}
          onTimeUpdate={(e) => {
            const tt = e.currentTarget.currentTime;
            setCurrent(tt);
            if (appealStart != null && tt >= appealStart - 0.3) {
              e.currentTarget.pause();
              setComplete(true);
            }
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setComplete(true); }}
        />
      )}
    </div>
  );
}

const ctrlStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 44, height: 44, background: "none", border: "none", color: WARM,
  fontSize: 20, cursor: "pointer", padding: 0,
};

// Renders one office slide's text — call-and-response lines, a lesson card,
// or plain body — large and centered for reading along.
function SlideBody({ row }: { row: Row }) {
  const { sec, slide } = row;
  const eyebrow = (slide?.eyebrow ?? TYPE_LABEL[sec.type] ?? "").trim();
  const title = slide?.title ?? sec.title;
  const isLesson = sec.type === "lesson";
  const readUrl = typeof slide?.metadata?.readUrl === "string" ? (slide.metadata.readUrl as string) : null;

  return (
    <div style={{ animation: "none" }}>
      {eyebrow && (
        <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 700, color: FAINT, margin: "0 0 12px" }}>
          {eyebrow}
        </p>
      )}
      {title && (
        <p style={{ fontSize: 22, fontFamily: SERIF, fontStyle: "italic", color: WARM, margin: "0 0 16px", lineHeight: 1.3 }}>
          {title}
        </p>
      )}

      {isLesson ? (
        <div>
          <p style={{ fontSize: 15, color: SAGE, lineHeight: 1.6, margin: "0 0 14px" }}>
            The reading is being read aloud.
          </p>
          {readUrl && (
            <a
              href={readUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-block", padding: "9px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, color: "rgba(168,197,160,0.95)", background: "rgba(46,107,64,0.16)", border: "1px solid rgba(46,107,64,0.4)", textDecoration: "none" }}
            >
              Read the passage →
            </a>
          )}
        </div>
      ) : slide?.isCallAndResponse && slide.callAndResponseLines?.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {slide.callAndResponseLines.map((l, i) => (
            <p
              key={i}
              style={{
                fontSize: 18, fontFamily: SERIF, lineHeight: 1.5, margin: 0,
                color: l.speaker === "people" ? WARM : "rgba(226,224,216,0.92)",
                fontWeight: l.speaker === "people" ? 700 : 400,
              }}
            >
              {l.text}
            </p>
          ))}
        </div>
      ) : slide?.content ? (
        <p style={{ fontSize: 18, fontFamily: SERIF, lineHeight: 1.65, color: WARM, margin: 0, whiteSpace: "pre-wrap" }}>
          {slide.content}
        </p>
      ) : null}
    </div>
  );
}
