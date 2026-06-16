import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { writeMindfulSession } from "@/lib/appleHealth";
import { CobreatheBreath, DEFAULT_TOTAL_BREATHS } from "@/components/CobreatheBreath";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { addBreathsThisWeek } from "@/lib/cobreatheTally";
import { useKeepAwake } from "@/hooks/useKeepAwake";

// ── CobreatheOverlay ────────────────────────────────────────────────────────
//
// A self-contained full-screen Cobreathe ceremony, launched as an overlay from
// surfaces that aren't the /cobreathe page — chiefly the prayer-mode pause
// slide, where "breathe together" belongs right beside "sit in silence". Runs
// the shared synchronized breath, records the day's breath, logs the time as a
// contemplation sit (so it counts toward the daily goal + Apple Health), and
// shows a brief "you breathed with N" close before handing control back.
//
// Mirrors the ContemplationTimer overlay pattern: `open` + `onClose(result)`.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, serif";

function localDay(): string {
  return new Date().toLocaleDateString("en-CA");
}

type BreathResp = { ok?: boolean; count: number; done?: boolean; companionCount: number };

export function CobreatheOverlay({
  open,
  onClose,
  onSummary,
}: {
  open: boolean;
  // result.completed is true when the breath ran to the end (vs. backing out).
  onClose: (result?: { completed: boolean }) => void;
  // Fired the instant the breath completes and the summary appears. The host
  // (prayer-mode) advances the slideshow underneath here, so the next office
  // slide is already loaded behind the opaque overlay and the close is a smooth
  // fade onto a ready slide rather than a hard cut.
  onSummary?: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const day = localDay();
  const [phase, setPhase] = useState<"breathing" | "done">("breathing");
  const [resp, setResp] = useState<BreathResp | null>(null);
  // True once the user taps Continue — fades the overlay out onto the office
  // slide that onSummary already advanced to behind it.
  const [closing, setClosing] = useState(false);
  // This week's running breath tally (per-device), shown on the summary.
  const [weekBreaths, setWeekBreaths] = useState(0);
  const talliedRef = useRef(false);
  // Hold the screen on through the breath (no touch input to keep it awake).
  useKeepAwake(open && phase === "breathing");

  // The moment the summary appears, tell the host to advance the slideshow so
  // the next office slide loads behind the overlay (ready for the fade back).
  const onSummaryRef = useRef(onSummary);
  onSummaryRef.current = onSummary;
  useEffect(() => {
    if (phase !== "done") return;
    onSummaryRef.current?.();
    // Add this completed set to the week's breath tally, once.
    if (!talliedRef.current) { talliedRef.current = true; setWeekBreaths(addBreathsThisWeek(DEFAULT_TOTAL_BREATHS)); }
  }, [phase]);

  // The overlay stays mounted (prayer-mode toggles `open`), so reset to a fresh
  // breath each time it opens — otherwise reopening after a finished breath
  // lands straight on the stale "you cobreathed with N" done screen.
  const sitLoggedRef = useRef(false);
  useEffect(() => {
    if (open) { setPhase("breathing"); setResp(null); sitLoggedRef.current = false; setClosing(false); talliedRef.current = false; }
  }, [open]);

  // Log the breathed time as a contemplation sit — exactly once per open — so a
  // cobreathe from the prayer-mode pause lands in history/stats/Health whether
  // they complete the set or end early (>=30s).
  const logSit = useCallback((secondsKept: number) => {
    if (sitLoggedRef.current || secondsKept < 30) return;
    sitLoggedRef.current = true;
    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - secondsKept * 1000);
    void apiRequest("POST", "/api/prayer-sessions", {
      surface: "contemplation",
      source: "cobreathe",
      durationSeconds: secondsKept,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      isPrivate: false,
    })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-sessions"] });
      })
      .catch(() => { /* best-effort */ });
    void writeMindfulSession(startedAt, endedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Today's count, so "N breathing with you today" can show during the breath
  // even before this user has recorded theirs. Only fetched while open.
  const { data: today } = useQuery<BreathResp>({
    queryKey: ["/api/breath/today", day],
    queryFn: () => apiRequest("GET", `/api/breath/today?day=${day}`),
    enabled: open,
    staleTime: 30_000,
  });

  // 12 breaths kept — record the day's breath so the count climbs while they
  // keep breathing. Contemplation time is logged on finish.
  const handleReachTarget = useCallback((secondsKept: number) => {
    // Recompute the local day at call time — this overlay is mounted long
    // before the breath finishes, so a captured `day` could be yesterday's
    // (e.g. the breath crosses midnight).
    const d = localDay();
    void apiRequest<BreathResp>("POST", "/api/breath/today", { day: d, seconds: secondsKept })
      .then((r) => {
        setResp(r);
        queryClient.invalidateQueries({ queryKey: ["/api/breath/today", d] });
      })
      .catch(() => { /* best-effort — the breath still happened */ });
    // Completing the set logs the contemplation sit right away, even if they
    // never tap Finish.
    logSit(secondsKept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEnd = useCallback((secondsKept: number, reached: boolean) => {
    const d = localDay();
    // Log the sit on any end (>=30s, no-op if already logged at the target) —
    // even an early exit, which previously returned here recording nothing.
    logSit(secondsKept);
    if (!reached) { onClose(); return; }
    setPhase("done");
    // Completing the set records today's communal breath.
    void apiRequest<BreathResp>("POST", "/api/breath/today", { day: d, seconds: secondsKept })
      .then((r) => { setResp(r); queryClient.invalidateQueries({ queryKey: ["/api/breath/today", d] }); })
      .catch(() => { /* best-effort */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) return null;

  const liveState = resp ?? today ?? null;
  const liveOthers = Math.max(0, (liveState?.count ?? 0) - (liveState?.done ? 1 : 0));
  const others = Math.max(0, (resp?.count ?? 1) - 1);

  // While breathing, CobreatheBreath is itself a full-screen deep-blue
  // takeover — render it directly, no wrapper or header to peek around it.
  if (phase === "breathing") {
    return (
      <CobreatheBreath
        othersToday={liveOthers}
        todayCount={liveState?.count ?? 0}
        onReachTarget={handleReachTarget}
        onEnd={handleEnd}
      />
    );
  }

  return (
    <motion.div
      className="flex flex-col"
      initial={{ opacity: 1 }}
      animate={{ opacity: closing ? 0 : 1 }}
      transition={{ duration: 0.6, ease: "easeInOut" }}
      // The office slide underneath was already advanced (onSummary), so fading
      // to 0 reveals a ready slide — a smooth hand-off, no hard cut.
      onAnimationComplete={() => { if (closing) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "#0A1C14",
        paddingTop: "var(--safe-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        overflow: "hidden",
      }}
    >
      <AnimatedBackground base="#0A1C14" variant="pronounced" />
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 max-w-xl mx-auto relative">
        <div className="text-[46px] mb-3">🌍</div>
        {/* Breaths this session — the headline number. */}
        <h2 className="text-[2.1rem] font-bold leading-none mb-1.5" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
          {DEFAULT_TOTAL_BREATHS} {t("cobreathe.breaths_word", { defaultValue: "breaths" })}
        </h2>
        {/* Breaths so far this week, and who you breathed with today. */}
        <p className="text-[13px] tracking-wide mb-7" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
          {weekBreaths} {t("cobreathe.breaths_this_week", { defaultValue: "breaths this week" })}
          {others > 0 ? ` · ${t("cobreathe.summary_with_today", { defaultValue: `with ${others} ${others === 1 ? "other" : "others"} today` })}` : ""}
        </p>
        {/* Breathing with the planet + the climate-justice thanks. */}
        <p className="text-[16px] leading-relaxed mb-3" style={{ color: WARM, fontFamily: SERIF, fontStyle: "italic" }}>
          {t("cobreathe.summary_planet", { defaultValue: "One breath, drawn with the whole creation — the forests exhaling, the seas, every lung on the planet rising and falling as one." })}
        </p>
        <p className="text-[14px] leading-relaxed mb-9" style={{ color: SAGE, fontFamily: SERIF, fontStyle: "italic" }}>
          {t("cobreathe.summary_thanks", { defaultValue: "Thank you for praying for climate justice." })}
        </p>
        <button
          type="button"
          onClick={() => setClosing(true)}
          disabled={closing}
          className="rounded-xl py-3 px-8 active:scale-[0.98] transition-transform"
          style={{
            background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(140,195,160,0.5)",
            fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}
        >
          {t("common.continue", { defaultValue: "Continue" })}
        </button>
      </div>
    </motion.div>
  );
}
