import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { openExternal } from "@/lib/openExternal";
import { HYMNS, hymnNumberLabel, type Hymn } from "@/lib/hymnsCatalogue";
import { SpotifyMark, AppleMark } from "@/components/ServiceMarks";
import {
  getMusicService, setMusicService, showsApple, showsSpotify,
  MUSIC_SERVICE_EVENT, type MusicService,
} from "@/lib/musicService";

// ── Hymns ───────────────────────────────────────────────────────────────────
//
// Owner, 2026-09-18, under Audio Divina's "Lately": "have a pill that says
// hymns … then do a catalaouge with all these as a card and a search at the
// top".
//
// Audio Divina asks you to let a song come to mind, which is a real ask on a
// day when nothing comes. This is the shelf you can go and look at: the whole
// Hymnal 1982 as it has actually been sung and recorded, in hymnal order, with
// the number on the left the way a hymnal index reads.
//
// It is a CATALOGUE, not a player. Phoebe holds no audio here — the tap hands
// the recording to Spotify or Apple Music, which is where the listener's
// subscription lives, and they come back and log what they heard. See
// lib/hymnsCatalogue.ts for where the numbers and links came from, and why no
// hymn TEXT appears anywhere in this feature.

const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.85)";
const FAINT = "rgba(143,175,150,0.55)";
const BORDER = "rgba(46,107,64,0.38)";
// Audio Divina uses Space Grotesk for ALL text, and this is its shelf.
const FONT = "'Space Grotesk', system-ui, sans-serif";

function norm(s: string): string {
  try { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  catch { return s.toLowerCase(); }
}

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function HymnsPage() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");

  // Which service's marks to show. Read on mount and kept in step with the
  // chooser below (and with any other surface that sets it later).
  const [service, setService] = useState<MusicService>(() => getMusicService());
  useEffect(() => {
    const sync = () => setService(getMusicService());
    window.addEventListener(MUSIC_SERVICE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MUSIC_SERVICE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const results = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return HYMNS;
    const words = q.split(/\s+/).filter(Boolean);
    return HYMNS.filter((h) => {
      // The number is searchable as a word of its own, so typing "154" finds
      // the hymn and "15" does not drag in every hymn with a 15 in its id.
      const hay = norm([h.num.join(" "), h.name, h.firstLine ?? "", h.artist].join(" "));
      const nums = h.num.map(String);
      return words.every((w) => hay.includes(w) || nums.some((n) => n === w));
    });
  }, [query]);

  // Hand the track to the music app itself: `system: true` leaves the WKWebView
  // so iOS can route the universal link to Spotify / Music, instead of opening
  // a web player inside Phoebe (the same call the Audio Divina library makes).
  const open = (url: string) => { void openExternal(url, { system: true }); };

  const chooser = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
      <span style={{ color: FAINT, fontFamily: FONT, fontSize: 11.5 }}>Open in</span>
      {([["both", "Both"], ["apple", "Apple Music"], ["spotify", "Spotify"]] as const).map(([id, label]) => {
        const on = service === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => { setMusicService(id); setService(id); }}
            style={{
              borderRadius: 999, padding: "5px 12px", cursor: "pointer",
              fontFamily: FONT, fontSize: 12, fontWeight: 600,
              color: on ? WARM : FAINT,
              background: on ? "rgba(46,107,64,0.45)" : "rgba(240,237,230,0.05)",
              border: `1px solid ${on ? "rgba(143,175,150,0.6)" : BORDER}`,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  const card = (h: Hymn, i: number) => {
    const spotify = showsSpotify(service);
    const apple = showsApple(service) && !!h.appleUrl;
    return (
      <div
        key={`${h.spotifyUrl}-${i}`}
        style={{
          display: "flex", alignItems: "center", gap: 12, width: "100%",
          padding: "11px 13px", borderRadius: 12, boxSizing: "border-box",
          background: "rgba(240,237,230,0.05)", border: `1px solid ${BORDER}`,
        }}
      >
        {/* The number, on the left, as a hymnal index reads it. Fixed width so
            every name starts on the same line down the page; tabular figures so
            the digits don't shuffle between rows. */}
        <span
          aria-label={h.num.length ? `Hymn ${hymnNumberLabel(h)}` : undefined}
          style={{
            flex: "0 0 auto", width: 46, textAlign: "right",
            color: h.num.length ? SAGE : "rgba(143,175,150,0.35)",
            fontFamily: FONT, fontSize: 14.5, fontWeight: 600, lineHeight: 1.25,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {hymnNumberLabel(h)}
        </span>

        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", color: WARM, fontFamily: FONT, fontSize: 15, lineHeight: 1.3 }}>
            {h.name}
          </span>
          {/* Two lines at most: some of these recordings credit a composer, a
              choir, an organist and a conductor, which ran to three lines on a
              phone and made one card twice the height of its neighbours. */}
          <span
            style={{
              display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2,
              overflow: "hidden", color: FAINT, fontFamily: FONT, fontSize: 11.5,
              marginTop: 3, lineHeight: 1.35,
            }}
          >
            {h.firstLine ? `${h.firstLine} · ` : ""}{h.artist} · {mmss(h.seconds)}
          </span>
        </span>

        {/* The marks, on the right. Each is a real link into the service's own
            app — never a player here. */}
        <span style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 6 }}>
          {apple && (
            <button
              type="button"
              onClick={() => open(h.appleUrl!)}
              aria-label={`Play ${h.name} in Apple Music`}
              style={{
                width: 34, height: 34, borderRadius: 999, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(240,237,230,0.06)", border: `1px solid ${BORDER}`, color: WARM,
              }}
            >
              <AppleMark size={17} />
            </button>
          )}
          {spotify && (
            <button
              type="button"
              onClick={() => open(h.spotifyUrl)}
              aria-label={`Play ${h.name} in Spotify`}
              style={{
                width: 34, height: 34, borderRadius: 999, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(240,237,230,0.06)", border: `1px solid ${BORDER}`,
              }}
            >
              <SpotifyMark size={18} />
            </button>
          )}
        </span>
      </div>
    );
  };

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
              style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 14, cursor: "pointer", padding: 6 }}
            >
              ←
            </button>
            <span style={{ color: FAINT, fontFamily: FONT, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase" }}>
              Hymns
            </span>
            <span style={{ width: 24 }} />
          </div>

          <h1 style={{ color: WARM, fontFamily: FONT, fontSize: 22, fontWeight: 600, margin: "0 0 6px" }}>
            The Hymnal 1982
          </h1>
          <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, lineHeight: 1.5, margin: "0 0 14px" }}>
            Sung, in hymnal order. Tap a mark to play it in your own music app.
          </p>

          {chooser}

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by number, name, or choir…"
            inputMode="search"
            aria-label="Search hymns"
            style={{
              width: "100%", boxSizing: "border-box", fontSize: 16, padding: "12px 14px",
              borderRadius: 12, outline: "none", color: WARM, fontFamily: FONT,
              background: "rgba(240,237,230,0.06)", border: `1px solid ${BORDER}`,
            }}
          />
          <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12, margin: "10px 0" }}>
            {query.trim() ? `${results.length} of ${HYMNS.length}` : `${HYMNS.length} recordings`}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {results.map(card)}
          </div>

          {results.length === 0 && (
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, textAlign: "center", padding: "24px 0" }}>
              Nothing by that name or number.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
