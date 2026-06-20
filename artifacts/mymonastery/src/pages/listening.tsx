import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { saveListeningEntry, listeningHistory, type ListeningMedium, type ListeningEntry } from "@/lib/listeningLog";
import { EARTH_PHOTOS } from "@/lib/earthPhotos";

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

type View = "log" | "done" | "history";

export default function ListeningPage() {
  const [, navigate] = useLocation();
  const [view, setView] = useState<View>("log");
  const [what, setWhat] = useState("");
  // A still landscape behind the page (the shared non-animal set), picked once.
  const bgPhoto = useMemo(
    () => (EARTH_PHOTOS.length > 0 ? EARTH_PHOTOS[Math.floor(Math.random() * EARTH_PHOTOS.length)]! : null),
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

  // The whole log: note what + how, mark it done for today. (No amount.)
  function logToday() {
    saveListeningEntry({ minutes: 0, songs: 0, medium, what: what.trim() });
    markPracticeDoneToday("listening");
    setView("done");
  }

  // ——— Done / confirmation ———
  if (view === "done") {
    return (
      <Layout>
        <div className="max-w-xl mx-auto w-full min-h-[60vh] flex flex-col items-center justify-center text-center px-2">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <div className="text-4xl mb-5">🎧</div>
            <h1 className="text-2xl font-bold leading-tight mb-3" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>Amen.</h1>
            <p className="text-[17px] leading-relaxed mb-1" style={{ color: WARM, fontFamily: SERIF, fontStyle: "italic" }}>
              What did you hear in the quiet after the music?
            </p>
            <p className="text-[13px] mt-5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>Logged for today 🌿</p>
            <button
              onClick={() => navigate("/")}
              className="mt-8 px-7 py-3 rounded-full text-[15px] font-semibold active:scale-95 transition-transform"
              style={{ background: "rgba(46,107,64,0.9)", color: WARM, fontFamily: SPACE_GROTESK }}
            >
              Done
            </button>
          </motion.div>
        </div>
      </Layout>
    );
  }

  // ——— History (the log) ———
  if (view === "history") {
    const hist = listeningHistory();
    return (
      <Layout>
        <div className="max-w-xl mx-auto w-full">
          <button onClick={() => setView("log")} className="text-[14px] mb-5 inline-flex items-center gap-1.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
            ← <span>Audio Divina</span>
          </button>
          <h1 className="text-xl font-bold leading-tight mb-1" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>Listening log</h1>
          <p className="text-xs mb-5" style={{ color: SAGE }}>What you've sat with.</p>
          {hist.length === 0 ? (
            <p className="text-[14px] leading-relaxed mt-10 text-center" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SERIF, fontStyle: "italic" }}>
              Nothing logged yet. Your sittings will gather here.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {hist.map((e, i) => <HistoryRow key={`${e.ymd}-${i}`} e={e} />)}
            </div>
          )}
        </div>
      </Layout>
    );
  }

  // ——— Log (the main screen) — a simple two-field journal entry ———
  return (
    <Layout>
      {/* A still landscape behind the page, under a dark wash for legibility. */}
      {bgPhoto && (
        <>
          <img
            src={bgPhoto}
            alt=""
            aria-hidden
            style={{ position: "fixed", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.3, zIndex: -1 }}
          />
          <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,22,15,0.45) 0%, rgba(8,22,15,0.62) 38%, rgba(8,22,15,0.80) 100%)" }} />
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
          onChange={(e) => setWhat(e.target.value)}
          placeholder="A song, album, or artist…"
          className="w-full rounded-2xl px-4 py-3.5 mb-6 text-[15px] outline-none"
          style={glassField}
        />

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
          <p className="text-[11px]" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}>Stays on this device</p>
        </div>
      </div>
    </Layout>
  );
}

// ——— A log row — what you put on, how, and when ———
function HistoryRow({ e }: { e: ListeningEntry }) {
  const d = new Date(e.ymd + "T12:00:00");
  const day = Number.isNaN(d.getTime()) ? e.ymd : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const label = e.what?.trim() || (e.medium === "streaming" ? "Streaming" : e.medium.toUpperCase());
  return (
    <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <span className="text-[20px] leading-none flex-shrink-0" aria-hidden>{MEDIUM_EMOJI[e.medium] ?? "🎧"}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium truncate" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{label}</p>
        <p className="text-[11.5px] mt-0.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>{day}</p>
      </div>
    </div>
  );
}
