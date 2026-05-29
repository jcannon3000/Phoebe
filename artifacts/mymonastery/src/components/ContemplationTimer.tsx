import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { playOpeningSwell, primeAudio } from "@/lib/amenFeedback";
import { AnimatedBackground } from "@/components/AnimatedBackground";

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

// "reflection" is the audio-led opening (e.g. Forward Day by Day read
// aloud). It plays FIRST and is deliberately NOT counted as
// contemplative time — only the "running" silence that follows it logs
// as prayer. Plain sits skip "reflection" and go picker → running.
type Phase = "picker" | "reflection" | "running" | "complete";

// Format a reflection/audio duration as a short human-readable string.
// "5 min" for even minutes, "5 min 45 sec" when seconds remain.
function formatReflectionLength(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (s === 0) return `${m} min`;
  return `${m} min ${s} sec`;
}

export function ContemplationTimer({
  open,
  onClose,
  // When set, the overlay skips the duration picker and begins a sit of
  // this length immediately — used by the quick 5/10/20 buttons on the
  // Contemplation page. Undefined → show the picker (the default, and
  // what the pause-slide CTA + "Begin contemplation" button use).
  startMinutes,
  // Optional audio layer. When audioUrl is set the sit OPENS with this
  // audio playing (e.g. today's Forward Day by Day, read aloud) over the
  // same screen, then flows seamlessly into silence when it ends — the
  // countdown spans the WHOLE experience and the full time logs as
  // contemplation, so "listen then sit" reads as one continuous thing.
  // audioTitle shows under the timer while it plays; eyebrowLabel
  // overrides the "Contemplation" eyebrow on the picker.
  audioUrl,
  audioTitle,
  eyebrowLabel,
  audioDurationSeconds,
}: {
  open: boolean;
  // `completed` is true when the user actually sat (reached the closing
  // screen), false when they backed out of the picker without sitting.
  // The pause-slide caller uses it to decide whether to advance the
  // slideshow to the next slide.
  onClose: (result?: { completed: boolean }) => void;
  startMinutes?: number;
  audioUrl?: string | null;
  audioTitle?: string | null;
  eyebrowLabel?: string;
  // When set (e.g. Forward Day by Day), the picker shows the reflection
  // duration and lets the user choose how much silence to add AFTER the
  // audio ends, rather than picking a total time blind. The total passed
  // to begin() = ceil(audioDurationSeconds/60) + chosen silence minutes,
  // so the timer is always long enough for the reflection to complete.
  audioDurationSeconds?: number | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("picker");
  const [customMode, setCustomMode] = useState(false);
  const [customMin, setCustomMin] = useState("10");
  // FDD-specific silence add-on state (shown in the picker when
  // audioDurationSeconds is set). Default 5 min of silence after the
  // reflection; 0 = reflection only, no extra silence.
  const [fddSilenceMin, setFddSilenceMin] = useState(5);
  const [fddCustomMode, setFddCustomMode] = useState(false);
  const [fddCustomMin, setFddCustomMin] = useState("10");
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
  // Closing-screen "who sat with you" data. Populated by a fetch the
  // moment the sit ends (no spinner — the screen renders instantly and
  // the row appears below the copy when the fetch resolves).
  type Companion = { userId: number; name: string | null; avatarUrl: string | null };
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [otherCount, setOtherCount] = useState(0);
  // Per-session visibility — toggleable on the summary screen. The
  // initial value comes from localStorage so the user's last choice
  // sticks (if you always pray privately, it stays Private on the next
  // sit). When the user flips it on the summary, we PATCH the saved
  // session and update localStorage.
  const PRIVACY_KEY = "phoebe.contemplation.isPrivate";
  const initialIsPrivate = (() => {
    try { return localStorage.getItem(PRIVACY_KEY) === "1"; } catch { return false; }
  })();
  const [isPrivate, setIsPrivate] = useState<boolean>(initialIsPrivate);
  // Row id returned by the recordSession POST. Held so the toggle's
  // PATCH knows which session to flip. Null until the POST resolves.
  const [recordedSessionId, setRecordedSessionId] = useState<number | null>(null);

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

  // Optional audio (e.g. Forward Day by Day read aloud) that opens the sit.
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  // Live audio position during the reflection phase — drives the progress
  // bar + time readout so the listener sees how much of the reflection is left.
  const [audioElapsed, setAudioElapsed] = useState(0);
  const stopAudio = () => { try { audioElRef.current?.pause(); } catch { /* non-fatal */ } };
  // Chosen silence (minutes) to sit AFTER the reflection, remembered across
  // the reflection phase so the audio's onEnded can start the right length.
  const silenceMinRef = useRef(0);
  // Mirrors `phase` for callbacks (audio onEnded) that would otherwise read
  // a stale closure value.
  const phaseRef = useRef<Phase>("picker");
  const eyebrow = eyebrowLabel ?? t("contemplation.title");

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
        phaseRef.current = "picker";
        setCustomMode(false);
        setAudioElapsed(0);
      }
    } else {
      releaseWakeLock();
      cancelEndBell();
      stopAudio();
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
    const endedAt = new Date();
    // Capture the chosen visibility AT POST TIME — if the user later
    // toggles, we fire a PATCH with the new value rather than waiting
    // for them to dismiss the screen.
    const initialPrivate = isPrivate;
    apiRequest<{ id: number | null }>("POST", "/api/prayer-sessions", {
      surface: "contemplation",
      durationSeconds: sat,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      isPrivate: initialPrivate,
    })
      .then((data) => {
        if (data?.id) setRecordedSessionId(data.id);
        queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-stats"] });
        // Refresh the History list so the just-finished sit appears.
        queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-sessions"] });
      })
      .catch(() => { /* best-effort — a dropped stat shouldn't break the close */ });

    // Companion lookup — who else was sitting alongside this exact
    // window? Garden members come back with avatars (rendered as a
    // face row); anyone else is just summed into `otherCount`. We fire
    // this in parallel with the recordSession POST so the summary
    // screen surfaces companions as soon as the fetch returns. Failures
    // are silent — a missing row shouldn't break the closing screen.
    apiRequest<{ companions: Companion[]; otherCount: number }>(
      "GET",
      `/api/me/contemplation-companions?startedAt=${encodeURIComponent(startedAt.toISOString())}&endedAt=${encodeURIComponent(endedAt.toISOString())}`,
    )
      .then((data) => {
        setCompanions(data.companions ?? []);
        setOtherCount(data.otherCount ?? 0);
      })
      .catch(() => { /* non-fatal — summary just shows the existing copy */ });
  }

  // Entry point from the picker / quick buttons. In audio (FDD) mode
  // `minutes` is the SILENCE to sit AFTER the reflection — the reflection
  // plays first and is NOT counted as contemplative time. In plain mode
  // `minutes` is the whole sit and we go straight into the silence.
  function begin(minutes: number) {
    // Warm up the Web Audio context inside the Begin tap's user-gesture
    // scope so the opening/closing swell lands on a "running" context
    // instead of a suspended one. Without this, the swell often silently
    // fails on the first sit after a cold launch.
    primeAudio();
    setSatSeconds(0);
    setReachedGoal(false);
    setOvertime(0);
    // Clear last sit's companion data so it doesn't flash on the new
    // summary screen before the fetch for THIS sit returns.
    setCompanions([]);
    setOtherCount(0);
    // Clear the previous row id — a stale id here would route a
    // toggle PATCH to a different sit. Don't reset isPrivate (it
    // persists across sits per the user's preference).
    setRecordedSessionId(null);
    recordedRef.current = false;
    finishedRef.current = false;
    reachedRef.current = false;
    setEndedEarly(false);

    if (audioUrl) {
      // Reflection phase: play the audio FIRST. The contemplative
      // countdown does not start until the reflection ends (or is
      // skipped) — only the silence after it logs as prayer.
      silenceMinRef.current = Math.max(0, Math.round(minutes));
      setAudioElapsed(0);
      setPhase("reflection");
      phaseRef.current = "reflection";
      void acquireWakeLock();
      const a = audioElRef.current;
      if (a) {
        try { a.currentTime = 0; } catch { /* ignore */ }
        // Runs inside the Begin tap's user gesture, so iOS lets it play.
        a.play().then(() => setAudioPlaying(true)).catch(() => {
          // Couldn't play (gated/offline) — fall through to the silence.
          startSilence(silenceMinRef.current);
        });
      } else {
        startSilence(silenceMinRef.current);
      }
    } else {
      startSilence(minutes);
    }
  }

  // Begin the silent contemplation countdown. THIS is the only stretch
  // logged as contemplative prayer — in FDD mode the reflection that
  // played first is intentionally excluded. `minutes <= 0` means the user
  // chose "reflection only", so there's nothing to sit and nothing to log.
  function startSilence(minutes: number) {
    const mins = Math.max(0, Math.round(minutes));
    if (mins <= 0) {
      // Reflection-only — close gently once the audio is done. Nothing logs.
      stopAudio();
      setAudioPlaying(false);
      releaseWakeLock();
      cancelEndBell();
      onClose({ completed: true });
      return;
    }
    // The reflection is over — silence starts NOW, so the logged time
    // begins here (excluding the audio that preceded it).
    stopAudio();
    setAudioPlaying(false);
    const total = mins * 60;
    setTotalSeconds(total);
    setRemaining(total);
    startedAtRef.current = new Date();
    endAtRef.current = Date.now() + total * 1000;
    reachedRef.current = false;
    finishedRef.current = false;
    setReachedGoal(false);
    setOvertime(0);
    setPhase("running");
    phaseRef.current = "running";
    void acquireWakeLock();
    scheduleEndBell(endAtRef.current);
    // Opening swell — the chapel-exhale that marks the hand-off from
    // listening into stillness (octave 0, the base voicing).
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
    stopAudio(); setAudioPlaying(false);
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
    phaseRef.current = "complete";
  }

  // Skip the rest of the reflection and go straight into the silence.
  // Used by the "Skip to silence" control in the reflection phase.
  function skipToSilence() {
    if (phaseRef.current !== "reflection") return;
    startSilence(silenceMinRef.current);
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
    stopAudio();
    onClose({ completed: false });
  }

  function handleClose() {
    releaseWakeLock();
    cancelEndBell();
    stopAudio();
    // "completed" when the user actually sat (reached the closing
    // screen); false when they backed out of the picker. The pause-slide
    // caller advances the slideshow only on a completed sit.
    onClose({ completed: phase === "complete" });
  }

  // Toggle the just-finished sit's public/private flag. Updates local
  // state instantly (no spinner — the toggle should feel immediate)
  // and fires a fire-and-forget PATCH. The choice is also written to
  // localStorage so the next sit starts with the same preference.
  // If the PATCH races ahead of the POST (recordedSessionId not yet
  // set), we skip the network call and rely on the optimistic local
  // state. The user can re-toggle once the id lands.
  function togglePrivacy() {
    const next = !isPrivate;
    setIsPrivate(next);
    try { localStorage.setItem(PRIVACY_KEY, next ? "1" : "0"); } catch { /* non-fatal */ }
    if (recordedSessionId == null) return;
    apiRequest("PATCH", `/api/me/contemplation-sessions/${recordedSessionId}/visibility`, { isPrivate: next })
      .catch(() => { /* best-effort — UI already reflects the choice */ });
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
        style={{ background: BG, isolation: "isolate" }}
      >
        {/* Drifting green backdrop — sits at z-index:-1 behind the timer,
            isolation:isolate keeps it contained so the content paints
            above it without per-element z-index. */}
        <AnimatedBackground base={BG} variant="pronounced" />
        {audioUrl && (
          <audio
            ref={audioElRef}
            src={audioUrl}
            preload="auto"
            onPlay={() => setAudioPlaying(true)}
            onPause={() => setAudioPlaying(false)}
            onTimeUpdate={(e) => setAudioElapsed(e.currentTarget.currentTime)}
            onEnded={() => {
              setAudioPlaying(false);
              // Reflection finished → flow into the silent contemplation.
              if (phaseRef.current === "reflection") startSilence(silenceMinRef.current);
            }}
          />
        )}
        {/* Close (×) — top right, safe-area aware. Hidden mid-sit so a
            stray tap doesn't abandon the silence; an explicit "End"
            sits at the bottom instead. Shown in the reflection phase so
            the listener can back out before the silence begins. */}
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
                {eyebrow}
              </p>

              {audioUrl ? (
                // ── FDD / audio-led picker ────────────────────────────────────
                // Shows how long today's reflection is (when known), then lets
                // the user choose how much silence to add after it. begin() is
                // called directly inside the Begin button's onClick so the
                // audio gesture requirement is met on iOS.
                (() => {
                  // audioMin is the ceiling of the episode in whole minutes,
                  // or a generous 10-min fallback when the feed omits duration.
                  const audioMin = audioDurationSeconds != null
                    ? Math.ceil(audioDurationSeconds / 60)
                    : null;

                  return (
                    <>
                      {/* Reflection duration badge — names how long today's
                          Forward Day by Day reflection runs before the sit. */}
                      <div
                        className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-5"
                        style={{ background: "rgba(96,141,209,0.16)", border: "1px solid rgba(96,141,209,0.4)" }}
                      >
                        <span aria-hidden style={{ fontSize: 14 }}>🎧</span>
                        <span
                          className="text-[13px] font-semibold"
                          style={{ color: "#C8D4C0", fontFamily: SPACE_GROTESK, letterSpacing: "0.01em" }}
                        >
                          {audioMin != null
                            ? `${formatReflectionLength(audioDurationSeconds!)} reflection`
                            : "Today's reflection"}
                        </span>
                      </div>

                      <p
                        className="text-[22px] leading-[1.4] font-medium italic mb-2"
                        style={{ color: WARM, fontFamily: "Georgia, 'Times New Roman', serif" }}
                      >
                        How long would you like to sit afterward?
                      </p>
                      <p
                        className="text-[12px] mb-7"
                        style={{ color: "rgba(143,175,150,0.6)", fontFamily: "Georgia, serif", fontStyle: "italic" }}
                      >
                        The reflection plays first, then your silence begins.
                      </p>

                      {!fddCustomMode ? (
                        <>
                          <div className="grid grid-cols-3 gap-3 w-full">
                            {/* "None" = reflection only */}
                            <button
                              type="button"
                              onClick={() => setFddSilenceMin(0)}
                              className="rounded-2xl py-4 transition-opacity hover:opacity-90 active:scale-[0.98]"
                              style={{
                                background: fddSilenceMin === 0 ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.16)",
                                border: `1px solid ${fddSilenceMin === 0 ? "rgba(46,107,64,0.65)" : "rgba(46,107,64,0.4)"}`,
                                color: WARM, fontFamily: SPACE_GROTESK, fontSize: 13, fontWeight: 600, cursor: "pointer",
                              }}
                            >
                              None
                            </button>
                            {[3, 5, 10, 15, 20].map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => setFddSilenceMin(m)}
                                className="rounded-2xl py-4 transition-opacity hover:opacity-90 active:scale-[0.98]"
                                style={{
                                  background: fddSilenceMin === m ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.16)",
                                  border: `1px solid ${fddSilenceMin === m ? "rgba(46,107,64,0.65)" : "rgba(46,107,64,0.4)"}`,
                                  color: WARM, fontFamily: SPACE_GROTESK, fontSize: 17, fontWeight: 600, cursor: "pointer",
                                }}
                              >
                                {m}
                                <span className="block text-[11px] font-normal mt-0.5" style={{ color: SAGE }}>min</span>
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => setFddCustomMode(true)}
                            className="mt-4 text-[13px] transition-opacity hover:opacity-80"
                            style={{ color: "rgba(143,175,150,0.8)", background: "none", border: "none", cursor: "pointer", fontFamily: SPACE_GROTESK }}
                          >
                            {t("contemplation_timer.custom_length")}
                          </button>
                        </>
                      ) : (
                        <div className="w-full flex flex-col items-center gap-4">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={120}
                              value={fddCustomMin}
                              onChange={(e) => setFddCustomMin(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                              className="text-center rounded-xl py-3 px-4 text-[22px] font-semibold"
                              style={{
                                width: 110,
                                background: "rgba(15,40,24,0.6)",
                                border: "1px solid rgba(46,107,64,0.4)",
                                color: WARM, fontFamily: SPACE_GROTESK,
                              }}
                            />
                            <span style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>min silence</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const n = Math.max(0, Math.min(120, parseInt(fddCustomMin || "0", 10) || 0));
                              setFddSilenceMin(n);
                              setFddCustomMode(false);
                            }}
                            className="rounded-full py-3 px-8 text-sm font-semibold transition-opacity hover:opacity-90"
                            style={{ background: "rgba(46,107,64,0.25)", border: "1px solid rgba(46,107,64,0.5)", color: WARM, cursor: "pointer", fontFamily: SPACE_GROTESK }}
                          >
                            Set
                          </button>
                          <button
                            type="button"
                            onClick={() => setFddCustomMode(false)}
                            className="text-[13px] transition-opacity hover:opacity-80"
                            style={{ color: "rgba(143,175,150,0.7)", background: "none", border: "none", cursor: "pointer", fontFamily: SPACE_GROTESK }}
                          >
                            {t("contemplation_timer.back_to_presets")}
                          </button>
                        </div>
                      )}

                      {/* Contemplation hint — only the silence after the
                          reflection counts as contemplative prayer time. */}
                      {!fddCustomMode && (
                        <p className="mt-4 text-[11px]" style={{ color: "rgba(143,175,150,0.5)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
                          {fddSilenceMin === 0
                            ? "Reflection only — no silence after"
                            : `${fddSilenceMin} min of silence logs as contemplative prayer`}
                        </p>
                      )}

                      {/* Begin — passes the SILENCE length only; the reflection
                          plays first and isn't counted. Called inside onClick
                          so iOS allows audio.play(). */}
                      <button
                        type="button"
                        onClick={() => begin(fddSilenceMin)}
                        className="mt-6 w-full max-w-xs rounded-full py-3.5 text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98]"
                        style={{ background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)", cursor: "pointer", fontFamily: SPACE_GROTESK }}
                      >
                        {fddSilenceMin === 0 ? "Play reflection" : "Begin"}
                      </button>
                    </>
                  );
                })()
              ) : (
                // ── Standard contemplation picker ─────────────────────────────
                <>
                  <p className="text-[22px] leading-[1.4] font-medium italic mb-8" style={{ color: WARM, fontFamily: "Georgia, 'Times New Roman', serif" }}>
                    {t("contemplation_timer.how_long")}
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
                              {m === 1 ? t("contemplation.minute") : t("contemplation.minutes")}
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
                        {t("contemplation_timer.custom_length")}
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
                        <span style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>{t("contemplation.minutes")}</span>
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
                        {t("examen.begin")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomMode(false)}
                        className="text-[13px] transition-opacity hover:opacity-80"
                        style={{ color: "rgba(143,175,150,0.7)", background: "none", border: "none", cursor: "pointer", fontFamily: SPACE_GROTESK }}
                      >
                        {t("contemplation_timer.back_to_presets")}
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {phase === "reflection" && (
            <>
              {/* Reflection phase — today's audio plays first. The
                  contemplative countdown has NOT started yet; it begins
                  only when this audio ends (or the user skips ahead). */}
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-4" style={{ color: "rgba(143,175,150,0.55)" }}>
                {t("fdd_sit.listening", { defaultValue: "Listen, and let it settle." })}
              </p>

              {audioTitle && (
                <p
                  className="text-[20px] leading-[1.35] font-medium mb-7"
                  style={{ color: WARM, fontFamily: "Georgia, 'Times New Roman', serif", maxWidth: 340 }}
                >
                  {audioTitle}
                </p>
              )}

              {/* Progress bar + time readout (when we know the duration). */}
              {audioDurationSeconds != null && audioDurationSeconds > 0 && (
                <div className="w-full max-w-xs mb-2">
                  <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "rgba(143,175,150,0.18)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (audioElapsed / audioDurationSeconds) * 100)}%`,
                        background: "rgba(96,141,209,0.85)",
                        transition: "width 0.3s linear",
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5 tabular-nums" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK, fontSize: 12 }}>
                    <span>{mmss(audioElapsed)}</span>
                    <span>−{mmss(Math.max(0, audioDurationSeconds - audioElapsed))}</span>
                  </div>
                </div>
              )}

              {/* Play / pause the reflection. */}
              <button
                type="button"
                onClick={() => {
                  const a = audioElRef.current;
                  if (!a) return;
                  if (a.paused) { a.play().then(() => setAudioPlaying(true)).catch(() => { /* ignore */ }); }
                  else { a.pause(); setAudioPlaying(false); }
                }}
                aria-label={audioPlaying ? "Pause" : "Play"}
                className="flex items-center justify-center rounded-full mt-4 transition-opacity hover:opacity-90 active:scale-[0.97]"
                style={{ width: 64, height: 64, background: "rgba(96,141,209,0.22)", border: "1px solid rgba(96,141,209,0.5)", color: WARM, cursor: "pointer" }}
              >
                <span aria-hidden style={{ fontSize: 24, lineHeight: 1 }}>{audioPlaying ? "❚❚" : "▶"}</span>
              </button>

              <p className="text-[12px] mt-6" style={{ color: "rgba(143,175,150,0.55)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
                {silenceMinRef.current > 0
                  ? `${silenceMinRef.current} min of silence follows`
                  : "Silence won't follow — reflection only"}
              </p>
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
              {audioUrl && audioPlaying ? (
                <div style={{ marginTop: 20 }}>
                  {audioTitle && (
                    <p className="text-[15px]" style={{ color: "rgba(200,212,192,0.92)", fontFamily: SPACE_GROTESK, fontWeight: 600, margin: 0 }}>
                      {audioTitle}
                    </p>
                  )}
                  <p className="text-[12px]" style={{ color: "rgba(143,175,150,0.6)", fontFamily: "Georgia, serif", fontStyle: "italic", marginTop: 6 }}>
                    {t("fdd_sit.listening", { defaultValue: "Listen, and let it settle." })}
                  </p>
                </div>
              ) : (
                <p
                  className="text-[13px]"
                  style={{
                    color: "rgba(143,175,150,0.6)",
                    fontFamily: "Georgia, serif",
                    fontStyle: "italic",
                    marginTop: 20,
                  }}
                >
                  {reachedGoal ? t("contemplation_timer.stay_as_long") : t("contemplation_timer.be_still")}
                </p>
              )}
            </>
          )}

          {phase === "complete" && (
            <>
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-3" style={{ color: "rgba(143,175,150,0.55)" }}>
                {endedEarly ? t("contemplation_timer.contemplation_ended") : t("contemplation_timer.contemplation_complete")}
              </p>
              <p className="text-[26px] leading-[1.3] font-medium italic mb-2" style={{ color: WARM, fontFamily: "Georgia, 'Times New Roman', serif" }}>
                {/* Always name the exact time prayed — important on an early
                    end so the user sees what they actually did. */}
                {t("contemplation_timer.of_contemplative_prayer", { time: formatDone(satSeconds) })}
              </p>
              <p className="text-[13px] mb-5" style={{ color: "rgba(143,175,150,0.65)", fontFamily: "Georgia, serif", fontStyle: "italic", maxWidth: 300 }}>
                {t("contemplation_timer.carry_the_quiet")}
              </p>

              {/* Public/private toggle — pill pair, same shape as the
                  "anyone in your garden" / "anyone else" affordances
                  used elsewhere. Tapping flips the saved sit's
                  is_private flag immediately (optimistic) and writes
                  the preference to localStorage so the next sit
                  starts with the same choice. */}
              <div className="flex items-center gap-1.5 mb-6" role="group" aria-label={t("contemplation_timer.privacy_aria")}>
                <button
                  type="button"
                  onClick={() => { if (isPrivate) togglePrivacy(); }}
                  className="rounded-full px-3.5 py-1.5 transition-opacity"
                  style={{
                    background: !isPrivate ? "rgba(46,107,64,0.35)" : "transparent",
                    border: `1px solid ${!isPrivate ? "rgba(46,107,64,0.55)" : "rgba(46,107,64,0.22)"}`,
                    color: !isPrivate ? "#C8D4C0" : "rgba(143,175,150,0.55)",
                    fontFamily: SPACE_GROTESK,
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.14em",
                    cursor: "pointer",
                  }}
                  aria-pressed={!isPrivate}
                >
                  {t("contemplation_timer.public")}
                </button>
                <button
                  type="button"
                  onClick={() => { if (!isPrivate) togglePrivacy(); }}
                  className="rounded-full px-3.5 py-1.5 transition-opacity"
                  style={{
                    background: isPrivate ? "rgba(193,154,58,0.22)" : "transparent",
                    border: `1px solid ${isPrivate ? "rgba(193,154,58,0.5)" : "rgba(46,107,64,0.22)"}`,
                    color: isPrivate ? "#E8D9B0" : "rgba(143,175,150,0.55)",
                    fontFamily: SPACE_GROTESK,
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.14em",
                    cursor: "pointer",
                  }}
                  aria-pressed={isPrivate}
                >
                  {t("contemplation_timer.private")}
                </button>
              </div>
              <p
                className="text-[11px] mb-6 text-center"
                style={{ color: "rgba(143,175,150,0.55)", fontFamily: "Georgia, serif", fontStyle: "italic", maxWidth: 280 }}
              >
                {isPrivate
                  ? t("contemplation_timer.privacy_private_blurb")
                  : t("contemplation_timer.privacy_public_blurb")}
              </p>

              {/* "Who sat with you?" — garden members appear as a face
                  row (their contemplation overlapped yours); anyone
                  else on Phoebe is summed into a plain count line. The
                  whole block is hidden until the companions fetch
                  returns AND there's something to show, so the screen
                  doesn't reflow on empty results. */}
              {(companions.length > 0 || otherCount > 0) && (
                <div className="flex flex-col items-center mb-8" style={{ maxWidth: 320 }}>
                  {companions.length > 0 && (
                    <>
                      <p
                        className="text-[10px] uppercase tracking-[0.16em] font-semibold mb-2"
                        style={{ color: "rgba(143,175,150,0.55)", fontFamily: SPACE_GROTESK }}
                      >
                        {t("contemplation_timer.with_you")}
                      </p>
                      <div
                        className="flex items-center -space-x-2 mb-2"
                        title={companions.map((c) => c.name ?? "—").join(", ")}
                      >
                        {companions.slice(0, 6).map((c) =>
                          c.avatarUrl ? (
                            <img
                              key={c.userId}
                              src={c.avatarUrl}
                              alt={c.name ?? ""}
                              className="w-9 h-9 rounded-full object-cover"
                              style={{ border: "2px solid #0E2016" }}
                            />
                          ) : (
                            <div
                              key={c.userId}
                              className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-semibold"
                              style={{
                                background: "#1A4A2E",
                                color: "#A8C5A0",
                                border: "2px solid #0E2016",
                                fontFamily: SPACE_GROTESK,
                              }}
                            >
                              {(c.name ?? "·").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "·"}
                            </div>
                          )
                        )}
                      </div>
                      <p
                        className="text-[12px] text-center"
                        style={{ color: "rgba(200,212,192,0.75)", fontFamily: SPACE_GROTESK }}
                      >
                        {companions
                          .map((c) => c.name?.trim() || t("contemplation_timer.someone"))
                          .slice(0, 3)
                          .join(", ")}
                        {companions.length > 3
                          ? " " + t("contemplation_timer.and_n_more", { count: companions.length - 3 })
                          : ""}
                      </p>
                    </>
                  )}
                  {otherCount > 0 && (
                    <p
                      className={`text-[12px] ${companions.length > 0 ? "mt-2" : ""}`}
                      style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK, fontStyle: "italic" }}
                    >
                      {t("contemplation_timer.others_sitting", { count: otherCount })}
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={handleClose}
                className="rounded-full px-10 py-3.5 text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
                style={{ background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)", cursor: "pointer", fontFamily: SPACE_GROTESK }}
              >
                {t("contemplation_timer.amen")}
              </button>
            </>
          )}
        </div>

        {/* Reflection-phase control — skip the rest of the audio and go
            straight into the silence (or to the close, if no silence was
            chosen). Sits in the same spot the "End" pill uses mid-sit. */}
        {phase === "reflection" && (
          <div
            className="flex flex-col items-center gap-2.5"
            style={{ marginBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)" }}
          >
            <button
              type="button"
              onClick={skipToSilence}
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
              {silenceMinRef.current > 0 ? "Skip to silence →" : "End reflection"}
            </button>
          </div>
        )}

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
              {reachedGoal ? t("common.done") : t("contemplation_timer.end")}
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
              {t("contemplation_timer.discard_session")}
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
