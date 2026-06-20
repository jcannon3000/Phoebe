import { useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { saveListeningEntry, listeningHistory, type ListeningMedium, type ListeningEntry } from "@/lib/listeningLog";
import { SacredLibrary } from "@/components/SacredLibrary";

// Audio Divina — sacred listening. A simple did-you-or-not daily log: put on
// music (streaming via your Sacred Library, or an analog medium you own), then
// mark it for the day. No timer, no goal, no length — just whether you listened.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

const MEDIA: { id: ListeningMedium; emoji: string; label: string; cue: string }[] = [
  { id: "streaming", emoji: "🎧", label: "Streaming", cue: "" },
  { id: "cd", emoji: "💿", label: "CD", cue: "Put on your CD and listen — log it when you're done." },
  { id: "vinyl", emoji: "📀", label: "Vinyl", cue: "Drop the needle and listen — log it when you're done." },
  { id: "tape", emoji: "📼", label: "Tape", cue: "Press play and listen — log it when you're done." },
];

const MEDIUM_EMOJI: Record<ListeningMedium, string> = { streaming: "🎧", cd: "💿", vinyl: "📀", tape: "📼" };

type View = "log" | "done" | "history";

export default function ListeningPage() {
  const [, navigate] = useLocation();
  const [view, setView] = useState<View>("log");
  const [medium, setMedium] = useState<ListeningMedium>(() => {
    try {
      const v = localStorage.getItem("phoebe:audio-divina-medium");
      return (v === "streaming" || v === "cd" || v === "vinyl" || v === "tape") ? v : "streaming";
    } catch { return "streaming"; }
  });
  const [what, setWhat] = useState("");
  const streaming = medium === "streaming";

  function chooseMedium(m: ListeningMedium) {
    setMedium(m);
    try { localStorage.setItem("phoebe:audio-divina-medium", m); } catch { /* private mode */ }
  }

  // The whole log: did you listen today? (No amount — just mark it done.)
  function logToday() {
    saveListeningEntry({ minutes: 0, songs: 0, medium, what: streaming ? "" : what });
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
            <p className="text-[17px] leading-relaxed mb-1" style={{ color: WARM, fontFamily: "Georgia, serif", fontStyle: "italic" }}>
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

  // ——— History ———
  if (view === "history") {
    const hist = listeningHistory();
    return (
      <Layout>
        <div className="max-w-xl mx-auto w-full">
          <button onClick={() => setView("log")} className="text-[14px] mb-5 inline-flex items-center gap-1.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
            ← <span>Audio Divina</span>
          </button>
          <h1 className="text-xl font-bold leading-tight mb-1" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>Listening history</h1>
          <p className="text-xs mb-5" style={{ color: SAGE }}>What you've sat with.</p>
          {hist.length === 0 ? (
            <p className="text-[14px] leading-relaxed mt-10 text-center" style={{ color: "rgba(143,175,150,0.7)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
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

  // ——— Log (the main screen) ———
  const activeMedium = MEDIA.find((x) => x.id === medium)!;

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-start gap-3 mb-6">
          <div className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0" style={{ background: "rgba(62,124,122,0.18)", border: "1px solid rgba(62,124,122,0.35)" }}>
            🎧
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>Audio Divina</h1>
            <p className="text-xs mt-0.5" style={{ color: SAGE }}>Sacred listening</p>
          </div>
        </div>

        {/* How are you listening? */}
        <p className="text-[10.5px] uppercase tracking-[0.18em] mb-2" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
          How are you listening?
        </p>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {MEDIA.map((x) => {
            const on = x.id === medium;
            return (
              <button
                key={x.id}
                onClick={() => chooseMedium(x.id)}
                className="flex flex-col items-center gap-1 rounded-2xl py-3 active:scale-[0.97] transition-transform"
                style={{ background: on ? "rgba(46,107,64,0.9)" : "rgba(255,255,255,0.04)", border: `1px solid ${on ? "rgba(110,180,130,0.55)" : "rgba(255,255,255,0.10)"}` }}
              >
                <span className="text-[20px] leading-none" aria-hidden>{x.emoji}</span>
                <span className="text-[12px] font-medium" style={{ color: on ? WARM : SAGE, fontFamily: SPACE_GROTESK }}>{x.label}</span>
              </button>
            );
          })}
        </div>

        {streaming ? (
          <SacredLibrary />
        ) : (
          <>
            <div className="mb-3 rounded-2xl px-4 py-3.5 flex items-center gap-3" style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.20)" }}>
              <span className="text-[22px] leading-none" aria-hidden>{activeMedium.emoji}</span>
              <p className="text-[13.5px] leading-snug" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{activeMedium.cue}</p>
            </div>
            <input
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              placeholder="What are you listening to?"
              className="w-full rounded-2xl px-4 py-3.5 mb-4 text-[15px] outline-none"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", color: WARM, fontFamily: "Georgia, serif" }}
            />
          </>
        )}

        <button
          onClick={logToday}
          className="w-full py-4 rounded-2xl text-[16px] font-semibold active:scale-[0.98] transition-transform mt-1"
          style={{ background: "rgba(46,107,64,0.9)", color: WARM, fontFamily: SPACE_GROTESK }}
        >
          Log today's listening
        </button>

        <div className="flex items-center justify-between mt-5">
          <button onClick={() => setView("history")} className="text-[13px] inline-flex items-center gap-1" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
            See your listening history <span aria-hidden>›</span>
          </button>
          <p className="text-[11px]" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}>Stays on this device</p>
        </div>
      </div>
    </Layout>
  );
}

// ——— A history row — what you put on, and when (no length) ———
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
