import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { openExternal } from "@/lib/openExternal";
import { canEmbedVideoHere, openVideoInReader, videoPath, youtubeIdFrom } from "@/lib/videoEmbed";
import { setAfterReader } from "@/lib/afterReader";
import { HYMNS, hymnNumberLabel, hymnKey, type Hymn } from "@/lib/hymnsCatalogue";

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
// EVERY HYMN PLAYS ON YOUTUBE, INSIDE PHOEBE (owner, 2026-09-18: "Play inside
// Phoebe, all in youtube" · "take out the apple and spotify options" · "just
// use youtube only"). The Apple Music player, the Spotify and Apple links and
// the "Play with" chooser are gone. A tap opens the hymn's own recording on
// the /video page (pages/video-watch): inline where the page has an http(s)
// origin (web, Android), in the in-app reader on iOS, whose capacitor:// origin
// YouTube refuses (Error 153). Phoebe holds no audio.
//
// Logging is the video page's own Done, in place. In the iOS reader, which has
// no sign-in and its own storage, the APP logs when the reader closes on Done
// — the track rides the hand-off note (lib/afterReader), so the reader's Back
// leaves nothing behind.
//
// A recording with no YouTube match (see lib/hymnsCatalogue for the rule: the
// same RECORDING, never a length-alike) is NOT SHOWN at all (owner,
// 2026-09-19: "Don't show any song not on YouTube in the catalogs").
// One play button per row (owner: "dont have all the icons on the right, just
// a play button"). See lib/hymnTexts for the words, shown only where they are
// public domain.

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

export default function HymnsPage() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");

  /**
   * ONLY WHAT PLAYS (owner, 2026-09-19: "Don't show any song not on YouTube in
   * the catalogs"). The 25 recordings with no proven YouTube upload used to
   * list dimmed; they are simply not shown now. The catalogue keeps them, so a
   * later match brings one back without anyone hunting for what was removed.
   */
  const PLAYABLE = useMemo(() => HYMNS.filter((h) => !!youtubeIdFrom(h.youtubeUrl)), []);

  const results = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return PLAYABLE;
    const words = q.split(/\s+/).filter(Boolean);
    return PLAYABLE.filter((h) => {
      // The number is searchable as a word of its own, so typing "154" finds
      // the hymn and "15" does not drag in every hymn with a 15 in its id.
      // The number is NOT in the haystack: as a substring "15" matched 115,
      // 150, 152, 154, 156, 158 and 159, and "66" matched 165/166 as well as
      // Hymn 66. It is only ever compared whole, below.
      const hay = norm([h.name, h.firstLine ?? "", h.artist].join(" "));
      const nums = h.num.map(String);
      return words.every((w) => hay.includes(w) || nums.some((n) => n === w));
    });
  }, [query, PLAYABLE]);

  /** What the log records: the number, the hymn and who sang it. */
  const listenedAs = (h: Hymn) =>
    h.num.length ? `Hymn ${hymnNumberLabel(h)} · ${h.name} — ${h.artist}` : `${h.name} — ${h.artist}`;

  const play = (h: Hymn) => {
    const vid = youtubeIdFrom(h.youtubeUrl);
    if (!vid) return;
    const sleeve = {
      title: h.name,
      eyebrow: h.num.length ? `Hymn ${hymnNumberLabel(h)}` : null,
      sub: h.artist,
      logAs: listenedAs(h),
      hymn: hymnKey(h),
    };
    if (canEmbedVideoHere()) {
      setLocation(videoPath(vid, { ...sleeve, from: "/hymns" }));
      return;
    }
    // iOS: the reader can't log (no sign-in, its own storage), so the APP
    // logs — when the reader closes on Done, not now. The bar there has two
    // exits and Back must leave nothing behind, so the track to log travels
    // with the hand-off note (lib/afterReader) and is written by whichever
    // close follows. Logging on the way IN meant a glance at the wrong
    // recording still counted the practice for the day (2026-09-19).
    if (openVideoInReader(videoPath(vid, sleeve))) {
      setAfterReader("/listening?lift=1", sleeve.logAs);
      return;
    }
    // No reader (an old shell): YouTube itself, as a last resort.
    void openExternal(h.youtubeUrl!, { system: true });
  };

  const card = (h: Hymn, i: number) => (
    <div
      key={`${h.spotifyUrl}-${i}`}
      role="button"
      tabIndex={0}
      aria-label={`Play ${h.name}`}
      onClick={() => play(h)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); play(h); } }}
      style={{
        cursor: "pointer",
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
            Sung, in hymnal order. Tap a hymn to hear it here.
          </p>

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
            {query.trim() ? `${results.length} of ${PLAYABLE.length}` : `${PLAYABLE.length} recordings`}
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
