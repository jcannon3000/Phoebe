import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

// Creator calendar editor for a Prayer Feed. This is the main surface
// for the creator — a vertical list of upcoming days (empty cards or
// composed ones), today pinned at top, and past entries collapsed at
// the bottom. Tapping a day opens a lightweight editor modal.

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
  entryDate: string; // "YYYY-MM-DD"
  title: string;
  body: string;
  scriptureRef: string | null;
  imageUrl: string | null;
  state: EntryState;
  prayCount: number;
}

interface FeedResponse {
  feed: Feed;
  isCreator: boolean;
  isSubscribed: boolean;
}
interface EntriesResponse {
  entries: Entry[];
}

function todayInZone(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
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
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}

export default function PrayerFeedManagePage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isBeta } = useBetaStatus();
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
    if (!authLoading && user && !isBeta) setLocation("/dashboard");
  }, [user, authLoading, isBeta, setLocation]);

  // ── Data ────────────────────────────────────────────────────────────────
  const feedQ = useQuery<FeedResponse>({
    queryKey: [`/api/prayer-feeds/${slug}`],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${slug}`),
    enabled: !!user && !!slug,
  });

  const feed = feedQ.data?.feed ?? null;
  const tz = feed?.timezone ?? "America/New_York";
  const today = feed ? todayInZone(tz) : null;

  // Load a window: 14 days back ... 30 days forward, relative to today.
  const windowFrom = today ? addDays(today, -14) : null;
  const windowTo = today ? addDays(today, 30) : null;

  const entriesQ = useQuery<EntriesResponse>({
    queryKey: [`/api/prayer-feeds/${slug}/entries`, windowFrom, windowTo],
    queryFn: () => apiRequest(
      "GET",
      `/api/prayer-feeds/${slug}/entries?from=${windowFrom}&to=${windowTo}`
    ),
    enabled: !!user && !!slug && !!feed && !!windowFrom && !!windowTo,
  });

  const entries: Entry[] = entriesQ.data?.entries ?? [];
  const byDate = useMemo(() => {
    const m = new Map<string, Entry>();
    for (const e of entries) m.set(e.entryDate, e);
    return m;
  }, [entries]);

  // ── Mutations ───────────────────────────────────────────────────────────
  const updateFeed = useMutation({
    mutationFn: (patch: Partial<Pick<Feed, "title" | "tagline" | "coverEmoji" | "state">>) =>
      apiRequest("PUT", `/api/prayer-feeds/${slug}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}`] }),
  });

  const saveEntry = useMutation({
    mutationFn: (e: {
      entryDate: string;
      title: string;
      body: string;
      scriptureRef: string | null;
      state: EntryState;
    }) =>
      apiRequest("POST", `/api/prayer-feeds/${slug}/entries`, e),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/entries`, windowFrom, windowTo] });
    },
  });

  const deleteEntry = useMutation({
    mutationFn: (date: string) =>
      apiRequest("DELETE", `/api/prayer-feeds/${slug}/entries/${date}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/entries`, windowFrom, windowTo] });
    },
  });

  // ── Modal state ─────────────────────────────────────────────────────────
  const [editorDate, setEditorDate] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ title: string; body: string; scriptureRef: string }>({
    title: "", body: "", scriptureRef: "",
  });

  function openEditor(dateStr: string) {
    const existing = byDate.get(dateStr);
    setDraft({
      title: existing?.title ?? "",
      body: existing?.body ?? "",
      scriptureRef: existing?.scriptureRef ?? "",
    });
    setEditorDate(dateStr);
  }
  function closeEditor() { setEditorDate(null); }

  async function commitEditor(state: EntryState) {
    if (!editorDate) return;
    await saveEntry.mutateAsync({
      entryDate: editorDate,
      title: draft.title.trim(),
      body: draft.body.trim(),
      scriptureRef: draft.scriptureRef.trim() || null,
      state,
    });
    setEditorDate(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (authLoading || !user || feedQ.isLoading) {
    return <Layout><div className="max-w-lg mx-auto w-full py-12 text-sm" style={{ color: "#8FAF96" }}>Loading…</div></Layout>;
  }
  if (!feed || !feedQ.data?.isCreator) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto w-full py-12 text-sm" style={{ color: "#8FAF96" }}>
          This feed isn't available.
        </div>
      </Layout>
    );
  }

  const todayEntry = today ? byDate.get(today) ?? null : null;
  const upcoming: string[] = [];
  for (let i = 1; i <= 7; i++) upcoming.push(addDays(today!, i));
  const past: Entry[] = entries
    .filter(e => e.entryDate < today!)
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate));

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
        <div className="flex items-start gap-3 mb-2">
          <div
            className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0"
            style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.3)" }}
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
              {feed.subscriberCount} subscriber{feed.subscriberCount === 1 ? "" : "s"} · {feed.state}
            </p>
          </div>
        </div>

        {/* State toggle */}
        <div className="flex gap-2 mb-6">
          {(["draft", "live", "paused"] as FeedState[]).map(s => (
            <button
              key={s}
              onClick={() => updateFeed.mutate({ state: s })}
              disabled={feed.state === s || updateFeed.isPending}
              className="text-[11px] font-semibold uppercase tracking-widest px-3 py-1.5 rounded-full transition-opacity disabled:opacity-100"
              style={{
                background: feed.state === s ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.08)",
                border: `1px solid ${feed.state === s ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.2)"}`,
                color: feed.state === s ? "#F0EDE6" : "#8FAF96",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Today */}
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,212,192,0.45)" }}>
          Today · {prettyDate(today!)}
        </p>
        <button
          onClick={() => openEditor(today!)}
          className="w-full text-left rounded-2xl p-4 mb-6 transition-opacity hover:opacity-90"
          style={{
            background: todayEntry ? "#0F2818" : "rgba(46,107,64,0.06)",
            border: `1px solid ${todayEntry ? "rgba(46,107,64,0.45)" : "rgba(46,107,64,0.18)"}`,
          }}
        >
          {todayEntry ? (
            <>
              <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>{todayEntry.title}</p>
              {todayEntry.body && (
                <p className="text-xs mt-1 line-clamp-3" style={{ color: "#8FAF96" }}>{todayEntry.body}</p>
              )}
              <p className="text-[11px] mt-2" style={{ color: "rgba(143,175,150,0.6)" }}>
                {todayEntry.state === "published"
                  ? `${todayEntry.prayCount} prayed today`
                  : `${todayEntry.state} · tap to publish`}
              </p>
            </>
          ) : (
            <p className="text-sm italic" style={{ color: "#8FAF96" }}>+ Compose today's intention</p>
          )}
        </button>

        {/* Upcoming */}
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,212,192,0.45)" }}>
          Upcoming
        </p>
        <div className="space-y-2 mb-6">
          {upcoming.map(dateStr => {
            const e = byDate.get(dateStr);
            const statusDot = e
              ? (e.state === "published" ? "🟢" : e.state === "scheduled" ? "🟡" : "⚫")
              : null;
            return (
              <button
                key={dateStr}
                onClick={() => openEditor(dateStr)}
                className="w-full text-left rounded-xl px-4 py-3 flex items-center gap-3 transition-opacity hover:opacity-90"
                style={{
                  background: "rgba(46,107,64,0.06)",
                  border: "1px solid rgba(46,107,64,0.18)",
                }}
              >
                <span className="text-[11px] font-medium w-20 flex-shrink-0" style={{ color: "rgba(143,175,150,0.7)" }}>
                  {prettyDate(dateStr)}
                </span>
                <span className="text-sm flex-1 min-w-0 truncate" style={{ color: e ? "#F0EDE6" : "#8FAF96" }}>
                  {e ? e.title : "(draft an intention)"}
                </span>
                {statusDot ? (
                  <span className="text-[10px] flex-shrink-0">{statusDot}</span>
                ) : (
                  <span className="text-xs flex-shrink-0" style={{ color: "#8FAF96" }}>+ Add</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Past */}
        {past.length > 0 && (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,212,192,0.45)" }}>
              Past
            </p>
            <div className="space-y-2">
              {past.slice(0, 14).map(e => (
                <div
                  key={e.entryDate}
                  className="rounded-xl px-4 py-3 flex items-center gap-3"
                  style={{ background: "rgba(46,107,64,0.05)", border: "1px solid rgba(46,107,64,0.14)" }}
                >
                  <span className="text-[11px] font-medium w-20 flex-shrink-0" style={{ color: "rgba(143,175,150,0.6)" }}>
                    {prettyDate(e.entryDate)}
                  </span>
                  <span className="text-sm flex-1 min-w-0 truncate" style={{ color: "rgba(240,237,230,0.75)" }}>
                    {e.title}
                  </span>
                  <span className="text-[11px] flex-shrink-0" style={{ color: "rgba(143,175,150,0.6)" }}>
                    {e.prayCount} prayed
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Editor modal ────────────────────────────────────────────── */}
        {editorDate && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 py-6"
            style={{ background: "rgba(0,0,0,0.55)" }}
            onClick={closeEditor}
          >
            <div
              className="w-full max-w-lg rounded-2xl p-5"
              style={{ background: "#0A1F12", border: "1px solid rgba(46,107,64,0.4)" }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(200,212,192,0.45)" }}>
                    {prettyDate(editorDate)}
                    {editorDate === today && " · Today"}
                  </p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: "#F0EDE6" }}>
                    {byDate.has(editorDate) ? "Edit intention" : "Compose intention"}
                  </p>
                </div>
                <button onClick={closeEditor} className="text-xl leading-none" style={{ color: "#8FAF96" }} aria-label="Close">
                  ×
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(200,212,192,0.5)" }}>
                    Title
                  </label>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={e => setDraft({ ...draft, title: e.target.value })}
                    placeholder="e.g. Farmers in Kenya facing drought"
                    maxLength={120}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
                    style={{ color: "#F0EDE6" }}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(200,212,192,0.5)" }}>
                    Body
                  </label>
                  <textarea
                    value={draft.body}
                    onChange={e => setDraft({ ...draft, body: e.target.value })}
                    placeholder="One or two sentences inviting people to pray."
                    rows={4}
                    maxLength={2000}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm resize-none"
                    style={{ color: "#F0EDE6" }}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(200,212,192,0.5)" }}>
                    Scripture (optional)
                  </label>
                  <input
                    type="text"
                    value={draft.scriptureRef}
                    onChange={e => setDraft({ ...draft, scriptureRef: e.target.value })}
                    placeholder="e.g. Isaiah 41:17"
                    maxLength={80}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
                    style={{ color: "#F0EDE6" }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 mt-5">
                <button
                  onClick={() => commitEditor("draft")}
                  disabled={saveEntry.isPending || draft.title.trim().length === 0}
                  className="text-xs font-semibold px-3 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.35)", color: "#F0EDE6" }}
                >
                  Save draft
                </button>
                <button
                  onClick={() => commitEditor("scheduled")}
                  disabled={saveEntry.isPending || draft.title.trim().length === 0 || editorDate <= today!}
                  className="text-xs font-semibold px-3 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.35)", color: "#F0EDE6" }}
                >
                  Schedule
                </button>
                <button
                  onClick={() => commitEditor("published")}
                  disabled={saveEntry.isPending || draft.title.trim().length === 0}
                  className="text-xs font-semibold px-3 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-40 ml-auto"
                  style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                >
                  Publish
                </button>
              </div>

              {byDate.has(editorDate) && (
                <button
                  onClick={async () => {
                    if (confirm("Delete this intention?")) {
                      await deleteEntry.mutateAsync(editorDate);
                      closeEditor();
                    }
                  }}
                  disabled={deleteEntry.isPending}
                  className="text-[11px] mt-3 transition-opacity hover:opacity-70"
                  style={{ color: "#E57373" }}
                >
                  Delete intention
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
