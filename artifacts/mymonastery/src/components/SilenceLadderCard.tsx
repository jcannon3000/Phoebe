// SilenceLadderCard — the "grow my silence" climb, shown wherever a user with
// the ladder ON should see their progress: the Contemplation page, the bottom
// of the daily-progress list, and the home screen. Self-fetching + self-gating:
// renders null unless the ladder is enabled, so callers just drop it in.
//
// Frosted glass (the app's canonical blur recipe) — NOT a flat green wash.
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type LadderResp = {
  enabled: boolean;
  level: number;        // this rung's minutes/day goal
  levelDays: number;    // counted (completed) days kept at this rung
  daysToNext: number;   // 7 − levelDays (server scores only completed days)
  nextLevel: number;
  atMax: boolean;
  todayMinutes: number;
  todayMet: boolean;
};

export function SilenceLadderCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const enabled = !!user?.silenceLadder?.enabled;
  const today = new Date().toLocaleDateString("en-CA");
  const { data: ladder } = useQuery<LadderResp>({
    queryKey: ["/api/me/silence-ladder", today],
    queryFn: () => apiRequest("GET", "/api/me/silence-ladder"),
    enabled,
    staleTime: 60_000,
  });
  if (!enabled || !ladder?.enabled) return null;

  // Today counts toward the week the instant it's met, even though the server
  // only scores it tomorrow — so the bar and the count feel live.
  const keptThisWeek = Math.min(7, ladder.levelDays + (ladder.todayMet ? 1 : 0));
  const daysLeft = Math.max(0, ladder.daysToNext - (ladder.todayMet ? 1 : 0));
  const caption = ladder.atMax
    ? t("contemplation.ladder_summit", { defaultValue: "You've reached 30 min — your summit 🌿" })
    : daysLeft <= 0
      ? t("contemplation.ladder_grows_tomorrow", { next: ladder.nextLevel, defaultValue: `Grows to ${ladder.nextLevel} min tomorrow 🌿` })
      : t("contemplation.ladder_days_to_next", { count: daysLeft, next: ladder.nextLevel, defaultValue: `${daysLeft} ${daysLeft === 1 ? "day" : "days"} to ${ladder.nextLevel} min` });

  return (
    <div
      className={`rounded-2xl p-4 ${className ?? "mt-4"}`}
      style={{
        // Canonical frosted-glass surface (same blur the cards/pills use).
        background: "rgba(9,26,16, 0.297)",
        backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
        border: "1px solid rgba(46,107,64,0.32)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold" style={{ color: WARM, fontFamily: FONT, margin: 0 }}>
          {t("contemplation.ladder_title", { defaultValue: "Growing your silence" })}
        </p>
        <span className="text-[12px] font-semibold" style={{ color: ladder.todayMet ? "#A8C5A0" : SAGE, fontFamily: FONT }}>
          {t("contemplation.ladder_rung", { level: ladder.level, defaultValue: `${ladder.level} min / day` })}
        </span>
      </div>
      {/* Week bar — seven segments; the kept days fill, the rest sit faint. */}
      <div className="flex items-center gap-1.5 mb-2.5" aria-hidden>
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex-1 rounded-full" style={{ height: 6, background: i < keptThisWeek ? "#6FAF85" : "rgba(46,107,64,0.22)", transition: "background 0.3s" }} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[12px]" style={{ color: SAGE, fontFamily: FONT, margin: 0 }}>{caption}</p>
        <p className="text-[12px]" style={{ color: ladder.todayMet ? "#A8C5A0" : SAGE, fontFamily: FONT, margin: 0 }}>
          {ladder.todayMet
            ? t("contemplation.ladder_kept_today", { defaultValue: "Kept today ✓" })
            : t("contemplation.ladder_today_progress", { done: ladder.todayMinutes, goal: ladder.level, defaultValue: `${ladder.todayMinutes} of ${ladder.level} min today` })}
        </p>
      </div>
    </div>
  );
}
