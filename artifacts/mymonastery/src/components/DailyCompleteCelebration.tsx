/**
 * DailyCompleteCelebration — the Duolingo-style payoff screen.
 *
 * Watches today's rhythm (useRhythmState). The MOMENT the user keeps their last
 * remaining practice — the transition from "N-1 of N" to "all kept" observed
 * within this session — it takes over the screen with a radial emoji burst, the
 * daily streak count, and a native haptic celebration swell, then dismisses on
 * tap. Fires at most once per local day (localStorage-guarded) so a reload or a
 * re-mount never replays it.
 *
 * Why an in-session transition and not "is complete on load": the rhythm
 * queries climb 0 → N as data lands, so "complete on first paint" can't be
 * distinguished from "completed earlier today and just reopened the app." We
 * settle the queries first, snapshot a baseline, and only celebrate a genuine
 * climb to complete after that baseline is armed. Bias is toward missing a
 * celebration, never toward a false one.
 *
 * Mounted globally in App.tsx, gated to logged-in users (the inner component —
 * and therefore useRhythmState's authenticated queries — never mounts for a
 * logged-out visitor).
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useRhythmState } from "@/hooks/useRhythmState";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', sans-serif";

function localDay(): string {
  return new Date().toLocaleDateString("en-CA");
}

function celebratedKey(day: string): string {
  return `phoebe:daily-complete-celebrated:${day}`;
}

function alreadyCelebrated(day: string): boolean {
  try {
    return localStorage.getItem(celebratedKey(day)) !== null;
  } catch {
    return false;
  }
}

function markCelebrated(day: string): void {
  try {
    localStorage.setItem(celebratedKey(day), "1");
  } catch {
    /* private mode — non-fatal, just means it may replay */
  }
}

function CelebrationOverlay({ streak, doneCount, total, onClose }: {
  streak: number;
  doneCount: number;
  total: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  // 12 emoji particles bursting outward in a ring (mirrors the closing-slide
  // StreakCelebration so the two payoffs feel like one app).
  const particles = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    const distance = 150;
    return {
      i,
      emoji: i % 3 === 0 ? "🌿" : i % 3 === 1 ? "✨" : "🌱",
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
    };
  });

  const streakLabel = streak <= 1
    ? t("daily_complete.day_one")
    : t("daily_complete.streak", { count: streak });
  const encouragement = streak > 1
    ? t("daily_complete.encouragement_streak", { count: streak })
    : t("daily_complete.encouragement");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center px-6 text-center cursor-pointer"
      style={{
        background: "radial-gradient(120% 120% at 50% 35%, rgba(28,46,32,0.98) 0%, rgba(11,15,11,0.99) 70%)",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
        backdropFilter: "blur(2px)",
      }}
    >
      {/* Radial emoji burst */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {particles.map((p) => (
          <motion.div
            key={p.i}
            initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
            animate={{
              opacity: [0, 1, 1, 0],
              scale: [0, 1.2, 1, 0.6],
              x: [0, p.x * 0.3, p.x * 0.7, p.x],
              y: [0, p.y * 0.3, p.y * 0.7, p.y],
            }}
            transition={{ duration: 1.8, delay: 0.2 + p.i * 0.035, ease: "easeOut" }}
            style={{ position: "absolute", fontSize: 24 }}
          >
            {p.emoji}
          </motion.div>
        ))}
      </div>

      {/* Title */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        style={{
          fontFamily: FONT, fontSize: 13, letterSpacing: "0.2em",
          textTransform: "uppercase", color: SAGE, marginBottom: 4, zIndex: 10,
        }}
      >
        {t("daily_complete.title")}
      </motion.p>

      {/* Streak number — spring scale-in */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.15 }}
        className="flex items-baseline justify-center gap-2 relative z-10"
      >
        <span style={{ fontFamily: FONT, fontSize: 104, fontWeight: 700, color: WARM, lineHeight: 1, letterSpacing: "-0.03em" }}>
          {Math.max(streak, 1)}
        </span>
        <motion.span
          initial={{ rotate: -20, scale: 0.8 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 180, damping: 10, delay: 0.35 }}
          style={{ fontSize: 60 }}
        >
          🔥
        </motion.span>
      </motion.div>

      {/* Streak label */}
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.55 }}
        style={{ fontFamily: FONT, fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", color: SAGE, marginTop: 10, zIndex: 10 }}
      >
        {streakLabel}
      </motion.p>

      {/* Kept-count + encouragement */}
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.75 }}
        className="relative z-10"
        style={{ color: WARM, fontFamily: FONT, fontSize: 16, lineHeight: 1.5, maxWidth: 340, marginTop: 14 }}
      >
        {t("daily_complete.kept_count", { count: doneCount, total })}
        <br />
        {encouragement}
      </motion.p>

      {/* Continue */}
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 1.0 }}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="relative z-10 rounded-full px-8 py-3 text-base font-semibold transition-opacity hover:opacity-90"
        style={{ marginTop: 32, background: "#2D5E3F", color: WARM, border: "1px solid rgba(168,197,160,0.4)", fontFamily: FONT }}
      >
        {t("daily_complete.continue")}
      </motion.button>
    </motion.div>
  );
}

function DailyCompleteWatcher() {
  const rs = useRhythmState();
  const streak = rs.streak;
  // The celebration marks completing your daily PRACTICES (the prayer rhythm):
  // the four core anchors + the optional SPIRITUAL extras (gratitude / examen).
  // It deliberately EXCLUDES the daily-steps health goal — otherwise finishing
  // all your prayer + contemplation wouldn't trigger it on a day you didn't hit
  // your step count, and once steps is active the celebration would almost never
  // fire. (The home "day is kept" hero already excludes steps too.)
  const practiceFlags = [
    rs.morningDone, rs.reflectDone, rs.silenceDone, rs.eveningDone,
    ...(rs.gratitudeActive ? [rs.gratitudeDone] : []),
    ...(rs.examenActive ? [rs.examenDone] : []),
  ];
  const totalAnchors = practiceFlags.length;
  const doneCount = practiceFlags.filter(Boolean).length;

  const [shown, setShown] = useState<{ streak: number; doneCount: number; total: number } | null>(null);

  // Baseline arming: ignore the initial query-load climb (counts climb 0 → N as
  // data lands). We arm ~1.4s after the counts settle. `armed` is STATE, not a
  // ref, so flipping it re-runs the trigger effect below — that way a day that's
  // already complete WHEN we arm (you finished just before the watcher armed, or
  // reopened after finishing without ever seeing the celebration) still fires,
  // not only an in-session climb. The once-per-day localStorage gate stops any
  // repeat.
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (armed || alreadyCelebrated(localDay())) return;
    const timer = window.setTimeout(() => setArmed(true), 1400);
    return () => window.clearTimeout(timer);
  }, [doneCount, totalAnchors, armed]);

  useEffect(() => {
    const day = localDay();
    if (shown || alreadyCelebrated(day)) return;
    if (!armed) return;
    if (totalAnchors <= 0 || doneCount < totalAnchors) return;

    // Genuine completion — an in-session climb, or already complete at arm time.
    markCelebrated(day);
    setShown({ streak, doneCount, total: totalAnchors });
    try {
      window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "celebration" } }));
    } catch {
      /* no native shell on web — silent */
    }
  }, [armed, doneCount, totalAnchors, streak, shown]);

  return (
    <AnimatePresence>
      {shown && (
        <CelebrationOverlay
          streak={shown.streak}
          doneCount={shown.doneCount}
          total={shown.total}
          onClose={() => setShown(null)}
        />
      )}
    </AnimatePresence>
  );
}

export function DailyCompleteCelebration() {
  const { user } = useAuth();
  // Gate the authenticated rhythm queries behind a real session — the watcher
  // (and useRhythmState) never mount for a logged-out visitor.
  if (!user) return null;
  return <DailyCompleteWatcher />;
}
