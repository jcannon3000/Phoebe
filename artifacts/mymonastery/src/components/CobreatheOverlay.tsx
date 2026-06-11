import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { writeMindfulSession } from "@/lib/appleHealth";
import { CobreatheBreath } from "@/components/CobreatheBreath";

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
}: {
  open: boolean;
  // result.completed is true when the breath ran to the end (vs. backing out).
  onClose: (result?: { completed: boolean }) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const day = localDay();
  const [phase, setPhase] = useState<"breathing" | "done">("breathing");
  const [resp, setResp] = useState<BreathResp | null>(null);

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
    void apiRequest<BreathResp>("POST", "/api/breath/today", { day, seconds: secondsKept })
      .then((r) => {
        setResp(r);
        queryClient.invalidateQueries({ queryKey: ["/api/breath/today", day] });
      })
      .catch(() => { /* best-effort — the breath still happened */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEnd = useCallback((secondsKept: number, reached: boolean) => {
    if (!reached) { onClose(); return; }
    setPhase("done");
    // Record (idempotent) in case reach didn't fire, then log the sit.
    void apiRequest<BreathResp>("POST", "/api/breath/today", { day, seconds: secondsKept })
      .then((r) => { setResp(r); queryClient.invalidateQueries({ queryKey: ["/api/breath/today", day] }); })
      .catch(() => { /* best-effort */ });
    if (secondsKept >= 5) {
      const endedAt = new Date();
      const startedAt = new Date(endedAt.getTime() - secondsKept * 1000);
      void apiRequest("POST", "/api/prayer-sessions", {
        surface: "contemplation",
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
    }
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
        onReachTarget={handleReachTarget}
        onEnd={handleEnd}
      />
    );
  }

  return (
    <div
      className="flex flex-col"
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "radial-gradient(circle at 50% 42%, #0E2A1E 0%, #0A1C14 55%, #06120C 100%)",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {(
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 max-w-xl mx-auto">
          <div className="text-5xl mb-5">🌬️</div>
          <h2 className="text-[1.4rem] font-bold mb-3" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
            {!resp
              ? t("cobreathe.done_counting", { defaultValue: "Breath held" })
              : others === 0
                ? t("cobreathe.done_first", { defaultValue: "You are the first breath today" })
                : t("cobreathe.done_with", { count: others, defaultValue: `You cobreathed with ${others} other ${others === 1 ? "person" : "people"}` })}
          </h2>
          <p className="text-[14px] leading-relaxed mb-8" style={{ color: SAGE, fontFamily: SERIF, fontStyle: "italic" }}>
            {others === 0 && resp
              ? t("cobreathe.done_first_sub", { defaultValue: "Others will join their breath to yours as the day goes on." })
              : t("cobreathe.done_sub", { defaultValue: "Not at the same hour — but one body, one breath, held across the day." })}
          </p>
          <button
            type="button"
            onClick={() => onClose({ completed: true })}
            className="rounded-xl py-3 px-8"
            style={{
              background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)",
              fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >
            {t("common.continue", { defaultValue: "Continue" })}
          </button>
        </div>
      )}
    </div>
  );
}
