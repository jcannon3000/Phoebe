import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { openExternal } from "@/lib/openExternal";
import { canEmbedVideoHere, openVideoInReader, videoPath, youtubeIdFrom } from "@/lib/videoEmbed";
import { hasAppleMusicNative, playAppleMusicNative, stopAppleMusicNative } from "@/lib/appleMusicNative";
import { appleMusicFeaturesReady, APPLE_MUSIC_EVENT } from "@/lib/appleMusicFeatures";
import { setPendingListen } from "@/lib/pendingListen";
import { handOffNowPlaying } from "@/lib/nowPlaying";
import { HYMNS, hymnNumberLabel, type Hymn } from "@/lib/hymnsCatalogue";
import { SpotifyMark, AppleMark, YouTubeMark } from "@/components/ServiceMarks";
import {
  getMusicService, setMusicService, MUSIC_SERVICES,
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
// the recording to the listener's own music app, which is where their
// subscription lives, and they come back and log what they heard. See
// lib/hymnsCatalogue.ts for where the numbers and links came from, and why no
// hymn TEXT appears anywhere in this feature.
//
// One service, chosen once at the top, and then one play button per row
// (owner: "dont have all the icons on the right, just a play button"). Three
// marks on every card made the reader choose the same way ninety-six times.

const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.85)";
const FAINT = "rgba(143,175,150,0.55)";
const BORDER = "rgba(46,107,64,0.38)";
// Audio Divina uses Space Grotesk for ALL text, and this is its shelf.
const FONT = "'Space Grotesk', system-ui, sans-serif";

function norm(s: string): string {
  // Curly apostrophes fold to straight ones BOTH ways: iOS Smart Punctuation
  // turns a typed ' into ’, so "King’s College" found none of the
  // fourteen King's College recordings, while the one row spelled with ’
  // could not be found by typing '.
  const flat = s.replace(/[\u2018\u2019\u02BC]/g, "'");
  try { return flat.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  catch { return flat.toLowerCase(); }
}

function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** The link for the chosen service — null when that service doesn't have it. */
function urlFor(h: Hymn, service: MusicService): string | null {
  if (service === "apple") return h.appleUrl;
  if (service === "youtube") return h.youtubeUrl;
  return h.spotifyUrl;
}

function ServiceMark({ service, size = 16 }: { service: MusicService; size?: number }) {
  if (service === "apple") return <AppleMark size={size} />;
  if (service === "youtube") return <YouTubeMark size={size} />;
  return <SpotifyMark size={size} />;
}

export default function HymnsPage() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");

  // Which service the play buttons open. Read on mount and kept in step with
  // the chooser below (and with any other surface that sets it later).
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
      // The number is NOT in the haystack: as a substring "15" matched 115,
      // 150, 152, 154, 156, 158 and 159, and "66" matched 165/166 as well as
      // Hymn 66. It is only ever compared whole, below.
      const hay = norm([h.name, h.firstLine ?? "", h.artist].join(" "));
      const nums = h.num.map(String);
      return words.every((w) => hay.includes(w) || nums.some((n) => n === w));
    });
  }, [query]);

  const missing = useMemo(
    () => results.filter((h) => !urlFor(h, service)).length,
    [results, service],
  );

  // Hand the track to the music app itself: `system: true` leaves the WKWebView
  // so iOS can route the universal link to Spotify / Music / YouTube, instead
  // of opening a web player inside Phoebe (the call Audio Divina already uses).
  const open = (url: string) => { void openExternal(url, { system: true }); };

  // Which row, if any, is playing INSIDE Phoebe right now. Only ever set on a
  // native build with an Apple Music subscription; on the web it stays null and
  // this page behaves exactly as it did before the native player existed.
  const [playingId, setPlayingId] = useState<string | null>(null);
  // NO stop-on-unmount. It used to be here and undid the feature: the whole
  // point of the pendingListen hand-off is that you LEAVE this page to go and
  // log the hymn that is playing, and the cleanup killed it on the way out.
  // Playback is the listener's to stop — pause here, the lock screen, or
  // Control Center.

  /**
   * THE SAME GATE AS /hildegard AND AUDIO DIVINA (audit, 2026-09-18). This page
   * alone still entered the native branch on "the plugin exists", so it
   * ignored the Settings switch turned OFF, and a play tap could raise the
   * authorization sheet — the ambush lib/appleMusicNative forbids.
   * appleMusicFeaturesReady asks iOS and never prompts. null = still asking.
   */
  const [canPlayInApp, setCanPlayInApp] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    const ask = () => { void appleMusicFeaturesReady().then((ok) => { if (live) setCanPlayInApp(ok); }); };
    ask();
    window.addEventListener(APPLE_MUSIC_EVENT, ask);
    return () => { live = false; window.removeEventListener(APPLE_MUSIC_EVENT, ask); };
  }, []);
  function playableNow(): boolean | Promise<boolean> {
    if (canPlayInApp !== null) return canPlayInApp;
    if (!hasAppleMusicNative()) return false;
    return appleMusicFeaturesReady();
  }
  /** Still on this page? A play that lands after leaving must not pull the
   *  person back to /listening or start music behind wherever they went. */
  const aliveRef = useRef(true);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  // Apple Music can play here, through the listener's own subscription
  // (lib/appleMusicNative). Everything else — and every failure — opens the
  // service instead. The native attempt is only made when the plugin is
  // actually present, so the web path stays synchronous inside the tap and is
  // never at the mercy of a popup blocker.
  /** A hymn you went off to hear comes back ready to log (pendingListen). */
  const listenedAs = (h: Hymn) =>
    h.num.length ? `Hymn ${hymnNumberLabel(h)} · ${h.name} — ${h.artist}` : `${h.name} — ${h.artist}`;
  const noteForTheLog = (h: Hymn) => setPendingListen({ what: listenedAs(h) });

  /**
   * The hymn opened in another app, so the next thing is writing it down:
   * Audio Divina's log, already filled by noteForTheLog (owner, 2026-09-18:
   * "when i click a piece of music and it opens in another place, its supposed
   * to still advance to the log with that autofilled"). It used to stay on
   * this list, and the prefill waited for them to find the log themselves.
   * Every hymn link is a particular recording on every service, so this is
   * never a guess.
   */
  const openThenLog = (url: string) => { open(url); setLocation("/listening?log=1"); };

  const play = (h: Hymn, url: string) => {
    // Owner: "when they pick a hymn, regardless of the platform, if it opens
    // the other app, when they come back to phoebe, it should have that hymn
    // ready to be logged". Left for Audio Divina's log whichever way it plays
    // — in-app or out in the service — because either way this is what they
    // listened to. lib/pendingListen clears it on use and at the day turn.
    const playable = service === "apple" && h.appleTrackId ? playableNow() : false;
    if (playable !== false && h.appleTrackId) {
      // Pause is not listening: return BEFORE the note is left, or stopping a
      // hymn would record it as the thing you sat with.
      if (playingId === h.appleTrackId) { void stopAppleMusicNative(); setPlayingId(null); return; }
      noteForTheLog(h);
      void (async () => {
        if (!(await playable)) { if (aliveRef.current) openThenLog(url); return; }
        return playAppleMusicNative(h.appleTrackId);
      })().then((ok) => {
        if (ok === undefined) return;
        // A second tap or leaving makes this play stale; lib/appleMusicNative
        // then never settles it. Left the page while it started: stop it.
        if (!aliveRef.current) { if (ok) void stopAppleMusicNative(); return; }
        if (!ok) { openThenLog(url); return; }
        setPlayingId(h.appleTrackId);
        // Playing goes to the player (owner, 2026-09-18: "Playing from a
        // catalogue does NOT currently go to the playback slide — it must").
        // Only on an in-app success: on the fallback they've already left for
        // the Music app. Same string as the log note, so the player, the log
        // and the Lately row all read alike.
        handOffNowPlaying({ id: h.appleTrackId!, title: listenedAs(h), from: "/hymns" });
        setLocation("/listening");
      });
      return;
    }
    /**
     * YOUTUBE PLAYS IN PHOEBE (owner, 2026-09-18: "Can it open the YouTube links
     * for hymns and such in app like we were building for other things?").
     * The same route the cathedral services take (lib/videoEmbed): where the
     * page has a real http(s) origin (web, Android) the /video page plays it
     * inline; on iOS, whose capacitor:// origin YouTube refuses (Error 153),
     * the same page opens in the in-app reader at withphoebe.app, and the app
     * underneath goes on to the log exactly as the other services do. A link
     * whose id can't be read still opens YouTube itself, as before.
     */
    if (service === "youtube") {
      const vid = youtubeIdFrom(url);
      if (vid) {
        noteForTheLog(h);
        if (canEmbedVideoHere()) {
          setLocation(videoPath(vid, { title: listenedAs(h), from: "/hymns", log: true }));
          return;
        }
        if (openVideoInReader(videoPath(vid, { title: listenedAs(h) }))) {
          setLocation("/listening?log=1");
          return;
        }
      }
    }
    noteForTheLog(h);
    openThenLog(url);
  };

  // Changing where your music comes from stops what the old one was playing —
  // otherwise audio runs on with no control for it anywhere on the page.
  useEffect(() => {
    if (service !== "apple" && playingId) { void stopAppleMusicNative(); setPlayingId(null); }
  }, [service, playingId]);

  const label = MUSIC_SERVICES.find((s) => s.id === service)?.label ?? "Spotify";

  // A frosted pill with a transparent native <select> laid over it, so a tap
  // opens the iOS wheel — the same control the contemplation length picker
  // uses, and the reason this isn't a row of buttons.
  //
  // "Play with", not "Open in" (owner, 2026-09-18: "If someone turns apple
  // music on and hits play on a hymn, it doesnt need to open the apple music
  // app anymore"). With the native player an Apple Music subscriber never
  // leaves Phoebe, so a label promising to open their app would be describing
  // the fallback rather than what happens. "Play with" is true either way.
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
          aria-label="Which app to open hymns in"
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

  const card = (h: Hymn, i: number) => {
    const url = urlFor(h, service);
    // `service` belongs here as well as in play(): without it, switching the
    // chooser mid-hymn left a pause button on a row whose service can no longer
    // pause anything — inert where the row has no link for the new service,
    // and a SECOND stream where it has one.
    const playing = service === "apple" && !!h.appleTrackId && playingId === h.appleTrackId;
    return (
      <div
        key={`${h.spotifyUrl}-${i}`}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: "11px 12px", borderRadius: 12, boxSizing: "border-box",
          background: "rgba(240,237,230,0.05)", border: `1px solid ${BORDER}`,
        }}
      >
        {/* The number, on the left, as a hymnal index reads it — but held to a
            narrow column so the name gets the room (owner: "move the numbers
            over to the right more so the card has more room"). Right-aligned
            and tabular, so single numbers still line up down the page and only
            a tune PAIR pushes out. */}
        <span
          aria-label={h.num.length ? `Hymn ${hymnNumberLabel(h)}` : undefined}
          style={{
            flex: "0 0 auto", minWidth: 28, textAlign: "right",
            color: h.num.length ? SAGE : "rgba(143,175,150,0.35)",
            fontFamily: FONT, fontSize: 14, fontWeight: 600, lineHeight: 1.25,
            fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
          }}
        >
          {/* Stacked, not joined (owner: "stack the numbers so they dont push
              the titles over"). A pair like 125, 126 set on one line widened
              this column and shoved every title right — and only on the rows
              that happen to be a pair, so the list lost its left edge. One
              number per line keeps the column the width of the widest single
              number, which is what the titles line up against. */}
          {h.num.length
            ? h.num.map((n) => (
                <span key={n} style={{ display: "block", lineHeight: 1.15 }}>{n}</span>
              ))
            : hymnNumberLabel(h)}
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

        {/* One play button, opening whichever service the chooser names. Shown
            dimmed and inert when this recording isn't on that service, rather
            than hidden — a row that silently loses its button reads as a bug,
            and the tooltip says which service is missing it. */}
        <button
          type="button"
          disabled={!url}
          onClick={() => url && play(h, url)}
          aria-label={playing ? `Pause ${h.name}` : url ? `Play ${h.name} with ${label}` : `${h.name} is not on ${label}`}
          title={url ? undefined : `Not on ${label}`}
          style={{
            flex: "0 0 auto", width: 36, height: 36, borderRadius: 999,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: url ? "pointer" : "default", opacity: url ? 1 : 0.28,
            background: url ? "rgba(46,107,64,0.45)" : "rgba(240,237,230,0.04)",
            border: `1px solid ${url ? "rgba(143,175,150,0.55)" : BORDER}`,
          }}
        >
          {playing ? (
            <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden focusable="false" style={{ display: "block" }}>
              <rect x="0.5" y="0.5" width="4" height="13" rx="1.1" fill={WARM} />
              <rect x="7.5" y="0.5" width="4" height="13" rx="1.1" fill={WARM} />
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
              Hymns
            </span>
            <span style={{ width: 24 }} />
          </div>

          <h1 style={{ color: WARM, fontFamily: FONT, fontSize: 22, fontWeight: 600, margin: "0 0 6px" }}>
            The Hymnal 1982
          </h1>
          <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, lineHeight: 1.5, margin: "0 0 14px" }}>
            Sung, in hymnal order. Tap play — it uses your own music subscription.
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
            {missing > 0 && ` · ${missing} not on ${label}`}
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
