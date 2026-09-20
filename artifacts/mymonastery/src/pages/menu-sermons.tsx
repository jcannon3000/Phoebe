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
// A TAP PLAYS THE NEWEST SERMON — by id (?ep=<id>), because a sermon feed
// also carries things that are not sermons and the newest ITEM may be one of
// them. It opens that church's show page, the same door the audio library
// uses, so playback, the
// listening history, the resume position and the per-show trims all behave
// exactly as they do everywhere else (the cathedral's 22-second sign-on trim
// among them), and the rest of that church's sermons are on the page behind
// the player.
//
// PREVIOUS, the commentaries' affordance: the last SEVEN sermons, newest
// first, each opening in the same player (?ep=<id>). It lives in two places,
// neither of them a pill on a row: at the TOP RIGHT here, where the owner
// first asked for it, opening the list for the church you last played from
// (the cathedral until you have played one) — and on the PLAYER'S own bottom
// right once a sermon is playing (components/PodcastPlayer), which is where
// the owner moved it: "the previous should not be here but on the bottom
// right of the player".
//
// WHO PREACHED is shown where the feed says so (the server's sermonMeta:
// `preacher`, null rather than guessed), in the row and in Previous.
//
// A CHURCH THAT HASN'T PREACHED LATELY STILL LISTS, and says so rather than
// playing something months old: over 90 days since its newest sermon shows
// the date instead, and the tap opens the list without starting anything.
//
// AND A FEED WE CANNOT READ SAYS THAT INSTEAD — "We couldn't reach their feed
// just now". An unreadable feed and an empty one look identical from here,
// and left unsaid the row claims the church has never preached, which is a
// thing about somebody else's ministry that we have no business implying
// (2026-09-19, when SSJE's feed stopped being fetchable from the deploy).

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
  /**
   * From the show's sermonMeta parsing (api-server, 0d3184f4): who preached,
   * null where the feed doesn't say — never guessed — and whether the episode
   * IS a sermon. `sermon: false` marks the things that sit in a sermon feed
   * without being one: a two-minute Prayer for the Day, a vigil, a panel.
   */
  preacher?: string | null;
  sermon?: boolean;
};

type ShowResponse = { show?: { title?: string }; episodes?: Episode[]; unavailable?: boolean };

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

  /**
   * One feed read per church, for the newest sermon and the Previous list —
   * and only as deep as those need. Asking for the whole feed pulled about
   * 400 KB across five churches to draw five one-line rows (2026-09-19);
   * ?limit= serves the newest few from the same cache the show page fills,
   * so opening a church is still warm and the page is a tenth of the weight.
   * Three times PREVIOUS_COUNT, so a church whose recent posts include a
   * vigil, an ordination or a Prayer for the Day still has eight SERMONS left
   * once the non-sermons are filtered out.
   */
  const feeds = useQueries({
    queries: sources.map((s) => ({
      queryKey: [`/api/podcasts/show/${s.slug}`, "recent"],
      queryFn: () => apiRequest("GET", `/api/podcasts/show/${s.slug}?limit=${PREVIOUS_COUNT * 3}`) as Promise<ShowResponse>,
      staleTime: 15 * 60_000,
    })),
  });
  const episodesFor = (slug: string): Episode[] => {
    const i = sources.findIndex((s) => s.slug === slug);
    return (i >= 0 ? feeds[i]?.data?.episodes : undefined) ?? [];
  };
  /**
   * COULD NOT READ IT, as against read it and found nothing. The server says
   * which (ParsedFeed.unavailable). SSJE's feed cannot be fetched from the
   * deploy at the moment, and with nothing said the row read as a church that
   * has never preached — the one thing a list of churches must not imply.
   */
  const unreadable = (slug: string): boolean => {
    const i = sources.findIndex((s) => s.slug === slug);
    const q = i >= 0 ? feeds[i] : undefined;
    return !!q?.data?.unavailable || (!!q?.isError && !q?.data);
  };
  /**
   * SERMONS ONLY. A sermon feed carries other things — the cathedral's
   * Prayer for the Day sits at index 3 — and "play the newest" must not hand
   * someone a two-minute BBC slot or a 92-minute panel. `sermon: false` is the
   * server's own mark (0d3184f4); an episode without the field counts as one,
   * which is every show that has no sermonMeta.
   */
  const sermonsFor = (slug: string): Episode[] => episodesFor(slug).filter((e) => e.sermon !== false);

  /** The church's page, with nothing playing — for a feed we can't read. */
  const openShow = (slug: string) => {
    try { localStorage.setItem(LAST_CHURCH_KEY, slug); } catch { /* private mode */ }
    setLocation(`/podcasts/show/${slug}`);
  };
  const playEpisode = (slug: string, id: string) => {
    try { localStorage.setItem(LAST_CHURCH_KEY, slug); } catch { /* private mode */ }
    setLocation(`/podcasts/show/${slug}?ep=${encodeURIComponent(id)}`);
  };

  const items = sources.map((s) => {
    const ep = sermonsFor(s.slug)[0];
    const age = daysSince(ep?.publishedAt);
    const fresh = !!ep?.audioUrl && age !== null && age <= STALE_DAYS;
    const said = when(ep?.publishedAt);
    const sub = fresh
      ? [ep?.title?.trim() || "Latest sermon", ep?.preacher?.trim() || null, said].filter(Boolean).join(" · ")
      : ep
        ? `No sermon since ${said ?? "a while ago"}`
        : unreadable(s.slug)
          ? "We couldn't reach their feed just now"
          : s.about ?? "";
    return {
      emoji: "🎙️",
      label: s.title,
      sub: sub || s.about || "",
      // No Previous pill here: earlier sermons belong on the player, at its
      // bottom right, where you are already listening (owner, 2026-09-19:
      // "The previous should not be here but on the bottom right of the
      // player"). The row plays, and nothing else.

      // The newest SERMON by id, not ?play=latest: "latest" is the feed's
      // newest item, which at the cathedral can be a two-minute Prayer for the
      // Day. Same player, same trims, same history — just the right episode.
      onClick: () => (fresh && ep?.id ? playEpisode(s.slug, ep.id) : openShow(s.slug)),
    };
  });

  /** The top-right Previous: the church last played from here, else the first. */
  const openTopPrevious = () => {
    let last: string | null = null;
    try { last = localStorage.getItem(LAST_CHURCH_KEY); } catch { /* private mode */ }
    const church = sources.find((s) => s.slug === last) ?? sources[0];
    if (church) setPreviousFor(church);
  };

  const previousEpisodes = previousFor ? sermonsFor(previousFor.slug).slice(0, PREVIOUS_COUNT) : [];

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
                    {[ep.preacher?.trim() || null, when(ep.publishedAt)].filter(Boolean).join(" · ")}
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
