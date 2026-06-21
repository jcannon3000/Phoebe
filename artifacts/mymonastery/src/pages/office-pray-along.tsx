import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { usePrayerSession } from "@/hooks/usePrayerSession";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { useTranslation } from "react-i18next";

// ── Office "pray along" (beta) ────────────────────────────────────────────
//
// A contemplative listen: the Forward Movement office recording plays through a
// podcast bar at the bottom, and a third of the way down the screen a single
// glowing title names the part of the liturgy the reader is currently in —
// Invitatory, Antiphon, Psalm Appointed, First Reading… It cross-fades up/down
// to the next part as the audio crosses each section's timestamp (from the
// alignment pipeline, GET /api/podcast/office/:side/timestamps). No walls of
// text — just "where you are" in the office, the way the book lists it out.
//
// Listening credits the office (usePrayerSession, morning/evening-prayer).

const BG = "#0C1F12";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type AlignSection = {
  id: string;
  type: string;
  title: string | null;
  startSeconds: number;
  endSeconds: number | null;
  confidence: number;
  predicted?: boolean;
};
type Slide = { id: string; type: string; eyebrow: string; title: string | null };
type Row = { sec: AlignSection; slide?: Slide };

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const TYPE_LABEL: Record<string, string> = {
  opening_sentence: "Opening Sentence", confession: "Confession", absolution: "Absolution",
  invitatory: "Invitatory", invitatory_psalm: "Invitatory Psalm", antiphon: "Antiphon",
  psalm: "Psalm Appointed", psalm_gloria: "Gloria", lesson: "Reading", canticle: "Canticle",
  creed: "The Creed", lords_prayer: "The Lord's Prayer", suffrages: "Suffrages",
  collect: "The Collect", prayer_for_mission: "Prayer for Mission",
  general_thanksgiving: "General Thanksgiving", closing: "Closing Prayer",
};
// Minor words stay lowercase except as the first word — so eyebrows like
// "CONFESSION OF SIN" / "PRAYER FOR MISSION" read "Confession of Sin" /
// "Prayer for Mission", not "Of"/"For".
const MINOR_WORDS = new Set(["of", "for", "the", "a", "an", "and", "to", "in", "on", "with", "at", "by", "from", "or"]);
function titleCase(s: string): string {
  return s.toLowerCase().split(/\s+/).map((w, i) =>
    i > 0 && MINOR_WORDS.has(w) ? w : w.replace(/^[a-z]/, (c) => c.toUpperCase()),
  ).join(" ");
}
// The name of the liturgical part, the way the office book lists it. Prefer the
// slide's eyebrow ("First Lesson", "Psalm 27"), nicely cased; fall back to a
// type label.
function sectionLabel(row: Row): string {
  // The Gloria slide carries the psalm's eyebrow ("Venite · Psalm 95"); name
  // the doxology itself rather than repeating the psalm.
  if (row.sec.type === "psalm_gloria") return TYPE_LABEL.psalm_gloria;
  const eb = row.slide?.eyebrow?.trim();
  if (eb) return titleCase(eb.replace(/\s+/g, " "));
  return TYPE_LABEL[row.sec.type] ?? titleCase(row.sec.type.replace(/_/g, " "));
}

// The alignment marks each part's start a touch early — it catches the reader's
// lead-in / announcement rather than the first word of the part itself. Delay
// the on-screen section title by this many seconds so it lands as the part is
// actually under way, not before it. One knob: raise it if titles still feel
// early, lower it if they lag.
const TITLE_LAG_SECONDS = 0.6;

export default function OfficePrayAlongPage() {
  const [location, setLocation] = useLocation();
  const side: "morning" | "evening" = location.includes("evening") ? "evening" : "morning";
  const apiSlug = `${side}-office`;
  const fullFlow = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("flow") === "daily";
  }, []);
  const { t } = useTranslation();
  const { user, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [authLoading, user, setLocation]);

  const episodeQ = useQuery<{ audioUrl: string | null; durationSeconds: number | null }>({
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
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "done" || s === "failed" ? false : 6000;
    },
  });

  const audioUrl = episodeQ.data?.audioUrl ?? null;
  const slides = officeQ.data?.slides ?? [];
  const sections = alignQ.data?.sections ?? [];

  const appealStart = useMemo(
    () => sections.find((s) => s.type === "appeal")?.startSeconds ?? null,
    [sections],
  );

  // The timeline of liturgy parts — what was read, when. Drop skipped/near-zero
  // windows and the closing donation appeal.
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

  const slidesSeenRef = useRef(0);
  usePrayerSession(side === "evening" ? "evening-prayer" : "morning-prayer", slidesSeenRef);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [complete, setComplete] = useState(false);

  // Active part = last one whose start has passed, held back by TITLE_LAG_SECONDS
  // so the title doesn't appear before the part is actually being read. (Was a
  // 0.25s LEAD, which made the titles come in early.)
  useEffect(() => {
    if (timeline.length === 0) return;
    let idx = 0;
    for (let i = 0; i < timeline.length; i++) {
      if (timeline[i].sec.startSeconds <= current - TITLE_LAG_SECONDS) idx = i;
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
  const endCap = appealStart != null ? appealStart : duration;
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  // What the glowing title currently reads.
  const glow = complete
    ? t("prayalong.complete", { defaultValue: "The office is complete." })
    : !audioUrl && !loading
      ? t("podcasts.office_error", { defaultValue: "Today's recording isn't available yet." })
      : active
        ? sectionLabel(active)
        : (side === "evening" ? "Evening Prayer" : "Morning Prayer");
  const glowKey = complete ? "__done" : active ? `${activeIdx}` : "__title";

  return (
    <div style={{ position: "relative", minHeight: "100dvh", background: BG, color: WARM, fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <AnimatedBackground base={BG} variant="pronounced" fadeTop />

      {/* Header */}
      <header style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "max(1.1rem, calc(var(--safe-top) + 0.5rem)) 18px 6px" }}>
        <button type="button" onClick={() => setLocation("/dashboard")} style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0 }}>
          ← {t("common.back", { defaultValue: "Back" })}
        </button>
        <span style={{ fontSize: 12.5, color: FAINT, fontWeight: 600 }}>
          {side === "evening" ? "Evening Prayer" : "Morning Prayer"} · {dateLabel}
        </span>
        <span style={{ width: 36 }} />
      </header>

      {/* The glowing liturgy-part title — a third of the way down, cross-fading
          up/down to the next part as the recording moves. */}
      <main style={{ position: "relative", zIndex: 1, flex: 1 }}>
        <div style={{ position: "absolute", top: "30%", left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", padding: "0 28px", textAlign: "center" }}>
          {!complete && active && (
            <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, color: FAINT, margin: "0 0 16px" }}>
              {t("prayalong.now", { defaultValue: "Now praying" })}
            </p>
          )}
          <AnimatePresence mode="wait">
            <motion.p
              key={glowKey}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              style={{
                fontFamily: FONT, fontSize: 34, fontWeight: 600, lineHeight: 1.2,
                color: WARM, margin: 0, letterSpacing: "-0.01em",
                textShadow: "0 0 34px rgba(143,175,150,0.45), 0 2px 22px rgba(8,30,18,0.7)",
              }}
            >
              {loading ? "" : glow}
            </motion.p>
          </AnimatePresence>
          {complete && fullFlow && (
            <button
              type="button"
              onClick={() => setLocation(`/prayer-mode?afterOffice=1&side=${side}`)}
              style={{ marginTop: 22, padding: "12px 22px", borderRadius: 14, background: "#2D5E3F", color: WARM, border: "1px solid rgba(168,197,160,0.4)", fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: "pointer" }}
            >
              {t("prayalong.to_intercessions", { defaultValue: "Community intercessions →" })}
            </button>
          )}
        </div>
      </main>

      {/* Podcast bar */}
      <footer style={{ position: "relative", zIndex: 1, padding: "10px 20px max(1.1rem, calc(env(safe-area-inset-bottom) + 0.6rem))", borderTop: "1px solid rgba(46,107,64,0.25)", background: "rgba(9,26,16, 0.605)", backdropFilter: "blur(6px)" }}>
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
