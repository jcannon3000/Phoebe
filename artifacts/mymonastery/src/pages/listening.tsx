import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { addListeningMinutes, minutesToday, saveListeningEntry, type ListeningMedium } from "@/lib/listeningLog";
import { isNativeIOS } from "@/lib/spotify";
import { useMusicPlayback, type MusicSourceId } from "@/lib/musicPlayback";
import { isNativeShell } from "@/lib/isNativeShell";
import { playOfficeChime, primeAudio } from "@/lib/amenFeedback";

// Audio Divina — music as a way of prayer. The classic lectio divina movements
// (read → meditate → pray → rest) applied to listening: a Scripture of sound.
// You choose HOW you'll listen — streaming (Apple Music: play a curated piece
// in-app, or browse your own), or an analog medium you put on yourself (CD,
// vinyl, tape) — and Phoebe holds the prayer around it: a still screen, the four
// movements over the time you chose, start/end chimes, and a soft close. It
// counts toward the daily rhythm like Contemplation or the Examen.
//
// What you listen to stays on this device (you note it in your own words for
// your history); nothing about your music leaves the phone.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const DEEP = "#0C2417";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

const LENGTHS = [5, 10, 15, 20] as const;

// How you'll listen. Streaming = Apple Music (in-app or browse); the analog
// three are a manual log — you put the record/disc/tape on yourself.
const MEDIA: { id: ListeningMedium; emoji: string; label: string; cue: string }[] = [
  { id: "streaming", emoji: "🎧", label: "Streaming", cue: "" },
  { id: "cd", emoji: "💿", label: "CD", cue: "Put on your CD, then press Begin." },
  { id: "vinyl", emoji: "📀", label: "Vinyl", cue: "Drop the needle, then press Begin." },
  { id: "tape", emoji: "📼", label: "Tape", cue: "Press play on your tape, then Begin." },
];

// The four movements of audio divina — each held for a quarter of the sit.
const MOVEMENTS = [
  {
    name: "Listen",
    prompt: "Receive the music whole. Don't study it — let it fall on you the way rain falls, without holding any of it back.",
  },
  {
    name: "Linger",
    prompt: "A phrase, a swell, a silence returns to you. Stay with the part that stirs something. Let it repeat in you.",
  },
  {
    name: "Respond",
    prompt: "Say something back to God from what you heard — a word, a thanks, an ache, a name. However small.",
  },
  {
    name: "Rest",
    prompt: "Let the words fall away. Don't reach for anything. Rest in God, and let the music carry you there.",
  },
] as const;

function clock(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.max(0, totalSec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Chimes bookend the sit — an opening voicing when you begin, a brighter close
// when the time is up. Reuses Contemplation's bell mechanism so the CLOSE rings
// even with the phone locked.
function nativeEvent(name: string, detail?: unknown): void {
  try { window.dispatchEvent(new CustomEvent(name, detail !== undefined ? { detail } : undefined)); }
  catch { /* non-fatal */ }
}
function playBell(octave: 0 | 2): void {
  if (isNativeShell()) {
    nativeEvent("phoebe:contemplation-play-bell", { sound: octave === 0 ? "PhoebeRising-low.caf" : "PhoebeRising-high.caf" });
  } else {
    playOfficeChime(octave);
  }
}
function scheduleEndBell(atMs: number): void {
  nativeEvent("phoebe:contemplation-schedule-end", { at: new Date(atMs).toISOString() });
}
function cancelEndBell(): void {
  nativeEvent("phoebe:contemplation-cancel-end");
}

// Open the native Apple Music app so they can browse their catalogue and play
// anything; they switch back to Phoebe and press Begin. Phoebe holds the time.
function browseAppleMusic(): void {
  try { window.open("music://", "_system"); } catch { /* ignore */ }
}

type Phase = "intro" | "listening" | "done";

export default function ListeningPage() {
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState<Phase>("intro");
  const [minutes, setMinutes] = useState<number>(() => {
    const saved = Number(localStorage.getItem("phoebe:listening-minutes"));
    return LENGTHS.includes(saved as (typeof LENGTHS)[number]) ? saved : 10;
  });
  const [medium, setMedium] = useState<ListeningMedium>(() => {
    try {
      const v = localStorage.getItem("phoebe:audio-divina-medium");
      return (v === "streaming" || v === "cd" || v === "vinyl" || v === "tape") ? v : "streaming";
    } catch { return "streaming"; }
  });
  const [what, setWhat] = useState("");
  const [elapsed, setElapsed] = useState(0); // seconds
  const tickRef = useRef<number | null>(null);
  const startRef = useRef(0);       // wall-clock ms the sit began
  const elapsedRef = useRef(0);
  const loggedRef = useRef(false); // guard: count a sitting's minutes exactly once
  const mediumRef = useRef(medium);
  const whatRef = useRef(what);
  useEffect(() => { mediumRef.current = medium; }, [medium]);
  useEffect(() => { whatRef.current = what; }, [what]);

  // Keep a ref in step with elapsed so finish() (button or auto-complete via a
  // deferred timeout) always logs the true elapsed time, not a stale closure.
  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);

  // In-app music (Apple Music / Spotify), used only when the medium is Streaming.
  const music = useMusicPlayback();

  const total = minutes * 60;
  const quarter = total / 4;
  const movementIdx = Math.min(3, Math.floor(elapsed / quarter));
  const remaining = Math.max(0, total - elapsed);
  const streaming = medium === "streaming";

  function chooseMinutes(m: number) {
    setMinutes(m);
    try { localStorage.setItem("phoebe:listening-minutes", String(m)); } catch { /* private mode */ }
  }
  function chooseMedium(m: ListeningMedium) {
    setMedium(m);
    try { localStorage.setItem("phoebe:audio-divina-medium", m); } catch { /* private mode */ }
  }

  function begin() {
    setElapsed(0);
    elapsedRef.current = 0;
    startRef.current = Date.now();
    loggedRef.current = false;
    primeAudio();                                    // unlock web audio on this tap
    playBell(0);                                     // opening chime
    scheduleEndBell(startRef.current + total * 1000); // close rings even if locked
    setPhase("listening");
  }

  // `silentChime` is set on a late catch-up (the app was suspended past the end,
  // so the native scheduled bell already rang) — don't strike a second one.
  function finish(opts?: { silentChime?: boolean }) {
    cancelEndBell(); // foreground/early finish: cancel the armed bell (no double)
    if (loggedRef.current) { setPhase("done"); return; }
    loggedRef.current = true;
    // Count the real time spent — a full sit logs `total`, an early end logs
    // however far they got. Under a minute still counts as a minute of prayer.
    const mins = Math.max(1, Math.round(elapsedRef.current / 60));
    addListeningMinutes(mins);
    saveListeningEntry({ minutes: mins, medium: mediumRef.current, what: whatRef.current });
    markPracticeDoneToday("listening");
    if (!opts?.silentChime) playBell(2); // closing chime
    setPhase("done");
  }

  // The ticking clock while listening. Elapsed is derived from WALL-CLOCK time,
  // so locking the phone or backgrounding the app doesn't stall the timer.
  useEffect(() => {
    if (phase !== "listening") return;
    tickRef.current = window.setInterval(() => {
      const secs = Math.floor((Date.now() - startRef.current) / 1000);
      if (secs >= total) {
        if (tickRef.current) window.clearInterval(tickRef.current);
        setElapsed(total);
        const lateCatchUp = secs > total + 3;
        window.setTimeout(() => finish({ silentChime: lateCatchUp }), 0);
      } else {
        setElapsed(secs);
      }
    }, 1000);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, total]);

  // Leaving mid-sit (navigating away without finishing) must disarm the bell.
  useEffect(() => () => cancelEndBell(), []);

  // ——— Listening (full-bleed, calm) ———
  if (phase === "listening") {
    const m = MOVEMENTS[movementIdx];
    return (
      <div
        className="fixed inset-0 z-[60] flex flex-col items-center justify-center px-8"
        style={{
          background: `radial-gradient(120% 90% at 50% 18%, #143524 0%, ${DEEP} 62%, #081A11 100%)`,
          paddingTop: "calc(env(safe-area-inset-top) + 24px)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
        }}
      >
        <motion.div
          aria-hidden
          className="absolute rounded-full"
          style={{ width: 360, height: 360, background: "radial-gradient(circle, rgba(143,175,150,0.16) 0%, rgba(143,175,150,0) 70%)" }}
          animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative z-10 w-full max-w-md text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            {MOVEMENTS.map((mv, i) => (
              <span
                key={mv.name}
                className="h-1.5 rounded-full transition-all duration-700"
                style={{
                  width: i === movementIdx ? 22 : 7,
                  background: i <= movementIdx ? SAGE : "rgba(143,175,150,0.25)",
                }}
              />
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={movementIdx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            >
              <p className="uppercase tracking-[0.32em] text-[12px] mb-4" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                {m.name}
              </p>
              <p className="text-[21px] leading-relaxed" style={{ color: WARM, fontFamily: "Georgia, serif", fontStyle: "italic" }}>
                {m.prompt}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="relative z-10 mt-auto flex flex-col items-center gap-5">
          <p className="tabular-nums text-[15px]" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SPACE_GROTESK }}>
            {clock(remaining)}
          </p>
          <div className="flex items-center gap-3">
            {/* In-sit music control — only when something's playing through Phoebe
                (the curated streaming option). The prayer is the focus. */}
            {streaming && music.anyAvailable && (music.status === "playing" || music.status === "paused") && (
              <button
                onClick={music.status === "playing" ? music.pause : music.resume}
                className="px-5 py-2.5 rounded-full text-[14px] font-medium active:scale-95 transition-transform"
                style={{ color: WARM, fontFamily: SPACE_GROTESK, border: "1px solid rgba(143,175,150,0.35)" }}
              >
                {music.status === "playing" ? "Pause music" : "Resume music"}
              </button>
            )}
            <button
              onClick={() => finish()}
              className="px-6 py-2.5 rounded-full text-[14px] font-medium active:scale-95 transition-transform"
              style={{ color: SAGE, fontFamily: SPACE_GROTESK, border: "1px solid rgba(143,175,150,0.3)" }}
            >
              End early
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ——— Done ———
  if (phase === "done") {
    return (
      <Layout>
        <div className="max-w-xl mx-auto w-full min-h-[60vh] flex flex-col items-center justify-center text-center px-2">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <div className="text-4xl mb-5">🎧</div>
            <h1 className="text-2xl font-bold leading-tight mb-3" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
              Amen.
            </h1>
            <p className="text-[17px] leading-relaxed mb-1" style={{ color: WARM, fontFamily: "Georgia, serif", fontStyle: "italic" }}>
              What did you hear in the quiet after the music stopped?
            </p>
            {what.trim() && (
              <p className="text-[13px] mt-3" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
                You sat with <span style={{ color: WARM }}>{what.trim()}</span>.
              </p>
            )}
            <p className="text-[12.5px] mt-5 tabular-nums" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SPACE_GROTESK }}>
              {minutesToday()} min in Audio Divina today
            </p>
            <button
              onClick={() => navigate("/")}
              className="mt-9 px-7 py-3 rounded-full text-[15px] font-semibold active:scale-95 transition-transform"
              style={{ background: "rgba(46,107,64,0.9)", color: WARM, fontFamily: SPACE_GROTESK }}
            >
              Done
            </button>
          </motion.div>
        </div>
      </Layout>
    );
  }

  // ——— Intro / setup ———
  const todayMins = minutesToday();
  const activeMedium = MEDIA.find((x) => x.id === medium)!;

  // In-app player control's label + action (streaming only).
  const player: { label: string; onClick: () => void; disabled?: boolean } =
    music.status === "playing" ? { label: "Pause", onClick: music.pause }
    : music.status === "paused" ? { label: "Resume", onClick: music.resume }
    : music.status === "connecting" ? { label: "Starting the music…", onClick: () => {}, disabled: true }
    : (music.needsAuth || music.status === "needs_auth") ? { label: "Connect Spotify", onClick: music.authorize }
    : { label: "Play a contemplative playlist", onClick: music.connectPlay };
  const subLabel = music.activeId === "spotify" ? "Spotify Premium" : "Apple Music";

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full">
        <div className="flex items-start gap-3 mb-5">
          <div
            className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0"
            style={{ background: "rgba(62,124,122,0.18)", border: "1px solid rgba(62,124,122,0.35)" }}
          >
            🎧
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>Audio Divina</h1>
            <p className="text-xs mt-0.5" style={{ color: SAGE }}>Music as a way of prayer</p>
          </div>
          {todayMins > 0 && (
            <div className="flex-shrink-0 text-right">
              <p className="text-[20px] font-semibold tabular-nums leading-none" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{todayMins}</p>
              <p className="text-[10px] mt-1" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>min today</p>
            </div>
          )}
        </div>

        <p className="text-[15px] leading-relaxed mb-5" style={{ color: "rgba(240,237,230,0.85)", fontFamily: "Georgia, serif" }}>
          Put on music that opens you to God — Taizé, plainchant, a hymn, something
          choral or still. Phoebe holds the prayer around it: the old practice of{" "}
          <span style={{ fontStyle: "italic" }}>lectio divina</span> in four movements, only the text is sound.
        </p>

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

        {/* Streaming: play a curated piece in-app, or browse Apple Music. Analog:
            a gentle cue — you put it on, Phoebe holds the time. */}
        {streaming ? (
          <div className="mb-4 rounded-2xl p-4" style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.20)" }}>
            {music.anyAvailable && (
              <>
                {music.sources.length > 1 && (
                  <div className="flex p-1 rounded-full mb-3" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    {music.sources.map((s) => {
                      const on = s.id === music.activeId;
                      return (
                        <button key={s.id} onClick={() => music.setActive(s.id as MusicSourceId)}
                          className="flex-1 py-2 rounded-full text-[13px] font-medium transition-colors"
                          style={{ background: on ? "rgba(46,107,64,0.9)" : "transparent", color: on ? WARM : SAGE, fontFamily: SPACE_GROTESK }}>
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                )}
                <button
                  onClick={player.onClick}
                  disabled={player.disabled}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[14px] font-medium active:scale-[0.99] transition-transform disabled:opacity-60"
                  style={{ background: "rgba(46,107,64,0.9)", color: WARM, fontFamily: SPACE_GROTESK }}
                >
                  <span aria-hidden>♪</span>
                  {player.label}
                </button>
                {music.error && (
                  <p className="text-center text-[11.5px] mt-2 leading-snug" style={{ color: "rgba(230,205,180,0.9)", fontFamily: SPACE_GROTESK }}>{music.error}</p>
                )}
              </>
            )}
            {/* Browse your own — opens Apple Music to pick anything, then come back and Begin. */}
            {isNativeIOS() && (
              <button
                onClick={browseAppleMusic}
                className={`w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[14px] font-medium active:scale-[0.99] transition-transform ${music.anyAvailable ? "mt-2.5" : ""}`}
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: WARM, fontFamily: SPACE_GROTESK }}
              >
                Browse Apple Music
                <span aria-hidden style={{ color: SAGE }}>↗</span>
              </button>
            )}
            {music.anyAvailable && !music.error && (
              <p className="text-center text-[11px] mt-2.5" style={{ color: "rgba(143,175,150,0.55)", fontFamily: SPACE_GROTESK }}>
                Plays inside Phoebe · {subLabel} · or browse and play your own
              </p>
            )}
          </div>
        ) : (
          <div className="mb-4 rounded-2xl px-4 py-3.5 flex items-center gap-3" style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.20)" }}>
            <span className="text-[22px] leading-none" aria-hidden>{activeMedium.emoji}</span>
            <p className="text-[13.5px] leading-snug" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
              {activeMedium.cue} <span style={{ color: SAGE }}>Phoebe will hold the time.</span>
            </p>
          </div>
        )}

        {/* What are you listening to? */}
        <input
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          placeholder="What are you listening to?"
          className="w-full rounded-2xl px-4 py-3.5 mb-6 text-[15px] outline-none"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", color: WARM, fontFamily: "Georgia, serif" }}
        />

        {/* the four movements, named */}
        <div className="rounded-2xl p-4 mb-6" style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.20)" }}>
          {MOVEMENTS.map((m, i) => (
            <div key={m.name} className={`flex gap-3 ${i > 0 ? "mt-3" : ""}`}>
              <span className="text-[12px] tabular-nums mt-0.5" style={{ color: "rgba(143,175,150,0.55)", fontFamily: SPACE_GROTESK }}>
                {i + 1}
              </span>
              <div>
                <p className="text-[14px] font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{m.name}</p>
                <p className="text-[12.5px] leading-snug mt-0.5" style={{ color: SAGE }}>{m.prompt}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Length — the screen-wide pill */}
        <div
          className="relative flex items-center justify-between rounded-2xl px-4 py-3.5 mb-4"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}
        >
          <span className="text-[14px]" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>Length</span>
          <span className="text-[15px] font-medium flex items-center gap-1.5" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
            {minutes} minutes
            <span style={{ color: SAGE }}>›</span>
          </span>
          <select
            aria-label="Length"
            value={minutes}
            onChange={(e) => chooseMinutes(Number(e.target.value))}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          >
            {LENGTHS.map((m) => (
              <option key={m} value={m}>{m} minutes</option>
            ))}
          </select>
        </div>

        <button
          onClick={begin}
          className="w-full py-4 rounded-2xl text-[16px] font-semibold active:scale-[0.98] transition-transform"
          style={{ background: "rgba(46,107,64,0.9)", color: WARM, fontFamily: SPACE_GROTESK }}
        >
          Begin
        </button>

        <p className="text-center text-[11.5px] mt-6 leading-relaxed" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}>
          What you listen to stays on this device.
        </p>
      </div>
    </Layout>
  );
}
