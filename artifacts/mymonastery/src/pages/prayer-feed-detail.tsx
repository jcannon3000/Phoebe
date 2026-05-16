import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { openExternal } from "@/lib/openExternal";
import { motion, AnimatePresence } from "framer-motion";

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
  // Optional outbound link — surfaced as a "Learn more →" / "Take
  // action →" pill on the slide overlay (and the prayer slideshow).
  learnMoreUrl: string | null;
  // "custom" (a written prayer) | "action" (a prayer + a CTA link).
  source: "custom" | "action";
  // Whether the current viewer has already prayed this entry. Only
  // meaningful for concrete entries; synthetic recurring rows are false.
  prayedByMe: boolean;
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

// A feed intercession — a shared_moments row scoped to this feed.
// Rendered as a card linking to its /moments/:id detail page.
interface FeedIntercession {
  id: number;
  name: string;
  intention: string | null;
  intercessionTopic: string | null;
  intercessionFullText: string | null;
  intercessionSource: string | null;
  learnMoreUrl: string | null;
  state: string;
  createdAt: string;
}

const SLOT_LABELS: Record<number, string> = {
  1: "First",
  2: "Second",
  3: "Third",
  4: "Fourth",
  5: "Fifth",
  6: "Sixth",
  7: "Seventh",
};
const SLOTS = [1, 2, 3, 4, 5, 6, 7] as const;

// Recurring template — same shape as the manage page. The detail
// page renders these on every matching day in the visible week so
// subscribers see "Mon · The Dams in Michigan" instead of "Not yet
// programmed" when there's a daily/weekly template that fires.
type RecurringEntry = {
  id: number;
  slot: number;
  recurrenceKind: "daily" | "weekly";
  weekdaysMask: number;
  title: string;
  body: string;
  learnMoreUrl: string | null;
  source: "custom" | "action";
  state: "draft" | "live";
};

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
  // The slide walker — tapping a card opens a one-slide deck; "Pray
  // the full list" opens a deck of the whole week. null = closed.
  const [slideshow, setSlideshow] = useState<{ deck: Entry[]; index: number } | null>(null);
  // Today's slides auto-log a "pray" as the walker reaches them; this
  // tracks which slots already fired so we don't double-POST.
  const prayedSlotsRef = useRef<Set<number>>(new Set());

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

  // Feed intercessions — shared_moments scoped to this feed. These are
  // the new primary content (cards + /moments/:id detail pages); the
  // date-anchored entries below are legacy.
  const intercessionsQ = useQuery<{ intercessions: FeedIntercession[] }>({
    queryKey: [`/api/prayer-feeds/${slug}/intercessions`],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${slug}/intercessions`),
    enabled: !!feed,
  });
  const feedIntercessions = intercessionsQ.data?.intercessions ?? [];

  // Recurring templates that fire across the visible week. Without
  // this query the This-week list only shows concrete entries; days
  // backed only by a recurring template render as "Not yet programmed"
  // even though subscribers will get an intercession on those days.
  const recurringQ = useQuery<{ recurring: RecurringEntry[] }>({
    queryKey: [`/api/prayer-feeds/${slug}/recurring`],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${slug}/recurring`),
    enabled: !!feed,
  });
  const recurringEntries: RecurringEntry[] = recurringQ.data?.recurring ?? [];

  // Group entries by (date, slot). Concrete entries from the entries
  // table win; recurring templates fill empty cells on every matching
  // weekday in the next-7-day window. Templates render as a synthetic
  // Entry-shaped row keyed on the template's id so the existing
  // calendar render code keeps working without a discriminated union.
  const bySlot = useMemo(() => {
    const m = new Map<string, Entry>();
    if (today) {
      // Cover today + 6 upcoming days. Same window the calendar
      // render walks below — keeps the bySlot map and the visible
      // grid in sync.
      for (let i = 0; i < 7; i++) {
        const dateStr = addDays(today, i);
        const utc = new Date(`${dateStr}T12:00:00Z`);
        const weekdayBit = 1 << utc.getUTCDay();
        for (const t of recurringEntries) {
          if (t.state !== "live") continue;
          if ((t.weekdaysMask & weekdayBit) === 0) continue;
          m.set(`${dateStr}|${t.slot}`, {
            id: t.id,
            feedId: 0,
            entryDate: dateStr,
            slot: t.slot,
            title: t.title,
            body: t.body,
            scriptureRef: null,
            imageUrl: null,
            learnMoreUrl: t.learnMoreUrl,
            source: t.source ?? "custom",
            prayedByMe: false,
            state: "published",
            prayCount: 0,
          });
        }
      }
    }
    for (const e of entries) m.set(`${e.entryDate}|${e.slot}`, e);
    return m;
  }, [entries, recurringEntries, today]);
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

  // The whole visible week as one ordered deck (day, then slot) — what
  // the "Pray the full list" slideshow walks. Published rows only;
  // recurring templates surface here as published synthetic entries.
  const weekEntries: Entry[] = useMemo(() => {
    if (!today) return [];
    const out: Entry[] = [];
    for (let i = 0; i < 7; i++) {
      const dateStr = addDays(today, i);
      for (const s of SLOTS) {
        const e = bySlot.get(`${dateStr}|${s}`);
        if (e && e.state === "published") out.push(e);
      }
    }
    return out;
  }, [bySlot, today]);
  // Prayers the viewer hasn't prayed yet — drives the top "waiting" box.
  const unprayedCount = weekEntries.filter((e) => !e.prayedByMe).length;

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

  // Auto-log a "pray" when the walker reaches today's slide(s). The
  // pray endpoint only accepts today's entries, so future-day slides
  // are walked read-only. Idempotent server-side; the ref guard just
  // avoids redundant POSTs.
  useEffect(() => {
    if (!slideshow || !today) return;
    const cur = slideshow.deck[slideshow.index];
    if (!cur || cur.entryDate !== today || cur.state !== "published") return;
    if (prayedSlotsRef.current.has(cur.slot)) return;
    prayedSlotsRef.current.add(cur.slot);
    pray.mutate(cur.slot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideshow, today]);

  function openSlideshow(deck: Entry[], index: number) {
    if (deck.length === 0) return;
    setSlideshow({ deck, index: Math.max(0, Math.min(index, deck.length - 1)) });
  }

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

        {/* Pray-with-this-feed box — surfaces how many of this week's
            prayers are still waiting, and carries the always-present
            wide "Pray the full list" CTA. Modeled on the home screen's
            prayer-list card. */}
        {weekEntries.length > 0 && (
          <div
            className="mb-6 rounded-2xl overflow-hidden flex"
            style={{
              background: "rgba(46,107,64,0.15)",
              border: "1px solid rgba(46,107,64,0.45)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
            }}
          >
            <div className="w-1 flex-shrink-0" style={{ background: "#2E6B40" }} />
            <div className="flex-1 px-4 py-3.5 min-w-0">
              <p className="text-base font-semibold" style={{ color: "#F0EDE6" }}>
                🕯️ Pray with {feed.title}
              </p>
              <p className="text-sm mt-0.5 mb-3" style={{ color: "#8FAF96" }}>
                {unprayedCount > 0
                  ? `${unprayedCount} ${unprayedCount === 1 ? "prayer is" : "prayers are"} waiting for you this week.`
                  : "You've prayed every intention this week. 🌿"}
              </p>
              <button
                type="button"
                onClick={() => openSlideshow(weekEntries, 0)}
                className="w-full text-sm font-semibold rounded-full py-2.5 transition-opacity hover:opacity-90"
                style={{ background: "#2E6B40", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                🕯️ Pray the full list →
              </button>
            </div>
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

        {/* Prayers — feed intercessions, each a card linking to its
            /moments/:id detail page. The primary content of a feed. */}
        {feedIntercessions.length > 0 && (
          <div className="mb-6">
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,212,192,0.45)" }}>
              Prayers
            </p>
            <div className="space-y-2">
              {feedIntercessions.map((it) => {
                const isAction = it.intercessionSource === "action";
                return (
                  <Link key={it.id} href={`/moments/${it.id}`}>
                    <div
                      className="rounded-2xl px-4 py-3 cursor-pointer transition-opacity hover:opacity-90"
                      style={{ background: "rgba(62,124,122,0.12)", border: "1px solid rgba(62,124,122,0.3)" }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-snug" style={{ color: "#F0EDE6" }}>
                            {it.intention || it.name}
                          </p>
                          {it.intercessionFullText && (
                            <p
                              className="text-[12px] mt-1 leading-snug"
                              style={{
                                color: "rgba(143,175,150,0.8)",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {it.intercessionFullText}
                            </p>
                          )}
                        </div>
                        {isAction && (
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                            style={{
                              background: "rgba(46,107,64,0.3)",
                              color: "#C8D4C0",
                              border: "1px solid rgba(46,107,64,0.5)",
                            }}
                          >
                            🌍 Action
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* This week — each day is its own section: a day header
            followed by a card per programmed prayer (instead of bare
            title text). The week scrolls inside a clamped ~3.5-row
            window with a bottom fade, so subscribers can see there's
            more of the week below — same pattern as the dashboard. */}
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,212,192,0.45)" }}>
          This week
        </p>
        <div className="relative mb-6">
          <div
            className="pr-1"
            style={{
              maxHeight: 380,
              overflowY: "auto",
              scrollbarWidth: "none",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {calendarDays.map((dateStr, di) => {
              const isToday = dateStr === today;
              const filledSlots = SLOTS.filter(s => bySlot.has(slotKey(dateStr, s)));
              return (
                <div key={dateStr} className="mb-4">
                  {/* Day section header */}
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <p
                      className="text-[11px] font-semibold uppercase tracking-widest"
                      style={{ color: isToday ? "#C8D4C0" : "rgba(143,175,150,0.7)" }}
                    >
                      {isToday ? "Today" : di === 1 ? "Tomorrow" : dayOfWeek(dateStr)}
                    </p>
                    <span className="text-[11px]" style={{ color: "rgba(143,175,150,0.45)" }}>
                      {shortDate(dateStr)}
                    </span>
                  </div>

                  {filledSlots.length === 0 ? (
                    // Soft placeholder card so an unprogrammed day
                    // still has a visual home in the card rhythm.
                    <div
                      className="rounded-2xl px-4 py-3"
                      style={{ background: "rgba(46,107,64,0.05)", border: "1px solid rgba(46,107,64,0.13)" }}
                    >
                      <p className="text-[12px] italic" style={{ color: "rgba(143,175,150,0.45)" }}>
                        Not yet programmed
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {SLOTS.map(slot => {
                        const e = bySlot.get(slotKey(dateStr, slot));
                        if (!e) return null;
                        const isPublished = e.state === "published";
                        // Slot label dropped — subscribers don't think
                        // in "First / Second slot," they just see the
                        // intercessions on the day. Each one is now its
                        // own card with a body preview.
                        return (
                          <div
                            key={slot}
                            role="button"
                            tabIndex={0}
                            onClick={() => openSlideshow([e], 0)}
                            onKeyDown={(ev) => {
                              if (ev.key === "Enter" || ev.key === " ") {
                                ev.preventDefault();
                                openSlideshow([e], 0);
                              }
                            }}
                            className="rounded-2xl px-4 py-3 cursor-pointer transition-opacity hover:opacity-90"
                            style={{
                              background: isToday ? "rgba(62,124,122,0.14)" : "rgba(46,107,64,0.08)",
                              border: `1px solid ${isToday ? "rgba(62,124,122,0.35)" : "rgba(46,107,64,0.2)"}`,
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <p
                                className="text-sm font-semibold leading-snug flex-1 min-w-0"
                                style={{ color: isPublished ? "#F0EDE6" : "rgba(240,237,230,0.6)" }}
                              >
                                {e.title}
                              </p>
                              {/* Right-side CTA pill — "Take action →"
                                  for an action entry, "Learn more →"
                                  otherwise; opens the link without
                                  triggering the card's slideshow tap.
                                  Falls back to the draft/scheduled
                                  state label for unpublished rows. */}
                              {!isPublished ? (
                                <span
                                  className="text-[10px] uppercase tracking-widest shrink-0 mt-0.5"
                                  style={{ color: "rgba(143,175,150,0.5)" }}
                                >
                                  {e.state}
                                </span>
                              ) : e.learnMoreUrl ? (
                                <button
                                  type="button"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    openExternal(e.learnMoreUrl as string);
                                  }}
                                  className="text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0 transition-opacity hover:opacity-90"
                                  style={{
                                    background: "rgba(46,107,64,0.35)",
                                    color: "#C8D4C0",
                                    border: "1px solid rgba(46,107,64,0.55)",
                                    fontFamily: "'Space Grotesk', sans-serif",
                                    cursor: "pointer",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {e.source === "action" ? "Take action →" : "Learn more →"}
                                </button>
                              ) : null}
                            </div>
                            {e.body && (
                              <p
                                className="text-[12px] mt-1 leading-snug"
                                style={{
                                  color: "rgba(143,175,150,0.8)",
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                  overflow: "hidden",
                                }}
                              >
                                {e.body}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {/* Tail spacer so the last day clears the bottom fade
                when the week is scrolled all the way down. */}
            <div className="h-10" />
          </div>
          {/* Bottom fade — the week always has 7 days, so the list
              always overflows the clamp; the gradient cues "scroll
              for more." Fades to the Layout background (#091A10). */}
          <div
            className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, transparent 20%, #091A10)" }}
          />
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

      {/* Slide walker — a card tap opens a one-slide deck; "Pray the
          full list" opens the whole week. Each slide is the prayer
          text + a Learn more / Take action link; today's slides log a
          pray as the walker reaches them (see the effect above). */}
      <AnimatePresence>
        {slideshow && (() => {
          const cur = slideshow.deck[slideshow.index];
          if (!cur) return null;
          const total = slideshow.deck.length;
          const isLast = slideshow.index >= total - 1;
          const advance = () => {
            if (isLast) setSlideshow(null);
            else setSlideshow({ deck: slideshow.deck, index: slideshow.index + 1 });
          };
          const back = () => {
            if (slideshow.index > 0) {
              setSlideshow({ deck: slideshow.deck, index: slideshow.index - 1 });
            }
          };
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex flex-col"
              style={{ background: "#0C1F12" }}
            >
              <button
                type="button"
                onClick={() => setSlideshow(null)}
                aria-label="Close"
                className="absolute flex items-center justify-center rounded-full"
                style={{
                  top: "calc(env(safe-area-inset-top, 0px) + 12px)",
                  right: 16,
                  width: 36,
                  height: 36,
                  background: "rgba(46,107,64,0.18)",
                  border: "1px solid rgba(46,107,64,0.35)",
                  color: "#C8D4C0",
                  fontSize: 18,
                  lineHeight: 1,
                  cursor: "pointer",
                  zIndex: 1,
                }}
              >
                ×
              </button>
              <div
                className="flex-1 flex flex-col items-center text-center px-6"
                style={{
                  maxWidth: 560,
                  margin: "0 auto",
                  width: "100%",
                  paddingTop: "clamp(72px, 14vh, 140px)",
                  paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)",
                  gap: 18,
                  overflowY: "auto",
                }}
              >
                <p
                  className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "rgba(143,175,150,0.5)" }}
                >
                  {feed.title}
                  {total > 1 ? ` · ${slideshow.index + 1} of ${total}` : ""}
                </p>
                <h2
                  className="text-xl font-semibold leading-snug"
                  style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {cur.title}
                </h2>
                {cur.body && (
                  <p
                    className="italic"
                    style={{
                      color: "#E8E4D8",
                      fontFamily: "Georgia, 'Times New Roman', serif",
                      fontSize: 20,
                      lineHeight: 1.55,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {cur.body}
                  </p>
                )}
                {cur.scriptureRef && (
                  <p
                    className="text-[11px] uppercase tracking-[0.14em]"
                    style={{ color: "rgba(143,175,150,0.55)" }}
                  >
                    {cur.scriptureRef}
                  </p>
                )}
                {cur.learnMoreUrl && (
                  <button
                    type="button"
                    onClick={() => openExternal(cur.learnMoreUrl as string)}
                    className="text-sm font-semibold px-5 py-2.5 rounded-full transition-opacity hover:opacity-90"
                    style={{
                      background: "rgba(46,107,64,0.18)",
                      border: "1px solid rgba(46,107,64,0.45)",
                      color: "#F0EDE6",
                      fontFamily: "'Space Grotesk', sans-serif",
                      cursor: "pointer",
                    }}
                  >
                    {cur.source === "action" ? "Take action →" : "Learn more →"}
                  </button>
                )}

                {/* Walk controls — Continue advances the deck; the last
                    slide finishes and closes. Back steps one slide. */}
                <div className="flex flex-col items-center gap-2.5 mt-2">
                  <button
                    type="button"
                    onClick={advance}
                    className="text-sm font-semibold rounded-full py-2.5 transition-opacity hover:opacity-90"
                    style={{
                      background: "#2D5E3F",
                      border: "1px solid rgba(46,107,64,0.7)",
                      color: "#F0EDE6",
                      fontFamily: "'Space Grotesk', sans-serif",
                      cursor: "pointer",
                      minWidth: 200,
                    }}
                  >
                    {isLast ? (total > 1 ? "Finish 🌿" : "Done") : "Continue →"}
                  </button>
                  {slideshow.index > 0 && (
                    <button
                      type="button"
                      onClick={back}
                      className="text-[13px] transition-opacity hover:opacity-80"
                      style={{
                        color: "rgba(143,175,150,0.7)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}
                    >
                      ← Back
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </Layout>
  );
}
