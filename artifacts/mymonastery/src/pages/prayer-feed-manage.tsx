import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
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

// `paused` is surfaced to creators as "Off" — the everyday "stop showing
// this feed" switch (see the schema state-machine doc). Draft/Live keep
// their literal names.
const STATE_LABELS: Record<FeedState, string> = {
  draft: "Draft",
  live: "Live",
  paused: "Off",
};

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

        {/* Feed header — admins can tap the pencil to edit name +
            description inline. Title is required (server min(1)),
            description is optional (max 200 chars per the schema). */}
        <FeedHeaderSection
          feed={feed}
          onSave={(patch) => updateFeed.mutate(patch)}
          isSaving={updateFeed.isPending}
        />

        {/* State toggle — "Off" is the paused state: the feed vanishes
            from discovery, its bound communities, and the feeds of people
            already subscribed, and daily nudges stop. Subscriptions are
            kept, so flipping back to Live restores it for everyone. */}
        <div className="mb-6">
          <p
            className="text-[10px] font-semibold uppercase tracking-widest mb-1.5"
            style={{ color: "rgba(143,175,150,0.6)" }}
          >
            Status
          </p>
          <div className="flex gap-2">
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
                {STATE_LABELS[s]}
              </button>
            ))}
          </div>
          <p className="text-[11px] mt-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
            {feed.state === "live"
              ? "Published — anyone subscribed sees its prayers and it can be found and shared."
              : feed.state === "paused"
                ? "Off — hidden from discovery, its communities, and current subscribers' feeds. Subscriptions are kept; turn it back to Live to restore it."
                : "Draft — only you can see this feed while you set it up."}
          </p>
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

        {/* Share-link affordance — only meaningful while the feed is
            public. /feed/:slug is the no-login landing page; tapping
            this drops the canonical URL into the native iOS share
            sheet (or copies it to the clipboard on desktop). */}
        {feed.visibility === "public" && (
          <ShareLinkSection slug={feed.slug} title={feed.title} tagline={feed.tagline} />
        )}

        {/* Intercessions — the feed's whole content. A flat, ongoing
            list of community intercessions, authored here with a
            Prayer / Action chooser. */}
        <FeedIntercessionsSection slug={slug!} />

        {/* Events — time-bound happenings (vigils, days of prayer,
            webinars) the manager announces to subscribers. */}
        <FeedEventsSection slug={slug!} />

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

// ── Share link (public feeds only) ────────────────────────────────────────
// Renders the public /feed/:slug URL with a primary "Share" / "Copy"
// action. On the iOS Capacitor shell + any device with the Web Share
// API, this surfaces the system share sheet (Messages, Mail, social
// apps, copy to clipboard); on desktop browsers without it we fall
// Editable feed header — name + description. Read-only by default,
// flips to two inputs + Save/Cancel when the admin taps Edit. Empties
// out tagline cleanly (sends null) so an admin can wipe a stale
// description without setting it to a single space.
function FeedHeaderSection({
  feed,
  onSave,
  isSaving,
}: {
  feed: Feed;
  onSave: (patch: { title?: string; tagline?: string | null }) => void;
  isSaving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(feed.title);
  const [tagline, setTagline] = useState(feed.tagline ?? "");

  function startEdit() {
    setTitle(feed.title);
    setTagline(feed.tagline ?? "");
    setEditing(true);
  }
  function cancel() {
    setEditing(false);
  }
  function save() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const trimmedTagline = tagline.trim();
    const patch: { title?: string; tagline?: string | null } = {};
    if (trimmedTitle !== feed.title) patch.title = trimmedTitle;
    // tagline is nullable: empty string → null so the description is
    // actually cleared rather than stored as "".
    const taglineForServer = trimmedTagline.length === 0 ? null : trimmedTagline;
    if (taglineForServer !== (feed.tagline ?? null)) patch.tagline = taglineForServer;
    if (Object.keys(patch).length > 0) onSave(patch);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-start gap-3 mb-2">
        <div
          className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0"
          style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.3)" }}
        >
          {feed.coverEmoji ?? "🕊️"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1
              className="text-xl font-bold leading-tight"
              style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {feed.title}
            </h1>
            <button
              type="button"
              onClick={startEdit}
              className="text-[11px] font-medium px-2 py-0.5 rounded-full transition-opacity hover:opacity-80"
              style={{
                background: "rgba(46,107,64,0.18)",
                border: "1px solid rgba(46,107,64,0.35)",
                color: "#A8C5A0",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
              aria-label="Edit feed name and description"
            >
              Edit
            </button>
          </div>
          {feed.tagline && (
            <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>{feed.tagline}</p>
          )}
          <p className="text-[11px] mt-1" style={{ color: "rgba(143,175,150,0.6)" }}>
            {feed.subscriberCount} subscriber{feed.subscriberCount === 1 ? "" : "s"} · {STATE_LABELS[feed.state]}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 mb-2">
      <div
        className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0"
        style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.3)" }}
      >
        {feed.coverEmoji ?? "🕊️"}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="Feed name"
          className="px-3 py-2 text-base font-bold rounded-lg"
          style={{
            background: "rgba(200,212,192,0.06)",
            border: "1px solid rgba(46,107,64,0.35)",
            color: "#F0EDE6",
            fontFamily: "'Space Grotesk', sans-serif",
            outline: "none",
          }}
          autoFocus
        />
        <textarea
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          maxLength={200}
          placeholder="Optional description — one line about this feed."
          rows={2}
          className="px-3 py-2 text-sm rounded-lg resize-none"
          style={{
            background: "rgba(200,212,192,0.06)",
            border: "1px solid rgba(46,107,64,0.35)",
            color: "#F0EDE6",
            fontFamily: "'Space Grotesk', sans-serif",
            outline: "none",
          }}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={isSaving || !title.trim()}
            className="text-xs font-semibold px-3 py-1.5 rounded-full disabled:opacity-50"
            style={{
              background: "#2D5E3F",
              border: "1px solid rgba(46,107,64,0.6)",
              color: "#F0EDE6",
              fontFamily: "'Space Grotesk', sans-serif",
              cursor: title.trim() ? "pointer" : "not-allowed",
            }}
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={isSaving}
            className="text-xs font-medium px-3 py-1.5"
            style={{
              color: "rgba(143,175,150,0.85)",
              fontFamily: "'Space Grotesk', sans-serif",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <span className="text-[10px] ml-auto" style={{ color: "rgba(143,175,150,0.5)" }}>
            {tagline.length}/200
          </span>
        </div>
      </div>
    </div>
  );
}

// back to a plain clipboard copy with a brief "Copied" confirmation.
//
// The base URL is hardcoded to the production host on purpose: a
// shareable link minted from window.location.origin would be wrong in
// the Capacitor webview (capacitor://localhost) and on any preview
// deploy, so we always link to the canonical site regardless of where
// the admin happens to be when they tap Share.
function ShareLinkSection({
  slug,
  title,
  tagline,
}: {
  slug: string;
  title: string;
  tagline: string | null;
}) {
  const url = `https://withphoebe.app/feed/${slug}`;
  const [copied, setCopied] = useState(false);
  const canShare =
    typeof navigator !== "undefined" &&
    typeof (navigator as Navigator & { share?: unknown }).share === "function";

  async function handleShare() {
    if (canShare) {
      try {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title,
          text: tagline ?? "A prayer feed on Phoebe",
          url,
        });
        return;
      } catch {
        // User dismissed the share sheet, or sharing wasn't actually
        // available. Fall through to the clipboard path.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable; the URL is right above for manual copy. */
    }
  }

  return (
    <div className="mb-6">
      <p
        className="text-[10px] font-semibold uppercase tracking-widest mb-1.5"
        style={{ color: "rgba(143,175,150,0.6)" }}
      >
        Share link
      </p>
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2"
        style={{
          background: "rgba(46,107,64,0.08)",
          border: "1px solid rgba(46,107,64,0.22)",
        }}
      >
        <span
          className="flex-1 truncate text-[12px]"
          style={{
            color: "#A8C5A0",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
          title={url}
        >
          {url}
        </span>
        <button
          type="button"
          onClick={handleShare}
          className="text-[11px] font-semibold uppercase tracking-widest px-3 py-1.5 rounded-full transition-opacity hover:opacity-85"
          style={{
            background: "rgba(46,107,64,0.35)",
            border: "1px solid rgba(46,107,64,0.55)",
            color: "#F0EDE6",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {copied ? "Copied" : canShare ? "Share" : "Copy"}
        </button>
      </div>
      <p className="text-[11px] mt-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
        Anyone can pray this feed at the link above — no account needed. They'll be invited to sign up at the end.
      </p>
    </div>
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
  // When non-null the composer edits an existing intercession via PATCH
  // instead of creating one via POST — same form, different verb. Set by
  // startEdit(item); cleared by startNew(), Cancel, or a successful save.
  const [editingId, setEditingId] = useState<number | null>(null);
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

  function closeComposer() {
    setComposing(false);
    setEditingId(null);
    setDraft({ source: "custom", title: "", fullText: "", learnMoreUrl: "" });
    setError(null);
  }

  const createMutation = useMutation({
    mutationFn: (payload: { source: string; title: string; fullText: string; learnMoreUrl: string | null }) =>
      apiRequest("POST", `/api/prayer-feeds/${slug}/intercessions`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/intercessions`] });
      closeComposer();
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Couldn't add the intercession.");
    },
  });

  // Editing — PATCHes the existing intercession. Same payload shape as
  // create (the server validates a partial against the same schema), but
  // we always send all four fields so the user's choice is unambiguous
  // (no surprise "I cleared the URL but the column still has the old
  // value" because we forgot to include the null).
  const editMutation = useMutation({
    mutationFn: (args: { id: number; payload: { source: string; title: string; fullText: string; learnMoreUrl: string | null } }) =>
      apiRequest("PATCH", `/api/prayer-feeds/${slug}/intercessions/${args.id}`, args.payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/intercessions`] });
      // Also bust /moments/:id query so the detail page reads the new
      // copy without a manual refresh.
      qc.invalidateQueries({ queryKey: ["/api/moments"] });
      closeComposer();
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : "Couldn't save the changes.");
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
    setEditingId(null);
    setComposing(true);
  }

  function startEdit(it: FeedIntercession) {
    setDraft({
      // The server stores "bcp" / "custom" / "action"; the chooser only
      // exposes custom & action, so coerce anything else (legacy "bcp"
      // or null) back to "custom" so the toggle has a valid selection.
      source: it.intercessionSource === "action" ? "action" : "custom",
      title: it.intention || it.name || "",
      fullText: it.intercessionFullText ?? "",
      learnMoreUrl: it.learnMoreUrl ?? "",
    });
    setError(null);
    setEditingId(it.id);
    setComposing(true);
  }
  function save() {
    if (!draft.title.trim() || !draft.fullText.trim()) return;
    if (draft.source === "action" && !draft.learnMoreUrl.trim()) {
      setError("An action needs a link.");
      return;
    }
    const payload = {
      source: draft.source,
      title: draft.title.trim(),
      fullText: draft.fullText.trim(),
      // The link is required for an action ("Take action →" pill) and
      // optional for a written prayer ("Learn more →" pill — used to
      // link the article a prayer is responding to).
      learnMoreUrl: draft.learnMoreUrl.trim() || null,
    };
    if (editingId != null) {
      editMutation.mutate({ id: editingId, payload });
    } else {
      createMutation.mutate(payload);
    }
  }
  const savePending = createMutation.isPending || editMutation.isPending;

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
            // Row container is a div (not a button) so the inline Edit
            // pencil can be its own button without nesting interactive
            // elements. The left text region keeps the tap-to-open
            // affordance; the right-hand pencil opens the composer in
            // edit mode without navigating away.
            <div
              key={it.id}
              className="w-full rounded-xl px-4 py-3 flex items-center gap-3"
              style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.45)" }}
            >
              <button
                type="button"
                onClick={() => setLocation(`/moments/${it.id}`)}
                className="min-w-0 flex-1 text-left bg-transparent transition-opacity hover:opacity-90"
              >
                <p className="text-sm font-semibold truncate" style={{ color: "#F0EDE6" }}>
                  {it.intention || it.name}
                </p>
                {it.intercessionFullText && (
                  <p className="text-[11px] mt-0.5 truncate" style={{ color: "rgba(143,175,150,0.7)" }}>
                    {it.intercessionFullText}
                  </p>
                )}
              </button>
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
              <button
                type="button"
                aria-label="Edit intercession"
                onClick={() => startEdit(it)}
                className="shrink-0 rounded-full p-1.5 transition-opacity hover:opacity-90"
                style={{
                  background: "rgba(46,107,64,0.18)",
                  border: "1px solid rgba(46,107,64,0.4)",
                  color: "#A8C5A0",
                  cursor: "pointer",
                  lineHeight: 0,
                }}
              >
                <Pencil size={14} />
              </button>
            </div>
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
              disabled={savePending || !draft.title.trim() || !draft.fullText.trim()}
              className="text-xs font-semibold px-3 py-2 rounded-lg transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: "#2D5E3F", border: "1px solid #2D5E3F", color: "#F0EDE6" }}
            >
              {savePending
                ? (editingId != null ? "Saving…" : "Adding…")
                : (editingId != null ? "Save changes" : "Add intercession")}
            </button>
            <button
              type="button"
              onClick={closeComposer}
              disabled={savePending}
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
type FeedEvent = {
  id: number;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  joinUrl: string | null;
  state: "published" | "cancelled";
};

// Format an ISO timestamp for a human-readable manage-row label.
function formatEventWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

// Events section — mirrors FeedIntercessionsSection. Manager publishes
// time-bound events (vigils, days of prayer, webinars) subscribers see.
function FeedEventsSection({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [composing, setComposing] = useState(false);
  const [hasLink, setHasLink] = useState(false);
  const [draft, setDraft] = useState<{
    title: string;
    description: string;
    startsAt: string;   // datetime-local value
    endsAt: string;     // datetime-local value
    location: string;
    joinUrl: string;
  }>({ title: "", description: "", startsAt: "", endsAt: "", location: "", joinUrl: "" });
  const [error, setError] = useState<string | null>(null);

  // ?all=1 so the manage view also shows past events.
  const listQ = useQuery<{ events: FeedEvent[] }>({
    queryKey: [`/api/prayer-feeds/${slug}/events`, "manage"],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${slug}/events?all=1`),
  });
  const events = listQ.data?.events ?? [];

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest("POST", `/api/prayer-feeds/${slug}/events`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/events`, "manage"] });
      qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/events`] });
      setComposing(false);
      setHasLink(false);
      setDraft({ title: "", description: "", startsAt: "", endsAt: "", location: "", joinUrl: "" });
      setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't add the event."),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/prayer-feeds/${slug}/events/${id}`, { state: "cancelled" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/events`, "manage"] });
      qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/events`] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/prayer-feeds/${slug}/events/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/events`, "manage"] });
      qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/events`] });
    },
  });

  function save() {
    if (!draft.title.trim() || !draft.startsAt) {
      setError("A title and a start time are required.");
      return;
    }
    // datetime-local has no timezone — new Date() reads it as local,
    // toISOString() converts to UTC for the server.
    const startsIso = new Date(draft.startsAt).toISOString();
    const endsIso = draft.endsAt ? new Date(draft.endsAt).toISOString() : null;
    if (endsIso && new Date(endsIso) <= new Date(startsIso)) {
      setError("End time must be after the start time.");
      return;
    }
    if (hasLink && !draft.joinUrl.trim()) {
      setError("Add a link, or turn off the video / link toggle.");
      return;
    }
    createMutation.mutate({
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      startsAt: startsIso,
      endsAt: endsIso,
      location: draft.location.trim() || null,
      joinUrl: hasLink ? draft.joinUrl.trim() : null,
    });
  }

  const inputStyle = { borderColor: "rgba(46,107,64,0.4)", color: "#F0EDE6" } as const;

  return (
    <div className="mb-8">
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,212,192,0.55)" }}>
        Events
      </p>
      <p className="text-xs mb-3" style={{ color: "rgba(143,175,150,0.7)" }}>
        Vigils, days of prayer, webinars. Subscribers see upcoming events and get a heads-up push.
      </p>

      <div className="space-y-2 mb-3">
        {events.map((ev) => {
          const cancelled = ev.state === "cancelled";
          return (
            <div
              key={ev.id}
              className="rounded-xl px-4 py-3 flex items-center gap-3"
              style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.45)", opacity: cancelled ? 0.6 : 1 }}
            >
              <div className="min-w-0 flex-1">
                <p
                  className="text-sm font-semibold truncate"
                  style={{ color: "#F0EDE6", textDecoration: cancelled ? "line-through" : undefined }}
                >
                  {ev.title}
                </p>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: "rgba(143,175,150,0.7)" }}>
                  {formatEventWhen(ev.startsAt)}{ev.location ? ` · ${ev.location}` : ""}
                </p>
              </div>
              {cancelled ? (
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(ev.id)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0"
                  style={{ background: "transparent", border: "1px solid rgba(193,154,58,0.4)", color: "#E8B872" }}
                >
                  Delete
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined" && !window.confirm(`Cancel "${ev.title}"?`)) return;
                    cancelMutation.mutate(ev.id);
                  }}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0"
                  style={{ background: "rgba(46,107,64,0.2)", border: "1px solid rgba(46,107,64,0.45)", color: "#C8D4C0" }}
                >
                  Cancel
                </button>
              )}
            </div>
          );
        })}
        {events.length === 0 && !listQ.isLoading && (
          <p className="text-xs italic px-1" style={{ color: "rgba(143,175,150,0.5)" }}>
            No events yet.
          </p>
        )}
      </div>

      {composing ? (
        <div
          className="rounded-lg p-3 space-y-3"
          style={{ background: "rgba(46,107,64,0.06)", border: "1px solid rgba(46,107,64,0.2)" }}
        >
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(200,212,192,0.5)" }}>
              Title
            </label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              maxLength={120}
              placeholder="e.g. Climate Prayer Vigil"
              className="w-full px-3 py-2 rounded-lg border outline-none bg-transparent text-sm"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(200,212,192,0.5)" }}>
              Description (optional)
            </label>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              maxLength={2000}
              rows={3}
              placeholder="What is it, and who's it for?"
              className="w-full px-3 py-2 rounded-lg border outline-none bg-transparent text-sm resize-none"
              style={inputStyle}
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(200,212,192,0.5)" }}>
                Starts
              </label>
              <input
                type="datetime-local"
                value={draft.startsAt}
                onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border outline-none bg-transparent text-sm"
                style={inputStyle}
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(200,212,192,0.5)" }}>
                Ends (optional)
              </label>
              <input
                type="datetime-local"
                value={draft.endsAt}
                onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border outline-none bg-transparent text-sm"
                style={inputStyle}
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(200,212,192,0.5)" }}>
              Location (optional)
            </label>
            <input
              type="text"
              value={draft.location}
              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              maxLength={200}
              placeholder="e.g. St. Mary's, or 'Online'"
              className="w-full px-3 py-2 rounded-lg border outline-none bg-transparent text-sm"
              style={inputStyle}
            />
          </div>
          {/* Video / link toggle — mirrors the Prayer/Action chooser. */}
          <button
            type="button"
            onClick={() => setHasLink((v) => !v)}
            className="text-left rounded-lg px-3 py-2 w-full transition-opacity"
            style={{
              background: hasLink ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.08)",
              border: `1px solid ${hasLink ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.25)"}`,
            }}
          >
            <p className="text-xs font-semibold" style={{ color: "#F0EDE6" }}>📹 Video / link event</p>
            <p className="text-[10px] mt-0.5" style={{ color: "rgba(143,175,150,0.7)" }}>
              Adds a "Join →" button to the event.
            </p>
          </button>
          {hasLink && (
            <input
              type="url"
              value={draft.joinUrl}
              onChange={(e) => setDraft({ ...draft, joinUrl: e.target.value })}
              maxLength={500}
              placeholder="https://zoom.us/…"
              className="w-full px-3 py-2 rounded-lg border outline-none bg-transparent text-sm"
              style={inputStyle}
            />
          )}

          {error && <p className="text-xs" style={{ color: "#E8B872" }}>{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={createMutation.isPending}
              className="flex-1 text-sm font-semibold rounded-full py-2 disabled:opacity-50"
              style={{ background: "#2E6B40", color: "#F0EDE6" }}
            >
              {createMutation.isPending ? "Publishing…" : "Publish event"}
            </button>
            <button
              type="button"
              onClick={() => { setComposing(false); setError(null); }}
              className="text-sm font-medium rounded-full px-4 py-2"
              style={{ background: "transparent", border: "1px solid rgba(46,107,64,0.4)", color: "#8FAF96" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setError(null); setComposing(true); }}
          className="text-sm font-semibold rounded-full px-4 py-2 transition-opacity hover:opacity-90"
          style={{ background: "rgba(46,107,64,0.22)", border: "1px solid rgba(46,107,64,0.45)", color: "#C8D4C0" }}
        >
          + Add an event
        </button>
      )}
    </div>
  );
}

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
