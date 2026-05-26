import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { openExternal } from "@/lib/openExternal";
import {
  CAC_TODAY_URL,
  CAC_READ_EVENT,
  FDD_TODAY_URL,
  FDD_READ_EVENT,
  hasReadCacToday,
  hasReadFddToday,
  markCacRead,
  markFddRead,
} from "@/lib/cacReadState";
import { Trash2 } from "lucide-react";

// Daily Group Reflection (beta).
//
// A community pins a source (CAC Daily Reflection or Forward Day by
// Day); members tap to open today's reading externally, then come back
// here to write a reflection that's shared with the whole community.
// Anyone in the community can comment on a posted reflection.
//
// The "did the user tap the reading?" signal lives in localStorage
// (see `cacReadState.ts`), so a return-from-Safari paints the "Now
// write your reflection" composer without a server round trip. The
// composer itself POSTs the reflection — that's the only piece of
// state we persist server-side.
//
// Mounted at /communities/:slug/reflection.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.6)";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const GEORGIA = "Georgia, 'Times New Roman', serif";

type Source = "cac" | "fdd";

type Reflection = {
  id: number;
  userId: number;
  authorName: string;
  authorEmail: string;
  authorAvatarUrl: string | null;
  source: Source;
  body: string;
  createdAt: string;
  updatedAt: string;
  isMine: boolean;
  comments: ReflectionComment[];
};

type ReflectionComment = {
  id: number;
  userId: number;
  authorName: string;
  authorEmail: string;
  authorAvatarUrl: string | null;
  body: string;
  createdAt: string;
  isMine: boolean;
};

type FeedResponse = {
  date: string;
  source: Source | null;
  memberCount: number;
  isAdmin: boolean;
  reflections: Reflection[];
};

// Today's local YYYY-MM-DD. en-CA renders ISO-style 2024-05-26 so the
// strings compare correctly without parsing. Same convention used by
// `cacReadState.ts`.
function todayLocalISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

// Display label + external URL for a source. The labels are NOT
// pushed through t() — these are proper-noun product names that
// publishers use in English even on Spanish surfaces. The blurb is
// translatable.
function sourceMeta(source: Source) {
  if (source === "fdd") {
    return {
      label: "Forward Day by Day",
      blurb: "from Forward Movement",
      url: FDD_TODAY_URL,
      readEvent: FDD_READ_EVENT,
      hasReadToday: hasReadFddToday,
      markRead: markFddRead,
      emoji: "📖",
    };
  }
  return {
    label: "CAC Daily Reflection",
    blurb: "from the Center for Action & Contemplation",
    url: CAC_TODAY_URL,
    readEvent: CAC_READ_EVENT,
    hasReadToday: hasReadCacToday,
    markRead: markCacRead,
    emoji: "🌅",
  };
}

// Subscribe to either CAC or FDD's "read today" event so the page
// flips from "Open reading →" to "Read again" the moment the user
// returns from Safari without a refresh. Returns the live answer.
function useHasReadToday(source: Source | null): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    if (!source) { setV(false); return; }
    const meta = sourceMeta(source);
    const update = () => setV(meta.hasReadToday());
    update();
    window.addEventListener(meta.readEvent, update);
    // Also re-check on visibilitychange — the user comes back to the
    // tab from Safari, and we want to flip the label without waiting
    // for the markRead event (which fires only on outbound tap).
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener(meta.readEvent, update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [source]);
  return v;
}

export default function CommunityReflectionPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isBeta, isLoading: betaLoading } = useBetaStatus();
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const today = todayLocalISO();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  // Bounce non-beta users straight back to the community page — the
  // server would 403 the GET below but we'd rather not render the
  // composer at all for them.
  useEffect(() => {
    if (!authLoading && !betaLoading && user && !isBeta) {
      setLocation(`/communities/${slug}`);
    }
  }, [user, isBeta, authLoading, betaLoading, slug, setLocation]);

  const feedQ = useQuery<FeedResponse>({
    queryKey: [`/api/groups/${slug}/reflections`, today],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/reflections?date=${today}`),
    enabled: !!user && !!slug && isBeta,
  });

  const source = feedQ.data?.source ?? null;
  const hasRead = useHasReadToday(source);
  const myReflection = feedQ.data?.reflections.find(r => r.isMine) ?? null;

  // Composer state — pre-fill with my reflection if I've already
  // posted one today so the textarea reads as "edit" not "write."
  const [body, setBody] = useState("");
  useEffect(() => {
    if (myReflection && body === "") setBody(myReflection.body);
  }, [myReflection?.id]);

  const writeReflection = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${slug}/reflections`, {
      date: today,
      body: body.trim(),
      source,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/groups/${slug}/reflections`, today] });
    },
  });

  const deleteReflection = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/group-reflections/${id}`),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: [`/api/groups/${slug}/reflections`, today] });
    },
  });

  if (authLoading || betaLoading || !user) return null;

  // Feature-off state — admin sees "Pick a source", member sees a
  // soft "not enabled" message with a link back to the community.
  if (feedQ.isSuccess && !source) {
    return (
      <Layout>
        <div className="max-w-xl mx-auto w-full">
          <BackLink slug={slug ?? ""} />
          <div
            className="rounded-2xl px-6 py-8 text-center mt-4"
            style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.25)" }}
          >
            <p className="text-4xl mb-3">📖</p>
            {feedQ.data?.isAdmin ? (
              <>
                <h1 className="text-xl font-bold mb-2" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                  {t("group_reflection.admin_pick_title")}
                </h1>
                <p className="text-sm mb-5" style={{ color: SAGE }}>
                  {t("group_reflection.admin_pick_body")}
                </p>
                <Link
                  href={`/communities/${slug}/settings`}
                  className="inline-block px-5 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: "#2D5E3F", color: WARM }}
                >
                  {t("group_reflection.pick_source")}
                </Link>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold mb-2" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                  {t("group_reflection.not_enabled_title")}
                </h1>
                <p className="text-sm" style={{ color: SAGE }}>
                  {t("group_reflection.not_enabled_body")}
                </p>
              </>
            )}
          </div>
        </div>
      </Layout>
    );
  }

  // Loading state — render the back link so the page header doesn't
  // pop in late.
  if (!source || feedQ.isLoading) {
    return (
      <Layout>
        <div className="max-w-xl mx-auto w-full">
          <BackLink slug={slug ?? ""} />
          <p className="text-sm mt-6 text-center" style={{ color: FAINT }}>
            {t("common.loading")}
          </p>
        </div>
      </Layout>
    );
  }

  const meta = sourceMeta(source);
  const reflections = feedQ.data?.reflections ?? [];
  const memberCount = feedQ.data?.memberCount ?? 0;

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full">
        <BackLink slug={slug ?? ""} />

        {/* Header — source name + today's count */}
        <div className="flex items-start gap-3 mb-4 mt-4">
          <div
            className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0"
            style={{ background: "rgba(62,124,122,0.18)", border: "1px solid rgba(62,124,122,0.35)" }}
          >
            {meta.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: FAINT }}>
              {t("group_reflection.todays_reflection")}
            </p>
            <h1 className="text-xl font-bold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
              {meta.label}
            </h1>
            <p className="text-xs mt-0.5" style={{ color: SAGE }}>
              {meta.blurb}
            </p>
            <p className="text-[11px] mt-2" style={{ color: FAINT }}>
              {t("group_reflection.n_of_m_reflected", { n: reflections.length, m: memberCount })}
            </p>
          </div>
        </div>

        {/* Open reading button — flips label after the user taps. */}
        <button
          type="button"
          onClick={() => {
            meta.markRead();
            void openExternal(meta.url);
          }}
          className="w-full rounded-xl py-3.5 text-center transition-opacity hover:opacity-90 active:scale-[0.99] mb-3"
          style={{
            background: hasRead ? "rgba(46,107,64,0.12)" : "#2D5E3F",
            border: `1px solid ${hasRead ? "rgba(46,107,64,0.4)" : "rgba(46,107,64,0.7)"}`,
            color: hasRead ? "#A8C5A0" : WARM,
            fontFamily: SPACE_GROTESK, fontSize: 15, fontWeight: 600, cursor: "pointer",
          }}
        >
          {hasRead ? t("group_reflection.read_again") : t("group_reflection.open_reading")}
        </button>

        {/* Composer — always rendered so a user who's already read or
            who'd rather write first isn't blocked behind the read tap.
            We don't gate on hasRead because the "you must tap first"
            UX feels prescriptive; people sometimes already have the
            reading open in a tab or read in a different reader. */}
        <div
          className="rounded-2xl p-4 mb-6"
          style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.25)" }}
        >
          <p className="text-[12px] uppercase tracking-[0.14em] font-semibold mb-2" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
            {myReflection ? t("group_reflection.your_reflection") : t("group_reflection.write_yours")}
          </p>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("group_reflection.placeholder")}
            rows={5}
            maxLength={2000}
            className="w-full rounded-xl px-3 py-2.5 text-[15px] resize-none"
            style={{
              background: "rgba(15,40,24,0.6)",
              border: "1px solid rgba(46,107,64,0.4)",
              color: WARM,
              fontFamily: GEORGIA,
              lineHeight: 1.55,
              outline: "none",
            }}
          />
          <div className="flex items-center justify-between mt-2 gap-3">
            {myReflection ? (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(t("group_reflection.delete_confirm"))) {
                    deleteReflection.mutate(myReflection.id);
                  }
                }}
                disabled={deleteReflection.isPending}
                className="text-[12px] transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ color: "rgba(217,140,74,0.85)", background: "none", border: "none", cursor: "pointer", fontFamily: SPACE_GROTESK }}
              >
                {t("group_reflection.delete_mine")}
              </button>
            ) : <span />}
            <button
              type="button"
              onClick={() => body.trim() && writeReflection.mutate()}
              disabled={writeReflection.isPending || !body.trim()}
              className="rounded-full px-5 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: "#2D5E3F", color: WARM, fontFamily: SPACE_GROTESK, cursor: "pointer" }}
            >
              {writeReflection.isPending
                ? t("group_reflection.sharing")
                : myReflection ? t("group_reflection.update") : t("group_reflection.share")}
            </button>
          </div>
          {writeReflection.isError && (
            <p className="text-[12px] mt-2" style={{ color: "#E8B872", fontFamily: SPACE_GROTESK }}>
              {t("group_reflection.couldnt_save")}
            </p>
          )}
        </div>

        {/* The group's reflections — yours first if it exists, then
            everyone else newest-first (the server already orders by
            createdAt desc, but we hoist the viewer's row to the top
            for instant recognition). */}
        {reflections.length === 0 ? (
          <p className="text-[13px] text-center py-8 italic" style={{ color: FAINT, fontFamily: GEORGIA }}>
            {t("group_reflection.empty")}
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: FAINT }}>
              {t("group_reflection.community_reflections")}
            </p>
            {[
              ...reflections.filter(r => r.isMine),
              ...reflections.filter(r => !r.isMine),
            ].map((r) => (
              <ReflectionCard
                key={r.id}
                reflection={r}
                slug={slug ?? ""}
                today={today}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

function BackLink({ slug }: { slug: string }) {
  const { t } = useTranslation();
  return (
    <Link
      href={`/communities/${slug}`}
      className="text-xs flex items-center gap-1 transition-opacity hover:opacity-70"
      style={{ color: SAGE }}
    >
      ← {t("group_reflection.back_to_community")}
    </Link>
  );
}

function Avatar({ name, email, url, size = 28 }: { name: string; email: string; url: string | null; size?: number }) {
  if (url) {
    return <img src={url} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  const initials = (name || email || "?").trim().split(/\s+/).slice(0, 2).map(s => s[0] ?? "").join("").toUpperCase() || "?";
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold"
      style={{
        width: size, height: size,
        background: "#1A4A2E", color: "#A8C5A0",
        fontSize: Math.round(size * 0.4), fontFamily: SPACE_GROTESK,
      }}
    >
      {initials}
    </div>
  );
}

function formatWhen(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

function ReflectionCard({ reflection, slug, today }: { reflection: Reflection; slug: string; today: string }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [commentBody, setCommentBody] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);

  const postComment = useMutation({
    mutationFn: () => apiRequest("POST", `/api/group-reflections/${reflection.id}/comments`, {
      body: commentBody.trim(),
    }),
    onSuccess: () => {
      setCommentBody("");
      setComposerOpen(false);
      queryClient.invalidateQueries({ queryKey: [`/api/groups/${slug}/reflections`, today] });
    },
  });

  const deleteComment = useMutation({
    mutationFn: (cid: number) =>
      apiRequest("DELETE", `/api/group-reflections/${reflection.id}/comments/${cid}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/groups/${slug}/reflections`, today] });
    },
  });

  return (
    <div
      className="rounded-2xl px-4 py-3.5"
      style={{
        background: reflection.isMine ? "rgba(62,124,122,0.14)" : "rgba(46,107,64,0.08)",
        border: `1px solid ${reflection.isMine ? "rgba(62,124,122,0.32)" : "rgba(46,107,64,0.22)"}`,
      }}
    >
      <div className="flex items-start gap-2.5">
        <Avatar
          name={reflection.authorName}
          email={reflection.authorEmail}
          url={reflection.authorAvatarUrl}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[13px] font-semibold truncate" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
              {reflection.isMine ? t("gratitude.you") : reflection.authorName}
            </p>
            <p className="text-[11px] shrink-0" style={{ color: FAINT, fontFamily: SPACE_GROTESK }}>
              {formatWhen(reflection.createdAt, i18n.language)}
            </p>
          </div>
          <p
            className="text-[15px] mt-1.5 whitespace-pre-wrap"
            style={{ color: "#E8E4D8", fontFamily: GEORGIA, lineHeight: 1.55 }}
          >
            {reflection.body}
          </p>
        </div>
      </div>

      {/* Comments — flat list. Each row has avatar + name + body +
          (optional, when mine) trash. The composer slides open below
          on tap of the "Add a comment" pill. */}
      {reflection.comments.length > 0 && (
        <div className="mt-3 ml-9 space-y-2.5">
          {reflection.comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2">
              <Avatar
                name={c.authorName}
                email={c.authorEmail}
                url={c.authorAvatarUrl}
                size={22}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[12px] font-semibold truncate" style={{ color: "#C8D4C0", fontFamily: SPACE_GROTESK }}>
                    {c.isMine ? t("gratitude.you") : c.authorName}
                  </p>
                  <p className="text-[10px] shrink-0" style={{ color: FAINT }}>
                    {formatWhen(c.createdAt, i18n.language)}
                  </p>
                </div>
                <p className="text-[13px] mt-0.5 whitespace-pre-wrap" style={{ color: "#C8D4C0", fontFamily: SPACE_GROTESK }}>
                  {c.body}
                </p>
              </div>
              {c.isMine && (
                <button
                  type="button"
                  onClick={() => deleteComment.mutate(c.id)}
                  aria-label={t("contemplation.delete")}
                  className="shrink-0 opacity-50 hover:opacity-90"
                  style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: "rgba(217,140,74,0.85)" }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Comment composer — opens below on tap. We deliberately don't
          show a comment box on your own reflection (the parent
          textarea already lets you update it). */}
      {!reflection.isMine && (
        <div className="mt-3 ml-9">
          {composerOpen ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                autoFocus
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder={t("group_reflection.comment_placeholder")}
                maxLength={1000}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && commentBody.trim() && !postComment.isPending) {
                    postComment.mutate();
                  }
                }}
                className="flex-1 rounded-full px-3 py-1.5 text-[13px]"
                style={{
                  background: "rgba(15,40,24,0.6)",
                  border: "1px solid rgba(46,107,64,0.35)",
                  color: WARM,
                  fontFamily: SPACE_GROTESK,
                  outline: "none",
                }}
              />
              <button
                type="button"
                disabled={!commentBody.trim() || postComment.isPending}
                onClick={() => postComment.mutate()}
                className="text-[12px] font-semibold disabled:opacity-40"
                style={{ color: "#A8C5A0", background: "none", border: "none", cursor: "pointer", fontFamily: SPACE_GROTESK }}
              >
                {t("group_reflection.send_comment")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="text-[12px] transition-opacity hover:opacity-80"
              style={{ color: SAGE, background: "none", border: "none", cursor: "pointer", fontFamily: SPACE_GROTESK }}
            >
              {t("group_reflection.add_comment")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
