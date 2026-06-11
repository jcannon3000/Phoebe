/**
 * Forum thread — a single post and its replies inside a group forum.
 *
 * Any joined member can reply (flat). The author or a group admin can delete
 * the post (which removes its replies) or any reply.
 */

import { useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const BG_CARD = "rgba(46,107,64,0.10)";
const BORDER = "rgba(46,107,64,0.22)";
const CTA = "#2D5E3F";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, serif";

type Reply = {
  id: number;
  body: string;
  createdAt: string;
  authorUserId: number;
  authorName: string | null;
  authorAvatarUrl: string | null;
  isMine: boolean;
  canDelete: boolean;
};
type Thread = {
  post: {
    id: number;
    title: string | null;
    body: string;
    createdAt: string;
    authorUserId: number;
    authorName: string | null;
    authorAvatarUrl: string | null;
    isMine: boolean;
    canDelete: boolean;
  };
  replies: Reply[];
};

function whenLabel(iso: string): string {
  try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  catch { return ""; }
}

export default function ForumThreadPage() {
  const { slug, postId } = useParams<{ slug: string; postId: string }>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [reply, setReply] = useState("");

  const key = [`/api/groups/${slug}/forum/${postId}`];
  const { data, isLoading, isError } = useQuery<Thread>({
    queryKey: key,
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/forum/${postId}`),
  });

  const addReply = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${slug}/forum/${postId}/replies`, { body: reply.trim() }),
    onSuccess: () => { setReply(""); qc.invalidateQueries({ queryKey: key }); },
  });

  const deletePost = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/groups/${slug}/forum/${postId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/groups/${slug}/forum`] });
      setLocation(`/communities/${slug}/forum`);
    },
  });

  const deleteReply = useMutation({
    mutationFn: (replyId: number) => apiRequest("DELETE", `/api/groups/${slug}/forum/replies/${replyId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const post = data?.post;
  const replies = data?.replies ?? [];

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24 px-4 sm:px-0">
        <Link href={`/communities/${slug}/forum`} className="inline-flex items-center gap-1.5 text-sm mb-3" style={{ color: SAGE }}>
          <ChevronLeft size={14} /> {t("forum.back_to_forum", { defaultValue: "Forum" })}
        </Link>

        {isLoading ? (
          <p className="text-sm" style={{ color: SAGE }}>{t("common.loading", { defaultValue: "Loading…" })}</p>
        ) : isError || !post ? (
          <p className="text-sm" style={{ color: "#E59A9A" }}>{t("forum.thread_missing", { defaultValue: "This post couldn't be found." })}</p>
        ) : (
          <>
            <div className="rounded-2xl p-4 mb-5" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
              {post.title && (
                <h1 className="text-xl font-bold leading-tight mb-1.5" style={{ color: WARM, fontFamily: FONT }}>{post.title}</h1>
              )}
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: WARM, fontFamily: SERIF }}>{post.body}</p>
              <div className="flex items-center gap-2 mt-3 text-[11.5px]" style={{ color: SAGE, fontFamily: FONT }}>
                <span>{post.isMine ? t("forum.you", { defaultValue: "You" }) : (post.authorName ?? t("forum.someone", { defaultValue: "Someone" }))}</span>
                <span aria-hidden>·</span>
                <span>{whenLabel(post.createdAt)}</span>
                {post.canDelete && (
                  <button
                    type="button"
                    onClick={() => { if (confirm(t("forum.confirm_delete_post", { defaultValue: "Delete this post and its replies?" }))) deletePost.mutate(); }}
                    className="ml-auto inline-flex items-center gap-1 hover:opacity-80"
                    style={{ background: "none", border: "none", color: "rgba(229,154,154,0.85)", cursor: "pointer" }}
                  >
                    <Trash2 size={12} /> {t("common.delete", { defaultValue: "Delete" })}
                  </button>
                )}
              </div>
            </div>

            <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}>
              {replies.length} {replies.length === 1 ? t("forum.reply", { defaultValue: "reply" }) : t("forum.replies", { defaultValue: "replies" })}
            </p>

            <div className="flex flex-col gap-2 mb-5">
              {replies.map((r) => (
                <div key={r.id} className="rounded-xl p-3.5" style={{ background: "rgba(46,107,64,0.07)", border: `1px solid ${BORDER}` }}>
                  <p className="text-[14px] leading-relaxed whitespace-pre-wrap" style={{ color: WARM, fontFamily: SERIF }}>{r.body}</p>
                  <div className="flex items-center gap-2 mt-2 text-[11px]" style={{ color: SAGE, fontFamily: FONT }}>
                    <span>{r.isMine ? t("forum.you", { defaultValue: "You" }) : (r.authorName ?? t("forum.someone", { defaultValue: "Someone" }))}</span>
                    <span aria-hidden>·</span>
                    <span>{whenLabel(r.createdAt)}</span>
                    {r.canDelete && (
                      <button
                        type="button"
                        onClick={() => deleteReply.mutate(r.id)}
                        className="ml-auto inline-flex items-center gap-1 hover:opacity-80"
                        style={{ background: "none", border: "none", color: "rgba(229,154,154,0.8)", cursor: "pointer" }}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl p-3" style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                maxLength={8000}
                rows={3}
                placeholder={t("forum.reply_placeholder", { defaultValue: "Write a reply…" })}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                style={{ background: "rgba(200,212,192,0.06)", border: `1px solid ${BORDER}`, color: WARM, fontFamily: SERIF }}
              />
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  disabled={!reply.trim() || addReply.isPending}
                  onClick={() => addReply.mutate()}
                  className="rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50"
                  style={{ background: CTA, color: WARM, fontFamily: FONT }}
                >
                  {addReply.isPending ? t("common.posting", { defaultValue: "Posting…" }) : t("forum.reply_cta", { defaultValue: "Reply" })}
                </button>
              </div>
              {addReply.isError && (
                <p className="text-xs mt-2" style={{ color: "#E59A9A" }}>{t("forum.reply_failed", { defaultValue: "Couldn't post your reply — try again." })}</p>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
