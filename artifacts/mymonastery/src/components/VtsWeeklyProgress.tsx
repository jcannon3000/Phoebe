/**
 * "VTS Weekly Progress" — a 5-day (Mon-Fri) dot grid for the three
 * VTS-feed-gated practices: the Dean's Commentary, Community Meal, and
 * Chapel. Only rendered for viewers subscribed to the VTS feed (owner:
 * "only show up if you are subscribed to the VTS Feed") — the caller gates
 * on entitlements.vts before mounting this.
 *
 * A rolling 7-day window (what /api/me/practice-week returns) always
 * contains exactly 5 weekdays and 2 weekend days, so filtering that window
 * down to weekday ymds gives exactly 5 columns without needing a separate
 * server route — same data WayOfLoveTurnLearnPray reads, same query key,
 * so mounting both on one page costs one fetch, not two.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useRhythmState } from "@/hooks/useRhythmState";
import { hasReadVtsToday } from "@/lib/cacReadState";
import type { PracticeWeekDay } from "@/lib/weeklyGrid";
import { ROUTINE_SYNCED_EVENT } from "@/lib/routineSync";

const FONT = "'Space Grotesk', system-ui, sans-serif";

const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F"];

// Settings → Home display AND the customizer's "weekly cards" step both
// expose an on/off toggle for this card, stored under the same key
// settings.tsx writes (HIDE_VTS_WEEKLY_KEY there). Defaults SHOWN for
// subscribers — owner: "the VTS default on for subscribers" (unlike the
// main Weekly Progress card, which defaults off). Unset or "0" reads as
// shown; only an explicit "1" (turned off) hides the card.
const HIDE_KEY = "phoebe:hide-vts-weekly";
function readHidden(): boolean {
  try { return localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; }
}
function useHiddenPref(): boolean {
  const [hidden, setHidden] = useState(readHidden);
  useEffect(() => {
    const onChange = () => setHidden(readHidden());
    window.addEventListener("phoebe:prefs-changed", onChange);
    // The cross-device sync (routineSync.ts) writes this key into
    // localStorage on app boot / login, AFTER this component has often
    // already mounted and read the stale pre-sync value into its
    // useState initializer — without this listener the card stayed
    // hidden on web until a second reload (owner: "still not showing on
    // web but showing on my phone").
    window.addEventListener(ROUTINE_SYNCED_EVENT, onChange);
    return () => {
      window.removeEventListener("phoebe:prefs-changed", onChange);
      window.removeEventListener(ROUTINE_SYNCED_EVENT, onChange);
    };
  }, []);
  return hidden;
}

export function VtsWeeklyProgress() {
  const rhythm = useRhythmState();
  const hidden = useHiddenPref();
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();
  const { data: week } = useQuery<{ days: PracticeWeekDay[] }>({
    queryKey: ["/api/me/practice-week", tz],
    queryFn: () => apiRequest("GET", `/api/me/practice-week?tz=${encodeURIComponent(tz)}`),
    staleTime: 60_000,
  });

  if (!rhythm.ready || hidden) return null;

  const todayYmd = new Date().toLocaleDateString("en-CA");
  // Weekday-only slice of the rolling 7-day window, oldest first.
  const weekdayDays = (week?.days ?? []).filter((d) => {
    const wd = new Date(`${d.ymd}T12:00:00`).getDay();
    return wd >= 1 && wd <= 5;
  });
  // Always render exactly 5 columns even before the fetch resolves, so the
  // card never flashes a shorter grid — placeholder ymds are simply blank
  // (never "today") until real data lands.
  const cols = Array.from({ length: 5 }, (_, i) => weekdayDays[i] ?? null);

  const rows: Array<{ emoji: string; label: string; todayDone: boolean; historyFor: (d: PracticeWeekDay) => boolean }> = [
    { emoji: "🗞️", label: "Dean's Commentary", todayDone: hasReadVtsToday(), historyFor: (d) => d.vts },
    { emoji: "🍽️", label: "Community Meal", todayDone: rhythm.communityMealDone, historyFor: (d) => d.communityMeal },
    { emoji: "🙏🏽", label: "Chapel", todayDone: rhythm.chapelDone, historyFor: (d) => d.chapel },
  ];

  const KEPT_RGB = "110,180,130";

  return (
    <div className="mt-7">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
        <p
          className="text-center text-[11px] font-semibold uppercase tracking-widest flex-shrink-0"
          style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}
        >
          This Week at VTS
        </p>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
      </div>
      <div
        className="rounded-3xl px-4 pt-4"
        style={{ background: "rgba(46,107,64,0.07)", border: "1px solid rgba(200,212,192,0.35)", paddingBottom: 20 }}
      >
        {(() => {
          const COLS = "28px repeat(5, 1fr)";
          return (
            <div style={{ display: "grid", rowGap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: COLS, alignItems: "center" }}>
                <div />
                {cols.map((d, i) => (
                  <span
                    key={i}
                    className="text-center text-[10.5px] font-semibold"
                    style={{ color: d?.ymd === todayYmd ? "rgba(240,237,230,0.7)" : "rgba(143,175,150,0.45)", fontFamily: FONT }}
                  >
                    {WEEKDAY_INITIALS[i]}
                  </span>
                ))}
              </div>
              {rows.map((r) => (
                <div key={r.label} style={{ display: "grid", gridTemplateColumns: COLS, alignItems: "center" }}>
                  <span className="text-center text-[11px]" style={{ fontFamily: FONT }} title={r.label}>
                    {r.emoji}
                  </span>
                  {cols.map((d, i) => {
                    const kept = d ? (d.ymd === todayYmd ? r.todayDone : r.historyFor(d)) : false;
                    return (
                      <span key={i} className="flex justify-center">
                        <span
                          title={d ? `${r.label} · ${d.ymd}` : r.label}
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 999,
                            background: kept ? `rgba(${KEPT_RGB},0.85)` : "transparent",
                            border: kept ? "none" : "1px solid rgba(143,175,150,0.28)",
                          }}
                        />
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
