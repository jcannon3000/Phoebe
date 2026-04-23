import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

interface MemberData {
  id: number;
  name: string | null;
  email: string;
  homeCity: string | null;
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
  const [postmarkCity, setPostmarkCity] = useState("");
  const [locating, setLocating] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
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

  // Detect location for postmark — called when user hits Send
  const detectLocation = useCallback(() => {
    if (!isOneToOne || postmarkCity || locating || locationDenied) return;
    if (!navigator.geolocation) { setLocationDenied(true); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            { headers: { "Accept-Language": "en" } }
          );
          const data = await res.json();
          const city =
            data.address?.city ||
            data.address?.town ||
            data.address?.village ||
            data.address?.county ||
            "";
          const state = data.address?.state || "";
          const postcode = data.address?.postcode || "";
          const parts = [city, state && postcode ? `${state} ${postcode}` : state || postcode].filter(Boolean);
          setPostmarkCity(parts.join(", "));
        } catch {
          setLocationDenied(true);
        } finally {
          setLocating(false);
        }
      },
      () => { setLocating(false); setLocationDenied(true); },
      { timeout: 8000 }
    );
  }, [isOneToOne, postmarkCity, locating, locationDenied]);

  // Load draft
  useEffect(() => {
    if (draft?.content && !content) {
      setContent(draft.content);
      lastSavedRef.current = draft.content;
    }
  }, [draft]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
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
        postmarkCity: isOneToOne ? postmarkCity.trim() : undefined,
      }).catch(() =>
        apiRequest("POST", `/api/letters/correspondences/${correspondenceId}/letters${tokenParam}`, {
          content: content.trim(),
          postmarkCity: isOneToOne ? postmarkCity.trim() : undefined,
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
  const canSend = wordCount >= minWords && wordCount <= maxWords && !sendMutation.isPending;
  const wordCountMet = wordCount >= minWords;

  const otherMembers = correspondence?.members
    .filter((m) => m.email !== user?.email)
    .map((m) => m.name || m.email.split("@")[0])
    .join(", ") ?? "";

  const isOverdue = isOneToOne && correspondence?.turnState === "OVERDUE";
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
    if (isOneToOne) detectLocation();
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
    <div className="min-h-screen flex flex-col" style={{ background: "#F8F3EC" }}>
      {/* Minimal header */}
      <div className="px-6 pt-6 pb-3 flex items-center justify-between max-w-3xl mx-auto w-full">
        <button onClick={handleBack} className="text-sm" style={{ color: "#9a9390" }}>←</button>
        <div className="text-center">
          <p className="text-[13px]" style={{ color: "#9a9390" }}>{correspondence?.name}</p>
          {correspondence?.currentPeriod && (
            <p className="text-[13px] font-medium" style={{ color: "#5C7A5F" }}>
              {isOneToOne ? `Letter ${correspondence.currentPeriod.periodNumber}` : `Round ${correspondence.currentPeriod.periodNumber}`}
            </p>
          )}
          {isOverdue && waitingDays > 0 && (
            <p className="text-[12px] mt-0.5" style={{ color: "#C17F24" }}>
              {otherMembers} has been waiting {waitingDays} days 🌿
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
              <span className="text-[13px]" style={{ color: "#9a9390" }}>
                / {maxWords} words
              </span>
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
                Send ✉️
              </button>
            </div>
          </div>
        ) : (
          <div>
            {isOneToOne && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">📮</span>
                {locating ? (
                  <span className="text-[13px] italic" style={{ color: "#9a9390" }}>Finding your location…</span>
                ) : (
                  <input
                    type="text"
                    value={postmarkCity}
                    onChange={e => setPostmarkCity(e.target.value)}
                    placeholder="City, State ZIP"
                    className="text-[13px] font-medium border-b focus:outline-none"
                    style={{ color: "#2C1810", backgroundColor: "#F8F3EC", borderColor: "#A8A09A", minWidth: 180 }}
                  />
                )}
              </div>
            )}
            <p className="text-sm mb-3" style={{ color: "#6b6460" }}>
              Send your {isOneToOne ? "letter" : "update"}? Can't be edited after.
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => sendMutation.mutate()}
                disabled={sendMutation.isPending || (isOneToOne && locating)}
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

      {/* Writing area */}
      <div className="flex-1 px-6 pt-6 pb-8 max-w-3xl mx-auto w-full">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => { setContent(e.target.value); setConfirmSend(false); }}
          placeholder={isOneToOne
            ? `What's been happening these past two weeks?\n\nWhat do you want them to know?\nWhat are you carrying?\nWhat made you laugh?\n\nWrite as much or as little as feels right. 🌿`
            : `What's been happening these past two weeks?\n\nA moment, a thought, something you noticed.\n50 words or more. 🌿`
          }
          className="w-full min-h-[50vh] resize-none focus:outline-none placeholder:italic"
          style={{
            color: "#2C1810",
            backgroundColor: "transparent",
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: "18px",
            lineHeight: "1.5",
            caretColor: "#5C7A5F",
            boxShadow: "none",
            whiteSpace: "pre-wrap",
          }}
        />

        {/* signature removed — reader sees author name in metadata */}
      </div>
    </div>
  );
}
