import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

interface MemberData {
  id: number;
  name: string | null;
  email: string;
  homeCity: string | null;
}

interface CorrespondenceBasic {
  id: number;
  name: string;
  groupType: string;
  startedAt: string;
  members: MemberData[];
  myTurn: boolean;
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

  const [content, setContent] = useState("");
  const [postmarkCity, setPostmarkCity] = useState("");
  const [locating, setLocating] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [errorState, setErrorState] = useState<{ message: string; nextPeriodStart?: string } | null>(null);
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

  // Detect location for postmark
  useEffect(() => {
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
            data.address?.state ||
            "";
          setPostmarkCity(city);
        } catch {
          setLocationDenied(true);
        } finally {
          setLocating(false);
        }
      },
      () => { setLocating(false); setLocationDenied(true); },
      { timeout: 8000 }
    );
  }, [isOneToOne]);

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
          setErrorState({ message: parsed.error || "Something went wrong." });
        }
      } catch {
        setErrorState({ message: "Something went wrong. Try again." });
      }
      setConfirmSend(false);
    },
  });

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const canSend = wordCount >= minWords && !sendMutation.isPending;

  const otherMembers = correspondence?.members
    .filter((m) => m.email !== user?.email)
    .map((m) => m.name || m.email.split("@")[0])
    .join(", ") ?? "";

  function handleSendClick() {
    setConfirmSend(true);
  }

  function handleBack() {
    if (content.trim() && content !== lastSavedRef.current) saveDraft();
    setLocation(`/letters/${correspondenceId}${tokenParam}`);
  }

  if (errorState) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: "#FAF6F0" }}>
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
    <div className="min-h-screen flex flex-col" style={{ background: "#FAF6F0" }}>
      {/* Minimal header */}
      <div className="px-6 pt-6 pb-3 flex items-center justify-between">
        <button onClick={handleBack} className="text-sm" style={{ color: "#9a9390" }}>←</button>
        <div className="text-center">
          <p className="text-[13px]" style={{ color: "#9a9390" }}>{correspondence?.name}</p>
          {correspondence?.currentPeriod && (
            <p className="text-[13px] font-medium" style={{ color: "#5C7A5F" }}>
              {isOneToOne ? `Letter ${correspondence.currentPeriod.periodNumber}` : `Week ${correspondence.currentPeriod.periodNumber}`}
              {" · "}{correspondence.currentPeriod.periodLabel}
            </p>
          )}
        </div>
        <div className="w-6" />
      </div>

      {/* Bottom action bar (fixed) */}
      <div
        className="px-6 py-3"
        style={{ borderBottom: "1px solid #C8C4B8" }}
      >
        {!confirmSend ? (
          <div className="flex items-center justify-between">
            <span className="text-[13px]" style={{ color: wordCount < minWords ? "#9a9390" : "#5C7A5F" }}>
              {wordCount} word{wordCount !== 1 ? "s" : ""}
              {!isOneToOne && wordCount < minWords && (
                <span style={{ color: "#C17F24" }}> · {minWords - wordCount} to go</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {showSaved && (
                <span className="text-[12px]" style={{ color: "#5C7A5F" }}>Saved 🌿</span>
              )}
              <button
                onClick={handleSendClick}
                disabled={!canSend}
                className="btn-sage px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 transition-opacity"
                style={{ background: "#5C7A5F", color: "#fff" }}
              >
                Send letter
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm mb-3" style={{ color: "#6b6460" }}>
              Send your {isOneToOne ? "letter" : "update"}? It can't be edited after.
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => sendMutation.mutate()}
                disabled={sendMutation.isPending}
                className="btn-sage px-5 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: "#5C7A5F", color: "#fff" }}
              >
                {sendMutation.isPending ? "Sending..." : "Send letter"}
              </button>
              <button onClick={() => setConfirmSend(false)} className="text-sm" style={{ color: "#9a9390" }}>
                Keep writing
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Writing area */}
      <div className="flex-1 px-6 pt-6 pb-8">
        {isOneToOne && otherMembers && (
          <p className="text-base italic mb-4" style={{ color: "#9a9390", fontFamily: "Georgia, serif" }}>
            Dear {otherMembers},
          </p>
        )}

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => { setContent(e.target.value); setConfirmSend(false); }}
          placeholder={isOneToOne
            ? `What's been happening these past two weeks?\n\nWhat do you want them to know?\nWhat are you carrying?\nWhat made you laugh?\n\nWrite as much or as little as feels right. 🌿`
            : `What's been happening this week?\n\nA moment, a thought, something you noticed.\n50 words or more. 🌿`
          }
          className="w-full min-h-[50vh] bg-transparent resize-none focus:outline-none placeholder:italic"
          style={{
            color: "#2C1810",
            fontFamily: isOneToOne ? "Georgia, serif" : "'Space Grotesk', sans-serif",
            fontSize: "18px",
            lineHeight: "2.1",
            caretColor: "#5C7A5F",
          }}
        />

        {isOneToOne && (
          <p className="text-base italic mt-2" style={{ color: "#9a9390", fontFamily: "Georgia, serif" }}>
            — {user?.name ?? "You"}
          </p>
        )}

        {/* Postmark — location-based, one_to_one only */}
        {isOneToOne && (
          <div className="mt-8 flex items-center gap-2">
            <span className="text-base">📮</span>
            {locating ? (
              <span className="text-[13px] italic" style={{ color: "#9a9390" }}>Finding your location…</span>
            ) : postmarkCity ? (
              <span className="text-[13px] font-medium" style={{ color: "#5C7A5F" }}>{postmarkCity}</span>
            ) : locationDenied ? (
              <span className="text-[13px] italic" style={{ color: "#9a9390" }}>Location unavailable</span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
