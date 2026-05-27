import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { Trash2 } from "lucide-react";

// Sunday Service Reflection (beta).
//
// A community admin turns this on once; the bell scanner sends every
// joined member a Sunday-evening push inviting them to write a
// reflection on this week's service. The composer is open the whole
// week — members can edit until the next Sunday rolls over, when the
// week's reflections lock as history and a fresh card begins.
//
// Different cadence than the daily reflection (no external reading to
// open + no source picker), so this is its own page. Storage shares the
// `group_reflections` table with the daily flow via source='sunday'.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.6)";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const GEORGIA = "Georgia, 'Times New Roman', serif";

type Reflection = {
  id: number;
  userId: number;
  authorName: string;
  authorEmail: string;
  authorAvatarUrl: string | null;
  source: "sunday";
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

type SundayResponse = {
  enabled: boolean;
  sunday: string;          // YYYY-MM-DD of the current service week's Sunday
  memberCount: number;
  isAdmin: boolean;
  reflections: Reflection[];
};

function formatSunday(iso: string, locale?: string): string {
  const d = new Date(`${iso}T12:00:00Z`); // noon UTC keeps the date stable regardless of viewer TZ
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" });
}

function formatTime(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

export default function CommunitySundayReflectionPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isBeta, isLoading: betaLoading } = useBetaStatus();
  const { t, i18n } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    if (!authLoading && !betaLoading && user && !isBeta) {
      setLocation(`/communities/${slug}`);
    }
  }, [user, isBeta, authLoading, betaLoading, slug, setLocation]);

  const feedQ = useQuery<SundayResponse>({
    queryKey: [`/api/groups/${slug}/sunday-reflection`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/sunday-reflection`),
    enabled: !!user && !!slug && isBeta,
  });

  const myReflection = feedQ.data?.reflections.find(r => r.isMine) ?? null;
  const [body, setBody] = useState("");
  useEffect(() => {
    if (myReflection && body === "") setBody(myReflection.body);
  }, [myReflection?.id]);

  const writeReflection = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${slug}/sunday-reflection`, {
      body: body.trim(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/groups/${slug}/sunday-reflection`] });
    },
  });

  const deleteReflection = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/group-reflections/${id}`),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: [`/api/groups/${slug}/sunday-reflection`] });
    },
  });

  if (authLoading || betaLoading || !user) return null;

  // Feature off — admin sees an Enable card, member sees a soft "not
  // turned on yet" note + a link back.
  if (feedQ.isSuccess && !feedQ.data.enabled) {
    return (
      <Layout>
        <div className="max-w-xl mx-auto w-full">
          <BackLink slug={slug ?? ""} />
          <div
            className="rounded-2xl px-6 py-8 text-center mt-4"
            style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.25)" }}
          >
            <p className="text-4xl mb-3">⛪</p>
            {feedQ.data.isAdmin ? (
              <>
                <h1 className="text-xl font-bold mb-2" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                  {t("sunday_reflection.admin_enable_title")}
                </h1>
                <p className="text-sm mb-5" style={{ color: SAGE }}>
                  {t("sunday_reflection.admin_enable_body")}
                </p>
                <Link
                  href={`/communities/${slug}/settings`}
                  className="inline-block px-5 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ background: "#2D5E3F", color: WARM }}
                >
                  {t("sunday_reflection.open_settings")}
                </Link>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold mb-2" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                  {t("sunday_reflection.not_enabled_title")}
                </h1>
                <p className="text-sm" style={{ color: SAGE }}>
                  {t("sunday_reflection.not_enabled_body")}
                </p>
              </>
            )}
          </div>
        </div>
      </Layout>
    );
  }

  if (!feedQ.data) {
    return (
      <Layout>
        <div className="max-w-xl mx-auto w-full">
          <BackLink slug={slug ?? ""} />
          <p className="text-sm mt-6 text-center" style={{ color: FAINT }}>{t("common.loading")}</p>
        </div>
      </Layout>
    );
  }

  const reflections = feedQ.data.reflections;
  const memberCount = feedQ.data.memberCount;

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full">
        <BackLink slug={slug ?? ""} />

        <div className="flex items-start gap-3 mb-4 mt-4">
          <div
            className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0"
            style={{ background: "rgba(62,124,122,0.18)", border: "1px solid rgba(62,124,122,0.35)" }}
          >
            ⛪
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: FAINT }}>
              {t("sunday_reflection.eyebrow")}
            </p>
            <h1 className="text-xl font-bold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
              {formatSunday(feedQ.data.sunday, i18n.language)}
            </h1>
            <p className="text-xs mt-0.5" style={{ color: SAGE }}>
              {t("sunday_reflection.subtitle")}
            </p>
            <p className="text-[11px] mt-2" style={{ color: FAINT }}>
              {t("sunday_reflection.n_of_m_reflected", { n: reflections.length, m: memberCount })}
            </p>
          </div>
        </div>

        {/* Composer */}
        <div
          className="rounded-2xl p-4 mb-6"
          style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.25)" }}
        >
          <p className="text-[12px] uppercase tracking-[0.14em] font-semibold mb-2" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
            {myReflection ? t("sunday_reflection.your_reflection") : t("sunday_reflection.write_yours")}
          </p>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("sunday_reflection.placeholder")}
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
              <SundayReflectionCard key={r.id} reflection={r} slug={slug ?? ""} />
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

function SundayReflectionCard({ reflection, slug }: { reflection: Reflection; slug: string }) {
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
      queryClient.invalidateQueries({ queryKey: [`/api/groups/${slug}/sunday-reflection`] });
    },
  });

  const deleteComment = useMutation({
    mutationFn: (cid: number) =>
      apiRequest("DELETE", `/api/group-reflections/${reflection.id}/comments/${cid}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/groups/${slug}/sunday-reflection`] });
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
              {formatTime(reflection.createdAt, i18n.language)}
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
                    {formatTime(c.createdAt, i18n.language)}
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
