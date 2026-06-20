import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import {
  addListeningMinutes, addListeningSongs, minutesToday, songsToday,
  getListeningGoal, setListeningGoal, goalProgress, saveListeningEntry,
  listeningHistory, type ListeningMedium, type ListeningGoal, type ListeningEntry,
} from "@/lib/listeningLog";
import { useMusicPlayback } from "@/lib/musicPlayback";
import { SacredLibrary } from "@/components/SacredLibrary";

// Audio Divina — sacred listening. A logging-first practice: you put on music
// (streaming, or an analog medium you own) and record it toward a daily GOAL of
// either time or songs. No timer, no movements — the listening happens in your
// own player; Phoebe just holds the count and your history.
//
// Streaming gets an in-app playback UI (a contemplative playlist over Apple
// Music / Spotify) plus a "Browse" hand-off so you can play your own library;
// analog (CD / vinyl / tape) is a manual log. What you listen to stays on this
// device.
//
// NATIVE TODO: true in-app library browse + now-playing capture (so streaming
// auto-knows the track and can auto-count songs) needs MusicKit library APIs in
// CobreatheMusicPlugin.swift. Until then streaming plays the curated playlist
// in-app and hands off to the Music app for bring-your-own.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

const MEDIA: { id: ListeningMedium; emoji: string; label: string; cue: string }[] = [
  { id: "streaming", emoji: "🎧", label: "Streaming", cue: "" },
  { id: "cd", emoji: "💿", label: "CD", cue: "Put on your CD and listen — log it when you're done." },
  { id: "vinyl", emoji: "📀", label: "Vinyl", cue: "Drop the needle and listen — log it when you're done." },
  { id: "tape", emoji: "📼", label: "Tape", cue: "Press play and listen — log it when you're done." },
];

const TIME_OPTIONS = [5, 10, 15, 20, 30, 45] as const;
const SONG_OPTIONS = [1, 2, 3, 5, 8] as const;

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
  const [goal, setGoal] = useState<ListeningGoal>(() => getListeningGoal());
  const [editingGoal, setEditingGoal] = useState(false);
  // The amount being logged, in the goal's unit. Defaults to the goal target
  // (time) or one song (songs); the listener confirms/adjusts on the stepper.
  const [amount, setAmount] = useState<number>(() => {
    const g = getListeningGoal();
    return g.type === "time" ? g.amount : 1;
  });
  // What was logged last, for the confirmation screen.
  const lastLog = useRef<{ unit: "time" | "songs"; n: number }>({ unit: "time", n: 0 });

  const music = useMusicPlayback();
  const streaming = medium === "streaming";

  function chooseMedium(m: ListeningMedium) {
    setMedium(m);
    try { localStorage.setItem("phoebe:audio-divina-medium", m); } catch { /* private mode */ }
  }
  function chooseGoal(g: ListeningGoal) {
    setGoal(g);
    setListeningGoal(g);
    setAmount(g.type === "time" ? g.amount : 1);
    setEditingGoal(false);
  }

  function logSession() {
    const isTime = goal.type === "time";
    const n = Math.max(1, Math.round(amount));
    const mins = isTime ? n : 0;
    const songs = isTime ? 0 : n;
    if (isTime) addListeningMinutes(mins); else addListeningSongs(songs);
    // For streaming we don't yet capture the track name (native TODO), so `what`
    // is the listener's words only on an analog log.
    saveListeningEntry({ minutes: mins, songs, medium, what: streaming ? "" : what });
    markPracticeDoneToday("listening");
    // Logged — let the in-app player keep going if they want; just record it.
    lastLog.current = { unit: goal.type, n };
    setView("done");
  }

  // ——— Done / confirmation ———
  if (view === "done") {
    const prog = goalProgress();
    const unitWord = prog.type === "songs" ? (prog.count === 1 ? "song" : "songs") : "min";
    return (
      <Layout>
        <div className="max-w-xl mx-auto w-full min-h-[60vh] flex flex-col items-center justify-center text-center px-2">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <div className="text-4xl mb-5">🎧</div>
            <h1 className="text-2xl font-bold leading-tight mb-3" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>Amen.</h1>
            <p className="text-[17px] leading-relaxed mb-1" style={{ color: WARM, fontFamily: "Georgia, serif", fontStyle: "italic" }}>
              What did you hear in the quiet after the music?
            </p>
            <p className="text-[13px] mt-5 tabular-nums" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
              {prog.count} of {prog.target} {unitWord} today{prog.met ? " · goal kept 🌿" : ""}
            </p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <button
                onClick={() => navigate("/")}
                className="px-7 py-3 rounded-full text-[15px] font-semibold active:scale-95 transition-transform"
                style={{ background: "rgba(46,107,64,0.9)", color: WARM, fontFamily: SPACE_GROTESK }}
              >
                Done
              </button>
              <button
                onClick={() => { setWhat(""); setView("log"); }}
                className="text-[13px]" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}
              >
                Log another
              </button>
            </div>
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

  // ——— Log / setup (the main screen) ———
  const prog = goalProgress();
  const todayCount = goal.type === "songs" ? songsToday() : minutesToday();
  const unitLabel = goal.type === "songs" ? (todayCount === 1 ? "song today" : "songs today") : "min today";
  const activeMedium = MEDIA.find((x) => x.id === medium)!;
  const stepOpts = goal.type === "time" ? TIME_OPTIONS : SONG_OPTIONS;
  const stepMax = goal.type === "time" ? 180 : 50;
  const stepUnit = goal.type === "time" ? "min" : (amount === 1 ? "song" : "songs");

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-start gap-3 mb-6">
          <div
            className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0"
            style={{ background: "rgba(62,124,122,0.18)", border: "1px solid rgba(62,124,122,0.35)" }}
          >
            🎧
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>Audio Divina</h1>
            <p className="text-xs mt-0.5" style={{ color: SAGE }}>Sacred listening</p>
          </div>
          {todayCount > 0 && (
            <div className="flex-shrink-0 text-right">
              <p className="text-[20px] font-semibold tabular-nums leading-none" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{todayCount}</p>
              <p className="text-[10px] mt-1" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>{unitLabel}</p>
            </div>
          )}
        </div>

        {/* Daily goal */}
        <button
          onClick={() => setEditingGoal((v) => !v)}
          className="w-full flex items-center justify-between rounded-2xl px-4 py-3.5 mb-2"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}
        >
          <span className="text-[14px]" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>Daily goal</span>
          <span className="text-[15px] font-medium flex items-center gap-1.5" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
            {goal.amount} {goal.type === "time" ? "minutes" : (goal.amount === 1 ? "song" : "songs")}
            <span style={{ color: SAGE }}>{editingGoal ? "▾" : "›"}</span>
          </span>
        </button>
        <AnimatePresence>
          {editingGoal && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-4"
            >
              <div className="rounded-2xl p-3.5" style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.20)" }}>
                <div className="flex p-1 rounded-full mb-3" style={{ background: "rgba(255,255,255,0.05)" }}>
                  {(["time", "songs"] as const).map((tp) => {
                    const on = goal.type === tp;
                    return (
                      <button key={tp} onClick={() => chooseGoal({ type: tp, amount: tp === "time" ? 10 : 3 })}
                        className="flex-1 py-2 rounded-full text-[13px] font-medium transition-colors"
                        style={{ background: on ? "rgba(46,107,64,0.9)" : "transparent", color: on ? WARM : SAGE, fontFamily: SPACE_GROTESK }}>
                        {tp === "time" ? "Minutes" : "Songs"}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(goal.type === "time" ? TIME_OPTIONS : SONG_OPTIONS).map((n) => {
                    const on = goal.amount === n;
                    return (
                      <button key={n} onClick={() => chooseGoal({ type: goal.type, amount: n })}
                        className="px-3.5 py-2 rounded-full text-[13px] font-medium"
                        style={{ background: on ? "rgba(46,107,64,0.9)" : "rgba(255,255,255,0.05)", color: on ? WARM : SAGE, border: `1px solid ${on ? "rgba(110,180,130,0.5)" : "rgba(255,255,255,0.10)"}`, fontFamily: SPACE_GROTESK }}>
                        {n} {goal.type === "time" ? "min" : (n === 1 ? "song" : "songs")}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* How are you listening? */}
        <p className="text-[10.5px] uppercase tracking-[0.18em] mb-2 mt-4" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
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
                style={{
                  background: on ? "rgba(46,107,64,0.9)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${on ? "rgba(110,180,130,0.55)" : "rgba(255,255,255,0.10)"}`,
                }}
              >
                <span className="text-[20px] leading-none" aria-hidden>{x.emoji}</span>
                <span className="text-[12px] font-medium" style={{ color: on ? WARM : SAGE, fontFamily: SPACE_GROTESK }}>{x.label}</span>
              </button>
            );
          })}
        </div>

        {/* Streaming: a podcast-style player + browse your library. Analog: a cue
            + what-you're-listening-to field. */}
        {streaming ? (
          <SacredLibrary music={music} />
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

        {/* Log — the amount, in the goal's unit */}
        <div className="rounded-2xl p-4 mb-5 mt-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <p className="text-[13px] mb-3" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
            {goal.type === "time" ? "How long did you listen?" : "How many songs did you sit with?"}
          </p>
          <div className="flex items-center justify-between">
            <Stepper
              value={amount}
              unit={stepUnit}
              onDec={() => setAmount((a) => Math.max(1, a - (goal.type === "time" ? 5 : 1)))}
              onInc={() => setAmount((a) => Math.min(stepMax, a + (goal.type === "time" ? 5 : 1)))}
            />
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {stepOpts.map((n) => {
              const on = amount === n;
              return (
                <button key={n} onClick={() => setAmount(n)}
                  className="px-3 py-1.5 rounded-full text-[12.5px] font-medium"
                  style={{ background: on ? "rgba(46,107,64,0.8)" : "rgba(255,255,255,0.05)", color: on ? WARM : SAGE, fontFamily: SPACE_GROTESK }}>
                  {n} {goal.type === "time" ? "min" : (n === 1 ? "song" : "songs")}
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={logSession}
          className="w-full py-4 rounded-2xl text-[16px] font-semibold active:scale-[0.98] transition-transform"
          style={{ background: "rgba(46,107,64,0.9)", color: WARM, fontFamily: SPACE_GROTESK }}
        >
          Log {amount} {goal.type === "time" ? "min" : (amount === 1 ? "song" : "songs")}
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

// ——— A +/- stepper for the log amount ———
function Stepper({ value, unit, onDec, onInc }: { value: number; unit: string; onDec: () => void; onInc: () => void }) {
  const btn = "w-10 h-10 rounded-full flex items-center justify-center text-[20px] active:scale-90 transition-transform";
  const btnStyle = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: WARM } as const;
  return (
    <div className="flex items-center gap-4 mx-auto">
      <button aria-label="Less" onClick={onDec} className={btn} style={btnStyle}>−</button>
      <div className="text-center min-w-[88px]">
        <span className="text-[26px] font-semibold tabular-nums" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{value}</span>
        <span className="text-[13px] ml-1.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>{unit}</span>
      </div>
      <button aria-label="More" onClick={onInc} className={btn} style={btnStyle}>+</button>
    </div>
  );
}

// ——— A history row ———
function HistoryRow({ e }: { e: ListeningEntry }) {
  const d = new Date(e.ymd + "T12:00:00");
  const day = Number.isNaN(d.getTime()) ? e.ymd : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const amount = e.songs > 0 ? `${e.songs} ${e.songs === 1 ? "song" : "songs"}` : `${e.minutes} min`;
  const label = e.what?.trim() || (e.medium === "streaming" ? "Streaming" : e.medium.toUpperCase());
  return (
    <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <span className="text-[20px] leading-none flex-shrink-0" aria-hidden>{MEDIUM_EMOJI[e.medium] ?? "🎧"}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium truncate" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{label}</p>
        <p className="text-[11.5px] mt-0.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>{day}</p>
      </div>
      <span className="text-[13px] tabular-nums flex-shrink-0" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>{amount}</span>
    </div>
  );
}
