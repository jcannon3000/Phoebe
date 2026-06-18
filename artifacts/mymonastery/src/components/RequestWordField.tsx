import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [word, setWord] = useState<string | null>(initialWord);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Public/private toggle — false (default) means the word goes on
  // the request like any other; true means only the request owner
  // and the author can see it.
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track the latest values in refs so the slide-change effect can
  // auto-submit a half-typed draft before resetting state. Without
  // this, a user who typed "praying with you" and hit Amen on the
  // slide before pressing send saw their word silently dropped on
  // the floor — the requestId-change effect ran setDraft("") and
  // their content was gone before the next slide had even mounted.
  const draftRef = useRef(draft);
  const isPrivateRef = useRef(isPrivate);
  const submittingRef = useRef(submitting);
  // Tracks the requestId from the PREVIOUS render so the slide-change
  // effect can flush any unsent draft to the correct (old) request.
  const prevRequestIdRef = useRef(requestId);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { isPrivateRef.current = isPrivate; }, [isPrivate]);
  useEffect(() => { submittingRef.current = submitting; }, [submitting]);

  async function submitContent(content: string, isPrivateVal: boolean): Promise<void> {
    if (!content || submittingRef.current) return;
    setSubmitting(true);
    submittingRef.current = true;
    setError(null);
    try {
      await apiRequest("POST", `/api/prayer-requests/${requestId}/word`, { content, isPrivate: isPrivateVal });
      triggerSubmitFeedback();
      setWord(content);
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      // A word now also records an amen server-side, so refresh the detail page
      // (its amen rail / count / "Amen sent" state) — not just the list.
      queryClient.invalidateQueries({ queryKey: [`/api/prayer-requests/by-id/${requestId}`] });
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      const friendly = /closed|expired|answered/i.test(raw)
        ? t("word_of_comfort.prayer_closed")
        : /unauthorized|401/i.test(raw)
          ? t("word_of_comfort.sign_in_again")
          : /network|failed to fetch|offline/i.test(raw)
            ? t("word_of_comfort.no_connection")
            : t("word_of_comfort.cant_send");
      setError(friendly);
      console.warn("[RequestWordField] submit failed:", raw);
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  }

  async function submit() {
    return submitContent(draft.trim(), isPrivate);
  }

  // If the slide changes (new request) reset local state from the new
  // prop. CRITICAL: if the user typed something and never tapped send
  // (they advanced via Amen instead), fire-and-forget the submit
  // BEFORE we wipe local state.
  useEffect(() => {
    // Capture the OLD requestId before updating the ref — the flush
    // must target the request the user was just looking at, not the
    // new slide. Using `requestId` directly would capture the new value.
    const prevReqId = prevRequestIdRef.current;
    prevRequestIdRef.current = requestId;

    const pendingDraft = draftRef.current.trim();
    if (pendingDraft && !submittingRef.current && prevReqId !== requestId) {
      // Fire-and-forget — the user has already moved on, we don't
      // want to block the slide transition on the network round-trip.
      // The POST is upsert-safe so a stale background submit can't
      // double-write.
      apiRequest("POST", `/api/prayer-requests/${prevReqId}/word`, {
        content: pendingDraft,
        isPrivate: isPrivateRef.current,
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
        queryClient.invalidateQueries({ queryKey: [`/api/prayer-requests/by-id/${prevReqId}`] });
      }).catch((err) => {
        console.warn("[RequestWordField] background flush failed:", err);
      });
    }
    setWord(initialWord);
    setDraft("");
    setError(null);
    setIsPrivate(false);
    // Intentionally only listen on requestId — we don't want the
    // initialWord changing on the same slide (e.g. another viewer's
    // word arriving in a refetch) to wipe the user's in-flight draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  // Sync `word` when initialWord changes within the same slide (e.g.
  // a refetch returned the freshly-saved word). Decoupled from the
  // reset effect above so it doesn't clobber the draft.
  useEffect(() => {
    setWord(initialWord);
  }, [initialWord]);

  async function deleteWord() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest("DELETE", `/api/prayer-requests/${requestId}/word`);
      setWord(null);
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      queryClient.invalidateQueries({ queryKey: [`/api/prayer-requests/by-id/${requestId}`] });
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      setError(t("word_of_comfort.couldnt_remove"));
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
          {t("word_of_comfort.your_word")}
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
          aria-label={t("word_of_comfort.remove_aria")}
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
          {t("word_of_comfort.public")}
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
          {t("word_of_comfort.private")}
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
          onBlur={() => {
            // If the user typed something and the field loses focus
            // (typically because they tapped Amen on the slide and
            // the keyboard dismissed), fire-and-forget submit. Better
            // a stray request that's idempotently upserted server-
            // side than a silently-dropped word of comfort.
            const pending = draft.trim();
            if (pending && !submittingRef.current) {
              void submitContent(pending, isPrivate);
            }
          }}
          placeholder={t("word_of_comfort.placeholder")}
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
          aria-label={t("word_of_comfort.send_aria")}
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-opacity disabled:opacity-30"
          style={{ background: "#2D5E3F", color: "#F0EDE6" }}
        >
          {submitting ? t("word_of_comfort.sending_dots") : t("word_of_comfort.send_arrow")}
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
