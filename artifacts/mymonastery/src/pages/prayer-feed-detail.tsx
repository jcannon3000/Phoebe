import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

// Subscriber detail page for a Prayer Feed. Three intentions per day —
// each gets its own card with its own "Pray 🙏🏽" button and roster, and
// the page shows a 7-day calendar grid so subscribers can see what's
// coming this week. Past days collapse into a back-issues list.
//
// The same URL works for the creator — if `isCreator` is true we
// surface a "Manage" button so they can hop into the calendar editor.

type FeedState = "draft" | "live" | "paused";
type EntryState = "draft" | "scheduled" | "published";

interface Feed {
  id: number;
  slug: string;
  title: string;
  tagline: string | null;
  coverEmoji: string | null;
  coverImageUrl: string | null;
  creatorUserId: number;
  timezone: string;
  state: FeedState;
  subscriberCount: number;
}

interface Entry {
  id: number;
  feedId: number;
  entryDate: string;
  // 1, 2, or 3. Position within the day. Server-side default is 1 so
  // legacy single-slot rows keep working.
  slot: number;
  title: string;
  body: string;
  scriptureRef: string | null;
  imageUrl: string | null;
  state: EntryState;
  prayCount: number;
}

interface PrayerRow {
  name: string | null;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
}

interface FeedResponse {
  feed: Feed;
  isCreator: boolean;
  isSubscribed: boolean;
}

const SLOT_LABELS: Record<number, string> = {
  1: "First",
  2: "Second",
  3: "Third",
};
const SLOTS = [1, 2, 3] as const;

function todayInZone(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function prettyDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  });
}
function shortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}
function dayOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
}

export default function PrayerFeedDetailPage() {
  const { user, isLoading: authLoading } = useAuth();
  // rawIsBeta + isLoading guard avoids the refresh-bounce-to-
  // dashboard race (unresolved beta-status query → isBeta false →
  // redirect before data lands).
  const { rawIsBeta, isLoading: betaLoading } = useBetaStatus();
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [showBackIssues, setShowBackIssues] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
    if (!authLoading && !betaLoading && user && !rawIsBeta) setLocation("/dashboard");
    // (Removed phoebe-climate → /climate redirect: /climate already
    // redirects back here, which produced an infinite redirect loop
    // and the white "something went wrong" error page when the user
    // tapped the climate card. The 3-slot prayer-feed rollout means
    // this detail page now renders real content for phoebe-climate.)
  }, [user, authLoading, betaLoading, rawIsBeta, setLocation, slug]);

  // ── Feed + entries window ──────────────────────────────────────────────
  const feedQ = useQuery<FeedResponse>({
    queryKey: [`/api/prayer-feeds/${slug}`],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${slug}`),
    enabled: !!user && !!slug,
  });
  const feed = feedQ.data?.feed ?? null;
  const tz = feed?.timezone ?? "America/New_York";
  const today = feed ? todayInZone(tz) : null;

  // Pull a generous window so we can render today + the next 6 days +
  // back issues without making three separate queries.
  const entriesQ = useQuery<{ entries: Entry[] }>({
    queryKey: [`/api/prayer-feeds/${slug}/entries`, "subscriber"],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${slug}/entries`),
    enabled: !!feed,
  });
  const entries = entriesQ.data?.entries ?? [];

  // Group entries by date so the calendar can render each day's three
  // slot cards in O(1). Within a date we also keep an ordered slot map.
  const bySlot = useMemo(() => {
    const m = new Map<string, Entry>();
    for (const e of entries) m.set(`${e.entryDate}|${e.slot}`, e);
    return m;
  }, [entries]);
  const slotKey = (date: string, slot: number) => `${date}|${slot}`;

  // Today's entries — sort by slot ascending so cards stack First /
  // Second / Third in the order admins programmed them.
  const todayEntries: Entry[] = useMemo(() => {
    if (!today) return [];
    return entries
      .filter(e => e.entryDate === today && e.state === "published")
      .sort((a, b) => a.slot - b.slot);
  }, [entries, today]);

  // Back issues — flat list, newest first, three rows per past day.
  const backIssues = useMemo(() => {
    if (!today) return [];
    return entries
      .filter(e => e.entryDate < today && e.state === "published")
      .sort((a, b) => {
        const cmp = b.entryDate.localeCompare(a.entryDate);
        return cmp !== 0 ? cmp : a.slot - b.slot;
      });
  }, [entries, today]);

  // ── Today's prayer roster — one query per slot. ────────────────────────
  // Each slot has its own pray-count and roster server-side, so we
  // fan out one fetch per published slot. Three small parallel queries
  // is cheap and keeps slot state independent on the client.
  const slotsForRoster = todayEntries.map(e => e.slot);
  const slot1RosterQ = useQuery<{ prayers: PrayerRow[]; prayCount: number }>({
    queryKey: [`/api/prayer-feeds/${slug}/entries/${today}/prayers`, 1],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${slug}/entries/${today}/prayers?slot=1`),
    enabled: !!feed && !!today && slotsForRoster.includes(1),
  });
  const slot2RosterQ = useQuery<{ prayers: PrayerRow[]; prayCount: number }>({
    queryKey: [`/api/prayer-feeds/${slug}/entries/${today}/prayers`, 2],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${slug}/entries/${today}/prayers?slot=2`),
    enabled: !!feed && !!today && slotsForRoster.includes(2),
  });
  const slot3RosterQ = useQuery<{ prayers: PrayerRow[]; prayCount: number }>({
    queryKey: [`/api/prayer-feeds/${slug}/entries/${today}/prayers`, 3],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${slug}/entries/${today}/prayers?slot=3`),
    enabled: !!feed && !!today && slotsForRoster.includes(3),
  });
  const rosterBySlot: Record<number, { prayers: PrayerRow[]; prayCount: number } | undefined> = {
    1: slot1RosterQ.data,
    2: slot2RosterQ.data,
    3: slot3RosterQ.data,
  };

  // ── Mutations ──────────────────────────────────────────────────────────
  const subscribe = useMutation({
    mutationFn: () => apiRequest("POST", `/api/prayer-feeds/${slug}/subscribe`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}`] }),
  });
  const unsubscribe = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/prayer-feeds/${slug}/subscribe`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}`] }),
  });
  const pray = useMutation({
    mutationFn: (slot: number) =>
      apiRequest("POST", `/api/prayer-feeds/${slug}/entries/${today}/pray?slot=${slot}`, {}),
    onSuccess: (_data, slot) => {
      qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/entries`, "subscriber"] });
      qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/entries/${today}/prayers`, slot] });
    },
  });

  // ── Render ─────────────────────────────────────────────────────────────
  if (authLoading || !user || feedQ.isLoading) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto w-full py-12 text-sm" style={{ color: "#8FAF96" }}>Loading…</div>
      </Layout>
    );
  }
  if (!feed) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto w-full py-12 text-sm" style={{ color: "#8FAF96" }}>
          This feed isn't available.
        </div>
      </Layout>
    );
  }

  const isCreator = feedQ.data?.isCreator ?? false;
  const isSubscribed = feedQ.data?.isSubscribed ?? false;
  const userEmail = (user as any).email?.toLowerCase?.() ?? "";

  // 7-day calendar window: today + 6 upcoming days. Each day surfaces
  // up to 3 slot rows with their published title or a soft placeholder.
  const calendarDays: string[] = [];
  if (today) for (let i = 0; i < 7; i++) calendarDays.push(addDays(today, i));

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full">
        <button
          onClick={() => setLocation("/dashboard")}
          className="text-xs mb-4 flex items-center gap-1 transition-opacity hover:opacity-70"
          style={{ color: "#8FAF96" }}
        >
          ← Back
        </button>

        {/* Feed header */}
        <div className="flex items-start gap-3 mb-4">
          <div
            className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0"
            style={{ background: "rgba(62,124,122,0.18)", border: "1px solid rgba(62,124,122,0.35)" }}
          >
            {feed.coverEmoji ?? "🕊️"}
          </div>
          <div className="flex-1 min-w-0">
            <h1
              className="text-xl font-bold leading-tight"
              style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {feed.title}
            </h1>
            {feed.tagline && (
              <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>{feed.tagline}</p>
            )}
            <p className="text-[11px] mt-1" style={{ color: "rgba(143,175,150,0.6)" }}>
              {feed.subscriberCount} praying along
            </p>
          </div>
          {isCreator && (
            <Link href={`/prayer-feeds/${slug}/manage`}>
              <span
                className="text-[11px] font-semibold px-3 py-1.5 rounded-full cursor-pointer transition-opacity hover:opacity-85"
                style={{ background: "rgba(62,124,122,0.2)", border: "1px solid rgba(62,124,122,0.4)", color: "#F0EDE6" }}
              >
                Manage
              </span>
            </Link>
          )}
        </div>

        {/* Subscribe row */}
        {!isCreator && (
          <div className="mb-6">
            {isSubscribed ? (
              <button
                onClick={() => unsubscribe.mutate()}
                disabled={unsubscribe.isPending}
                className="text-[11px] font-semibold px-3 py-1.5 rounded-full transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.2)", color: "#8FAF96" }}
              >
                ✓ Subscribed · tap to unsubscribe
              </button>
            ) : (
              <button
                onClick={() => subscribe.mutate()}
                disabled={subscribe.isPending || feed.state !== "live"}
                className="text-sm font-semibold px-5 py-2.5 rounded-full transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "#3E7C7A", color: "#F0EDE6" }}
              >
                {feed.state === "live" ? "Subscribe" : "Coming soon"}
              </button>
            )}
          </div>
        )}

        {/* The big "Today" card with a Pray button used to live here.
            Per user direction this page is now a pure schedule view —
            praying happens in the slideshow, so a duplicate Pray
            affordance + "N prayed today" count was redundant. The
            This-week list below already shows today's filled slots
            (highlighted) so the schedule remains glanceable.
            (rosterBySlot / pray mutation / didIPrayToday are still
            referenced by the back-issues block below for read-only
            "X prayed" counts on archived days.) */}

        {/* This-week calendar — 7 days × 3 slots. Today is highlighted,
            other days show the title for any slots that have been
            published or scheduled (so subscribers can see what's
            coming). Empty slots are silent. */}
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,212,192,0.45)" }}>
          This week
        </p>
        <div className="space-y-3 mb-6">
          {calendarDays.map((dateStr, di) => {
            const isToday = dateStr === today;
            const filledSlots = SLOTS.filter(s => bySlot.has(slotKey(dateStr, s)));
            return (
              <div
                key={dateStr}
                className="rounded-2xl px-4 py-3"
                style={{
                  background: isToday ? "rgba(62,124,122,0.12)" : "rgba(46,107,64,0.05)",
                  border: `1px solid ${isToday ? "rgba(62,124,122,0.35)" : "rgba(46,107,64,0.15)"}`,
                }}
              >
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: isToday ? "#C8D4C0" : "rgba(143,175,150,0.7)" }}>
                    {isToday ? "Today" : di === 1 ? "Tomorrow" : dayOfWeek(dateStr)}
                    <span className="ml-2 font-normal" style={{ color: "rgba(143,175,150,0.5)" }}>
                      {shortDate(dateStr)}
                    </span>
                  </p>
                  {filledSlots.length === 0 && (
                    <p className="text-[11px] italic" style={{ color: "rgba(143,175,150,0.5)" }}>
                      Not yet programmed
                    </p>
                  )}
                </div>
                {filledSlots.length > 0 && (
                  <div className="space-y-1">
                    {SLOTS.map(slot => {
                      const e = bySlot.get(slotKey(dateStr, slot));
                      if (!e) return null;
                      const isPublished = e.state === "published";
                      return (
                        <div
                          key={slot}
                          className="flex items-center gap-3 py-1"
                        >
                          <span
                            className="text-[10px] font-semibold uppercase tracking-widest w-14 flex-shrink-0"
                            style={{ color: "rgba(143,175,150,0.55)" }}
                          >
                            {SLOT_LABELS[slot]}
                          </span>
                          <span
                            className="text-sm flex-1 min-w-0 truncate"
                            style={{ color: isPublished ? "#F0EDE6" : "rgba(240,237,230,0.6)" }}
                          >
                            {e.title}
                          </span>
                          {!isPublished && (
                            <span className="text-[10px] uppercase tracking-widest flex-shrink-0" style={{ color: "rgba(143,175,150,0.5)" }}>
                              {e.state}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Back issues — flat past-slot list, newest first. */}
        {backIssues.length > 0 && (
          <div>
            <button
              onClick={() => setShowBackIssues(v => !v)}
              className="text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5 transition-opacity hover:opacity-70"
              style={{ color: "rgba(200,212,192,0.45)" }}
            >
              <span>{showBackIssues ? "▾" : "▸"}</span>
              <span>Back issues · {backIssues.length}</span>
            </button>
            {showBackIssues && (
              <div className="space-y-2">
                {backIssues.slice(0, 60).map(e => (
                  <div
                    key={`${e.entryDate}-${e.slot}`}
                    className="rounded-xl px-4 py-3"
                    style={{ background: "rgba(62,124,122,0.06)", border: "1px solid rgba(62,124,122,0.15)" }}
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-0.5">
                      <p className="text-[11px] font-medium" style={{ color: "rgba(143,175,150,0.7)" }}>
                        {shortDate(e.entryDate)}
                        <span className="ml-2" style={{ color: "rgba(143,175,150,0.5)" }}>
                          {SLOT_LABELS[e.slot] ?? `#${e.slot}`}
                        </span>
                      </p>
                      <p className="text-[11px]" style={{ color: "rgba(143,175,150,0.6)" }}>
                        {e.prayCount} prayed
                      </p>
                    </div>
                    <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>{e.title}</p>
                    {e.body && (
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: "rgba(240,237,230,0.7)" }}>
                        {e.body}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
