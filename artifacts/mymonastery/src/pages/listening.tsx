import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
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
import { openExternal } from "@/lib/openExternal";

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

type View = "deck" | "log" | "history" | "library";

type CuratedTrack = {
  id: number; trackNumber: number; title: string;
  appleUrl: string | null; spotifyUrl: string | null;
};
type CuratedAlbum = {
  id: number; title: string; artist: string; artworkUrl: string | null; note: string | null;
  appleUrl: string | null; spotifyUrl: string | null; tracks: CuratedTrack[];
};

// One account-wide log entry (server-backed; syncs across the account).
type ServerEntry = { id: number; day: string; medium: ListeningMedium; what: string; artworkUrl?: string; felt?: string; shared?: boolean; createdAt: string };

export default function ListeningPage() {
  const [, setLocation] = useLocation();
  const [view, setView] = useState<View>("deck");
  const [deckStep, setDeckStep] = useState(0);
  // The curated album library (admin-picked — see admin-audio-library.tsx).
  // Public, no auth needed — same as the ACT art library.
  const [libraryAlbum, setLibraryAlbum] = useState<CuratedAlbum | null>(null);
  const { data: libraryData } = useQuery<{ albums: CuratedAlbum[] }>({
    queryKey: ["/api/curated-audio"],
    queryFn: () => apiRequest("GET", "/api/curated-audio") as Promise<{ albums: CuratedAlbum[] }>,
    enabled: view === "library",
    staleTime: 5 * 60_000,
  });
  const curatedAlbums = libraryData?.albums ?? [];
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
    mutationFn: () => apiRequest("POST", "/api/listening", { day: new Date().toLocaleDateString("en-CA"), medium, what: what.trim(), artworkUrl, shared: false }),
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
   * reported as "the logging wasn't working".
   *
   * A structured catalog reference is still what a tap gives you (title,
   * artist and artwork). Typing is the fallback, not the preference.
   */
  function logToday() {
    if (!what.trim()) return;
    logMutation.mutate();
    markPracticeDoneToday("listening");
    setQuery(""); setWhat(""); setArtworkUrl(""); setPicked(false);
    setLogAnother(false);
    /**
     * IT DOES NOT LEAVE. This is the middle of the practice, not the end.
     *
     * `setLocation("/dashboard")` used to be the last line here, and it was
     * right when this function belonged to the old single-page form (owner,
     * then: "just have audio divina go to the home when done"). The deck was
     * built around it and nobody took it out — so logging your song at beat 4
     * of 6 navigated straight home and the two beats AFTER it, the lifting of
     * what the music stirred and the closing "Recent listening" slide, were
     * never reached by anyone who actually logged. The practice ended on data
     * entry, which is the exact thing the deck was written to stop.
     *
     * Leaving is now the closing slide's job, and only the closing slide's.
     */
  }

  // Newest first, once, for every surface on the page.
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [entries],
  );
  const todayYmd = new Date().toLocaleDateString("en-CA");
  const todayEntry = sortedEntries.find((e) => e.day === todayYmd) ?? null;
  const keptToday = todayEntry !== null;
  /**
   * Coming back through the deck: today's song is already in the field.
   *
   * logToday() clears the form, so a second pass used to meet a blank one with
   * the listen safely recorded — which is why the gate carried a "or they
   * already logged today" escape, and that escape was the hole that let
   * someone advance having named nothing. Putting the song back is the better
   * answer to the same problem: they can SEE what they logged, change it if
   * they want, and the gate stays strict without ever trapping anyone.
   *
   * Runs once per arrival, and only into an empty field, so it can never
   * overwrite something being typed.
   */
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current || !todayEntry) return;
    const song = todayEntry.what?.trim();
    if (!song) return;
    prefilledRef.current = true;
    setWhat((prev) => (prev.trim() ? prev : song));
    setQuery((prev) => (prev.trim() ? prev : song));
  }, [todayEntry]);
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
  const INTRO = 0, LISTEN = 1, HOW = 2, LOG = 3, LIFT = 4, DONE = 5;
  const DECK_TOTAL = 6;
  const LAST = DONE;

  // ——— Library (curated albums) ———
  if (view === "library") {
    const openLink = (url: string | null) => { if (url) void openExternal(url, { system: true }); };
    return (
      <RiseSheet bgPhoto={null}>
        {() => (
          <motion.div className="w-full" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
            <button
              onClick={() => { if (libraryAlbum) { setLibraryAlbum(null); } else { setView("deck"); } }}
              className="text-[14px] mb-5 inline-flex items-center gap-1.5"
              style={{ color: SAGE, fontFamily: SPACE_GROTESK, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              ← <span>{libraryAlbum ? "Library" : "Audio Divina"}</span>
            </button>

            {!libraryAlbum && (
              <>
                <h1 className="text-xl font-bold leading-tight mb-1" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>Library</h1>
                <p className="text-xs mb-5" style={{ color: SAGE }}>Albums to sit with — tap one to open a track in Apple Music or Spotify.</p>
                {curatedAlbums.length === 0 ? (
                  <p className="text-[14px] leading-relaxed mt-10 text-center" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SERIF, fontStyle: "italic" }}>
                    Nothing in the library yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {curatedAlbums.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setLibraryAlbum(a)}
                        className="text-left rounded-2xl overflow-hidden"
                        style={{ ...glassRow, padding: 10, cursor: "pointer" }}
                      >
                        {a.artworkUrl ? (
                          <img src={a.artworkUrl} alt="" loading="lazy" decoding="async" className="w-full aspect-square object-cover rounded-lg mb-2" style={{ backgroundColor: "rgba(46,107,64,0.3)" }} />
                        ) : (
                          <div className="w-full aspect-square rounded-lg mb-2 flex items-center justify-center text-[28px]" style={{ background: "rgba(46,107,64,0.3)" }}>🎧</div>
                        )}
                        <p className="text-[13px] font-medium leading-snug" style={{ color: WARM, fontFamily: SPACE_GROTESK, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.title}</p>
                        <p className="text-[11.5px] mt-0.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>{a.artist}</p>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {libraryAlbum && (
              <>
                <div className="flex items-center gap-3 mb-2">
                  {libraryAlbum.artworkUrl ? (
                    <img src={libraryAlbum.artworkUrl} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" style={{ backgroundColor: "rgba(46,107,64,0.3)" }} />
                  ) : (
                    <div className="w-16 h-16 rounded-lg flex-shrink-0 flex items-center justify-center text-[28px]" style={{ background: "rgba(46,107,64,0.3)" }}>🎧</div>
                  )}
                  <div className="min-w-0">
                    <p className="text-[16px] font-bold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{libraryAlbum.title}</p>
                    <p className="text-[13px] mt-0.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>{libraryAlbum.artist}</p>
                  </div>
                </div>
                {libraryAlbum.note && (
                  <p className="text-[13px] leading-relaxed mb-4" style={{ color: "rgba(143,175,150,0.85)", fontFamily: SERIF, fontStyle: "italic" }}>{libraryAlbum.note}</p>
                )}
                <div className="flex gap-2 mb-5">
                  {libraryAlbum.appleUrl && (
                    <button onClick={() => openLink(libraryAlbum.appleUrl)} className="flex-1 rounded-full py-2 text-[13px] font-semibold" style={{ ...FROST_CTA, color: WARM, fontFamily: SPACE_GROTESK }}>
                      Open album in Apple Music
                    </button>
                  )}
                  {libraryAlbum.spotifyUrl && (
                    <button onClick={() => openLink(libraryAlbum.spotifyUrl)} className="flex-1 rounded-full py-2 text-[13px] font-semibold" style={{ ...FROST_CTA, color: WARM, fontFamily: SPACE_GROTESK }}>
                      Open album in Spotify
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {libraryAlbum.tracks.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 rounded-2xl px-4 py-3" style={glassRow}>
                      <span style={{ color: DECK_FAINT, fontFamily: SPACE_GROTESK, fontSize: 12, width: 20, textAlign: "right", flexShrink: 0 }}>{t.trackNumber}</span>
                      <span className="flex-1 min-w-0 text-[13.5px]" style={{ color: WARM, fontFamily: SPACE_GROTESK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                      {t.appleUrl && (
                        <button onClick={() => openLink(t.appleUrl)} aria-label="Open in Apple Music" className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: WARM }}>
                          A
                        </button>
                      )}
                      {t.spotifyUrl && (
                        <button onClick={() => openLink(t.spotifyUrl)} aria-label="Open in Spotify" className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[15px]" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
                          🎵
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}
      </RiseSheet>
    );
  }

  /**
   * THE OLD SINGLE-PAGE FORM IS GONE (owner: "i asked that page it goes to
   * after to be taken out").
   *
   * It was only ever reachable from INSIDE the deck — its ✕, its closing
   * button, and the View-all sheet's back link all pointed at it — so nothing
   * outside this file could route to it, and every one of those three now
   * either leaves the practice or returns to the deck. Deleting it took the
   * hero, the week strip and the log shelf with it; the deck's own closing
   * slide already carries the recent listening and its View all.
   */
  if (view !== "history") {
    const atLog = deckStep === LOG;
    /**
     * THE LOG IS REQUIRED (owner: "it shouldn't go forward until they've
     * logged something").
     *
     * The deck used to walk past an empty form, which made the record
     * optional in a practice whose whole middle beat is making one — you could
     * arrive at the prayer having named nothing, and nothing would be kept.
     *
     * The old note here warned that a disabled button on a MIDDLE beat is a
     * locked door rather than a "finish this to be done", and that stands —
     * so the gate opens two ways. Something typed opens it, and so does
     * having ALREADY logged today: logToday() clears the form, so anyone
     * coming back through the deck a second time faces an empty field with
     * their listen safely recorded, and must not be held there. The ✕ also
     * still closes the deck from this beat, so the door is only to the next
     * beat, never out of the practice.
     */
    /**
     * A SONG, named, before the deck moves on.
     *
     * Owner: "they shouldn't be able to advance in the slideshow until they've
     * picked a song."
     *
     * This used to read `what.trim() || keptToday`, and the second half was
     * the hole: anyone who had already logged today could walk past an EMPTY
     * field, which is exactly "advancing without picking a song". The escape
     * existed for a real reason — logToday clears the form, so coming back
     * through the deck met a blank field with the listen safely recorded, and
     * holding them there would have been a locked door.
     *
     * The prefill below removes the need for the escape: a second pass finds
     * today's song already in the field, so the gate can be strict and still
     * trap nobody. The ✕ closes the deck from this beat regardless, so the
     * door is only ever to the next beat, never out of the practice.
     */
    const logSatisfied = !!what.trim();
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
            // CLOSE MEANS CLOSE. It used to drop you onto the old
            // single-page form — the page the owner asked to be taken out —
            // so the one control that says "I am done here" was the one that
            // handed you a second, older version of the same practice.
            onClick={() => setLocation("/dashboard")}
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
                  <p className="text-[16px] leading-relaxed mb-5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                    Take time once a day to connect with God through music.
                  </p>
                  {/* Owner: a curated library (Coltrane, Taizé, …) admins can
                      build — a way in for someone with nothing in mind yet,
                      not a replacement for "let a song come to mind". */}
                  <button
                    type="button"
                    onClick={() => setView("library")}
                    className="text-[14px]"
                    style={{ color: DECK_FAINT, fontFamily: SPACE_GROTESK, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
                  >
                    Browse the library →
                  </button>
                </div>
              )}

              {/* The prompts are set exactly as Visio's are (owner: "the prompts
                  are different") — .prompt-rise, the app's illuminated
                  rise: a 6px lift as they fade in, then a slow breathing glow.
                  Space Grotesk, upright, 21px, same measure. */}
              {deckStep === LISTEN && (
                <div className="w-full flex flex-col items-center gap-5" style={{ maxWidth: 480 }}>
                  <p className="prompt-rise text-center" style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 21, fontWeight: 500, lineHeight: 1.6, margin: 0 }}>
                    Let a song come to mind that feels sacred to you in this moment. Listen to it once — rest in the music, and listen for what touches your heart as you do.
                  </p>
                  {/**
                    * The last three, under the invitation (owner).
                    *
                    * "Let a song come to mind" is a real ask, and on the days
                    * nothing comes the practice stalls at its second beat. What
                    * you have already sat with is the most likely place for one
                    * to come from — so it's shown, quietly, as a reminder
                    * rather than a menu: these aren't tappable, because
                    * choosing here would make it a picker and the point is
                    * that the song comes to YOU.
                    */}
                  {sortedEntries.length > 0 && (
                    <div className="w-full flex flex-col gap-2">
                      <p className="text-center" style={{ color: DECK_FAINT, fontFamily: SPACE_GROTESK, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
                        Lately
                      </p>
                      {sortedEntries.slice(0, 3).map((e) => (
                        <div
                          key={e.id}
                          style={{
                            display: "flex", alignItems: "center", gap: 10, width: "100%",
                            padding: 8, borderRadius: 12, textAlign: "left",
                            background: "rgba(240,237,230,0.05)",
                            backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
                            border: `1px solid ${DECK_BORDER}`,
                          }}
                        >
                          {e.artworkUrl ? (
                            <img src={e.artworkUrl} alt="" loading="lazy" decoding="async"
                              style={{ width: 38, height: 38, objectFit: "cover", borderRadius: 7, flex: "0 0 auto" }} />
                          ) : (
                            <span aria-hidden style={{ width: 38, height: 38, borderRadius: 7, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, background: "rgba(46,107,64,0.3)" }}>
                              {MEDIUM_EMOJI[e.medium] ?? "🎧"}
                            </span>
                          )}
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ display: "block", color: WARM, fontFamily: SPACE_GROTESK, fontSize: 14, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {e.what?.trim() || (MEDIUM_EMOJI[e.medium] ?? "🎧")}
                            </span>
                            <span style={{ display: "block", color: DECK_FAINT, fontFamily: SPACE_GROTESK, fontSize: 11, marginTop: 2 }}>
                              {relDay(e.day)}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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

              {/**
                * THE CLOSING SLIDE — a list of cards, like Visio Divina's.
                *
                * Owner: "the last slide of audio should look more like the
                * visio, not the other audio with the big thumbnail — a list of
                * cards." The log page opens on ONE big hero, which is the
                * right shape for a page you visit to see what you're keeping
                * and the wrong shape for the end of a practice: what closes a
                * deck is the little gathering of what you've sat with, the
                * newest one first. Same frosted row, same 52px thumbnail, same
                * two lines the picture practice uses — so the two practices
                * end the same way.
                */}
              {deckStep === DONE && (
                <div style={{ width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* A TITLE, then an eyebrow over the cards (owner). "Audio
                      Divina complete" was set as a 10px caption, which is the
                      size the app uses for LABELS — so the one line that says
                      the practice is finished was the quietest thing on its
                      own closing slide. It's the heading now, matched to the
                      deck's other titles, and the caption size goes to the
                      thing it actually labels: the list underneath. */}
                  <h1 className="text-center text-[26px] font-bold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK, letterSpacing: "-0.02em", margin: "0 0 6px" }}>
                    Audio Divina complete
                  </h1>
                  {sortedEntries.length > 0 && (
                    <p className="text-center" style={{ color: DECK_FAINT, fontFamily: SPACE_GROTESK, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", margin: "0 0 2px" }}>
                      Recent listening
                    </p>
                  )}
                  {sortedEntries.slice(0, 5).map((e) => (
                    <div
                      key={e.id}
                      style={{
                        userSelect: "none", WebkitTapHighlightColor: "transparent",
                        display: "flex", alignItems: "center", gap: 12, width: "100%",
                        padding: 10, borderRadius: 14, textAlign: "left",
                        background: "rgba(240,237,230,0.06)",
                        backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
                        border: `1px solid ${DECK_BORDER}`,
                      }}
                    >
                      {e.artworkUrl ? (
                        <img src={e.artworkUrl} alt="" loading="lazy" decoding="async"
                          style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, flex: "0 0 auto", boxShadow: "0 6px 18px rgba(0,0,0,0.45)" }} />
                      ) : (
                        <span aria-hidden style={{ width: 52, height: 52, borderRadius: 8, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, background: "rgba(46,107,64,0.3)" }}>
                          {MEDIUM_EMOJI[e.medium] ?? "🎧"}
                        </span>
                      )}
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: "block", color: WARM, fontFamily: SPACE_GROTESK, fontSize: 15.5, lineHeight: 1.3 }}>
                          {e.what?.trim() || (MEDIUM_EMOJI[e.medium] ?? "🎧")}
                        </span>
                        <span style={{ display: "block", color: DECK_FAINT, fontFamily: SPACE_GROTESK, fontSize: 11.5, marginTop: 3 }}>
                          {MEDIUM_EMOJI[e.medium] ?? "🎧"} {relDay(e.day)}
                        </span>
                      </span>
                    </div>
                  ))}
                  {sortedEntries.length === 0 && (
                    <p className="text-center" style={{ color: DECK_FAINT, fontFamily: SPACE_GROTESK, fontSize: 14, lineHeight: 1.6, margin: "8px 0 0" }}>
                      Your listening will gather here.
                    </p>
                  )}
                  {/* VIEW ALL (owner) — the slide shows the five most recent,
                      and until now that was the end of it: no way from the
                      close of the practice to everything you've sat with. The
                      full log is a view this page already has; this is the
                      door to it. Same phrasing as the log page's own shelf
                      link, so it's recognisably the same door.

                      It leaves the deck, so it resets the deck the way "Done"
                      does — otherwise coming back in would drop you on the
                      closing slide of a practice you hadn't done yet. */}
                  {sortedEntries.length > 5 && (
                    <button
                      type="button"
                      onClick={() => { loggedHere.current = false; setDeckStep(INTRO); setView("history"); }}
                      style={{
                        userSelect: "none", WebkitTapHighlightColor: "transparent",
                        alignSelf: "center", marginTop: 6, background: "none", border: "none",
                        color: SAGE, fontFamily: SPACE_GROTESK, fontSize: 13, cursor: "pointer", padding: "8px 12px",
                      }}
                    >
                      View all ›
                    </button>
                  )}
                </div>
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
                // Nothing named and nothing kept today: the beat holds. (The
                // button is disabled too — this is the belt to that's braces,
                // since a keyboard Enter can still reach a styled button.)
                if (!logSatisfied) return;
                // The flag means "a log was actually written", not "we passed
                // this beat" — set unconditionally it made Back skip the log
                // for someone who had recorded nothing, which is exactly the
                // person who might want to go back and record something.
                if (what.trim()) { logToday(); loggedHere.current = true; }
                next();
                return;
              }
              // The closing slide finishes the practice and returns to the
              // rhythm. (It used to reset to the intro and show the old form.)
              if (deckStep === LAST) { loggedHere.current = false; setDeckStep(INTRO); setLocation("/dashboard"); return; }
              next();
            }}
            disabled={atLog && !logSatisfied}
            style={{
              userSelect: "none", WebkitTapHighlightColor: "transparent",
              width: "100%", maxWidth: 420, borderRadius: 999, padding: "14px 20px",
              fontSize: 16, fontWeight: 600, fontFamily: SPACE_GROTESK,
              cursor: atLog && !logSatisfied ? "default" : "pointer",
              ...FROST_CTA,
              border: `1px solid ${DECK_BORDER}`,
              // Dimmed rather than hidden, so it reads as "not yet" instead of
              // "gone" — the field above it is what turns it on.
              background: atLog && !logSatisfied ? "rgba(46,107,64,0.22)" : "rgba(46,107,64,0.55)",
              color: atLog && !logSatisfied ? SAGE : WARM,
            }}
          >
            {deckStep === INTRO
              ? "Begin"
              // "Log it" whenever a record is wanted — including while the
              // field is still empty and the button is held, because that is
              // the moment the label has a job: it names what's missing.
              // "Continue" only for someone who already logged today and left
              // the form empty, where a second record isn't being made.
              : atLog ? (what.trim() || !keptToday ? "Log it" : "Continue")
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
  // view === "history" — the only other thing this page is.
  {
    return (
      <RiseSheet bgPhoto={null}>
        {() => (
          <motion.div className="w-full" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
            <button onClick={() => { setView("deck"); setDeckStep(LAST); }} className="text-[14px] mb-5 inline-flex items-center gap-1.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
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

}

/* (NowHero, WeekStrip and LogShelf lived here. They were the old
   single-page form's hero, its week strip and its shelf of recent listens,
   and nothing else ever rendered them — the deck's closing slide carries the
   recent listening now, with its own View all.) */

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
