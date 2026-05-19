import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

// Creator manage page for a Prayer Feed.
//
// A feed is a flat, ongoing list of community intercessions — no day
// scheduling. This page is just: feed state (draft / live / paused),
// the intercession composer (the feed's whole content), the bound
// communities, and a danger zone. The old day-by-day calendar editor,
// its per-cell modal, and recurring templates were retired when feeds
// became a flat list.

type FeedState = "draft" | "live" | "paused";

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
  visibility: "public" | "private";
  subscriberCount: number;
}

interface FeedResponse {
  feed: Feed;
  isCreator: boolean;
  isSubscribed: boolean;
}

// A feed intercession — a shared_moments row scoped to this feed
// (prayer_feed_id set). An admin adds one via a composer with a
// Prayer / Action type toggle — "Action" carries a link and renders a
// "Take action →" pill in the slideshow. Each intercession links to
// its /moments/:id detail page, the same page community intercessions
// use, so feed prayers get cards + detail pages for free.
type FeedIntercession = {
  id: number;
  name: string;
  intention: string | null;
  intercessionTopic: string | null;
  intercessionFullText: string | null;
  intercessionSource: string | null;
  learnMoreUrl: string | null;
  state: string;
  createdAt: string;
};

// A community (group-scoped) intercession the editor can attach to a
// feed — created inside a community rather than in the feed itself.
type GroupIntercessionOption = {
  id: number;
  name: string;
  intention: string | null;
  intercessionFullText: string | null;
  intercessionSource: string | null;
  groupId: number;
  groupName: string | null;
  groupEmoji: string | null;
};

export default function PrayerFeedManagePage() {
  const { user, isLoading: authLoading } = useAuth();
  // rawIsBeta + isLoading guard avoids the refresh-bounce-to-dashboard
  // race (unresolved beta-status query → isBeta false → redirect
  // before data lands).
  const { rawIsBeta, isLoading: betaLoading } = useBetaStatus();
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  // Two-tap confirm gate for the destructive delete-feed button.
  const [deleteConfirmArmed, setDeleteConfirmArmed] = useState(false);

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

  // ── Mutations ───────────────────────────────────────────────────────────
  const updateFeed = useMutation({
    mutationFn: (patch: Partial<Pick<Feed, "title" | "tagline" | "coverEmoji" | "state" | "visibility">>) =>
      apiRequest("PUT", `/api/prayer-feeds/${slug}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}`] }),
  });

  // Delete the entire feed — cascades wipe every intercession,
  // subscriber row, and "I prayed" stamp via DB foreign keys.
  const deleteFeed = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/prayer-feeds/${slug}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/prayer-feeds/mine"] });
      qc.invalidateQueries({ queryKey: ["/api/prayer-feeds/subscribed"] });
      setLocation("/dashboard");
    },
  });

  // ── Render ──────────────────────────────────────────────────────────────
  if (authLoading || !user || feedQ.isLoading) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto w-full py-12 text-sm" style={{ color: "#8FAF96" }}>
          Loading…
        </div>
      </Layout>
    );
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
        <div className="flex gap-2 mb-4">
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

        {/* Visibility toggle — a public feed is discoverable in
            /prayer-feeds and subscribable by any account, including the
            limited offices-only tier. A private feed stays within beta
            members and bound communities. */}
        <div className="mb-6">
          <p
            className="text-[10px] font-semibold uppercase tracking-widest mb-1.5"
            style={{ color: "rgba(143,175,150,0.6)" }}
          >
            Visibility
          </p>
          <div className="flex gap-2">
            {(["private", "public"] as const).map(v => (
              <button
                key={v}
                onClick={() => updateFeed.mutate({ visibility: v })}
                disabled={feed.visibility === v || updateFeed.isPending}
                className="text-[11px] font-semibold uppercase tracking-widest px-3 py-1.5 rounded-full transition-opacity disabled:opacity-100"
                style={{
                  background: feed.visibility === v ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.08)",
                  border: `1px solid ${feed.visibility === v ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.2)"}`,
                  color: feed.visibility === v ? "#F0EDE6" : "#8FAF96",
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <p className="text-[11px] mt-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
            {feed.visibility === "public"
              ? "Anyone can find this feed and subscribe to it."
              : "Only beta members and bound communities can see this feed."}
          </p>
        </div>

        {/* Intercessions — the feed's whole content. A flat, ongoing
            list of community intercessions, authored here with a
            Prayer / Action chooser. */}
        <FeedIntercessionsSection slug={slug!} />

        {/* Communities bound to this feed. Adding a group auto-
            subscribes every joined member; removing just stops
            auto-subscribing future joiners. */}
        <FeedGroupsSection slug={slug!} />

        {/* Danger zone — delete the entire feed. Two-tap confirm
            prevents accidents. */}
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
                style={{ background: "#A84848", border: "1px solid #A84848", color: "#FFFFFF" }}
              >
                {deleteFeed.isPending ? "Deleting…" : "Confirm delete"}
              </button>
              <button
                onClick={() => setDeleteConfirmArmed(false)}
                disabled={deleteFeed.isPending}
                className="text-xs font-semibold px-4 py-2 rounded-full transition-opacity hover:opacity-85 disabled:opacity-50"
                style={{ background: "transparent", border: "1px solid rgba(143,175,150,0.3)", color: "#8FAF96" }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

// ── Intercessions composer ──────────────────────────────────────────────
//
// The feed's whole content surface: a flat, ongoing list of community
// intercessions, each authored with a Prayer / Action type toggle.
function FeedIntercessionsSection({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [composing, setComposing] = useState(false);
  // Type toggle: "custom" = a written prayer; "action" = a prayer
  // plus a link the slideshow surfaces as a "Take action →" pill.
  const [draft, setDraft] = useState<{
    source: "custom" | "action";
    title: string;
    fullText: string;
    learnMoreUrl: string;
  }>({ source: "custom", title: "", fullText: "", learnMoreUrl: "" });
  const [error, setError] = useState<string | null>(null);
  // "Add from a community" picker — attaches an existing community
  // intercession to this feed rather than authoring a new one.
  const [picking, setPicking] = useState(false);

  const listQ = useQuery<{ intercessions: FeedIntercession[] }>({
    queryKey: [`/api/prayer-feeds/${slug}/intercessions`],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${slug}/intercessions`),
  });

  const candidatesQ = useQuery<{ intercessions: GroupIntercessionOption[] }>({
    queryKey: [`/api/prayer-feeds/${slug}/group-intercession-options`],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${slug}/group-intercession-options`),
    enabled: picking,
  });

  const createMutation = useMutation({
    mutationFn: (payload: { source: string; title: string; fullText: string; learnMoreUrl: string | null }) =>
      apiRequest("POST", `/api/prayer-feeds/${slug}/intercessions`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/intercessions`] });
      setComposing(false);
      setDraft({ source: "custom", title: "", fullText: "", learnMoreUrl: "" });
      setError(null);
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Couldn't add the intercession.");
    },
  });

  const attachMutation = useMutation({
    mutationFn: (momentId: number) =>
      apiRequest("POST", `/api/prayer-feeds/${slug}/intercessions/attach`, { momentId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/intercessions`] });
      qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/group-intercession-options`] });
      setPicking(false);
    },
  });

  const items = listQ.data?.intercessions ?? [];

  function startNew() {
    setDraft({ source: "custom", title: "", fullText: "", learnMoreUrl: "" });
    setError(null);
    setComposing(true);
  }
  function save() {
    if (!draft.title.trim() || !draft.fullText.trim()) return;
    if (draft.source === "action" && !draft.learnMoreUrl.trim()) {
      setError("An action needs a link.");
      return;
    }
    createMutation.mutate({
      source: draft.source,
      title: draft.title.trim(),
      fullText: draft.fullText.trim(),
      // The link is required for an action ("Take action →" pill) and
      // optional for a written prayer ("Learn more →" pill — used to
      // link the article a prayer is responding to).
      learnMoreUrl: draft.learnMoreUrl.trim() || null,
    });
  }

  return (
    <div className="mb-8">
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,212,192,0.55)" }}>
        Intercessions
      </p>
      <p className="text-xs mb-3" style={{ color: "rgba(143,175,150,0.7)" }}>
        Prayers your subscribers pray together. Each one gets its own card and detail page.
      </p>

      <div className="space-y-2 mb-3">
        {items.map((it) => {
          const isAction = it.intercessionSource === "action";
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => setLocation(`/moments/${it.id}`)}
              className="w-full text-left rounded-xl px-4 py-3 flex items-center gap-3 transition-opacity hover:opacity-90"
              style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.45)" }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate" style={{ color: "#F0EDE6" }}>
                  {it.intention || it.name}
                </p>
                {it.intercessionFullText && (
                  <p className="text-[11px] mt-0.5 truncate" style={{ color: "rgba(143,175,150,0.7)" }}>
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
            </button>
          );
        })}
        {items.length === 0 && !listQ.isLoading && (
          <p className="text-xs italic px-1" style={{ color: "rgba(143,175,150,0.5)" }}>
            No intercessions yet.
          </p>
        )}
      </div>

      {composing ? (
        <div
          className="rounded-lg p-3 space-y-3"
          style={{ background: "rgba(46,107,64,0.06)", border: "1px solid rgba(46,107,64,0.2)" }}
        >
          {/* Type toggle — Prayer vs Action. */}
          <div className="flex gap-2">
            {([
              { key: "custom" as const, label: "🙏🏽 Prayer", sub: "A written prayer" },
              { key: "action" as const, label: "🌍 Action", sub: "Prayer + a link" },
            ]).map((opt) => {
              const on = draft.source === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setDraft({ ...draft, source: opt.key })}
                  className="flex-1 text-left rounded-lg px-3 py-2 transition-opacity"
                  style={{
                    background: on ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.08)",
                    border: `1px solid ${on ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.25)"}`,
                  }}
                >
                  <p className="text-xs font-semibold" style={{ color: "#F0EDE6" }}>{opt.label}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "rgba(143,175,150,0.7)" }}>{opt.sub}</p>
                </button>
              );
            })}
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(200,212,192,0.5)" }}>
              Title
            </label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              maxLength={120}
              placeholder="e.g. For families displaced by the floods"
              className="w-full px-3 py-2 rounded-lg border outline-none bg-transparent text-sm"
              style={{ borderColor: "rgba(46,107,64,0.4)", color: "#F0EDE6" }}
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(200,212,192,0.5)" }}>
              Prayer
            </label>
            <textarea
              value={draft.fullText}
              onChange={(e) => setDraft({ ...draft, fullText: e.target.value })}
              rows={4}
              maxLength={4000}
              placeholder="Write the prayer your subscribers will pray together…"
              className="w-full px-3 py-2 rounded-lg border outline-none bg-transparent text-sm resize-none"
              style={{ borderColor: "rgba(46,107,64,0.4)", color: "#F0EDE6" }}
            />
          </div>

          {/* Link field — required for an Action ("Take action →"
              pill), optional for a written Prayer ("Learn more →" pill
              for linking the article a prayer is responding to). */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(200,212,192,0.5)" }}>
              {draft.source === "action" ? "Action link" : "Learn more URL (optional)"}
            </label>
            <input
              type="url"
              value={draft.learnMoreUrl}
              onChange={(e) => setDraft({ ...draft, learnMoreUrl: e.target.value })}
              maxLength={500}
              placeholder="https://…"
              className="w-full px-3 py-2 rounded-lg border outline-none bg-transparent text-sm"
              style={{ borderColor: "rgba(46,107,64,0.4)", color: "#F0EDE6" }}
            />
            <p className="text-[10px] mt-1" style={{ color: "rgba(143,175,150,0.6)" }}>
              {draft.source === "action"
                ? 'Shown as a "Take action →" pill on the prayer slide.'
                : 'Link an article — subscribers see a "Learn more →" pill on the slide that opens it.'}
            </p>
          </div>

          {error && (
            <p className="text-[11px]" style={{ color: "#E57373" }}>{error}</p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={save}
              disabled={createMutation.isPending || !draft.title.trim() || !draft.fullText.trim()}
              className="text-xs font-semibold px-3 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: "#2D5E3F", border: "1px solid #2D5E3F", color: "#F0EDE6" }}
            >
              {createMutation.isPending ? "Adding…" : "Add intercession"}
            </button>
            <button
              type="button"
              onClick={() => { setComposing(false); setError(null); }}
              disabled={createMutation.isPending}
              className="text-xs font-semibold px-3 py-2 rounded-lg transition-opacity hover:opacity-90"
              style={{ background: "transparent", border: "1px solid rgba(143,175,150,0.3)", color: "#A8C5A0" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : picking ? (
        // "Add from a community" — attach an existing community
        // intercession to this feed.
        <div
          className="rounded-lg p-3"
          style={{ background: "rgba(46,107,64,0.06)", border: "1px solid rgba(46,107,64,0.2)" }}
        >
          <p className="text-xs mb-2" style={{ color: "rgba(143,175,150,0.7)" }}>
            Add an intercession created in one of your communities. It stays in that community and also appears here.
          </p>
          {candidatesQ.isLoading ? (
            <p className="text-xs" style={{ color: "rgba(143,175,150,0.6)" }}>Loading…</p>
          ) : (candidatesQ.data?.intercessions ?? []).length === 0 ? (
            <p className="text-xs" style={{ color: "rgba(143,175,150,0.7)" }}>
              No community intercessions available to add.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {(candidatesQ.data?.intercessions ?? []).map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => attachMutation.mutate(it.id)}
                  disabled={attachMutation.isPending}
                  className="text-left px-3 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.28)" }}
                >
                  <p className="text-sm font-semibold truncate" style={{ color: "#F0EDE6" }}>
                    {it.intention || it.name}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: "rgba(143,175,150,0.7)" }}>
                    {it.groupEmoji ?? "⛪"} {it.groupName ?? "Community"}
                  </p>
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
      ) : (
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={startNew}
            className="text-xs font-semibold px-3 py-2 rounded-full transition-opacity hover:opacity-90"
            style={{ background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.4)", color: "#A8C5A0" }}
          >
            + Add intercession
          </button>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="text-xs font-semibold px-3 py-2 rounded-full transition-opacity hover:opacity-90"
            style={{ background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.4)", color: "#A8C5A0" }}
          >
            + Add from a community
          </button>
        </div>
      )}
    </div>
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
