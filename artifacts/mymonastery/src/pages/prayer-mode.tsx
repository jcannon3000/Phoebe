import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { usePeople } from "@/hooks/usePeople";
import { apiRequest } from "@/lib/queryClient";
import { findBcpPrayer } from "@/lib/bcp-prayers";
import { triggerAmenFeedback, playOpeningSwell, triggerSubmitFeedback } from "@/lib/amenFeedback";
import type { MyActivePrayerFor } from "@/components/pray-for-them";

// Scale the big prayer-text block by character length so long prayers
// (like the BCP collects) stay on one screen without scrolling, and short
// ones still feel like liturgy.
function fitPrayerText(text: string | null | undefined): { size: number; leading: number } {
  const len = (text ?? "").length;
  if (len < 100)  return { size: 18, leading: 1.8 };
  if (len < 220)  return { size: 16, leading: 1.75 };
  if (len < 360)  return { size: 15, leading: 1.7 };
  if (len < 520)  return { size: 14, leading: 1.65 };
  if (len < 720)  return { size: 13, leading: 1.6 };
  return { size: 12, leading: 1.55 };
}

type Moment = {
  id: number;
  name: string;
  templateType: string | null;
  intention: string;
  intercessionTopic?: string | null;
  intercessionFullText?: string | null;
  intercessionSource?: string | null;
  members: Array<{ name: string; email: string; avatarUrl?: string | null; prayedThisWeek?: boolean }>;
  todayPostCount: number;
  // Rolling 7-day distinct-prayers count (inclusive of today). Surfaced
  // under each intercession slide so the viewer sees that others have
  // carried this prayer even on days nobody has prayed yet today.
  weekPostCount?: number;
  windowOpen: boolean;
  myUserToken: string | null;
  momentToken: string | null;
  group?: { id: number; name: string; slug: string; emoji: string | null } | null;
};

interface PrayerRequest {
  id: number;
  body: string;
  ownerName: string | null;
  ownerAvatarUrl?: string | null;
  isAnswered: boolean;
  isOwnRequest?: boolean;
  closedAt?: string | null;
  // The viewer's own one-line word of comfort on this request, if any.
  // Used by the slideshow to either show their existing word or offer
  // a compose field.
  myWord?: string | null;
}

interface PrayerSlide {
  kind: "intercession" | "request" | "prayer-for" | "prayer-for-expired" | "ask-request" | "pray-for-suggest" | "circle-intention";
  text: string;
  attribution: string;
  fullText?: string | null;
  intention?: string | null;
  // request specific — lets us record an amen against the originating
  // prayer request when the viewer taps "Amen" to advance.
  requestId?: number;
  // request specific — the viewer's existing one-line word of comfort on
  // this request, if any. `null` means they haven't commented yet, so
  // the slide surfaces an inline compose field.
  myWord?: string | null;
  // intercession specific — needed to fire a moment_posts check-in the
  // instant the viewer taps "Amen", so a community intercession amen
  // lands in both the intercession detail page and the streak count
  // even if the viewer bails out of the slideshow before `handleDone`.
  momentToken?: string | null;
  myUserToken?: string | null;
  // prayer-for specific
  prayerForId?: number;
  recipientName?: string;
  recipientAvatarUrl?: string | null;
  dayLabel?: string;
  // request specific — the author's name + avatar, rendered above
  // the "Prayer Request" eyebrow so the slide feels like it's from a
  // specific person rather than a disembodied body of text.
  authorName?: string | null;
  authorAvatarUrl?: string | null;
  // circle-intention specific — included so the slide can link back to the
  // community, and so we can attribute the shared nature of the prayer in
  // the subtitle.
  groupName?: string;
  groupEmoji?: string | null;
  groupSlug?: string;
  // Rolling 7-day unique-prayers count. Rendered as a soft affirmation
  // under the prayer text ("3 people have prayed this this week") so the
  // viewer feels part of a rhythm even on low-activity days.
  weekPrayCount?: number;
  // Up to 7 faces of people in this intercession's community,
  // stacked above the "have prayed" line. Selection prefers
  // members with avatars when the candidate pool is larger than
  // the visible slot count.
  communityFaces?: Array<{ name: string; email: string; avatarUrl: string | null }>;
}

// One row from GET /api/groups/me/circle-intentions. Flattened across every
// prayer circle the user belongs to; non-archived only; falls back to the
// legacy single `groups.intention` for circles without migrated rows yet.
interface CircleIntention {
  id: number;
  title: string;
  description: string | null;
  groupId: number;
  groupName: string;
  groupSlug: string;
  groupEmoji: string | null;
}

// Inline compose / echo field for the viewer's "word of comfort" on a
// prayer request slide. If they already left a word we render it back
// (read-only, italicized, dimmed); otherwise we show a one-line text
// input with a send icon. Submitting posts to /word and swaps the
// field into the read-only state — the viewer can still advance with
// "Amen →" above as usual.
function RequestWordField({ requestId, initialWord }: { requestId: number; initialWord: string | null }) {
  const queryClient = useQueryClient();
  const [word, setWord] = useState<string | null>(initialWord);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Failure surface — previously we silently swallowed every error here,
  // so a closed request or a transient 5xx looked identical to success
  // with no feedback. A tester reported "I tried to comment and it didn't
  // go through" for exactly this reason. We now show the error inline
  // under the field so the user knows to retry.
  const [error, setError] = useState<string | null>(null);

  // If the slide changes (new request) reset local state from the new prop.
  useEffect(() => {
    setWord(initialWord);
    setDraft("");
    setError(null);
  }, [requestId, initialWord]);

  async function submit() {
    const content = draft.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest("POST", `/api/prayer-requests/${requestId}/word`, { content });
      triggerSubmitFeedback();
      setWord(content);
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    } catch (err: unknown) {
      // Map common server codes to friendlier copy. apiRequest throws
      // Error with `.message` set to the server's JSON `error` field.
      const raw = err instanceof Error ? err.message : String(err);
      const friendly = /closed|expired|answered/i.test(raw)
        ? "This prayer is closed — can't leave a word."
        : /unauthorized|401/i.test(raw)
          ? "Please sign in and try again."
          : /network|failed to fetch|offline/i.test(raw)
            ? "No connection — try again in a moment."
            : "Couldn't send your word. Tap again?";
      setError(friendly);
      // Log the raw cause so we can diagnose if it happens again.
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
          style={{ color: "#C8D4C0", fontFamily: "Playfair Display, Georgia, serif" }}
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
    <div className="w-full mt-2">
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
          // `word-of-comfort-input` is matched by global CSS to neutralize
          // WebKit autofill + focus background tints so the wrapper's pill
          // tone never changes when the field is tapped or autofilled.
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

// 7-second pause-before-Amen. When a slide first appears the button
// shows a dim green pill with a left-to-right progress wash and no
// label. After 7 seconds the wash hits 100%, the button brightens,
// "Amen →" fades up, and a soft "light" haptic fires — distinct from
// the medium-impact haptic that triggers on the tap itself, so the
// reveal and the press feel like two different events.
//
// Why: tappers were ripping through the slideshow in a few seconds
// without actually pausing on each prayer. The forced wait turns
// each slide into a real moment of attention. Bumped from 3s → 7s
// after testing showed 3 was too short to actually settle into the
// prayer — eyes finished reading and the hand was already on the
// button. 7s gives enough room for a breath and a second pass through
// the words. The CSS keyframe duration in index.css is kept in sync.
//
// Accepts a `slideKey` prop so the parent can force a remount-style
// reset when the slide changes (we use the slide index).
function AmenButton({ slideKey, onAdvance }: { slideKey: string | number; onAdvance: () => void }) {
  const HOLD_MS = 7000;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setReady(true);
      // "Light" haptic on reveal — a soft tick that says "you can act
      // now." The Amen tap itself fires a medium impact via
      // triggerAmenFeedback, so the user feels two distinct beats:
      // a small one when the button arrives, a fuller one when they
      // press it. On non-native (web) the event is a silent no-op.
      try {
        window.dispatchEvent(
          new CustomEvent("phoebe:haptic", { detail: { style: "light" } }),
        );
      } catch { /* non-fatal */ }
    }, HOLD_MS);
    return () => window.clearTimeout(t);
  }, [slideKey]);

  return (
    <button
      onClick={() => { if (ready) onAdvance(); }}
      disabled={!ready}
      aria-disabled={!ready}
      aria-label={ready ? "Amen" : "Hold a moment"}
      className="mt-2 px-8 py-3 rounded-full text-sm font-medium tracking-wide active:scale-[0.98] relative overflow-hidden"
      style={{
        background: ready ? "#2D5E3F" : "rgba(46,107,64,0.18)",
        border: `1px solid ${ready ? "rgba(46,107,64,0.7)" : "rgba(46,107,64,0.3)"}`,
        color: "#F0EDE6",
        cursor: ready ? "pointer" : "default",
        minWidth: 140,
        // Only animate when ready flips on. While the button is still
        // dim there's no transition active, so the initial paint can't
        // smear from a default browser style into the dim color — the
        // dim color is the very first thing rendered. Without this guard
        // the button briefly flashed bright on mount before settling
        // dark.
        transition: ready
          ? "background-color 360ms ease-out, border-color 360ms ease-out"
          : "none",
      }}
    >
      {/* Progress fill — always mounted, even after `ready` flips. We
          fade it out via opacity so the bright background underneath
          can take over without the abrupt "pop" you get when an
          element is hard-unmounted. */}
      <span
        aria-hidden
        key={slideKey}
        className="absolute left-0 top-0 bottom-0 amen-progress-fill"
        style={{
          background: "rgba(46,107,64,0.45)",
          pointerEvents: "none",
          opacity: ready ? 0 : 1,
          transition: "opacity 360ms ease-out",
        }}
      />
      {/* Label — empty during the hold, fades up to "Amen →" the moment
          the timer completes. The opacity transition is what gives the
          reveal its rise; the keyed remount of the fill on slide change
          makes sure the next slide's progress starts at 0% again. */}
      <span
        style={{
          position: "relative",
          opacity: ready ? 1 : 0,
          transform: ready ? "translateY(0)" : "translateY(2px)",
          transition: "opacity 280ms ease-out, transform 280ms ease-out",
          display: "inline-block",
        }}
      >
        Amen →
      </span>
    </button>
  );
}

function SlideContent({
  slide,
  slideKey,
  onAdvance,
  onRenew,
  onEnd,
  onAskSubmit,
  askSubmitting,
  suggestedFriends,
  onPrayForFriend,
}: {
  slide: PrayerSlide;
  // Stable key per slide — drives the 3-second Amen pause-reset. The
  // parent passes the slide index so the timer cleanly resets each
  // time we move to a new slide.
  slideKey: string | number;
  onAdvance: () => void;
  onRenew: (id: number, days: 3 | 7) => void;
  onEnd: (id: number) => void;
  onAskSubmit: (body: string) => void;
  askSubmitting: boolean;
  // Populated only on the "pray-for-suggest" final slide — a list of
  // friends the viewer isn't already praying for. Tap → navigate to the
  // create-a-prayer-for page for that person.
  suggestedFriends: Array<{ name: string; email: string; avatarUrl?: string | null }>;
  onPrayForFriend: (email: string) => void;
}) {
  const [askBody, setAskBody] = useState("");
  const bcpPrayer = slide.kind === "intercession" ? findBcpPrayer(slide.text) : undefined;

  // ── "Pray for one of your friends?" — final slide when the viewer
  // already has an active prayer request of their own. We surface
  // friends they're not currently praying for as pills; tapping one
  // routes to the create-prayer-for page for that person.
  if (slide.kind === "pray-for-suggest") {
    return (
      <div className="w-full flex flex-col items-center text-center gap-5">
        <p
          className="text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "rgba(143,175,150,0.45)" }}
        >
          Before we close
        </p>
        <p
          className="text-[22px] leading-[1.5] font-medium italic"
          style={{ color: "#E8E4D8", fontFamily: "Playfair Display, Georgia, serif" }}
        >
          Would you like to pray for one of your friends?
        </p>
        <p
          className="text-[12px] italic"
          style={{ color: "rgba(143,175,150,0.55)", marginTop: "-6px" }}
        >
          Tap a name to start a prayer for them.
        </p>

        {/* Pill list — centered, wraps. We cap at 12 so the slide
            never grows beyond one screen; past that the garden page
            is the right place to browse the full list. */}
        <div className="flex flex-wrap gap-2 justify-center max-w-md">
          {suggestedFriends.slice(0, 12).map((f) => (
            <button
              key={f.email}
              type="button"
              onClick={() => onPrayForFriend(f.email)}
              className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 transition-opacity hover:opacity-90"
              style={{
                background: "rgba(46,107,64,0.18)",
                border: "1px solid rgba(46,107,64,0.3)",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              {f.avatarUrl ? (
                <img
                  src={f.avatarUrl}
                  alt=""
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold"
                  style={{ background: "rgba(168,197,160,0.2)", color: "#A8C5A0" }}
                >
                  {(f.name || f.email || "?").trim().charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-sm text-foreground whitespace-nowrap">
                {f.name || f.email.split("@")[0]}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={onAdvance}
          className="text-sm transition-opacity hover:opacity-80 mt-2"
          style={{ color: "rgba(143,175,150,0.55)" }}
        >
          Skip
        </button>
      </div>
    );
  }

  // ── "How can the community pray for you?" — final slide when the viewer
  // has no active prayer request. A gentle ask, skippable.
  if (slide.kind === "ask-request") {
    return (
      <div className="w-full flex flex-col items-center text-center gap-5">
        <p
          className="text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "rgba(143,175,150,0.45)" }}
        >
          Before we close
        </p>
        <p
          className="text-[22px] leading-[1.5] font-medium italic"
          style={{ color: "#E8E4D8", fontFamily: "Playfair Display, Georgia, serif" }}
        >
          How can the community pray for you?
        </p>
        <p
          className="text-[12px] italic"
          style={{ color: "rgba(143,175,150,0.55)", marginTop: "-6px" }}
        >
          A short note; your garden will hold it for 3 days.
        </p>

        <textarea
          value={askBody}
          onChange={(e) => setAskBody(e.target.value.slice(0, 1000))}
          rows={3}
          placeholder="What's on your heart?"
          className="w-full rounded-2xl px-5 py-4 text-[15px] outline-none resize-none"
          style={{
            background: "rgba(46,107,64,0.12)",
            border: "1px solid rgba(46,107,64,0.3)",
            color: "#F0EDE6",
            fontFamily: "Playfair Display, Georgia, serif",
            fontStyle: "italic",
            lineHeight: 1.65,
          }}
        />

        <div className="flex flex-col gap-3 w-full max-w-xs mt-1">
          <button
            onClick={() => askBody.trim() && onAskSubmit(askBody.trim())}
            disabled={askBody.trim().length === 0 || askSubmitting}
            className="px-6 py-3 rounded-full text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            {askSubmitting ? "Sharing…" : "Share with my garden →"}
          </button>
          <button
            onClick={onAdvance}
            className="text-sm transition-opacity hover:opacity-80"
            style={{ color: "rgba(143,175,150,0.55)" }}
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  // ── Expired-prayer renewal prompt — shown instead of a normal slide ──────
  if (slide.kind === "prayer-for-expired" && slide.prayerForId != null) {
    return (
      <div className="w-full flex flex-col items-center text-center gap-5">
        <p
          className="text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "rgba(143,175,150,0.45)" }}
        >
          Prayer ended
        </p>
        <p
          className="text-[22px] leading-[1.5] font-medium italic"
          style={{ color: "#E8E4D8", fontFamily: "Playfair Display, Georgia, serif" }}
        >
          Your prayer for {slide.recipientName} has ended.
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs mt-2">
          <button
            onClick={() => onRenew(slide.prayerForId!, 7)}
            className="px-6 py-3 rounded-full text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            Pray for another 7 days
          </button>
          <button
            onClick={() => onEnd(slide.prayerForId!)}
            className="px-6 py-3 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              background: "rgba(200,212,192,0.06)",
              border: "1px solid rgba(46,107,64,0.25)",
              color: "#8FAF96",
            }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ── Active "prayer for someone" slide ───────────────────────────────────
  if (slide.kind === "prayer-for") {
    return (
      <div className="w-full flex flex-col items-center text-center gap-5">
        <p
          className="text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "rgba(143,175,150,0.45)" }}
        >
          Praying for
        </p>
        {slide.recipientAvatarUrl ? (
          <img
            src={slide.recipientAvatarUrl}
            alt={slide.recipientName}
            className="w-16 h-16 rounded-full object-cover"
            style={{ border: "1px solid rgba(46,107,64,0.3)" }}
          />
        ) : (
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-semibold"
            style={{ background: "#1A4A2E", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.3)" }}
          >
            {(slide.recipientName ?? "")
              .split(" ")
              .slice(0, 2)
              .map(w => w[0]?.toUpperCase() ?? "")
              .join("")}
          </div>
        )}
        <p
          className="text-[22px] leading-[1.4] font-medium"
          style={{ color: "#E8E4D8", fontFamily: "Playfair Display, Georgia, serif" }}
        >
          {slide.recipientName}
        </p>

        {slide.fullText && (
          <div
            className="w-full rounded-2xl px-6 py-5 text-left mt-1 animate-turn-pulse-practices"
            style={{
              background: "rgba(46,107,64,0.12)",
              border: "1px solid rgba(46,107,64,0.15)",
            }}
          >
            {(() => {
              const fit = fitPrayerText(slide.fullText);
              return (
                <p
                  className="italic whitespace-pre-wrap"
                  style={{
                    color: "#C8D4C0",
                    fontFamily: "Playfair Display, Georgia, serif",
                    fontSize: `${fit.size}px`,
                    lineHeight: fit.leading,
                  }}
                >
                  {slide.fullText}
                </p>
              );
            })()}
          </div>
        )}

        <p
          className="text-[12px] italic"
          style={{ color: "rgba(143,175,150,0.55)" }}
        >
          Hold {slide.recipientName?.split(" ")[0]} in prayer today.
        </p>

        {slide.dayLabel && (
          <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "rgba(143,175,150,0.35)" }}>
            {slide.dayLabel}
          </p>
        )}

        <AmenButton key={slideKey} slideKey={slideKey} onAdvance={onAdvance} />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center text-center gap-5">
      {/* Request slides: author avatar + name above the body, mirroring
          the "Praying for" slide's layout. The avatar anchors the slide
          to a specific person so the prayer doesn't read as anonymous
          text. Intercession/circle slides skip this block. */}
      {slide.kind === "request" && (slide.authorName || slide.authorAvatarUrl) && (
        <div className="flex flex-col items-center gap-3">
          {slide.authorAvatarUrl ? (
            <img
              src={slide.authorAvatarUrl}
              alt={slide.authorName ?? "Prayer author"}
              className="w-16 h-16 rounded-full object-cover"
              style={{ border: "1px solid rgba(46,107,64,0.3)" }}
            />
          ) : (
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-semibold"
              style={{ background: "#1A4A2E", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.3)" }}
            >
              {(slide.authorName ?? "")
                .split(" ")
                .slice(0, 2)
                .map(w => w[0]?.toUpperCase() ?? "")
                .join("")}
            </div>
          )}
          {slide.authorName && (
            <p className="text-[14px]" style={{ color: "#C8D4C0", fontFamily: "Playfair Display, Georgia, serif" }}>
              {slide.authorName}
            </p>
          )}
        </div>
      )}

      <p
        className="text-[10px] uppercase tracking-[0.18em] font-semibold"
        style={{ color: "rgba(143,175,150,0.45)" }}
      >
        {slide.kind === "intercession"
          ? "Community Intercession"
          : slide.kind === "circle-intention"
            ? "Circle Intention"
            : "Prayer Request"}
      </p>

      <p
        className="text-[22px] leading-[1.5] font-medium italic"
        style={{ color: "#E8E4D8", fontFamily: "Playfair Display, Georgia, serif" }}
      >
        {slide.text}
      </p>

      {slide.intention && (
        <p
          className="text-sm italic"
          style={{ color: "#8FAF96", marginTop: "-4px" }}
        >
          {slide.intention}
        </p>
      )}

      {slide.attribution && (
        <p className="text-sm" style={{ color: "#8FAF96" }}>
          {slide.attribution}
        </p>
      )}

      {slide.kind === "intercession" && (
        <>
          {slide.communityFaces && slide.communityFaces.length > 0 && (
            <div
              className="flex items-center -space-x-2"
              style={{ marginTop: "-2px" }}
            >
              {slide.communityFaces.map((f) => (
                <div
                  key={f.email}
                  title={f.name}
                  className="rounded-full overflow-hidden shrink-0"
                  style={{
                    width: 28,
                    height: 28,
                    border: "2px solid #091A10",
                    background: "#1A4A2E",
                  }}
                >
                  {f.avatarUrl ? (
                    <img
                      src={f.avatarUrl}
                      alt={f.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-[10px] font-semibold"
                      style={{ color: "#A8C5A0" }}
                    >
                      {f.name
                        .split(" ")
                        .slice(0, 2)
                        .map((w) => w[0]?.toUpperCase() ?? "")
                        .join("")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <p
            className="text-[12px] italic"
            style={{ color: "rgba(143,175,150,0.55)", marginTop: "-6px" }}
          >
            {slide.weekPrayCount && slide.weekPrayCount > 0
              ? slide.weekPrayCount === 1
                ? "1 person has prayed this this week."
                : `${slide.weekPrayCount} people have prayed this this week.`
              : "Your community is holding this."}
          </p>
        </>
      )}

      {/* Circle intention — attribute to the circle by name. Different voice
          from a solo intercession: this is the shared prayer of the whole
          circle, held together. */}
      {slide.kind === "circle-intention" && slide.groupName && (
        <p
          className="text-[12px] italic"
          style={{ color: "rgba(143,175,150,0.55)", marginTop: "-6px" }}
        >
          {slide.groupEmoji ? `${slide.groupEmoji} ` : ""}The {slide.groupName} circle is praying this together.
        </p>
      )}

      {/* BCP enrichment — show the formal prayer text from the Book of Common Prayer */}
      {bcpPrayer && (
        <div
          className="w-full rounded-2xl px-6 py-5 text-left mt-1 animate-turn-pulse-practices"
          style={{
            background: "rgba(46,107,64,0.12)",
            border: "1px solid rgba(46,107,64,0.15)",
          }}
        >
          {(() => {
            const fit = fitPrayerText(bcpPrayer.text);
            return (
              <p
                className="italic"
                style={{
                  color: "#C8D4C0",
                  fontFamily: "Playfair Display, Georgia, serif",
                  fontSize: `${fit.size}px`,
                  lineHeight: fit.leading,
                }}
              >
                {bcpPrayer.text}
              </p>
            );
          })()}
          <p
            className="text-[9px] uppercase tracking-[0.14em] mt-3"
            style={{ color: "rgba(143,175,150,0.3)" }}
          >
            From the Book of Common Prayer
          </p>
        </div>
      )}

      {/* Word-of-comfort field — only on request slides. Shows the viewer's
          existing word if they've already left one, otherwise a one-line
          compose field with a send button. */}
      {slide.kind === "request" && typeof slide.requestId === "number" && (
        <RequestWordField requestId={slide.requestId} initialWord={slide.myWord ?? null} />
      )}

      {/* Custom intercession — show the user's own prayer text */}
      {!bcpPrayer && slide.fullText && (
        <div
          className="w-full rounded-2xl px-6 py-5 text-left mt-1 animate-turn-pulse-practices"
          style={{
            background: "rgba(46,107,64,0.12)",
            border: "1px solid rgba(46,107,64,0.15)",
          }}
        >
          {(() => {
            const fit = fitPrayerText(slide.fullText);
            return (
              <p
                className="italic"
                style={{
                  color: "#C8D4C0",
                  fontFamily: "Playfair Display, Georgia, serif",
                  fontSize: `${fit.size}px`,
                  lineHeight: fit.leading,
                }}
              >
                {slide.fullText}
              </p>
            );
          })()}
        </div>
      )}

      <div className="mt-4">
        <AmenButton key={slideKey} slideKey={slideKey} onAdvance={onAdvance} />
      </div>
    </div>
  );
}

// ─── Streak celebration ────────────────────────────────────────────────────
// Duolingo-style: big streak number scales in with a bounce, label and
// "you've held with your community" fade in underneath, and a ring of
// leaf/sparkle emoji flies outward from the number. Fires once per
// local-TZ day (gated by the server's firstToday check).
function StreakCelebration({ streak }: { streak: number }) {
  // 12 particles in a circle, staggered so the ring bursts outward.
  const particles = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    const distance = 140;
    return {
      i,
      emoji: i % 3 === 0 ? "🌿" : i % 3 === 1 ? "✨" : "🌱",
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
    };
  });

  return (
    <div className="w-full flex flex-col items-center text-center gap-3 relative" style={{ minHeight: 260 }}>
      {/* Radial burst — emoji particles scaling from 0 outward */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {particles.map((p) => (
          <motion.div
            key={p.i}
            initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
            animate={{
              opacity: [0, 1, 1, 0],
              scale: [0, 1.2, 1, 0.6],
              x: [0, p.x * 0.3, p.x * 0.7, p.x],
              y: [0, p.y * 0.3, p.y * 0.7, p.y],
            }}
            transition={{
              duration: 1.8,
              delay: 0.2 + (p.i * 0.035),
              ease: "easeOut",
            }}
            style={{
              position: "absolute",
              fontSize: 22,
            }}
          >
            {p.emoji}
          </motion.div>
        ))}
      </div>

      {/* Streak number — spring scale-in */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.15 }}
        className="flex items-baseline justify-center gap-2 relative z-10"
      >
        <span
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 96,
            fontWeight: 700,
            color: "#F0EDE6",
            lineHeight: 1,
            letterSpacing: "-0.03em",
          }}
        >
          {streak}
        </span>
        <motion.span
          initial={{ rotate: -20, scale: 0.8 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 180, damping: 10, delay: 0.35 }}
          style={{ fontSize: 56 }}
        >
          🔥
        </motion.span>
      </motion.div>

      {/* Streak label */}
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.6 }}
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 13,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "#8FAF96",
          marginTop: 8,
        }}
      >
        {streak === 1 ? "Day one" : `${streak}-day streak`}
      </motion.p>

      {/* Primary copy */}
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.8 }}
        className="text-base leading-relaxed"
        style={{
          color: "#F0EDE6",
          fontFamily: "'Space Grotesk', sans-serif",
          maxWidth: 360,
          marginTop: 8,
        }}
      >
        You have carried what your community is carrying. 🌿
      </motion.p>
    </div>
  );
}

// ─── Closing slide ─────────────────────────────────────────────────────────
// Shown after the user finishes the prayer-list. Three layers, top to
// bottom:
//   1. Streak — always visible. If `celebration.firstToday`, the
//      bursting Duolingo-style entrance fires; otherwise we render a
//      static, calmer streak number that still reads as a daily badge.
//   2. Avatar rail — up to 5 people the viewer has prayed for in the
//      last 7 days, with a "+N" tail if there are more. A direct,
//      face-level reminder that prayer is relational.
//   3. Habit invite — copy that frames daily prayer as a practice and
//      a "Done" button that closes the slideshow.
//
// The container shares the same `paddingTop: clamp(64px, 16dvh, 180px)`
// as the prayer slides, but unlike the previous version it has more
// vertical content so it doesn't read as floating high on tall screens.
function ClosingSlide({
  celebration,
  streak,
  coPrayers,
  onDone,
  visible,
}: {
  celebration: { streak: number } | null;
  streak: number;
  coPrayers: Array<{ id: number; name: string | null; avatarUrl: string | null }>;
  onDone: () => void;
  visible: boolean;
}) {
  const visibleAvatars = coPrayers.slice(0, 5);
  const overflow = Math.max(0, coPrayers.length - visibleAvatars.length);

  return (
    <div
      className="w-full flex flex-col items-center text-center"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 0.4s ease",
        gap: 28,
      }}
    >
      {/* Streak — celebration animation on firstToday, static badge
          otherwise. Both render from the same number so the visual
          stays consistent. */}
      {celebration ? (
        <StreakCelebration streak={celebration.streak} />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center"
        >
          <p
            className="text-[10px] uppercase tracking-[0.18em] font-semibold"
            style={{ color: "rgba(143,175,150,0.55)", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Prayer streak
          </p>
          <p
            className="font-bold leading-none"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              color: "#C8D4C0",
              fontSize: 88,
              letterSpacing: "-0.04em",
              marginTop: 6,
            }}
          >
            {streak}
          </p>
          <p
            className="text-sm mt-1"
            style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {streak === 1 ? "day" : "days"}
          </p>
        </motion.div>
      )}

      {/* Avatar rail — up to 5 + tail. Hidden if no co-prayers (e.g.
          first-ever session, or a quiet week with only the user's own
          intercessions). */}
      {visibleAvatars.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="flex flex-col items-center"
        >
          <p
            className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-3"
            style={{ color: "rgba(143,175,150,0.55)", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            You prayed with
          </p>
          <div className="flex items-center justify-center -space-x-2">
            {visibleAvatars.map((p) => (
              p.avatarUrl ? (
                <img
                  key={p.id}
                  src={p.avatarUrl}
                  alt={p.name ?? ""}
                  className="w-11 h-11 rounded-full object-cover"
                  style={{ border: "2px solid #0C1F12" }}
                />
              ) : (
                <div
                  key={p.id}
                  className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-semibold"
                  style={{ background: "#1A4A2E", color: "#A8C5A0", border: "2px solid #0C1F12" }}
                >
                  {(p.name ?? "?").trim().split(/\s+/).slice(0, 2).map(s => s[0] ?? "").join("").toUpperCase().slice(0, 2) || "?"}
                </div>
              )
            ))}
            {overflow > 0 && (
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-[11px] font-semibold"
                style={{ background: "rgba(46,107,64,0.35)", color: "#C8D4C0", border: "2px solid #0C1F12" }}
              >
                +{overflow}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Habit invite — relational framing, no streak language so it
          doesn't compete with the number above. */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
        className="flex flex-col items-center"
        style={{ maxWidth: 380 }}
      >
        <p
          className="text-base leading-relaxed"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Make praying for your friends a daily habit.
        </p>
        <p
          className="text-[13px] leading-relaxed mt-2"
          style={{ color: "rgba(143,175,150,0.7)", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Come back tomorrow — your friends will be carrying things, and so will you.
        </p>
      </motion.div>

      <button
        onClick={onDone}
        className="px-10 py-3.5 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
        style={{ background: "#2D5E3F", color: "#F0EDE6" }}
      >
        Done
      </button>
    </div>
  );
}

export default function PrayerModePage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: momentsData } = useQuery<{ moments: Moment[] }>({
    queryKey: ["/api/moments"],
    queryFn: () => apiRequest("GET", "/api/moments"),
    enabled: !!user,
  });

  const { data: prayerRequests = [] } = useQuery<PrayerRequest[]>({
    queryKey: ["/api/prayer-requests"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests"),
    enabled: !!user,
  });

  const { data: myPrayersFor = [] } = useQuery<MyActivePrayerFor[]>({
    queryKey: ["/api/prayers-for/mine"],
    queryFn: () => apiRequest("GET", "/api/prayers-for/mine"),
    enabled: !!user,
  });

  // Friends list — used by the "pray for someone" final slide that
  // appears after the main list when the viewer already has an active
  // prayer request of their own. We filter out anyone they're already
  // praying for so the pill row is an actionable "start a prayer for X"
  // menu, not a duplicate of their existing prayers-for.
  const { data: friends = [] } = usePeople(user?.id);

  // Every active intention from every prayer circle this user belongs to.
  // Surfaced as its own slide-kind so members carry the circle's shared
  // intentions alongside their own intercessions and others' requests.
  const { data: circleIntentionsData } = useQuery<{ intentions: CircleIntention[] }>({
    queryKey: ["/api/groups/me/circle-intentions"],
    queryFn: () => apiRequest("GET", "/api/groups/me/circle-intentions"),
    enabled: !!user,
  });

  // Streak number for the closing slide (always shown — user explicitly
  // asked for it regardless of whether today is a "first today" event).
  // Lives on the same query key as the dashboard so they share cache.
  const { data: streakData } = useQuery<{ streak: number; lastPrayedDate: string | null }>({
    queryKey: ["/api/prayer-streak"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak"),
    enabled: !!user,
    staleTime: 30_000,
  });

  // People whose prayer requests this user prayed for in the last 7
  // days — surfaced as an avatar rail on the closing slide so the user
  // sees who their prayers landed on this week. Excludes anonymous
  // requests. Capped at 12 server-side; we render 5 + tail.
  const { data: coPrayersData } = useQuery<{ people: Array<{ id: number; name: string | null; avatarUrl: string | null }> }>({
    queryKey: ["/api/prayer-streak/co-prayers-week"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak/co-prayers-week"),
    enabled: !!user,
    staleTime: 60_000,
  });

  const renewMutation = useMutation({
    mutationFn: ({ id, days }: { id: number; days: 3 | 7 }) =>
      apiRequest("POST", `/api/prayers-for/${id}/renew`, { durationDays: days }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/prayers-for/mine"] }),
  });
  const endMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/prayers-for/${id}/end`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/prayers-for/mine"] }),
  });

  // Creating a prayer request from the final slide ("How can the community
  // pray for you?"). On success we advance past the ask slide — the
  // slideshow then ends naturally.
  const createRequestMutation = useMutation({
    mutationFn: (body: string) =>
      apiRequest("POST", "/api/prayer-requests", { body, isAnonymous: false, durationDays: 3 }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] }),
  });

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  // Include every active intercession the user participates in, regardless
  // of the current window state. The slideshow is a "today's prayer list"
  // experience — a daily intercession is prayable all day, not only during
  // its 2-hour bloom window.
  const intercessions = (momentsData?.moments ?? []).filter(
    (m) => m.templateType === "intercession",
  );

  // "Pray for someone" records, filtered to match the People-page CTA:
  // we drop server-expired prayers AND prayers on their final day (0 days
  // left). A prayer on Day N of N already reads "done" on /people — we
  // don't want the slideshow to keep showing it, or to tack on a renewal
  // prompt for something that was meant to quietly reset.
  const prayerForCutoff = (() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  })();
  const activePrayersFor = myPrayersFor.filter(p => {
    if (p.expired) return false;
    const expires = new Date(p.expiresAt);
    const expiresDay = new Date(expires.getFullYear(), expires.getMonth(), expires.getDate());
    const daysLeft = Math.max(0, Math.round((expiresDay.getTime() - prayerForCutoff.getTime()) / 86400000));
    return daysLeft > 0;
  });

  const slides: PrayerSlide[] = [
    ...intercessions.map((m) => {
      const title = m.intercessionTopic || m.name;
      // For custom intercessions the user-entered `intention` often duplicates
      // `name` / `intercessionTopic` — hide it when it's the same text.
      const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
      const intentionSub =
        m.intention && norm(m.intention) !== norm(title) ? m.intention : null;
      // Prefer the group name over listing individual members when the practice
      // is attached to a group.
      const attributionLabel = m.group?.name
        ? m.group.name
        : m.members
            .filter((p) => p.email !== user?.email)
            .map((p) => p.name || p.email.split("@")[0])
            .slice(0, 3)
            .join(", ");
      // Face stack: up to 7 members of this intercession's
      // community. Selection rule:
      //   - If candidates ≤ 7: include everyone (avatars or not).
      //   - If candidates > 7: prefer members with avatars, drop
      //     initials-only first. If there aren't enough with
      //     avatars to fill 7, backfill with initials-only.
      // Viewer is excluded because the slide is about community —
      // the viewer's presence is implied by their being here.
      // Only show faces of people who have actually PRAYED this
      // week (the line below the stack reads "N have prayed this
      // week"). Falls back to all other members if the backend
      // hasn't attached prayedThisWeek yet (older deploys, edge
      // caching) so the stack doesn't silently empty.
      const hasPrayedFlag = m.members.some(p => typeof p.prayedThisWeek === "boolean");
      const otherMembers = m.members.filter(p => {
        if (p.email === user?.email) return false;
        if (!hasPrayedFlag) return true;
        return p.prayedThisWeek === true;
      });
      const MAX_FACES = 7;
      let communityFaces: Array<{ name: string; email: string; avatarUrl: string | null }> = [];
      if (otherMembers.length > 0) {
        if (otherMembers.length <= MAX_FACES) {
          communityFaces = otherMembers.map(p => ({
            name: p.name || p.email.split("@")[0],
            email: p.email,
            avatarUrl: p.avatarUrl ?? null,
          }));
        } else {
          const withAvatar = otherMembers.filter(p => !!p.avatarUrl);
          const withoutAvatar = otherMembers.filter(p => !p.avatarUrl);
          const picked = [
            ...withAvatar.slice(0, MAX_FACES),
            ...withoutAvatar.slice(0, Math.max(0, MAX_FACES - withAvatar.length)),
          ];
          communityFaces = picked.map(p => ({
            name: p.name || p.email.split("@")[0],
            email: p.email,
            avatarUrl: p.avatarUrl ?? null,
          }));
        }
      }
      return {
        kind: "intercession" as const,
        text: title,
        intention: intentionSub,
        fullText: m.intercessionFullText?.trim() || null,
        attribution: attributionLabel ? `with ${attributionLabel}` : "",
        weekPrayCount: m.weekPostCount ?? 0,
        momentToken: m.momentToken,
        myUserToken: m.myUserToken,
        communityFaces,
      };
    }),
    // Circle intentions — one slide per active intention in every prayer
    // circle the viewer belongs to. Placed right after intercessions because
    // they read in the same voice (the thing being prayed) and before
    // prayer requests so shared communal intentions come before individual
    // asks. Falls back silently to [] if the endpoint is missing or empty.
    ...((circleIntentionsData?.intentions ?? []).map((intn): PrayerSlide => ({
      kind: "circle-intention",
      text: intn.title,
      attribution: "",
      intention: intn.description,
      groupName: intn.groupName,
      groupEmoji: intn.groupEmoji,
      groupSlug: intn.groupSlug,
    }))),
    // Other people's prayer requests come before the user's own private
    // prayers-for — hearing others first, then turning inward. We
    // deliberately exclude the viewer's own requests; they don't need to
    // be shown their own ask as a slide to pray for.
    ...prayerRequests
      .filter((r) => !r.isAnswered && !r.isOwnRequest)
      .map((r): PrayerSlide => ({
        kind: "request",
        text: r.body,
        // Avatar + name render in-slide now; keep attribution empty so
        // we don't duplicate "from Name" under the body.
        attribution: "",
        requestId: r.id,
        myWord: r.myWord ?? null,
        authorName: r.ownerName ?? null,
        authorAvatarUrl: r.ownerAvatarUrl ?? null,
      })),
    ...activePrayersFor.map((p): PrayerSlide => {
      // Calendar-day diff so a prayer started yesterday evening reads "Day 2"
      // this morning rather than still "Day 1".
      const started = new Date(p.startedAt);
      const nowD = new Date();
      const todayStart = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate());
      const startedStart = new Date(started.getFullYear(), started.getMonth(), started.getDate());
      const daysElapsed = Math.round((todayStart.getTime() - startedStart.getTime()) / 86400000);
      const day = Math.max(1, Math.min(p.durationDays, daysElapsed + 1));
      return {
        kind: "prayer-for",
        text: p.recipientName,
        attribution: "",
        fullText: p.prayerText,
        prayerForId: p.id,
        recipientName: p.recipientName,
        recipientAvatarUrl: p.recipientAvatarUrl,
        dayLabel: `Day ${day} of ${p.durationDays}`,
      };
    }),
    // Expired "pray-for" entries deliberately don't surface here anymore.
    // Earlier we showed a renewal-prompt slide; the quieter, expected
    // behaviour (and what /people does) is to just let the prayer end.
    // The user can renew from the profile page if they want to continue.
  ];

  // Final slide logic:
  //   - No active own request → "How can the community pray for you?"
  //     (the existing ask-request slide).
  //   - Otherwise → no trailing slide. We previously appended a
  //     "Would you like to pray for one of your friends?" suggester
  //     ("pray-for-suggest") here, but the user asked for it to be
  //     removed from the slideshow — the list should end quietly on
  //     the last prayer, not nudge the viewer to add more.
  const hasActiveOwnRequest = prayerRequests.some(
    (r) => r.isOwnRequest === true && !r.isAnswered && !r.closedAt,
  );
  // Still computed because the SlideContent component still accepts
  // `suggestedFriends` as a prop (the type signature spans several
  // slide kinds, even though we no longer push a suggester slide).
  // Filtering cost is trivial.
  const prayingForEmails = new Set(
    activePrayersFor.map(p => p.recipientEmail.toLowerCase())
  );
  const viewerEmail = (user?.email ?? "").toLowerCase();
  const suggestedFriends = friends.filter(f =>
    f.email.toLowerCase() !== viewerEmail &&
    !prayingForEmails.has(f.email.toLowerCase())
  );

  if (!hasActiveOwnRequest) {
    slides.push({
      kind: "ask-request",
      text: "",
      attribution: "",
    });
  }

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"prayer" | "closing">("prayer");
  const [visible, setVisible] = useState(false);
  const [slideVisible, setSlideVisible] = useState(true);
  // Track which intercessions the viewer has already "amened" this
  // session, keyed by momentToken. We POST a check-in the moment the
  // viewer advances past a community intercession so it lands on the
  // detail page + streak immediately; this set keeps `handleDone` from
  // double-counting the same moment at the end of the slideshow.
  const loggedIntercessionsRef = useRef<Set<string>>(new Set());
  // Streak celebration state — set when the server tells us this is the
  // user's first prayer-list completion today. Null outside that window
  // so the closing slide falls back to the normal "you have carried…" copy.
  const [celebration, setCelebration] = useState<{ streak: number } | null>(null);

  // Initialise phase once slides are loaded
  useEffect(() => {
    if (slides.length === 0 && momentsData && prayerRequests && myPrayersFor) {
      setPhase("closing");
    }
  }, [slides.length, momentsData, prayerRequests, myPrayersFor]);

  // When the user lands on the closing slide, log the prayer-list streak.
  // The server is idempotent per TZ-local day — calling twice doesn't
  // double-count. If this is the first completion today, we pop the
  // Duolingo-style celebration with the new streak count.
  useEffect(() => {
    if (phase !== "closing") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("POST", "/api/prayer-streak/log");
        if (cancelled) return;
        const body = res as { streak: number; firstToday: boolean };
        // Refresh the header pill regardless of firstToday — the count
        // might have changed from a stale cache value to the real one.
        queryClient.invalidateQueries({ queryKey: ["/api/prayer-streak"] });
        if (body.firstToday) {
          setCelebration({ streak: body.streak });
          // Success haptic on the celebration entrance.
          try {
            window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "success" } }));
          } catch { /* ignore */ }
        }
      } catch {
        /* non-fatal — celebration just won't fire */
      }
    })();
    return () => { cancelled = true; };
  }, [phase]);

  // Fade in on mount; prevent body scroll; match Safari chrome to slide bg
  // so the top status-bar area and the bottom home-indicator area both
  // paint `#0C1F12` instead of flashing the app's default green/black.
  useEffect(() => {
    const SLIDE_BG = "#0C1F12";
    const html = document.documentElement;
    const body = document.body;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyBg = body.style.backgroundColor;
    const prevHtmlBg = html.style.backgroundColor;
    body.style.overflow = "hidden";
    body.style.backgroundColor = SLIDE_BG;
    html.style.backgroundColor = SLIDE_BG;
    const meta = document.querySelector('meta[name="theme-color"]');
    const prevMeta = meta?.getAttribute("content") ?? "#091A10";
    meta?.setAttribute("content", SLIDE_BG);
    // Rising ambient swell — the chapel exhaling as the slideshow opens.
    // First slide always plays the base octave (step 0). Subsequent slide
    // entries cycle to step 1, step 2, then back to 0 — see advance()
    // below for the per-slide calls.
    playOpeningSwell(0);
    const t = setTimeout(() => setVisible(true), 30);
    return () => {
      body.style.overflow = prevBodyOverflow;
      body.style.backgroundColor = prevBodyBg;
      html.style.backgroundColor = prevHtmlBg;
      meta?.setAttribute("content", prevMeta);
      clearTimeout(t);
    };
  }, []);

  const advance = () => {
    // Feedback (haptic + chime) fires immediately on tap so the response
    // feels coupled to the gesture, not to the fade.
    triggerAmenFeedback();
    // Record the "Amen" side effect as the viewer leaves the slide.
    // Fire-and-forget — we don't want a slow network call to gate the fade.
    // - request slide → POST /amen (the existing behaviour)
    // - intercession slide → POST /moment/:momentToken/:userToken/post
    //   with isCheckin=true, so a community intercession amen counts
    //   on the intercession detail page and in the streak even if the
    //   viewer bails out of the slideshow before the closing slide.
    const current = slides[index];
    if (current && current.kind === "request" && typeof current.requestId === "number") {
      const rid = current.requestId;
      apiRequest("POST", `/api/prayer-requests/${rid}/amen`).catch(() => {
        /* swallow — amen logging is best-effort, never blocks prayer flow */
      });
    }
    if (current && current.kind === "intercession" && current.momentToken && current.myUserToken) {
      const mt = current.momentToken;
      const ut = current.myUserToken;
      if (!loggedIntercessionsRef.current.has(mt)) {
        loggedIntercessionsRef.current.add(mt);
        apiRequest("POST", `/api/moment/${mt}/${ut}/post`, { isCheckin: true })
          .then(() => {
            // Keep the detail page + dashboard fresh so the new amen shows
            // up the moment the viewer lands there.
            queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
          })
          .catch(() => {
            /* swallow — best-effort, handleDone will retry if still pending */
          });
      }
    }
    setSlideVisible(false);
    setTimeout(() => {
      if (index < slides.length - 1) {
        const nextIndex = index + 1;
        setIndex(nextIndex);
        // Per-slide rising swell — cycles through 3 octave steps so
        // the chord climbs slide-by-slide (0 → +1 → +2) and resolves
        // back to base on every fourth slide. The first slide already
        // played octave 0 on mount; this fires for every subsequent
        // entry. Fire-and-forget; safe on web + iOS.
        playOpeningSwell(nextIndex % 3);
      } else {
        setPhase("closing");
      }
      setSlideVisible(true);
    }, 220);
  };

  const handleDone = async () => {
    // Log a check-in for every intercession the user has just prayed
    // through — skipping ones we already logged per-slide in `advance`.
    // Server-side check-ins are idempotent per day anyway, but avoiding
    // the re-POST trims tail latency on the closing slide.
    const toLog = intercessions.filter(
      (m) =>
        m.momentToken &&
        m.myUserToken &&
        !loggedIntercessionsRef.current.has(m.momentToken),
    );
    await Promise.allSettled(
      toLog.map((m) =>
        apiRequest("POST", `/api/moment/${m.momentToken}/${m.myUserToken}/post`, {
          isCheckin: true,
        }),
      ),
    );
    queryClient.invalidateQueries({ queryKey: ["/api/moments"] });

    // Native haptic on finish — a quiet "success" buzz so the user's
    // body knows the list is complete even before they look back at
    // the screen. Silently no-ops on the web build (native-shell
    // listens for this event only on iOS).
    try {
      window.dispatchEvent(
        new CustomEvent("phoebe:haptic", { detail: { style: "success" } })
      );
    } catch {
      /* non-fatal */
    }

    // Fade out then navigate. The CTA flow now reads: dashboard card →
    // slideshow (/prayer-mode) → home (/dashboard). The closing slide
    // already shows the streak, the people prayed-with, and the habit
    // invite, so dropping the user back to the prayer-list overview
    // afterwards felt redundant and made the session end on a "manage"
    // surface instead of the home screen they started from.
    setSlideVisible(false);
    setTimeout(() => {
      setVisible(false);
      setTimeout(() => setLocation("/dashboard"), 500);
    }, 300);
  };

  if (authLoading || !user) return null;

  const slide = slides[index];

  return (
    <div
      style={{
        background: "#0C1F12",
        minHeight: "100dvh",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.5s ease",
        position: "relative",
      }}
    >
      {/* Exit button — lands on the dashboard so leaving prayer is a clean
          return to the home view rather than dropping the user back into
          the prayer-list they were just trying to step away from. */}
      <button
        onClick={() => setLocation("/dashboard")}
        aria-label="Exit prayer mode"
        className="absolute top-6 right-6 w-10 h-10 flex items-center justify-center rounded-full z-10 text-xl"
        style={{ color: "rgba(200,212,192,0.4)", background: "rgba(200,212,192,0.06)" }}
      >
        ×
      </button>

      {/* Content — anchored toward the top third of the viewport so short
          slides (prayer requests, intercessions with no BCP block) don't
          float down near the bottom of tall phone screens. */}
      <div
        className="flex flex-col items-center text-center px-6 w-full"
        style={{
          maxWidth: 560,
          margin: "0 auto",
          minHeight: "100dvh",
          justifyContent: "flex-start",
          paddingTop: "clamp(64px, 16dvh, 180px)",
          paddingBottom: 40,
        }}
      >
        {phase === "prayer" && slide && (
          <div
            className="w-full"
            style={{ opacity: slideVisible ? 1 : 0, transition: "opacity 0.22s ease" }}
          >
            <SlideContent
              slide={slide}
              slideKey={index}
              onAdvance={advance}
              onRenew={(id, days) => {
                renewMutation.mutate({ id, days });
                advance();
              }}
              onEnd={(id) => {
                endMutation.mutate(id);
                advance();
              }}
              onAskSubmit={(body) => {
                createRequestMutation.mutate(body, { onSuccess: () => advance() });
              }}
              askSubmitting={createRequestMutation.isPending}
              suggestedFriends={suggestedFriends.map(f => ({
                name: f.name,
                email: f.email,
                avatarUrl: f.avatarUrl ?? null,
              }))}
              onPrayForFriend={(email) => {
                setLocation(`/pray-for/new/${encodeURIComponent(email)}`);
              }}
            />
          </div>
        )}

        {phase === "closing" && (
          <ClosingSlide
            celebration={celebration}
            streak={celebration?.streak ?? streakData?.streak ?? 0}
            coPrayers={coPrayersData?.people ?? []}
            onDone={handleDone}
            visible={slideVisible}
          />
        )}
      </div>

      {/* Progress */}
      {phase === "prayer" && slides.length > 0 && (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none">
          <p className="text-xs" style={{ color: "rgba(143,175,150,0.32)", letterSpacing: "0.06em" }}>
            {index + 1} of {slides.length}
          </p>
        </div>
      )}
    </div>
  );
}
