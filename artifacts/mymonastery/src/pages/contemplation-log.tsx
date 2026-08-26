/**
 * Contemplation-Log — a simple standalone page for logging a sit prayed
 * away from the app. Owner: "have it be a pill that says Log Prayer Time...
 * goes not to the contemplation details page, but goes to its own simple
 * UI page where it's just a dropdown of how long and then when and then
 * add [the] time, and somewhere else below that, show the daily goal /
 * quota." Reached from the contemplation "begin" screen's own Log Prayer
 * Time pill (see contemplation.tsx).
 *
 * Reuses the SAME POST /api/me/contemplation-sessions endpoint the full
 * details page's own manual-log form already posts to (occurredAt +
 * durationSeconds) — this is a second, simpler front end onto the same
 * data, not a parallel logging mechanism.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { apiRequest } from "@/lib/queryClient";
import { attributeContemplationSit } from "@/lib/contemplationSideDone";
import { getSideContemplationExplicit } from "@/lib/officePrefs";
import { useRhythmState } from "@/hooks/useRhythmState";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const BG = "#091A10";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

const MINUTE_OPTIONS = [5, 10, 15, 20, 25, 30, 45, 60];

export default function ContemplationLogPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { contemplationMin, contemplationGoalMin } = useRhythmState();
  const [minutes, setMinutes] = useState(10);
  const [when, setWhen] = useState<"today" | "yesterday">("today");
  const [justLogged, setJustLogged] = useState(false);

  const explicitSide = (() => {
    try {
      const s = new URLSearchParams(window.location.search).get("side");
      return s === "morning" || s === "evening" ? s : null;
    } catch { return null; }
  })();

  const logMutation = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const occurredAt = when === "yesterday" ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
      await apiRequest("POST", "/api/me/contemplation-sessions", {
        durationSeconds: minutes * 60,
        occurredAt: occurredAt.toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-stats"] });
      // Only a TODAY entry should flip a side's card to kept — a logged
      // yesterday sit is history, not today's practice.
      if (when === "today") {
        const mSet = getSideContemplationExplicit("morning");
        const eSet = getSideContemplationExplicit("evening");
        attributeContemplationSit({
          explicitSide,
          // Explicit picks only — see contemplation.tsx's attributeSit note.
          activeSides: { morning: mSet === true, evening: eSet === true },
          kind: "silent",
        });
      }
      setJustLogged(true);
      setTimeout(() => setLocation("/"), 900);
    },
  });

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(46,107,64,0.12)",
    border: "1px solid rgba(46,107,64,0.4)",
    borderRadius: 12,
    padding: "13px 40px 13px 14px",
    color: WARM,
    fontSize: 16,
    fontFamily: SPACE_GROTESK,
    fontWeight: 600,
    outline: "none",
    colorScheme: "dark",
    appearance: "none",
    WebkitAppearance: "none",
  };

  return (
    <Layout>
      <div style={{ position: "relative", isolation: "isolate", minHeight: "100dvh" }}>
        <AnimatedBackground base={BG} variant="subtle" fadeTop />
        <div className="max-w-xl mx-auto w-full" style={{ /* Safe-area insets, not flat numbers: this is a full-height layer, so its
           padding measures from the very top of the display — notch included —
           and a flat value sits the panel under the status bar. Reported on the
           community rule-of-life screen ("the UI is too high"); these are the
           same declaration. Floored at the old values. */
        padding: "calc(var(--safe-top, 0px) + 8px) 4px 60px" }}>
          <p style={{ color: SAGE, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600, fontFamily: SPACE_GROTESK, margin: "0 0 4px" }}>
            🕯️ Contemplation
          </p>
          <h1 style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 28, fontWeight: 700, letterSpacing: "-0.01em", margin: "0 0 22px" }}>
            Log Prayer Time
          </h1>

          <p style={{ color: SAGE, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, fontFamily: SPACE_GROTESK, margin: "0 0 8px" }}>
            How long
          </p>
          <div style={{ position: "relative", marginBottom: 20 }}>
            <select
              value={String(minutes)}
              onChange={(e) => setMinutes(parseInt(e.target.value, 10))}
              aria-label="How long"
              style={fieldStyle}
            >
              {MINUTE_OPTIONS.map((m) => (
                <option key={m} value={String(m)}>{m} minutes</option>
              ))}
            </select>
            <span aria-hidden style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: SAGE, fontSize: 12, pointerEvents: "none" }}>▾</span>
          </div>

          <p style={{ color: SAGE, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, fontFamily: SPACE_GROTESK, margin: "0 0 8px" }}>
            When
          </p>
          <div style={{ position: "relative", marginBottom: 24 }}>
            <select
              value={when}
              onChange={(e) => setWhen(e.target.value as "today" | "yesterday")}
              aria-label="When"
              style={fieldStyle}
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
            </select>
            <span aria-hidden style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: SAGE, fontSize: 12, pointerEvents: "none" }}>▾</span>
          </div>

          <button
            type="button"
            onClick={() => logMutation.mutate()}
            disabled={logMutation.isPending || justLogged}
            className="w-full rounded-full text-center transition-opacity hover:opacity-90 active:scale-[0.99]"
            style={{ background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)", fontFamily: SPACE_GROTESK, fontSize: 16, fontWeight: 600, padding: 15, cursor: "pointer", opacity: logMutation.isPending || justLogged ? 0.6 : 1 }}
          >
            {justLogged ? "Logged ✓" : logMutation.isPending ? "Logging…" : "Add time"}
          </button>

          {/* Today's daily goal / quota — owner: "somewhere else below that,
              it's show the daily goal in the quota." */}
          <div style={{ marginTop: 32, padding: "16px 18px", borderRadius: 16, background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.22)" }}>
            <p style={{ color: SAGE, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, fontFamily: SPACE_GROTESK, margin: "0 0 6px" }}>
              Today's goal
            </p>
            <p style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 20, fontWeight: 700, margin: 0 }}>
              {contemplationMin} min
              {contemplationGoalMin > 0 && (
                <span style={{ color: SAGE, fontWeight: 500, fontSize: 15 }}> {" "}of {contemplationGoalMin} min goal</span>
              )}
            </p>
            {contemplationGoalMin > 0 && (
              <div
                aria-hidden
                style={{ marginTop: 12, height: 8, borderRadius: 999, background: "rgba(46,107,64,0.18)", overflow: "hidden" }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, Math.round((contemplationMin / contemplationGoalMin) * 100))}%`,
                    borderRadius: 999,
                    background: "rgba(110,180,130,0.85)",
                    transition: "width 0.3s ease-out",
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
