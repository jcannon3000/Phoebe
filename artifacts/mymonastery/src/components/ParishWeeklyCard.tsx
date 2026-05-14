import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Parish Weekly Prayer List — beta home card.
//
// One card, one rhythm: pray for each "thing your community is
// carrying this week" exactly once. Three sources merge in:
//
//   • Prayer requests from people in your groups (avatar = person)
//   • Community intercessions you're part of (emoji = group emoji)
//   • Today's prayer-feed entries (emoji = feed cover)
//
// Empty state (everyone/everything prayed): "You've held your parish
// this week 🌿" — card stays visible alongside the Office card so
// the weekly rhythm doesn't quietly vanish on a quiet day.

type ParishWeeklyEntry =
  | {
      kind: "request";
      id: string;
      title: string;
      subtitle: string | null;
      avatarUrl: string | null;
      emoji: string | null;
      prayedAt: string | null;
      userId: number;
      request: {
        id: number;
        body: string;
        isAnonymous: boolean;
        kind: string | null;
        expiresAt: string | null;
        createdAt: string;
      };
    }
  | {
      kind: "intercession";
      id: string;
      title: string;
      subtitle: string | null;
      avatarUrl: string | null;
      emoji: string | null;
      prayedAt: string | null;
      intercession: {
        momentId: number;
        momentToken: string | null;
      };
    }
  | {
      kind: "feed-entry";
      id: string;
      title: string;
      subtitle: string | null;
      avatarUrl: string | null;
      emoji: string | null;
      prayedAt: string | null;
      feedEntry: {
        entryId: number;
        feedId: number;
        feedSlug: string;
        feedTitle: string;
        feedCoverEmoji: string | null;
      };
    };

type ParishWeeklyData = {
  weekStartYmd: string;
  weekEndYmd: string;
  unprayed: ParishWeeklyEntry[];
  prayed: ParishWeeklyEntry[];
};

const FONT = "'Space Grotesk', sans-serif";

function EntryAvatar({ entry, size = 28 }: { entry: ParishWeeklyEntry; size?: number }) {
  if (entry.avatarUrl) {
    return (
      <div
        className="rounded-full overflow-hidden shrink-0"
        style={{
          width: size,
          height: size,
          border: "1.5px solid #0F2818",
          background: "rgba(46,107,64,0.35)",
        }}
        title={entry.title}
      >
        <img src={entry.avatarUrl} alt={entry.title} className="w-full h-full object-cover" />
      </div>
    );
  }
  // Emoji or initial fallback. Emoji wins (intercession/feed); request
  // entries without an avatar fall back to the first letter of the
  // person's name.
  const initial = entry.emoji ?? (entry.title?.slice(0, 1).toUpperCase() ?? "?");
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        background: "rgba(46,107,64,0.35)",
        border: "1.5px solid #0F2818",
        color: "#F0EDE6",
        fontFamily: FONT,
        fontSize: entry.emoji ? Math.floor(size * 0.55) : Math.floor(size * 0.4),
        fontWeight: 600,
      }}
      title={entry.title}
    >
      {initial}
    </div>
  );
}

// Small "View" pill placed in the top-right of the card. The outer
// card is a Link to /prayer-mode, so this button uses stopPropagation
// + preventDefault to suppress that and route to /prayer-list instead.
function ViewPill() {
  const [, setLocation] = useLocation();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setLocation("/prayer-list");
      }}
      className="text-[11px] font-semibold px-2.5 py-1 rounded-full text-center shrink-0 transition-opacity hover:opacity-80"
      style={{
        background: "rgba(46,107,64,0.22)",
        color: "#A8C5A0",
        border: "1px solid rgba(46,107,64,0.4)",
        fontFamily: FONT,
        cursor: "pointer",
      }}
    >
      View
    </button>
  );
}

function AvatarStack({ entries, max = 6 }: { entries: ParishWeeklyEntry[]; max?: number }) {
  // Dedupe by author so a peer with multiple active requests shows
  // once in the avatar row instead of twice. We key on the request
  // userId for request entries; intercessions + feed-entries have
  // no person attached so we fall back to the entry id (their
  // visual identity is the moment/feed itself, not a face).
  const seenKeys = new Set<string>();
  const unique: ParishWeeklyEntry[] = [];
  for (const e of entries) {
    const key = e.kind === "request" ? `u-${e.userId}` : `e-${e.id}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    unique.push(e);
  }
  const shown = unique.slice(0, max);
  const extra = unique.length - shown.length;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {shown.map((e) => (
          <EntryAvatar key={e.id} entry={e} />
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

  const totalEntries = (data?.unprayed.length ?? 0) + (data?.prayed.length ?? 0);
  const allPrayed = useMemo(
    () => (data?.unprayed.length ?? 0) === 0 && totalEntries > 0,
    [data, totalEntries],
  );

  if (isLoading) return null;
  // Empty parish/feeds → hide the card. "No signal" rather than "you're done."
  if (totalEntries === 0) return null;

  const next = data?.unprayed[0];

  // Headline copy varies by composition of the unprayed list:
  //   • All from one person → "Pray for {name}"  (subtitle counts)
  //   • Two people, requests only → "Pray for {A} and {B}"
  //   • Three people, requests only → "Pray for {A}, {B}, and {C}"
  //   • More than three OR mixed sources → "N prayers waiting this week"
  const unprayedRequestsOnly = (data?.unprayed ?? []).every(e => e.kind === "request");
  // First-name list, deduped, preserving order of first appearance.
  // Used by both headline + subtitle to name who's waiting.
  const unprayedRequesterFirstNames = (() => {
    const seen = new Set<number>();
    const names: string[] = [];
    for (const e of data?.unprayed ?? []) {
      if (e.kind !== "request") continue;
      if (seen.has(e.userId)) continue;
      seen.add(e.userId);
      names.push(e.title.split(/\s+/)[0] || e.title);
    }
    return names;
  })();
  const unprayedSingleOwner =
    unprayedRequestsOnly && unprayedRequesterFirstNames.length === 1;
  function joinList(names: string[]): string {
    if (names.length === 0) return "";
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  }
  const headline = (() => {
    if (allPrayed) return "You've held your community this week 🌿";
    const n = data?.unprayed.length ?? 0;
    if (unprayedSingleOwner && next?.kind === "request") {
      return `Pray for ${next.title}`;
    }
    if (
      unprayedRequestsOnly &&
      unprayedRequesterFirstNames.length >= 2 &&
      unprayedRequesterFirstNames.length <= 3
    ) {
      return `Pray for ${joinList(unprayedRequesterFirstNames)}`;
    }
    return `${n} ${n === 1 ? "prayer" : "prayers"} waiting this week`;
  })();

  return (
    <Link href="/prayer-mode?queue=parish-weekly">
      <div
        className="w-full rounded-2xl px-4 py-3 cursor-pointer transition-opacity hover:opacity-95 relative"
        style={{
          background: allPrayed ? "rgba(46,107,64,0.10)" : "rgba(46,107,64,0.16)",
          border: `1px solid ${allPrayed ? "rgba(46,107,64,0.28)" : "rgba(46,107,64,0.4)"}`,
        }}
      >
        {/* Right-side pills stacked vertically, absolutely positioned
            so their height doesn't stretch the eyebrow row and push
            the headline down. Mirrors the eyebrow→headline tightness
            of the office card below it. */}
        <div className="absolute top-3 right-3 flex flex-col items-end gap-1 shrink-0">
          {/* Pills sized to match the office card below it — same
              text-[11px] semibold, px-2.5 py-1 padding, sage-tinted
              fill + border — so the two cards read as a paired
              header set. */}
          <span
            className="text-[11px] font-semibold tabular-nums px-2.5 py-1 rounded-full text-center"
            style={{
              background: "rgba(46,107,64,0.22)",
              color: "#A8C5A0",
              border: "1px solid rgba(46,107,64,0.4)",
              fontFamily: FONT,
            }}
          >
            {(data?.prayed.length ?? 0)} / {totalEntries}
          </span>
          {/* View pill — bypasses the card-wide tap target (which
              opens prayer-mode) and routes to the manage prayer list
              page instead. stopPropagation + preventDefault keep
              the outer Link from firing on the same click. */}
          <ViewPill />
        </div>

        <div className="mb-0.5 pr-16">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT, margin: 0 }}
          >
            This week's prayer list 🌿
          </p>
        </div>

        {allPrayed ? (
          <>
            <p
              className="text-base font-semibold mb-0.5"
              style={{ color: "#F0EDE6", fontFamily: FONT }}
            >
              {headline}
            </p>
            <p
              className="text-[12px] mb-2"
              style={{ color: "rgba(143,175,150,0.85)", fontFamily: FONT, margin: 0 }}
            >
              Everything your community is carrying has been prayed for.
            </p>
            <div className="mt-3">
              <AvatarStack entries={data?.prayed ?? []} max={10} />
            </div>
          </>
        ) : (
          <>
            <p
              className="text-base font-semibold mb-0.5"
              style={{ color: "#F0EDE6", fontFamily: FONT }}
            >
              {headline}
            </p>
            <p
              className="text-[12px] mb-2"
              style={{ color: "rgba(143,175,150,0.85)", fontFamily: FONT, margin: 0 }}
            >
              {(() => {
                const n = data?.unprayed.length ?? 0;
                // Single owner — even if they posted multiple requests
                // this week — gets the named-person framing so the
                // subtitle reads as a continuation of the headline.
                if (unprayedSingleOwner && next?.kind === "request") {
                  const firstName = next.title.split(/\s+/)[0] || next.title;
                  if (n === 1) {
                    return `${firstName} has a new prayer this week you haven't prayed for yet.`;
                  }
                  return `${firstName} has ${n} new prayers this week you haven't prayed for yet.`;
                }
                // 2–3 named requesters echo the headline ("Pray for
                // Anabelle and Test" → "Anabelle and Test have new
                // prayers this week…"). Mention the total prayer
                // count so a person with multiple requests doesn't
                // get under-represented.
                if (
                  unprayedRequestsOnly &&
                  unprayedRequesterFirstNames.length >= 2 &&
                  unprayedRequesterFirstNames.length <= 3
                ) {
                  const joined = joinList(unprayedRequesterFirstNames);
                  return `${joined} have ${n} new ${n === 1 ? "prayer" : "prayers"} this week you haven't prayed for yet.`;
                }
                if (n > 1) {
                  return `${n} new prayers this week you haven't prayed for yet.`;
                }
                return "Your community is asking your prayers.";
              })()}
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
