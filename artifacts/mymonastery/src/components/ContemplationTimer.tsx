import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { playOfficeChime, primeAudio } from "@/lib/amenFeedback";
import { isNativeShell } from "@/lib/isNativeShell";
import { useAuth } from "@/hooks/useAuth";
import { PHOEBE_GUEST_ENABLED } from "@/lib/guestFlag";
import { getGuestSilenceGoalMin } from "@/lib/guestSeed";
import { addGuestSilenceMinutes, getGuestSilenceMinutesToday } from "@/lib/guestSilenceLog";
import { resolveContemplationSideForSit } from "@/lib/contemplationSideDone";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { CobreatheGlobe } from "@/components/CobreatheGlobe";
import { EARTH_PHOTOS } from "@/lib/earthPhotos";

// ALL CONTEMPLATION IS PRIVATE NOW (owner direction, 2026-07-02): a silent sit
// neither broadcasts the sitter's live presence nor displays anyone else's —
// no presence heartbeat POST, no who's-sitting poll, no live "praying with you
// now" rail, no closing "who sat with you" faces/count, and no "praying
// alongside" row in the Contemplation page history (which imports this flag).
// OFF for EVERYONE — this is not a guest gate. The sit itself, minutes
// logging, and goal progress are untouched, and the per-session
// public/private toggle still governs what the server STORES (older installed
// builds read that). Flip to restore the communal silence experience.
export const CONTEMPLATION_PRESENCE_ENABLED = false;

// A different calm landscape behind each silent sit (not the fixed polar bear).
function pickLandscape(): string {
  if (EARTH_PHOTOS.length === 0) return "/images/cobreathe-bg.avif";
  return EARTH_PHOTOS[Math.floor(Math.random() * EARTH_PHOTOS.length)]!;
}

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
type Phase = "picker" | "reflection" | "running" | "complete" | "whats-next";

// An optional "what's next" closing card shown AFTER the completion summary — a
// gentle handoff into the next thing in the day's rhythm (e.g. today's
// reflection / newsletter). Only passed when the timer is launched standalone
// (the /contemplation page); the office slideshow has its own next-up, so it
// leaves this unset and the summary's button just closes.
export type ContemplationWhatsNext = {
  eyebrow?: string;
  emoji: string;
  title: string;
  sub?: string;
  cta: string;
  // Invoked when the user taps the CTA. The timer closes first, then this runs
  // (so the caller can navigate). Runs in place of the plain "Done" close.
  onGo: () => void;
};

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
  audioStartSec,
  audioEndSec,
  whatsNext,
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
  // FDD skip-marks (seconds). audioStartSec seeks past the intro to the
  // scripture reading when playback begins; audioEndSec flows into the silent
  // timer when the meditation + closing prayer finish, before the donation
  // appeal. Either may be null/absent — then the full episode plays.
  audioStartSec?: number | null;
  audioEndSec?: number | null;
  // Optional closing "what's next" card shown after the completion summary.
  whatsNext?: ContemplationWhatsNext | null;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [phase, setPhase] = useState<Phase>("picker");
  // A landscape chosen once per mount — a different one each sit (not the bear).
  const [bgPhoto] = useState(pickLandscape);
  const [customMode, setCustomMode] = useState(false);
  // Listen defaults to a 5-minute sit (St. Benedict's "Listen" — a few
  // minutes of silence before God).
  const [customMin, setCustomMin] = useState("5");
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
  // Live presence — who's sitting RIGHT NOW (refreshed while the sit runs), so
  // companions appear during the sit and both sitters see each other without
  // waiting for either session to finish. `liveSeenRef` accumulates everyone
  // seen during the sit so the closing summary credits them too (fixing the
  // old asymmetry where the first finisher saw no one).
  const [liveCompanions, setLiveCompanions] = useState<Companion[]>([]);
  const liveSeenRef = useRef<Companion[]>([]);
  const mergeCompanions = (a: Companion[], b: Companion[]): Companion[] => {
    const seen = new Set(a.map((c) => c.userId));
    return [...a, ...b.filter((c) => !seen.has(c.userId))].slice(0, 6);
  };
  // While the sit is RUNNING: heartbeat presence (~20s) and poll who else is
  // sitting right now (~15s) so companions show live. Cleared when the sit
  // ends or the timer unmounts (the server expires a beat after ~60s anyway).
  // DISABLED while contemplation is private (CONTEMPLATION_PRESENCE_ENABLED):
  // no beat leaves the device, no poll asks who else is sitting.
  useEffect(() => {
    if (phase !== "running" || !CONTEMPLATION_PRESENCE_ENABLED) return;
    liveSeenRef.current = [];
    let cancelled = false;
    const beat = () => { void apiRequest("POST", "/api/me/contemplation-presence").catch(() => { /* offline ok */ }); };
    const poll = () => {
      apiRequest<{ companions: Companion[]; otherCount: number }>("GET", "/api/me/contemplation-presence")
        .then((d) => {
          if (cancelled) return;
          const list = d.companions ?? [];
          setLiveCompanions(list);
          if (list.length) liveSeenRef.current = mergeCompanions(liveSeenRef.current, list);
        })
        .catch(() => { /* offline ok */ });
    };
    beat(); poll();
    const beatId = window.setInterval(beat, 20_000);
    const pollId = window.setInterval(poll, 15_000);
    return () => { cancelled = true; window.clearInterval(beatId); window.clearInterval(pollId); setLiveCompanions([]); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Daily contemplation goal (minutes; 0 = off) + today's total seconds incl.
  // this sit — fetched after the sit logs, to show goal progress on the close.
  const [dailyGoalMin, setDailyGoalMin] = useState(0);
  const [dailyTotalSeconds, setDailyTotalSeconds] = useState<number | null>(null);
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

  // Ring the contemplation bell. On the native iOS shell, route through the
  // PhoebeAudio plugin's .playback AVAudioSession (playNow) so the silent
  // switch doesn't mute it — the Web Audio swell below is silenced by the mute
  // switch and suspended when backgrounded. On web, keep the synthesized swell.
  // octave 0 = the lower opening voicing, 2 = the brighter close.
  function playBell(octave: 0 | 2) {
    if (isNativeShell()) {
      // The same swell tone Co-Breathe uses (PhoebeAudio.smoothSwell): a gentler
      // peak to open the sit, a fuller one to close. Falls back to the .caf bell
      // on an older shell without the plugin's swell.
      const swell = (window as unknown as {
        Capacitor?: { Plugins?: { PhoebeAudio?: { smoothSwell?: (o: { durationMs: number; peak: number; sharpness: number }) => Promise<unknown> } } };
      }).Capacitor?.Plugins?.PhoebeAudio?.smoothSwell;
      if (swell) {
        void swell({ durationMs: octave === 0 ? 520 : 660, peak: octave === 0 ? 0.85 : 1, sharpness: 0.45 }).catch(() => {});
        return;
      }
      nativeEvent("phoebe:contemplation-play-bell", {
        sound: octave === 0 ? "PhoebeRising-low.caf" : "PhoebeRising-high.caf",
      });
    } else {
      // Web (and desktop): a real synthesized chime — the opening (octave 0) and
      // closing (octave 2) bells. playOpeningSwell was retired to a no-op, which
      // had silenced the web bell entirely.
      playOfficeChime(octave);
    }
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
    // PUBLIC no-login version: a guest has no account to POST prayer_sessions
    // to — the sit logs its whole minutes to the device-local tally the home
    // "Silence" goal card's progress bar reads, and the closing summary's goal
    // line comes from the guest keys. Everything below (the server log, the
    // companions lookup) is signed-in only.
    if (PHOEBE_GUEST_ENABLED && !user) {
      addGuestSilenceMinutes(Math.floor(sat / 60));
      setDailyTotalSeconds(getGuestSilenceMinutesToday() * 60);
      setDailyGoalMin(getGuestSilenceGoalMin());
      return;
    }
    const startedAt = startedAtRef.current ?? new Date(Date.now() - sat * 1000);
    const endedAt = new Date();
    // (Phoebe no longer writes the sit to Apple Health as a Mindful Session —
    // it keeps the Health permission ask simple; the sit is still logged in-app.)
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
      // Which per-side card this sit keeps — same resolution the local
      // attribution applies, so the server can echo done-state to the
      // user's OTHER devices (/me/contemplation-sides-today).
      contemplationSide: resolveContemplationSideForSit() ?? undefined,
    })
      .then((data) => {
        if (data?.id) setRecordedSessionId(data.id);
        queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-sides-today"] });
        // Refresh the History list so the just-finished sit appears.
        queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-sessions"] });
        // Today's total INCLUDING this just-logged sit — drives the goal
        // progress line on the closing screen. Fetched after the POST resolves
        // so the new session is counted.
        const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
        let tz = "UTC";
        try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { /* keep UTC */ }
        apiRequest<{ todaySeconds?: number; healthMinutesToday?: number }>(
          "GET",
          `/api/me/contemplation-stats?todaySince=${encodeURIComponent(midnight.toISOString())}&tz=${encodeURIComponent(tz)}`,
        )
          // Fold in Apple Health mindful minutes the same way the dashboard +
          // Contemplation page do, so the "X of N min today" line on the close
          // screen matches the home card (which adds Health on top of the
          // prayer-only seconds) instead of showing a lower prayer-only total.
          .then((s) => setDailyTotalSeconds((s?.todaySeconds ?? 0) + (s?.healthMinutesToday ?? 0) * 60))
          .catch(() => { /* non-fatal — the progress line just won't show */ });
      })
      .catch(() => { /* best-effort — a dropped stat shouldn't break the close */ });

    // Daily goal (minutes; 0 = off) — fetched in parallel; doesn't depend on
    // the sit being logged.
    apiRequest<{ contemplationGoalMinutes?: number }>("GET", "/api/me/office-prefs")
      .then((p) => setDailyGoalMin(p?.contemplationGoalMinutes ?? 0))
      .catch(() => { /* non-fatal */ });

    // Companion lookup — who else was sitting alongside this exact
    // window? Garden members come back with avatars (rendered as a
    // face row); anyone else is just summed into `otherCount`. We fire
    // this in parallel with the recordSession POST so the summary
    // screen surfaces companions as soon as the fetch returns. Failures
    // are silent — a missing row shouldn't break the closing screen.
    // SKIPPED while contemplation is private — the closing screen shows
    // no one else's presence.
    if (CONTEMPLATION_PRESENCE_ENABLED) {
      apiRequest<{ companions: Companion[]; otherCount: number }>(
        "GET",
        `/api/me/contemplation-companions?startedAt=${encodeURIComponent(startedAt.toISOString())}&endedAt=${encodeURIComponent(endedAt.toISOString())}`,
      )
        .then((data) => {
          // Union the finished-overlap result with everyone seen sitting LIVE
          // during this sit, so the first finisher still sees companions who
          // haven't recorded their own session yet.
          setCompanions(mergeCompanions(data.companions ?? [], liveSeenRef.current));
          setOtherCount(data.otherCount ?? 0);
        })
        .catch(() => {
          // Network hiccup — fall back to whoever we saw live during the sit.
          if (liveSeenRef.current.length) setCompanions(liveSeenRef.current);
        });
    }
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
    setDailyTotalSeconds(null);
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
        // Skip the intro: start at the scripture reading when we have a mark.
        // iOS/Safari (WKWebView) silently DROPS a currentTime set before the
        // media has loaded metadata — so the episode would play from 0. Apply
        // the seek defensively: now (works once loaded), again on
        // loadedmetadata, and once more right after play() starts. The
        // `< seekTo - 1` guard makes the repeats no-ops once it has landed.
        const seekTo = Math.max(0, audioStartSec ?? 0);
        const applyStartSeek = () => {
          try { if (seekTo > 0 && a.currentTime < seekTo - 1) a.currentTime = seekTo; } catch { /* ignore */ }
        };
        applyStartSeek();
        if (seekTo > 0 && a.readyState < 1 /* HAVE_METADATA */) {
          a.addEventListener("loadedmetadata", applyStartSeek, { once: true });
        }
        // Runs inside the Begin tap's user gesture, so iOS lets it play.
        a.play().then(() => { setAudioPlaying(true); applyStartSeek(); }).catch(() => {
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
    playBell(0);
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
    const native = isNativeShell();
    // On the native shell, the scheduled bell (PhoebeAudio.scheduleBellAt)
    // fires at endAt on the AUDIO clock — it IS the close bell, and by the
    // time this JS tick runs it may already be ringing. Cancelling here
    // would stop it mid-ring, and playing again would stutter/restart it —
    // so on an on-time native finish we touch nothing: the plugin's own
    // cleanup timer stops the silence loop ~10s later, and the endAt local
    // notification has already fired (cancelling it is moot). Every other
    // case keeps the cancel: late catch-up (bell long finished; cancel just
    // reaps the silence loop) and web (cancel no-ops; we ring the swell).
    if (!(onTime && native)) cancelEndBell();
    if (onTime) {
      if (!native) {
        // Closing swell — same slideshow sound, brighter (octave 2).
        playBell(2);
      }
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
      playBell(2);
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
    // "completed" when the user actually sat (reached the closing summary or the
    // what's-next card that follows it); false when they backed out of the
    // picker. The pause-slide caller advances the slideshow only on a completed sit.
    onClose({ completed: phase === "complete" || phase === "whats-next" });
  }

  // The top-right ×. Mid-sit it now behaves like the "End" pill ONCE the user
  // has actually sat a moment: >= 15s of silence ends the sit, logs it, and
  // shows the completion screen (rather than silently discarding it). A quick
  // escape (< 15s), or backing out of the picker/reflection, just closes.
  function onCloseTap() {
    if (phaseRef.current === "running") {
      const now = Date.now();
      const elapsed = reachedRef.current
        ? totalSeconds + Math.max(0, (now - endAtRef.current) / 1000)
        : totalSeconds - Math.max(0, (endAtRef.current - now) / 1000);
      if (elapsed >= 15) { endSit(); return; }
      discardSit();
      return;
    }
    handleClose();
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
        // Gentle fade + slight rise so the picker eases in (the instant pop read
        // as a glitch). The solid background rises with it, so the page behind
        // isn't revealed mid-transition.
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-0 z-[60] flex flex-col items-center"
        style={{ background: BG, isolation: "isolate" }}
      >
        {/* Drifting green backdrop — sits at z-index:-1 behind the timer,
            isolation:isolate keeps it contained so the content paints
            above it without per-element z-index. */}
        <AnimatedBackground base={BG} variant="pronounced" />
        {/* A still landscape behind the sit — the world held quiet while you
            rest in it. Heavily washed in the home green so the timer + text stay
            legible. Shown during the silence + the closing summary. */}
        {(phase === "running" || phase === "complete" || phase === "whats-next") && (
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}>
            <img src={bgPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.5 }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(9,26,16, 0.550) 0%, rgba(9,26,16, 0.792) 55%, rgba(9,26,16, 0.946) 100%)" }} />
          </div>
        )}
        {audioUrl && (
          <audio
            ref={audioElRef}
            src={audioUrl}
            preload="auto"
            onPlay={() => setAudioPlaying(true)}
            onPause={() => setAudioPlaying(false)}
            onTimeUpdate={(e) => {
              const tNow = e.currentTarget.currentTime;
              setAudioElapsed(tNow);
              // Stop at the donation appeal (keeping the closing prayer) and
              // flow into silence, exactly as a natural end would.
              if (audioEndSec != null && tNow >= audioEndSec && phaseRef.current === "reflection") {
                stopAudio();
                setAudioPlaying(false);
                startSilence(silenceMinRef.current);
              }
            }}
            onEnded={() => {
              setAudioPlaying(false);
              // Reflection finished → flow into the silent contemplation.
              if (phaseRef.current === "reflection") startSilence(silenceMinRef.current);
            }}
          />
        )}
        {/* Close (×) — top right, safe-area aware. Shown in ALL phases now
            (including mid-sit, per request) so there's always a clear way out;
            it exits without logging the partial sit, while the bottom "End"
            finishes and logs it. */}
        {(
          <button
            type="button"
            onClick={onCloseTap}
            aria-label="Close"
            className="absolute flex items-center justify-center rounded-full"
            style={{
              top: "calc(var(--safe-top) + 12px)",
              right: 16,
              width: 40, height: 40,
              // SOLID so it reads over any photo background (it was 18% green,
              // near-invisible over the bright nature image).
              background: "rgba(10,24,16,0.86)",
              border: "1px solid rgba(210,230,216,0.55)",
              color: "#FFFFFF", fontSize: 20, lineHeight: 1, cursor: "pointer",
              boxShadow: "0 4px 16px rgba(0,0,0,0.45)",
              zIndex: 2,
            }}
          >
            ×
          </button>
        )}

        <div
          className="flex-1 flex flex-col items-center justify-center text-center px-6 w-full"
          style={{ maxWidth: 440, position: "relative", zIndex: 1 }}
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
                            <span style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>{t("contemplation_timer.min_silence", { defaultValue: "min silence" })}</span>
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
                      {/* Cobreathe — the guided communal breath as a way to keep
                          the silence. Closes the picker and opens the breath. */}
                      <button
                        type="button"
                        onClick={() => { primeAudio(); onClose({ completed: false }); setLocation("/cobreathe?start=1&from=contemplation"); }}
                        className="mt-5 w-full rounded-2xl py-3 transition-opacity hover:opacity-90 active:scale-[0.98] flex flex-col items-center"
                        style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.32)", color: WARM, fontFamily: SPACE_GROTESK, cursor: "pointer" }}
                      >
                        <span style={{ fontSize: 15, fontWeight: 600 }}><CobreatheGlobe size={15} style={{ marginRight: 4, verticalAlign: "-1px" }} />{t("contemplation_timer.cobreathe", { defaultValue: "Co-Breathe" })}</span>
                        <span style={{ fontSize: 12, color: SAGE, marginTop: 2 }}>{t("contemplation_timer.cobreathe_sub", { defaultValue: "Breathing together for climate justice" })}</span>
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

              {/* Public / private — chosen up front (default public), styled like
                  the office podcast's source toggle. Public lets garden-mates see
                  you sat alongside them; private keeps the sit to you. The choice
                  is still flippable on the closing screen. Hidden in the custom-
                  entry sub-views to keep those focused. */}
              {!customMode && !fddCustomMode && (
                <div className="flex flex-col items-center" style={{ marginTop: 28 }}>
                  <div
                    role="tablist"
                    aria-label={t("contemplation_timer.privacy_aria", { defaultValue: "Who can see this sit" })}
                    style={{ display: "inline-flex", gap: 4, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, padding: 4 }}
                  >
                    {([false, true] as const).map((priv) => {
                      const active = isPrivate === priv;
                      return (
                        <button
                          key={String(priv)}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => { if (isPrivate !== priv) togglePrivacy(); }}
                          style={{
                            borderRadius: 999, padding: "6px 18px", fontSize: 12, fontWeight: 600, fontFamily: SPACE_GROTESK,
                            letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap",
                            background: active ? "rgba(255,255,255,0.18)" : "transparent",
                            border: `1px solid ${active ? "rgba(255,255,255,0.3)" : "transparent"}`,
                            color: active ? "#FFFFFF" : "rgba(246,240,230,0.55)",
                            transition: "background 0.15s, color 0.15s",
                          }}
                        >
                          {priv ? t("contemplation_timer.private", { defaultValue: "Private" }) : t("contemplation_timer.public", { defaultValue: "Public" })}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] mt-2 text-center" style={{ color: "rgba(143,175,150,0.5)", fontFamily: "Georgia, serif", fontStyle: "italic", maxWidth: 260 }}>
                    {isPrivate
                      ? t("contemplation_timer.privacy_private_blurb")
                      : t("contemplation_timer.privacy_public_blurb")}
                  </p>
                </div>
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
              {audioDurationSeconds != null && audioDurationSeconds > 0 && (() => {
                // Track progress over the PLAYED window (scripture → appeal),
                // not the raw file, so a trimmed intro/outro reads correctly.
                const winStart = Math.max(0, audioStartSec ?? 0);
                const winEnd = audioEndSec ?? audioDurationSeconds;
                const winLen = Math.max(1, winEnd - winStart);
                const winElapsed = Math.min(Math.max(0, audioElapsed - winStart), winLen);
                return (
                  <div className="w-full max-w-xs mb-2">
                    <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "rgba(143,175,150,0.18)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (winElapsed / winLen) * 100)}%`,
                          background: "rgba(96,141,209,0.85)",
                          transition: "width 0.3s linear",
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-1.5 tabular-nums" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK, fontSize: 12 }}>
                      <span>{mmss(winElapsed)}</span>
                      <span>−{mmss(Math.max(0, winLen - winElapsed))}</span>
                    </div>
                  </div>
                );
              })()}

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
              ) : reachedGoal ? (
                <p
                  className="text-[13px]"
                  style={{
                    color: "rgba(143,175,150,0.6)",
                    fontFamily: "Georgia, serif",
                    fontStyle: "italic",
                    marginTop: 20,
                  }}
                >
                  {t("contemplation_timer.stay_as_long")}
                </p>
              ) : null}
              {/* Live companions — garden members sitting at the same moment,
                  refreshed every ~15s. "You're not alone in the silence."
                  Hidden while contemplation is private (the poll above is off,
                  so the list stays empty anyway — this gate is the intent). */}
              {CONTEMPLATION_PRESENCE_ENABLED && liveCompanions.length > 0 && (
                <div style={{ marginTop: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
                  <div className="-space-x-2" style={{ display: "flex", alignItems: "center" }}>
                    {liveCompanions.slice(0, 5).map((c) => (
                      c.avatarUrl ? (
                        <img key={c.userId} src={c.avatarUrl} alt={c.name ?? ""} className="w-7 h-7 rounded-full object-cover" style={{ border: "1.5px solid #0E2016" }} />
                      ) : (
                        <div key={c.userId} className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold" style={{ background: "#1A4A2E", color: "#A8C5A0", border: "1.5px solid #0E2016" }}>
                          {(c.name ?? "?").trim().charAt(0).toUpperCase() || "·"}
                        </div>
                      )
                    ))}
                  </div>
                  <p className="text-[12px]" style={{ color: SAGE, fontFamily: "Georgia, serif", fontStyle: "italic", margin: 0 }}>
                    {liveCompanions.length === 1
                      ? `${(liveCompanions[0].name ?? "Someone").split(" ")[0]} is praying with you now`
                      : `${liveCompanions.length} people are praying with you now`}
                  </p>
                </div>
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

              {/* Daily goal progress — only when a goal is set and today's
                  total (incl. this sit) has loaded. A quiet reinforcement of
                  the contemplation habit at the moment of completion. */}
              {dailyGoalMin > 0 && dailyTotalSeconds !== null && (() => {
                const goalSec = dailyGoalMin * 60;
                const met = dailyTotalSeconds >= goalSec;
                const doneMin = Math.floor(dailyTotalSeconds / 60);
                const remainMin = Math.max(1, dailyGoalMin - doneMin);
                const pct = Math.min(100, Math.round((dailyTotalSeconds / goalSec) * 100));
                return (
                  <div className="mb-6" style={{ width: "100%", maxWidth: 280 }}>
                    <div className="rounded-full overflow-hidden mb-2" style={{ height: 6, background: "rgba(46,107,64,0.2)" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: met ? "#6FAF85" : "#2D5E3F", transition: "width 0.4s ease" }} />
                    </div>
                    <p className="text-[12px]" style={{ color: met ? "#A8C5A0" : "rgba(143,175,150,0.75)", fontFamily: SPACE_GROTESK }}>
                      {met
                        ? t("contemplation_timer.goal_reached", { defaultValue: "Daily goal reached 🌿" })
                        : t("contemplation_timer.goal_progress", { done: doneMin, goal: dailyGoalMin, remain: remainMin, defaultValue: `${doneMin} of ${dailyGoalMin} min today — ${remainMin} to go` })}
                    </p>
                  </div>
                );
              })()}

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
                  doesn't reflow on empty results. Hidden entirely while
                  contemplation is private (the fetch is off too). */}
              {CONTEMPLATION_PRESENCE_ENABLED && (companions.length > 0 || otherCount > 0) && (
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
                onClick={() => { if (whatsNext) setPhase("whats-next"); else handleClose(); }}
                className="rounded-full px-10 py-3.5 text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
                style={{ background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)", cursor: "pointer", fontFamily: SPACE_GROTESK }}
              >
                {whatsNext
                  ? t("contemplation_timer.continue", { defaultValue: "Continue" })
                  : t("contemplation_timer.done", { defaultValue: "Done" })}
              </button>
            </>
          )}

          {/* The closing "what's next" card — a quiet handoff into the next thing
              in the day (usually today's reflection / newsletter). Shown only when
              the caller passed one (the standalone Contemplation page), so a
              contemplation-only rhythm still ends on somewhere to go. */}
          {phase === "whats-next" && whatsNext && (
            <>
              <p className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-4" style={{ color: "rgba(143,175,150,0.55)", fontFamily: SPACE_GROTESK }}>
                {whatsNext.eyebrow ?? t("contemplation_timer.whats_next", { defaultValue: "What's next" })}
              </p>
              <button
                type="button"
                onClick={() => { const go = whatsNext.onGo; handleClose(); go(); }}
                className="w-full rounded-2xl px-5 py-4 mb-5 text-left transition-opacity hover:opacity-90 active:scale-[0.99]"
                style={{ background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.4)", cursor: "pointer", maxWidth: 340 }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-[26px] leading-none" aria-hidden>{whatsNext.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-[16px] font-medium truncate" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>{whatsNext.title}</p>
                    {whatsNext.sub && (
                      <p className="text-[12.5px] mt-0.5" style={{ color: "rgba(200,212,192,0.7)", fontFamily: SPACE_GROTESK }}>{whatsNext.sub}</p>
                    )}
                  </div>
                </div>
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] mt-3" style={{ color: "#A8C5A0", fontFamily: SPACE_GROTESK }}>
                  {whatsNext.cta} →
                </p>
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-full px-10 py-3 text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
                style={{ background: "transparent", color: "rgba(200,212,192,0.75)", border: "1px solid rgba(46,107,64,0.35)", cursor: "pointer", fontFamily: SPACE_GROTESK }}
              >
                {t("contemplation_timer.done", { defaultValue: "Done" })}
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
            // Same fix as the End block below — lift above the zIndex:0 bg layer
            // so the gradient doesn't wash out this control.
            style={{ position: "relative", zIndex: 1, marginBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)" }}
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
            // position:relative + zIndex lift this ABOVE the absolute photo+dark-
            // gradient bg layer (zIndex 0). Without it this block is a non-
            // positioned root sibling, which paints UNDER that layer — so the
            // gradient washed the End/Done + Discard pills out (the "I can't see
            // the Done button, there's an overlay above it" report).
            style={{ position: "relative", zIndex: 1, marginBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)" }}
          >
            <button
              type="button"
              onClick={endSit}
              className="transition-opacity hover:opacity-90 active:scale-[0.98]"
              style={{
                // Plain text (no pill) per request — kept white with a strong
                // text-shadow so it stays legible over the bright photo.
                background: "none",
                border: "none",
                padding: "8px 16px",
                color: "#FFFFFF",
                fontFamily: SPACE_GROTESK,
                fontSize: 23,
                fontWeight: 700,
                letterSpacing: "0.02em",
                cursor: "pointer",
                textShadow: "0 2px 16px rgba(0,0,0,0.75)",
              }}
            >
              {reachedGoal ? t("common.done") : t("contemplation_timer.end")}
            </button>
            <button
              type="button"
              onClick={discardSit}
              className="transition-opacity hover:opacity-80"
              style={{
                // Plain text (no pill) per request, with a shadow for legibility.
                background: "none",
                border: "none",
                padding: "8px 16px",
                color: "rgba(255,255,255,0.88)",
                fontFamily: SPACE_GROTESK,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                textShadow: "0 2px 14px rgba(0,0,0,0.7)",
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
