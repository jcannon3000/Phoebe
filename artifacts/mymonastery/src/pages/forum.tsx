/**
 * Group forum — a message board inside a community/group.
 *
 * Lists the group's posts newest-first and lets any joined member start a
 * thread. Tapping a post opens the thread (/communities/:slug/forum/:postId)
 * with its replies. Built for the El Jardín portal but works inside any group.
 */

import { useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const BG_CARD = "rgba(46,107,64,0.10)";
const BORDER = "rgba(46,107,64,0.22)";
const CTA = "#2D5E3F";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type ForumPost = {
  id: number;
  title: string | null;
  body: string;
  createdAt: string;
  authorUserId: number;
  authorName: string | null;
  authorAvatarUrl: string | null;
  replyCount: number;
  isMine: boolean;
};
type ForumList = { isAdmin: boolean; posts: ForumPost[] };

function shortWhen(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const mins = Math.floor((Date.now() - then) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return "";
  }
}

export default function ForumPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const { data, isLoading, isError } = useQuery<ForumList>({
    queryKey: [`/api/groups/${slug}/forum`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/forum`),
  });

  const create = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/groups/${slug}/forum`, { title: title.trim() || undefined, body: body.trim() }),
    onSuccess: () => {
      setTitle("");
      setBody("");
      setComposing(false);
      qc.invalidateQueries({ queryKey: [`/api/groups/${slug}/forum`] });
    },
  });

  const posts = data?.posts ?? [];

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24 px-4 sm:px-0">
        <Link href={`/communities/${slug}`} className="inline-flex items-center gap-1.5 text-sm mb-3" style={{ color: SAGE }}>
          <ChevronLeft size={14} /> {t("forum.back", { defaultValue: "Back to group" })}
        </Link>

        <div className="flex items-center justify-between gap-3 mb-4">
          <h1 className="text-2xl font-bold" style={{ color: WARM, fontFamily: FONT }}>
            {t("forum.title", { defaultValue: "Forum" })}
          </h1>
          {!composing && (
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="rounded-full px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: CTA, color: WARM, fontFamily: FONT }}
            >
              {t("forum.new_post", { defaultValue: "New post" })}
            </button>
          )}
        </div>

        {composing && (
          <div className="rounded-2xl p-4 mb-5" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder={t("forum.title_placeholder", { defaultValue: "Title (optional)" })}
              className="w-full px-3 py-2 mb-2 rounded-xl text-sm outline-none"
              style={{ background: "rgba(200,212,192,0.06)", border: `1px solid ${BORDER}`, color: WARM, fontFamily: FONT }}
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={8000}
              rows={4}
              placeholder={t("forum.body_placeholder", { defaultValue: "Share something with the group…" })}
              className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
              style={{ background: "rgba(200,212,192,0.06)", border: `1px solid ${BORDER}`, color: WARM, fontFamily: "Georgia, serif" }}
            />
            <div className="flex items-center justify-end gap-2 mt-3">
              <button
                type="button"
                onClick={() => { setComposing(false); setTitle(""); setBody(""); }}
                className="rounded-full px-4 py-2 text-sm font-semibold"
                style={{ background: "transparent", color: SAGE, border: `1px solid ${BORDER}`, fontFamily: FONT }}
              >
                {t("common.cancel", { defaultValue: "Cancel" })}
              </button>
              <button
                type="button"
                disabled={!body.trim() || create.isPending}
                onClick={() => create.mutate()}
                className="rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ background: CTA, color: WARM, fontFamily: FONT }}
              >
                {create.isPending ? t("common.posting", { defaultValue: "Posting…" }) : t("forum.post", { defaultValue: "Post" })}
              </button>
            </div>
            {create.isError && (
              <p className="text-xs mt-2" style={{ color: "#E59A9A" }}>
                {t("forum.post_failed", { defaultValue: "Couldn't post — try again." })}
              </p>
            )}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm" style={{ color: SAGE }}>{t("common.loading", { defaultValue: "Loading…" })}</p>
        ) : isError ? (
          <p className="text-sm" style={{ color: "#E59A9A" }}>{t("forum.load_failed", { defaultValue: "Couldn't load the forum." })}</p>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl p-6 text-center" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
            <div className="text-3xl mb-2">💬</div>
            <p className="text-sm" style={{ color: SAGE, fontFamily: "Georgia, serif", fontStyle: "italic" }}>
              {t("forum.empty", { defaultValue: "No posts yet. Be the first to start the conversation." })}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {posts.map((p) => (
              <Link
                key={p.id}
                href={`/communities/${slug}/forum/${p.id}`}
                className="rounded-2xl p-4 transition-opacity hover:opacity-90 active:scale-[0.99] block"
                style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}
              >
                {p.title && (
                  <p className="text-[15px] font-semibold leading-tight mb-1" style={{ color: WARM, fontFamily: FONT }}>{p.title}</p>
                )}
                <p className="text-[13.5px] leading-snug line-clamp-2" style={{ color: "rgba(240,237,230,0.85)", fontFamily: "Georgia, serif" }}>
                  {p.body}
                </p>
                <div className="flex items-center gap-2 mt-2.5 text-[11.5px]" style={{ color: SAGE, fontFamily: FONT }}>
                  <span>{p.isMine ? t("forum.you", { defaultValue: "You" }) : (p.authorName ?? t("forum.someone", { defaultValue: "Someone" }))}</span>
                  <span aria-hidden>·</span>
                  <span>{shortWhen(p.createdAt)}</span>
                  <span className="ml-auto inline-flex items-center gap-1">
                    <MessageSquare size={12} /> {p.replyCount}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
