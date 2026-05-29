import { useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";

// ── /messages/:id — Beta Messages thread ────────────────────────────────
//
// The conversation rendered as letter-style cards (matching the Letters
// correspondence look): each message is a card with the sender's avatar,
// a name · time label, and a serif body, with a left-edge accent marking
// whose message it is. Writing happens on the full-screen paper composer
// (/messages/:id/write) reached from the "Write a message" button —
// unlimited, send as many as you like. Polls every 15s so the other
// person's replies appear while you're reading; opening the thread marks
// it read (server-side, on GET).

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

type Message = { id: number; senderUserId: number; isMine: boolean; body: string; createdAt: string };
type ThreadResponse = {
  conversation: { id: number; otherUser: { id: number; name: string; email: string; avatarUrl: string | null } | null };
  messages: Message[];
};

function Avatar({ name, email, url, size = 32 }: { name: string; email: string; url: string | null; size?: number }) {
  if (url) {
    return <img src={url} alt={name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size, border: "1px solid rgba(46,107,64,0.35)" }} />;
  }
  const initials = (name || email || "?").trim().split(/\s+/).slice(0, 2).map(s => s[0] ?? "").join("").toUpperCase() || "?";
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold shrink-0"
      style={{ width: size, height: size, background: "#1A4A2E", color: "#A8C5A0", fontSize: Math.round(size * 0.38), fontFamily: FONT, border: "1px solid rgba(46,107,64,0.35)" }}
    >
      {initials}
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function MessageThreadPage() {
  const { id } = useParams<{ id: string }>();
  const convId = Number(id);
  const { user, isLoading: authLoading } = useAuth();
  const { isBeta, isLoading: betaLoading } = useBetaStatus();
  const [, setLocation] = useLocation();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);
  useEffect(() => {
    if (!authLoading && !betaLoading && user && !isBeta) setLocation("/dashboard");
  }, [user, isBeta, authLoading, betaLoading, setLocation]);

  const queryKey = [`/api/beta-messages/conversations/${convId}`];
  const { data, isLoading } = useQuery<ThreadResponse>({
    queryKey,
    queryFn: () => apiRequest("GET", `/api/beta-messages/conversations/${convId}`),
    enabled: !!user && isBeta && Number.isFinite(convId),
    refetchInterval: 15_000,
  });

  const messages = data?.messages ?? [];
  const other = data?.conversation?.otherUser ?? null;

  // Auto-scroll to the newest message whenever the count changes (load,
  // incoming poll, or returning from the composer after a send).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages.length]);

  if (authLoading || betaLoading || !user) return null;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full" style={{ paddingBottom: 96 }}>
        {/* Thread header */}
        <div className="flex items-center gap-3 mb-5 mt-1">
          <button
            type="button"
            onClick={() => setLocation("/messages")}
            className="text-sm shrink-0"
            style={{ color: SAGE, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FONT }}
          >
            ←
          </button>
          {other && <Avatar name={other.name} email={other.email} url={other.avatarUrl} size={36} />}
          <div className="min-w-0">
            <p className="text-base font-semibold truncate" style={{ color: WARM, fontFamily: FONT }}>
              {other ? (other.name || other.email) : t("messages.conversation_fallback")}
            </p>
          </div>
        </div>

        {isLoading && messages.length === 0 ? (
          <p className="text-sm text-center py-10" style={{ color: "rgba(143,175,150,0.6)" }}>{t("common.loading")}</p>
        ) : messages.length === 0 ? (
          <p className="text-[13px] text-center py-10 italic" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SERIF }}>
            {t("messages.empty_thread")}
          </p>
        ) : (
          <div>
            {messages.map((m) => {
              const author = m.isMine
                ? { name: t("messages.you", { defaultValue: "You" }), email: user.email, url: user.avatarUrl }
                : { name: other?.name || other?.email || "", email: other?.email || "", url: other?.avatarUrl ?? null };
              return (
                <div key={m.id} className="mb-3">
                  <div
                    className="relative flex gap-3"
                    // Left-edge accent (inset shadow, so border-radius clips
                    // it flush) marks whose message this is — sage for mine,
                    // muted green for theirs. Same treatment as the letter
                    // correspondence cards.
                    style={{
                      background: "#0F2818",
                      border: `1px solid rgba(92,122,95,${m.isMine ? "0.35" : "0.2"})`,
                      borderRadius: "14px",
                      padding: "14px 16px",
                      boxShadow: `inset 3px 0 0 ${m.isMine ? "#8FAF96" : "rgba(46,107,64,0.4)"}, 0 2px 6px rgba(0,0,0,0.35)`,
                    }}
                  >
                    <Avatar name={author.name} email={author.email} url={author.url} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase mb-1" style={{ color: SAGE, letterSpacing: "0.1em", fontFamily: FONT }}>
                        {author.name} · {formatWhen(m.createdAt)}
                      </p>
                      <p className="text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: "#C8D4C0", fontFamily: SERIF, margin: 0 }}>
                        {m.body}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Fixed "Write a message" bar — opens the full-screen paper
          composer. Replaces the old inline chat input so writing a message
          uses the same surface as writing a letter. */}
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40,
          background: "#0A1A0F", borderTop: "1px solid rgba(46,107,64,0.3)",
          paddingTop: 10, paddingLeft: 14, paddingRight: 14,
          paddingBottom: "max(10px, env(safe-area-inset-bottom))",
        }}
      >
        <div className="max-w-2xl mx-auto w-full">
          <button
            type="button"
            onClick={() => setLocation(`/messages/${convId}/write`)}
            className="w-full rounded-2xl py-3 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: "#2D5E3F", color: WARM, fontFamily: FONT }}
          >
            {messages.length === 0
              ? t("messages.write_first", { defaultValue: "Write your first message" })
              : t("messages.write_a_message", { defaultValue: "Write a message" })}
          </button>
        </div>
      </div>
    </Layout>
  );
}
