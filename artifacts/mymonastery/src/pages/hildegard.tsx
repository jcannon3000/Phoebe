import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { openExternal } from "@/lib/openExternal";
import {
  playAppleMusicNative, stopAppleMusicNative,
  hasAppleMusicCollectionNative, playAppleMusicCollectionNative,
} from "@/lib/appleMusicNative";
import { appleMusicFeaturesReady, APPLE_MUSIC_EVENT } from "@/lib/appleMusicFeatures";
import { setPendingListen } from "@/lib/pendingListen";
import { handOffNowPlaying } from "@/lib/nowPlaying";
import { HILDEGARD_TRACKS, HILDEGARD_PLAYLIST, type HildegardTrack } from "@/lib/hildegardCatalogue";
import { SpotifyMark, AppleMark, YouTubeMark } from "@/components/ServiceMarks";
import {
  getMusicService, setMusicService, MUSIC_SERVICES,
  MUSIC_SERVICE_EVENT, type MusicService,
} from "@/lib/musicService";

// ── Hildegard ───────────────────────────────────────────────────────────────
//
// Owner, 2026-09-18, with the Apple Music link: "next to hymns have a catalouge
// that says Hildegard, catalouge theses, but also let them shuffle/play the
// whole thing".
//
// The shelf next to the hymnal. Where /hymns is the Hymnal 1982 in hymnal
// order — a book you look something up in — this is one composer's essentials
// in the order Apple's medieval editors put them, which is a thing you put on
// rather than a thing you search. So the whole playlist comes FIRST, as two
// buttons at the top, and the track list is underneath for when you do want
// one particular chant.
//
// Same rules as /hymns: a catalogue, not a player. Phoebe holds no audio, one
// service is chosen once at the top, and nothing of the work is reproduced —
// see lib/hildegardCatalogue.ts for what is held and why.
//
// COVERAGE IS APPLE-ONLY, and that is the honest shape of it: these are
// specific recordings by Sequentia and Anonymous 4, and the ids come from
// Apple's own playlist. For Spotify and YouTube the buttons SEARCH, labelled
// as a search, because sending someone to a different choir's performance and
// calling it the same recording is the one thing /hymns refuses to do.

const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.85)";
const FAINT = "rgba(143,175,150,0.55)";
const BORDER = "rgba(46,107,64,0.38)";
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

/** Where a tap goes on the chosen service: Apple has the recording itself;
 *  the others get a search for it, which the caller labels as one. */
function urlFor(t: HildegardTrack, service: MusicService): string {
  if (service === "apple") return t.appleUrl;
  const q = encodeURIComponent(`${t.name} ${t.artist}`);
  if (service === "youtube") return `https://www.youtube.com/results?search_query=${q}`;
  return `https://open.spotify.com/search/${q}`;
}

function ServiceMark({ service, size = 16 }: { service: MusicService; size?: number }) {
  if (service === "apple") return <AppleMark size={size} />;
  if (service === "youtube") return <YouTubeMark size={size} />;
  return <SpotifyMark size={size} />;
}

export default function HildegardPage() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");

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
    if (!q) return HILDEGARD_TRACKS;
    const words = q.split(/\s+/).filter(Boolean);
    return HILDEGARD_TRACKS.filter((t) => {
      const hay = norm([t.name, t.artist, t.album].join(" "));
      return words.every((w) => hay.includes(w));
    });
  }, [query]);

  const open = (url: string) => { void openExternal(url, { system: true }); };

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playingAll, setPlayingAll] = useState(false);
  // Leaving the shelf stops what it started — EXCEPT when it is leaving to
  // hand the music to the player, which is the whole point of that exit.
  const handingOff = useRef(false);
  useEffect(() => () => { if (!handingOff.current) void stopAppleMusicNative(); }, []);

  /**
   * Opted in AND iOS still agreeing — not merely "the plugin exists". Gating on
   * presence let a play tap raise an authorization sheet from a button that
   * promised music, which is the ambush lib/appleMusicFeatures exists to
   * prevent (audit, 2026-09-18; same defect fixed in listening.tsx).
   */
  const [canPlayInApp, setCanPlayInApp] = useState(false);
  useEffect(() => {
    let alive = true;
    const ask = () => { void appleMusicFeaturesReady().then((ok) => { if (alive) setCanPlayInApp(ok); }); };
    ask();
    window.addEventListener(APPLE_MUSIC_EVENT, ask);
    return () => { alive = false; window.removeEventListener(APPLE_MUSIC_EVENT, ask); };
  }, []);
  const appleNative = service === "apple" && canPlayInApp;

  /** The whole thing, in order or shuffled. In-app for an Apple Music
   *  subscriber on a native build; otherwise it opens the playlist (Apple) or
   *  a search for Hildegard (the others), where they can press shuffle
   *  themselves — there is no URL that makes another app shuffle. */
  const playAll = (shuffle: boolean) => {
    setPendingListen({ what: `${HILDEGARD_PLAYLIST.name} — Hildegard von Bingen` });
    if (service === "apple" && canPlayInApp && hasAppleMusicCollectionNative()) {
      if (playingAll) { void stopAppleMusicNative(); setPlayingAll(false); return; }
      void playAppleMusicCollectionNative("playlist", HILDEGARD_PLAYLIST.id, { shuffle, repeatAll: true })
        .then((ok) => {
          if (!ok) { open(HILDEGARD_PLAYLIST.url); return; }
          setPlayingAll(true); setPlayingId(null);
          // Playing goes to the player (owner, 2026-09-18) — Apple in-app
          // success only; a fallback or a search never becomes "now playing".
          handOffNowPlaying({
            id: HILDEGARD_PLAYLIST.id,
            title: `${HILDEGARD_PLAYLIST.name} — Hildegard von Bingen`,
            from: "/hildegard",
          });
          handingOff.current = true;
          setLocation("/listening");
        });
      return;
    }
    if (service === "apple") { open(HILDEGARD_PLAYLIST.url); return; }
    open(`https://${service === "youtube" ? "www.youtube.com/results?search_query=" : "open.spotify.com/search/"}${encodeURIComponent("Hildegard von Bingen")}`);
  };

  const play = (t: HildegardTrack) => {
    setPendingListen({ what: `${t.name} — ${t.artist}` });
    if (appleNative) {
      if (playingId === t.appleTrackId) { void stopAppleMusicNative(); setPlayingId(null); return; }
      void playAppleMusicNative(t.appleTrackId).then((ok) => {
        if (!ok) { open(t.appleUrl); return; }
        setPlayingId(t.appleTrackId); setPlayingAll(false);
        handOffNowPlaying({ id: t.appleTrackId, title: `${t.name} — ${t.artist}`, from: "/hildegard" });
        handingOff.current = true;
        setLocation("/listening");
      });
      return;
    }
    open(urlFor(t, service));
  };

  const label = MUSIC_SERVICES.find((s) => s.id === service)?.label ?? "Spotify";
  const searching = service !== "apple";

  const chooser = (
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
      <span style={{ color: FAINT, fontFamily: FONT, fontSize: 12 }}>Play with</span>
      <div style={{ position: "relative" }}>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 7, borderRadius: 999,
            padding: "7px 14px", pointerEvents: "none",
            background: "rgba(240,237,230,0.06)", border: `1px solid ${BORDER}`,
            color: WARM, fontFamily: FONT, fontSize: 13, fontWeight: 600,
          }}
        >
          <ServiceMark service={service} size={15} />
          <span>{label}</span>
          <span aria-hidden style={{ color: SAGE, fontSize: 11, lineHeight: 1 }}>▾</span>
        </div>
        <select
          value={service}
          onChange={(e) => {
            const v = e.target.value as MusicService;
            setMusicService(v);
            setService(v);
          }}
          aria-label="Which app to play Hildegard in"
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0,
            appearance: "none", WebkitAppearance: "none", border: "none",
            background: "transparent", color: "transparent", cursor: "pointer",
          }}
        >
          {MUSIC_SERVICES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>
    </div>
  );

  /** Play all · Shuffle — the two halves of one row, the same split-pill shape
   *  the contemplation screen uses for its own pair. */
  const wholeThing = (
    <div style={{ display: "flex", alignItems: "stretch", gap: 10, marginBottom: 14 }}>
      {[
        { key: "all", label: playingAll ? "Stop" : "Play all", icon: "▶", shuffle: false },
        { key: "shuffle", label: "Shuffle", icon: "⤨", shuffle: true },
      ].map((b) => (
        <button
          key={b.key}
          type="button"
          onClick={() => playAll(b.shuffle)}
          style={{
            flex: 1, borderRadius: 999, padding: "12px 10px", cursor: "pointer",
            background: "rgba(46,107,64,0.45)", border: `1px solid rgba(143,175,150,0.55)`,
            color: WARM, fontFamily: FONT, fontSize: 14, fontWeight: 600,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>{b.icon}</span>
          {b.label}
        </button>
      ))}
    </div>
  );

  const card = (t: HildegardTrack) => {
    const playing = playingId === t.appleTrackId;
    return (
      <div
        key={t.appleTrackId}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "11px 12px", borderRadius: 12, boxSizing: "border-box",
          background: "rgba(240,237,230,0.05)", border: `1px solid ${BORDER}`,
        }}
      >
        <span
          style={{
            flex: "0 0 auto", minWidth: 20, textAlign: "right", color: SAGE,
            fontFamily: FONT, fontSize: 14, fontWeight: 600, lineHeight: 1.25,
            fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
          }}
        >
          {t.n}
        </span>

        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", color: WARM, fontFamily: FONT, fontSize: 15, lineHeight: 1.3 }}>
            {t.name}
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

        <button
          type="button"
          onClick={() => play(t)}
          aria-label={
            playing ? `Pause ${t.name}`
              : searching ? `Search ${label} for ${t.name}`
                : `Play ${t.name} with ${label}`
          }
          title={searching ? `Search ${label}` : undefined}
          style={{
            flex: "0 0 auto", width: 36, height: 36, borderRadius: 999,
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            background: "rgba(46,107,64,0.45)", border: `1px solid rgba(143,175,150,0.55)`,
          }}
        >
          {playing ? (
            <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden focusable="false" style={{ display: "block" }}>
              <rect x="0.5" y="0.5" width="4" height="13" rx="1.1" fill={WARM} />
              <rect x="7.5" y="0.5" width="4" height="13" rx="1.1" fill={WARM} />
            </svg>
          ) : searching ? (
            // A magnifier, not a play triangle: on Spotify and YouTube this
            // opens a SEARCH, and a play button that doesn't play is a lie.
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden focusable="false" style={{ display: "block" }}>
              <circle cx="6" cy="6" r="4.4" fill="none" stroke={WARM} strokeWidth="1.5" />
              <path d="M9.4 9.4 L13 13" stroke={WARM} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="13" height="14" viewBox="0 0 13 14" aria-hidden focusable="false" style={{ display: "block", marginLeft: 2 }}>
              <path d="M0 0.8 A0.8 0.8 0 0 1 1.2 0.1 L12.2 6.3 A0.8 0.8 0 0 1 12.2 7.7 L1.2 13.9 A0.8 0.8 0 0 1 0 13.2 Z" fill={WARM} />
            </svg>
          )}
        </button>
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
              Hildegard
            </span>
            <span style={{ width: 24 }} />
          </div>

          <h1 style={{ color: WARM, fontFamily: FONT, fontSize: 22, fontWeight: 600, margin: "0 0 6px" }}>
            Hildegard von Bingen
          </h1>
          <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, lineHeight: 1.5, margin: "0 0 14px" }}>
            The essentials — 25 chants, a little over two hours. Put the whole thing
            on, or find one.
          </p>

          {chooser}
          {wholeThing}

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, singer, or album…"
            inputMode="search"
            aria-label="Search Hildegard recordings"
            style={{
              width: "100%", boxSizing: "border-box", fontSize: 16, padding: "12px 14px",
              borderRadius: 12, outline: "none", color: WARM, fontFamily: FONT,
              background: "rgba(240,237,230,0.06)", border: `1px solid ${BORDER}`,
            }}
          />
          <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12, margin: "10px 0" }}>
            {query.trim() ? `${results.length} of ${HILDEGARD_TRACKS.length}` : `${HILDEGARD_TRACKS.length} recordings`}
            {searching && ` · ${label} opens a search`}
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
