import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { triggerSubmitFeedback } from "@/lib/amenFeedback";

// "Word of comfort" composer for a prayer request — the small pill-
// shaped input that appears below a prayer-request slide. Originally
// defined inline in prayer-mode.tsx; lifted here so the Daily Office
// + Devotion intercession slides can render the same field without
// reimplementing the public/private toggle, the ×-clear button, and
// the friendly error mapping.
//
// Submits to POST /api/prayer-requests/:id/word and (when it lands)
// flips into a read-only "Your word — '...'" state with a × button
// that DELETEs the word so the author can take it back.

export function RequestWordField({
  requestId,
  initialWord,
}: {
  requestId: number;
  initialWord: string | null;
}) {
  const queryClient = useQueryClient();
  const [word, setWord] = useState<string | null>(initialWord);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Public/private toggle — false (default) means the word goes on
  // the request like any other; true means only the request owner
  // and the author can see it.
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If the slide changes (new request) reset local state from the new prop.
  useEffect(() => {
    setWord(initialWord);
    setDraft("");
    setError(null);
    setIsPrivate(false);
  }, [requestId, initialWord]);

  async function submit() {
    const content = draft.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest("POST", `/api/prayer-requests/${requestId}/word`, { content, isPrivate });
      triggerSubmitFeedback();
      setWord(content);
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      const friendly = /closed|expired|answered/i.test(raw)
        ? "This prayer is closed — can't leave a word."
        : /unauthorized|401/i.test(raw)
          ? "Please sign in and try again."
          : /network|failed to fetch|offline/i.test(raw)
            ? "No connection — try again in a moment."
            : "Couldn't send your word. Tap again?";
      setError(friendly);
      console.warn("[RequestWordField] submit failed:", raw);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteWord() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest("DELETE", `/api/prayer-requests/${requestId}/word`);
      setWord(null);
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      setError("Couldn't remove your word. Tap × to try again.");
      console.warn("[RequestWordField] delete failed:", raw);
    } finally {
      setSubmitting(false);
    }
  }

  if (word) {
    return (
      <div
        className="w-full rounded-2xl px-5 py-3 text-left mt-2 relative"
        style={{
          background: "rgba(46,107,64,0.08)",
          border: "1px solid rgba(46,107,64,0.18)",
          maxWidth: 560,
        }}
      >
        <p
          className="text-[10px] uppercase tracking-[0.14em] mb-1 pr-7"
          style={{ color: "rgba(143,175,150,0.5)" }}
        >
          Your word
        </p>
        <p
          className="text-[14px] italic pr-7"
          style={{ color: "#C8D4C0", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          “{word}”
        </p>
        <button
          onClick={deleteWord}
          disabled={submitting}
          aria-label="Remove your word"
          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-opacity disabled:opacity-30 hover:opacity-80"
          style={{
            background: "rgba(46,107,64,0.18)",
            color: "rgba(200,212,192,0.7)",
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          ×
        </button>
        {error && (
          <p
            className="text-[11px] mt-1"
            style={{ color: "#C47A65" }}
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full mt-2" style={{ maxWidth: 560 }}>
      {/* Public/private toggle — default public; tap to switch to
          private (visible only to the owner and the author). */}
      <div className="flex justify-end gap-2 mb-1.5">
        <button
          type="button"
          onClick={() => setIsPrivate(false)}
          className="text-[10px] uppercase tracking-[0.14em] font-semibold rounded-full px-2.5 py-1"
          style={{
            background: !isPrivate ? "rgba(46,107,64,0.35)" : "transparent",
            color: !isPrivate ? "#C8D4C0" : "rgba(143,175,150,0.55)",
            border: `1px solid ${!isPrivate ? "rgba(46,107,64,0.5)" : "rgba(46,107,64,0.18)"}`,
          }}
        >
          Public
        </button>
        <button
          type="button"
          onClick={() => setIsPrivate(true)}
          className="text-[10px] uppercase tracking-[0.14em] font-semibold rounded-full px-2.5 py-1"
          style={{
            background: isPrivate ? "rgba(193,154,58,0.20)" : "transparent",
            color: isPrivate ? "#E8D9B0" : "rgba(143,175,150,0.55)",
            border: `1px solid ${isPrivate ? "rgba(193,154,58,0.45)" : "rgba(46,107,64,0.18)"}`,
          }}
        >
          🔒 Private
        </button>
      </div>
      <div
        className="w-full rounded-full px-4 py-1.5 flex items-center gap-2"
        style={{
          background: "rgba(46,107,64,0.1)",
          border: error
            ? "1px solid rgba(196,122,101,0.6)"
            : "1px solid rgba(46,107,64,0.25)",
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Leave a word of comfort…"
          maxLength={120}
          className="word-of-comfort-input flex-1 bg-transparent outline-none text-[14px] py-1.5"
          style={{
            color: "#E8E4D8",
            fontSize: 16, // iOS Safari: ≥16 to block auto-zoom
            background: "transparent",
            boxShadow: "none",
            WebkitAppearance: "none",
            WebkitTapHighlightColor: "transparent",
          }}
        />
        <button
          onClick={submit}
          disabled={!draft.trim() || submitting}
          aria-label="Send word"
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity disabled:opacity-30"
          style={{ background: "#2D5E3F", color: "#F0EDE6" }}
        >
          {submitting ? "…" : "→"}
        </button>
      </div>
      {error && (
        <p
          className="text-[12px] mt-1.5 px-2"
          style={{ color: "#C47A65" }}
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
