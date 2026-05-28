import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

// ── /messages/:id — Beta Messages thread ────────────────────────────────
//
// The 1:1 conversation: messages oldest→newest as bubbles, a fixed
// compose bar at the bottom. Unlimited — send as many as you like.
// Polls every 15s so the other person's replies appear while you're
// reading. Opening the thread marks it read (server-side, on GET).

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

type Message = { id: number; senderUserId: number; isMine: boolean; body: string; createdAt: string };
type ThreadResponse = {
  conversation: { id: number; otherUser: { id: number; name: string; email: string; avatarUrl: string | null } | null };
  messages: Message[];
};

function Avatar({ name, email, url, size = 30 }: { name: string; email: string; url: string | null; size?: number }) {
  if (url) {
    return <img src={url} alt={name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  const initials = (name || email || "?").trim().split(/\s+/).slice(0, 2).map(s => s[0] ?? "").join("").toUpperCase() || "?";
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold shrink-0"
      style={{ width: size, height: size, background: "#1A4A2E", color: "#A8C5A0", fontSize: Math.round(size * 0.4), fontFamily: FONT }}
    >
      {initials}
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function MessageThreadPage() {
  const { id } = useParams<{ id: string }>();
  const convId = Number(id);
  const { user, isLoading: authLoading } = useAuth();
  const { isBeta, isLoading: betaLoading } = useBetaStatus();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

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
  // incoming poll, or our own send).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: (body: string) =>
      apiRequest("POST", `/api/beta-messages/conversations/${convId}/messages`, { body }),
    onSuccess: (res: { message: Message }) => {
      // Append to the open thread + clear the box; refresh the inbox.
      queryClient.setQueryData<ThreadResponse>(queryKey, (prev) =>
        prev ? { ...prev, messages: [...prev.messages, res.message] } : prev);
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["/api/beta-messages/conversations"] });
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
    },
  });

  const submit = () => {
    const body = draft.trim();
    if (!body || send.isPending) return;
    send.mutate(body);
  };

  if (authLoading || betaLoading || !user) return null;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full" style={{ paddingBottom: 104 }}>
        {/* Thread header */}
        <div className="flex items-center gap-3 mb-4 mt-1">
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
              {other ? (other.name || other.email) : "Conversation"}
            </p>
          </div>
        </div>

        {isLoading && messages.length === 0 ? (
          <p className="text-sm text-center py-10" style={{ color: "rgba(143,175,150,0.6)" }}>Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-[13px] text-center py-10 italic" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SERIF }}>
            No messages yet. Say hello 🌿
          </p>
        ) : (
          <div className="space-y-2.5">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.isMine ? "justify-end" : "justify-start"}`}>
                <div
                  className="rounded-2xl px-3.5 py-2.5"
                  style={{
                    maxWidth: "82%",
                    background: m.isMine ? "rgba(62,124,122,0.22)" : "rgba(46,107,64,0.14)",
                    border: `1px solid ${m.isMine ? "rgba(62,124,122,0.4)" : "rgba(46,107,64,0.28)"}`,
                    borderBottomRightRadius: m.isMine ? 6 : 16,
                    borderBottomLeftRadius: m.isMine ? 16 : 6,
                  }}
                >
                  <p className="text-[15px] whitespace-pre-wrap" style={{ color: "#E8E4D8", fontFamily: SERIF, lineHeight: 1.5, margin: 0 }}>
                    {m.body}
                  </p>
                  <p className="text-[10px] mt-1 text-right" style={{ color: "rgba(143,175,150,0.6)", fontFamily: FONT }}>
                    {formatTime(m.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Fixed compose bar. Layout is body-scroll with no bottom tab bar,
          so a viewport-fixed bar sits cleanly above the home indicator. */}
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40,
          background: "#0A1A0F", borderTop: "1px solid rgba(46,107,64,0.3)",
          paddingTop: 10, paddingLeft: 14, paddingRight: 14,
          paddingBottom: "max(10px, env(safe-area-inset-bottom))",
        }}
      >
        <div className="max-w-2xl mx-auto w-full flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a message…"
            rows={1}
            maxLength={8000}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter inserts a newline.
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            className="flex-1 rounded-2xl px-3.5 py-2.5 text-[15px] resize-none"
            style={{
              background: "rgba(15,40,24,0.7)", border: "1px solid rgba(46,107,64,0.4)",
              color: WARM, fontFamily: FONT, outline: "none", maxHeight: 120, lineHeight: 1.4,
            }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim() || send.isPending}
            className="rounded-full px-4 py-2.5 text-sm font-semibold shrink-0 transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: "#2D5E3F", color: WARM, fontFamily: FONT, cursor: draft.trim() ? "pointer" : "default" }}
          >
            {send.isPending ? "…" : "Send"}
          </button>
        </div>
      </div>
    </Layout>
  );
}
