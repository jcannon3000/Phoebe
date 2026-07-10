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

export function PrayedWithWeek() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const guest = isDeviceLocalGuest(user);

  // This week's Sunday, local calendar (YYYY-MM-DD) — the same week the
  // practice logs stamp, so "this week" means the member's own lived week.
  const weekStart = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay());
    return d.toLocaleDateString("en-CA");
  }, []);

  const { data } = useQuery<{ count: number; viewerPracticed: boolean }>({
    queryKey: ["/api/me/prayed-with-week", weekStart],
    queryFn: () => apiRequest("GET", `/api/me/prayed-with-week?weekStart=${weekStart}`),
    enabled: !!user && !guest,
    staleTime: 5 * 60_000,
  });

  const count = data?.count ?? 0;
  if (!user || guest || count < 1) return null;

  const text = data?.viewerPracticed
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
