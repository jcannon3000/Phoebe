import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import { RiseSheet } from "@/components/RiseSheet";
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
// A frosted-glass surface for the log rows (over the leaf backdrop).
const glassRow = {
  background: "rgba(9,26,16, 0.58)",
  backdropFilter: "blur(11.34px)",
  WebkitBackdropFilter: "blur(11.34px)",
  border: "1px solid rgba(200,212,192,0.18)",
} as const;

type View = "log" | "history";

// One account-wide log entry (server-backed; syncs across the account).
type ServerEntry = { id: number; day: string; medium: ListeningMedium; what: string; artworkUrl?: string; shared?: boolean; createdAt: string };

export default function ListeningPage() {
  const [view, setView] = useState<View>("log");
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

  // The whole log: pick what (from search) + how, mark it done, then show the
  // log. (No amount.) You must pick a catalog result — no free-typed entries.
  function logToday() {
    if (!what.trim()) return;
    logMutation.mutate();
    markPracticeDoneToday("listening");
    setQuery(""); setWhat(""); setArtworkUrl(""); setPicked(false);
    setView("history");
  }

  // ——— History (the log) ———
  if (view === "history") {
    return (
      <RiseSheet>
        {() => (
        <>        <motion.div className="w-full" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
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
              {entries.map((e) => <HistoryRow key={e.id} e={e} onDelete={(id) => deleteMutation.mutate(id)} deleting={deleteMutation.isPending} />)}
            </div>
          )}
        </motion.div>
        </>
        )}
      </RiseSheet>
    );
  }

  // ——— Log (the main screen) — a simple two-field journal entry ———
  return (
    <RiseSheet>
      {() => (
      <>      <div className="w-full">
        {/* Header — title only, no emoji */}
        <div className="mb-5">
          <h1 className="text-xl font-bold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>Audio Divina</h1>
          <p className="text-[13px] mt-0.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>Sacred listening.</p>
        </div>

        {/* Practice guide — how to keep Audio Divina. */}
        <div className="mb-7 rounded-2xl px-4 py-4" style={glassRow}>
          <p className="text-[13.5px] leading-relaxed" style={{ color: "rgba(240,237,230,0.88)", fontFamily: SERIF, fontStyle: "italic" }}>
            Take time once a day to sit with a meaningful piece of music. In its beauty, meditate on what touches your heart.
          </p>
          <p className="text-[12.5px] leading-relaxed mt-2.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
            Keep a log of what you've listened to — on streaming or on a record.
          </p>
        </div>

        {/* 1 — What did you listen to? */}
        <p className="text-[10.5px] uppercase tracking-[0.18em] mb-2" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
          What did you listen to?
        </p>
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPicked(false); setWhat(""); setArtworkUrl(""); }}
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
        <div className="mb-6" />

        {/* 2 — How did you listen? (dropdown, 4 options) */}
        <p className="text-[10.5px] uppercase tracking-[0.18em] mb-2" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
          How did you listen?
        </p>
        <select
          value={medium}
          onChange={(e) => chooseMedium(e.target.value as ListeningMedium)}
          className="w-full rounded-2xl px-4 py-3.5 mb-7 text-[15px] outline-none"
          style={{ ...glassField, colorScheme: "dark" }}
        >
          {MEDIA.map((x) => (
            <option key={x.id} value={x.id}>{MEDIUM_EMOJI[x.id]}  {x.label}</option>
          ))}
        </select>

        {/* Log it — frosted, like marking a task done, plus it saves to your log.
            Disabled until you've picked something from search (selection-only). */}
        <button
          onClick={logToday}
          disabled={!what.trim()}
          className="w-full py-4 rounded-2xl text-[16px] font-semibold active:scale-[0.98] transition-transform disabled:opacity-40 disabled:active:scale-100"
          style={{ ...FROST_CTA, color: WARM, fontFamily: SPACE_GROTESK }}
        >
          Log today's listening
        </button>

        <p className="text-[11px] text-center mt-3" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}>Synced to your account</p>

        {/* ——— Listening log preview — a home-style section under the form:
            section header + View all, then the first 7 cards (yours + fellows). */}
        <LogPreviewSection entries={entries} onViewAll={() => setView("history")} />
      </div>
      </>
      )}
    </RiseSheet>
  );
}

// ——— Inline log preview — a home-style section: header + View all, then the
// first 7 cards. Merges your own entries with any fellows' shared cards,
// newest first. Lives under the form on the main Audio Divina screen.
function LogPreviewSection({ entries, onViewAll }: { entries: ServerEntry[]; onViewAll: () => void }) {
  // Your own listens, newest-first, capped at 7. (Private — no fellows' cards.)
  type Card = { id: string; what: string; medium: ListeningMedium; artworkUrl?: string; createdAt: string; who: string | null; avatarUrl: string | null };
  const mine: Card[] = entries.map((e) => ({ id: `me-${e.id}`, what: e.what, medium: e.medium, artworkUrl: e.artworkUrl, createdAt: e.createdAt, who: null, avatarUrl: null }));
  const cards = [...mine].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 7);
  if (cards.length === 0) return null;
  return (
    <div className="mt-9">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[15px] font-bold" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>Listening log</h2>
        <button onClick={onViewAll} className="text-[12.5px]" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>View all ›</button>
      </div>
      <div className="flex flex-col gap-2">
        {cards.map((c) => {
          const d = new Date(c.createdAt);
          const day = Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
          const label = c.what?.trim() || (c.medium === "streaming" ? "Streaming" : c.medium.toUpperCase());
          return (
            <div key={c.id} className="flex items-center gap-3 rounded-2xl px-4 py-3" style={glassRow}>
              {c.artworkUrl ? (
                <img src={c.artworkUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" style={{ backgroundColor: "rgba(46,107,64,0.3)" }} />
              ) : (
                <span className="w-10 h-10 rounded-lg flex items-center justify-center text-[18px] flex-shrink-0" style={{ background: "rgba(46,107,64,0.3)" }} aria-hidden>{MEDIUM_EMOJI[c.medium] ?? "🎧"}</span>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium truncate" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{label}</p>
                <p className="text-[11.5px] mt-0.5 truncate" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>{c.who ? `${c.who} · ` : ""}{MEDIUM_EMOJI[c.medium] ?? "🎧"} {day}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ——— A log row — what you put on, how, and when ———
function HistoryRow({ e, onDelete, deleting }: { e: ServerEntry; onDelete: (id: number) => void; deleting: boolean }) {
  const d = new Date(e.day + "T12:00:00");
  const day = Number.isNaN(d.getTime()) ? e.day : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
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
        <p className="text-[11.5px] mt-0.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>{MEDIUM_EMOJI[e.medium] ?? "🎧"} {day}</p>
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

