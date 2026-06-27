import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { FROST } from "@/lib/frost";

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
// their literal names. The labels themselves are built per-component as
// t()-driven locals (see `stateLabels` below).

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
  const { t } = useTranslation();
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
  // A leaf photo behind the whole manage surface (frosted cards sit over it).
  const bgPhoto = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

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

  // Feed-state labels (paused → "Off"), built from translations.
  const stateLabels: Record<FeedState, string> = {
    draft: t("prayer_feed_manage.state_draft"),
    live: t("prayer_feed_manage.state_live"),
    paused: t("prayer_feed_manage.state_off"),
  };

  // ── Render ──────────────────────────────────────────────────────────────
  if (authLoading || !user || feedQ.isLoading) {
    return (
      <Layout bgPhoto={bgPhoto}>
        <div className="max-w-lg mx-auto w-full py-12 text-sm" style={{ color: "#8FAF96" }}>
          {t("prayer_feed_manage.loading")}
        </div>
      </Layout>
    );
  }
  if (!feed || !feedQ.data?.isCreator) {
    return (
      <Layout bgPhoto={bgPhoto}>
        <div className="max-w-lg mx-auto w-full py-12 text-sm" style={{ color: "#8FAF96" }}>
          {t("prayer_feed_manage.not_available")}
        </div>
      </Layout>
    );
  }

  return (
    <Layout bgPhoto={bgPhoto}>
      <div className="max-w-xl mx-auto w-full">
        <button
          onClick={() => setLocation("/dashboard")}
          className="text-xs mb-4 flex items-center gap-1 transition-opacity hover:opacity-70"
          style={{ color: "#8FAF96" }}
        >
          ← {t("prayer_feed_manage.back")}
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
            {t("prayer_feed_manage.status")}
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
                {stateLabels[s]}
              </button>
            ))}
          </div>
          <p className="text-[11px] mt-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
            {feed.state === "live"
              ? t("prayer_feed_manage.status_live_desc")
              : feed.state === "paused"
                ? t("prayer_feed_manage.status_off_desc")
                : t("prayer_feed_manage.status_draft_desc")}
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
            {t("prayer_feed_manage.visibility")}
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
              ? t("prayer_feed_manage.visibility_public_desc")
              : t("prayer_feed_manage.visibility_private_desc")}
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
            {t("prayer_feed_manage.danger_zone")}
          </p>
          <p className="text-xs mb-3" style={{ color: "rgba(143,175,150,0.7)" }}>
            {t("prayer_feed_manage.danger_desc")}
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
              {t("prayer_feed_manage.delete_feed")}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => deleteFeed.mutate()}
                disabled={deleteFeed.isPending}
                className="text-xs font-semibold px-4 py-2 rounded-full transition-opacity hover:opacity-85 disabled:opacity-50"
                style={{ background: "#A84848", border: "1px solid #A84848", color: "#FFFFFF" }}
              >
                {deleteFeed.isPending ? t("prayer_feed_manage.deleting") : t("prayer_feed_manage.confirm_delete")}
              </button>
              <button
                onClick={() => setDeleteConfirmArmed(false)}
                disabled={deleteFeed.isPending}
                className="text-xs font-semibold px-4 py-2 rounded-full transition-opacity hover:opacity-85 disabled:opacity-50"
                style={{ background: "transparent", border: "1px solid rgba(143,175,150,0.3)", color: "#8FAF96" }}
              >
                {t("prayer_feed_manage.cancel")}
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
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(feed.title);
  const [tagline, setTagline] = useState(feed.tagline ?? "");

  // Feed-state labels (paused → "Off"), built from translations.
  const stateLabels: Record<FeedState, string> = {
    draft: t("prayer_feed_manage.state_draft"),
    live: t("prayer_feed_manage.state_live"),
    paused: t("prayer_feed_manage.state_off"),
  };

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
              aria-label={t("prayer_feed_manage.edit_header_aria")}
            >
              {t("prayer_feed_manage.edit")}
            </button>
          </div>
          {feed.tagline && (
            <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>{feed.tagline}</p>
          )}
          <p className="text-[11px] mt-1" style={{ color: "rgba(143,175,150,0.6)" }}>
            {t("prayer_feed_manage.subscriber_count", { count: feed.subscriberCount })} · {stateLabels[feed.state]}
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
          placeholder={t("prayer_feed_manage.feed_name_placeholder")}
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
          placeholder={t("prayer_feed_manage.feed_description_placeholder")}
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
            {isSaving ? t("prayer_feed_manage.saving") : t("prayer_feed_manage.save")}
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
            {t("prayer_feed_manage.cancel")}
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
  const { t } = useTranslation();
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
          text: tagline ?? t("prayer_feed_manage.share_text"),
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
        {t("prayer_feed_manage.share_link")}
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
          {copied ? t("prayer_feed_manage.copied") : canShare ? t("prayer_feed_manage.share") : t("prayer_feed_manage.copy")}
        </button>
      </div>
      <p className="text-[11px] mt-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
        {t("prayer_feed_manage.share_hint")}
      </p>
    </div>
  );
}

// ── Composer form (shared between inline-edit and "add new") ─────────────
//
// Rendered in-place inside the item row when editing, or below the list
// when adding a new intercession. Extracted so the same JSX isn't
// duplicated in both call sites.
interface ComposerFormProps {
  draft: { source: "custom" | "action"; title: string; fullText: string; learnMoreUrl: string };
  setDraft: (d: ComposerFormProps["draft"]) => void;
  editingId: number | null;
  savePending: boolean;
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
}

function ComposerForm({ draft, setDraft, editingId, savePending, error, onSave, onCancel }: ComposerFormProps) {
  const { t } = useTranslation();
  const inputStyle = {
    background: "rgba(200,212,192,0.06)",
    border: "1px solid rgba(46,107,64,0.35)",
    color: "#F0EDE6",
    fontFamily: "'Space Grotesk', sans-serif",
    outline: "none",
  } as const;

  return (
    <>
      {/* Prayer / Action type toggle */}
      <div className="flex gap-2">
        {(["custom", "action"] as const).map((src) => (
          <button
            key={src}
            type="button"
            onClick={() => setDraft({ ...draft, source: src })}
            className="text-xs font-semibold px-3 py-1.5 rounded-full transition-opacity"
            style={{
              background: draft.source === src ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.08)",
              border: `1px solid ${draft.source === src ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.25)"}`,
              color: draft.source === src ? "#F0EDE6" : "#8FAF96",
              cursor: "pointer",
            }}
          >
            {src === "custom" ? `🙏 ${t("prayer_feed_manage.type_prayer")}` : `🌍 ${t("prayer_feed_manage.type_action")}`}
          </button>
        ))}
      </div>
      <p className="text-[11px]" style={{ color: "rgba(143,175,150,0.6)" }}>
        {draft.source === "action"
          ? t("prayer_feed_manage.type_action_desc")
          : t("prayer_feed_manage.type_prayer_desc")}
      </p>

      {/* Title / intention */}
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(200,212,192,0.5)" }}>
          {t("prayer_feed_manage.title_intention_label")}
        </label>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          maxLength={200}
          placeholder={t("prayer_feed_manage.title_intention_placeholder")}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          className="w-full px-3 py-2 rounded-lg text-sm"
          style={inputStyle}
        />
      </div>

      {/* Prayer text */}
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(200,212,192,0.5)" }}>
          {t("prayer_feed_manage.prayer_text_label")}
        </label>
        <textarea
          value={draft.fullText}
          onChange={(e) => setDraft({ ...draft, fullText: e.target.value })}
          maxLength={2000}
          rows={4}
          placeholder={t("prayer_feed_manage.prayer_text_placeholder")}
          className="w-full px-3 py-2 rounded-lg text-sm resize-none"
          style={inputStyle}
        />
      </div>

      {/* Link — required for Action, optional for Prayer */}
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(200,212,192,0.5)" }}>
          {draft.source === "action" ? t("prayer_feed_manage.action_link_label") : t("prayer_feed_manage.learn_more_link_label")}
        </label>
        <input
          type="url"
          value={draft.learnMoreUrl}
          onChange={(e) => setDraft({ ...draft, learnMoreUrl: e.target.value })}
          maxLength={500}
          placeholder="https://…"
          className="w-full px-3 py-2 rounded-lg text-sm"
          style={inputStyle}
        />
      </div>

      {error && <p className="text-xs" style={{ color: "#E8B872" }}>{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={savePending}
          className="flex-1 text-sm font-semibold rounded-full py-2 disabled:opacity-50"
          style={{ background: "#2E6B40", color: "#F0EDE6", cursor: savePending ? "not-allowed" : "pointer" }}
        >
          {savePending ? t("prayer_feed_manage.saving") : editingId != null ? t("prayer_feed_manage.save_changes") : t("prayer_feed_manage.add_intercession")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={savePending}
          className="text-sm font-medium rounded-full px-4 py-2 disabled:opacity-50"
          style={{ background: "transparent", border: "1px solid rgba(46,107,64,0.4)", color: "#8FAF96", cursor: "pointer" }}
        >
          {t("prayer_feed_manage.cancel")}
        </button>
      </div>
    </>
  );
}

// ── Intercessions composer ──────────────────────────────────────────────
//
// The feed's whole content surface: a flat, ongoing list of community
// intercessions, each authored with a Prayer / Action type toggle.
function FeedIntercessionsSection({ slug }: { slug: string }) {
  const { t } = useTranslation();
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
      setError(e instanceof Error ? e.message : t("prayer_feed_manage.err_add_intercession"));
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
      setError(e instanceof Error ? e.message : t("prayer_feed_manage.err_save_changes"));
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
  // A long feed (e.g. a daily calendar) shouldn't fill the whole page — show a
  // handful of cards, fade the rest out, and let the editor expand on tap. Stay
  // expanded while editing so the inline form is never hidden.
  const [showAll, setShowAll] = useState(false);
  const COLLAPSED_COUNT = 6;
  const expanded = showAll || editingId !== null;
  const visibleItems = expanded ? items : items.slice(0, COLLAPSED_COUNT);
  const hiddenCount = items.length - visibleItems.length;

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
      setError(t("prayer_feed_manage.err_action_needs_link"));
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
        {t("prayer_feed_manage.intercessions")}
      </p>
      <p className="text-xs mb-3" style={{ color: "rgba(143,175,150,0.7)" }}>
        {t("prayer_feed_manage.intercessions_desc")}
      </p>

      <div className="relative">
      <div className="space-y-2 mb-3">
        {visibleItems.map((it) => {
          const isAction = it.intercessionSource === "action";
          // When this item is being edited, expand the form inline in
          // place of the row — no scrolling needed.
          if (composing && editingId === it.id) {
            return (
              <div
                key={it.id}
                className="rounded-lg p-3 space-y-3"
                style={{ background: "rgba(46,107,64,0.06)", border: "1px solid rgba(46,107,64,0.5)" }}
              >
                <ComposerForm
                  draft={draft}
                  setDraft={setDraft}
                  editingId={editingId}
                  savePending={savePending}
                  error={error}
                  onSave={save}
                  onCancel={closeComposer}
                />
              </div>
            );
          }
          return (
            <div
              key={it.id}
              className="w-full rounded-xl px-4 py-3 flex items-center gap-3"
              style={{ ...FROST, border: "1px solid rgba(46,107,64,0.45)" }}
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
                  🌍 {t("prayer_feed_manage.type_action")}
                </span>
              )}
              <button
                type="button"
                aria-label={t("prayer_feed_manage.edit_intercession_aria")}
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
            {t("prayer_feed_manage.no_intercessions")}
          </p>
        )}
      </div>
      {/* Fade the bottom of the collapsed list so it reads as "more below". */}
      {!expanded && hiddenCount > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0"
          style={{ height: 96, background: "linear-gradient(180deg, rgba(9,26,16,0) 0%, rgba(9,26,16,0.85) 80%)" }}
        />
      )}
      </div>
      {/* Show all / fewer toggle — only when the list is long enough to collapse. */}
      {items.length > COLLAPSED_COUNT && editingId === null && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full rounded-xl text-center mb-3 transition-opacity hover:opacity-90 active:scale-[0.99]"
          style={{ ...FROST, padding: "10px 16px", border: "1px solid rgba(200,212,192,0.3)", color: "#F0EDE6", fontSize: 13, fontWeight: 600 }}
        >
          {showAll
            ? t("prayer_feed_manage.show_fewer", { defaultValue: "Show fewer" })
            : t("prayer_feed_manage.show_all", { count: hiddenCount, defaultValue: `Show all ${items.length}` })}
        </button>
      )}

      {/* "Add new" composer — only shown when composing a brand-new item,
          not when editing an existing one (that form is inline above). */}
      {composing && editingId === null ? (
        <div
          className="rounded-lg p-3 space-y-3"
          style={{ background: "rgba(46,107,64,0.06)", border: "1px solid rgba(46,107,64,0.2)" }}
        >
          <ComposerForm
            draft={draft}
            setDraft={setDraft}
            editingId={editingId}
            savePending={savePending}
            error={error}
            onSave={save}
            onCancel={closeComposer}
          />
        </div>
      ) : picking ? (
        // "Add from a community" — attach an existing community
        // intercession to this feed.
        <div
          className="rounded-lg p-3"
          style={{ background: "rgba(46,107,64,0.06)", border: "1px solid rgba(46,107,64,0.2)" }}
        >
          <p className="text-xs mb-2" style={{ color: "rgba(143,175,150,0.7)" }}>
            {t("prayer_feed_manage.picker_intro")}
          </p>
          {candidatesQ.isLoading ? (
            <p className="text-xs" style={{ color: "rgba(143,175,150,0.6)" }}>{t("prayer_feed_manage.loading")}</p>
          ) : (candidatesQ.data?.intercessions ?? []).length === 0 ? (
            <p className="text-xs" style={{ color: "rgba(143,175,150,0.7)" }}>
              {t("prayer_feed_manage.no_community_intercessions")}
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
                    {it.groupEmoji ?? "⛪"} {it.groupName ?? t("prayer_feed_manage.community_fallback")}
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
            {t("prayer_feed_manage.cancel")}
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
            + {t("prayer_feed_manage.add_intercession")}
          </button>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="text-xs font-semibold px-3 py-2 rounded-full transition-opacity hover:opacity-90"
            style={{ background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.4)", color: "#A8C5A0" }}
          >
            + {t("prayer_feed_manage.add_from_community")}
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
  // "draft" = imported/unreviewed (e.g. scraped from RMM); hidden from
  // subscribers until an admin publishes it.
  state: "draft" | "published" | "cancelled";
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

// ISO (UTC) → a <input type="datetime-local"> value in the viewer's local
// time, so editing an event pre-fills correctly and round-trips back through
// new Date(value).toISOString().
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Events section — mirrors FeedIntercessionsSection. Manager publishes
// time-bound events (vigils, days of prayer, webinars) subscribers see.
function FeedEventsSection({ slug }: { slug: string }) {
  const { t } = useTranslation();
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
  // When set, the composer is editing this event (PATCH) rather than
  // creating a new one (POST).
  const [editingId, setEditingId] = useState<number | null>(null);

  function invalidateEvents() {
    qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/events`, "manage"] });
    qc.invalidateQueries({ queryKey: [`/api/prayer-feeds/${slug}/events`] });
  }
  function resetComposer() {
    setComposing(false);
    setEditingId(null);
    setHasLink(false);
    setDraft({ title: "", description: "", startsAt: "", endsAt: "", location: "", joinUrl: "" });
    setError(null);
  }
  function startEdit(ev: FeedEvent) {
    setEditingId(ev.id);
    setComposing(true);
    setHasLink(!!ev.joinUrl);
    setDraft({
      title: ev.title,
      description: ev.description ?? "",
      startsAt: toLocalInput(ev.startsAt),
      endsAt: ev.endsAt ? toLocalInput(ev.endsAt) : "",
      location: ev.location ?? "",
      joinUrl: ev.joinUrl ?? "",
    });
    setError(null);
  }

  // ?all=1 so the manage view also shows past events.
  const listQ = useQuery<{ events: FeedEvent[] }>({
    queryKey: [`/api/prayer-feeds/${slug}/events`, "manage"],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${slug}/events?all=1`),
  });
  const events = listQ.data?.events ?? [];

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest("POST", `/api/prayer-feeds/${slug}/events`, payload),
    onSuccess: () => { invalidateEvents(); resetComposer(); },
    onError: (e) => setError(e instanceof Error ? e.message : t("prayer_feed_manage.err_add_event")),
  });

  // Edit an existing event's fields (used to clean up scraped drafts —
  // fix the placeholder time, add a location — before publishing). Leaves
  // the event's state unchanged; publishing is the separate button below.
  const updateMutation = useMutation({
    mutationFn: (vars: { id: number; payload: Record<string, unknown> }) =>
      apiRequest("PATCH", `/api/prayer-feeds/${slug}/events/${vars.id}`, vars.payload),
    onSuccess: () => { invalidateEvents(); resetComposer(); },
    onError: (e) => setError(e instanceof Error ? e.message : t("prayer_feed_manage.err_save_event")),
  });

  // Promote a draft to live (visible to subscribers + the calendar).
  const publishMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/prayer-feeds/${slug}/events/${id}`, { state: "published" }),
    onSuccess: invalidateEvents,
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
      setError(t("prayer_feed_manage.err_title_start_required"));
      return;
    }
    // datetime-local has no timezone — new Date() reads it as local,
    // toISOString() converts to UTC for the server.
    const startsIso = new Date(draft.startsAt).toISOString();
    const endsIso = draft.endsAt ? new Date(draft.endsAt).toISOString() : null;
    if (endsIso && new Date(endsIso) <= new Date(startsIso)) {
      setError(t("prayer_feed_manage.err_end_after_start"));
      return;
    }
    if (hasLink && !draft.joinUrl.trim()) {
      setError(t("prayer_feed_manage.err_link_or_toggle_off"));
      return;
    }
    const payload = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      startsAt: startsIso,
      endsAt: endsIso,
      location: draft.location.trim() || null,
      joinUrl: hasLink ? draft.joinUrl.trim() : null,
    };
    if (editingId != null) updateMutation.mutate({ id: editingId, payload });
    else createMutation.mutate(payload);
  }

  const inputStyle = { borderColor: "rgba(46,107,64,0.4)", color: "#F0EDE6" } as const;

  return (
    <div className="mb-8">
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,212,192,0.55)" }}>
        {t("prayer_feed_manage.events")}
      </p>
      <p className="text-xs mb-3" style={{ color: "rgba(143,175,150,0.7)" }}>
        {t("prayer_feed_manage.events_desc")}
      </p>

      <div className="space-y-2 mb-3">
        {events.map((ev) => {
          const isDraft = ev.state === "draft";
          const cancelled = ev.state === "cancelled";
          const pill = "text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0";
          return (
            <div
              key={ev.id}
              className="rounded-xl px-4 py-3 flex items-center gap-3"
              style={{ background: "#0F2818", border: `1px solid ${isDraft ? "rgba(193,154,58,0.45)" : "rgba(46,107,64,0.45)"}`, opacity: cancelled ? 0.6 : 1 }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p
                    className="text-sm font-semibold truncate"
                    style={{ color: "#F0EDE6", textDecoration: cancelled ? "line-through" : undefined }}
                  >
                    {ev.title}
                  </p>
                  {isDraft && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0" style={{ background: "rgba(193,154,58,0.18)", color: "#E8B872" }}>{t("prayer_feed_manage.event_draft_pill")}</span>
                  )}
                  {cancelled && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0" style={{ background: "rgba(143,175,150,0.15)", color: "rgba(200,212,192,0.7)" }}>{t("prayer_feed_manage.event_cancelled_pill")}</span>
                  )}
                </div>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: "rgba(143,175,150,0.7)" }}>
                  {formatEventWhen(ev.startsAt)}{ev.location ? ` · ${ev.location}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isDraft && (
                  <button
                    type="button"
                    onClick={() => publishMutation.mutate(ev.id)}
                    disabled={publishMutation.isPending}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 disabled:opacity-50"
                    style={{ background: "#2E6B40", color: "#F0EDE6" }}
                  >
                    {t("prayer_feed_manage.publish")}
                  </button>
                )}
                {!cancelled && (
                  <button
                    type="button"
                    onClick={() => startEdit(ev)}
                    className={pill}
                    style={{ background: "rgba(46,107,64,0.2)", border: "1px solid rgba(46,107,64,0.45)", color: "#C8D4C0" }}
                  >
                    {t("prayer_feed_manage.edit")}
                  </button>
                )}
                {cancelled || isDraft ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== "undefined" && !window.confirm(t("prayer_feed_manage.confirm_delete_event", { title: ev.title }))) return;
                      deleteMutation.mutate(ev.id);
                    }}
                    className={pill}
                    style={{ background: "transparent", border: "1px solid rgba(193,154,58,0.4)", color: "#E8B872" }}
                  >
                    {t("prayer_feed_manage.delete")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== "undefined" && !window.confirm(t("prayer_feed_manage.confirm_cancel_event", { title: ev.title }))) return;
                      cancelMutation.mutate(ev.id);
                    }}
                    className={pill}
                    style={{ background: "rgba(46,107,64,0.2)", border: "1px solid rgba(46,107,64,0.45)", color: "#C8D4C0" }}
                  >
                    {t("prayer_feed_manage.cancel")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {events.length === 0 && !listQ.isLoading && (
          <p className="text-xs italic px-1" style={{ color: "rgba(143,175,150,0.5)" }}>
            {t("prayer_feed_manage.no_events")}
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
              {t("prayer_feed_manage.event_title_label")}
            </label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              maxLength={120}
              placeholder={t("prayer_feed_manage.event_title_placeholder")}
              className="w-full px-3 py-2 rounded-lg border outline-none bg-transparent text-sm"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(200,212,192,0.5)" }}>
              {t("prayer_feed_manage.event_description_label")}
            </label>
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              maxLength={2000}
              rows={3}
              placeholder={t("prayer_feed_manage.event_description_placeholder")}
              className="w-full px-3 py-2 rounded-lg border outline-none bg-transparent text-sm resize-none"
              style={inputStyle}
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(200,212,192,0.5)" }}>
                {t("prayer_feed_manage.event_starts_label")}
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
                {t("prayer_feed_manage.event_ends_label")}
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
              {t("prayer_feed_manage.event_location_label")}
            </label>
            <input
              type="text"
              value={draft.location}
              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              maxLength={200}
              placeholder={t("prayer_feed_manage.event_location_placeholder")}
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
            <p className="text-xs font-semibold" style={{ color: "#F0EDE6" }}>📹 {t("prayer_feed_manage.video_link_event")}</p>
            <p className="text-[10px] mt-0.5" style={{ color: "rgba(143,175,150,0.7)" }}>
              {t("prayer_feed_manage.video_link_hint")}
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
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex-1 text-sm font-semibold rounded-full py-2 disabled:opacity-50"
              style={{ background: "#2E6B40", color: "#F0EDE6" }}
            >
              {editingId != null
                ? (updateMutation.isPending ? t("prayer_feed_manage.saving") : t("prayer_feed_manage.save_changes"))
                : (createMutation.isPending ? t("prayer_feed_manage.publishing") : t("prayer_feed_manage.publish_event"))}
            </button>
            <button
              type="button"
              onClick={resetComposer}
              className="text-sm font-medium rounded-full px-4 py-2"
              style={{ background: "transparent", border: "1px solid rgba(46,107,64,0.4)", color: "#8FAF96" }}
            >
              {t("prayer_feed_manage.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setEditingId(null); setError(null); setComposing(true); }}
          className="text-sm font-semibold rounded-full px-4 py-2 transition-opacity hover:opacity-90"
          style={{ background: "rgba(46,107,64,0.22)", border: "1px solid rgba(46,107,64,0.45)", color: "#C8D4C0" }}
        >
          + {t("prayer_feed_manage.add_event")}
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
  const { t } = useTranslation();
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
        {t("prayer_feed_manage.communities")}
      </p>
      <p className="text-xs mb-3" style={{ color: "rgba(143,175,150,0.7)" }}>
        {t("prayer_feed_manage.communities_desc")}
      </p>

      {bound.length === 0 && (
        <p className="text-xs mb-3" style={{ color: "rgba(143,175,150,0.55)" }}>
          {t("prayer_feed_manage.no_communities_bound")}
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
              {g.groupEmoji ?? "⛪"} {g.groupName ?? t("prayer_feed_manage.group_unknown")}
            </span>
            <button
              type="button"
              onClick={() => {
                if (confirm(t("prayer_feed_manage.confirm_remove_community", { name: g.groupName ?? t("prayer_feed_manage.this_community") }))) {
                  removeMutation.mutate(g.groupId);
                }
              }}
              disabled={removeMutation.isPending}
              className="text-[11px] font-semibold transition-opacity hover:opacity-70"
              style={{ color: "rgba(232,176,176,0.9)", background: "transparent", border: "none", cursor: "pointer" }}
            >
              {t("prayer_feed_manage.remove")}
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
          + {t("prayer_feed_manage.add_community")}
        </button>
      ) : (
        <div
          className="rounded-lg p-3"
          style={{ background: "rgba(46,107,64,0.06)", border: "1px solid rgba(46,107,64,0.2)" }}
        >
          {availableGroups.length === 0 ? (
            <p className="text-xs" style={{ color: "rgba(143,175,150,0.7)" }}>
              {t("prayer_feed_manage.no_more_communities")}
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
            {t("prayer_feed_manage.cancel")}
          </button>
        </div>
      )}
    </div>
  );
}
