import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

interface MemberData {
  id: number;
  name: string | null;
  email: string;
}

interface LetterRef {
  id: number;
  authorEmail: string;
  authorName: string;
  sentAt: string;
}

interface CorrespondenceBasic {
  id: number;
  name: string;
  groupType: string;
  startedAt: string;
  members: MemberData[];
  letters?: LetterRef[];
  myTurn: boolean;
  turnState?: "WAITING" | "OPEN" | "OVERDUE" | "SENT";
  windowOpenDate?: string | null;
  overdueDate?: string | null;
  currentPeriod: {
    periodNumber: number;
    periodLabel: string;
    hasWrittenThisPeriod: boolean;
  };
}

interface DraftData {
  content: string;
  lastSavedAt: string;
}

export default function WriteLetter() {
  const [, params] = useRoute("/letters/:id/write");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const correspondenceId = params?.id;
  const token = new URLSearchParams(window.location.search).get("token");
  const tokenParam = token ? `?token=${token}` : "";
  const queryClient = useQueryClient();

  const [content, setContent] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);

  const [errorState, setErrorState] = useState<{ message: string; nextPeriodStart?: string } | null>(null);

  // Override dark page background for paper theme
  useEffect(() => {
    const root = document.getElementById("root");
    const prevRoot = root?.style.backgroundColor;
    const prevBody = document.body.style.backgroundColor;
    const prevHtml = document.documentElement.style.backgroundColor;
    if (root) root.style.backgroundColor = "#F8F3EC";
    document.body.style.backgroundColor = "#F8F3EC";
    document.documentElement.style.backgroundColor = "#F8F3EC";
    return () => {
      if (root) root.style.backgroundColor = prevRoot || "";
      document.body.style.backgroundColor = prevBody || "";
      document.documentElement.style.backgroundColor = prevHtml || "";
    };
  }, []);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const lastSavedRef = useRef("");

  const { data: correspondence } = useQuery<CorrespondenceBasic>({
    queryKey: [`/api/phoebe/correspondences/${correspondenceId}`],
    queryFn: async () => {
      try {
        return await apiRequest("GET", `/api/phoebe/correspondences/${correspondenceId}${tokenParam}`);
      } catch {
        return await apiRequest("GET", `/api/letters/correspondences/${correspondenceId}${tokenParam}`);
      }
    },
    enabled: !!correspondenceId && (!!user || !!token),
  });

  const { data: draft } = useQuery<DraftData | null>({
    queryKey: [`/api/phoebe/correspondences/${correspondenceId}/draft`],
    queryFn: async () => {
      try {
        return await apiRequest("GET", `/api/phoebe/correspondences/${correspondenceId}/draft${tokenParam}`);
      } catch {
        return await apiRequest("GET", `/api/letters/correspondences/${correspondenceId}/draft${tokenParam}`);
      }
    },
    enabled: !!correspondenceId && (!!user || !!token),
  });

  const isOneToOne = correspondence?.groupType === "one_to_one";
  const minWords = isOneToOne ? 100 : 50;
  const maxWords = 1000;
  // Threshold at which the counter switches from a "minimum to hit" UI
  // to the cap-aware "X / 1000" UI. Below this, the user is being
  // encouraged to write more; once they're well past the floor and
  // approaching the ceiling, surface the ceiling.
  const cap_visible_at = 800;

  // Load draft
  useEffect(() => {
    if (draft?.content && !content) {
      setContent(draft.content);
      lastSavedRef.current = draft.content;
    }
  }, [draft]);

  // Track the keyboard inset (window.innerHeight − visualViewport.height
  // on Capacitor's resize:None mode). We use this as bottom padding on
  // the page so the user can scroll the active typing line above the
  // keyboard, and so the action bar stays reachable. Apple Notes-style:
  // textarea is auto-growing in document flow, the page scrolls
  // naturally, and iOS keeps the caret on screen for free.
  const [keyboardH, setKeyboardH] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height);
      setKeyboardH(inset);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  // Auto-grow the textarea so it lives in document flow rather than
  // having a fixed scroll region. This is the trick that makes iOS
  // behave like Apple Notes — when the textarea is just a long element
  // on the page, iOS auto-scrolls the caret above the keyboard, and
  // the user can pan up to see anything they wrote earlier.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [content]);

  const saveDraft = useCallback(async () => {
    if (!correspondenceId || content === lastSavedRef.current) return;
    try {
      await apiRequest("PUT", `/api/phoebe/correspondences/${correspondenceId}/draft${tokenParam}`, { content })
        .catch(() => apiRequest("PUT", `/api/letters/correspondences/${correspondenceId}/draft${tokenParam}`, { content }));
      lastSavedRef.current = content;
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    } catch (err) {
      console.error("Draft save failed:", err);
    }
  }, [correspondenceId, content, tokenParam]);

  useEffect(() => {
    if (saveTimerRef.current) clearInterval(saveTimerRef.current);
    saveTimerRef.current = setInterval(saveDraft, 30000);
    return () => { if (saveTimerRef.current) clearInterval(saveTimerRef.current); };
  }, [saveDraft]);

  useEffect(() => { return () => { saveDraft(); }; }, [saveDraft]);

  const sendMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/phoebe/correspondences/${correspondenceId}/letters${tokenParam}`, {
        content: content.trim(),
      }).catch(() =>
        apiRequest("POST", `/api/letters/correspondences/${correspondenceId}/letters${tokenParam}`, {
          content: content.trim(),
        })
      ),
    onSuccess: () => {
      // Clear local draft state so we don't re-POST it on the way out.
      lastSavedRef.current = content;
      // Drop cached draft + correspondence detail + list so the thread
      // we navigate to shows the new letter immediately.
      queryClient.removeQueries({ queryKey: [`/api/phoebe/correspondences/${correspondenceId}/draft`] });
      queryClient.removeQueries({ queryKey: [`/api/letters/correspondences/${correspondenceId}/draft`] });
      queryClient.invalidateQueries({ queryKey: [`/api/phoebe/correspondences/${correspondenceId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/letters/correspondences/${correspondenceId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/phoebe/correspondences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/letters/correspondences"] });
      setLocation(`/letters/${correspondenceId}${tokenParam}`);
    },
    onError: (err: Error) => {
      try {
        const parsed = JSON.parse(err.message);
        if (parsed.error === "already_written" || parsed.error === "already_written_this_period") {
          setErrorState({ message: "You've already written this period.", nextPeriodStart: parsed.nextPeriodStart });
        } else if (parsed.error === "not_your_turn") {
          setErrorState({ message: parsed.message || "It's not your turn yet.", nextPeriodStart: parsed.nextPeriodStart });
        } else {
          // Prefer the human-readable `message` over the machine code in
          // `error` — the server sends both now (e.g. send_failed + a
          // detailed error message). Falling back to error code and
          // finally a generic string keeps the old behavior intact.
          setErrorState({ message: parsed.message || parsed.error || "Something went wrong." });
        }
      } catch {
        setErrorState({ message: "Something went wrong. Try again." });
      }
      setConfirmSend(false);
    },
  });

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const wordCountMet = wordCount >= minWords;

  const otherMembers = correspondence?.members
    .filter((m) => m.email !== user?.email)
    .map((m) => m.name || m.email.split("@")[0])
    .join(", ") ?? "";

  const isOverdue = isOneToOne && correspondence?.turnState === "OVERDUE";

  // Draft-ahead: if it's not yet our turn (WAITING with a future window
  // open date), the user can write but can't send. The button below
  // turns into "Send in Xd" and is disabled until the window opens.
  const windowOpenAt = correspondence?.windowOpenDate ? new Date(correspondence.windowOpenDate) : null;
  const isWaitingForWindow =
    isOneToOne &&
    correspondence?.turnState === "WAITING" &&
    !!windowOpenAt &&
    windowOpenAt.getTime() > Date.now();
  const daysUntilOpen = isWaitingForWindow && windowOpenAt
    ? Math.max(1, Math.ceil((windowOpenAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;
  const canSend =
    wordCount >= minWords &&
    wordCount <= maxWords &&
    !sendMutation.isPending &&
    !isWaitingForWindow;
  const waitingDays = (() => {
    if (!isOverdue || !correspondence?.letters?.length) return 0;
    const otherLast = [...correspondence.letters]
      .filter((l) => l.authorEmail !== user?.email)
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())[0];
    if (!otherLast) return 0;
    const then = new Date(otherLast.sentAt);
    then.setHours(0, 0, 0, 0);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24)));
  })();

  function handleSendClick() {
    setConfirmSend(true);
  }

  function handleBack() {
    if (content.trim() && content !== lastSavedRef.current) saveDraft();
    setLocation(`/letters/${correspondenceId}${tokenParam}`);
  }

  if (errorState) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: "#F8F3EC" }}>
        <p className="text-4xl mb-4">📮</p>
        <p className="text-base mb-2" style={{ color: "#2C1810" }}>{errorState.message}</p>
        {errorState.nextPeriodStart && (
          <p className="text-sm mb-6" style={{ color: "#9a9390" }}>Next period starts {errorState.nextPeriodStart}.</p>
        )}
        <button onClick={() => setLocation(`/letters/${correspondenceId}${tokenParam}`)} className="text-sm font-medium" style={{ color: "#5C7A5F" }}>
          ← Back to letters
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col"
      style={{
        background: "#F8F3EC",
        minHeight: "100dvh",
      }}
    >
      {/* Minimal header */}
      <div className="px-6 pt-6 pb-3 flex items-center justify-between max-w-3xl mx-auto w-full">
        <button onClick={handleBack} className="text-sm" style={{ color: "#9a9390" }}>←</button>
        <div className="text-center">
          <p className="text-[13px]" style={{ color: "#9a9390" }}>{correspondence?.name}</p>
          {correspondence?.currentPeriod && (
            <p className="text-[13px] font-medium" style={{ color: "#5C7A5F" }}>
              {isOneToOne ? `Letter ${(correspondence.letters?.length ?? 0) + 1}` : `Round ${correspondence.currentPeriod.periodNumber}`}
            </p>
          )}
          {isOverdue && waitingDays > 0 && (
            <p className="text-[12px] mt-0.5" style={{ color: "#C17F24" }}>
              {otherMembers} has been waiting {waitingDays} days 🌿
            </p>
          )}
          {isWaitingForWindow && windowOpenAt && (
            <p className="text-[12px] mt-0.5" style={{ color: "#9a9390" }}>
              Draft ahead — window opens {windowOpenAt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </p>
          )}
        </div>
        <div className="w-6" />
      </div>

      {/* Action bar */}
      <div className="px-6 py-3 max-w-3xl mx-auto w-full" style={{ borderBottom: "1px solid #EDE6D9" }}>
        {!user && confirmSend ? (
          <div>
            <p className="text-sm mb-3" style={{ color: "#6b6460" }}>
              Sign in to send your letter. Your draft is saved.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <a
                href={`/?redirect=${encodeURIComponent(`/letters/${correspondenceId}/write`)}`}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: "#5C7A5F", color: "#fff" }}
              >
                Log in →
              </a>
              <a
                href={`/?signup=1&redirect=${encodeURIComponent(`/letters/${correspondenceId}/write`)}`}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: "transparent", border: "1px solid #C8BFB0", color: "#5C7A5F" }}
              >
                Create account →
              </a>
              <button onClick={() => setConfirmSend(false)} className="text-sm" style={{ color: "#9a9390" }}>
                Keep writing
              </button>
            </div>
          </div>
        ) : !confirmSend ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="text-[13px] font-semibold tabular-nums transition-colors"
                style={{ color: wordCountMet ? "#5C7A5F" : "#9a9390" }}
              >
                {wordCount}
              </span>
              {wordCount >= cap_visible_at ? (
                <span className="text-[13px]" style={{ color: "#9a9390" }}>
                  / {maxWords} words
                </span>
              ) : (
                <span className="text-[13px]" style={{ color: "#9a9390" }}>
                  words
                </span>
              )}
              {!wordCountMet && (
                <span className="text-[12px]" style={{ color: "#C17F24" }}>
                  · {minWords - wordCount} to go
                </span>
              )}
              {wordCount > maxWords && (
                <span className="text-[12px]" style={{ color: "#C47A65" }}>
                  · {wordCount - maxWords} over
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {showSaved && (
                <span className="text-[12px]" style={{ color: "#5C7A5F" }}>Saved 🌿</span>
              )}
              <button
                onClick={handleSendClick}
                disabled={!canSend}
                className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 transition-opacity"
                style={{ background: "#5C7A5F", color: "#fff" }}
              >
                {isWaitingForWindow
                  ? `Send in ${daysUntilOpen}d`
                  : "Send ✉️"}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm mb-3" style={{ color: "#6b6460" }}>
              Send your {isOneToOne ? "letter" : "update"}? Can't be edited after.
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => sendMutation.mutate()}
                disabled={sendMutation.isPending}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
                style={{ background: "#5C7A5F", color: "#fff" }}
              >
                {sendMutation.isPending ? "Sending..." : "Send ✉️"}
              </button>
              <button onClick={() => setConfirmSend(false)} className="text-sm" style={{ color: "#9a9390" }}>
                Keep writing
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Writing area — auto-growing textarea in normal document flow.
          The page scrolls vertically; iOS auto-scrolls the caret above
          the keyboard, and the user can pan up freely to see earlier
          paragraphs. Bottom padding includes the keyboard inset so the
          end of the letter is always reachable above the keyboard. */}
      <div
        className="flex-1 px-6 pt-6 max-w-3xl mx-auto w-full"
        style={{ paddingBottom: `${keyboardH + 24}px` }}
      >
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => { setContent(e.target.value); setConfirmSend(false); }}
          placeholder={isOneToOne
            ? `What's been happening these past two weeks?\n\nWhat do you want them to know?\nWhat are you carrying?\nWhat made you laugh?\n\nWrite as much or as little as feels right. 🌿`
            : `What's been happening these past two weeks?\n\nA moment, a thought, something you noticed.\n50 words or more. 🌿`
          }
          rows={8}
          className="w-full resize-none focus:outline-none placeholder:italic block"
          style={{
            color: "#2C1810",
            backgroundColor: "transparent",
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: "18px",
            lineHeight: "1.5",
            caretColor: "#5C7A5F",
            boxShadow: "none",
            whiteSpace: "pre-wrap",
            overflow: "hidden",
            border: "none",
            padding: 0,
          }}
        />
      </div>
    </div>
  );
}
