/**
 * "You prayed with 14 people this week" — the quiet line that shifts the frame
 * from praying FOR each other to praying WITH each other.
 *
 * Counts DISTINCT fellow community members with at least one practice signal
 * this week (any practice, any day — one thing a week is enough to count).
 * The headline count is aggregate-only (no names). The splash variant's face
 * row is the one deliberate exception (owner-requested, to match Creation
 * Prayer's closing slide) — and, per explicit owner instruction, it is NOT
 * held to the k-anonymity floor the per-group NAMING still uses: faces show
 * for the top group regardless of size, so in a small circle a face row can
 * by itself identify exactly who practiced. That's a known, requested
 * tradeoff, not an oversight.
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
import { CompanionFaces, type Companion } from "@/components/CompanionFaces";

export function PrayedWithWeek({ variant = "home" }: { variant?: "home" | "splash" } = {}) {
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

  const { data } = useQuery<{ count: number; viewerPracticed: boolean; groups?: Array<{ name: string; count: number }>; companions?: Companion[] }>({
    queryKey: ["/api/me/prayed-with-week", weekStart],
    queryFn: () => apiRequest("GET", `/api/me/prayed-with-week?weekStart=${weekStart}`),
    enabled: !!user && !guest,
    staleTime: 5 * 60_000,
  });

  const count = data?.count ?? 0;
  if (!user || guest || count < 1) return null;

  // The face row rides ABOVE whichever text line ends up rendering below —
  // named-group or the group-less fallback — since companions is no longer
  // tied to the group-naming floor (see the doc comment above).
  const companions = data?.companions ?? [];
  const faceRow = variant === "splash" && companions.length > 0 ? (
    <div className="mb-1.5">
      <CompanionFaces companions={companions} edgeColor="#0A1C14" />
    </div>
  ) : null;

  // SPLASH variant: name the community — "You prayed with 5 people from
  // St. Mark's" (the top community's own count, so the sentence stays true
  // for members of several). Falls back to the group-less copy below when
  // the server has no breakdown yet.
  const top = (data?.groups ?? [])[0];
  if (variant === "splash" && top && top.count > 0) {
    const gtext = benediction
      ? (top.count === 1
          ? t("dashboard.prayed_with_last_one_group", { name: top.name, defaultValue: `Last week you prayed with 1 person from ${top.name}` })
          : t("dashboard.prayed_with_last_n_group", { count: top.count, name: top.name, defaultValue: `Last week you prayed with ${top.count} people from ${top.name}` }))
      : data?.viewerPracticed
      ? (top.count === 1
          ? t("dashboard.prayed_with_one_group", { name: top.name, defaultValue: `You prayed with 1 person from ${top.name}` })
          : t("dashboard.prayed_with_n_group", { count: top.count, name: top.name, defaultValue: `You prayed with ${top.count} people from ${top.name}` }))
      : (top.count === 1
          ? t("dashboard.community_prayed_one_group", { name: top.name, defaultValue: `1 person from ${top.name} prayed this week` })
          : t("dashboard.community_prayed_n_group", { count: top.count, name: top.name, defaultValue: `${top.count} people from ${top.name} prayed this week` }));
    return (
      <div className="flex flex-col items-center mt-1">
        {faceRow}
        <p
          className="text-[13px]"
          style={{ color: "rgba(168,197,160,0.9)", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          🕊️ {gtext}
        </p>
      </div>
    );
  }

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

  const textLine = (
    <p
      className="text-[13px]"
      style={{ color: "rgba(168,197,160,0.9)", fontFamily: "'Space Grotesk', sans-serif" }}
    >
      🕊️ {text}
    </p>
  );
  // Only the splash variant ever has a face row (faceRow is null for
  // "home") — skip the extra wrapper div for home so its markup/alignment
  // stays exactly as it was.
  if (!faceRow) {
    return <div className="mt-1">{textLine}</div>;
  }
  return (
    <div className="flex flex-col items-center mt-1">
      {faceRow}
      {textLine}
    </div>
  );
}
