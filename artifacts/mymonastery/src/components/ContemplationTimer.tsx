import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { playOpeningSwell } from "@/lib/amenFeedback";

// Silent contemplation timer — Insight-Timer-style. The slideshow's
// chapel-exhale swell opens the sit, a glowing countdown title holds
// the stillness, and the same swell (a brighter octave) marks the end
// — same sound effect the prayer slideshow uses on every slide. That
// closing bell is also scheduled as a local notification, so it rings
// even if the phone is locked or the app is backgrounded mid-sit.
//
// When the set time is reached the bell rings but the sit doesn't stop:
// a smaller count-up appears under the (now frozen) goal time so the
// user can keep sitting, and that overtime is added to the logged time
// when they end. The elapsed time is logged as a "contemplation"
// prayer_session so it shows on the Contemplation page's stats.
//
// Launched two ways (both render this overlay): the pause slide of the
// prayer slideshow (which advances to the next slide once the sit is
// done), and the Contemplation menu page. Self-contained — `open`.

const BG = "#0C1F12";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

// Preset minute lengths + a custom entry, per product direction.
const PRESETS = [1, 3, 5, 10, 15, 20] as const;

function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// Precise, readable time-done for the closing screen — so an early end
// reports exactly how long the user sat ("1 min 30 sec"), not a vague
// "a moment." Whole-minute sits drop the seconds ("5 minutes").
function formatDone(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (sec === 0) return `${m} minute${m === 1 ? "" : "s"}`;
  return `${m} min ${sec} sec`;
}

type Phase = "picker" | "running" | "complete";

export function ContemplationTimer({
  open,
  onClose,
  // When set, the overlay skips the duration picker and begins a sit of
  // this length immediately — used by the quick 5/10/20 buttons on the
  // Contemplation page. Undefined → show the picker (the default, and
  // what the pause-slide CTA + "Begin contemplation" button use).
  startMinutes,
}: {
  open: boolean;
  // `completed` is true when the user actually sat (reached the closing
  // screen), false when they backed out of the picker without sitting.
  // The pause-slide caller uses it to decide whether to advance the
  // slideshow to the next slide.
  onClose: (result?: { completed: boolean }) => void;
  startMinutes?: number;
}) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("picker");
  const [customMode, setCustomMode] = useState(false);
  const [customMin, setCustomMin] = useState("10");
  // Chosen length + the live remaining count (seconds).
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [remaining, setRemaining] = useState(0);
  // Once the set time is reached, the countdown freezes at the goal and
  // `overtime` counts up the extra seconds the user keeps sitting.
  const [reachedGoal, setReachedGoal] = useState(false);
  const [overtime, setOvertime] = useState(0);
  // What the closing screen reports — the seconds actually sat, and
  // whether the user ended before the bell (changes the closing copy).
  const [satSeconds, setSatSeconds] = useState(0);
  const [endedEarly, setEndedEarly] = useState(false);

  const endAtRef = useRef<number>(0);
  const startedAtRef = useRef<Date | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const recordedRef = useRef(false);
  // Guards reachGoal() against the countdown interval firing it twice.
  const reachedRef = useRef(false);
  // Guards finish() against a double-call: the countdown interval can
  // tick once more between `left <= 0` firing finish() and the phase
  // state actually flipping (the `phase` check inside finish reads a
  // stale closure value), which would double-strike the ending bell.
  const finishedRef = useRef(false);

  // Fire a native-shell bridge event (no-op on the plain web build —
  // nothing listens there).
  function nativeEvent(name: string, detail?: unknown) {
    try { window.dispatchEvent(new CustomEvent(name, detail !== undefined ? { detail } : undefined)); }
    catch { /* non-fatal */ }
  }

  // ── Keep the screen on during a sit. Two layers, because each covers
  // a gap the other doesn't:
  //   • Native keep-awake (UIApplication.isIdleTimerDisabled via the
  //     phoebe:contemplation-keep-awake bridge) — the reliable path on
  //     the iOS app, where the web wakeLock below doesn't hold in
  //     WKWebView.
  //   • Web navigator.wakeLock — the only option on the plain web build;
  //     re-acquired on foreground since the OS auto-releases it when the
  //     app backgrounds.
  async function acquireWakeLock() {
    nativeEvent("phoebe:contemplation-keep-awake");
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> } };
      if (nav.wakeLock) {
        wakeLockRef.current = await nav.wakeLock.request("screen");
      }
    } catch {
      /* unsupported / denied — the sit still works, the screen may dim */
    }
  }
  function releaseWakeLock() {
    nativeEvent("phoebe:contemplation-allow-sleep");
    try { wakeLockRef.current?.release(); } catch { /* non-fatal */ }
    wakeLockRef.current = null;
  }

  // ── Fallback closing bell as a one-shot local notification, so a sit
  // that's backgrounded or has the phone manually locked (keep-awake
  // can't prevent those) still delivers the bell at the end time. The
  // in-app Web Audio swell remains the primary close when foregrounded;
  // we cancel the notification on an in-app finish to avoid a double.
  function scheduleEndBell(atMs: number) {
    nativeEvent("phoebe:contemplation-schedule-end", { at: new Date(atMs).toISOString() });
  }
  function cancelEndBell() {
    nativeEvent("phoebe:contemplation-cancel-end");
  }
  useEffect(() => {
    if (phase !== "running") return;
    const onVis = () => {
      if (document.visibilityState === "visible" && !wakeLockRef.current) {
        void acquireWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [phase]);

  // ── On (re)open: jump straight into a sit when startMinutes was
  // supplied (the quick buttons), otherwise reset to the picker.
  useEffect(() => {
    if (open) {
      recordedRef.current = false;
      finishedRef.current = false;
      reachedRef.current = false;
      if (startMinutes && startMinutes > 0) {
        begin(startMinutes);
      } else {
        setReachedGoal(false);
        setOvertime(0);
        setPhase("picker");
        setCustomMode(false);
      }
    } else {
      releaseWakeLock();
      cancelEndBell();
    }
    // begin is a stable hoisted fn; depending on it would re-run this
    // every render. We only want the open→true transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startMinutes]);

  // ── Countdown loop. Remaining is derived from an absolute end time so
  // a backgrounded tab resyncs correctly on return rather than drifting.
  // Reaching the end time doesn't stop the sit — it rings the bell and
  // flips into a count-up (overtime), which keeps accruing until the
  // user ends. Overtime is measured from the goal time, not from when
  // the JS catches up, so a locked/backgrounded sit credits correctly.
  useEffect(() => {
    if (phase !== "running") return;
    const tick = () => {
      const now = Date.now();
      if (reachedRef.current) {
        setOvertime(Math.max(0, (now - endAtRef.current) / 1000));
        return;
      }
      const left = Math.max(0, (endAtRef.current - now) / 1000);
      setRemaining(left);
      if (left <= 0) {
        reachGoal();
        setOvertime(Math.max(0, (now - endAtRef.current) / 1000));
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function recordSession(seconds: number) {
    if (recordedRef.current) return;
    recordedRef.current = true;
    const sat = Math.round(seconds);
    // Server floors non-office surfaces at 5s; skip the round trip below it.
    if (sat < 5) return;
    const startedAt = startedAtRef.current ?? new Date(Date.now() - sat * 1000);
    apiRequest("POST", "/api/prayer-sessions", {
      surface: "contemplation",
      durationSeconds: sat,
      startedAt: startedAt.toISOString(),
      endedAt: new Date().toISOString(),
    })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-stats"] });
        // Refresh the History list so the just-finished sit appears.
        queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-sessions"] });
      })
      .catch(() => { /* best-effort — a dropped stat shouldn't break the close */ });
  }

  function begin(minutes: number) {
    const total = Math.max(1, Math.round(minutes)) * 60;
    setTotalSeconds(total);
    setRemaining(total);
    setSatSeconds(0);
    setReachedGoal(false);
    setOvertime(0);
    recordedRef.current = false;
    finishedRef.current = false;
    reachedRef.current = false;
    startedAtRef.current = new Date();
    endAtRef.current = Date.now() + total * 1000;
    setEndedEarly(false);
    setPhase("running");
    void acquireWakeLock();
    scheduleEndBell(endAtRef.current);
    // Opening swell — the same chapel-exhale the prayer slideshow plays
    // on every slide entry (octave 0, the base voicing).
    playOpeningSwell(0);
  }

  // The set time has elapsed. Ring the closing bell and flip into
  // overtime — the sit keeps running (count-up) until the user ends.
  function reachGoal() {
    if (reachedRef.current) return;
    reachedRef.current = true;
    setReachedGoal(true);
    // Only ring the in-app swell when we hit the goal roughly on time
    // (i.e. foregrounded). If we're catching up after a locked/back-
    // grounded stretch, the scheduled local notification already rang
    // the bell, so a second one would double up. Either way drop the
    // pending notification.
    const onTime = Date.now() - endAtRef.current < 2500;
    cancelEndBell();
    if (onTime) {
      // Closing swell — same slideshow sound, brighter (octave 2).
      playOpeningSwell(2);
      try {
        window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "success" } }));
      } catch { /* non-fatal */ }
    }
  }

  // Ends the sit and shows the closing screen. `seconds` is the time
  // actually sat; `early` flags an end before the bell so the closing
  // copy can acknowledge it. The bell only strikes here when the goal
  // was never reached — once it has, reachGoal() already rang it.
  function finish(seconds: number, early: boolean) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    releaseWakeLock();
    // Drop any pending notification so a foregrounded finish doesn't
    // bell after the user has already left the sit.
    cancelEndBell();
    setSatSeconds(Math.round(seconds));
    setEndedEarly(early);
    recordSession(seconds);
    if (!reachedRef.current) {
      // Closing swell — same slideshow sound, brighter (octave 2) so the
      // ending reads as a resolution rather than a repeat of the opening.
      playOpeningSwell(2);
      try {
        window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "success" } }));
      } catch { /* non-fatal */ }
    }
    setPhase("complete");
  }

  // The "End" pill. Before the bell → log the elapsed time (early end).
  // After the bell → log the full goal plus the overtime they kept
  // sitting, so the extra minutes count toward their contemplation time.
  function endSit() {
    const now = Date.now();
    if (reachedRef.current) {
      const over = Math.max(0, (now - endAtRef.current) / 1000);
      finish(totalSeconds + over, false);
    } else {
      const left = Math.max(0, (endAtRef.current - now) / 1000);
      finish(totalSeconds - left, true);
    }
  }

  // Discard — leave the sit WITHOUT logging it. Mark both guards so the
  // countdown tick can't sneak in a finish()/recordSession() on the way
  // out, drop the keep-awake + pending bell, and close straight away
  // (completed:false, so the pause-slide caller doesn't advance and no
  // closing screen shows). The minutes sat are intentionally not saved.
  function discardSit() {
    finishedRef.current = true;
    recordedRef.current = true;
    releaseWakeLock();
    cancelEndBell();
    onClose({ completed: false });
  }

  function handleClose() {
    releaseWakeLock();
    cancelEndBell();
    // "completed" when the user actually sat (reached the closing
    // screen); false when they backed out of the picker. The pause-slide
    // caller advances the slideshow only on a completed sit.
    onClose({ completed: phase === "complete" });
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[60] flex flex-col items-center"
        style={{ background: BG }}
      >
        {/* Close (×) — top right, safe-area aware. Hidden mid-sit so a
            stray tap doesn't abandon the silence; an explicit "End"
            sits at the bottom instead. */}
        {phase !== "running" && (
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="absolute flex items-center justify-center rounded-full"
            style={{
              top: "calc(env(safe-area-inset-top, 0px) + 12px)",
              right: 16,
              width: 36, height: 36,
              background: "rgba(46,107,64,0.18)",
              border: "1px solid rgba(46,107,64,0.35)",
              color: "#C8D4C0", fontSize: 18, lineHeight: 1, cursor: "pointer",
            }}
          >
            ×
          </button>
        )}

        <div
          className="flex-1 flex flex-col items-center justify-center text-center px-6 w-full"
          style={{ maxWidth: 440 }}
        >
          {phase === "picker" && (
            <>
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-3" style={{ color: "rgba(143,175,150,0.55)" }}>
                Contemplation
              </p>
              <p className="text-[22px] leading-[1.4] font-medium italic mb-8" style={{ color: WARM, fontFamily: "Georgia, 'Times New Roman', serif" }}>
                How long would you like to pray?
              </p>

              {!customMode ? (
                <>
                  <div className="grid grid-cols-3 gap-3 w-full">
                    {PRESETS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => begin(m)}
                        className="rounded-2xl py-4 transition-opacity hover:opacity-90 active:scale-[0.98]"
                        style={{
                          background: "rgba(46,107,64,0.16)",
                          border: "1px solid rgba(46,107,64,0.4)",
                          color: WARM, fontFamily: SPACE_GROTESK, fontSize: 17, fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        {m}
                        <span className="block text-[11px] font-normal mt-0.5" style={{ color: SAGE }}>
                          {m === 1 ? "minute" : "minutes"}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setCustomMode(true)}
                    className="mt-5 text-[13px] transition-opacity hover:opacity-80"
                    style={{ color: "rgba(143,175,150,0.8)", background: "none", border: "none", cursor: "pointer", fontFamily: SPACE_GROTESK }}
                  >
                    Custom length →
                  </button>
                </>
              ) : (
                <div className="w-full flex flex-col items-center gap-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={120}
                      value={customMin}
                      onChange={(e) => setCustomMin(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                      className="text-center rounded-xl py-3 px-4 text-[22px] font-semibold"
                      style={{
                        width: 110,
                        background: "rgba(15,40,24,0.6)",
                        border: "1px solid rgba(46,107,64,0.4)",
                        color: WARM, fontFamily: SPACE_GROTESK,
                      }}
                    />
                    <span style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>minutes</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const n = Math.max(1, Math.min(120, parseInt(customMin || "0", 10) || 0));
                      begin(n);
                    }}
                    className="w-full max-w-xs rounded-full py-3.5 text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98]"
                    style={{ background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)", cursor: "pointer", fontFamily: SPACE_GROTESK }}
                  >
                    Begin →
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomMode(false)}
                    className="text-[13px] transition-opacity hover:opacity-80"
                    style={{ color: "rgba(143,175,150,0.7)", background: "none", border: "none", cursor: "pointer", fontFamily: SPACE_GROTESK }}
                  >
                    ← Back to presets
                  </button>
                </div>
              )}
            </>
          )}

          {phase === "running" && (
            <>
              {/* Glowing countdown title — once the goal is reached it
                  freezes at the set time and the smaller count-up below
                  carries the overtime. */}
              <p
                className="title-glow-breathe tabular-nums"
                style={{
                  color: WARM,
                  fontFamily: SPACE_GROTESK,
                  fontSize: "clamp(64px, 17vw, 104px)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                  margin: 0,
                }}
              >
                {mmss(reachedGoal ? totalSeconds : remaining)}
              </p>
              {reachedGoal && (
                <p
                  className="tabular-nums"
                  style={{
                    color: SAGE,
                    fontFamily: SPACE_GROTESK,
                    fontSize: 30,
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                    marginTop: 12,
                  }}
                >
                  +{mmss(overtime)}
                </p>
              )}
              <p
                className="text-[13px]"
                style={{
                  color: "rgba(143,175,150,0.6)",
                  fontFamily: "Georgia, serif",
                  fontStyle: "italic",
                  marginTop: 20,
                }}
              >
                {reachedGoal ? "Stay as long as you like." : "Be still, and know."}
              </p>
            </>
          )}

          {phase === "complete" && (
            <>
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-3" style={{ color: "rgba(143,175,150,0.55)" }}>
                {endedEarly ? "Contemplation ended" : "Contemplation complete"}
              </p>
              <p className="text-[26px] leading-[1.3] font-medium italic mb-2" style={{ color: WARM, fontFamily: "Georgia, 'Times New Roman', serif" }}>
                {/* Always name the exact time prayed — important on an early
                    end so the user sees what they actually did. */}
                {formatDone(satSeconds)} of contemplative prayer
              </p>
              <p className="text-[13px] mb-8" style={{ color: "rgba(143,175,150,0.65)", fontFamily: "Georgia, serif", fontStyle: "italic", maxWidth: 300 }}>
                Carry the quiet with you.
              </p>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-full px-10 py-3.5 text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
                style={{ background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)", cursor: "pointer", fontFamily: SPACE_GROTESK }}
              >
                Amen →
              </button>
            </>
          )}
        </div>

        {/* End pill — only mid-sit, at the bottom out of the focal area.
            After the goal it reads "Done" since the bell has rung. A
            smaller "Discard session" link sits beneath it for leaving
            without logging the sit. */}
        {phase === "running" && (
          <div
            className="flex flex-col items-center gap-2.5"
            style={{ marginBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)" }}
          >
            <button
              type="button"
              onClick={endSit}
              className="rounded-full transition-opacity hover:opacity-90 active:scale-[0.98]"
              style={{
                padding: "13px 44px",
                background: "rgba(46,107,64,0.18)",
                border: "1px solid rgba(46,107,64,0.5)",
                color: WARM,
                fontFamily: SPACE_GROTESK,
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: "0.02em",
                cursor: "pointer",
              }}
            >
              {reachedGoal ? "Done" : "End"}
            </button>
            <button
              type="button"
              onClick={discardSit}
              className="transition-opacity hover:opacity-80"
              style={{
                background: "none",
                border: "none",
                color: "rgba(143,175,150,0.6)",
                fontFamily: SPACE_GROTESK,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Discard session
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
