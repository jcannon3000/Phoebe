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
  // 1, 2, or 3. Position within the day. Older single-entry rows
  // default to 1 server-side, so manage UIs that pre-date this
  // change keep working.
  slot: number;
  title: string;
  body: string;
  scriptureRef: string | null;
  imageUrl: string | null;
  learnMoreUrl: string | null;
  state: EntryState;
  prayCount: number;
}

// Up to three programmable slots per day. The numbers are positional
// labels — each slot becomes its own slide on the subscriber side, in
// ascending order.
const SLOT_LABELS: Record<number, string> = {
  1: "First",
  2: "Second",
  3: "Third",
};
const SLOTS = [1, 2, 3] as const;

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
  // Use rawIsBeta + isLoading guard. rawIsBeta is the user's
  // underlying beta access (independent of the betaViewEnabled
  // toggle), and isLoading lets us avoid redirecting before the
  // beta-status query has resolved. Without those, refreshing the
  // manage page bounced the user to /dashboard the moment the
  // effect ran with `isBeta` still falsy from the unresolved
  // query — which is what the user reported as "the feed
  // disappeared on refresh."
  const { rawIsBeta, isLoading: betaLoading } = useBetaStatus();
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
    if (!authLoading && !betaLoading && user && !rawIsBeta) setLocation("/dashboard");
  }, [user, authLoading, betaLoading, rawIsBeta, setLocation]);

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
  // Lookup per (date, slot). Three rows per date max. The key is
  // `${date}|${slot}` so callers can grab an exact cell without
  // walking the array.
  const bySlot = useMemo(() => {
    const m = new Map<string, Entry>();
    for (const e of entries) m.set(`${e.entryDate}|${e.slot}`, e);
    return m;
  }, [entries]);
  const slotKey = (date: string, slot: number) => `${date}|${slot}`;

  // ── Mutations ───────────────────────────────────────────────────────────
  const updateFeed = useMutation({
    mutationFn: (patch: Partial<Pick<Feed, "title" | "tagline" | "coverEmoji" | "state">>) =>
      apiRequest("PUT", `/api/prayer-feeds/${slug}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}`] }),
  });

  const saveEntry = useMutation({
    mutationFn: (e: {
      entryDate: string;
      slot: number;
      title: string;
      body: string;
      learnMoreUrl: string | null;
      state: EntryState;
    }) =>
      apiRequest("POST", `/api/prayer-feeds/${slug}/entries`, e),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/entries`, windowFrom, windowTo] });
    },
  });

  const deleteEntry = useMutation({
    mutationFn: ({ date, slot }: { date: string; slot: number }) =>
      apiRequest("DELETE", `/api/prayer-feeds/${slug}/entries/${date}?slot=${slot}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/entries`, windowFrom, windowTo] });
    },
  });

  // Delete the entire feed — wipes the feed row, every entry, every
  // subscription, and every "I prayed" stamp via DB cascades. Routes
  // back to the dashboard since the manage URL is dead afterward.
  const deleteFeed = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/prayer-feeds/${slug}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/prayer-feeds/mine"] });
      qc.invalidateQueries({ queryKey: ["/api/prayer-feeds/subscribed"] });
      setLocation("/dashboard");
    },
  });

  // ── Modal state — keyed by (date, slot) since each cell is its
  // own intercession. The editor remembers which cell is open so
  // saves / deletes don't drift to the wrong slot. ──────────────
  const [editorTarget, setEditorTarget] = useState<{ date: string; slot: number } | null>(null);
  // Two-tap confirm gate for the destructive delete-feed button —
  // first tap arms it, second tap commits.
  const [deleteConfirmArmed, setDeleteConfirmArmed] = useState(false);
  const [draft, setDraft] = useState<{ title: string; body: string; learnMoreUrl: string }>({
    title: "", body: "", learnMoreUrl: "",
  });

  function openEditor(dateStr: string, slot: number) {
    const existing = bySlot.get(slotKey(dateStr, slot));
    setDraft({
      title: existing?.title ?? "",
      body: existing?.body ?? "",
      learnMoreUrl: existing?.learnMoreUrl ?? "",
    });
    setEditorTarget({ date: dateStr, slot });
  }
  function closeEditor() { setEditorTarget(null); }

  async function commitEditor(state: EntryState) {
    if (!editorTarget) return;
    await saveEntry.mutateAsync({
      entryDate: editorTarget.date,
      slot: editorTarget.slot,
      title: draft.title.trim(),
      body: draft.body.trim(),
      learnMoreUrl: draft.learnMoreUrl.trim() || null,
      state,
    });
    setEditorTarget(null);
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

  // 7-day window for the calendar editor: today + 6 upcoming days.
  // Each day expands to 3 editable slot cells.
  const calendarDays: string[] = [];
  for (let i = 0; i < 7; i++) calendarDays.push(addDays(today!, i));
  // Past entries surface as a flat list (one row per slot) so admins
  // can scan history without scrolling 21 cells per day. Slot order
  // is preserved within each date.
  const past: Entry[] = entries
    .filter(e => e.entryDate < today!)
    .sort((a, b) => {
      const cmp = b.entryDate.localeCompare(a.entryDate);
      return cmp !== 0 ? cmp : a.slot - b.slot;
    });

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

        {/* 7-day calendar — today + 6 upcoming days, three editable
            slots per day. Each cell opens the editor pre-filled with
            its existing entry (or empty for an unfilled slot). */}
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,212,192,0.45)" }}>
          This week
        </p>
        <div className="space-y-4 mb-6">
          {calendarDays.map((dateStr, di) => {
            const isToday = dateStr === today;
            return (
              <div key={dateStr}>
                <p
                  className="text-[11px] font-semibold uppercase tracking-widest mb-2"
                  style={{ color: isToday ? "#C8D4C0" : "rgba(143,175,150,0.7)" }}
                >
                  {isToday ? "Today" : di === 1 ? "Tomorrow" : prettyDate(dateStr)}
                  <span className="ml-2 font-normal" style={{ color: "rgba(143,175,150,0.5)" }}>
                    {isToday ? prettyDate(dateStr) : ""}
                  </span>
                </p>
                <div className="space-y-1.5">
                  {SLOTS.map(slot => {
                    const e = bySlot.get(slotKey(dateStr, slot));
                    const statusDot = e
                      ? (e.state === "published" ? "🟢" : e.state === "scheduled" ? "🟡" : "⚫")
                      : null;
                    return (
                      <button
                        key={slot}
                        onClick={() => openEditor(dateStr, slot)}
                        className="w-full text-left rounded-xl px-4 py-3 flex items-center gap-3 transition-opacity hover:opacity-90"
                        style={{
                          background: e ? "#0F2818" : "rgba(46,107,64,0.06)",
                          border: `1px solid ${e ? "rgba(46,107,64,0.45)" : "rgba(46,107,64,0.18)"}`,
                        }}
                      >
                        <span
                          className="text-[10px] font-semibold uppercase tracking-widest w-14 flex-shrink-0"
                          style={{ color: "rgba(143,175,150,0.6)" }}
                        >
                          {SLOT_LABELS[slot]}
                        </span>
                        <span className="text-sm flex-1 min-w-0 truncate" style={{ color: e ? "#F0EDE6" : "#8FAF96" }}>
                          {e ? e.title : "(draft an intercession)"}
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
              </div>
            );
          })}
        </div>

        {/* Past entries — flat history list so admins can scan recent
            programming without scrolling per-day grids. Each row is
            one slot. */}
        {past.length > 0 && (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,212,192,0.45)" }}>
              Past
            </p>
            <div className="space-y-2">
              {past.slice(0, 21).map(e => (
                <div
                  key={`${e.entryDate}-${e.slot}`}
                  className="rounded-xl px-4 py-3 flex items-center gap-3"
                  style={{ background: "rgba(46,107,64,0.05)", border: "1px solid rgba(46,107,64,0.14)" }}
                >
                  <span className="text-[11px] font-medium w-20 flex-shrink-0" style={{ color: "rgba(143,175,150,0.6)" }}>
                    {prettyDate(e.entryDate)}
                  </span>
                  <span className="text-[10px] uppercase tracking-widest w-12 flex-shrink-0" style={{ color: "rgba(143,175,150,0.5)" }}>
                    {SLOT_LABELS[e.slot] ?? `#${e.slot}`}
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

        {/* ── Groups — communities bound to this feed. Adding a
              group auto-subscribes every joined member; removing
              just stops auto-subscribing future joiners (existing
              subscribers stay subscribed). */}
        <FeedGroupsSection slug={slug!} />

        {/* ── Danger zone — delete the entire feed.
              Cascades wipe every entry, every subscriber row, and
              every "I prayed" stamp via DB foreign keys. Two-tap
              confirm prevents accidents — first tap arms the
              destructive button, second tap commits. */}
        <div className="mt-10 pt-6" style={{ borderTop: "1px solid rgba(46,107,64,0.18)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,180,180,0.55)" }}>
            Danger zone
          </p>
          <p className="text-xs mb-3" style={{ color: "rgba(143,175,150,0.7)" }}>
            Deletes the feed and every intercession, every subscriber, and every "I prayed" tap. Cannot be undone.
          </p>
          {!deleteConfirmArmed ? (
            <button
              onClick={() => setDeleteConfirmArmed(true)}
              className="text-xs font-semibold px-4 py-2 rounded-full transition-opacity hover:opacity-85"
              style={{
                background: "rgba(168,72,72,0.15)",
                border: "1px solid rgba(168,72,72,0.4)",
                color: "#E8B0B0",
              }}
            >
              Delete feed
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => deleteFeed.mutate()}
                disabled={deleteFeed.isPending}
                className="text-xs font-semibold px-4 py-2 rounded-full transition-opacity hover:opacity-85 disabled:opacity-50"
                style={{
                  background: "#A84848",
                  border: "1px solid #A84848",
                  color: "#FFFFFF",
                }}
              >
                {deleteFeed.isPending ? "Deleting…" : "Confirm delete"}
              </button>
              <button
                onClick={() => setDeleteConfirmArmed(false)}
                disabled={deleteFeed.isPending}
                className="text-xs font-semibold px-4 py-2 rounded-full transition-opacity hover:opacity-85 disabled:opacity-50"
                style={{
                  background: "transparent",
                  border: "1px solid rgba(143,175,150,0.3)",
                  color: "#8FAF96",
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* ── Editor modal — keyed on (date, slot) so each cell on
              the calendar opens its own intercession. ─────────── */}
        {editorTarget && (() => {
          const editorDate = editorTarget.date;
          const editorSlot = editorTarget.slot;
          const existing = bySlot.get(slotKey(editorDate, editorSlot));
          return (
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
                    {" · "}{SLOT_LABELS[editorSlot]} slot
                  </p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: "#F0EDE6" }}>
                    {existing ? "Edit intercession" : "Compose intercession"}
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
                    Learn more URL (optional)
                  </label>
                  <input
                    type="url"
                    value={draft.learnMoreUrl}
                    onChange={e => setDraft({ ...draft, learnMoreUrl: e.target.value })}
                    placeholder="https://example.org/story"
                    maxLength={500}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
                    style={{ color: "#F0EDE6" }}
                  />
                  <p className="text-[10px] mt-1" style={{ color: "rgba(143,175,150,0.6)" }}>
                    Subscribers see a "Learn more →" pill on the slide that opens this link.
                  </p>
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

              {existing && (
                <button
                  onClick={async () => {
                    if (confirm("Delete this intercession?")) {
                      await deleteEntry.mutateAsync({ date: editorDate, slot: editorSlot });
                      closeEditor();
                    }
                  }}
                  disabled={deleteEntry.isPending}
                  className="text-[11px] mt-3 transition-opacity hover:opacity-70"
                  style={{ color: "#E57373" }}
                >
                  Delete intercession
                </button>
              )}
            </div>
          </div>
          );
        })()}
      </div>
    </Layout>
  );
}

// ── Groups section on the manage page ──────────────────────────────────
//
// Lists every community currently bound to this feed and lets the
// admin add another from the user's communities (where they're an
// admin) or remove an existing binding.
//
// Adding a group auto-subscribes every joined member of that group
// to the feed. Removing leaves existing subscribers in place — only
// future joiners stop being auto-subscribed.
type BoundGroup = {
  groupId: number;
  groupSlug: string | null;
  groupName: string | null;
  groupEmoji: string | null;
};
type MyGroup = { id: number; slug: string; name: string; emoji: string | null; myRole: string };

function FeedGroupsSection({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [picking, setPicking] = useState(false);

  const groupsQ = useQuery<{ groups: BoundGroup[] }>({
    queryKey: [`/api/prayer-feeds/${slug}/groups`],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${slug}/groups`),
  });
  const myGroupsQ = useQuery<{ groups: MyGroup[] }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
  });

  const addMutation = useMutation({
    mutationFn: (groupSlug: string) =>
      apiRequest("POST", `/api/prayer-feeds/${slug}/groups`, { groupSlug }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/groups`] });
      setPicking(false);
    },
  });
  const removeMutation = useMutation({
    mutationFn: (groupId: number) =>
      apiRequest("DELETE", `/api/prayer-feeds/${slug}/groups/${groupId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/groups`] });
    },
  });

  const bound = groupsQ.data?.groups ?? [];
  const boundIds = new Set(bound.map((g) => g.groupId));
  // Only offer groups where the current user has admin standing
  // (admin / hidden_admin) and that aren't already bound.
  const availableGroups = (myGroupsQ.data?.groups ?? []).filter(
    (g) => !boundIds.has(g.id) && (g.myRole === "admin" || g.myRole === "hidden_admin"),
  );

  return (
    <div className="mt-10 pt-6" style={{ borderTop: "1px solid rgba(46,107,64,0.18)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,212,192,0.55)" }}>
        Communities
      </p>
      <p className="text-xs mb-3" style={{ color: "rgba(143,175,150,0.7)" }}>
        Bound communities have every member auto-subscribed. Removing a community here doesn't unsubscribe anyone — it just stops new joiners from being auto-added.
      </p>

      {bound.length === 0 && (
        <p className="text-xs mb-3" style={{ color: "rgba(143,175,150,0.55)" }}>
          No communities bound yet.
        </p>
      )}

      <div className="space-y-2 mb-3">
        {bound.map((g) => (
          <div
            key={g.groupId}
            className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg"
            style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.22)" }}
          >
            <span className="text-sm" style={{ color: "#F0EDE6" }}>
              {g.groupEmoji ?? "⛪"} {g.groupName ?? "(unknown)"}
            </span>
            <button
              type="button"
              onClick={() => {
                if (confirm(`Remove ${g.groupName ?? "this community"} from the feed?`)) {
                  removeMutation.mutate(g.groupId);
                }
              }}
              disabled={removeMutation.isPending}
              className="text-[11px] font-semibold transition-opacity hover:opacity-70"
              style={{ color: "rgba(232,176,176,0.9)", background: "transparent", border: "none", cursor: "pointer" }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {!picking ? (
        <button
          type="button"
          onClick={() => setPicking(true)}
          disabled={availableGroups.length === 0}
          className="text-xs font-semibold px-3 py-2 rounded-full transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.4)", color: "#A8C5A0" }}
        >
          + Add a community
        </button>
      ) : (
        <div
          className="rounded-lg p-3"
          style={{ background: "rgba(46,107,64,0.06)", border: "1px solid rgba(46,107,64,0.2)" }}
        >
          {availableGroups.length === 0 ? (
            <p className="text-xs" style={{ color: "rgba(143,175,150,0.7)" }}>
              No more communities to add. (Only communities where you're an admin can be bound.)
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {availableGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => addMutation.mutate(g.slug)}
                  disabled={addMutation.isPending}
                  className="text-left px-3 py-2 rounded-lg text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.28)", color: "#F0EDE6" }}
                >
                  {g.emoji ?? "⛪"} {g.name}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setPicking(false)}
            className="text-[11px] mt-3 transition-opacity hover:opacity-70"
            style={{ color: "rgba(143,175,150,0.6)", background: "transparent", border: "none", cursor: "pointer" }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
