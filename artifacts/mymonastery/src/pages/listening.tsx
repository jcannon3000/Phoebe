import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import { RiseSheet } from "@/components/RiseSheet";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { pickWideBackground } from "@/lib/wideBackgrounds";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { type ListeningMedium } from "@/lib/listeningLog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { searchCatalog, KIND_EMOJI, type SearchResult } from "@/lib/sacredLibrary";

// Audio Divina — sacred listening, kept simple as a JOURNAL/TASK (like gratitude):
// you put on music, then note what you listened to + how, and mark it done for the
// day. No timer, no goal, no in-app player. Every entry is kept in a local log.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
// Visio Divina's own deck chrome, so the two practices read as siblings
// (owner: "don't have it come up like a drawer, have it be more like visio").
const DECK_BG = "#091A10";
const DECK_FAINT = "rgba(143,175,150,0.55)";
const DECK_BORDER = "rgba(46,107,64,0.38)";
// Audio Divina uses Space Grotesk for ALL text (no serif).
const SERIF = SPACE_GROTESK;
// Frosted surface for the visibility pill + the Log button (not solid green).
const FROST_CTA = {
  background: "rgba(9,26,16, 0.462)",
  backdropFilter: "blur(12.6px)",
  WebkitBackdropFilter: "blur(12.6px)",
  border: "1px solid rgba(200,212,192,0.28)",
} as const;

const MEDIA: { id: ListeningMedium; label: string }[] = [
  { id: "streaming", label: "Streaming" },
  { id: "cd", label: "CD" },
  { id: "vinyl", label: "Vinyl" },
  { id: "tape", label: "Tape" },
];

const MEDIUM_EMOJI: Record<ListeningMedium, string> = { streaming: "🎧", cd: "💿", vinyl: "📀", tape: "📼" };

// A glass field, matching the office close-slide composer look.
const glassField = {
  background: "rgba(9,26,16, 0.297)",
  backdropFilter: "blur(11.34px)",
  WebkitBackdropFilter: "blur(11.34px)",
  border: "1px solid rgba(200,212,192,0.18)",
  color: WARM,
  fontFamily: SPACE_GROTESK,
} as const;
// The ambient backdrop's bloom + wash. Both are anchored in PIXELS from the
// top of the page content (see the backdrop in the render): the layer spans the
// whole scrollable height, so percentage stops would make the bloom depend on
// how many records happen to be in the log. 0–260px is the hero; the colour is
// gone by ~860px, well above the shelf.
const BLOOM_MASK =
  "linear-gradient(180deg, rgba(0,0,0,1) 0px, rgba(0,0,0,1) 300px, rgba(0,0,0,0.4) 580px, rgba(0,0,0,0) 860px)";
const WASH =
  "linear-gradient(180deg, rgba(10,26,16,0.55) 0px, rgba(10,26,16,0.46) 220px, rgba(10,26,16,0.72) 520px, rgba(10,26,16,0.95) 760px, rgba(10,26,16,1) 900px)";

// A frosted-glass surface for the log rows (over the leaf backdrop).
const glassRow = {
  background: "rgba(9,26,16, 0.58)",
  backdropFilter: "blur(11.34px)",
  WebkitBackdropFilter: "blur(11.34px)",
  border: "1px solid rgba(200,212,192,0.18)",
} as const;

// "Today" / "Yesterday" / "Mon, Aug 24" for a log date (a local YYYY-MM-DD).
// Bare "Aug 24" made you do the arithmetic on the practice you kept yesterday.
function relDay(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

type View = "deck" | "log" | "history";

// One account-wide log entry (server-backed; syncs across the account).
type ServerEntry = { id: number; day: string; medium: ListeningMedium; what: string; artworkUrl?: string; felt?: string; shared?: boolean; createdAt: string };

export default function ListeningPage() {
  const [view, setView] = useState<View>("deck");
  const [deckStep, setDeckStep] = useState(0);
  /** Has this run through the deck already passed the log beat? See prev(). */
  const loggedHere = useRef(false);
  /** The leaf, picked once per open — the same backdrop Visio and its siblings use. */
  const deckBackdrop = useMemo(
    () => pickWideBackground() ?? (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );
  const deckTouch = useRef<{ x: number; y: number } | null>(null);
  // Kept today already? The form collapses behind a "Log another" button, so
  // the page reads as the practice rather than an empty form. This re-opens it.
  const [logAnother, setLogAnother] = useState(false);
  /**
   * Up to three emoji for what the listening FELT like — optional, and the
   * wordless alternative to writing a sentence about it (owner). Counted in
   * GRAPHEMES: 🙏🏽 is four UTF-16 units and a family emoji is eleven, so a
   * length check on `.length` would let one emoji fill the field or cut
   * another in half.
   */
  const [felt, setFelt] = useState("");
  const feltGraphemes = (v: string): string[] => (typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(v)].map((x) => x.segment)
    : [...v]);
  const feltCount = (v: string) => feltGraphemes(v).length;
  // `query` is the transient search text (never stored); `what` is the SELECTED
  // catalog title and is only ever set by tapping a result or a recent — you
  // can't log free-typed text. This keeps the log to structured Apple Music
  // catalog references (search-only; there's no playback or library link).
  const [query, setQuery] = useState("");
  const [what, setWhat] = useState("");
  // Apple Music catalog suggestions for the search field: artists, songs,
  // albums. Debounced; `picked` suppresses re-searching the text we just filled
  // in from a tap.
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(false);
  // Whether the search field is focused — drives the recents list that shows
  // before any catalog search (your own recent listens, one tap to refill).
  const [searchFocused, setSearchFocused] = useState(false);
  // Artwork of the picked song/artist/album (shown in the log).
  const [artworkUrl, setArtworkUrl] = useState("");
  useEffect(() => {
    const q = query.trim();
    if (picked || q.length < 2) { setResults([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const h = window.setTimeout(async () => {
      const r = await searchCatalog(q).catch(() => [] as SearchResult[]);
      if (!cancelled) { setResults(r); setSearching(false); }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(h); };
  }, [query, picked]);
  function chooseResult(r: SearchResult) {
    const title = r.subtitle ? `${r.title} — ${r.subtitle}` : r.title;
    setWhat(title);
    setQuery(title);
    setArtworkUrl(r.artworkUrl ?? "");
    setPicked(true);
    setResults([]);
  }
  const [medium, setMedium] = useState<ListeningMedium>(() => {
    try {
      const v = localStorage.getItem("phoebe:audio-divina-medium");
      return (v === "streaming" || v === "cd" || v === "vinyl" || v === "tape") ? v : "streaming";
    } catch { return "streaming"; }
  });

  function chooseMedium(m: ListeningMedium) {
    setMedium(m);
    try { localStorage.setItem("phoebe:audio-divina-medium", m); } catch { /* private mode */ }
  }

  // Account-wide listening log (server-backed, syncs across the account).
  const qc = useQueryClient();
  const { data: logData } = useQuery<{ entries: ServerEntry[] }>({
    queryKey: ["/api/listening"],
    queryFn: () => apiRequest("GET", "/api/listening"),
    staleTime: 60_000,
  });
  const entries = logData?.entries ?? [];
  // Your recent listens, deduped by title (newest first) — shown at the top of
  // the search the moment you focus it, so re-logging a favourite is one tap.
  const recents = useMemo(() => {
    const seen = new Set<string>();
    const out: { what: string; artworkUrl?: string; medium: ListeningMedium }[] = [];
    for (const e of [...entries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))) {
      const key = e.what?.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ what: e.what.trim(), artworkUrl: e.artworkUrl, medium: e.medium });
      if (out.length >= 6) break;
    }
    return out;
  }, [entries]);
  function chooseRecent(r: { what: string; artworkUrl?: string; medium: ListeningMedium }) {
    setWhat(r.what);
    setQuery(r.what);
    setArtworkUrl(r.artworkUrl ?? "");
    chooseMedium(r.medium);
    setPicked(true);
    setResults([]);
    setSearchFocused(false);
  }
  // Audio Divina is private — a personal listening log, no sharing with fellows.
  const logMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/listening", { day: new Date().toLocaleDateString("en-CA"), medium, what: what.trim(), artworkUrl, felt: feltForSave(), shared: false }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/listening"] }); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/listening/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/listening"] }); },
  });

  /**
   * The whole log: what you listened to + how, mark it done, then show the log.
   *
   * FREE TEXT IS ALLOWED. This used to insist on a catalog result — `what` was
   * only ever set by tapping a search result, so typing filled the box and left
   * the Log button dead. That rule only holds while the catalog is reachable,
   * and searchCatalog needs an Apple Music token server-side or a Spotify one
   * (CLIENT_ID is empty), so when neither answers there are no results to tap,
   * nothing can be picked, and the practice becomes impossible to log at all —
   * reported as "the logging wasn't working", and with it "the emojis weren't
   * working", because nothing could be saved for them to ride along with.
   *
   * A structured catalog reference is still what a tap gives you (title,
   * artist and artwork). Typing is the fallback, not the preference.
   */
  /** The first three emoji of whatever they typed — the field itself doesn't
   *  cap (see its own note), so the trim lives here, where saving happens. */
  function feltForSave(): string {
    return feltGraphemes(felt).filter((g) => /\p{Extended_Pictographic}/u.test(g)).slice(0, 3).join("");
  }

  function logToday() {
    if (!what.trim()) return;
    logMutation.mutate();
    markPracticeDoneToday("listening");
    setQuery(""); setWhat(""); setArtworkUrl(""); setPicked(false); setFelt("");
    // Stay on the practice — the new listen becomes the hero right here,
    // rather than throwing you onto the full-log screen to see that it saved.
    setLogAnother(false);
  }

  // Newest first, once, for every surface on the page.
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [entries],
  );
  const todayYmd = new Date().toLocaleDateString("en-CA");
  const todayEntry = sortedEntries.find((e) => e.day === todayYmd) ?? null;
  const keptToday = todayEntry !== null;
  // Today's listen when there is one, otherwise the last one — the page always
  // opens on music rather than on an empty form.
  const heroEntry = todayEntry ?? sortedEntries[0] ?? null;

  /**
   * AUDIO DIVINA AS A DECK — three beats.
   *
   * Owner: "we want to make a slideshow for Audio Divina like Visio Divina",
   * then "not seven beats", then the shape itself: "just intro slide, then
   * listen to a song that is on your heart… then the next slide is the log."
   *
   *   intro · listen · lift it in prayer · log
   *
   * Same idiom as the picture practice — one thing per screen, tap or swipe to
   * page, each beat fading in — and its own length, because the practice is
   * shaped differently. You don't choose the music here: it's the song already
   * on your heart, listened to ONCE (owner) — not a piece you return to the
   * way you return to a painting — and the listening happens away from the
   * screen. Prayer is its own beat after it, the way the picture practice
   * ends in prayer rather than in a record. The last
   * beat is the log this page already was, so nothing about what gets recorded
   * changes; the deck is the way in to it, and the log stays its own view for
   * going back over what you've sat with.
   */
  /**
   * Owner: "have the log before the second prompt."
   *
   * intro · listen · LOG · lift it in prayer.
   *
   * The recording is the middle of the practice, not the end of it. Writing
   * down what you listened to while it's fresh, and THEN lifting what it
   * stirred, leaves you in prayer rather than in a form — which is how the
   * picture practice ends too. Ending on the log made the last thing you did
   * data entry.
   */
  const INTRO = 0, LISTEN = 1, HOW = 2, LOG = 3, LIFT = 4;
  const DECK_TOTAL = 5;
  const LAST = LIFT;

  if (view === "deck") {
    const atLog = deckStep === LOG;
    const next = () => { if (deckStep < LAST) setDeckStep((n) => n + 1); };
    const prev = () => {
      // Stepping back from the prayer beat skips the log once it's been done —
      // logToday clears the form, so going back to it showed an empty one,
      // which reads as "it didn't save".
      if (deckStep === LIFT && loggedHere.current) { setDeckStep(LISTEN); return; }
      if (deckStep > INTRO) setDeckStep((n) => n - 1);
    };
    // Tap the left half to go back, the right half forward; swipe likewise —
    // lifted from the office deck and Visio Divina so every deck in the app
    // answers a gesture the same way. Not on the LOG beat: its taps belong to
    // the search field and the button.
    const gestureNav = !atLog;
    const onTapNavigate = (e: React.MouseEvent) => {
      if (!gestureNav) return;
      if ((e.target as HTMLElement | null)?.closest('button, a, input, textarea, select, label, [role="button"]')) return;
      if (e.clientX < window.innerWidth / 2) prev(); else next();
    };
    const onTouchStart = (e: React.TouchEvent) => {
      if (!gestureNav) return;
      deckTouch.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY };
    };
    const onTouchEnd = (e: React.TouchEvent) => {
      const start = deckTouch.current; deckTouch.current = null;
      if (!gestureNav || !start) return;
      const dx = e.changedTouches[0]!.clientX - start.x;
      const dy = e.changedTouches[0]!.clientY - start.y;
      if (Math.abs(dy) > Math.abs(dx) || Math.abs(dx) < 50) return;
      if (dx < 0) next(); else prev();
    };
    return (
      /**
       * Visio Divina's shell, not a drawer (owner). A rise-from-the-bottom
       * sheet reads as a panel over the app you were in; these practices are
       * somewhere you GO. Same ground, same leaf backdrop, same Back / title /
       * ✕ chrome, same footer — so the two decks are recognisably the same
       * kind of thing.
       */
      <div style={{ position: "fixed", inset: 0, background: DECK_BG, isolation: "isolate", display: "flex", flexDirection: "column", overflow: "hidden" }}
           onClick={onTapNavigate} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {deckBackdrop ? (
          <>
            <motion.img
              src={deckBackdrop}
              alt=""
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.22 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: -1 }}
            />
            <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,22,15,0.62) 0%, rgba(8,22,15,0.80) 52%, rgba(8,22,15,0.90) 100%)" }} />
          </>
        ) : (
          <AnimatedBackground base={DECK_BG} variant="subtle" />
        )}

        {/* Back / title / close — Visio's own header, to the pixel. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top) + 12px) 16px 8px", gap: 10 }}>
          <button
            type="button"
            onClick={prev}
            disabled={deckStep === INTRO}
            style={{ userSelect: "none", WebkitTapHighlightColor: "transparent", background: "none", border: "none", color: deckStep === INTRO ? "transparent" : SAGE, fontFamily: SPACE_GROTESK, fontSize: 14, cursor: deckStep === INTRO ? "default" : "pointer", padding: 6 }}
          >
            ← Back
          </button>
          <span style={{ color: DECK_FAINT, fontFamily: SPACE_GROTESK, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" }}>
            Audio Divina
          </span>
          <button
            type="button"
            onClick={() => setView("log")}
            aria-label="Close"
            style={{ userSelect: "none", WebkitTapHighlightColor: "transparent", width: 32, height: 32, borderRadius: 999, background: "rgba(9,26,16,0.5)", border: `1px solid ${DECK_BORDER}`, color: WARM, cursor: "pointer", padding: 0 }}
          >
            ✕
          </button>
        </div>

        {/* The beat itself — vertically centred, the way Visio's are (owner:
            "the previous slides are not vertically centered"). The LOG beat
            fills from the top instead: it's a form that can outgrow the screen,
            and centring it puts the first field under your thumb. */}
        <div
          style={{
            flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: atLog ? "flex-start" : "center",
            padding: "0 20px", gap: 16, overflowY: "auto",
          }}
        >
            <motion.div
              key={deckStep}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.34, ease: "easeOut" }}
              className="w-full flex flex-col items-center gap-4"
            >

              {/* Centred, like Visio's opening beat — the deck centres its
                  content vertically now, and a left-ragged title inside a
                  centred column reads as a mistake rather than a choice. */}
              {deckStep === INTRO && (
                <div className="w-full text-center" style={{ maxWidth: 480 }}>
                  <h1 className="prompt-rise text-[30px] font-bold leading-tight mb-3" style={{ color: WARM, fontFamily: SPACE_GROTESK, letterSpacing: "-0.02em" }}>
                    Sacred listening
                  </h1>
                  <p className="text-[16px] leading-relaxed" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                    Take time once a day to connect with God through music.
                  </p>
                </div>
              )}

              {/* The prompts are set exactly as Visio's are (owner: "the prompts
                  are different") — .prompt-rise, the app's illuminated
                  rise: a 6px lift as they fade in, then a slow breathing glow.
                  Space Grotesk, upright, 21px, same measure. */}
              {deckStep === LISTEN && (
                <p className="prompt-rise text-center" style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 21, fontWeight: 500, lineHeight: 1.6, maxWidth: 480, margin: 0 }}>
                  Let a song come to mind that feels sacred to you in this moment. Listen to it once — rest in the music, and listen for what touches your heart as you do.
                </p>
              )}

              {/* Owner: a beat between choosing the song and logging it —
                  "listen to the song in the way that is best for you at this
                  moment, then come back to log the song and continue in this
                  practice." The listening happens away from the screen, and
                  this is the beat that says so: how you play it is yours, and
                  the deck waits. */}
              {deckStep === HOW && (
                <p className="prompt-rise text-center" style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 21, fontWeight: 500, lineHeight: 1.6, maxWidth: 480, margin: 0 }}>
                  Listen to the song in the way that is best for you at this moment. Then come back to log it and continue in this practice.
                </p>
              )}

              {deckStep === LIFT && (
                <p className="prompt-rise text-center" style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 21, fontWeight: 500, lineHeight: 1.6, maxWidth: 480, margin: 0 }}>
                  Take a moment to lift to God what may be on your heart.
                </p>
              )}

              {atLog && (
                <div className="w-full">
                  {/* A TITLE, not a field label (owner) — every other beat in
                      the deck leads with one, and this one led with a caption
                      in 10px caps. */}
                  <h1 className="text-[26px] font-bold leading-tight mb-4" style={{ color: WARM, fontFamily: SPACE_GROTESK, letterSpacing: "-0.02em" }}>
                    What did you listen to?
                  </h1>
                  <input
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setPicked(false); setWhat(e.target.value); setArtworkUrl(""); }}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => window.setTimeout(() => setSearchFocused(false), 150)}
                    placeholder="Search a song, album, or artist…"
                    className="w-full rounded-2xl px-4 py-3.5 text-[15px] outline-none"
                    style={glassField}
                  />
                  {results.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1.5 max-h-[34vh] overflow-y-auto">
                      {results.map((r, i) => (
                        <button key={`r-${i}`} type="button" onClick={() => chooseResult(r)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left active:scale-[0.99]" style={glassRow}>
                          <span aria-hidden>{KIND_EMOJI[r.kind]}</span>
                          <span className="min-w-0">
                            <span className="block text-[14px] truncate" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{r.title}</span>
                            {r.subtitle && <span className="block text-[12px] truncate" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>{r.subtitle}</span>}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchFocused && !picked && query.trim().length < 2 && recents.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1.5 max-h-[30vh] overflow-y-auto">
                      <p className="text-[10px] uppercase tracking-[0.18em] px-1 pt-1" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>Recent</p>
                      {recents.map((r, i) => (
                        <button key={`rec-${i}`} type="button" onClick={() => chooseRecent(r)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left active:scale-[0.99]" style={glassRow}>
                          <span className="min-w-0 text-[14px] truncate" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{r.what}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-[10.5px] uppercase tracking-[0.18em] mt-5 mb-2" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                    How did you listen?
                  </p>
                  <div className="flex gap-1.5">
                    {MEDIA.map((x) => {
                      const on = medium === x.id;
                      return (
                        <button
                          key={x.id}
                          type="button"
                          onClick={() => chooseMedium(x.id)}
                          className="flex-1 rounded-xl py-2.5 text-[12.5px] font-semibold active:scale-[0.98] transition-transform"
                          style={{
                            background: on ? "rgba(46,107,64,0.55)" : "rgba(9,26,16,0.297)",
                            border: `1px solid ${on ? "rgba(168,197,160,0.6)" : "rgba(200,212,192,0.18)"}`,
                            color: on ? WARM : SAGE,
                            fontFamily: SPACE_GROTESK,
                          }}
                        >
                          <span aria-hidden>{MEDIUM_EMOJI[x.id]}</span> {x.label}
                        </button>
                      );
                    })}
                  </div>
                  {/* Owner: "in addition to the song they chose, let them have
                      an optional log where they can enter three emojis that
                      represent what they felt." Optional and wordless — the
                      alternative to writing a sentence, not a second thing to
                      write. Three is the ceiling, counted in graphemes so a
                      skin-toned 🙏🏽 or a family emoji counts as one. */}
                  <p className="text-[10.5px] uppercase tracking-[0.18em] mt-5 mb-2" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                    What did you feel? <span style={{ textTransform: "none", letterSpacing: 0, opacity: 0.7 }}>— optional, up to three emoji</span>
                  </p>
                  <input
                    value={felt}
                    /**
                     * NO CAP IN THE FIELD — the trim happens on save.
                     *
                     * Reported: "I can't change the emojis." Capping here was
                     * the cause. A controlled input that keeps the FIRST three
                     * refuses every later keystroke by setting state to the
                     * value it already had — React then has no re-render to do,
                     * so the DOM keeps whatever the keyboard inserted while
                     * state quietly disagrees, and swapping one emoji for
                     * another does nothing at all. Type freely; logToday keeps
                     * the first three (and the server trims again).
                     */
                    onChange={(e) => setFelt(e.target.value)}
                    inputMode="text"
                    placeholder="🕊️ 🌊 🙏🏽"
                    aria-label="Up to three emoji for what you felt"
                    maxLength={40}
                    className="w-full rounded-2xl px-4 py-3.5 text-[22px] text-center outline-none"
                    style={glassField}
                  />
                </div>
              )}
            </motion.div>
        </div>

        {/* Footer — Visio's, including the step counter. */}
        <div style={{ padding: "10px 20px calc(env(safe-area-inset-bottom) + 18px)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => {
              /**
               * The log records and MOVES ON to the prayer beat — it isn't the
               * end of the deck any more. The prayer beat is, and it closes out
               * to the log view.
               *
               * And with nothing to record it just moves on. Moving the log
               * into the MIDDLE of the deck turned a disabled button from a
               * "finish this to be done" into a locked door in front of the
               * last beat — reachable simply by having already logged today,
               * which leaves the field empty. Gesture nav is off on this beat
               * (its taps belong to the search field), so there was no way
               * past it at all. The practice must never trap you before its
               * prayer.
               */
              if (atLog) {
                // The flag means "a log was actually written", not "we passed
                // this beat" — set unconditionally it made Back skip the log
                // for someone who had recorded nothing, which is exactly the
                // person who might want to go back and record something.
                if (what.trim()) { logToday(); loggedHere.current = true; }
                next();
                return;
              }
              if (deckStep === LAST) { loggedHere.current = false; setDeckStep(INTRO); setView("log"); return; }
              next();
            }}
            style={{
              userSelect: "none", WebkitTapHighlightColor: "transparent",
              width: "100%", maxWidth: 420, borderRadius: 999, padding: "14px 20px",
              fontSize: 16, fontWeight: 600, fontFamily: SPACE_GROTESK,
              cursor: "pointer",
              ...FROST_CTA,
              border: `1px solid ${DECK_BORDER}`,
              background: "rgba(46,107,64,0.55)",
              color: WARM,
            }}
          >
            {deckStep === INTRO
              ? "Begin"
              // Only "Log it" when there is something to log; otherwise it's
              // simply the next beat, and saying "Log it" would promise a
              // record that isn't being written.
              : atLog ? (what.trim() ? "Log it" : "Continue")
                : deckStep === LAST ? "Done" : "Continue"}
          </button>
          <span style={{ color: DECK_FAINT, fontFamily: SPACE_GROTESK, fontSize: 11, letterSpacing: "0.12em" }}>
            {deckStep + 1} / {DECK_TOTAL}
          </span>
        </div>
      </div>
    );
  }

  // ——— History (the full log) ———
  if (view === "history") {
    return (
      <RiseSheet bgPhoto={null}>
        {() => (
          <motion.div className="w-full" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
            <button onClick={() => setView("log")} className="text-[14px] mb-5 inline-flex items-center gap-1.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
              ← <span>Audio Divina</span>
            </button>
            <h1 className="text-xl font-bold leading-tight mb-1" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>Listening log</h1>
            <p className="text-xs mb-5" style={{ color: SAGE }}>What you've sat with.</p>
            {entries.length === 0 ? (
              <p className="text-[14px] leading-relaxed mt-10 text-center" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SERIF, fontStyle: "italic" }}>
                Nothing logged yet. Your sittings will gather here.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {sortedEntries.map((e) => (
                  <EntryRow key={e.id} e={e} onDelete={(id) => deleteMutation.mutate(id)} deleting={deleteMutation.isPending} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </RiseSheet>
    );
  }

  // ——— Audio Divina — the practice, led by the music you chose ———
  return (
    <RiseSheet>
      {() => (
        <div className="w-full" style={{ position: "relative" }}>
          {/* Ambient backdrop: the hero's own cover art, blurred, so the page
              takes its colour from whatever you put on.
              
              TWO things this has to get right:
              
              1. HEIGHT. RiseSheet's own element is the SCROLL container, so an
                 `inset: 0` layer there is only viewport-tall and scrolls away
                 with the content — which left a hard horizontal seam partway
                 down the page, raw sheet colour below it. This layer is
                 anchored to a wrapper that's as tall as the CONTENT instead
                 (see the relative div below), with generous bleed past both
                 ends, so there's no edge to see at any scroll position.
              2. FULL BLEED. The content column is padded and max-width 576px;
                 the backdrop shouldn't be. 100vw + a centring translate takes
                 it edge to edge without a horizontal scrollbar.
              
              Still absolute, never position:fixed — that flashes on iOS. */}
          {heroEntry?.artworkUrl && (
            <>
              <motion.div
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.62 }}
                transition={{ duration: 1.1, ease: "easeOut" }}
                style={{
                  position: "absolute", top: -220, bottom: -260, left: "50%",
                  width: "100vw", transform: "translateX(-50%) scale(1.18)",
                  zIndex: -1,
                  backgroundImage: `url(${heroEntry.artworkUrl})`,
                  backgroundSize: "cover", backgroundPosition: "center top",
                  filter: "blur(64px) saturate(1.5)",
                  // The colour BLOOMS behind the hero and falls away before the
                  // log — a flat wall of blurred artwork the whole way down
                  // read as grey mud rather than as the record's own colour.
                  // PIXEL stops, not percentages: this layer is as tall as the
                  // CONTENT now, so a percentage would stretch the bloom on a
                  // long log and squash it on a short one. The bloom belongs a
                  // fixed distance behind the hero either way.
                  maskImage: BLOOM_MASK,
                  WebkitMaskImage: BLOOM_MASK,
                }}
              />
              {/* Wash: light enough at the top to let the bloom through,
                  settling to the sheet's own green so the log sits on a clean
                  ground rather than on tinted haze. */}
              <div
                aria-hidden
                style={{
                  position: "absolute", top: -220, bottom: -260, left: "50%",
                  width: "100vw", transform: "translateX(-50%)", zIndex: -1,
                  // Same reasoning as the mask — px stops, settling to solid
                  // sheet green well before the log so the covers sit on a
                  // clean ground however long the page runs.
                  background: WASH,
                }}
              />
            </>
          )}

          <div className="mb-6">
            <h1 className="text-xl font-bold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>Audio Divina</h1>
            <p className="text-[13px] mt-0.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>Sacred listening.</p>
          </div>

          {/* The practice leads with what you actually listened to — the cover
              art is the best thing on this page, so it gets the room. Before
              the first entry there's nothing to show, so the guide leads
              instead. */}
          {heroEntry ? (
            <NowHero entry={heroEntry} keptToday={keptToday} />
          ) : (
            <div className="mb-7 rounded-2xl px-4 py-4" style={glassRow}>
              <p className="text-[13.5px] leading-relaxed" style={{ color: "rgba(240,237,230,0.88)", fontFamily: SERIF, fontStyle: "italic" }}>
                Take time once a day to connect with God through music. Sit with a piece that means something to you, and meditate on what it opens in you.
              </p>
              <p className="text-[12.5px] leading-relaxed mt-2.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                Keep a log of what you've listened to — on streaming or on a record.
              </p>
            </div>
          )}

          <WeekStrip />

          {/* Kept today already → the form steps back behind one button, so the
              page reads as the practice rather than a form you must refill. */}
          {keptToday && !logAnother ? (
            <button
              onClick={() => setLogAnother(true)}
              className="w-full py-3.5 rounded-2xl text-[14.5px] font-semibold active:scale-[0.98] transition-transform"
              style={{ ...FROST_CTA, color: WARM, fontFamily: SPACE_GROTESK }}
            >
              Log another
            </button>
          ) : (
            <>
              <p className="text-[10.5px] uppercase tracking-[0.18em] mb-2" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                What did you listen to?
              </p>
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPicked(false); setWhat(e.target.value); setArtworkUrl(""); }}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => window.setTimeout(() => setSearchFocused(false), 150)}
                placeholder="Search a song, album, or artist…"
                className="w-full rounded-2xl px-4 py-3.5 text-[15px] outline-none"
                style={glassField}
              />
              {/* Recents — your own recent listens, shown the moment the field is
                  focused and before you've typed a search. One tap refills everything. */}
              {searchFocused && !picked && query.trim().length < 2 && recents.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5 max-h-[44vh] overflow-y-auto">
                  <p className="text-[10px] uppercase tracking-[0.18em] px-1 pt-1 pb-0.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>Recent</p>
                  {recents.map((r, i) => (
                    <button
                      key={`recent-${i}`}
                      type="button"
                      onClick={() => chooseRecent(r)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left active:scale-[0.99]"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      {r.artworkUrl ? (
                        <img src={r.artworkUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <span className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-[18px]" style={{ background: "rgba(46,107,64,0.3)" }} aria-hidden>{MEDIUM_EMOJI[r.medium] ?? "🎧"}</span>
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-medium truncate" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{r.what}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {/* Apple Music suggestions — artists, songs, albums. Tap one to select
                  it; only a tapped result becomes your logged entry (no free typing). */}
              {!picked && (searching || results.length > 0) && (
                <div className="mt-2 flex flex-col gap-1.5 max-h-[44vh] overflow-y-auto">
                  {searching && results.length === 0 && (
                    <p className="text-[12px] italic px-1 py-1.5" style={{ color: SAGE, fontFamily: SERIF }}>Searching…</p>
                  )}
                  {results.map((r, i) => (
                    <button
                      key={`${r.service}-${r.appleId ?? r.url}-${i}`}
                      type="button"
                      onClick={() => chooseResult(r)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left active:scale-[0.99]"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      {r.artworkUrl ? (
                        <img src={r.artworkUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <span className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-[18px]" style={{ background: "rgba(46,107,64,0.3)" }} aria-hidden>{KIND_EMOJI[r.kind]}</span>
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-medium truncate" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{r.title}</span>
                        <span className="block text-[11.5px] truncate" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>{r.subtitle ? `${r.subtitle} · ` : ""}{r.kind}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {/* Selection-only: if they've typed a search that found nothing (and
                  haven't picked), nudge them to pick a result — a free-typed line
                  can't be logged. */}
              {!picked && !searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="mt-2 text-[12px] px-1" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                  Pick a result from the search to log it.
                </p>
              )}

              {/* How you listened — a segmented row, not an OS dropdown. Four
                  options never needed a <select>, and this is a detail of the
                  entry rather than a second question of equal weight. */}
              <div className="mt-5 mb-6">
                <p className="text-[10.5px] uppercase tracking-[0.18em] mb-2" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                  How did you listen?
                </p>
                <div className="flex gap-1.5">
                  {MEDIA.map((x) => {
                    const on = medium === x.id;
                    return (
                      <button
                        key={x.id}
                        type="button"
                        onClick={() => chooseMedium(x.id)}
                        className="flex-1 rounded-xl py-2.5 text-[12.5px] font-semibold active:scale-[0.98] transition-transform"
                        style={{
                          background: on ? "rgba(46,107,64,0.55)" : "rgba(9,26,16,0.297)",
                          border: `1px solid ${on ? "rgba(168,197,160,0.6)" : "rgba(200,212,192,0.18)"}`,
                          color: on ? WARM : SAGE,
                          fontFamily: SPACE_GROTESK,
                        }}
                      >
                        <span aria-hidden>{MEDIUM_EMOJI[x.id]}</span> {x.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* The primary action reads as primary once there's something to
                  log — it used to sit there as a faint outline whether or not
                  it could be pressed. */}
              <button
                onClick={logToday}
                disabled={!what.trim()}
                className="w-full py-4 rounded-2xl text-[16px] font-semibold active:scale-[0.98] transition-transform disabled:active:scale-100"
                style={what.trim()
                  ? { background: "rgba(46,107,64,0.92)", border: "1px solid rgba(168,197,160,0.55)", color: WARM, fontFamily: SPACE_GROTESK }
                  : { ...FROST_CTA, color: "rgba(240,237,230,0.42)", fontFamily: SPACE_GROTESK }}
              >
                Log today's listening
              </button>
              <p className="text-[11px] text-center mt-3" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}>Synced to your account</p>
            </>
          )}

          {/* The guide is a welcome on day one and noise on day forty — once
              there's a log, it folds away behind a line you can open. */}
          {heroEntry && (
            <details className="mt-7 rounded-2xl px-4 py-3" style={glassRow}>
              <summary className="text-[12.5px] cursor-pointer list-none" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                About this practice
              </summary>
              <p className="text-[13.5px] leading-relaxed mt-3" style={{ color: "rgba(240,237,230,0.88)", fontFamily: SERIF, fontStyle: "italic" }}>
                Take time once a day to connect with God through music. Sit with a piece that means something to you, and meditate on what it opens in you.
              </p>
              <p className="text-[12.5px] leading-relaxed mt-2.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                Keep a log of what you've listened to — on streaming or on a record.
              </p>
            </details>
          )}

          <LogShelf entries={sortedEntries} onViewAll={() => setView("history")} />
        </div>
      )}
    </RiseSheet>
  );
}

// ——— Today's listen (or the last one), given the room the artwork deserves ———
function NowHero({ entry, keptToday }: { entry: ServerEntry; keptToday: boolean }) {
  const label = entry.what?.trim() || (entry.medium === "streaming" ? "Streaming" : entry.medium.toUpperCase());
  // "Song — Artist" is how chooseResult composes a title; split it so the two
  // can be set apart the way a player would.
  const [title, ...rest] = label.split(" — ");
  const artist = rest.join(" — ");
  return (
    <motion.div
      className="flex flex-col items-center text-center mb-7"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      {entry.artworkUrl ? (
        <img
          src={entry.artworkUrl}
          alt=""
          className="w-[148px] h-[148px] rounded-2xl object-cover"
          style={{ boxShadow: "0 18px 44px rgba(0,0,0,0.55)", background: "rgba(46,107,64,0.3)" }}
        />
      ) : (
        <span
          className="w-[148px] h-[148px] rounded-2xl flex items-center justify-center text-[52px]"
          style={{ background: "rgba(46,107,64,0.3)", boxShadow: "0 18px 44px rgba(0,0,0,0.55)" }}
          aria-hidden
        >
          {MEDIUM_EMOJI[entry.medium] ?? "🎧"}
        </span>
      )}
      <p
        className="text-[10px] uppercase tracking-[0.2em] mt-5"
        style={{ color: keptToday ? "rgba(168,197,160,0.95)" : "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}
      >
        {keptToday ? "Kept today ✓" : "Last listen"}
      </p>
      <p className="text-[19px] font-bold leading-tight mt-1.5 px-2" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{title}</p>
      {artist && <p className="text-[13.5px] mt-1" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>{artist}</p>}
      <p className="text-[11.5px] mt-2" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SPACE_GROTESK }}>
        <span aria-hidden>{MEDIUM_EMOJI[entry.medium] ?? "🎧"}</span> {relDay(entry.day)}
      </p>
    </motion.div>
  );
}

// ——— Seven days of the practice, the same dot strip the rhythm uses ———
function WeekStrip() {
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();
  const { data } = useQuery<{ days: Array<{ ymd: string; listening: boolean }> }>({
    queryKey: ["/api/me/practice-week", tz],
    queryFn: () => apiRequest("GET", "/api/me/practice-week"),
    staleTime: 60_000,
  });
  const days = data?.days ?? [];
  if (days.length === 0) return null;
  return (
    <div className="flex items-center justify-center gap-2.5 mb-7">
      {days.map((d) => {
        const wd = new Date(`${d.ymd}T12:00:00`).getDay();
        const letter = Number.isNaN(wd) ? "" : ["S", "M", "T", "W", "T", "F", "S"][wd];
        return (
          <div key={d.ymd} className="flex flex-col items-center gap-1.5">
            <span className="text-[9.5px] font-semibold" style={{ color: "rgba(143,175,150,0.45)", fontFamily: SPACE_GROTESK }}>{letter}</span>
            <span
              title={d.ymd}
              style={{
                width: 9, height: 9, borderRadius: 999,
                background: d.listening ? "rgba(110,180,130,0.85)" : "transparent",
                border: d.listening ? "none" : "1px solid rgba(143,175,150,0.28)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ——— The log as a shelf of covers, not a table of rows ———
function LogShelf({ entries, onViewAll }: { entries: ServerEntry[]; onViewAll: () => void }) {
  const shelf = entries.slice(0, 9);
  if (shelf.length === 0) return null;
  return (
    <div className="mt-9">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[15px] font-bold" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>Listening log</h2>
        <button onClick={onViewAll} className="text-[12.5px]" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>View all ›</button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {shelf.map((e) => {
          const label = e.what?.trim() || (e.medium === "streaming" ? "Streaming" : e.medium.toUpperCase());
          const [title] = label.split(" — ");
          return (
            <div key={e.id} className="min-w-0">
              {e.artworkUrl ? (
                <img
                  src={e.artworkUrl}
                  alt=""
                  className="w-full aspect-square rounded-xl object-cover"
                  style={{ background: "rgba(46,107,64,0.3)", boxShadow: "0 6px 18px rgba(0,0,0,0.4)" }}
                />
              ) : (
                <span
                  className="w-full aspect-square rounded-xl flex items-center justify-center text-[26px]"
                  style={{ background: "rgba(46,107,64,0.3)", boxShadow: "0 6px 18px rgba(0,0,0,0.4)" }}
                  aria-hidden
                >
                  {MEDIUM_EMOJI[e.medium] ?? "🎧"}
                </span>
              )}
              <p className="text-[11.5px] font-medium truncate mt-1.5" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{title}</p>
              <p className="text-[10.5px] truncate" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SPACE_GROTESK }}>{relDay(e.day)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ——— A log row — what you put on, how, and when. The full-log view only; the
// main screen shows the shelf above. ———
function EntryRow({ e, onDelete, deleting }: { e: ServerEntry; onDelete: (id: number) => void; deleting: boolean }) {
  const label = e.what?.trim() || (e.medium === "streaming" ? "Streaming" : e.medium.toUpperCase());
  return (
    <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={glassRow}>
      {e.artworkUrl ? (
        <img src={e.artworkUrl} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0" style={{ backgroundColor: "rgba(46,107,64,0.3)" }} />
      ) : (
        <span className="w-11 h-11 rounded-lg flex items-center justify-center text-[20px] flex-shrink-0" style={{ background: "rgba(46,107,64,0.3)" }} aria-hidden>{MEDIUM_EMOJI[e.medium] ?? "🎧"}</span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium truncate" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{label}</p>
        <p className="text-[11.5px] mt-0.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
          {MEDIUM_EMOJI[e.medium] ?? "🎧"} {relDay(e.day)}
          {/* What it felt like, if they said. Kept on this line rather than
              given its own: it's a colour on the entry, not a second fact. */}
          {e.felt ? <span className="ml-1.5" aria-label="what you felt">{e.felt}</span> : null}
        </p>
      </div>
      <button
        onClick={() => onDelete(e.id)}
        disabled={deleting}
        aria-label="Delete entry"
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity hover:opacity-100 disabled:opacity-40 self-start"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(200,150,140,0.9)", opacity: 0.75 }}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
