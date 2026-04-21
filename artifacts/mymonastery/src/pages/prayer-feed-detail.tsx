import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

// Subscriber detail page for a Prayer Feed. Shows today's intention
// prominently, a "Pray 🙏🏽" action, who-prayed-today chips (mirrors
// the beta intercession panel), and a collapsed list of back issues.
//
// The same URL works for the creator — if `isCreator` is true we
// surface a small "Manage feed" button so they can hop into the
// calendar editor.

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

export default function PrayerFeedDetailPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isBeta } = useBetaStatus();
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [showBackIssues, setShowBackIssues] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
    if (!authLoading && user && !isBeta) setLocation("/dashboard");
  }, [user, authLoading, isBeta, setLocation]);

  // ── Feed + today's entry ───────────────────────────────────────────────
  const feedQ = useQuery<FeedResponse>({
    queryKey: [`/api/prayer-feeds/${slug}`],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${slug}`),
    enabled: !!user && !!slug,
  });
  const feed = feedQ.data?.feed ?? null;
  const tz = feed?.timezone ?? "America/New_York";
  const today = feed ? todayInZone(tz) : null;

  // Load last 30 days so we can show today prominently + back issues.
  const entriesQ = useQuery<{ entries: Entry[] }>({
    queryKey: [`/api/prayer-feeds/${slug}/entries`, "subscriber"],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${slug}/entries`),
    enabled: !!feed,
  });
  const entries = entriesQ.data?.entries ?? [];
  const todayEntry = useMemo(
    () => today ? entries.find(e => e.entryDate === today) ?? null : null,
    [entries, today],
  );
  const backIssues = useMemo(() => {
    if (!today) return [];
    return entries
      .filter(e => e.entryDate < today && e.state === "published")
      .sort((a, b) => b.entryDate.localeCompare(a.entryDate));
  }, [entries, today]);

  // ── Today's prayer roster ──────────────────────────────────────────────
  const prayersQ = useQuery<{ prayers: PrayerRow[]; prayCount: number }>({
    queryKey: [`/api/prayer-feeds/${slug}/entries/${today}/prayers`],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${slug}/entries/${today}/prayers`),
    enabled: !!feed && !!today && !!todayEntry,
  });
  const prayers = prayersQ.data?.prayers ?? [];
  const prayedTodayCount = prayersQ.data?.prayCount ?? todayEntry?.prayCount ?? 0;
  const didIPrayToday = useMemo(() => {
    if (!user) return false;
    return prayers.some(p => p.email.toLowerCase() === (user as any).email?.toLowerCase?.());
  }, [prayers, user]);

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
    mutationFn: () => apiRequest("POST", `/api/prayer-feeds/${slug}/entries/${today}/pray`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/entries`, "subscriber"] });
      qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/entries/${today}/prayers`] });
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

        {/* Today's intention */}
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,212,192,0.45)" }}>
          Today · {today ? prettyDate(today) : ""}
        </p>

        {todayEntry ? (
          <div
            className="rounded-2xl p-5 mb-5"
            style={{ background: "#0F2622", border: "1px solid rgba(62,124,122,0.35)" }}
          >
            <h2
              className="text-lg font-semibold leading-snug mb-2"
              style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {todayEntry.title}
            </h2>
            {todayEntry.body && (
              <p
                className="text-sm leading-relaxed whitespace-pre-line"
                style={{ color: "rgba(240,237,230,0.88)" }}
              >
                {todayEntry.body}
              </p>
            )}
            {todayEntry.scriptureRef && (
              <p
                className="text-xs italic mt-3"
                style={{ color: "#8FAF96", fontFamily: "var(--font-serif, 'Playfair Display'), Georgia, serif" }}
              >
                — {todayEntry.scriptureRef}
              </p>
            )}

            {/* Pray action */}
            <div className="mt-5 flex items-center gap-3">
              {didIPrayToday ? (
                <span
                  className="text-sm font-medium"
                  style={{ color: "#A8C5A0" }}
                >
                  🙏🏽 You prayed today
                </span>
              ) : (
                <button
                  onClick={() => pray.mutate()}
                  disabled={pray.isPending || (!isSubscribed && !isCreator)}
                  className="text-sm font-semibold px-5 py-2.5 rounded-full transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: "#3E7C7A", color: "#F0EDE6" }}
                >
                  {pray.isPending ? "…" : "Pray 🙏🏽"}
                </button>
              )}
              {!isSubscribed && !isCreator && (
                <span className="text-[11px] italic" style={{ color: "rgba(143,175,150,0.7)" }}>
                  Subscribe to join in
                </span>
              )}
            </div>
          </div>
        ) : (
          <div
            className="rounded-2xl p-5 mb-5 text-sm italic"
            style={{ background: "rgba(62,124,122,0.06)", border: "1px solid rgba(62,124,122,0.18)", color: "#8FAF96" }}
          >
            No intention published for today yet — check back soon.
          </div>
        )}

        {/* Stats panel — streak + prayed today + who prayed today */}
        {todayEntry && (
          <div
            className="rounded-2xl p-5 mb-6"
            style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}
          >
            <div className="flex items-baseline gap-6 mb-4">
              <div>
                <p className="text-3xl font-bold text-foreground tabular-nums" style={{ color: "#F0EDE6" }}>
                  {prayedTodayCount}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>prayed today</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-foreground tabular-nums" style={{ color: "#F0EDE6" }}>
                  {feed.subscriberCount}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>subscribed</p>
              </div>
            </div>
            {prayers.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {prayers.map((p, i) => (
                  <div
                    key={`${p.email}-${i}`}
                    className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1"
                    style={{ background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.28)" }}
                  >
                    {p.avatarUrl ? (
                      <img src={p.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold"
                        style={{ background: "rgba(168,197,160,0.2)", color: "#A8C5A0" }}
                      >
                        {(p.name || p.email || "?").trim().charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs" style={{ color: "#F0EDE6" }}>
                      {p.name || p.email.split("@")[0]}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs italic" style={{ color: "#8FAF96" }}>
                No one has prayed yet today. Be the first.
              </p>
            )}
          </div>
        )}

        {/* Back issues */}
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
                {backIssues.slice(0, 30).map(e => (
                  <div
                    key={e.entryDate}
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
    </Layout>
  );
}
