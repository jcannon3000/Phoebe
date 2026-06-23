import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { RiseSheet } from "@/components/RiseSheet";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { type ListeningMedium } from "@/lib/listeningLog";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { searchCatalog, KIND_EMOJI, type SearchResult } from "@/lib/sacredLibrary";

// Audio Divina — sacred listening, kept as a PRIVATE, in-the-moment practice
// between the user and God. You note what you'll sit with + how, then mark it
// for the day. There is deliberately NO log, NO history, and NO sharing: a
// practice is presence, not performance — nothing here is stored as a record to
// be reviewed, compared, or seen by anyone else. (The only thing that persists
// is your own private "kept today" rhythm dot, the same as every other anchor.)

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const SERIF = SPACE_GROTESK;
// Frosted surface for the Mark button (not solid green).
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

export default function ListeningPage() {
  const [, setLocation] = useLocation();
  const [what, setWhat] = useState("");
  // Apple Music (→ Spotify) catalog suggestions for the "what" field, purely as
  // an in-the-moment aid to choose what to sit with. Nothing is saved.
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(false);
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

  // Mark the day's listening kept — the private rhythm dot only — then return.
  // Nothing about what you listened to is stored or shared.
  function markListened() {
    markPracticeDoneToday("listening");
    setLocation("/");
  }

  return (
    <RiseSheet bgPhoto={bgPhoto}>
      {() => (
      <div className="w-full">
        {/* Header — title only, no emoji */}
        <div className="mb-7">
          <h1 className="text-xl font-bold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>Audio Divina</h1>
          <p className="text-[13px] mt-0.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>Sacred listening — just between you and God.</p>
        </div>

        {/* 1 — What will you sit with? (ephemeral — never saved) */}
        <p className="text-[10.5px] uppercase tracking-[0.18em] mb-2" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
          What will you sit with?
        </p>
        <input
          value={what}
          onChange={(e) => { setWhat(e.target.value); setPicked(false); }}
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

        {/* 2 — How will you listen? (dropdown, 4 options) */}
        <p className="text-[10.5px] uppercase tracking-[0.18em] mb-2" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
          How will you listen?
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

        {/* Mark it — a quiet "kept today" for your own rhythm. Nothing stored,
            nothing shared. */}
        <button
          onClick={markListened}
          className="w-full py-4 rounded-2xl text-[16px] font-semibold active:scale-[0.98] transition-transform"
          style={{ ...FROST_CTA, color: WARM, fontFamily: SPACE_GROTESK }}
        >
          Mark today's listening
        </button>

        <p className="text-[11px] text-center mt-3" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}>
          Private — kept only on your own rhythm.
        </p>
      </div>
      )}
    </RiseSheet>
  );
}
