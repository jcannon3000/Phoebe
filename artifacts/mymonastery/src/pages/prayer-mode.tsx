import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { usePeople } from "@/hooks/usePeople";
import { apiRequest } from "@/lib/queryClient";
import { findBcpPrayer } from "@/lib/bcp-prayers";
import { triggerAmenFeedback, playOpeningSwell, triggerSubmitFeedback } from "@/lib/amenFeedback";
import { openExternal } from "@/lib/openExternal";
import type { MyActivePrayerFor } from "@/components/pray-for-them";
import { PrayerKindPill } from "@/components/prayer-kind-pill";
import { RequestWordField } from "@/components/RequestWordField";

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
  // Set when the intercession is scoped to a prayer feed instead of a
  // group. Drives the "Climate Justice" pill on the slide. For v1
  // phoebe-climate is the only feed, so a non-null prayerFeedId is
  // treated as the climate-justice tag.
  prayerFeedId?: number | null;
  // Optional outbound URL surfaced as a "Read more" link on the slide,
  // for background context (e.g. a Grist article about the issue).
  learnMoreUrl?: string | null;
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
  // True if THIS viewer has tapped Amen on this request today (in
  // their tz). Used to (a) start the slideshow at the next un-prayed
  // request when the user partially completed it earlier, and (b)
  // drive the dashboard's "X more prayers" partial-progress card.
  myAmenedToday?: boolean;
  // ISO timestamp when the request stops appearing to non-owners
  // unless renewed. Used by the slideshow as a defensive expiry filter.
  expiresAt?: string | null;
  // Author's framing — drives the small pill above the body on the
  // request slide ("Life event" / "For justice" / "Community
  // intercession"). Default "request" renders no pill.
  kind?: string | null;
}

interface PrayerSlide {
  kind: "intercession" | "request" | "prayer-for" | "prayer-for-expired" | "ask-request" | "pray-for-suggest" | "circle-intention" | "pause";
  text: string;
  attribution: string;
  fullText?: string | null;
  intention?: string | null;
  // intercession specific — "bcp" when the intercession was picked from
  // the Book of Common Prayer. Drives the "From the Book of Common Prayer"
  // attribution caption even when the topic title doesn't exactly match
  // a BCP_PRAYERS entry (e.g. user lightly edited the title).
  source?: string | null;
  // request specific — lets us record an amen against the originating
  // prayer request when the viewer taps "Amen" to advance.
  requestId?: number;
  // request specific — the viewer's existing one-line word of comfort on
  // this request, if any. `null` means they haven't commented yet, so
  // the slide surfaces an inline compose field.
  myWord?: string | null;
  // intercession specific — short tag rendered as a pill under the
  // eyebrow. Set for feed-scoped intercessions ("Climate Justice" for
  // anything on phoebe-climate). Null/undefined for group intercessions.
  feedTag?: string | null;
  // intercession specific — optional outbound URL ("Read more →") on the
  // slide for background reading. Trusted because it's authored only by
  // beta admins via the climate admin form.
  learnMoreUrl?: string | null;
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
  // request specific — the author's framing (life-event / justice /
  // community-intercession). Renders a small pill next to the eyebrow
  // when set. Distinct from PrayerSlide.kind (slide type).
  requestKind?: string | null;
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
  // True if THIS viewer already prayed this slide today. The slideshow
  // skips past these on entry so a partially-completed session resumes
  // at the next un-prayed slide. We don't HIDE these slides — the user
  // can still scroll/navigate back — we just pick the initial index.
  alreadyPrayedToday?: boolean;
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

// RequestWordField was lifted to components/RequestWordField.tsx so
// the Daily Office + Devotion intercession slides can render the same
// composer without reimplementing the public/private toggle, the
// ×-clear button, and the friendly error mapping.

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
function AmenButton({ slideKey, onAdvance }: {
  slideKey: string | number;
  onAdvance: () => void;
}) {
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
        transition: ready
          ? "background-color 360ms ease-out, border-color 360ms ease-out"
          : "none",
      }}
    >
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

// "Not today" — quiet skip link, anchored to the bottom of the
// slideshow viewport just above the "X of Y" counter. Used to live
// directly under the Amen button, but the user wanted it pushed
// down so it doesn't read as a sibling action to Amen — it's the
// quieter way out, not the obvious move. Each new slide gets a
// fresh 7-second hold (keyed on slideKey) so the link can't be
// tapped before the viewer has actually settled on the slide,
// matching the Amen button's gate.
function NotTodayLink({ slideKey, onSkip }: { slideKey: string | number; onSkip: () => void }) {
  const HOLD_MS = 7000;
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    const t = window.setTimeout(() => setReady(true), HOLD_MS);
    return () => window.clearTimeout(t);
  }, [slideKey]);
  return (
    // Anchor above the home-indicator safe area; the slide counter
    // sits at `safe + 16`, so we sit at `safe + 56` to leave a
    // breathable gap. Hard-coded pixel offsets (the previous bottom: 56)
    // don't account for the device gutter and got partially cut off on
    // iPhones with a home indicator.
    <div
      className="absolute left-0 right-0 flex justify-center pointer-events-none"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 56px)" }}
    >
      <button
        type="button"
        onClick={() => { if (ready) onSkip(); }}
        disabled={!ready}
        className="text-[12px] underline underline-offset-4 pointer-events-auto"
        style={{
          color: "rgba(143,175,150,0.55)",
          opacity: ready ? 1 : 0,
          transition: "opacity 280ms ease-out",
          background: "transparent",
          border: "none",
          cursor: ready ? "pointer" : "default",
        }}
      >
        Not today
      </button>
    </div>
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
  lastMine,
  onRenewLastMine,
  renewingLastMine,
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
  // Optional renew-card data: the user's most-recent past prayer
  // request when expired or released. Surfaces under the textarea on
  // the ask-request slide so the user can renew instead of typing a
  // brand-new ask. `null` if no past request, or if the past one is
  // still active.
  lastMine: { id: number; body: string } | null;
  onRenewLastMine: () => void;
  renewingLastMine: boolean;
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
          style={{ color: "#E8E4D8", fontFamily: "'Space Grotesk', sans-serif" }}
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
          style={{ color: "#E8E4D8", fontFamily: "'Space Grotesk', sans-serif" }}
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
            fontFamily: "'Space Grotesk', sans-serif",
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

        {/* Renew-instead card — only shown when the user's last prayer
            request is past (expired or released), giving them a one-tap
            way to bring it back for another 7 days instead of writing
            a fresh ask. Mirrors the same surface on /pray-request/new. */}
        {lastMine && (
          <div
            className="mt-4 w-full max-w-xs rounded-xl p-4 text-left"
            style={{
              background: "#0F2818",
              border: "1px solid rgba(46,107,64,0.35)",
            }}
          >
            <p
              className="text-[10px] uppercase tracking-[0.16em] font-semibold mb-2"
              style={{ color: "rgba(143,175,150,0.6)" }}
            >
              Or renew your last one
            </p>
            <p
              className="text-[13px] italic leading-snug mb-3"
              style={{
                color: "rgba(232,217,176,0.85)",
                fontFamily: "Georgia, 'Times New Roman', serif",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {lastMine.body}
            </p>
            <button
              onClick={onRenewLastMine}
              disabled={renewingLastMine}
              className="text-xs font-semibold rounded-full px-4 py-2 disabled:opacity-50"
              style={{ background: "rgba(46,107,64,0.45)", color: "#F0EDE6" }}
            >
              {renewingLastMine ? "Renewing…" : "Renew for 7 days"}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Open pause — invitation to bring anything else to prayer.
  // Sits as the final slide before the closing summary so the user
  // gets a meditative breath after the structured cards. Tapping
  // Continue advances to the closing slide; there's no submit, just
  // a held silence.
  if (slide.kind === "pause") {
    return (
      // The slide container sits at flex-start with a 16dvh top padding,
      // which leaves the pause content reading high. Pull it visually
      // toward center by reserving most of the slide's vertical space
      // and centring the contents inside.
      <div
        className="w-full flex flex-col items-center text-center gap-6"
        style={{ minHeight: "calc(100dvh - 32dvh)", justifyContent: "center" }}
      >
        <p
          className="text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "rgba(143,175,150,0.45)" }}
        >
          A moment to pause
        </p>
        <p
          className="text-[22px] leading-[1.55] font-medium italic"
          style={{
            color: "#E8E4D8",
            fontFamily: "Georgia, 'Times New Roman', serif",
            maxWidth: 380,
          }}
        >
          Take a breath. Bring anything else on your heart to prayer.
        </p>
        <p
          className="text-[13px] leading-relaxed"
          style={{ color: "rgba(143,175,150,0.65)", maxWidth: 320 }}
        >
          Someone you haven&rsquo;t named, a worry that surfaced this morning, the world that needs holding.
        </p>
        <button
          onClick={onAdvance}
          className="mt-2 px-10 py-3.5 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
          style={{ background: "#2D5E3F", color: "#F0EDE6" }}
        >
          Continue →
        </button>
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
          style={{ color: "#E8E4D8", fontFamily: "'Space Grotesk', sans-serif" }}
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
          style={{ color: "#E8E4D8", fontFamily: "'Space Grotesk', sans-serif" }}
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
                    fontFamily: "'Space Grotesk', sans-serif",
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
          {/* The author avatar's border pulses softly while their
              prayer is on screen — a small "this is them" heartbeat
              that ties the request body back to the person who asked.
              Animation is a CSS keyframe (.prayer-avatar-pulse) that
              breathes the border between the resting green and a
              brighter green, ~2.4s per cycle, infinite. */}
          {slide.authorAvatarUrl ? (
            <img
              src={slide.authorAvatarUrl}
              alt={slide.authorName ?? "Prayer author"}
              className="w-16 h-16 rounded-full object-cover prayer-avatar-pulse"
            />
          ) : (
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-semibold prayer-avatar-pulse"
              style={{ background: "#1A4A2E", color: "#A8C5A0" }}
            >
              {(slide.authorName ?? "")
                .split(" ")
                .slice(0, 2)
                .map(w => w[0]?.toUpperCase() ?? "")
                .join("")}
            </div>
          )}
          {slide.authorName && (
            <p className="text-[14px]" style={{ color: "#C8D4C0", fontFamily: "'Space Grotesk', sans-serif" }}>
              {slide.authorName}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-2 flex-wrap justify-center">
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
          {slide.kind === "request" && <PrayerKindPill kind={slide.requestKind} />}
        </div>
        {slide.kind === "intercession" && slide.feedTag && (
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide"
            style={{
              background: "rgba(46,107,64,0.22)",
              color: "#A8C5A0",
              border: "1px solid rgba(46,107,64,0.4)",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            🌿 {slide.feedTag}
          </span>
        )}
      </div>

      <p
        className="text-[22px] leading-[1.5] font-medium italic"
        style={{
          color: "#E8E4D8",
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
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
                  fontFamily: "'Space Grotesk', sans-serif",
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

      {/* Custom intercession — show the user's own prayer text. When the
          intercession was picked from the Book of Common Prayer but the
          topic title wasn't an exact match against BCP_PRAYERS (e.g. the
          user lightly edited it), we still render the BCP attribution
          caption underneath so the source is never silently dropped. */}
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
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: `${fit.size}px`,
                  lineHeight: fit.leading,
                }}
              >
                {slide.fullText}
              </p>
            );
          })()}
          {slide.source === "bcp" && (
            <p
              className="text-[9px] uppercase tracking-[0.14em] mt-3"
              style={{ color: "rgba(143,175,150,0.3)" }}
            >
              From the Book of Common Prayer
            </p>
          )}
        </div>
      )}

      {/* Optional "Read more" link — surfaces an article or background
          piece the admin attached when authoring the intercession. On
          the iOS shell openExternal routes through SFSafariViewController
          so the user stays inside Phoebe; on web it opens a new tab.
          Either way the slideshow state is preserved. */}
      {slide.kind === "intercession" && slide.learnMoreUrl && (
        <button
          onClick={() => openExternal(slide.learnMoreUrl!)}
          className="text-xs underline decoration-dotted underline-offset-4 mt-1 bg-transparent border-0 p-0"
          style={{ color: "rgba(168,197,160,0.75)" }}
        >
          Read more →
        </button>
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
// Shown after the user finishes the prayer-list. Headline metric is
// "You prayed with N people" — community count, not streak. The streak
// number used to lead this slide; user feedback was that the closing
// moment should be about who you held alongside, not a personal-streak
// scoreboard. Layers, top to bottom:
//   1. Big number — count of distinct people whose intercession circles,
//      requests, or prayer-fors the viewer touched in the last 7 days.
//   2. Avatar rail — up to 5 of those faces, with a "+N" tail.
//   3. Habit invite — same relational copy as before.
//
// `streak` is still passed in (and StreakCelebration still fires for
// the firstToday milestone, briefly) but is no longer surfaced as the
// resting state of the slide. We keep `coPrayers.length` as the
// resting headline so the user lands on community, not personal.
function ClosingSlide({
  celebration,
  streak: _streak,
  coPrayers,
  onDone,
  visible,
}: {
  celebration: { streak: number } | null;
  /** Still accepted for symmetry with the celebration animation, but no
   *  longer rendered as the resting headline. */
  streak: number;
  coPrayers: Array<{ id: number; name: string | null; avatarUrl: string | null }>;
  onDone: () => void;
  visible: boolean;
}) {
  void _streak;
  const visibleAvatars = coPrayers.slice(0, 5);
  const overflow = Math.max(0, coPrayers.length - visibleAvatars.length);
  const peopleCount = coPrayers.length;

  return (
    <div
      className="w-full flex flex-col items-center text-center"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 0.4s ease",
        gap: 28,
      }}
    >
      {/* Celebration burst still fires on firstToday — kept for the
          satisfying entrance — but the resting headline below is the
          community count, not a streak number. */}
      {celebration && (
        <StreakCelebration streak={celebration.streak} />
      )}

      {/* Headline: people-prayed-with count. Only rendered if the
          celebration animation isn't running (otherwise we have two
          big numbers on screen). Falls back to a quiet "Held in
          prayer" eyebrow when the count is zero, so a first-ever
          session before any garden activity still feels complete. */}
      {!celebration && (
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
            You prayed with
          </p>
          {peopleCount > 0 ? (
            <>
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
                {peopleCount}
              </p>
              <p
                className="text-sm mt-1"
                style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {peopleCount === 1 ? "person this week" : "people this week"}
              </p>
            </>
          ) : (
            <p
              className="text-[22px] mt-3 italic"
              style={{ color: "#E8E4D8", fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              You held the world in prayer.
            </p>
          )}
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

  // When prayer-mode is opened as the intercessions handoff from the
  // Daily Office or a Devotion, the office tacks ?returnTo=<office url>
  // and ?seamless=1 onto the URL. We honor both: handleDone /
  // handleExit route to returnTo instead of /dashboard, and seamless=1
  // skips the closing summary slide entirely so the office's
  // General Thanksgiving + final blessing read as one continuous
  // beat with the prayer-mode rotation.
  const returnToHref = (() => {
    if (typeof window === "undefined") return null;
    const search = new URLSearchParams(window.location.search);
    const v = search.get("returnTo");
    return v && v.length > 0 ? v : null;
  })();
  const seamlessFlow = (() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("seamless") === "1";
  })();
  const finishHref = returnToHref ?? "/dashboard";

  const momentsQuery = useQuery<{ moments: Moment[] }>({
    queryKey: ["/api/moments"],
    queryFn: () => apiRequest("GET", "/api/moments"),
    enabled: !!user,
  });
  const momentsData = momentsQuery.data;

  const prayerRequestsQuery = useQuery<PrayerRequest[]>({
    queryKey: ["/api/prayer-requests"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests"),
    enabled: !!user,
  });
  const prayerRequests = prayerRequestsQuery.data ?? [];

  const myPrayersForQuery = useQuery<MyActivePrayerFor[]>({
    queryKey: ["/api/prayers-for/mine"],
    queryFn: () => apiRequest("GET", "/api/prayers-for/mine"),
    enabled: !!user,
  });
  const myPrayersFor = myPrayersForQuery.data ?? [];

  // Friends list — used by the "pray for someone" final slide that
  // appears after the main list when the viewer already has an active
  // prayer request of their own. We filter out anyone they're already
  // praying for so the pill row is an actionable "start a prayer for X"
  // menu, not a duplicate of their existing prayers-for.
  const { data: friends = [] } = usePeople(user?.id);

  // Every active intention from every prayer circle this user belongs to.
  // Surfaced as its own slide-kind so members carry the circle's shared
  // intentions alongside their own intercessions and others' requests.
  const circleIntentionsQuery = useQuery<{ intentions: CircleIntention[] }>({
    queryKey: ["/api/groups/me/circle-intentions"],
    queryFn: () => apiRequest("GET", "/api/groups/me/circle-intentions"),
    enabled: !!user,
  });
  const circleIntentionsData = circleIntentionsQuery.data;

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
  // slideshow then ends naturally. Default duration is 7 days, matching
  // the home FAB and the standalone authoring page.
  const createRequestMutation = useMutation({
    mutationFn: (body: string) =>
      apiRequest("POST", "/api/prayer-requests", { body, isAnonymous: false, durationDays: 7 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests/last-mine"] });
    },
  });

  // Renew-instead path on the ask-request slide. Pulls the user's most
  // recent prayer request; if it's expired or released we render a
  // small card under the textarea so they can revive that one for
  // another 7 days instead of typing a brand-new ask.
  const lastMineQuery = useQuery<{ request: {
    id: number; body: string; createdAt: string; expiresAt: string | null;
    closedAt: string | null; isAnswered: boolean; isActive: boolean; isExpired: boolean;
  } | null }>({
    queryKey: ["/api/prayer-requests/last-mine"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests/last-mine"),
    enabled: !!user,
  });
  const renewableLastMine: { id: number; body: string } | null = (() => {
    const r = lastMineQuery.data?.request;
    if (!r) return null;
    if (r.isActive) return null; // already alive — handled by /prayer-list
    if (r.isAnswered) return null;
    if (!r.isExpired && !r.closedAt) return null;
    return { id: r.id, body: r.body };
  })();
  const renewLastMineMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/prayer-requests/${id}/renew`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests/last-mine"] });
    },
  });

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  // Force a fresh fetch of every data source the slideshow depends on
  // every time the page mounts. Tapping a day-old bell push reuses
  // React Query's cache from yesterday's session, so the slide list,
  // active prayer detection, and "ask-request" gate were all computed
  // off stale data — the user reported seeing yesterday's slides and
  // missing the "no active prayer? share one" prompt for today.
  // Invalidating at mount triggers a refetch immediately while the
  // cached values still display, so by the time the slides array is
  // captured into frozenSlides it reflects today's state.
  //
  // Also wipe any stale slideshow-progress entry whose key is not
  // today's local date — yesterday's "you finished 4 of 7" entry must
  // not pull the resume index forward into today's fresh slide list.
  useEffect(() => {
    if (!user) return;
    queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests/last-mine"] });
    queryClient.invalidateQueries({ queryKey: ["/api/prayers-for/mine"] });
    queryClient.invalidateQueries({ queryKey: ["/api/groups/me/circle-intentions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/prayer-streak"] });
    queryClient.invalidateQueries({ queryKey: ["/api/prayer-streak/co-prayers-week"] });

    // Clear all slideshow-progress entries that aren't today's. Iterate
    // localStorage in a try/catch so a parse failure on one stale key
    // never blocks the rest.
    try {
      const todayKey = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      })();
      const prefix = "phoebe:slideshow-progress:";
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        if (k !== `${prefix}${todayKey}`) toRemove.push(k);
      }
      for (const k of toRemove) localStorage.removeItem(k);
    } catch { /* private mode / quota — non-fatal */ }
    // Run only once per mount. Subsequent invalidations come from the
    // mutations that trigger them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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

  // Reciprocity rule: others' prayer requests are only surfaced to
  // viewers who have an open prayer request of their own. The slideshow
  // is meant to feel like a circle of mutual intercession — viewers who
  // don't share their own asks shouldn't be on the receiving end of
  // others'. Computed up front so the slides[] spread can gate the
  // request section on it; the same flag still drives the trailing
  // "ask-request" slide further below for viewers with no active ask.
  const hasActiveOwnRequest = prayerRequests.some(
    (r) => r.isOwnRequest === true && !r.isAnswered && !r.closedAt,
  );

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
      // Feed-scoped intercessions get the "Climate Justice" pill under
      // the eyebrow. phoebe-climate is the only feed for now, so a
      // non-null prayerFeedId is treated as the climate tag — generalize
      // to per-feed pill text when more feeds exist.
      const feedTag = m.prayerFeedId ? "Climate Justice" : null;
      // Feed-scoped moments don't have a primary group; replace the
      // empty "with …" attribution with a softer subtitle so the slide
      // doesn't read like a one-person prayer.
      const finalAttribution = m.prayerFeedId && !attributionLabel
        ? "Your community is holding this."
        : attributionLabel
          ? `with ${attributionLabel}`
          : "";
      return {
        kind: "intercession" as const,
        text: title,
        intention: intentionSub,
        fullText: m.intercessionFullText?.trim() || null,
        source: m.intercessionSource ?? null,
        attribution: finalAttribution,
        weekPrayCount: m.weekPostCount ?? 0,
        momentToken: m.momentToken,
        myUserToken: m.myUserToken,
        communityFaces,
        feedTag,
        learnMoreUrl: m.learnMoreUrl?.trim() || null,
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
    // be shown their own ask as a slide to pray for. Gated on
    // `hasActiveOwnRequest` (computed above): viewers without an open
    // ask of their own skip this section entirely and instead see the
    // trailing "ask-request" slide nudging them to participate.
    ...(hasActiveOwnRequest
      ? prayerRequests
          .filter((r) => {
            if (r.isAnswered) return false;
            // Default-kind own requests stay out of the slideshow — the
            // viewer doesn't need their own personal ask as a slide to
            // pray for. But Justice and Life-event are intentions the
            // author explicitly wants their community (themselves
            // included) to carry, so we keep them in.
            if (r.isOwnRequest && (!r.kind || r.kind === "request")) return false;
            // Defense in depth: the personal feed already drops others'
            // expired requests at the SQL layer, but a stale cache (e.g.
            // an expiry crossing while the user is mid-session) could let
            // one slip through. Skip it so it never appears as a slide.
            if (r.expiresAt && new Date(r.expiresAt) <= new Date()) return false;
            return true;
          })
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
            requestKind: r.kind ?? null,
            alreadyPrayedToday: r.myAmenedToday === true,
          }))
      : []),
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
  //     (the existing ask-request slide). Drives both this trailing
  //     slide AND the reciprocity gate on the request section above —
  //     the same flag, computed once at the top of this scope.
  //   - Otherwise → no trailing slide. We previously appended a
  //     "Would you like to pray for one of your friends?" suggester
  //     ("pray-for-suggest") here, but the user asked for it to be
  //     removed from the slideshow — the list should end quietly on
  //     the last prayer, not nudge the viewer to add more.
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

  // Pause slide — always present, sits as the final slide before the
  // closing summary. A meditative breath: the user is invited to bring
  // anything else on their heart to prayer that the slideshow couldn't
  // know about (a worry that surfaced this morning, a person no card
  // captured, etc.). Keeping it inside the slides array (rather than
  // as its own phase) means it inherits the same swipe/Amen advance
  // and persists in slideshow-progress for partial-completion math.
  slides.push({
    kind: "pause",
    text: "",
    attribution: "",
  });

  // All four data queries finished resolving. The slideshow waits for
  // this before deciding the start index — otherwise, opening from a
  // bell push (cold start) would compute slides off an empty cache,
  // mount at index 0, then "flip around" to the right slot once data
  // arrived. The user reported that flicker; the loading screen below
  // covers it.
  // Use cached data the instant it's available. Earlier we also
  // gated on `!isFetching` to wait out the mount-triggered refetch,
  // which was meant to dodge the day-old-push refresh bug — but the
  // cost was a buffering spinner on every cold start, even when the
  // cache was perfectly fresh. We trade that edge case (yesterday's
  // data briefly informing the resume index on a day rollover) for
  // instant slideshow open. The snapshot below is captured once and
  // frozen for the session, so a slightly later refetch can't tear
  // slides out from under the user mid-prayer.
  const dataReady =
    momentsQuery.isSuccess &&
    prayerRequestsQuery.isSuccess &&
    myPrayersForQuery.isSuccess &&
    circleIntentionsQuery.isSuccess;

  // Today key in local time — used to scope localStorage progress so
  // a session started yesterday doesn't bleed into today's resume.
  const slideshowTodayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const progressStorageKey = `phoebe:slideshow-progress:${slideshowTodayKey}`;

  // -1 sentinel = "not initialised yet". Once data is ready, an effect
  // computes the resume index from (a) localStorage progress saved on
  // X-out / advance, falling back to (b) the first un-amened request.
  // Keeping initialisation in an effect (not the useState initialiser)
  // ensures we don't read `slides` while it's still empty.
  const [index, setIndex] = useState<number>(-1);

  // Snapshot of the slide list captured the first time data is ready.
  // Once a session starts we navigate against this frozen copy so a
  // mid-show refetch (e.g., an intercession's 24h grace boundary
  // crossing while the user is praying) can't drop a slide under the
  // user — the symptom was a "flash → jump back" glitch when the live
  // `slides` array shrank between renders.
  const [frozenSlides, setFrozenSlides] = useState<PrayerSlide[] | null>(null);

  useEffect(() => {
    if (!dataReady || index !== -1) return;
    const captured = slides;
    setFrozenSlides(captured);
    let resumeAt = 0;
    // Seamless handoff from the Daily Office / Devotion intercession
    // portal: ALWAYS start at index 0, ignoring any stored "resume"
    // progress and the alreadyPrayedToday skip. The user is in the
    // middle of a liturgy and expects to walk every appointed
    // intercession from the top — picking up mid-rotation or
    // skipping slides because they already amened earlier today
    // both read as bugs in this flow.
    if (!seamlessFlow) {
      try {
        const raw = localStorage.getItem(progressStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as { completed?: number };
          if (typeof parsed.completed === "number" &&
              parsed.completed > 0 &&
              parsed.completed < captured.length) {
            resumeAt = parsed.completed;
          }
        }
      } catch { /* ignore corrupt entry */ }
      if (resumeAt === 0) {
        const firstUnPrayed = captured.findIndex((s) => !s.alreadyPrayedToday);
        resumeAt = firstUnPrayed >= 0 ? firstUnPrayed : 0;
      }
    }
    setIndex(resumeAt);
  }, [dataReady, index, progressStorageKey, slides, seamlessFlow]);

  // All consumers below should read from this — `slides` is the live
  // (re-rendering) array, `displaySlides` is the stable session copy.
  const displaySlides = frozenSlides ?? slides;
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

  // Initialise phase once slides are loaded. The empty-list case
  // normally lands on the closing summary so the user sees a
  // streak / "you've prayed for X people" recap; in seamless mode
  // (intercessions handoff from the Office / Devotion) we instead
  // hand the user back to the office, since the closing summary is
  // the very thing the seamless flow is meant to defer to the end
  // of the whole liturgy.
  useEffect(() => {
    if (displaySlides.length === 0 && momentsData && prayerRequests && myPrayersFor) {
      if (seamlessFlow) {
        setLocation(finishHref);
      } else {
        setPhase("closing");
      }
    }
  }, [displaySlides.length, momentsData, prayerRequests, myPrayersFor, seamlessFlow, finishHref, setLocation]);

  // When the user lands on the closing slide, log the prayer-list streak.
  // The server is idempotent per TZ-local day — calling twice doesn't
  // double-count. If this is the first completion today, we pop the
  // Duolingo-style celebration with the new streak count.
  //
  // Also fire the audio + haptic moment that marks the conclusion: a
  // resolving swell at the base octave (matches the opening) plus a
  // big "celebration" haptic — the iOS success-notification double-tap
  // chained with a heavy thump ~140ms later, à la Duolingo's lesson-
  // complete moment. Independent of `firstToday` — every arrival on
  // the closing slide should feel like crossing a threshold, even if
  // it's the user's second prayer today and no streak card pops.
  useEffect(() => {
    if (phase !== "closing") return;
    // Continue the chord progression: each prior slide played
    // `slideIndex % 3`, so the closing slide picks up where the last
    // would have left off. Treat the closing as slide N+1 in the
    // sequence — `slides.length % 3`. If the slideshow had 5 slides
    // (0,1,2,0,1), the closing lands on 2; if it had 3, the closing
    // lands back on 0 naturally.
    playOpeningSwell(displaySlides.length % 3);
    try {
      window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "celebration" } }));
    } catch { /* ignore */ }

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
          // Success haptic on the celebration entrance — distinct
          // beat from the heavy "you arrived" haptic above.
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
    // Haptic on slideshow open — pairs with the swell so a push tap feels
    // grounded the moment the first slide appears (not just when advancing).
    window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "medium" } }));
    const t = setTimeout(() => setVisible(true), 30);
    return () => {
      body.style.overflow = prevBodyOverflow;
      body.style.backgroundColor = prevBodyBg;
      html.style.backgroundColor = prevHtmlBg;
      meta?.setAttribute("content", prevMeta);
      clearTimeout(t);
    };
  }, []);

  // Move to the next slide without recording an amen / check-in.
  // Used by the "Not today" hyperlink under the Amen button — gives
  // viewers a quiet way to pass on a particular prayer (e.g. "I
  // don't feel like I have it in me to hold this one") without
  // skipping the rest of the slideshow.
  const skipToNext = () => {
    setSlideVisible(false);
    setTimeout(() => {
      if (index < displaySlides.length - 1) {
        const nextIndex = index + 1;
        try {
          localStorage.setItem(progressStorageKey, JSON.stringify({
            completed: nextIndex,
            total: displaySlides.length,
          }));
        } catch { /* private mode / quota — non-fatal */ }
        setIndex(nextIndex);
        playOpeningSwell(nextIndex % 3);
      } else {
        try {
          localStorage.removeItem(progressStorageKey);
        } catch { /* non-fatal */ }
        // Seamless mode (intercessions handoff from the Daily
        // Office / Devotion): skip the closing summary entirely
        // and hand the user back to the office for its General
        // Thanksgiving + final blessing. Otherwise show the
        // streak / "you've prayed for X people" closing as
        // usual.
        if (seamlessFlow) {
          setLocation(finishHref);
        } else {
          setPhase("closing");
        }
      }
      setSlideVisible(true);
    }, 220);
  };

  const advance = () => {
    // Feedback (haptic + chime) fires immediately on tap so the response
    // feels coupled to the gesture, not to the fade.
    triggerAmenFeedback();
    // Clear today's bell (morning / midday / evening) from the lock
    // screen the moment the user prays. Each Amen tap is a "yes, I'm
    // praying" signal — the nudge has done its job and shouldn't
    // linger. Native shell removes any delivered push whose APN
    // thread-id matches; idempotent if the notification was already
    // dismissed or the user is on web.
    try {
      window.dispatchEvent(
        new CustomEvent("phoebe:clear-notifications", { detail: { threadId: "bell" } })
      );
    } catch {
      /* non-fatal */
    }
    // Record the "Amen" side effect as the viewer leaves the slide.
    // Fire-and-forget — we don't want a slow network call to gate the fade.
    // - request slide → POST /amen (the existing behaviour)
    // - intercession slide → POST /moment/:momentToken/:userToken/post
    //   with isCheckin=true, so a community intercession amen counts
    //   on the intercession detail page and in the streak even if the
    //   viewer bails out of the slideshow before the closing slide.
    const current = displaySlides[index];
    if (current && current.kind === "request" && typeof current.requestId === "number") {
      const rid = current.requestId;
      apiRequest("POST", `/api/prayer-requests/${rid}/amen`)
        .then(() => {
          // Two invalidations:
          //   • /api/prayer-requests — the prayer-list feed; flips
          //     myAmenedToday and updates per-card amen counts. Drives
          //     the dashboard's partial-progress state ("X more
          //     prayers / Continue praying") and this slideshow's
          //     resume-where-you-left-off behaviour on re-entry.
          //   • /api/prayer-requests/by-id/:id — the detail page's
          //     query for THIS request specifically. Without it the
          //     "Prayed N times" line on /prayer-requests/:id went
          //     stale until the user navigated away and back.
          queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
          queryClient.invalidateQueries({ queryKey: [`/api/prayer-requests/by-id/${rid}`] });
        })
        .catch(() => {
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
      if (index < displaySlides.length - 1) {
        const nextIndex = index + 1;
        // Persist per-day progress so the dashboard can render
        // "Continue praying / N more prayers" if the user X-outs
        // mid-list. The streak endpoint only flips loggedToday=true
        // on the closing slide, so without this we couldn't tell
        // "started but didn't finish" from "fresh" — and the count
        // had to span all slide kinds (intercessions, prayers-for,
        // circle intentions), not just prayer-request amens.
        try {
          localStorage.setItem(progressStorageKey, JSON.stringify({
            completed: nextIndex,
            total: displaySlides.length,
          }));
        } catch { /* private mode / quota — non-fatal */ }
        setIndex(nextIndex);
        // Per-slide rising swell — cycles through 3 octave steps so
        // the chord climbs slide-by-slide (0 → +1 → +2) and resolves
        // back to base on every fourth slide. The first slide already
        // played octave 0 on mount; this fires for every subsequent
        // entry. Fire-and-forget; safe on web + iOS.
        playOpeningSwell(nextIndex % 3);
      } else {
        // Reaching the end — clear the progress entry so a re-entry
        // later today doesn't resume past the end. Seamless mode
        // (intercessions handoff from the Daily Office / Devotion):
        // skip the closing summary entirely and hand the user back
        // to the office for its General Thanksgiving + final
        // blessing. Otherwise show the streak / "you've prayed for
        // X people" closing slide as usual.
        try {
          localStorage.removeItem(progressStorageKey);
        } catch { /* non-fatal */ }
        if (seamlessFlow) {
          setLocation(finishHref);
        } else {
          setPhase("closing");
        }
      }
      setSlideVisible(true);
    }, 220);
  };

  // X-out handler — persists progress (so the dashboard can show
  // "Continue praying"), invalidates the home-screen queries (so the
  // user lands on a fresh dashboard rather than stale cached data),
  // then routes home.
  const handleExit = () => {
    try {
      if (index > 0 && index < displaySlides.length) {
        localStorage.setItem(progressStorageKey, JSON.stringify({
          completed: index,
          total: displaySlides.length,
        }));
      }
    } catch { /* non-fatal */ }
    queryClient.invalidateQueries();
    setLocation(finishHref);
  };

  const handleDone = async () => {
    // Log a check-in for every intercession the user has just prayed
    // through — skipping ones we already logged per-slide in `advance`.
    // Server-side check-ins are idempotent per day anyway, but avoiding
    // the re-POST trims tail latency on the closing slide.
    // Log against the frozen slide list, not the live `intercessions`
    // array — if a moment vanished from the API mid-session we still
    // want to credit the user for what they actually walked through.
    const toLog = displaySlides.filter(
      (s): s is PrayerSlide & { momentToken: string; myUserToken: string } =>
        s.kind === "intercession" &&
        !!s.momentToken &&
        !!s.myUserToken &&
        !loggedIntercessionsRef.current.has(s.momentToken),
    );
    await Promise.allSettled(
      toLog.map((s) =>
        apiRequest("POST", `/api/moment/${s.momentToken}/${s.myUserToken}/post`, {
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

    // Clear today's morning/evening bell from the iOS notification
    // center. The bell push is a "time to pray for your friends"
    // nudge — once the user has actually prayed, the lock-screen
    // banner has done its job and lingering there into the afternoon
    // just looks like an unread item. Native shell listens for
    // 'phoebe:clear-notifications' and removes any delivered
    // notification whose APN thread-id matches. No-op on web.
    try {
      window.dispatchEvent(
        new CustomEvent("phoebe:clear-notifications", { detail: { threadId: "bell" } })
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
      setTimeout(() => setLocation(finishHref), 500);
    }, 300);
  };

  if (authLoading || !user) return null;

  // Hold a calm loading screen until the slide list is captured into
  // `frozenSlides` AND the resume index is computed. The snapshot is
  // taken when `dataReady` first flips true; after that, background
  // refetches (mount-time invalidate, focus refetch, …) flip
  // `isFetching` true again, but we keep displaying the snapshot
  // rather than reverting to the spinner. Without this, the user
  // saw the first slide flash for a render, get replaced by the
  // spinner during the refetch, then come back identical.
  if (!frozenSlides || index < 0) {
    return (
      <div
        style={{
          background: "#0C1F12",
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          className="animate-spin"
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "2px solid rgba(232,228,216,0.6)",
            borderTopColor: "transparent",
          }}
        />
      </div>
    );
  }

  const slide = displaySlides[index];

  return (
    <div
      // Closing-slide background pulses gently to mark "you arrived" —
      // a slow color breathe between the base #0C1F12 and a softly
      // brighter green, ~3.2s per cycle, infinite while the closing
      // slide is up. The pulse is implemented as a CSS animation on
      // the .closing-pulse class (see index.css). Other phases keep
      // the static background.
      className={phase === "closing" ? "closing-pulse" : undefined}
      style={{
        background: phase === "closing" ? undefined : "#0C1F12",
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
        onClick={handleExit}
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
              lastMine={renewableLastMine}
              onRenewLastMine={() => {
                if (!renewableLastMine) return;
                renewLastMineMutation.mutate(renewableLastMine.id, {
                  onSuccess: () => advance(),
                });
              }}
              renewingLastMine={renewLastMineMutation.isPending}
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

      {/* "Not today" skip link, anchored just above the slide
          counter. Only shown on slides where the viewer is actually
          praying for something they could decline today (request /
          intercession / circle-intention / prayer-for); we don't
          surface it on prompt slides like ask-request or pause that
          aren't asking the viewer to amen something.  */}
      {phase === "prayer" && slide && (
        slide.kind === "request"
        || slide.kind === "intercession"
        || slide.kind === "circle-intention"
        || slide.kind === "prayer-for"
      ) && (
        <NotTodayLink slideKey={index} onSkip={skipToNext} />
      )}

      {/* Progress — sits just above the home-indicator gutter. The
          old `bottom-8` (32px) overlapped the gutter on iPhones with
          safe-area inset. */}
      {phase === "prayer" && displaySlides.length > 0 && (
        <div
          className="absolute left-0 right-0 flex justify-center pointer-events-none"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
        >
          <p className="text-xs" style={{ color: "rgba(143,175,150,0.32)", letterSpacing: "0.06em" }}>
            {index + 1} of {displaySlides.length}
          </p>
        </div>
      )}
    </div>
  );
}
