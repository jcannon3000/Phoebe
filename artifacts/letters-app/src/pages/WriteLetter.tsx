import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

const PAPER = "#F8F3EC";
const DARK = "#2C1810";
const MUTED = "#9a9390";
const GREEN = "#5C7A5F";
const AMBER = "#C17F24";

interface Correspondence {
  id: number;
  name: string;
  groupType: string;
  members: Array<{ name: string | null; email: string }>;
  turnState?: string;
  currentPeriod: { periodNumber: number; hasWrittenThisPeriod: boolean };
}

export default function WriteLetter() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const token = new URLSearchParams(window.location.search).get("token");
  const tp = token ? `?token=${token}` : "";

  const [content, setContent] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const lastSavedRef = useRef("");

  // Force paper background
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = PAPER;
    return () => { document.body.style.background = prev; };
  }, []);

  const { data: correspondence } = useQuery<Correspondence>({
    queryKey: [`/api/letters/correspondences/${id}`],
    queryFn: () =>
      api<Correspondence>("GET", `/api/phoebe/correspondences/${id}${tp}`)
        .catch(() => api("GET", `/api/letters/correspondences/${id}${tp}`)),
    enabled: !!id,
  });

  const { data: draft } = useQuery<{ content: string } | null>({
    queryKey: [`/api/letters/correspondences/${id}/draft`],
    queryFn: () =>
      api<{ content: string } | null>("GET", `/api/phoebe/correspondences/${id}/draft${tp}`)
        .catch(() => api("GET", `/api/letters/correspondences/${id}/draft${tp}`)),
    enabled: !!id,
  });

  useEffect(() => {
    if (draft?.content && !content) {
      setContent(draft.content);
      lastSavedRef.current = draft.content;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [content]);

  const isOTO = correspondence?.groupType === "one_to_one";
  const minWords = isOTO ? 100 : 50;
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const wordCountMet = wordCount >= minWords;
  const overLimit = wordCount > 1000;
  const canSend = wordCountMet && !overLimit;

  const others = correspondence?.members
    .filter(m => m.email !== user?.email)
    .map(m => m.name || m.email.split("@")[0])
    .join(", ") ?? "";

  const isOverdue = isOTO && correspondence?.turnState === "OVERDUE";

  const saveDraft = useCallback(async () => {
    if (!id || content === lastSavedRef.current) return;
    try {
      await api("PUT", `/api/phoebe/correspondences/${id}/draft${tp}`, { content })
        .catch(() => api("PUT", `/api/letters/correspondences/${id}/draft${tp}`, { content }));
      lastSavedRef.current = content;
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    } catch { /* silent */ }
  }, [id, content, tp]);

  useEffect(() => {
    if (saveTimerRef.current) clearInterval(saveTimerRef.current);
    saveTimerRef.current = setInterval(saveDraft, 30_000);
    return () => { if (saveTimerRef.current) clearInterval(saveTimerRef.current); };
  }, [saveDraft]);

  useEffect(() => () => { saveDraft(); }, [saveDraft]);

  const sendMutation = useMutation({
    mutationFn: () =>
      api("POST", `/api/phoebe/correspondences/${id}/letters${tp}`, {
        content: content.trim(),
      }).catch(() =>
        api("POST", `/api/letters/correspondences/${id}/letters${tp}`, {
          content: content.trim(),
        })
      ),
    onSuccess: () => setLocation(`/letters/${id}`),
  });

  function handleSend() {
    setConfirmSend(true);
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: PAPER, fontFamily: "'Space Grotesk', sans-serif" }}>

      {/* Header */}
      <div
        className="px-6 pt-6 pb-3 flex items-center justify-between max-w-3xl mx-auto w-full"
        style={{ borderBottom: "1px solid #EDE6D9" }}
      >
        <button
          onClick={() => { if (content.trim()) saveDraft(); setLocation(`/letters/${id}`); }}
          className="text-sm"
          style={{ color: MUTED }}
        >
          ←
        </button>
        <div className="text-center">
          <p className="text-[13px] font-medium" style={{ color: MUTED }}>
            {isOTO ? `To ${others}` : correspondence?.name || "Circle update"}
          </p>
          {isOverdue && (
            <p className="text-[12px] mt-0.5" style={{ color: AMBER }}>
              {others} has been waiting 🌿
            </p>
          )}
        </div>
        <div className="w-6" />
      </div>

      {/* Toolbar */}
      <div
        className="px-6 py-3 flex items-center justify-between max-w-3xl mx-auto w-full sticky top-0 z-10"
        style={{ borderBottom: "1px solid #EDE6D9", background: PAPER }}
      >
        {!confirmSend ? (
          <>
            <div className="flex items-center gap-2">
              <span
                className="text-[13px] font-semibold tabular-nums transition-colors"
                style={{ color: wordCountMet ? GREEN : overLimit ? "#C47A65" : MUTED }}
              >
                {wordCount}
              </span>
              <span className="text-[13px]" style={{ color: MUTED }}>/ 1000 words</span>
              {!wordCountMet && wordCount < minWords && (
                <span className="text-[12px]" style={{ color: AMBER }}>
                  · {minWords - wordCount} to go
                </span>
              )}
              {overLimit && (
                <span className="text-[12px]" style={{ color: "#C47A65" }}>· {wordCount - 1000} over</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {showSaved && <span className="text-[12px]" style={{ color: GREEN }}>Saved 🌿</span>}
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 transition-opacity"
                style={{ background: GREEN, color: "#fff" }}
              >
                Send ✉️
              </button>
            </div>
          </>
        ) : (
          <div className="w-full">
            <p className="text-sm mb-3" style={{ color: "#6b6460" }}>
              Send your {isOTO ? "letter" : "update"}? Can't be edited after.
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => sendMutation.mutate()}
                disabled={sendMutation.isPending}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
                style={{ background: GREEN, color: "#fff" }}
              >
                {sendMutation.isPending ? "Sending…" : "Send ✉️"}
              </button>
              <button onClick={() => setConfirmSend(false)} className="text-sm" style={{ color: MUTED }}>
                Keep writing
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Writing area */}
      <div className="flex-1 px-6 pt-8 pb-16 max-w-3xl mx-auto w-full">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={e => { setContent(e.target.value); setConfirmSend(false); }}
          placeholder={isOTO
            ? `What's been happening these past two weeks?\n\nWhat do you want them to know?\nWhat are you carrying?\nWhat made you laugh?\n\nWrite as much or as little as feels right. 🌿`
            : `What's been happening?\n\nA moment, a thought, something you noticed.\n50 words or more. 🌿`
          }
          className="w-full min-h-[60vh] resize-none focus:outline-none placeholder:italic letter-body"
          style={{
            color: DARK,
            backgroundColor: "transparent",
            fontSize: "18px",
            lineHeight: "1.75",
            caretColor: GREEN,
          }}
        />
      </div>
    </div>
  );
}
