import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { apiRequest } from "@/lib/queryClient";
import { useComposerScroll } from "@/hooks/useComposerScroll";

// ── /messages/:id/write — paper composer for Beta Messages ──────────────
//
// The same full-screen "paper" writing surface as a letter
// (Letters/WriteLetter), minus the limits: no word floor/ceiling, no
// turn-based gating, no confirm step — you can send as many messages as
// you like. The other person's most recent message is shown above the
// textarea so you can re-read what you're replying to, exactly like the
// letter composer's "responding to this" card.

const PAPER = "#F8F3EC";
const INK = "#2C1810";
const SAGE = "#5C7A5F";
const MUTE = "#9a9390";
const CARD = "#FBF8F2";
const HAIR = "#EDE6D9";
const SERIF = "Georgia, 'Times New Roman', serif";
const FONT = "'Space Grotesk', sans-serif";
const MAX_CHARS = 8000;

type Message = { id: number; senderUserId: number; isMine: boolean; body: string; createdAt: string };
type ThreadResponse = {
  conversation: { id: number; otherUser: { id: number; name: string; email: string; avatarUrl: string | null } | null };
  messages: Message[];
};

export default function MessageWritePage() {
  const { id } = useParams<{ id: string }>();
  const convId = Number(id);
  const { user, isLoading: authLoading } = useAuth();
  const { isBeta, isLoading: betaLoading } = useBetaStatus();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [content, setContent] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const { textareaRef, keyboardH, viewportH } = useComposerScroll(content);

  // Drafts are kept device-locally (localStorage) per conversation, so
  // backing out of the composer and coming back doesn't lose what you
  // typed. Unlike letter drafts these aren't synced server-side — a quick
  // message doesn't need to follow you across devices.
  const draftKey = `phoebe.msgDraft.${convId}`;
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Restore the saved draft once when the conversation is known.
  useEffect(() => {
    if (!Number.isFinite(convId)) return;
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) setContent(saved);
    } catch { /* localStorage unavailable */ }
    return () => { if (savedTimer.current) clearTimeout(savedTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]);

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setContent(v);
    try {
      if (v) localStorage.setItem(draftKey, v);
      else localStorage.removeItem(draftKey);
    } catch { /* ignore */ }
    // Debounced "Draft saved" pip so it confirms persistence without
    // flickering on every keystroke.
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => {
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 1500);
    }, 600);
  }

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);
  useEffect(() => {
    if (!authLoading && !betaLoading && user && !isBeta) setLocation("/dashboard");
  }, [user, isBeta, authLoading, betaLoading, setLocation]);

  // Paper theme — override the dark app background while writing, restore
  // on unmount. Mirrors the letter composer so the surface feels identical.
  useEffect(() => {
    const root = document.getElementById("root");
    const prevRoot = root?.style.backgroundColor;
    const prevBody = document.body.style.backgroundColor;
    const prevHtml = document.documentElement.style.backgroundColor;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyHeight = document.body.style.height;
    const prevHtmlHeight = document.documentElement.style.height;
    if (root) root.style.backgroundColor = PAPER;
    document.body.style.backgroundColor = PAPER;
    document.documentElement.style.backgroundColor = PAPER;
    document.body.style.overflow = "auto";
    document.documentElement.style.overflow = "auto";
    document.body.style.height = "auto";
    document.documentElement.style.height = "auto";
    return () => {
      if (root) root.style.backgroundColor = prevRoot || "";
      document.body.style.backgroundColor = prevBody || "";
      document.documentElement.style.backgroundColor = prevHtml || "";
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.height = prevBodyHeight;
      document.documentElement.style.height = prevHtmlHeight;
    };
  }, []);

  const queryKey = [`/api/beta-messages/conversations/${convId}`];
  const { data } = useQuery<ThreadResponse>({
    queryKey,
    queryFn: () => apiRequest("GET", `/api/beta-messages/conversations/${convId}`),
    enabled: !!user && isBeta && Number.isFinite(convId),
  });

  const other = data?.conversation?.otherUser ?? null;
  const otherName = other ? (other.name || other.email.split("@")[0]) : "";
  // Newest message from the other side — drives the "responding to this"
  // card. Messages arrive oldest→newest, so walk from the end.
  const respondingTo = (() => {
    const msgs = data?.messages ?? [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (!msgs[i].isMine) return msgs[i];
    }
    return null;
  })();

  const send = useMutation({
    mutationFn: (body: string) =>
      apiRequest("POST", `/api/beta-messages/conversations/${convId}/messages`, { body }),
    onSuccess: () => {
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/beta-messages/conversations"] });
      setLocation(`/messages/${convId}`);
    },
  });

  const trimmed = content.trim();
  const canSend = !!trimmed && !send.isPending;

  if (authLoading || betaLoading || !user) return null;

  return (
    <div className="flex flex-col" style={{ background: PAPER }}>
      {/* Minimal header */}
      <div className="px-6 pt-6 pb-3 flex items-center justify-between max-w-3xl mx-auto w-full">
        <button onClick={() => setLocation(`/messages/${convId}`)} className="text-sm" style={{ color: MUTE }}>←</button>
        <div className="text-center">
          <p className="text-[13px]" style={{ color: MUTE, fontFamily: FONT }}>
            {otherName
              ? t("messages.message_to", { name: otherName, defaultValue: "Message to {{name}}" })
              : t("messages.title", { defaultValue: "Messages" })}
          </p>
        </div>
        <div className="w-6" />
      </div>

      {/* Action bar */}
      <div className="px-6 py-3 max-w-3xl mx-auto w-full flex items-center justify-end gap-3" style={{ borderBottom: `1px solid ${HAIR}` }}>
        {showSaved && (
          <span className="text-[12px]" style={{ color: SAGE, fontFamily: FONT }}>
            {t("messages.draft_saved", { defaultValue: "Draft saved" })}
          </span>
        )}
        <button
          onClick={() => { if (canSend) send.mutate(trimmed); }}
          disabled={!canSend}
          className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 transition-opacity"
          style={{ background: SAGE, color: "#fff", fontFamily: FONT }}
        >
          {send.isPending
            ? t("messages.sending", { defaultValue: "Sending…" })
            : t("messages.send", { defaultValue: "Send" })}
        </button>
      </div>

      {/* "Responding to this" — the other person's most recent message,
          rendered above the textarea so you can re-read it while writing.
          Skipped when they haven't written yet (your first message). */}
      {respondingTo && (
        <div className="px-6 pt-6 max-w-3xl mx-auto w-full">
          <div className="rounded-2xl px-5 py-5" style={{ background: CARD, border: `1px solid ${HAIR}`, boxShadow: "0 1px 0 rgba(44,24,16,0.04)" }}>
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: MUTE, fontFamily: FONT }}>
                {t("messages.responding_to", { defaultValue: "Responding to" })}
              </p>
              <p className="text-[11px]" style={{ color: MUTE, fontFamily: FONT }}>
                {new Date(respondingTo.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </p>
            </div>
            <p className="text-sm font-semibold mb-2" style={{ color: INK, fontFamily: FONT }}>{otherName}</p>
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: INK, fontFamily: SERIF }}>
              {respondingTo.body}
            </p>
          </div>
          <div className="flex items-center justify-center mt-4 mb-2 text-[12px]" style={{ color: MUTE, fontFamily: FONT }}>
            <span>{t("messages.write_reply_below", { defaultValue: "Write your reply below" })}</span>
          </div>
        </div>
      )}

      {/* Writing area — auto-growing textarea in normal flow with a
          trailing spacer (keyboard + a full screen) so the active line can
          always be scrolled above the keyboard. */}
      <div className="flex-1 px-6 pt-6 max-w-3xl mx-auto w-full">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          placeholder={t("messages.compose_placeholder", { defaultValue: "Write a message…" })}
          rows={8}
          maxLength={MAX_CHARS}
          className="w-full resize-none focus:outline-none placeholder:italic block"
          style={{
            color: INK,
            backgroundColor: "transparent",
            fontFamily: FONT,
            fontSize: "18px",
            lineHeight: "1.5",
            caretColor: SAGE,
            boxShadow: "none",
            whiteSpace: "pre-wrap",
            overflow: "hidden",
            border: "none",
            padding: 0,
          }}
        />
        <div aria-hidden style={{ height: `${keyboardH + viewportH}px` }} />
      </div>
    </div>
  );
}
