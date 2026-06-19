import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { addListeningMinutes, minutesToday } from "@/lib/listeningLog";
import { openSpotifyPlaylist, spotifyPlaylistReady } from "@/lib/spotify";
import { useMusicPlayback, type MusicSourceId } from "@/lib/musicPlayback";
import { isNativeShell } from "@/lib/isNativeShell";
import { playOfficeChime, primeAudio } from "@/lib/amenFeedback";

// Listening — "audio divina." Music as a way of prayer. The classic lectio
// divina movements (read → meditate → pray → rest) applied to listening:
// you bring sacred music you love — Taizé, plainchant, a hymn, choral,
// something ambient — and play it wherever it already lives (Apple Music,
// Spotify, a record). Phoebe holds the prayer *around* it: a single still
// screen, the four movements unfolding over the time you chose, and a soft
// close. It counts toward the daily rhythm like Contemplation or the Examen.
//
// Deliberately "bring your own music": no streaming integration, no listening
// history read, nothing about what you played ever leaves the device. Phoebe
// is the frame, not the jukebox. (A curated in-app playlist via Apple Music
// is a possible later enhancement — see reference_cobreathe_apple_music.)

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const DEEP = "#0C2417";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

const LENGTHS = [5, 10, 15, 20] as const;

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
// even with the phone locked: on the native shell `schedule-end` arms a bell on
// the kept-alive audio clock at the end time (the JS timer can't fire while
// suspended); on web it's the synthesized chime, foreground only.
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

type Phase = "intro" | "listening" | "done";

export default function ListeningPage() {
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState<Phase>("intro");
  const [minutes, setMinutes] = useState<number>(() => {
    const saved = Number(localStorage.getItem("phoebe:listening-minutes"));
    return LENGTHS.includes(saved as (typeof LENGTHS)[number]) ? saved : 10;
  });
  const [elapsed, setElapsed] = useState(0); // seconds
  const tickRef = useRef<number | null>(null);
  const startRef = useRef(0);       // wall-clock ms the sit began
  const elapsedRef = useRef(0);
  const loggedRef = useRef(false); // guard: count a sitting's minutes exactly once

  // Keep a ref in step with elapsed so finish() (button or auto-complete via a
  // deferred timeout) always logs the true elapsed time, not a stale closure.
  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);

  // In-app music (Apple Music on iOS, Spotify on iOS + web), behind one surface.
  // Inert until a service is configured — music.anyAvailable stays false, so no
  // control renders and the practice is bring-your-own-music.
  const music = useMusicPlayback();

  const total = minutes * 60;
  const quarter = total / 4;
  const movementIdx = Math.min(3, Math.floor(elapsed / quarter));
  const remaining = Math.max(0, total - elapsed);

  function chooseMinutes(m: number) {
    setMinutes(m);
    try { localStorage.setItem("phoebe:listening-minutes", String(m)); } catch { /* private mode */ }
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
    addListeningMinutes(Math.max(1, Math.round(elapsedRef.current / 60)));
    markPracticeDoneToday("listening");
    if (!opts?.silentChime) playBell(2); // closing chime
    setPhase("done");
  }

  // The ticking clock while listening. Elapsed is derived from WALL-CLOCK time,
  // not a tick counter — so locking the phone or backgrounding the app (the
  // norm for this practice: eyes closed, music playing) doesn't stall the timer.
  // setInterval throttles in the background, but each fire recomputes the true
  // elapsed and catches up on resume.
  useEffect(() => {
    if (phase !== "listening") return;
    tickRef.current = window.setInterval(() => {
      const secs = Math.floor((Date.now() - startRef.current) / 1000);
      if (secs >= total) {
        if (tickRef.current) window.clearInterval(tickRef.current);
        setElapsed(total);
        // Resumed well past the end → the native bell already rang; don't double.
        const lateCatchUp = secs > total + 3;
        window.setTimeout(() => finish({ silentChime: lateCatchUp }), 0);
      } else {
        setElapsed(secs);
      }
    }, 1000);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, total]);

  // Leaving mid-sit (navigating away without finishing) must disarm the bell so
  // it can't ring after you've gone. Harmless no-op once a sit has finished.
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
        {/* slow, near-still breath of light behind the words */}
        <motion.div
          aria-hidden
          className="absolute rounded-full"
          style={{ width: 360, height: 360, background: "radial-gradient(circle, rgba(143,175,150,0.16) 0%, rgba(143,175,150,0) 70%)" }}
          animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative z-10 w-full max-w-md text-center">
          {/* which movement we're in */}
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
            {/* Minimal in-sit music control — only when something's playing
                through Phoebe. The prayer is the focus, not the player. */}
            {music.anyAvailable && (music.status === "playing" || music.status === "paused") && (
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
            <p className="text-[13px] mt-2" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
              Carry it with you.
            </p>
            <p className="text-[12.5px] mt-5 tabular-nums" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SPACE_GROTESK }}>
              {minutesToday()} min listened today
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

  // The in-app player control's label + action follow the live player state,
  // whichever service is active.
  const player: { label: string; onClick: () => void; disabled?: boolean } =
    music.status === "playing" ? { label: "Pause", onClick: music.pause }
    : music.status === "paused" ? { label: "Resume", onClick: music.resume }
    : music.status === "connecting" ? { label: "Starting the music…", onClick: () => {}, disabled: true }
    : (music.needsAuth || music.status === "needs_auth") ? { label: "Connect Spotify", onClick: music.authorize }
    : { label: "Play a contemplative playlist", onClick: music.connectPlay };
  // Honest subscription caption for the active service.
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
            <h1 className="text-xl font-bold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>Listening</h1>
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
          choral or still — wherever you already play it. Then let Phoebe hold the
          prayer around it. The old practice of <span style={{ fontStyle: "italic" }}>lectio divina</span> in
          four movements, only the text is sound.
        </p>

        {/* Music source. Every control is gated on real configuration — nothing
            appears that can't actually play. In-app playback when a service is
            set up; otherwise the one-tap deep link; otherwise bring-your-own
            (always fine — the blurb above already frames it). */}
        {music.anyAvailable ? (
          <div className="mb-6 rounded-2xl p-4" style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.20)" }}>
            <p className="text-[10.5px] uppercase tracking-[0.18em] mb-3" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
              Play through Phoebe
            </p>

            {/* Service switch — only when more than one is available. Remembers
                the pick (musicPlayback PREF_KEY). */}
            {music.sources.length > 1 && (
              <div className="flex p-1 rounded-full mb-3" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                {music.sources.map((s) => {
                  const on = s.id === music.activeId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => music.setActive(s.id as MusicSourceId)}
                      className="flex-1 py-2 rounded-full text-[13px] font-medium transition-colors"
                      style={{
                        background: on ? "rgba(46,107,64,0.9)" : "transparent",
                        color: on ? WARM : SAGE,
                        fontFamily: SPACE_GROTESK,
                      }}
                    >
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

            {music.error ? (
              <p className="text-center text-[11.5px] mt-2.5 leading-snug" style={{ color: "rgba(230,205,180,0.9)", fontFamily: SPACE_GROTESK }}>
                {music.error}
              </p>
            ) : (
              <p className="text-center text-[11px] mt-2.5" style={{ color: "rgba(143,175,150,0.55)", fontFamily: SPACE_GROTESK }}>
                Plays inside Phoebe · {subLabel}
              </p>
            )}
          </div>
        ) : spotifyPlaylistReady() ? (
          <button
            onClick={() => openSpotifyPlaylist()}
            className="w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3 mb-6 text-[14px] font-medium active:scale-[0.99] transition-transform"
            style={{ background: "rgba(46,107,64,0.9)", color: WARM, fontFamily: SPACE_GROTESK }}
          >
            <span aria-hidden>♪</span>
            Open a contemplative playlist
            <span aria-hidden style={{ color: SAGE }}>↗</span>
          </button>
        ) : null}

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

        {/* Length — the screen-wide pill: category left, value + chevron right */}
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

        {todayMins > 0 && (
          <p className="text-center text-[12.5px] mt-3" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
            {todayMins} minutes in prayer with music today. You're always welcome back.
          </p>
        )}

        <p className="text-center text-[11.5px] mt-6 leading-relaxed" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}>
          Phoebe never sees what you play. Nothing about your music leaves this device.
        </p>
      </div>
    </Layout>
  );
}
