import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { openExternal } from "@/lib/openExternal";
import { canEmbedVideoHere, openVideoInReader, videoPath } from "@/lib/videoEmbed";
import { setAfterReader } from "@/lib/afterReader";
import type { YouTubeCatalogue, YouTubeTrack } from "@/lib/youtubeCatalogues";

// ── A catalogue whose tracks play on YouTube, inside Phoebe ─────────────────
//
// Hildegard (/hildegard) and Mary Lou's Mass (/mary-lous-mass): the hymns
// page's shape, one card per track, a search at the top, each track opening
// the /video page (pages/video-watch) the way a hymn does. Inline where the
// page has an http(s) origin (web, Android); in the in-app reader on iOS,
// whose capacitor:// origin YouTube refuses (Error 153), and there the app
// logs the listen when the reader closes on DONE, because the reader can't
// (lib/afterReader carries the track; its Back logs nothing).
//
// A track with no proven YouTube upload of the same recording is NOT SHOWN
// (owner, 2026-09-19: "Don't show any song not on YouTube in the catalogs"),
// and neither is one marked `hidden` (a track the owner asked to take out).
// The catalogue keeps both — lib/youtubeCatalogues has the matching rule and
// the reason each was hidden — so either can come back; the list is simply
// what is meant to be heard.

const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.85)";
const FAINT = "rgba(143,175,150,0.55)";
const BORDER = "rgba(46,107,64,0.38)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

function norm(s: string): string {
  const flat = s.replace(/[‘’ʼ]/g, "'");
  try { return flat.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  catch { return flat.toLowerCase(); }
}

function mmss(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function YouTubeCataloguePage({ cat }: { cat: YouTubeCatalogue }) {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");

  const playable = useMemo(() => cat.tracks.filter((t) => !!t.youtubeId && !t.hidden), [cat]);
  const results = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return playable;
    const words = q.split(/\s+/).filter(Boolean);
    return playable.filter((t) => {
      const hay = norm(`${t.title} ${t.artist}`);
      return words.every((w) => hay.includes(w));
    });
  }, [query, playable]);

  const play = (t: YouTubeTrack) => {
    if (!t.youtubeId) return;
    const logAs = `${t.title} — ${t.artist}`;
    const sleeve = { title: t.title, eyebrow: cat.videoEyebrow, sub: t.artist, logAs };
    if (canEmbedVideoHere()) {
      setLocation(videoPath(t.youtubeId, { ...sleeve, from: cat.path }));
      return;
    }
    // The reader can't move the app behind it, so its own Done is the way on:
    // the app lands on the deck's closing prompt when it closes, and logs the
    // track THERE — its Back logs nothing (lib/afterReader).
    if (openVideoInReader(videoPath(t.youtubeId, sleeve))) {
      setAfterReader("/listening?lift=1", logAs);
      return;
    }
    void openExternal(`https://www.youtube.com/watch?v=${t.youtubeId}`, { system: true });
  };

  const card = (t: YouTubeTrack) => (
    <div
      key={t.n}
      role="button"
      tabIndex={0}
      aria-label={`Play ${t.title}`}
      onClick={() => play(t)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); play(t); } }}
      style={{
        cursor: "pointer",
        display: "flex", alignItems: "center", gap: 10, width: "100%",
        padding: "11px 12px", borderRadius: 12, boxSizing: "border-box",
        background: "rgba(240,237,230,0.05)", border: `1px solid ${BORDER}`,
      }}
    >
        <span
          style={{
            flex: "0 0 auto", minWidth: 22, textAlign: "right",
            color: SAGE, fontFamily: FONT, fontSize: 14, fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {t.n}
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", color: WARM, fontFamily: FONT, fontSize: 15, lineHeight: 1.3 }}>
            {t.title}
          </span>
          <span
            style={{
              display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2,
              overflow: "hidden", color: FAINT, fontFamily: FONT, fontSize: 11.5,
              marginTop: 3, lineHeight: 1.35,
            }}
          >
            {t.artist} · {mmss(t.seconds)}
          </span>
        </span>
      <span
        aria-hidden
        style={{
          flex: "0 0 auto", width: 36, height: 36, borderRadius: 999,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(46,107,64,0.45)", border: "1px solid rgba(143,175,150,0.55)",
        }}
      >
        <svg width="13" height="14" viewBox="0 0 13 14" aria-hidden focusable="false" style={{ display: "block", marginLeft: 2 }}>
          <path d="M0 0.8 A0.8 0.8 0 0 1 1.2 0.1 L12.2 6.3 A0.8 0.8 0 0 1 12.2 7.7 L1.2 13.9 A0.8 0.8 0 0 1 0 13.2 Z" fill={WARM} />
        </svg>
      </span>
    </div>
  );

  return (
    <div style={{ position: "relative", minHeight: "var(--app-dvh)", background: BG, isolation: "isolate" }}>
      <AnimatedBackground base={BG} variant="subtle" />
      <div
        style={{
          position: "relative", maxWidth: 620, margin: "0 auto",
          display: "flex", flexDirection: "column", minHeight: "var(--app-dvh)",
          padding: "calc(env(safe-area-inset-top) + 16px) 18px calc(env(safe-area-inset-bottom) + 24px)",
          boxSizing: "border-box",
        }}
      >
        <div style={{ flex: "1 0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
            <button
              type="button"
              onClick={() => setLocation("/listening")}
              aria-label="Back"
              style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 14, cursor: "pointer", padding: 6 }}
            >
              ←
            </button>
            <span style={{ color: FAINT, fontFamily: FONT, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase" }}>
              {cat.eyebrow}
            </span>
            <span style={{ width: 24 }} />
          </div>

          <h1 style={{ color: WARM, fontFamily: FONT, fontSize: 22, fontWeight: 600, margin: "0 0 6px" }}>
            {cat.title}
          </h1>
          <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, lineHeight: 1.5, margin: "0 0 14px" }}>
            {cat.blurb}
          </p>

          {/* A catalogue's own note, at the top of its page and nowhere else
              (owner, of Sakamoto: "at the top of the page say Jeremy would
              listen to this album as a contemplative practice…"). Set apart
              like something said rather than something labelled. */}
          {cat.note && (
            <p
              style={{
                color: WARM, fontFamily: FONT, fontSize: 13.5, lineHeight: 1.6,
                margin: "0 0 16px", padding: "12px 14px", borderRadius: 12,
                background: "rgba(240,237,230,0.05)", border: `1px solid ${BORDER}`,
              }}
            >
              {cat.note}
            </p>
          )}

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or singer…"
            inputMode="search"
            aria-label={`Search ${cat.title}`}
            style={{
              width: "100%", boxSizing: "border-box", fontSize: 16, padding: "12px 14px",
              borderRadius: 12, outline: "none", color: WARM, fontFamily: FONT,
              background: "rgba(240,237,230,0.06)", border: `1px solid ${BORDER}`,
            }}
          />
          <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12, margin: "10px 0" }}>
            {query.trim() ? `${results.length} of ${playable.length}` : `${playable.length} recordings`}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {results.map(card)}
          </div>

          {results.length === 0 && (
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, textAlign: "center", padding: "24px 0" }}>
              Nothing by that name.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
