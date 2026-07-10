/**
 * "You prayed with 14 people this week" — the quiet line that shifts the frame
 * from praying FOR each other to praying WITH each other.
 *
 * Counts DISTINCT fellow community members with at least one practice signal
 * this week (any practice, any day — one thing a week is enough to count).
 * AGGREGATE ONLY, by design: the server never returns names or who was
 * missing, and this line never will. Presence, not attendance — the point is
 * "you weren't alone this week," not a register.
 *
 * Renders nothing for guests, for people with no communities, or when the
 * count is zero — it should only ever appear as good news.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { isDeviceLocalGuest } from "@/lib/guestFlag";
import { useBetaStatus } from "@/hooks/useDemo";

export function PrayedWithWeek() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const guest = isDeviceLocalGuest(user);
  const { rawIsBeta } = useBetaStatus();

  // SUNDAY BENEDICTION (beta): when the week turns, look back once — "last
  // week you prayed with N" — instead of showing the new week's near-zero.
  // Spoken as a blessing over the finished week, not a score for the new one.
  const isSunday = new Date().getDay() === 0;
  const benediction = rawIsBeta && isSunday;

  // This week's Sunday, local calendar (YYYY-MM-DD) — the same week the
  // practice logs stamp, so "this week" means the member's own lived week.
  // In benediction mode, LAST week's Sunday.
  const weekStart = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay());
    if (benediction) d.setDate(d.getDate() - 7);
    return d.toLocaleDateString("en-CA");
  }, [benediction]);

  const { data } = useQuery<{ count: number; viewerPracticed: boolean }>({
    queryKey: ["/api/me/prayed-with-week", weekStart],
    queryFn: () => apiRequest("GET", `/api/me/prayed-with-week?weekStart=${weekStart}`),
    enabled: !!user && !guest,
    staleTime: 5 * 60_000,
  });

  const count = data?.count ?? 0;
  if (!user || guest || count < 1) return null;

  const text = benediction
    ? (count === 1
        ? t("dashboard.prayed_with_last_one", { defaultValue: "Last week you prayed with 1 person" })
        : t("dashboard.prayed_with_last_n", { count, defaultValue: `Last week you prayed with ${count} people` }))
    : data?.viewerPracticed
    ? (count === 1
        ? t("dashboard.prayed_with_one", { defaultValue: "You prayed with 1 person this week" })
        : t("dashboard.prayed_with_n", { count, defaultValue: `You prayed with ${count} people this week` }))
    : (count === 1
        ? t("dashboard.community_prayed_one", { defaultValue: "1 person in your community prayed this week" })
        : t("dashboard.community_prayed_n", { count, defaultValue: `${count} people in your communities prayed this week` }));

  return (
    <p
      className="text-[13px] mt-1"
      style={{ color: "rgba(168,197,160,0.9)", fontFamily: "'Space Grotesk', sans-serif" }}
    >
      🕊️ {text}
    </p>
  );
}
