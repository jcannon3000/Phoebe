import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CobreatheBreath, DEFAULT_TOTAL_BREATHS, CYCLE_MS } from "@/components/CobreatheBreath";
import { CobreatheSummary } from "@/components/CobreatheSummary";
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

function localDay(): string {
  return new Date().toLocaleDateString("en-CA");
}

type BreathResp = { ok?: boolean; count: number; done?: boolean; companionCount: number };

export function CobreatheOverlay({
  open,
  onClose,
  onSummary,
  immediateClose = false,
}: {
  open: boolean;
  // result.completed is true when the breath ran to the end (vs. backing out).
  onClose: (result?: { completed: boolean }) => void;
  // Fired the instant the breath completes and the summary appears. The host
  // (prayer-mode) advances the slideshow underneath here, so the next office
  // slide is already loaded behind the opaque overlay and the close is a smooth
  // fade onto a ready slide rather than a hard cut.
  onSummary?: () => void;
  // When the host's "Continue" hand-off is a route change (seamless office
  // flow → setLocation), there's nothing behind this overlay to fade ONTO —
  // the whole view (this overlay included) unmounts. A fade-then-close would
  // briefly reveal the slide underneath; close instantly instead so the host
  // can navigate straight from the summary. Default keeps the smooth fade.
  immediateClose?: boolean;
}) {
  const queryClient = useQueryClient();
  const day = localDay();
  const [phase, setPhase] = useState<"breathing" | "done">("breathing");
  const [resp, setResp] = useState<BreathResp | null>(null);
  // True once the user taps Continue — fades the overlay out onto the office
  // slide that onSummary already advanced to behind it.
  const [closing, setClosing] = useState(false);
  // Keeps the breath screen mounted UNDER the summary through the
  // breathing→done hand-off, so the summary cross-fades in over it (a dissolve,
  // not a hard cut). Flipped off once the summary has fully faded in.
  const [breathVisible, setBreathVisible] = useState(true);
  // This week's running breath tally (per-device), shown on the summary.
  const [weekBreaths, setWeekBreaths] = useState(0);
  // Actual breaths taken this sit (open-ended — can exceed 12). Drives the
  // summary headline + the week tally, so the slideshow close matches the
  // /cobreathe page close (both show the REAL count, not a hardcoded 12).
  const [breathsTaken, setBreathsTaken] = useState(DEFAULT_TOTAL_BREATHS);
  const breathsTakenRef = useRef(DEFAULT_TOTAL_BREATHS);
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
    // Add this completed set to the week's breath tally, once — using the REAL
    // breaths taken (not a hardcoded 12), so the tally matches the page.
    if (!talliedRef.current) { talliedRef.current = true; setWeekBreaths(addBreathsThisWeek(breathsTakenRef.current)); }
  }, [phase]);

  // The overlay stays mounted (prayer-mode toggles `open`), so reset to a fresh
  // breath each time it opens — otherwise reopening after a finished breath
  // lands straight on the stale "you cobreathed with N" done screen.
  const sitLoggedRef = useRef(false);
  useEffect(() => {
    if (open) { setPhase("breathing"); setResp(null); sitLoggedRef.current = false; setClosing(false); talliedRef.current = false; setBreathVisible(true); setBreathsTaken(DEFAULT_TOTAL_BREATHS); breathsTakenRef.current = DEFAULT_TOTAL_BREATHS; }
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
    // A breath only COUNTS when the set is completed (the 12th breath
    // reached). An early exit records nothing — no contemplation sit, nothing
    // toward the daily goal or history.
    if (!reached) { onClose(); return; }
    logSit(secondsKept);
    // The actual breaths taken (one per CYCLE_MS), floored at the 12 target —
    // same derivation the /cobreathe page uses, so both closes show the real count.
    const taken = Math.max(DEFAULT_TOTAL_BREATHS, Math.round(secondsKept / (CYCLE_MS / 1000)));
    breathsTakenRef.current = taken;
    setBreathsTaken(taken);
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
  // The breath stays mounted (same position) through breathing→done so the
  // summary can cross-fade IN over it — a dissolve, not a hard cut. Once the
  // summary has faded in (onEntered) the breath unmounts. On Continue the
  // summary fades to 0, revealing the office slide onSummary advanced behind it.
  return (
    <>
      {breathVisible && (
        <CobreatheBreath
          othersToday={liveOthers}
          todayCount={liveState?.count ?? 0}
          onReachTarget={handleReachTarget}
          onEnd={handleEnd}
        />
      )}
      {phase === "done" && (
        <CobreatheSummary
          breathsTaken={breathsTaken}
          weekBreaths={weekBreaths}
          others={others}
          continueDisabled={closing}
          fadeIn
          fadeOut={closing}
          onEntered={() => setBreathVisible(false)}
          onFadeOutComplete={() => onClose()}
          onContinue={() => { if (immediateClose) onClose({ completed: true }); else setClosing(true); }}
        />
      )}
    </>
  );
}
