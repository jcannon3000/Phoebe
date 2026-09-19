import { useState } from "react";
import { useLocation } from "wouter";
import { useQueries, useQuery } from "@tanstack/react-query";
import { MenuHub } from "@/components/MenuHub";
import { apiRequest } from "@/lib/queryClient";

// ── /menu/sermons — the churches you can hear preaching from ────────────────
//
// Owner, 2026-09-19: "What if we make a sermons page from the menu" · "And it
// would show churches to listen to them from" · "And if you click on one it
// would play the most recent sermon" · "Do national cathedral" (Washington
// National Cathedral leads) · "And then at the top right can we have a
// previous button for the past 7 weeks like the commentaries".
//
// ONE ROW PER CHURCH, not per episode: where it is, and what it last preached.
// The list comes from the server's own PUBLISHERS "sermons" group (GET
// /api/podcasts/sermon-sources), so a church added to the library shows up
// here too rather than in a second hand-kept list.
//
// A TAP PLAYS THE NEWEST SERMON. It opens that church's show page with
// ?play=latest — the same door the audio library uses — so playback, the
// listening history, the resume position and the per-show trims all behave
// exactly as they do everywhere else (the cathedral's 22-second sign-on trim
// among them), and the rest of that church's sermons are on the page behind
// the player.
//
// PREVIOUS, the commentaries' affordance: the last SEVEN sermons, newest
// first, each opening in the same player (?ep=<id>). It is in two places
// because a page of churches has no single "previous" of its own: on each row
// (the church you are looking at) and at the TOP RIGHT, where the owner asked
// for it, which opens the list for the church you last played from here —
// the first church, the cathedral, until you have played one.
//
// A CHURCH THAT HASN'T PREACHED LATELY STILL LISTS, and says so rather than
// playing something months old: over 90 days since its newest sermon (or a
// feed we can't read) shows the date instead, and the tap opens the list
// without starting anything.

const STALE_DAYS = 90;
const PREVIOUS_COUNT = 7;
const LAST_CHURCH_KEY = "phoebe:sermons:last-church";

const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.85)";
const FAINT = "rgba(143,175,150,0.55)";
const BORDER = "rgba(46,107,64,0.38)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type SermonSource = {
  slug: string;
  title: string;
  showTitle: string;
  artwork: string | null;
  about: string | null;
};

type Episode = {
  id: string;
  title: string | null;
  publishedAt: string | null;
  audioUrl: string | null;
  author?: string | null;
};

type ShowResponse = { show?: { title?: string }; episodes?: Episode[] };

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 86_400_000;
}

/** Plain, because the date is the point: "today", "3 days ago", "March 2". */
function when(iso: string | null | undefined): string | null {
  const d = daysSince(iso);
  if (d === null) return null;
  if (d < 1) return "today";
  if (d < 2) return "yesterday";
  if (d < 14) return `${Math.round(d)} days ago`;
  try {
    return new Date(iso!).toLocaleDateString(undefined, { month: "long", day: "numeric" });
  } catch {
    return null;
  }
}

export default function MenuSermonsPage() {
  const [, setLocation] = useLocation();
  /** Which church's Previous list is open, if any. */
  const [previousFor, setPreviousFor] = useState<SermonSource | null>(null);

  const { data, isLoading } = useQuery<{ sources: SermonSource[] }>({
    queryKey: ["/api/podcasts/sermon-sources"],
    queryFn: () => apiRequest("GET", "/api/podcasts/sermon-sources"),
    staleTime: 60 * 60_000,
  });
  const sources = data?.sources ?? [];

  // One feed read per church, for the newest sermon and the Previous list.
  // The same query key the show page uses, so opening a church is warm.
  const feeds = useQueries({
    queries: sources.map((s) => ({
      queryKey: [`/api/podcasts/show/${s.slug}`],
      queryFn: () => apiRequest("GET", `/api/podcasts/show/${s.slug}`) as Promise<ShowResponse>,
      staleTime: 15 * 60_000,
    })),
  });
  const episodesFor = (slug: string): Episode[] => {
    const i = sources.findIndex((s) => s.slug === slug);
    return (i >= 0 ? feeds[i]?.data?.episodes : undefined) ?? [];
  };

  const play = (slug: string, latest: boolean) => {
    try { localStorage.setItem(LAST_CHURCH_KEY, slug); } catch { /* private mode */ }
    setLocation(latest ? `/podcasts/show/${slug}?play=latest` : `/podcasts/show/${slug}`);
  };
  const playEpisode = (slug: string, id: string) => {
    try { localStorage.setItem(LAST_CHURCH_KEY, slug); } catch { /* private mode */ }
    setLocation(`/podcasts/show/${slug}?ep=${encodeURIComponent(id)}`);
  };

  const items = sources.map((s) => {
    const ep = episodesFor(s.slug)[0];
    const age = daysSince(ep?.publishedAt);
    const fresh = !!ep?.audioUrl && age !== null && age <= STALE_DAYS;
    const said = when(ep?.publishedAt);
    const sub = fresh
      ? [ep?.title?.trim() || "Latest sermon", said].filter(Boolean).join(" · ")
      : ep
        ? `No sermon since ${said ?? "a while ago"}`
        : s.about ?? "";
    return {
      emoji: "🎙️",
      label: s.title,
      sub: sub || s.about || "",
      // The row plays; its own Previous opens the last seven.
      actions: episodesFor(s.slug).length > 1
        ? [{ emoji: "🕘", label: "Previous", variant: "gold" as const, onClick: () => setPreviousFor(s) }]
        : undefined,
      onClick: () => play(s.slug, fresh),
    };
  });

  /** The top-right Previous: the church last played from here, else the first. */
  const openTopPrevious = () => {
    let last: string | null = null;
    try { last = localStorage.getItem(LAST_CHURCH_KEY); } catch { /* private mode */ }
    const church = sources.find((s) => s.slug === last) ?? sources[0];
    if (church) setPreviousFor(church);
  };

  const previousEpisodes = previousFor ? episodesFor(previousFor.slug).slice(0, PREVIOUS_COUNT) : [];

  return (
    <>
      <MenuHub
        title="Sermons"
        emoji="🎙️"
        subtitle={isLoading ? "Churches you can hear preaching from." : "Tap a church to hear its newest sermon."}
        backLabel="Menu"
        backHref="/menu"
        titleAction={sources.length > 0 ? (
          <button
            type="button"
            onClick={openTopPrevious}
            style={{
              background: "rgba(240,237,230,0.06)", border: `1px solid ${BORDER}`,
              color: SAGE, fontFamily: FONT, fontSize: 12.5, fontWeight: 600,
              borderRadius: 999, padding: "7px 14px", cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            Previous
          </button>
        ) : undefined}
        groups={[{ items }]}
      />

      {/* The last seven, newest first — the commentaries' Previous, for audio. */}
      {previousFor && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Previous sermons from ${previousFor.title}`}
          onClick={() => setPreviousFor(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(4,14,8,0.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full"
            style={{
              maxWidth: 460, maxHeight: "calc(var(--app-dvh, 100dvh) - 80px)", display: "flex", flexDirection: "column",
              borderRadius: 18, padding: 18, boxSizing: "border-box",
              background: "rgba(9,26,16,0.96)", border: `1px solid ${BORDER}`,
            }}
          >
            <p style={{ color: WARM, fontFamily: FONT, fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>
              {previousFor.title}
            </p>
            <p style={{ color: FAINT, fontFamily: FONT, fontSize: 12, margin: "0 0 14px" }}>
              The last {Math.min(PREVIOUS_COUNT, previousEpisodes.length)} sermons.
            </p>
            <div className="flex flex-col gap-2" style={{ overflowY: "auto", minHeight: 0 }}>
              {previousEpisodes.map((ep) => (
                <button
                  key={ep.id}
                  type="button"
                  disabled={!ep.audioUrl}
                  onClick={() => { setPreviousFor(null); playEpisode(previousFor.slug, ep.id); }}
                  style={{
                    flex: "0 0 auto", textAlign: "left", borderRadius: 12, padding: "11px 13px",
                    cursor: ep.audioUrl ? "pointer" : "default", opacity: ep.audioUrl ? 1 : 0.5,
                    background: "rgba(240,237,230,0.05)", border: `1px solid ${BORDER}`,
                  }}
                >
                  <span style={{ display: "block", color: WARM, fontFamily: FONT, fontSize: 14.5, lineHeight: 1.3 }}>
                    {ep.title ?? "Sermon"}
                  </span>
                  <span style={{ display: "block", color: FAINT, fontFamily: FONT, fontSize: 11.5, marginTop: 3 }}>
                    {[ep.author?.trim() || null, when(ep.publishedAt)].filter(Boolean).join(" · ")}
                  </span>
                </button>
              ))}
              {previousEpisodes.length === 0 && (
                <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, textAlign: "center", padding: "18px 0" }}>
                  Nothing older to show yet.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPreviousFor(null)}
              className="w-full rounded-full text-center transition-opacity hover:opacity-90 active:scale-[0.99] mt-4"
              style={{
                flex: "0 0 auto", background: "rgba(46,107,64,0.45)", border: "1px solid rgba(143,175,150,0.55)",
                color: WARM, fontFamily: FONT, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "12px 10px",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
