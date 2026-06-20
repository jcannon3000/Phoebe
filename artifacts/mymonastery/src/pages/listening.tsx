import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { type ListeningMedium } from "@/lib/listeningLog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { searchCatalog, KIND_EMOJI, type SearchResult } from "@/lib/sacredLibrary";

// Audio Divina — sacred listening, kept simple as a JOURNAL/TASK (like gratitude):
// you put on music, then note what you listened to + how, and mark it done for the
// day. No timer, no goal, no in-app player. Every entry is kept in a local log.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

const MEDIA: { id: ListeningMedium; label: string }[] = [
  { id: "streaming", label: "Streaming" },
  { id: "cd", label: "CD" },
  { id: "vinyl", label: "Vinyl" },
  { id: "tape", label: "Tape" },
];

const MEDIUM_EMOJI: Record<ListeningMedium, string> = { streaming: "🎧", cd: "💿", vinyl: "📀", tape: "📼" };

// A glass field, matching the office close-slide composer look.
const glassField = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: WARM,
  fontFamily: SPACE_GROTESK,
} as const;

type View = "log" | "history";

// One account-wide log entry (server-backed; syncs across the account).
type ServerEntry = { id: number; day: string; medium: ListeningMedium; what: string; artworkUrl?: string; experience?: string; createdAt: string };

export default function ListeningPage() {
  const [, navigate] = useLocation();
  const [view, setView] = useState<View>("log");
  const [what, setWhat] = useState("");
  // Apple Music (→ Spotify) catalog suggestions for the "what" field: artists,
  // songs, albums. Debounced; `picked` suppresses re-searching the text we just
  // filled in from a tap. Falls back to plain typing when no source is available.
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(false);
  // Artwork of the picked song/artist/album (shown in the log) + an optional
  // reflection on the listening.
  const [artworkUrl, setArtworkUrl] = useState("");
  const [experience, setExperience] = useState("");
  useEffect(() => {
    const q = what.trim();
    if (picked || q.length < 2) { setResults([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const h = window.setTimeout(async () => {
      const r = await searchCatalog(q).catch(() => [] as SearchResult[]);
      if (!cancelled) { setResults(r); setSearching(false); }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(h); };
  }, [what, picked]);
  function chooseResult(r: SearchResult) {
    setWhat(r.subtitle ? `${r.title} — ${r.subtitle}` : r.title);
    setArtworkUrl(r.artworkUrl ?? "");
    setPicked(true);
    setResults([]);
  }
  // A still landscape behind the page (the shared non-animal set), picked once.
  const bgPhoto = useMemo(
    () => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );
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
  const logMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/listening", { day: new Date().toLocaleDateString("en-CA"), medium, what: what.trim(), artworkUrl, experience }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/listening"] }); },
  });

  // The whole log: note what + how, mark it done, then show the log. (No amount.)
  function logToday() {
    logMutation.mutate();
    markPracticeDoneToday("listening");
    setWhat(""); setExperience(""); setArtworkUrl("");
    setView("history");
  }

  // ——— History (the log) ———
  if (view === "history") {
    return (
      <Layout>
        <div className="max-w-xl mx-auto w-full">
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
              {entries.map((e) => <HistoryRow key={e.id} e={e} />)}
            </div>
          )}
        </div>
      </Layout>
    );
  }

  // ——— Log (the main screen) — a simple two-field journal entry ———
  return (
    <Layout>
      <div style={{ position: "relative", isolation: "isolate", flex: 1, display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {/* A still landscape behind the page. MUST be position:absolute inside this
          isolation:isolate host (NOT position:fixed) — fixed + z-index:-1 gets
          painted behind the opaque page background in the iOS WebView, so the
          photo flashes then vanishes. This matches the office slideshow, which
          renders reliably. flex:1 fills the viewport so it's still full-bleed. */}
      {bgPhoto && (
        <>
          <img
            src={bgPhoto}
            alt=""
            aria-hidden
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.4, zIndex: -1 }}
          />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,22,15,0.45) 0%, rgba(8,22,15,0.62) 38%, rgba(8,22,15,0.80) 100%)" }} />
        </>
      )}
      <div className="max-w-xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-start gap-3 mb-7">
          <div className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0" style={{ background: "rgba(62,124,122,0.18)", border: "1px solid rgba(62,124,122,0.35)" }}>
            🎧
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>Audio Divina</h1>
            <p className="text-[13px] mt-0.5" style={{ color: SAGE, fontFamily: SERIF, fontStyle: "italic" }}>Sacred listening.</p>
          </div>
        </div>

        {/* 1 — What did you listen to? */}
        <p className="text-[10.5px] uppercase tracking-[0.18em] mb-2" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
          What did you listen to?
        </p>
        <input
          value={what}
          onChange={(e) => { setWhat(e.target.value); setPicked(false); setArtworkUrl(""); }}
          placeholder="A song, album, or artist…"
          className="w-full rounded-2xl px-4 py-3.5 text-[15px] outline-none"
          style={glassField}
        />
        {/* Apple Music suggestions — artists, songs, albums. Tap one to fill the
            field. Stays empty (plain typing) when no catalog source is wired. */}
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

        {/* 3 — How was your experience? (optional reflection) */}
        <p className="text-[10.5px] uppercase tracking-[0.18em] mb-2" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
          How was your experience? <span style={{ opacity: 0.6, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
        </p>
        <textarea
          value={experience}
          onChange={(e) => setExperience(e.target.value.slice(0, 500))}
          rows={3}
          placeholder="What did it stir in you?"
          className="w-full rounded-2xl px-4 py-3.5 mb-7 text-[15px] outline-none resize-none"
          style={{ ...glassField, fontFamily: SERIF, fontStyle: "italic", lineHeight: 1.6 }}
        />

        {/* Log it — like marking a task done, plus it saves to your log. */}
        <button
          onClick={logToday}
          className="w-full py-4 rounded-2xl text-[16px] font-semibold active:scale-[0.98] transition-transform"
          style={{ background: "rgba(46,107,64,0.9)", color: WARM, fontFamily: SPACE_GROTESK }}
        >
          Log today's listening
        </button>

        <div className="flex items-center justify-between mt-5">
          <button onClick={() => setView("history")} className="text-[13px] inline-flex items-center gap-1" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
            See your listening log <span aria-hidden>›</span>
          </button>
          <p className="text-[11px]" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}>Synced to your account</p>
        </div>
      </div>
      </div>
    </Layout>
  );
}

// ——— A log row — what you put on, how, and when ———
function HistoryRow({ e }: { e: ServerEntry }) {
  const d = new Date(e.day + "T12:00:00");
  const day = Number.isNaN(d.getTime()) ? e.day : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const label = e.what?.trim() || (e.medium === "streaming" ? "Streaming" : e.medium.toUpperCase());
  return (
    <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      {e.artworkUrl ? (
        <img src={e.artworkUrl} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0" style={{ backgroundColor: "rgba(46,107,64,0.3)" }} />
      ) : (
        <span className="w-11 h-11 rounded-lg flex items-center justify-center text-[20px] flex-shrink-0" style={{ background: "rgba(46,107,64,0.3)" }} aria-hidden>{MEDIUM_EMOJI[e.medium] ?? "🎧"}</span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium truncate" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{label}</p>
        <p className="text-[11.5px] mt-0.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>{MEDIUM_EMOJI[e.medium] ?? "🎧"} {day}</p>
        {e.experience?.trim() ? (
          <p className="text-[12.5px] mt-1.5 leading-snug" style={{ color: "rgba(240,237,230,0.78)", fontFamily: SERIF, fontStyle: "italic" }}>{e.experience.trim()}</p>
        ) : null}
      </div>
    </div>
  );
}
