import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError } from "@/lib/api";

const PAPER = "#F8F3EC";
const DARK = "#2C1810";
const MUTED = "#9a9390";
const GREEN = "#5C7A5F";
const AMBER = "#C17F24";

interface MemberData { id?: number; name: string | null; email: string }

interface LetterRef {
  id: number;
  authorEmail: string;
  authorName: string;
  sentAt: string;
  content?: string;
}

interface Correspondence {
  id: number;
  name: string;
  groupType: string;
  members: MemberData[];
  letters?: LetterRef[];
  myTurn: boolean;
  turnState?: "WAITING" | "OPEN" | "OVERDUE" | "SENT";
  windowOpenDate?: string | null;
  overdueDate?: string | null;
  currentPeriod: { periodNumber: number; periodLabel?: string; hasWrittenThisPeriod: boolean };
}

interface DraftData { content: string; lastSavedAt: string }

export default function WriteLetter() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const token = new URLSearchParams(window.location.search).get("token");
  const tp = token ? `?token=${token}` : "";
  const queryClient = useQueryClient();

  const [content, setContent] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [errorState, setErrorState] = useState<{ message: string; nextPeriodStart?: string } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const lastSavedRef = useRef("");

  // Paper background + scroll unlock (mirrors WriteLetter.tsx in mymonastery)
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

  const { data: correspondence } = useQuery<Correspondence>({
    queryKey: [`/api/phoebe/correspondences/${id}`],
    queryFn: () => api<Correspondence>("GET", `/api/phoebe/correspondences/${id}${tp}`),
    enabled: !!id && (!!user || !!token),
  });

  const { data: draft } = useQuery<DraftData | null>({
    queryKey: [`/api/phoebe/correspondences/${id}/draft`],
    queryFn: () => api<DraftData | null>("GET", `/api/phoebe/correspondences/${id}/draft${tp}`),
    enabled: !!id && (!!user || !!token),
  });

  useEffect(() => {
    if (draft?.content && !content) {
      setContent(draft.content);
      lastSavedRef.current = draft.content;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const isOTO = correspondence?.groupType === "one_to_one";
  const minWords = isOTO ? 100 : 50;
  const maxWords = 1000;
  const cap_visible_at = 800;
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const wordCountMet = wordCount >= minWords;

  const others = correspondence?.members
    .filter(m => m.email !== user?.email)
    .map(m => m.name || m.email.split("@")[0])
    .join(", ") ?? "";

  const isOverdue = isOTO && correspondence?.turnState === "OVERDUE";

  const lastLetterRef = (correspondence?.letters ?? [])
    .slice()
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())[0];
  const isFollowUp =
    isOTO &&
    correspondence?.turnState === "OPEN" &&
    !!lastLetterRef &&
    lastLetterRef.authorEmail.toLowerCase() === (user?.email ?? "").toLowerCase();

  const windowOpenAt = correspondence?.windowOpenDate ? new Date(correspondence.windowOpenDate) : null;
  const isWaitingForWindow =
    isOTO && correspondence?.turnState === "WAITING" && !!windowOpenAt && windowOpenAt.getTime() > Date.now();
  const daysUntilOpen = isWaitingForWindow && windowOpenAt
    ? Math.max(1, Math.ceil((windowOpenAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const canSend = wordCountMet && wordCount <= maxWords && !isWaitingForWindow && !sendMutation.isPending;

  const respondingTo = (() => {
    if (!correspondence?.letters?.length) return null;
    const others2 = correspondence.letters
      .filter(l => l.authorEmail !== user?.email)
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
    return others2[0] ?? null;
  })();

  const waitingDays = (() => {
    if (!isOverdue || !respondingTo) return 0;
    const then = new Date(respondingTo.sentAt);
    then.setHours(0,0,0,0);
    const now = new Date();
    now.setHours(0,0,0,0);
    return Math.max(0, Math.floor((now.getTime() - then.getTime()) / (1000*60*60*24)));
  })();

  // iOS keyboard caret tracking
  const [keyboardH, setKeyboardH] = useState(0);
  const [viewportH, setViewportH] = useState(typeof window !== "undefined" ? window.innerHeight : 800);
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => {
      const ih = window.innerHeight;
      const vvh = vv?.height ?? ih;
      setKeyboardH(Math.max(0, ih - vvh));
      setViewportH(ih);
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const ensureCaretVisible = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const style = window.getComputedStyle(ta);
    const mirror = document.createElement("div");
    const copyProps: Array<keyof CSSStyleDeclaration> = [
      "fontFamily","fontSize","fontWeight","fontStyle","lineHeight",
      "letterSpacing","wordSpacing","textTransform","textIndent",
      "whiteSpace","wordWrap","overflowWrap",
      "paddingTop","paddingRight","paddingBottom","paddingLeft",
      "borderTopWidth","borderRightWidth","borderBottomWidth","borderLeftWidth",
      "boxSizing",
    ];
    for (const p of copyProps) {
      (mirror.style as unknown as Record<string,string>)[p as string] =
        (style as unknown as Record<string,string>)[p as string];
    }
    mirror.style.position = "absolute";
    mirror.style.top = "-9999px";
    mirror.style.left = "-9999px";
    mirror.style.visibility = "hidden";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";
    mirror.style.width = `${ta.clientWidth}px`;
    const pos = ta.selectionEnd ?? ta.value.length;
    mirror.textContent = ta.value.substring(0, pos);
    const marker = document.createElement("span");
    marker.textContent = ta.value.substring(pos) || ".";
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const taRect = ta.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const caretY = taRect.top + (markerRect.top - mirrorRect.top);
    const lineH = parseFloat(style.lineHeight) || 27;
    document.body.removeChild(mirror);
    const visibleBottom = window.innerHeight - keyboardH;
    const safeBottom = visibleBottom - lineH - 24;
    const safeTop = 80;
    if (caretY + lineH > safeBottom) {
      window.scrollBy({ top: caretY + lineH - safeBottom, behavior: "auto" });
    } else if (caretY < safeTop) {
      window.scrollBy({ top: caretY - safeTop, behavior: "auto" });
    }
  }, [keyboardH]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
    requestAnimationFrame(ensureCaretVisible);
  }, [content, ensureCaretVisible]);

  useEffect(() => {
    if (keyboardH > 0) requestAnimationFrame(ensureCaretVisible);
  }, [keyboardH, ensureCaretVisible]);

  const saveDraft = useCallback(async () => {
    if (!id || content === lastSavedRef.current) return;
    try {
      await api("PUT", `/api/phoebe/correspondences/${id}/draft${tp}`, { content });
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
      api("POST", `/api/phoebe/correspondences/${id}/letters${tp}`, { content: content.trim() }),
    onSuccess: () => {
      lastSavedRef.current = content;
      queryClient.removeQueries({ queryKey: [`/api/phoebe/correspondences/${id}/draft`] });
      queryClient.invalidateQueries({ queryKey: [`/api/phoebe/correspondences/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/phoebe/correspondences"] });
      setLocation(`/letters/${id}${tp}`);
    },
    onError: (err: Error) => {
      const body = err instanceof ApiError && err.body && typeof err.body === "object"
        ? (err.body as { error?: string; message?: string; nextPeriodStart?: string; existingId?: number })
        : null;
      const code = body?.error;
      if (code === "duplicate_correspondence" && body?.existingId) {
        setLocation(`/letters/${body.existingId}`);
        return;
      }
      if (code === "already_written" || code === "already_written_this_period") {
        setErrorState({ message: "You've already written this period.", nextPeriodStart: body?.nextPeriodStart });
      } else if (code === "not_your_turn") {
        setErrorState({ message: body?.message || "It's not your turn yet.", nextPeriodStart: body?.nextPeriodStart });
      } else {
        setErrorState({ message: body?.message || body?.error || err.message || "Something went wrong." });
      }
      setConfirmSend(false);
    },
  });

  // Hoist canSend reference fix — declare after sendMutation
  const _canSend = wordCountMet && wordCount <= maxWords && !isWaitingForWindow && !sendMutation.isPending;

  if (errorState) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: PAPER }}>
        <p className="text-4xl mb-4">📮</p>
        <p className="text-base mb-2" style={{ color: DARK }}>{errorState.message}</p>
        {errorState.nextPeriodStart && (
          <p className="text-sm mb-6" style={{ color: MUTED }}>Next period starts: {errorState.nextPeriodStart}</p>
        )}
        <button onClick={() => setLocation(`/letters/${id}${tp}`)} className="text-sm font-medium" style={{ color: GREEN }}>
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ background: PAPER }}>
      {/* Header */}
      <div className="px-6 pt-6 pb-3 flex items-center justify-between max-w-3xl mx-auto w-full">
        <button
          onClick={() => { if (content.trim() && content !== lastSavedRef.current) saveDraft(); setLocation(`/letters/${id}${tp}`); }}
          className="text-sm" style={{ color: MUTED }}
        >
          ←
        </button>
        <div className="text-center">
          <p className="text-[13px]" style={{ color: MUTED }}>
            {isOTO && others ? `To ${others}` : correspondence?.name || "Circle update"}
          </p>
          {correspondence?.currentPeriod && (
            <p className="text-[13px] font-medium" style={{ color: GREEN }}>
              {isOTO
                ? `Letter ${(correspondence.letters?.length ?? 0) + 1}`
                : `Round ${correspondence.currentPeriod.periodNumber}`}
            </p>
          )}
          {isFollowUp && (
            <p className="text-[12px] mt-0.5 font-medium" style={{ color: GREEN }}>Follow-up</p>
          )}
          {isOverdue && waitingDays > 0 && (
            <p className="text-[12px] mt-0.5" style={{ color: AMBER }}>
              {others} has been waiting {waitingDays} day{waitingDays !== 1 ? "s" : ""}
            </p>
          )}
          {isWaitingForWindow && windowOpenAt && (
            <p className="text-[12px] mt-0.5" style={{ color: MUTED }}>
              Draft now, sends on{" "}
              {windowOpenAt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </p>
          )}
        </div>
        <div className="w-6" />
      </div>

      {/* Toolbar */}
      <div className="px-6 py-3 max-w-3xl mx-auto w-full" style={{ borderBottom: "1px solid #EDE6D9" }}>
        {!confirmSend ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold tabular-nums transition-colors"
                style={{ color: wordCountMet ? GREEN : MUTED }}>
                {wordCount}
              </span>
              {wordCount >= cap_visible_at ? (
                <span className="text-[13px]" style={{ color: MUTED }}>/ {maxWords} words</span>
              ) : (
                <span className="text-[13px]" style={{ color: MUTED }}>words</span>
              )}
              {!wordCountMet && (
                <span className="text-[12px]" style={{ color: AMBER }}>· {minWords - wordCount} to go</span>
              )}
              {wordCount > maxWords && (
                <span className="text-[12px]" style={{ color: "#C47A65" }}>· {wordCount - maxWords} over</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {showSaved && <span className="text-[12px]" style={{ color: GREEN }}>Saved 🌿</span>}
              <button
                onClick={() => setConfirmSend(true)}
                disabled={!_canSend}
                className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 transition-opacity"
                style={{ background: GREEN, color: "#fff" }}
              >
                {isWaitingForWindow ? `Send in ${daysUntilOpen}d` : "Send ✉️"}
              </button>
            </div>
          </div>
        ) : (
          <div>
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

      {/* "Responding to" preview */}
      {respondingTo && respondingTo.content && (
        <div className="px-6 pt-6 max-w-3xl mx-auto w-full">
          <div className="rounded-2xl px-5 py-5"
            style={{ background: "#FBF8F2", border: "1px solid #EDE6D9", boxShadow: "0 1px 0 rgba(44,24,16,0.04)" }}>
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: MUTED }}>
                Responding to
              </p>
              <p className="text-[11px]" style={{ color: MUTED }}>
                {new Date(respondingTo.sentAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </p>
            </div>
            <p className="text-sm font-semibold mb-2"
              style={{ color: DARK, fontFamily: "'Space Grotesk', sans-serif" }}>
              {respondingTo.authorName || respondingTo.authorEmail}
            </p>
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap"
              style={{ color: DARK, fontFamily: "Georgia, 'Times New Roman', serif" }}>
              {respondingTo.content}
            </p>
          </div>
          <div className="flex items-center justify-center mt-4 mb-2 text-[12px]" style={{ color: MUTED }}>
            Write your reply below
          </div>
        </div>
      )}

      {/* Writing area */}
      <div className="flex-1 px-6 pt-6 max-w-3xl mx-auto w-full">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={e => { setContent(e.target.value); setConfirmSend(false); }}
          placeholder={isOTO
            ? "What's been happening these past two weeks?\n\nWhat do you want them to know?\nWhat are you carrying?\nWhat made you laugh?\n\nWrite as much or as little as feels right. 🌿"
            : "What's been happening?\n\nA moment, a thought, something you noticed.\n50 words or more. 🌿"
          }
          rows={8}
          className="w-full resize-none focus:outline-none placeholder:italic block"
          style={{
            color: DARK,
            backgroundColor: "transparent",
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: "18px",
            lineHeight: "1.5",
            caretColor: GREEN,
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
