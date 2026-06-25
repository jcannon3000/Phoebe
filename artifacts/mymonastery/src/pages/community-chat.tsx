/**
 * Community group chat — the "talk to each other" room scoped to a community,
 * held inside the same frame as its prayer list, office, and rule of life. The
 * lightweight WhatsApp-shaped surface for a parish young-adult circle, without
 * leaving the place their prayer life already lives.
 *
 * MVP: text only, polling (every 4s). Real-time (WebSocket), reactions, and
 * voice notes are later slices. Plaintext — the server can read messages.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const BG = "#0a1a10";

type ChatMessage = {
  id: number;
  body: string;
  createdAt: string | null;
  senderUserId: number;
  senderName: string;
  senderAvatarUrl: string | null;
  mine: boolean;
};
type ChatResponse = { groupName: string; groupEmoji: string | null; messages: ChatMessage[]; hasMore: boolean };

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}
function timeOf(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function CommunityChatPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const lastCountRef = useRef(0);

  const key = [`/api/groups/${slug}/chat`];
  const { data, isLoading, isError } = useQuery<ChatResponse>({
    queryKey: key,
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/chat`),
    refetchInterval: 4000,
    refetchOnWindowFocus: true,
  });

  const messages = useMemo(() => data?.messages ?? [], [data]);

  // Auto-scroll to the newest message when the count grows (new message in, or
  // first load). Doesn't fight the user scrolling up to read history mid-poll.
  useEffect(() => {
    if (messages.length !== lastCountRef.current) {
      lastCountRef.current = messages.length;
      endRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [messages.length]);

  const send = useMutation({
    mutationFn: (body: string) => apiRequest("POST", `/api/groups/${slug}/chat`, { body }),
    onSuccess: () => { setDraft(""); qc.invalidateQueries({ queryKey: key }); },
  });

  function submit() {
    const body = draft.trim();
    if (!body || send.isPending) return;
    send.mutate(body);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: BG, display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          paddingTop: "max(env(safe-area-inset-top), 12px)",
          borderBottom: "1px solid rgba(46,107,64,0.3)",
          background: "rgba(9,26,16,0.6)",
          backdropFilter: "blur(11.34px)",
          WebkitBackdropFilter: "blur(11.34px)",
        }}
      >
        <div className="flex items-center gap-2 px-3 pb-2.5">
          <button onClick={() => setLocation(`/communities/${slug}`)} aria-label="Back" className="p-1.5 -ml-1" style={{ color: SAGE }}>
            <ChevronLeft size={20} />
          </button>
          {data?.groupEmoji && <span className="text-[20px] leading-none" aria-hidden>{data.groupEmoji}</span>}
          <p className="text-[16px] font-semibold truncate" style={{ color: WARM, fontFamily: FONT }}>
            {data?.groupName ?? "Chat"}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3" style={{ overflowAnchor: "none" }}>
        {isError ? (
          <p className="text-center text-[13.5px] mt-10" style={{ color: "#C47A65", fontFamily: FONT }}>
            You need to be a member of this community to see its chat.
          </p>
        ) : isLoading ? (
          <p className="text-center text-[13px] mt-10" style={{ color: "rgba(143,175,150,0.6)", fontFamily: FONT }}>Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-[13.5px] mt-10 leading-relaxed" style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}>
            No messages yet.<br />Say hello to your community.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              // Start of a "run" from this sender — show the name/avatar then.
              const runStart = !prev || prev.senderUserId !== m.senderUserId;
              return <Bubble key={m.id} m={m} runStart={runStart} />;
            })}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div
        style={{
          flexShrink: 0,
          padding: "8px 10px",
          paddingBottom: "max(env(safe-area-inset-bottom), 10px)",
          borderTop: "1px solid rgba(46,107,64,0.3)",
          background: "rgba(9,26,16,0.6)",
          backdropFilter: "blur(11.34px)",
          WebkitBackdropFilter: "blur(11.34px)",
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="Message…"
            rows={1}
            className="flex-1 rounded-2xl px-3.5 py-2.5 text-[15px] outline-none resize-none"
            style={{ background: "rgba(9,26,16,0.7)", border: "1px solid rgba(46,107,64,0.4)", color: WARM, fontFamily: FONT, maxHeight: 120 }}
          />
          <button
            onClick={submit}
            disabled={!draft.trim() || send.isPending}
            className="shrink-0 rounded-full px-4 py-2.5 text-[14px] font-semibold transition-opacity active:opacity-80 disabled:opacity-40"
            style={{ background: "rgba(46,107,64,0.95)", color: WARM, border: "1px solid rgba(126,210,140,0.4)", fontFamily: FONT }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ m, runStart }: { m: ChatMessage; runStart: boolean }) {
  if (m.mine) {
    return (
      <div className="flex justify-end" style={{ marginTop: runStart ? 8 : 2 }}>
        <div className="max-w-[78%] rounded-2xl px-3.5 py-2" style={{ background: "rgba(46,107,64,0.55)", border: "1px solid rgba(126,210,140,0.3)", borderBottomRightRadius: 6 }}>
          <p className="text-[15px] leading-snug whitespace-pre-wrap break-words" style={{ color: WARM, fontFamily: FONT }}>{m.body}</p>
          <p className="text-[10px] mt-0.5 text-right" style={{ color: "rgba(240,237,230,0.5)", fontFamily: FONT }}>{timeOf(m.createdAt)}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-end gap-2" style={{ marginTop: runStart ? 8 : 2 }}>
      {/* Avatar column — only on the run start; a spacer keeps alignment otherwise. */}
      <div className="w-7 shrink-0">
        {runStart && (m.senderAvatarUrl
          ? <img src={m.senderAvatarUrl} alt={m.senderName} className="w-7 h-7 rounded-full object-cover" style={{ border: "1px solid rgba(46,107,64,0.3)" }} />
          : <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold" style={{ background: "#1A4A2E", color: "#A8C5A0" }}>{initials(m.senderName)}</div>
        )}
      </div>
      <div className="max-w-[78%]">
        {runStart && <p className="text-[11px] mb-0.5 ml-0.5 font-semibold" style={{ color: "rgba(143,175,150,0.8)", fontFamily: FONT }}>{m.senderName}</p>}
        <div className="rounded-2xl px-3.5 py-2" style={{ background: "rgba(22,46,32,0.55)", border: "1px solid rgba(46,107,64,0.35)", borderBottomLeftRadius: 6 }}>
          <p className="text-[15px] leading-snug whitespace-pre-wrap break-words" style={{ color: WARM, fontFamily: FONT }}>{m.body}</p>
          <p className="text-[10px] mt-0.5" style={{ color: "rgba(143,175,150,0.5)", fontFamily: FONT }}>{timeOf(m.createdAt)}</p>
        </div>
      </div>
    </div>
  );
}
