import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { usePeople } from "@/hooks/usePeople";
import { apiRequest } from "@/lib/queryClient";
import { findBcpPrayer } from "@/lib/bcp-prayers";
import { triggerAmenFeedback, playOpeningSwell, triggerSubmitFeedback } from "@/lib/amenFeedback";
import { openExternal } from "@/lib/openExternal";
import type { MyActivePrayerFor } from "@/components/pray-for-them";
import { PrayerKindPill } from "@/components/prayer-kind-pill";
import { RequestWordField } from "@/components/RequestWordField";
import { usePrayerSession } from "@/hooks/usePrayerSession";

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
  // True if this viewer logged a check-in on this intercession today
  // (their local timezone). Drives the queue=new filter so the home
  // card's "N prayer requests waiting" count + the tap target agree.
  myLoggedToday?: boolean;
  group?: { id: number; name: string; slug: string; emoji: string | null } | null;
  // Multi-group intercessions: every additional community the moment
  // was attached to via the moment_groups junction. Combined with
  // `group` on the slide to render one pill per community.
  additionalGroups?: Array<{ id: number; name: string; slug: string; emoji: string | null }>;
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
  // True if THIS viewer has *ever* tapped Amen on this request (any
  // day). Drives the queue-new mode below — when the home card sends
  // the user in to "respond to your friends," we only want to show
  // requests they haven't engaged with at all.
  myAmenedEver?: boolean;
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
  // intercession specific — every community this intercession is
  // attached to (primary + additional). Rendered as a row of pills
  // under the title so a slide for "For the Mission of the Church"
  // shows which communities are carrying it. Empty/undefined for
  // feed-scoped or single-community intercessions where the chip
  // would be redundant.
  groups?: Array<{ id: number; name: string; slug: string; emoji: string | null }>;
  // intercession specific — feed-entry origin metadata. Set when the
  // slide came from a prayer feed (prayerFeedEntriesTable / its
  // recurring sibling), so the Amen handler can POST to the feed's
  // /pray endpoint and the slideshow tap shows up on the
  // /prayer-feeds/today + community-feed counts.
  feedSlug?: string | null;
  feedEntryDate?: string | null;
  feedEntrySlot?: number | null;
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
  // request specific — true when the viewer authored this request.
  // Drives the "YOUR REQUEST" eyebrow, hides the comment compose
  // field (you can't comment on your own), shows the read-only list
  // of others' words of comfort, and suppresses the Amen API call
  // (you can't pray for yourself via your own request).
  isOwnRequest?: boolean;
  // request specific — the public words of comfort others have
  // left on this request. Used by the own-request slide to render
  // a read-only "what people have said" list.
  words?: Array<{ authorName: string; content: string; createdAt: string | null }>;
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

// 4-second pause-before-Amen. When a slide first appears the button
// shows a dim green pill with a left-to-right progress wash and no
// label. After 4 seconds the wash hits 100%, the button brightens,
// "Amen →" fades up, and a soft "light" haptic fires — distinct from
// the medium-impact haptic that triggers on the tap itself, so the
// reveal and the press feel like two different events.
//
// Why: tappers were ripping through the slideshow in a few seconds
// without actually pausing on each prayer. The forced wait turns
// each slide into a real moment of attention. Landed on 4s after
// 7s tested too long (users hovered, waiting on a button that felt
// stuck) and 3s too short (eyes finished reading and the hand was
// already on the button). The CSS keyframe duration in index.css
// is kept in sync — if one changes, change the other.
//
// Accepts a `slideKey` prop so the parent can force a remount-style
// reset when the slide changes (we use the slide index).
function AmenButton({ slideKey, onAdvance }: {
  slideKey: string | number;
  onAdvance: () => void;
}) {
  const HOLD_MS = 4000;
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

// (Removed: NotTodayLink — the per-slide "Not today" skip link is
// gone per user direction. The slide flow is Amen-or-X-out only.)

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
          A short note; your garden will hold it for 7 days.
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

      {/* For intercessions with explicit group attachments, render one
          pill per community in place of the plaintext "with {group}"
          attribution. Mirrors the row on the moment-detail page so a
          slide for a multi-community intercession shows which
          communities are carrying it. Non-tappable here — the
          slideshow shouldn't bounce the user out of prayer mode to a
          community home page; the chips are informational. Falls back
          to the plaintext attribution when there are no groups (feed-
          scoped intercessions, prayer requests, etc.). */}
      {slide.kind === "intercession" && slide.groups && slide.groups.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 justify-center">
          {slide.groups.map((g) => (
            <span
              key={g.id}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium"
              style={{
                background: "rgba(46,107,64,0.18)",
                color: "#A8C5A0",
                border: "1px solid rgba(46,107,64,0.32)",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              {g.emoji && <span aria-hidden>{g.emoji}</span>}
              <span>{g.name}</span>
            </span>
          ))}
        </div>
      ) : slide.attribution ? (
        <p className="text-sm" style={{ color: "#8FAF96" }}>
          {slide.attribution}
        </p>
      ) : null}

      {slide.kind === "intercession" && (
        <>
          {/* Up-to-7 prayed-this-week avatar stack. Same visual
              vocabulary as the dashboard's Daily Prayer card — small
              overlapping circles with a slim background-matching
              border that punches the rounded edges. Server fills
              `slide.communityFaces` with feed subscribers who have
              actually posted to this moment in the rolling 7-day
              window (preferring members with avatars when more than
              7 candidates qualify; backfilled with initials-only
              members otherwise). The "X people have prayed this
              this week" line below labels what the stack represents. */}
          {slide.communityFaces && slide.communityFaces.length > 0 && (
            <div
              className="flex items-center -space-x-2"
              style={{ marginTop: "-2px" }}
            >
              {slide.communityFaces.slice(0, 7).map((f) => (
                <div
                  key={f.email}
                  title={f.name}
                  className="rounded-full overflow-hidden shrink-0"
                  style={{
                    width: 30,
                    height: 30,
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
                      className="w-full h-full flex items-center justify-center text-[11px] font-semibold"
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

      {/* Optional outbound link. "Take action →" when the intercession
          is an action-type (community admin authored it with a CTA);
          "Learn more →" otherwise (background article on a feed entry
          or a written prayer responding to an article). On the iOS
          shell openExternal routes through SFSafariViewController so
          the user stays inside Phoebe; on web it opens a new tab. */}
      {slide.kind === "intercession" && slide.learnMoreUrl && (
        <button
          onClick={() => openExternal(slide.learnMoreUrl!)}
          className={
            slide.source === "action"
              ? "text-[11px] font-semibold px-3 py-1 rounded-full mt-1"
              : "text-xs underline decoration-dotted underline-offset-4 mt-1 bg-transparent border-0 p-0"
          }
          style={
            slide.source === "action"
              ? {
                  background: "rgba(46,107,64,0.35)",
                  color: "#C8D4C0",
                  border: "1px solid rgba(46,107,64,0.55)",
                  fontFamily: "'Space Grotesk', sans-serif",
                  cursor: "pointer",
                }
              : { color: "rgba(168,197,160,0.75)" }
          }
        >
          {slide.source === "action" ? "Take action →" : "Learn more →"}
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

// ─── Office habit slide ───────────────────────────────────────────────────
// Shown ONLY when the user finished an office (closingOnly=1 path),
// after the "you prayed for N people this week" closing slide. Surfaces
// today's morning/evening office status as two checkbox-style rows and
// a 7-day rhythm grid below so the user can see the daily-prayer habit
// taking shape. Encouraging copy frames it as a rhythm to lean into,
// not a streak to defend.
//
// Completion data is read straight from localStorage — the same
// `phoebe:office-completed:{mode}:{day}` keys the office viewer writes
// when the user Amens the closing collect. Each "side" (morning / evening)
// counts as done if EITHER the full Office or the Devotion was prayed
// that day. No server fetch needed.
function HabitSlide({
  onDone,
  visible,
  isEvening = false,
}: {
  onDone: () => void;
  visible: boolean;
  /** True when the office just finished was an evening one. Gates the
   *  "Ignatian Examen" pill — the Examen is an end-of-day practice. */
  isEvening?: boolean;
}) {
  // The Examen is pilot-only, so the pill only shows for pilot users
  // with pilot view on — same gate as the menu entry.
  const { isBeta } = useBetaStatus();
  // Server is the source of truth — past completions from any device
  // live in prayer_sessions, not localStorage. We still union with
  // localStorage for the freshly-finished office so the slide reflects
  // the tap that just landed even before the session row's invalidate
  // round-trip lands.
  const { data: historyData } = useQuery<{ days: Array<{ ymd: string; morning: boolean; evening: boolean }> }>({
    queryKey: ["/api/me/office-history-week"],
    queryFn: () => apiRequest("GET", "/api/me/office-history-week"),
    staleTime: 0,
  });

  const days = (() => {
    const out: { dateKey: string; label: string; isToday: boolean; morning: boolean; evening: boolean }[] = [];
    const now = new Date();
    const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    // Index server response by ymd for O(1) lookup.
    const serverByDay = new Map<string, { morning: boolean; evening: boolean }>();
    for (const d of historyData?.days ?? []) {
      serverByDay.set(d.ymd, { morning: !!d.morning, evening: !!d.evening });
    }
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const label = ["S", "M", "T", "W", "T", "F", "S"][d.getDay()];
      const server = serverByDay.get(dateKey) ?? { morning: false, evening: false };
      let morning = server.morning;
      let evening = server.evening;
      // localStorage union — only matters for today (the just-prayed
      // office writes the flag synchronously; the session row needs an
      // API round-trip to show up in the history query).
      if (dateKey === todayYmd) {
        try {
          morning = morning
            || !!localStorage.getItem(`phoebe:office-completed:morning:${dateKey}`)
            || !!localStorage.getItem(`phoebe:office-completed:morning-devotion:${dateKey}`);
          evening = evening
            || !!localStorage.getItem(`phoebe:office-completed:evening:${dateKey}`)
            || !!localStorage.getItem(`phoebe:office-completed:early-evening-devotion:${dateKey}`);
        } catch { /* localStorage blocked */ }
      }
      out.push({ dateKey, label, isToday: i === 0, morning, evening });
    }
    return out;
  })();

  const today = days[days.length - 1];
  const morningDone = today?.morning ?? false;
  const eveningDone = today?.evening ?? false;
  const daysWithEither = days.filter(d => d.morning || d.evening).length;

  // Celebration haptic burst when the user has prayed both offices
  // today. A single impact felt understated for a full-day milestone
  // per user direction — fire a spaced sequence of heavy taps capped
  // with a "success" notification so the device says "you did the
  // whole day." Fires once per HabitSlide mount when both are done;
  // not gated on a server flag because the slide itself only renders
  // on the closingOnly path right after a fresh office finish.
  const fullDayHapticFiredRef = useRef(false);
  useEffect(() => {
    if (!morningDone || !eveningDone) return;
    if (fullDayHapticFiredRef.current) return;
    fullDayHapticFiredRef.current = true;
    const fire = (style: string, delayMs: number) => {
      window.setTimeout(() => {
        try {
          window.dispatchEvent(
            new CustomEvent("phoebe:haptic", { detail: { style } }),
          );
        } catch { /* non-fatal */ }
      }, delayMs);
    };
    fire("heavy", 0);
    fire("heavy", 140);
    fire("heavy", 280);
    fire("heavy", 420);
    fire("success", 620);
  }, [morningDone, eveningDone]);

  // Encouragement copy keys off this morning's + evening's state. We
  // don't shame partial days — every line is forward-leaning.
  const encouragement = (() => {
    // Both-done state: no line — the row pills + grid say it. Adding
    // copy here read as overclaim per user direction.
    if (morningDone && eveningDone) return null;
    if (morningDone) return "Morning is held. Evening waits when you're ready.";
    if (eveningDone) return "Evening is held. Tomorrow begins again with morning.";
    return "One a day grows the rhythm — both deepens it.";
  })();

  const Row = ({ label, emoji, done }: { label: string; emoji: string; done: boolean }) => (
    <div
      // animate-turn-pulse-practices: same border-color keyframe the
      // home-screen "X prayer requests waiting" card uses. Borrowed
      // here so the rhythm rows feel celebratory when the office is
      // done — the inline borderColor is dropped in the done case so
      // the CSS keyframe (which sets border-color) can take effect
      // without the inline shorthand winning specificity.
      className={`flex items-center justify-between w-full px-4 py-3 rounded-xl ${done ? "animate-turn-pulse-practices" : ""}`}
      style={{
        background: done ? "rgba(46,107,64,0.20)" : "rgba(46,107,64,0.08)",
        borderWidth: 1,
        borderStyle: "solid",
        ...(done ? {} : { borderColor: "rgba(46,107,64,0.22)" }),
      }}
    >
      <div className="flex items-center gap-3">
        <span style={{ fontSize: 28 }}>{emoji}</span>
        <span
          className="font-semibold text-[19px]"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {label}
        </span>
      </div>
      {done ? (
        <span
          className="text-[12px] font-semibold px-2.5 py-0.5 rounded-full"
          style={{
            background: "rgba(111,175,133,0.25)",
            color: "#C8D4C0",
            border: "1px solid rgba(111,175,133,0.55)",
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        >
          Completed ✓
        </span>
      ) : (
        <span
          className="text-[12px] font-medium"
          style={{ color: "rgba(143,175,150,0.7)", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Not yet
        </span>
      )}
    </div>
  );

  return (
    <div
      className="w-full flex flex-col items-center text-center"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 0.4s ease",
        gap: 22,
        maxWidth: 380,
      }}
    >
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
          Today
        </p>
        <p
          className="text-[22px] font-semibold leading-tight mt-1"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Your prayer rhythm
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="w-full flex flex-col gap-2"
      >
        <Row label="Morning" emoji="🌅" done={morningDone} />
        <Row label="Evening" emoji="🌙" done={eveningDone} />
      </motion.div>

      {/* Past 7 days grid — two rows (morning, evening) × 7 columns.
          Filled dot = office completed that day. Today sits at the
          right edge. */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="w-full"
      >
        <p
          className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-3"
          style={{ color: "rgba(143,175,150,0.55)", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Past 7 days
        </p>
        <div
          className="grid w-full gap-2"
          style={{ gridTemplateColumns: "auto repeat(7, 1fr)" }}
        >
          <span />
          {days.map((d) => (
            <span
              key={`label-${d.dateKey}`}
              className="text-[10px] font-semibold text-center"
              style={{
                color: d.isToday ? "#C8D4C0" : "rgba(143,175,150,0.55)",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              {d.label}
            </span>
          ))}
          <span
            className="text-[10px] text-right pr-1"
            style={{ color: "rgba(143,175,150,0.65)", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            🌅
          </span>
          {days.map((d) => (
            <div key={`m-${d.dateKey}`} className="flex justify-center">
              <span
                className="block rounded-full"
                style={{
                  width: 14,
                  height: 14,
                  background: d.morning ? "#6FAF85" : "rgba(46,107,64,0.18)",
                  border: `1px solid ${d.morning ? "rgba(111,175,133,0.7)" : "rgba(46,107,64,0.3)"}`,
                }}
              />
            </div>
          ))}
          <span
            className="text-[10px] text-right pr-1"
            style={{ color: "rgba(143,175,150,0.65)", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            🌙
          </span>
          {days.map((d) => (
            <div key={`e-${d.dateKey}`} className="flex justify-center">
              <span
                className="block rounded-full"
                style={{
                  width: 14,
                  height: 14,
                  background: d.evening ? "#8B9DC3" : "rgba(46,107,64,0.18)",
                  border: `1px solid ${d.evening ? "rgba(139,157,195,0.7)" : "rgba(46,107,64,0.3)"}`,
                }}
              />
            </div>
          ))}
        </div>
        {daysWithEither > 0 && (
          <p
            className="text-[11px] mt-3"
            style={{ color: "rgba(143,175,150,0.75)", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {daysWithEither} {daysWithEither === 1 ? "day" : "days"} of prayer this week
          </p>
        )}
        {/* Reminders pill — sits directly below the "N days of prayer
            this week" tally so it reads as the natural next step from
            the rhythm count. Deep-links to /settings where the
            OfficeReminderSettings card lives. */}
        <div className="mt-3 flex justify-center">
          <Link href="/settings">
            <button
              type="button"
              className="text-[11px] font-semibold px-3 py-1 rounded-full transition-opacity hover:opacity-90"
              style={{
                background: "rgba(46,107,64,0.22)",
                color: "#A8C5A0",
                border: "1px solid rgba(46,107,64,0.4)",
                fontFamily: "'Space Grotesk', sans-serif",
                cursor: "pointer",
              }}
            >
              Reminders →
            </button>
          </Link>
        </div>
      </motion.div>

      {encouragement && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="text-[14px] leading-relaxed"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {encouragement}
        </motion.p>
      )}

      {/* Ignatian Examen pill — evening only (the Examen is an
          end-of-day prayer), and pilot-only (same gate as the menu
          entry). A gentle invitation to close the day reflectively
          after Evening Prayer / Devotion. */}
      {isEvening && isBeta && (
        <Link href="/examen">
          <button
            type="button"
            className="text-[12px] font-semibold px-4 py-2 rounded-full transition-opacity hover:opacity-90"
            style={{
              background: "rgba(46,107,64,0.22)",
              color: "#A8C5A0",
              border: "1px solid rgba(46,107,64,0.45)",
              fontFamily: "'Space Grotesk', sans-serif",
              cursor: "pointer",
            }}
          >
            🕯️ Ignatian Examen →
          </button>
        </Link>
      )}

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
  showSetReminder = false,
  reminderSide = "morning",
  doneLabel = "Done",
}: {
  celebration: { streak: number } | null;
  /** Still accepted for symmetry with the celebration animation, but no
   *  longer rendered as the resting headline. */
  streak: number;
  coPrayers: Array<{ id: number; name: string | null; avatarUrl: string | null }>;
  onDone: () => void;
  visible: boolean;
  /** True when the user just finished an office and hasn't enabled a
   *  daily reminder for that side. Surfaces a "Set reminder" CTA below
   *  Done so the habit can be turned on without leaving the slide. */
  showSetReminder?: boolean;
  /** Which office side the user likely just prayed (morning/evening).
   *  Drives the CTA copy and the deep-link target. */
  reminderSide?: "morning" | "evening";
  /** Label for the primary button. "Done" exits; "Continue" advances
   *  to the follow-on habit slide on the closingOnly path. */
  doneLabel?: string;
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
      {/* Headline: people-prayed-for count. The streak-celebration
          burst that used to overlay this on firstToday was retired
          per user direction — the closing slide is meant to
          highlight community ("you prayed alongside N people"), not
          a personal streak. The count below now ALWAYS renders;
          firstToday-only behavior moves to the streak-pill in the
          chrome (out of the closing slide's focal area). */}
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
          You prayed for
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
        {doneLabel}
      </button>

      {/* "Set reminder" CTA — fires when the user just finished an
          office and hasn't enabled the daily reminder for that side
          yet. Routes to /settings where the OfficeReminderSettings
          card lets them pick None / Office / Devotion + a time. */}
      {showSetReminder && (
        <Link href="/settings">
          <button
            type="button"
            className="text-[13px] font-medium underline transition-opacity hover:opacity-80"
            style={{
              color: "rgba(168,197,160,0.8)",
              textDecorationColor: "rgba(168,197,160,0.4)",
              textUnderlineOffset: 4,
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            Set a daily reminder for {reminderSide === "morning" ? "Morning" : "Evening"} Prayer →
          </button>
        </Link>
      )}
    </div>
  );
}

export default function PrayerModePage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Track time-spent for the community metrics' "Time praying" row.
  // Mounts a clock that pauses on background and commits a single
  // session row to /api/prayer-sessions when the page unmounts.
  // Bible-reading time launched from a slide (BibleGateway in
  // SFSafariViewController) is captured naturally — the page stays
  // mounted, visibilitychange handles the pause/resume. Anti-cheat
  // (5s floor + 60min cap) lives server-side.
  usePrayerSession(user ? "slideshow" : null);

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
  // closingOnly=1 → land directly on the celebration summary, skipping
  // the prayer rotation entirely. Used by the Office / Devotion
  // viewers when the seamless intercessions handoff is over and the
  // user has just finished the closing collect — the celebration
  // belongs at the end of the full liturgy, not mid-flow.
  const closingOnly = (() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("closingOnly") === "1";
  })();
  // ?side=evening → the office just finished was an evening one. The
  // habit slide uses this to surface an evening-only "Pray the Examen"
  // pill. Falls back to the local hour when the param is absent (older
  // build, or a non-office closingOnly path).
  const closingIsEvening = (() => {
    if (typeof window === "undefined") return false;
    const side = new URLSearchParams(window.location.search).get("side");
    if (side === "evening") return true;
    if (side === "morning") return false;
    return new Date().getHours() >= 12;
  })();
  // ?reset=1 → start fresh at slide 0, ignoring localStorage progress
  // AND the alreadyPrayedToday skip. Set when the user taps "Pray
  // again" on the dashboard card (after they've already completed
  // today's pass) — they explicitly want a do-over, not a resume.
  // Without this flag a re-tap landed on the first un-prayed slide,
  // which on a fully-completed list happened to be the LAST slide,
  // and on a partially-completed list jumped past the slides they'd
  // already amened. Both read as bugs.
  const resetFlow = (() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("reset") === "1";
  })();
  // ?queue=new → focused mode for the home-screen "X prayer requests
  // waiting" card. Skips the daily slideshow framing (no intercessions,
  // no circle intentions, no own prayers-for, no ask-request nudge)
  // and shows ONLY prayer requests this viewer has never amen'd. The
  // card promised "tap to respond" — we honour that literally instead
  // of dropping them into the full daily walk.
  // queue=parish-weekly → beta experiment. Scoped exclusively to the
  // unprayed slice of /api/me/parish-weekly: people in the viewer's
  // parish groups with an active prayer request whom the viewer
  // hasn't amen'd yet this week (Sunday → Saturday in their tz).
  // One slide per person, ordered oldest-request-first. No
  // intercessions, no circle intentions, no own prayers-for, no
  // ask-request nudge — same focused shape as queue=new, but the
  // unit is the person, not the request.
  const queueMode = (() => {
    if (typeof window === "undefined") return null;
    const v = new URLSearchParams(window.location.search).get("queue");
    if (v === "new") return "new";
    if (v === "parish-weekly") return "parish-weekly";
    return null;
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

  // Parish-weekly data — beta experiment. Only fetched when the
  // slideshow was opened via queue=parish-weekly so non-beta users
  // never pay the round trip. Returns a unified list across three
  // sources (prayer requests, community intercessions, feed entries);
  // we map each entry to the appropriate slide kind below.
  type ParishWeeklyEntry =
    | {
        kind: "request";
        id: string;
        title: string;
        subtitle: string | null;
        avatarUrl: string | null;
        emoji: string | null;
        prayedAt: string | null;
        userId: number;
        request: {
          id: number;
          body: string;
          isAnonymous: boolean;
          kind: string | null;
          expiresAt: string | null;
          createdAt: string;
        };
      }
    | {
        kind: "intercession";
        id: string;
        title: string;
        subtitle: string | null;
        avatarUrl: string | null;
        emoji: string | null;
        prayedAt: string | null;
        intercession: {
          momentId: number;
          momentToken: string | null;
          intercessionTopic: string | null;
          intercessionFullText: string | null;
          intention: string | null;
          groupName: string | null;
          groupSlug: string | null;
          groupEmoji: string | null;
        };
      }
    | {
        kind: "feed-entry";
        id: string;
        title: string;
        subtitle: string | null;
        avatarUrl: string | null;
        emoji: string | null;
        prayedAt: string | null;
        feedEntry: {
          entryId: number;
          feedId: number;
          feedSlug: string;
          feedTitle: string;
          feedCoverEmoji: string | null;
          slot: number;
          body: string;
          learnMoreUrl: string | null;
          isRecurring: boolean;
        };
      };
  const parishWeeklyQuery = useQuery<{
    weekStartYmd: string;
    weekEndYmd: string;
    unprayed: ParishWeeklyEntry[];
    prayed: ParishWeeklyEntry[];
  }>({
    queryKey: ["/api/me/parish-weekly"],
    queryFn: () => apiRequest("GET", "/api/me/parish-weekly"),
    enabled: !!user && queueMode === "parish-weekly",
    staleTime: 60_000,
  });
  const parishWeeklyData = parishWeeklyQuery.data;

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

  // Today's intercessions across every prayer feed the user subscribes
  // to. Lives in prayerFeedEntriesTable + prayerFeedRecurringEntriesTable
  // — a separate system from /api/moments (sharedMomentsTable), which
  // is why feed-authored intercessions weren't surfacing in the
  // slideshow before. The /today endpoint merges concrete + recurring
  // entries (concrete wins on slot collisions) and returns one row per
  // (feed, slot) for the user's current day.
  const feedTodayQuery = useQuery<{
    entries: Array<{
      id: number;
      feedId: number;
      feedSlug: string;
      feedTitle: string;
      feedCoverEmoji: string | null;
      slot: number;
      title: string;
      body: string;
      learnMoreUrl: string | null;
      isRecurring: boolean;
      prayedToday: boolean;
      groups: Array<{ id: number; name: string; slug: string; emoji: string | null }>;
      prayedBy: Array<{ name: string; avatarUrl: string | null }>;
      prayedTodayCount: number;
    }>;
  }>({
    queryKey: ["/api/prayer-feeds/today"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds/today"),
    enabled: !!user,
  });
  const feedTodayEntries = feedTodayQuery.data?.entries ?? [];

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
  // The reciprocity rule that used to gate the request section is
  // gone — anyone in a community sees their group's prayer requests
  // regardless of whether they've shared one of their own. We still
  // compute hasActiveOwnRequest because the trailing "ask-request"
  // slide (a soft nudge to share something) only fires for viewers
  // without an active ask, and that part of the UX is intentional.
  const hasActiveOwnRequest = prayerRequests.some(
    (r) => r.isOwnRequest === true && !r.isAnswered && !r.closedAt,
  );

  // queueMode === "new" builds a tightly-scoped slide list: only
  // prayer requests the viewer hasn't amen'd before. Everything else
  // (intercessions, circle intentions, prayers-for, ask-request) is
  // omitted — the home-screen card sent the user here to clear a
  // specific queue, not to walk the whole daily list.
  //
  // queueMode === "parish-weekly" (beta) is similarly focused, but
  // keyed by PERSON not request: one slide per parish member who
  // has an active request the viewer hasn't amen'd this week. Same
  // request-slide shape under the hood, just sourced from a
  // weekly-scoped backend query instead of the all-time request feed.
  // Parish-weekly slide construction: look up full Moment / Request /
  // FeedEntry data by ID so each slide carries the same rich fields
  // (groups[], communityFaces[], weekPrayCount, feedTag, learnMoreUrl)
  // the default-mode deck uses. Without this lookup the slide reads as
  // a stripped-down "just the text" card; with it, parish-weekly looks
  // identical to the main slideshow's intercession slide.
  const momentsById = new Map((momentsData?.moments ?? []).map(m => [m.id, m]));
  const requestsById = new Map(prayerRequests.map(r => [r.id, r]));
  const feedEntryById = new Map(feedTodayEntries.map(e => [e.id, e]));

  const slides: PrayerSlide[] = queueMode === "parish-weekly"
    ? (parishWeeklyData?.unprayed ?? []).flatMap((e): PrayerSlide[] => {
        if (e.kind === "request") {
          const r = requestsById.get(e.request.id);
          // Build from the live PrayerRequest if cached; otherwise
          // synthesise from the parish-weekly entry alone.
          return [{
            kind: "request",
            text: r?.body ?? e.request.body,
            attribution: "",
            requestId: e.request.id,
            myWord: r?.myWord ?? null,
            authorName: r?.ownerName ?? e.title,
            authorAvatarUrl: r?.ownerAvatarUrl ?? e.avatarUrl,
            requestKind: (r?.kind ?? e.request.kind) ?? null,
            alreadyPrayedToday: r?.myAmenedToday === true,
          }];
        }
        if (e.kind === "intercession") {
          const m = momentsById.get(e.intercession.momentId);
          if (!m) return [];
          // Mirror the default-mode intercession-slide build exactly.
          const title = m.intercessionTopic || m.name;
          const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
          const intentionSub =
            m.intention && norm(m.intention) !== norm(title) ? m.intention : null;
          const attributionLabel = m.group?.name
            ? m.group.name
            : m.members
                .filter((p) => p.email !== user?.email)
                .map((p) => p.name || p.email.split("@")[0])
                .slice(0, 3)
                .join(", ");
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
          const feedTag = m.prayerFeedId ? "Climate Justice" : null;
          const finalAttribution = m.prayerFeedId && !attributionLabel
            ? "Your community is holding this."
            : attributionLabel
              ? `with ${attributionLabel}`
              : "";
          const _allGroups = [
            ...(m.group ? [m.group] : []),
            ...((m as { additionalGroups?: Array<{ id: number; name: string; slug: string; emoji: string | null }> }).additionalGroups ?? []),
          ];
          const _seenGroupIds = new Set<number>();
          const groups = _allGroups.filter((g) => {
            if (_seenGroupIds.has(g.id)) return false;
            _seenGroupIds.add(g.id);
            return true;
          });
          return [{
            kind: "intercession",
            text: title,
            intention: intentionSub,
            fullText: m.intercessionFullText?.trim() || null,
            source: m.intercessionSource ?? null,
            attribution: finalAttribution,
            weekPrayCount: (m as { weekPostCount?: number }).weekPostCount ?? 0,
            momentToken: m.momentToken,
            myUserToken: m.myUserToken,
            communityFaces,
            feedTag,
            learnMoreUrl: (m as { learnMoreUrl?: string | null }).learnMoreUrl?.trim() || null,
            groups,
          }];
        }
        // feed-entry
        const fe = feedEntryById.get(e.feedEntry.entryId);
        if (fe) {
          // Use the live feedTodayEntries row when available — same
          // shape as the default-mode feed slide.
          return [{
            kind: "intercession",
            text: fe.title,
            intention: null,
            fullText: fe.body?.trim() || null,
            attribution: fe.feedTitle ? `from ${fe.feedTitle}` : "",
            feedTag: fe.feedTitle || null,
            learnMoreUrl: fe.learnMoreUrl?.trim() || null,
            feedSlug: fe.feedSlug,
            feedEntryDate: new Date().toISOString().slice(0, 10),
            feedEntrySlot: fe.slot,
          }];
        }
        // Fallback when the feed-today endpoint hasn't surfaced this
        // entry — build from the parish-weekly entry directly.
        return [{
          kind: "intercession",
          text: e.title,
          intention: null,
          fullText: e.feedEntry.body?.trim() || null,
          attribution: `from ${e.feedEntry.feedTitle}`,
          feedTag: e.feedEntry.feedTitle,
          learnMoreUrl: e.feedEntry.learnMoreUrl?.trim() || null,
          feedSlug: e.feedEntry.feedSlug,
          feedEntryDate: new Date().toISOString().slice(0, 10),
          feedEntrySlot: e.feedEntry.slot,
        }];
      })
    : queueMode === "new"
    ? [
        // The home-screen "N prayer requests waiting" card counts BOTH
        // un-amened requests AND community intercessions the viewer
        // hasn't logged today. queue=new used to only render the
        // requests; tapping Respond on a card that was actually mostly
        // intercessions produced an empty slideshow. Now we surface
        // both kinds here so the count + the tap target agree.
        ...prayerRequests
          .filter((r) => {
            if (r.isAnswered) return false;
            if (r.closedAt) return false;
            // Skip the viewer's own requests — there's nothing to pray
            // for yourself in the slideshow, and surfacing them was
            // creating a "why am I being asked to pray for me" loop.
            if (r.isOwnRequest === true) return false;
            if (r.myAmenedEver === true) return false;
            if (r.expiresAt && new Date(r.expiresAt) <= new Date()) return false;
            return true;
          })
          .map((r): PrayerSlide => ({
            kind: "request",
            text: r.body,
            attribution: "",
            requestId: r.id,
            myWord: r.myWord ?? null,
            authorName: r.ownerName ?? null,
            authorAvatarUrl: r.ownerAvatarUrl ?? null,
            requestKind: r.kind ?? null,
            // Always false in queue-new — these are by definition un-prayed.
            alreadyPrayedToday: false,
          })),
        // Un-logged community intercessions — same shape the default
        // branch builds below. Inline rebuild so we don't have to
        // restructure the entire slide-list assembly into a function.
        ...intercessions
          .filter((m) => !m.myLoggedToday)
          .map((m): PrayerSlide => {
            const title = m.intercessionTopic || m.name;
            const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
            const intentionSub =
              m.intention && norm(m.intention) !== norm(title) ? m.intention : null;
            const attributionLabel = m.group?.name
              ? m.group.name
              : m.members
                  .filter((p) => p.email !== user?.email)
                  .map((p) => p.name || p.email.split("@")[0])
                  .slice(0, 3)
                  .join(", ");
            const hasPrayedFlag = m.members.some((p) => typeof p.prayedThisWeek === "boolean");
            const otherMembers = m.members.filter((p) => {
              if (p.email === user?.email) return false;
              if (!hasPrayedFlag) return true;
              return p.prayedThisWeek === true;
            });
            const MAX_FACES = 7;
            let communityFaces: Array<{ name: string; email: string; avatarUrl: string | null }> = [];
            if (otherMembers.length > 0) {
              if (otherMembers.length <= MAX_FACES) {
                communityFaces = otherMembers.map((p) => ({
                  name: p.name || p.email.split("@")[0],
                  email: p.email,
                  avatarUrl: p.avatarUrl ?? null,
                }));
              } else {
                const withAvatar = otherMembers.filter((p) => !!p.avatarUrl);
                const withoutAvatar = otherMembers.filter((p) => !p.avatarUrl);
                const picked = [
                  ...withAvatar.slice(0, MAX_FACES),
                  ...withoutAvatar.slice(0, Math.max(0, MAX_FACES - withAvatar.length)),
                ];
                communityFaces = picked.map((p) => ({
                  name: p.name || p.email.split("@")[0],
                  email: p.email,
                  avatarUrl: p.avatarUrl ?? null,
                }));
              }
            }
            const feedTag = m.prayerFeedId ? "Climate Justice" : null;
            const finalAttribution = m.prayerFeedId && !attributionLabel
              ? "Your community is holding this."
              : attributionLabel
                ? `with ${attributionLabel}`
                : "";
            const allGroupsRaw = [
              ...(m.group ? [m.group] : []),
              ...(m.additionalGroups ?? []),
            ];
            const seenGroupIds = new Set<number>();
            const groups = allGroupsRaw.filter((g) => {
              if (seenGroupIds.has(g.id)) return false;
              seenGroupIds.add(g.id);
              return true;
            });
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
              groups,
              alreadyPrayedToday: false,
            };
          }),
      ]
    : [
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
      // Build the combined groups list (primary + additionals). De-dupe
      // by id in case the primary appears again in additionalGroups
      // (defensive — the server shouldn't send duplicates, but a stale
      // join could slip through). Empty list when the intercession has
      // no group at all (feed-scoped) — the slide hides the pill row
      // in that case.
      const _allGroups = [
        ...(m.group ? [m.group] : []),
        ...(m.additionalGroups ?? []),
      ];
      const _seenGroupIds = new Set<number>();
      const groups = _allGroups.filter((g) => {
        if (_seenGroupIds.has(g.id)) return false;
        _seenGroupIds.add(g.id);
        return true;
      });
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
        groups,
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
    // Prayer feed intercessions for today — one slide per (feed, slot)
    // for every feed the user subscribes to. These come from the
    // `prayer_feed_entries` (concrete) + `prayer_feed_recurring_entries`
    // (templates) tables, merged by the /api/prayer-feeds/today endpoint.
    // Without this branch, anything authored on a feed's calendar editor
    // (e.g. "The Dams in Michigan" on Phoebe Climate) was silently
    // dropped from the slideshow because /api/moments only sees
    // sharedMomentsTable rows.
    ...feedTodayEntries.map((e): PrayerSlide => ({
      kind: "intercession" as const,
      text: e.title,
      intention: null,
      fullText: e.body?.trim() || null,
      // Drop the "from {feedTitle}" attribution + the single feed-
      // tag pill; the community pills below carry the same provenance
      // (these feeds are linked to communities via prayer_feed_groups)
      // and read with more identity than a generic feed name.
      attribution: "",
      feedTag: null,
      // Community pills + face stack on feed-authored intercessions.
      // Server attaches every group linked to this feed via
      // prayer_feed_groups so a single "Phoebe Climate" feed renders
      // as the actual communities carrying it (e.g. NYC Leaders ·
      // Heavenly Rest · …). communityFaces / weekPrayCount are
      // populated from prayer_feed_prayers rows for THIS entry today.
      // The server doesn't return email on this payload, so we
      // synthesize a unique key per face (feed entry + index) to
      // avoid React key collisions when two prayers share a first
      // name.
      groups: e.groups,
      communityFaces: e.prayedBy.map((p, i) => ({
        name: p.name,
        email: `feed-${e.id}-${i}`,
        avatarUrl: p.avatarUrl,
      })),
      weekPrayCount: e.prayedTodayCount,
      learnMoreUrl: e.learnMoreUrl?.trim() || null,
      // Carry the feed origin so the Amen handler can POST to
      // /api/prayer-feeds/:slug/entries/:date/pray on tap. We
      // synthesize today's date here (UTC) instead of trusting
      // the server's per-feed timezone — the pray endpoint
      // re-checks tz on its end and 400s if mismatched, so this
      // is a soft hint, not a contract.
      feedSlug: e.feedSlug,
      feedEntryDate: new Date().toISOString().slice(0, 10),
      feedEntrySlot: e.slot,
      // Always false for feed-authored intercessions (e.g. Phoebe
      // Climate). The resume-position logic uses this flag to jump
      // past already-prayed slides on entry — but for the climate /
      // feed intercessions the user wants to keep seeing them every
      // time they enter the slideshow, even if they tapped Amen
      // earlier today. "Not today" gives them the per-slide skip
      // hatch if they don't want to pray it a second time.
      alreadyPrayedToday: false,
    })),
    // Other people's prayer requests come before the user's own private
    // prayers-for — hearing others first, then turning inward. We
    // deliberately exclude the viewer's own default-kind requests;
    // they don't need to be shown their own ask as a slide to pray for.
    // The reciprocity gate that used to skip this whole section for
    // viewers without their own active ask is gone — anyone sees the
    // group's requests.
    ...prayerRequests
      .filter((r) => {
        if (r.isAnswered) return false;
        // Skip the viewer's own requests — you don't need to be
        // asked to pray for yourself in the daily slideshow.
        // Comments / words of comfort from others are still visible
        // on the request's own detail page; this just keeps the
        // slideshow about holding others.
        if (r.isOwnRequest === true) return false;
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
  const swipeTouchStartXRef = useRef<number | null>(null);
  const swipeTouchStartYRef = useRef<number | null>(null);

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
    // Two flows force a fresh-from-zero start, both intentionally:
    //   • seamlessFlow — coming from the Daily Office / Devotion
    //     intercession portal; the user is mid-liturgy and expects
    //     every appointed intercession from the top.
    //   • resetFlow — the dashboard's "Pray again" CTA passes
    //     ?reset=1, signaling "start over even though I've prayed
    //     today." Without this branch the resume-from-last-amen
    //     skip jumped past slides the user had already prayed,
    //     landing them on the LAST slide of a 9-slide list.
    // queueMode === "new" is its own fresh-start path — the home card
    // sent the user in to handle a specific queue, so resume-progress
    // and alreadyPrayedToday-skip don't apply (all queue slides are
    // un-prayed by construction; no localStorage to honor).
    if (!seamlessFlow && !resetFlow && queueMode !== "new" && queueMode !== "parish-weekly") {
      try {
        const raw = localStorage.getItem(progressStorageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as { completed?: number };
          // Only honor the localStorage cursor if the slide it lands
          // on is still un-prayed. If it points at a slide already
          // prayed (e.g. another device cleared the list between
          // sessions, or the user refreshed on the last slide right
          // after tapping Amen), fall through to the first-un-prayed
          // search below. Prevents a re-amen / double-record at the
          // tail of the deck.
          if (typeof parsed.completed === "number" &&
              parsed.completed > 0 &&
              parsed.completed < captured.length &&
              !captured[parsed.completed]?.alreadyPrayedToday) {
            resumeAt = parsed.completed;
          }
        }
      } catch { /* ignore corrupt entry */ }
      if (resumeAt === 0) {
        const firstUnPrayed = captured.findIndex((s) => !s.alreadyPrayedToday);
        if (firstUnPrayed >= 0) {
          resumeAt = firstUnPrayed;
        } else if (captured.length > 0) {
          // Every slide is already prayed today — skip the slideshow
          // entirely and jump to the closing summary. Otherwise the
          // user would land on slide 0 (which they already prayed)
          // and tapping Amen would double-record.
          setPhase("closing");
        }
      }
    }
    // resetFlow also wipes the localStorage progress entry — once the
    // user opts into a do-over, the half-finished progress shouldn't
    // hang around to bite them on the NEXT visit either.
    if (resetFlow) {
      try { localStorage.removeItem(progressStorageKey); } catch { /* non-fatal */ }
    }
    setIndex(resumeAt);
  }, [dataReady, index, progressStorageKey, slides, seamlessFlow, resetFlow, queueMode]);

  // All consumers below should read from this — `slides` is the live
  // (re-rendering) array, `displaySlides` is the stable session copy.
  const displaySlides = frozenSlides ?? slides;
  // Defensive clamp: if displaySlides shrinks under the user mid-
  // session (a request expires, the parish-weekly queue rebuilds,
  // etc.), `index` can point past the end. The advance() path's
  // length-1 guard prevents a crash but leaves the user silently
  // parked on a non-existent slide. Pull them back to the last real
  // slide so the next render shows something coherent.
  useEffect(() => {
    if (displaySlides.length > 0 && index >= displaySlides.length) {
      setIndex(displaySlides.length - 1);
    }
  }, [displaySlides.length, index]);
  // Office-reminder prefs query — used by the closing slide to surface
  // a "Set reminder" CTA when the user just finished an office and
  // hasn't enabled a daily reminder for that side yet. Only fetched in
  // the closingOnly path so we don't pay for it on the prayer-list
  // slideshow flow that doesn't render the CTA.
  const officePrefsQuery = useQuery<{ morning: string; evening: string }>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs"),
    enabled: !!user && closingOnly,
    staleTime: 60_000,
  });
  // Which office did the user likely just finish? closingOnly is set
  // by both the Daily Office and the Daily Devotion redirect paths,
  // and neither carries a side hint, so we infer from local hour.
  // Before noon → morning, otherwise evening. Good enough — the
  // settings link points to the same screen either way.
  const reminderSide: "morning" | "evening" = new Date().getHours() < 12 ? "morning" : "evening";
  const sidePref = reminderSide === "morning"
    ? officePrefsQuery.data?.morning
    : officePrefsQuery.data?.evening;
  const showSetReminder = closingOnly && sidePref === "none";
  const [phase, setPhase] = useState<"prayer" | "closing" | "habit">(() => closingOnly ? "closing" : "prayer");
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
    if (closingOnly) {
      setPhase("closing");
      return;
    }
    if (displaySlides.length === 0 && momentsData && prayerRequests && myPrayersFor) {
      if (seamlessFlow) {
        setLocation(finishHref);
      } else {
        setPhase("closing");
      }
    }
  }, [displaySlides.length, momentsData, prayerRequests, myPrayersFor, seamlessFlow, closingOnly, finishHref, setLocation]);

  // When the user lands on the closing slide, log the prayer-list streak.
  // The server is idempotent per TZ-local day — calling twice doesn't
  // double-count. If this is the first completion today, we pop the
  // Duolingo-style celebration with the new streak count.
  //
  // Also fire the audio + haptic moment that marks the conclusion: a
  // resolving swell at the base octave (matches the opening) plus a
  // single heavy haptic — one solid "you arrived" thump rather than
  // a 7-second oscillating rumble. Independent of `firstToday` —
  // every arrival on the closing slide should feel like crossing a
  // threshold, even if it's the user's second prayer today and no
  // streak card pops.
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
      window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "heavy" } }));
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

  // Navigate back one slide without recording an amen. Mirrors the
  // fade transition used by skipToNext / advance.
  const goBack = () => {
    if (phase === "closing") {
      // Let the user step back from the closing slide to their last prayer.
      setSlideVisible(false);
      setTimeout(() => {
        setPhase("prayer");
        setSlideVisible(true);
      }, 220);
      return;
    }
    if (index <= 0) return;
    setSlideVisible(false);
    setTimeout(() => {
      setIndex(index - 1);
      setSlideVisible(true);
    }, 220);
  };

  // Swipe left → advance (skip forward), swipe right → goBack.
  // The amen hold button is the intentional "I prayed this" action;
  // swiping forward is a navigation gesture (same as "Not today").
  // We only fire when horizontal movement dominates vertical so
  // we don't interfere with any scroll areas inside a slide.
  const handleSwipeTouchStart = (e: React.TouchEvent) => {
    swipeTouchStartXRef.current = e.touches[0].clientX;
    swipeTouchStartYRef.current = e.touches[0].clientY;
  };
  const handleSwipeTouchEnd = (e: React.TouchEvent) => {
    if (swipeTouchStartXRef.current === null || swipeTouchStartYRef.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeTouchStartXRef.current;
    const dy = e.changedTouches[0].clientY - swipeTouchStartYRef.current;
    swipeTouchStartXRef.current = null;
    swipeTouchStartYRef.current = null;
    if (Math.abs(dy) > Math.abs(dx)) return; // primarily vertical — ignore
    if (Math.abs(dx) < 50) return;            // too short — ignore
    if (dx < 0) skipToNext();                 // swipe left = forward (skip)
    else goBack();                            // swipe right = back
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
      // Clear the "someone is asking for your prayers" push for this
      // specific request — the amen is the user's response, so the
      // notification has done its job and shouldn't sit on the lock screen.
      try {
        window.dispatchEvent(
          new CustomEvent("phoebe:clear-notifications", { detail: { threadId: `prayer-request-${rid}` } })
        );
      } catch { /* non-fatal */ }
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
    if (current && current.kind === "intercession" && current.momentToken) {
      const mt = current.momentToken;
      if (!loggedIntercessionsRef.current.has(mt)) {
        loggedIntercessionsRef.current.add(mt);
        // Prefer the auto-enrolling /amen endpoint — it works even
        // when myUserToken is null (the reconcile job hasn't yet
        // wired this user into the intercession). Falls back to the
        // legacy token-in-URL post endpoint when we DO have a token,
        // both for back-compat with older server builds and so the
        // existing posts/check-ins shape stays the system of record
        // while the new endpoint rolls out.
        const promise = current.myUserToken
          ? apiRequest("POST", `/api/moment/${mt}/${current.myUserToken}/post`, { isCheckin: true })
          : apiRequest("POST", `/api/moment/${mt}/amen`, {});
        promise
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
    // Feed-entry intercession (came from prayerFeedEntriesTable, not
    // sharedMomentsTable — no momentToken). Log to the feed's pray
    // endpoint so the prayer count + roster on the feed detail page
    // and the community detail card both reflect this slideshow tap.
    if (
      current
      && current.kind === "intercession"
      && current.feedSlug
      && current.feedEntryDate
      && typeof current.feedEntrySlot === "number"
    ) {
      const key = `feed:${current.feedSlug}:${current.feedEntryDate}:${current.feedEntrySlot}`;
      if (!loggedIntercessionsRef.current.has(key)) {
        loggedIntercessionsRef.current.add(key);
        apiRequest(
          "POST",
          `/api/prayer-feeds/${current.feedSlug}/entries/${current.feedEntryDate}/pray?slot=${current.feedEntrySlot}`,
          {},
        )
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ["/api/prayer-feeds/today"] });
            queryClient.invalidateQueries({ queryKey: ["/api/prayer-feeds/subscribed"] });
          })
          .catch(() => {
            /* swallow — best-effort */
          });
      }
    }
    // Circle-intention amens have no dedicated per-intention server
    // endpoint (there's no concept of "I prayed this circle intention
    // today" in the schema). Until that lands, at least stamp the
    // user's streak so the slide tap counts toward "I prayed today"
    // — without this, walking a slideshow that's all circle
    // intentions left the user's prayer_streak_last_date untouched
    // and the home-card avatar stack / streak metric never
    // registered the session.
    if (current && current.kind === "circle-intention") {
      const key = `circle:${current.text}:${current.groupSlug ?? "_"}`;
      if (!loggedIntercessionsRef.current.has(key)) {
        loggedIntercessionsRef.current.add(key);
        apiRequest("POST", "/api/prayer-streak/log").catch(() => {
          /* swallow — best-effort */
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
    // Slides without a myUserToken go through the auto-enrolling /amen
    // endpoint so reconcile races never drop a tap silently.
    const toLog = displaySlides.filter(
      (s): s is PrayerSlide & { momentToken: string } =>
        s.kind === "intercession" &&
        !!s.momentToken &&
        !loggedIntercessionsRef.current.has(s.momentToken),
    );
    // Feed-entry intercessions (Phoebe Climate etc.) — same retry path
    // but keyed by feed:slug:date:slot since they have no momentToken.
    // Without this leg, a fire-and-forget POST that fails mid-swipe
    // (network blip) had no second chance to land: the per-slide POST
    // in advance() catches the error, and the local Set never gets
    // re-asked. The closing-slide retry below catches that case.
    const feedToLog = displaySlides.filter((s): s is PrayerSlide & {
      feedSlug: string;
      feedEntryDate: string;
      feedEntrySlot: number;
    } => {
      if (s.kind !== "intercession") return false;
      if (!s.feedSlug || !s.feedEntryDate || typeof s.feedEntrySlot !== "number") return false;
      const key = `feed:${s.feedSlug}:${s.feedEntryDate}:${s.feedEntrySlot}`;
      return !loggedIntercessionsRef.current.has(key);
    });
    await Promise.allSettled([
      ...toLog.map((s) =>
        s.myUserToken
          ? apiRequest("POST", `/api/moment/${s.momentToken}/${s.myUserToken}/post`, {
              isCheckin: true,
            })
          : apiRequest("POST", `/api/moment/${s.momentToken}/amen`, {}),
      ),
      ...feedToLog.map((s) =>
        apiRequest(
          "POST",
          `/api/prayer-feeds/${s.feedSlug}/entries/${s.feedEntryDate}/pray?slot=${s.feedEntrySlot}`,
          {},
        ),
      ),
    ]);
    queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
    if (feedToLog.length > 0) {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-feeds/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-feeds/subscribed"] });
    }

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

    // Mark "intercession slideshow completed today" in localStorage so
    // the home-screen CTA can flip from "Start this morning's prayer"
    // to "Pray again" once the user has walked the list. Scoped per
    // local calendar day so it resets at midnight. Mirrors the
    // office-completed flag that bcp-daily-office writes when a user
    // finishes the closing collect; the dashboard reads both and
    // shows "Pray again" if either is set.
    try {
      localStorage.setItem(`phoebe:slideshow-completed:${slideshowTodayKey}`, "1");
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
      onTouchStart={handleSwipeTouchStart}
      onTouchEnd={handleSwipeTouchEnd}
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
            // On the closingOnly path (user came from finishing an
            // office), the closing slide's primary button advances to
            // the habit-rhythm slide instead of exiting. On the
            // standalone slideshow path it still exits.
            onDone={closingOnly ? () => setPhase("habit") : handleDone}
            visible={slideVisible}
            showSetReminder={showSetReminder}
            reminderSide={reminderSide}
            doneLabel={closingOnly ? "Continue" : "Done"}
          />
        )}
        {phase === "habit" && (
          <HabitSlide onDone={handleDone} visible={slideVisible} isEvening={closingIsEvening} />
        )}
      </div>

      {/* "Not today" skip link, below the Amen pulse. Lets the viewer
          pass on a particular slide without closing the slideshow —
          a small relief valve so they can keep going. Surfaces on
          request, intercession, and circle-intention slides; the
          ask/closing/etc. slides have their own primary action and
          don't need a separate skip. The count semantics are derived
          from amen rows directly so a skip doesn't poison the dashboard
          rollups.
          Per user direction this was expanded from request-only to
          also include intercession slides — particularly important
          for the climate / community intercessions, which keep
          surfacing even after the user has prayed them earlier today
          (see alreadyPrayedToday: false above) so the user needs a
          per-slide way to opt out of seeing one again. */}
      {phase === "prayer" &&
        (displaySlides[index]?.kind === "request"
          || displaySlides[index]?.kind === "intercession"
          || displaySlides[index]?.kind === "circle-intention") && (
        <div
          className="absolute left-0 right-0 flex justify-center pointer-events-none"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 130px)" }}
        >
          <button
            type="button"
            onClick={skipToNext}
            className="pointer-events-auto text-[12px] font-medium underline transition-opacity hover:opacity-80"
            style={{
              color: "rgba(143,175,150,0.6)",
              textDecorationColor: "rgba(143,175,150,0.3)",
              textUnderlineOffset: 4,
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            Not today
          </button>
        </div>
      )}

      {/* Progress — lifted well above the home-indicator gutter so
          the counter reads as a deliberate footer mark for the slide,
          not something hugging the bottom edge of the screen. The
          earlier `safe + 16` sat too close to the home indicator
          for the user to scan comfortably. */}
      {phase === "prayer" && displaySlides.length > 0 && (
        <div
          className="absolute left-0 right-0 flex justify-center pointer-events-none"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)" }}
        >
          <p className="text-xs" style={{ color: "rgba(143,175,150,0.32)", letterSpacing: "0.06em" }}>
            {index + 1} of {displaySlides.length}
          </p>
        </div>
      )}
    </div>
  );
}
