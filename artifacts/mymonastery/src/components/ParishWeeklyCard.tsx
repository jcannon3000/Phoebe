import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Parish Weekly Prayer List — beta home card.
//
// Shifts the unit of engagement from "amen tap" to "person in your
// parish prayed for at least once this week." Renders the people in
// the viewer's parish groups who have an active prayer request,
// split into:
//
//   1. Unprayed — viewer hasn't tapped amen on their request this
//      week (Sunday → Saturday in viewer's tz). Shown with name +
//      avatar; tapping the card opens the slideshow scoped to this
//      list.
//   2. Prayed — viewer already prayed for them this week. Surfaced
//      as a compact avatar stack at the bottom of the card so the
//      "you've held these people" feeling is visible.
//
// Empty state (everyone prayed): the card stays on the home screen
// with a quiet completion message ("You've held your parish this
// week 🌿") and the full avatar stack underneath. Never disappears —
// that was the whole point of bringing the weekly list back into
// permanent home-screen real estate alongside the office card.

type ParishEntry = {
  userId: number;
  name: string | null;
  avatarUrl: string | null;
  request: {
    id: number;
    body: string;
    isAnonymous: boolean;
    kind: string | null;
    expiresAt: string | null;
    createdAt: string;
  };
  prayedAt: string | null;
};

type ParishWeeklyData = {
  weekStartYmd: string;
  weekEndYmd: string;
  unprayed: ParishEntry[];
  prayed: ParishEntry[];
};

const FONT = "'Space Grotesk', sans-serif";

function AvatarStack({ entries, max = 6 }: { entries: ParishEntry[]; max?: number }) {
  const shown = entries.slice(0, max);
  const extra = entries.length - shown.length;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {shown.map((e) => (
          <div
            key={e.userId}
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold overflow-hidden shrink-0"
            style={{
              background: e.avatarUrl ? "transparent" : "rgba(46,107,64,0.35)",
              border: "1.5px solid #0F2818",
              color: "#F0EDE6",
              fontFamily: FONT,
            }}
            title={e.name ?? ""}
          >
            {e.avatarUrl ? (
              <img
                src={e.avatarUrl}
                alt={e.name ?? ""}
                className="w-full h-full object-cover"
              />
            ) : (
              (e.name ?? "?").slice(0, 1).toUpperCase()
            )}
          </div>
        ))}
      </div>
      {extra > 0 && (
        <span
          className="ml-2 text-[11px]"
          style={{ color: "rgba(143,175,150,0.75)", fontFamily: FONT }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

export function ParishWeeklyCard() {
  const { data, isLoading } = useQuery<ParishWeeklyData>({
    queryKey: ["/api/me/parish-weekly"],
    queryFn: () => apiRequest("GET", "/api/me/parish-weekly"),
    staleTime: 60_000,
  });

  // While loading, don't render anything (avoid layout shift). When
  // there's nobody in any of the viewer's parish groups with an
  // active request, the card stays hidden — the dashboard's Daily
  // Prayer card already covers the office side. The card's value is
  // proportional to having real people in it; an empty parish (zero
  // active requests across the whole group) reads as "no signal,"
  // not "you're done."
  const totalPeople = (data?.unprayed.length ?? 0) + (data?.prayed.length ?? 0);
  const allPrayed = useMemo(
    () => (data?.unprayed.length ?? 0) === 0 && totalPeople > 0,
    [data, totalPeople],
  );

  if (isLoading) return null;
  if (totalPeople === 0) return null;

  const next = data?.unprayed[0];

  return (
    <Link href="/prayer-mode?queue=parish-weekly">
      <div
        className="w-full rounded-2xl p-4 cursor-pointer transition-opacity hover:opacity-95"
        style={{
          background: allPrayed ? "rgba(46,107,64,0.10)" : "rgba(46,107,64,0.16)",
          border: `1px solid ${allPrayed ? "rgba(46,107,64,0.28)" : "rgba(46,107,64,0.4)"}`,
        }}
      >
        {/* Eyebrow + week range */}
        <div className="flex items-center justify-between mb-2">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT, margin: 0 }}
          >
            This week's prayer list 🌿
          </p>
          <span
            className="text-[10px] font-medium tabular-nums px-2 py-0.5 rounded-full"
            style={{
              background: "rgba(46,107,64,0.18)",
              color: "rgba(168,197,160,0.95)",
              border: "1px solid rgba(46,107,64,0.3)",
              fontFamily: FONT,
            }}
          >
            {(data?.prayed.length ?? 0)} / {totalPeople}
          </span>
        </div>

        {allPrayed ? (
          <>
            <p
              className="text-base font-semibold mb-1"
              style={{ color: "#F0EDE6", fontFamily: FONT }}
            >
              You've held your parish this week 🌿
            </p>
            <p
              className="text-[12px] mb-3"
              style={{ color: "rgba(143,175,150,0.85)", fontFamily: FONT, margin: 0 }}
            >
              Everyone with an active request has been carried.
            </p>
            <div className="mt-3">
              <AvatarStack entries={data?.prayed ?? []} max={10} />
            </div>
          </>
        ) : (
          <>
            <p
              className="text-base font-semibold mb-1"
              style={{ color: "#F0EDE6", fontFamily: FONT }}
            >
              {(data?.unprayed.length ?? 0) === 1
                ? `Pray for ${next?.name ?? "your parish"}`
                : `Pray for ${data?.unprayed.length ?? 0} people in your parish`}
            </p>
            <p
              className="text-[12px] mb-3"
              style={{ color: "rgba(143,175,150,0.85)", fontFamily: FONT, margin: 0 }}
            >
              {(data?.prayed.length ?? 0) === 0
                ? "Your community is asking your prayers."
                : `You've prayed for ${data?.prayed.length} so far this week.`}
            </p>
            {(data?.unprayed.length ?? 0) > 0 && (
              <div className="mt-3 flex items-center justify-between gap-3">
                <AvatarStack entries={data?.unprayed ?? []} max={6} />
                <span
                  className="text-[11px] font-semibold px-3 py-1.5 rounded-full shrink-0"
                  style={{
                    background: "rgba(46,107,64,0.35)",
                    color: "#C8D4C0",
                    border: "1px solid rgba(46,107,64,0.55)",
                    fontFamily: FONT,
                  }}
                >
                  Begin →
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </Link>
  );
}
