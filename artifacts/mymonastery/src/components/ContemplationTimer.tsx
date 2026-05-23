import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { playChurchBell } from "@/lib/amenFeedback";

// Silent contemplation timer — Insight-Timer-style. A bell opens the
// sit, the screen counts down in stillness, a bell closes it. The
// elapsed time is logged as a "contemplation" prayer_session so it
// shows on the Contemplation page's stats.
//
// Launched two ways (both render this overlay): the "Begin
// contemplation" CTA on the prayer-mode pause slide, and the
// Contemplation menu page. Self-contained — controlled by `open`.

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

type Phase = "picker" | "running" | "complete";

export function ContemplationTimer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("picker");
  const [customMode, setCustomMode] = useState(false);
  const [customMin, setCustomMin] = useState("10");
  // Chosen length + the live remaining count (seconds).
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [remaining, setRemaining] = useState(0);
  // What the closing screen reports — the seconds actually sat.
  const [satSeconds, setSatSeconds] = useState(0);

  const endAtRef = useRef<number>(0);
  const startedAtRef = useRef<Date | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const recordedRef = useRef(false);

  // ── Wake lock — keep the screen on during a sit. Re-acquired on
  // foreground because the OS auto-releases it when the app backgrounds.
  async function acquireWakeLock() {
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
    try { wakeLockRef.current?.release(); } catch { /* non-fatal */ }
    wakeLockRef.current = null;
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

  // ── Reset to the picker each time the overlay (re)opens.
  useEffect(() => {
    if (open) {
      setPhase("picker");
      setCustomMode(false);
      recordedRef.current = false;
    } else {
      releaseWakeLock();
    }
  }, [open]);

  // ── Countdown loop. Remaining is derived from an absolute end time so
  // a backgrounded tab resyncs correctly on return rather than drifting.
  useEffect(() => {
    if (phase !== "running") return;
    const tick = () => {
      const left = Math.max(0, (endAtRef.current - Date.now()) / 1000);
      setRemaining(left);
      if (left <= 0) finish(totalSeconds);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, totalSeconds]);

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
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-stats"] }))
      .catch(() => { /* best-effort — a dropped stat shouldn't break the close */ });
  }

  function begin(minutes: number) {
    const total = Math.max(1, Math.round(minutes)) * 60;
    setTotalSeconds(total);
    setRemaining(total);
    setSatSeconds(0);
    recordedRef.current = false;
    startedAtRef.current = new Date();
    endAtRef.current = Date.now() + total * 1000;
    setPhase("running");
    void acquireWakeLock();
    playChurchBell();
  }

  // Both the natural finish and an early "End" land here. `seconds` is
  // the time actually sat (full length on a natural finish; elapsed on
  // an early end).
  function finish(seconds: number) {
    if (phase === "complete") return;
    releaseWakeLock();
    setSatSeconds(Math.round(seconds));
    recordSession(seconds);
    playChurchBell();
    try {
      window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "success" } }));
    } catch { /* non-fatal */ }
    setPhase("complete");
  }

  function endEarly() {
    const elapsed = totalSeconds - remaining;
    finish(elapsed);
  }

  function handleClose() {
    releaseWakeLock();
    onClose();
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
                How long would you like to sit?
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
              {/* Breathing ring — a slow pulse to settle into, behind the
                  countdown. Pure CSS via framer's infinite scale. */}
              <motion.div
                aria-hidden
                animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.85, 0.5] }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                style={{
                  position: "absolute",
                  width: 260, height: 260, borderRadius: "50%",
                  border: "1px solid rgba(143,210,160,0.35)",
                  background: "radial-gradient(circle, rgba(46,107,64,0.18) 0%, rgba(46,107,64,0) 70%)",
                }}
              />
              <p
                className="font-semibold tabular-nums"
                style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 56, letterSpacing: "-0.02em", position: "relative" }}
              >
                {mmss(remaining)}
              </p>
              <p className="text-[12px] mt-3" style={{ color: "rgba(143,175,150,0.6)", fontFamily: "Georgia, serif", fontStyle: "italic", position: "relative" }}>
                Be still, and know.
              </p>
            </>
          )}

          {phase === "complete" && (
            <>
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-3" style={{ color: "rgba(143,175,150,0.55)" }}>
                Contemplation complete
              </p>
              <p className="text-[26px] leading-[1.3] font-medium italic mb-2" style={{ color: WARM, fontFamily: "Georgia, 'Times New Roman', serif" }}>
                {satSeconds >= 60
                  ? `${Math.round(satSeconds / 60)} ${Math.round(satSeconds / 60) === 1 ? "minute" : "minutes"} of stillness`
                  : "A moment of stillness"}
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

        {/* End-early — only mid-sit, at the bottom out of the focal area. */}
        {phase === "running" && (
          <button
            type="button"
            onClick={endEarly}
            className="text-[13px] transition-opacity hover:opacity-80"
            style={{
              marginBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)",
              color: "rgba(143,175,150,0.55)", background: "none", border: "none",
              cursor: "pointer", fontFamily: SPACE_GROTESK, textDecoration: "underline", textUnderlineOffset: 3,
            }}
          >
            End
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
