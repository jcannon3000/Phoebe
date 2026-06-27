import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { usePeople } from "@/hooks/usePeople";
import { apiRequest } from "@/lib/queryClient";
import { amenWithLocation } from "@/lib/prayLocation";
import { findBcpPrayer, localizeBcpPrayer } from "@/lib/bcp-prayers";
import { triggerAmenFeedback, playOpeningSwell, triggerSubmitFeedback, primeAudio } from "@/lib/amenFeedback";
import { openExternal } from "@/lib/openExternal";
import { isNativeShell } from "@/lib/isNativeShell";
import FddJournalSheet from "@/components/FddJournalSheet";
import { CobreatheGlobe } from "@/components/CobreatheGlobe";
import {
  CAC_TODAY_URL,
  FDD_TODAY_URL,
  SSJE_TODAY_URL,
  markCacRead,
  markFddRead,
  markSsjeRead,
  hasReadCacToday,
  hasReadFddToday,
  hasReadSsjeToday,
  CAC_READ_EVENT,
  FDD_READ_EVENT,
  SSJE_READ_EVENT,
} from "@/lib/cacReadState";
import { useEffectiveReflectionSource, type ReflectionSource } from "@/lib/officePrefs";
import type { MyActivePrayerFor, PrayerForMe } from "@/components/pray-for-them";
import { useUnseenNews } from "@/components/NewsClosingSlide";
import { OfficeCloseEvents } from "@/components/OfficeCloseEvents";
import { PrayerKindPill } from "@/components/prayer-kind-pill";
import { RequestWordField } from "@/components/RequestWordField";
import { ExternalLinkPill } from "@/components/ExternalLinkPill";
import { ContemplationTimer } from "@/components/ContemplationTimer";
import { CobreatheOverlay } from "@/components/CobreatheOverlay";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { GratitudeNudge } from "@/components/GratitudeComposer";
import { TodaysRhythm } from "@/components/TodaysRhythm";
import { usePrayerSession } from "@/hooks/usePrayerSession";
import { useRhythmState } from "@/hooks/useRhythmState";

// Drive the NATIVE iOS status-bar color (Capacitor StatusBar plugin) so the
// strip above the WebView matches the slide background. The app sets it once
// to the app green (#091A10) at launch; prayer-mode's slides — especially the
// warmer closing slide (#11291C) — differ, leaving a visible mismatched band
// at the top. Best-effort + native-only (no-ops on web / when the plugin is
// absent); the web/PWA equivalent is the theme-color meta handled alongside.
const APP_STATUS_BAR = "#091A10";
function setNativeStatusBarColor(color: string): void {
  try {
    const sb = (window as unknown as {
      Capacitor?: { Plugins?: { StatusBar?: { setBackgroundColor?: (o: { color: string }) => void } } };
    }).Capacitor?.Plugins?.StatusBar;
    sb?.setBackgroundColor?.({ color });
  } catch { /* web / plugin absent */ }
}

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
  // Creation time — orders a feed's intercession deck newest-first.
  createdAt?: string | null;
  // Whether the viewer has prayed this intercession today. Drives the
  // feed's rotating deck: un-prayed cards sort to the top.
  myPrayedToday?: boolean;
  // Optional outbound URL surfaced as a "Read more" link on the slide,
  // for background context (e.g. a Grist article about the issue).
  learnMoreUrl?: string | null;
  // Auto-fetched title of that article — caption above the Learn more pill.
  learnMoreTitle?: string | null;
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
  // "Pray along": true when THIS viewer has adopted someone else's prayer
  // intention (it joins their own list + slideshow). adoptCount = how many
  // people are carrying it (any viewer can see it as gentle social proof).
  isAdopted?: boolean;
  adoptCount?: number;
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
  kind: "intercession" | "request" | "prayer-for" | "prayer-from" | "prayer-for-expired" | "ask-request" | "pray-for-suggest" | "circle-intention" | "pause";
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
  // intercession specific — auto-fetched title of the learnMoreUrl
  // article. Rendered above the "Learn more →" pill (same style as the
  // take-action caption) so the reader sees what they're about to open.
  // Null when the fetch found nothing — pill renders bare.
  learnMoreTitle?: string | null;
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
  // prayer-for specific
  prayerForId?: number;
  recipientName?: string;
  recipientAvatarUrl?: string | null;
  dayLabel?: string;
  // prayer-from specific — someone is praying FOR the viewer (the inverse
  // of prayer-for). The author fields below carry the pray-er's name +
  // avatar; `fullText` carries the prayer body; `prayerFromId` is the
  // /api/prayers-for/for-me row id so the slide can mark it acknowledged
  // / focused when opened from a push tap.
  prayerFromId?: number;
  prayingSinceLabel?: string;
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
  // request specific — true when THIS slide is one of the viewer's own
  // active prayer INTENTIONS (the reframed "Prayer"). It shows in the
  // viewer's own slideshow so they pray it daily: "Your prayer" eyebrow,
  // no word-compose field (you don't comfort yourself), no Pray-along.
  isOwnPrayer?: boolean;
  // request specific — true when the viewer has ADOPTED this (others' )
  // prayer via "Pray along". Hides the Pray-along button and shows a
  // "praying along" caption instead. adoptCount = total carriers.
  isAdopted?: boolean;
  adoptCount?: number;
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

// 3-second pause-before-Amen. When a slide first appears the button
// shows a dim green pill with a left-to-right progress wash and no
// label. After 3 seconds the wash hits 100%, the button brightens,
// "Amen →" fades up, and a soft "light" haptic fires — distinct from
// the medium-impact haptic that triggers on the tap itself, so the
// reveal and the press feel like two different events.
//
// Why: tappers were ripping through the slideshow in a few seconds
// without actually pausing on each prayer. The forced wait turns each
// slide into a real moment of attention. The CSS keyframe duration in
// index.css (.amen-progress-fill) is kept in sync with AMEN_HOLD_MS —
// if one changes, change the other.
//
// The component is KEYED by slideKey at the call site, so it remounts on
// every slide; the mount-effect timer below therefore resets cleanly each
// slide. (This is what avoids the old "first one works, then no others"
// bug — `ready` is always fresh-false on a new slide and reliably flips
// true after the hold, so taps register on every slide once the wait ends.)
const AMEN_HOLD_MS = 3000;
function AmenButton({ slideKey, onAdvance }: {
  slideKey: string | number;
  onAdvance: () => void;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => {
      setReady(true);
      // Soft "light" haptic marks the reveal — a different feel from the
      // medium impact on the tap itself.
      try { window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "light" } })); } catch { /* non-fatal */ }
    }, AMEN_HOLD_MS);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <button
      onClick={() => {
        if (!ready) return;
        try { window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "medium" } })); } catch { /* non-fatal */ }
        onAdvance();
      }}
      disabled={!ready}
      aria-label="Amen"
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

// (Removed: the per-slide "Pray along" button — being on a prayer slide already
// means you're praying it, so the button made no sense. The adopt/release API
// is dormant.)

// (Removed: NotTodayLink — the per-slide "Not today" skip link is
// gone per user direction. The slide flow is Amen-or-X-out only.)

// The landscape behind a prayer/intercession slide. It fades in only AFTER the
// image has actually decoded (onLoad) — bundled photos load async, so rendering
// at full opacity immediately made the FIRST intercession "flash" in when the
// image finally arrived. Keyed by src upstream, so `loaded` resets per section
// and each new landscape cross-fades up smoothly. Still respects slideVisible so
// it fades out with the slide on advance.
function OfficeBackdropPhoto({ src, slideVisible }: { src: string; slideVisible: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      onLoad={() => setLoaded(true)}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: (slideVisible && loaded) ? 0.22 : 0, transition: "opacity 0.6s ease", zIndex: -1 }}
    />
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
  onStartContemplation,
  onStartCobreathe,
}: {
  slide: PrayerSlide;
  // Stable key per slide — drives the 3-second Amen pause-reset. The
  // parent passes the slide index so the timer cleanly resets each
  // time we move to a new slide.
  slideKey: string | number;
  onAdvance: () => void;
  onRenew: (id: number, days: 3 | 7) => void;
  onEnd: (id: number) => void;
  onAskSubmit: (body: string, durationDays: number) => void;
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
  // Opens the contemplation timer overlay from the pause slide. A
  // number starts a sit of that length immediately (the quick 5/10/20
  // buttons); undefined opens the full duration picker.
  onStartContemplation: (minutes?: number) => void;
  // Opens the Cobreathe overlay from the pause slide — a daily communal
  // breath for justice, paced by a shared clock so everyone breathes
  // together. Logs a contemplation sit like the timer does.
  onStartCobreathe: () => void;
}) {
  const { i18n } = useTranslation();
  // The viewer — used by the "praying for you" slide to show YOUR own picture
  // (it's your prayer request being held).
  const { user } = useAuth();
  const [askBody, setAskBody] = useState("");
  // How long the garden carries it — a 1–7 day dropdown, default 3.
  const [askDays, setAskDays] = useState<number>(3);
  // Selected length (minutes) for the pause slide's contemplation dropdown.
  const [pauseMin, setPauseMin] = useState(10);
  const bcpPrayer = slide.kind === "intercession" ? findBcpPrayer(slide.text) : undefined;
  // Resolve the locale-aware view of the BCP prayer once; the body
  // card below picks `localizedBcp.text` so Spanish readers see the
  // Libro de Oración Común wording.
  const localizedBcp = bcpPrayer ? localizeBcpPrayer(bcpPrayer, i18n.language) : undefined;

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
          How can your community<br />pray for you?
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

        {/* How long the community carries it — a 1–7 day dropdown (default 3),
            full-width to match the share button. */}
        <div className="w-full max-w-xs">
        <select
          value={askDays}
          onChange={(e) => setAskDays(Number(e.target.value))}
          aria-label="How long should we carry it?"
          style={{
            width: "100%", background: "rgba(46,107,64,0.22)", color: "#F0EDE6",
            border: "1px solid rgba(46,107,64,0.50)", borderRadius: 999,
            padding: "12px 22px", fontSize: 14, fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif",
            textAlignLast: "center", colorScheme: "dark", cursor: "pointer", outline: "none",
          }}
        >
          {Array.from({ length: 7 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>{d === 1 ? "1 day" : `${d} days`}</option>
          ))}
        </select>
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs mt-1">
          <button
            onClick={() => askBody.trim() && onAskSubmit(askBody.trim(), askDays)}
            disabled={askBody.trim().length === 0 || askSubmitting}
            className="px-6 py-3 rounded-full text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            {askSubmitting ? "Sharing…" : "Share with my community →"}
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
        className="w-full flex flex-col items-center text-center gap-7"
        style={{ minHeight: "calc(100dvh - 32dvh)", justifyContent: "center" }}
      >
        {/* Existing pause copy — eyebrow + the invitation to pause. */}
        <div className="flex flex-col items-center gap-3">
          <p
            className="text-[10px] uppercase tracking-[0.18em] font-semibold"
            style={{ color: "rgba(143,175,150,0.45)" }}
          >
            🕯️ A moment to pause
          </p>
          <p
            className="text-[22px] leading-[1.5] font-medium italic"
            style={{ color: "#E8E4D8", fontFamily: "Georgia, 'Times New Roman', serif", maxWidth: 360 }}
          >
            Take a breath. Bring anything else on your heart to prayer.
          </p>
        </div>

        {/* Choose a length → contemplate, or breathe together. Mirrors the
            Contemplation start screen (length dropdown + Start, then Cobreathe
            set apart) — no stats / log links. */}
        <div className="w-full" style={{ maxWidth: 340 }}>
          <div className="flex flex-col gap-2.5">
            <div className="relative">
              <select
                value={String(pauseMin)}
                onChange={(e) => setPauseMin(parseInt(e.target.value, 10))}
                aria-label="Length"
                className="w-full rounded-full"
                style={{
                  background: "rgba(46,107,64,0.18)",
                  border: "1px solid rgba(46,107,64,0.4)",
                  color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 600,
                  padding: "15px 40px", outline: "none", colorScheme: "dark",
                  appearance: "none", WebkitAppearance: "none", cursor: "pointer",
                  textAlign: "center", textAlignLast: "center",
                }}
              >
                {Array.from({ length: 12 }, (_, i) => (i + 1) * 5).map((m) => (
                  <option key={m} value={String(m)}>{m} minutes</option>
                ))}
              </select>
              <span aria-hidden style={{ position: "absolute", right: 18, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "rgba(143,175,150,0.85)", fontSize: 12 }}>▾</span>
            </div>
            <button
              type="button"
              onClick={() => onStartContemplation(pauseMin)}
              className="w-full rounded-full text-center transition-opacity hover:opacity-90 active:scale-[0.99]"
              style={{ background: "#2D5E3F", color: "#F0EDE6", border: "1px solid rgba(46,107,64,0.7)", fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 600, padding: 15, cursor: "pointer" }}
            >
              Start contemplation <span aria-hidden>→</span>
            </button>
          </div>
          {/* Cobreathe — set apart with a space. */}
          <button
            type="button"
            onClick={onStartCobreathe}
            className="w-full rounded-full mt-6 transition-opacity hover:opacity-90 active:scale-[0.99]"
            style={{ background: "rgba(62,124,122,0.18)", border: "1px solid rgba(62,124,122,0.45)", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 600, padding: 15, cursor: "pointer" }}
          >
            <CobreatheGlobe size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />
            Cobreathe
          </button>
        </div>

        {/* "or continue with office" — a quiet text button at the foot; advances
            past the pause (into the rest of the office) without contemplating. */}
        <button
          type="button"
          onClick={onAdvance}
          className="transition-opacity active:opacity-70"
          style={{ background: "none", border: "none", color: "rgba(143,175,150,0.85)", fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 600, cursor: "pointer", padding: "8px 12px" }}
        >
          or continue with office <span aria-hidden>→</span>
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

  // ── "Someone is praying for you" slide ──────────────────────────────────
  // Mirror of the prayer-for slide but flipped: avatar + name are the
  // pray-er, not the recipient. No Amen — the viewer is the one being
  // held, so we just offer a "Continue →" advance (same pattern as the
  // pause slide). Built for the queue=prayers-for-me deck the push tap
  // opens; multiple slides flow naturally if more than one person is
  // currently praying.
  if (slide.kind === "prayer-from") {
    const youInitials = (user?.name ?? "")
      .split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
    return (
      // Your prayer request, being held — fades up, themed BLUE (distinct from
      // the green "pray for others" slides), and shows YOUR picture since it's
      // your request. The person praying is credited in the caption below.
      <motion.div
        className="w-full flex flex-col items-center text-center gap-5"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <p
          className="text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "rgba(150,178,214,0.6)" }}
        >
          Praying for you
        </p>
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user?.name ?? "You"}
            className="w-16 h-16 rounded-full object-cover prayer-avatar-pulse"
          />
        ) : (
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-semibold prayer-avatar-pulse"
            style={{ background: "#1A3A5E", color: "#A8C8E8" }}
          >
            {youInitials}
          </div>
        )}

        {slide.fullText && (
          <div
            className="w-full rounded-2xl px-6 py-5 text-left mt-1"
            style={{
              background: "rgba(96,141,209,0.12)",
              border: "1px solid rgba(96,141,209,0.22)",
            }}
          >
            {(() => {
              const fit = fitPrayerText(slide.fullText);
              return (
                <p
                  className="italic whitespace-pre-wrap"
                  style={{
                    color: "#CDD9EC",
                    fontFamily: "Georgia, 'Times New Roman', serif",
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

        {slide.authorName && (
          <p className="text-[12px]" style={{ color: "rgba(150,178,214,0.7)", fontFamily: "'Space Grotesk', sans-serif" }}>
            {slide.authorName} is praying for you{slide.prayingSinceLabel ? ` · ${slide.prayingSinceLabel}` : ""}
          </p>
        )}

        <button
          onClick={onAdvance}
          className="mt-2 px-10 py-3.5 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
          style={{ background: "#2E5C8F", color: "#F0EDE6" }}
        >
          Continue →
        </button>
      </motion.div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center text-center gap-5">
      {/* Request slides: author avatar + name above the body, mirroring
          the "Praying for" slide's layout. The avatar anchors the slide
          to a specific person so the prayer doesn't read as anonymous
          text. Intercession/circle slides skip this block. */}
      {slide.kind === "request" && !slide.isOwnPrayer && (slide.authorName || slide.authorAvatarUrl) && (
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
                : slide.isOwnPrayer
                  ? "Your Prayer"
                  : slide.isAdopted
                    ? "Praying Along"
                    : "Prayer"}
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
          pill per community. Mirrors the row on the moment-detail
          page so a multi-community intercession shows which
          communities are carrying it. Non-tappable here — the
          slideshow shouldn't bounce the user out of prayer mode to a
          community home page; the chips are informational. For
          intercessions WITHOUT a community (feed-only) we deliberately
          do NOT fall back to a "with {names…}" line: the avatar rail
          below carries the social signal — those are people who have
          actually prayed, not a slice of any community's roster.
          Non-intercession slides (prayer requests etc.) keep their
          attribution. */}
      {slide.kind === "intercession" && slide.groups && slide.groups.length > 0 ? (
        <div className="overflow-hidden w-full pill-ticker-mask">
          {/* One gently-scrolling line (a ticker) — pills duplicated so the
              loop is seamless; the second copy is aria-hidden. */}
          <div className="pill-ticker gap-1.5">
            {[...slide.groups!, ...slide.groups!].map((g, i) => (
              <span
                key={`${g.id}-${i}`}
                aria-hidden={i >= slide.groups!.length}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap shrink-0"
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
        </div>
      ) : slide.kind !== "intercession" && slide.attribution ? (
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

      {/* BCP enrichment — show the formal prayer text from the Book
          of Common Prayer (in the active locale's translation when
          available). */}
      {localizedBcp && (
        <div
          className="w-full rounded-2xl px-6 py-5 text-left mt-1 animate-turn-pulse-practices"
          style={{
            background: "rgba(9,26,16, 0.297)",
            backdropFilter: "blur(11.34px)",
            WebkitBackdropFilter: "blur(11.34px)",
            border: "1px solid rgba(46,107,64,0.15)",
          }}
        >
          {(() => {
            const fit = fitPrayerText(localizedBcp.text);
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
                {localizedBcp.text}
              </p>
            );
          })()}
          <p
            className="text-[9px] uppercase tracking-[0.14em] mt-3"
            style={{ color: "rgba(143,175,150,0.3)" }}
          >
            {i18n.language?.startsWith("es") ? "Del Libro de Oración Común" : "From the Book of Common Prayer"}
          </p>
        </div>
      )}

      {/* Word-of-comfort field — only on OTHERS' request slides. Shows the
          viewer's existing word (or a compose field). Suppressed on the viewer's
          OWN prayer (you don't comfort yourself). The "Pray along" button was
          removed — being on the slide already means you're praying it. */}
      {slide.kind === "request" && typeof slide.requestId === "number" && !slide.isOwnPrayer && (
        <motion.div
          className="w-full flex flex-col items-center gap-3"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.18, ease: "easeOut" }}
        >
          <RequestWordField requestId={slide.requestId} initialWord={slide.myWord ?? null} />
        </motion.div>
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
            background: "rgba(9,26,16, 0.297)",
            backdropFilter: "blur(11.34px)",
            WebkitBackdropFilter: "blur(11.34px)",
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
              {i18n.language?.startsWith("es") ? "Del Libro de Oración Común" : "From the Book of Common Prayer"}
            </p>
          )}
        </div>
      )}

      {/* Optional outbound link. Two shapes:
            • "Take action →" intercessions sit inside a small card
              that explains what tapping does (so the pill isn't a
              naked verb floating below the prayer). The pill itself
              glows until the user has tapped it once.
            • "Learn more →" intercessions render the pill alone —
              the body text already explains the context.
          openExternal routes the tap through SFSafariViewController on
          the iOS shell; web falls back to a new tab. */}
      {slide.kind === "intercession" && slide.learnMoreUrl && (
        slide.source === "action" ? (
          // Action intercession — caption + Take action pill rendered
          // directly on the slide background, no card wrapper. Keeps
          // the prayer body and the call to act feeling like one
          // continuous thought instead of two competing surfaces.
          <div
            className="w-full mt-2 flex flex-col items-center text-center"
            style={{ gap: 12 }}
          >
            <p
              className="text-sm leading-relaxed"
              style={{
                color: "#C8D4C0",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              You can take action by emailing the applicable representatives.
            </p>
            <ExternalLinkPill url={slide.learnMoreUrl} label="Take action →" />
          </div>
        ) : (
          // Learn more — when we have the auto-fetched article title,
          // stack a small "Read Article" label ON TOP of the article
          // title (quoted), then the tappable pill beneath. No title →
          // bare pill (the fetch found nothing).
          slide.learnMoreTitle ? (
            <div
              className="w-full mt-2 flex flex-col items-center text-center"
              style={{ gap: 8 }}
            >
              <p
                className="text-[10px] uppercase tracking-[0.18em] font-semibold"
                style={{ color: "rgba(143,175,150,0.55)", margin: 0 }}
              >
                Read Article
              </p>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "#C8D4C0", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}
              >
                &ldquo;{slide.learnMoreTitle}&rdquo;
              </p>
              <ExternalLinkPill url={slide.learnMoreUrl} label="Learn more →" className="mt-1" />
            </div>
          ) : (
            <ExternalLinkPill
              url={slide.learnMoreUrl}
              label="Learn more →"
              className="mt-1"
            />
          )
        )
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
// CommunityPrayedRecap (the "you prayed for N people this week" + faces recap)
// now lives in components/CommunityPrayedRecap.tsx so the native app-open splash
// can reuse the exact same slide.

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
  coPrayers = [],
}: {
  onDone: () => void;
  visible: boolean;
  /** True when the office just finished was an evening one. Gates the
   *  "Ignatian Examen" pill — the Examen is an end-of-day practice. */
  isEvening?: boolean;
  /** People the viewer prayed for this week — surfaced as the
   *  "you prayed for N people" recap under the rhythm card. */
  coPrayers?: Array<{ id: number; name: string | null; avatarUrl: string | null }>;
}) {
  // The Examen is pilot-only, so the pill only shows for pilot users
  // with pilot view on — same gate as the menu entry.
  const { isBeta } = useBetaStatus();
  // End-of-office gratitude beat — a gentle "name one thing you're
  // grateful for" the close offers before you leave.
  const [thanksOpen, setThanksOpen] = useState(false);
  const { t } = useTranslation();
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
      {/* The day's rhythm — the four anchors (Morning · Reflect · Silence ·
          Evening), the weekly streak, and what's next — the shared
          TodaysRhythm card, the same one behind the header "Daily progress"
          pill. Replaces the old bespoke Morning/Evening rows + 7-day grid so
          the closing reads consistently with the rest of the app. */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="w-full"
      >
        <TodaysRhythm />
      </motion.div>

      {/* "You prayed for N people this week" — the community recap, moved here
          from the prior closing slide so it sits under the daily-progress
          rhythm. */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.18 }}
        className="w-full flex flex-col items-center"
        style={{ gap: 16 }}
      >
        {/* Fellows off: no "prayed with you" community recap on the devotion close. */}
      </motion.div>

      {/* Give-thanks (gratitude) + Ignatian Examen — on the same level. The
          Examen is evening-only (end-of-day prayer) and pilot-only; gratitude
          is open to everyone. */}
      <div className="flex items-center justify-center flex-wrap" style={{ gap: 10 }}>
        <button
          type="button"
          onClick={() => setThanksOpen(true)}
          className="text-[12px] font-semibold px-4 py-2 rounded-full transition-opacity hover:opacity-90"
          style={{
            background: "rgba(46,107,64,0.22)",
            color: "#A8C5A0",
            border: "1px solid rgba(46,107,64,0.45)",
            fontFamily: "'Space Grotesk', sans-serif",
            cursor: "pointer",
          }}
        >
          🌾 Give thanks
        </button>
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
      </div>
      <GratitudeNudge open={thanksOpen} onClose={() => setThanksOpen(false)} />

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

// ─── Reflection slide ───────────────────────────────────────────────────────
// Shown on the office-finish walk (closingOnly / offices-only) BEFORE the
// closing summary, when the user has a daily reflection turned on (Settings →
// After the office, or a visible home reflection card). Embeds today's
// reflection IN-APP — with a bottom "Continue" bar that advances to the
// closing summary — instead of ejecting to SFSafariViewController, so the
// reflection reads as part of the slideshow rather than a detour out of it.
//
// FDD + SSJE set no framing restrictions, so they render in an <iframe>. CAC's
// link 302-redirects to cac.org, which sends X-Frame-Options: SAMEORIGIN and
// can't be framed; for CAC we show an in-app card that opens the meditation in
// the in-app browser (the only path that works). An "Open ↗" escape hatch in
// the header covers any embed that won't load on a given device.
function ReflectionSlide({
  source,
  onContinue,
}: {
  source: "cac" | "fdd" | "ssje";
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const url = source === "fdd" ? FDD_TODAY_URL : source === "ssje" ? SSJE_TODAY_URL : CAC_TODAY_URL;
  const heading =
    source === "fdd" ? "Forward Day by Day"
      : source === "ssje" ? "Brother, Give Us a Word"
        : "CAC Daily Meditation";
  const canEmbed = source !== "cac";
  const RFONT = "'Space Grotesk', sans-serif";

  // They're reading it now — flip the home card / dashboard module to
  // "Read again", same as the old close pill did on tap.
  useEffect(() => {
    if (source === "fdd") markFddRead();
    else if (source === "ssje") markSsjeRead();
    else markCacRead();
  }, [source]);

  // A quick reflection-journal popup, opened from the bottom bar so the
  // reader can jot today's reflection without leaving the office.
  const [journalOpen, setJournalOpen] = useState(false);

  // The embed runs full-bleed (edge-to-edge) in the native app, but keeps a
  // padded, rounded card on web where the surrounding chrome has room.
  const fullBleed = isNativeShell();

  // SSJE's /word/ page shows a cookie-consent bar across the very top. Inside
  // the native WKWebView its (third-party) storage is partitioned, so the bar
  // reappears every single visit and we can't reach into the cross-origin frame
  // to dismiss it. So we crop: shift the iframe up so the top chrome (cookie bar
  // + site header) clips off above the fold and the reflection itself fills the
  // frame — the container already clips overflow. Native only: on the web build
  // the consent persists after one dismissal, so there's nothing to hide. Tune
  // SSJE_TOP_CROP_PX if SSJE changes their banner/header height.
  const SSJE_TOP_CROP_PX = 88;
  const ssjeCrop = source === "ssje" && fullBleed;

  // CAC can't be iframed (cac.org sends X-Frame-Options), so instead of an
  // embed we show today's scraped title + a "Read now" CTA into the in-app
  // browser. Title comes from the CAC daily-meditations RSS feed.
  const { data: cacMeta } = useQuery<{ title: string; url: string }>({
    queryKey: ["/api/cac/today-meta"],
    queryFn: () => apiRequest("GET", "/api/cac/today-meta"),
    enabled: source === "cac",
    staleTime: 30 * 60_000,
    // Always refetch when the office opens so the reflection shows the CURRENT
    // day's meditation — not one cached from an earlier session. The query key
    // isn't date-scoped, so with the app left open across the midnight/publish
    // boundary the 30-min staleTime could otherwise serve yesterday's title.
    // The server's own 30-min cache keeps repeated opens cheap.
    refetchOnMount: "always",
  });
  const cacTitle = cacMeta?.title ?? "";

  return (
    <div
      style={{
        // fixed (not absolute): the prayer-mode root can grow taller than
        // the viewport, so an absolute inset:0 would push the Continue bar
        // below the fold. Fixed pins us to the viewport like the podcast
        // expanded player.
        position: "fixed",
        inset: 0,
        zIndex: 70,
        display: "flex",
        flexDirection: "column",
        background: "#0C1F12",
        paddingTop: "max(0.75rem, var(--safe-top))",
      }}
    >
      {/* Header — what they're reading + a deliberate open-out escape. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 18px 10px", flexShrink: 0 }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: "rgba(143,175,150,0.8)", fontFamily: RFONT }}>
          {t("offices.todays_reflection", { defaultValue: "Today's reflection" })}
        </span>
        <button
          type="button"
          onClick={() => openExternal(url)}
          style={{ background: "none", border: "none", color: "#8FAF96", fontSize: 12, fontFamily: RFONT, cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}
        >
          {t("offices.open_external", { defaultValue: "Open ↗" })}
        </button>
      </div>

      {/* Reflection body. FDD/SSJE embed inline (framed); CAC can't be
          framed (cac.org sends X-Frame-Options), so it shows today's
          scraped title + a Read-now CTA with no box. */}
      {canEmbed ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            position: "relative",
            overflow: "hidden",
            // FDD has no dark theme; the iframe below is inverted to dark, so
            // back it with the dark ground (not white) to avoid a flash.
            background: source === "fdd" ? "#0C1F12" : "#fff",
            // Native app: edge-to-edge, top/bottom hairlines only. Web: a
            // padded, rounded card.
            ...(fullBleed
              ? { borderTop: "1px solid rgba(46,107,64,0.3)", borderBottom: "1px solid rgba(46,107,64,0.3)" }
              : { margin: "0 12px", borderRadius: 16, border: "1px solid rgba(46,107,64,0.3)" }),
          }}
        >
          <iframe
            key={url}
            src={url}
            title={heading}
            style={{
              position: "absolute", left: 0, right: 0, width: "100%", border: "none",
              // SSJE: shift up to clip its top chrome (cookie bar + header);
              // otherwise fill the container normally.
              ...(ssjeCrop
                ? { top: -SSJE_TOP_CROP_PX, height: `calc(100% + ${SSJE_TOP_CROP_PX}px)` }
                : { top: 0, height: "100%" }),
              // Forward Day by Day ships light-only — force dark with invert +
              // hue-rotate so it doesn't glare mid-office (whites → near-black,
              // text → light). White iframe bg inverts to black (no flash).
              // SSJE renders untouched.
              ...(source === "fdd"
                ? { filter: "invert(1) hue-rotate(180deg)", background: "#fff" }
                : {}),
            }}
          />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: "0 34px", textAlign: "center" }}>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: "rgba(143,175,150,0.7)", margin: 0, fontFamily: RFONT }}>
            Center for Action and Contemplation
          </p>
          {cacTitle ? (
            // Once today's title resolves: "Today's Daily Meditation" as a
            // small label above the actual meditation title for the day.
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#8FAF96", margin: 0, fontFamily: RFONT }}>
                {t("offices.cac_fallback_title", { defaultValue: "Today’s Daily Meditation" })}
              </p>
              <h2 style={{ fontSize: 25, fontWeight: 700, lineHeight: 1.3, color: "#F0EDE6", margin: 0, fontFamily: RFONT }}>
                {cacTitle}
              </h2>
            </div>
          ) : (
            <h2 style={{ fontSize: 25, fontWeight: 700, lineHeight: 1.3, color: "#F0EDE6", margin: 0, fontFamily: RFONT }}>
              {t("offices.cac_fallback_title", { defaultValue: "Today’s Daily Meditation" })}
            </h2>
          )}
          <button
            type="button"
            onClick={() => openExternal(url)}
            className="px-8 py-3.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98]"
            style={{ background: "#2D5E3F", color: "#F0EDE6", fontFamily: RFONT, marginTop: 4 }}
          >
            {t("offices.read_now", { defaultValue: "Read now →" })}
          </button>
        </div>
      )}

      {/* Bottom bar — Journal (jot today's reflection) + Continue to the summary. */}
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 10, padding: "14px 16px max(16px, env(safe-area-inset-bottom))" }}>
        <button
          type="button"
          onClick={() => setJournalOpen(true)}
          className="px-7 py-3.5 rounded-full text-sm font-semibold tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
          style={{ background: "rgba(46,107,64,0.25)", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.5)", fontFamily: RFONT }}
        >
          {t("fdd_journal.button", { defaultValue: "✎ Journal" })}
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="px-10 py-3.5 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
          style={{ background: "#2D5E3F", color: "#F0EDE6", fontFamily: RFONT }}
        >
          {t("common.continue", { defaultValue: "Continue" })} →
        </button>
      </div>

      {journalOpen && (
        <FddJournalSheet
          promptTag={`Reflecting on ${heading}`}
          onClose={() => setJournalOpen(false)}
          onSaved={() => { setJournalOpen(false); onContinue(); }}
        />
      )}
    </div>
  );
}

// ── "Let your community hold you in prayer" — closing-card composer ────────
// A compact prayer-request composer on the closing slide, so the moment of
// having prayed for others flows naturally into asking for prayer yourself.
// Posts the same body shape as /pray-request/new; the dropdown picks how
// many days the request stays before the community (1–14, default 7).
// Hidden for offices-only viewers (no prayer-requests access) and the
// parish-only tier (the server 403s prayer-request creation for them).
function HoldMeComposer() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [days, setDays] = useState(7);
  const create = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/prayer-requests", {
        body: body.trim(),
        isAnonymous: false,
        durationDays: days,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests/last-mine"] });
    },
  });

  if (user?.accessTier === "parish-only") return null;

  if (create.isSuccess) {
    return (
      <p
        className="text-[13px]"
        style={{ color: "rgba(168,197,160,0.85)", fontFamily: "'Space Grotesk', sans-serif", maxWidth: 380 }}
      >
        🙏 Shared — your community will hold you in prayer.
      </p>
    );
  }

  return (
    <div className="w-full flex flex-col items-stretch gap-2.5 text-left" style={{ maxWidth: 380 }}>
      <p
        className="text-[10px] uppercase tracking-[0.18em] font-semibold text-center"
        style={{ color: "rgba(143,175,150,0.55)" }}
      >
        Let your community hold you in prayer
      </p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 1000))}
        rows={2}
        placeholder="Share something on your heart, an important event coming up, someone you care for, or a cause that is dear to you…"
        className="w-full rounded-2xl px-4 py-3 text-[14px] outline-none resize-none"
        style={{
          background: "rgba(46,107,64,0.12)",
          border: "1px solid rgba(46,107,64,0.3)",
          color: "#F0EDE6",
          fontFamily: "'Space Grotesk', sans-serif",
          fontStyle: "italic",
          lineHeight: 1.6,
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2">
          <span className="text-[12px]" style={{ color: "rgba(143,175,150,0.7)", fontFamily: "'Space Grotesk', sans-serif" }}>
            How long
          </span>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="text-[13px] font-semibold rounded-lg px-2.5 py-1.5"
            style={{
              color: "#F0EDE6",
              fontFamily: "'Space Grotesk', sans-serif",
              background: "rgba(46,107,64,0.22)",
              border: "1px solid rgba(46,107,64,0.45)",
              appearance: "auto",
            }}
          >
            {Array.from({ length: 14 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{d === 1 ? "1 day" : `${d} days`}</option>
            ))}
          </select>
        </label>
        <button
          onClick={() => body.trim() && create.mutate()}
          disabled={body.trim().length === 0 || create.isPending}
          className="px-5 py-2 rounded-full text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: "#2D5E3F", color: "#F0EDE6" }}
        >
          {create.isPending ? "Sharing…" : "Share →"}
        </button>
      </div>
      {create.isError && (
        <p className="text-[12px]" style={{ color: "#D98A8A", fontFamily: "'Space Grotesk', sans-serif" }}>
          Couldn't share right now — your words are still here, try again in a moment.
        </p>
      )}
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
  doneLabel,
  officesOnly = false,
  hideCommunityRecap = false,
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
  /** Offices-only viewers don't have friends or a garden — the
   *  "Make praying for your friends a daily habit" copy below
   *  doesn't fit them. We swap to feed-rhythm copy when this is
   *  true (and there are no co-prayers to acknowledge). */
  officesOnly?: boolean;
  /** When a habit slide follows (the office-finish / offices-only paths), the
   *  "you prayed for N people" recap is moved there (under the daily-progress
   *  rhythm), so we hide it here to avoid showing it twice. */
  hideCommunityRecap?: boolean;
}) {
  const { t } = useTranslation();
  void _streak;
  const effectiveDoneLabel = doneLabel ?? t("common.done");

  return (
    <div
      className="w-full flex flex-col items-center text-center"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 0.4s ease",
        gap: 28,
      }}
    >
      {/* The whole close, simplified to this: who you prayed for this week —
          the count + their faces — and one pill to add a prayer request of
          your own. (The gratitude / Examen pills and the rhythm grid that
          used to follow on a second slide were removed.) */}
      {/* Fellows off: no "prayed with you" community recap on the devotion close. */}

      {/* Add a prayer request — opens the prayer-request composer feed. */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
        className="w-full flex justify-center"
      >
        <Link href="/pray-request/new">
          <button
            type="button"
            className="text-[13px] font-semibold px-5 py-2.5 rounded-full transition-opacity hover:opacity-90 active:scale-[0.98]"
            style={{
              background: "rgba(46,107,64,0.22)",
              color: "#A8C5A0",
              border: "1px solid rgba(46,107,64,0.45)",
              fontFamily: "'Space Grotesk', sans-serif",
              cursor: "pointer",
            }}
          >
            ＋ {t("prayer_mode.add_prayer_request", { defaultValue: "Add prayer request" })}
          </button>
        </Link>
      </motion.div>

      <button
        onClick={onDone}
        className="px-10 py-3.5 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
        style={{ background: "#2D5E3F", color: "#F0EDE6" }}
      >
        {effectiveDoneLabel}
      </button>

    </div>
  );
}

// The MORNING office/devotion send-off. When the user keeps a daily reflection
// ("newsletter" — CAC / FDD / SSJE), the close ends not on the community recap
// but on a single "what's next" card: today's reflection, tap to open. Fades up
// over a soft gradient. Evening (and reflection-off) closes are handled
// elsewhere — see endOnReflection / fadeHomeNoNewsletter in PrayerModePage.
function WhatsNextSlide({
  source,
  onDone,
  visible,
}: {
  source: Exclude<ReflectionSource, "none">;
  onDone: () => void;
  visible: boolean;
}) {
  const { t } = useTranslation();
  const name =
    source === "fdd" ? "Forward Day by Day"
      : source === "ssje" ? "Brother, Give Us a Word"
        : "CAC Daily Meditation";
  const url = source === "fdd" ? FDD_TODAY_URL : source === "ssje" ? SSJE_TODAY_URL : CAC_TODAY_URL;
  const openReflection = () => {
    if (source === "fdd") markFddRead();
    else if (source === "ssje") markSsjeRead();
    else markCacRead();
    openExternal(url);
  };
  return (
    <div
      className="w-full flex flex-col items-center text-center"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 0.4s ease",
        gap: 26,
      }}
    >
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        style={{
          fontFamily: "'Space Grotesk', sans-serif", fontSize: 12,
          letterSpacing: "0.22em", textTransform: "uppercase", color: "#8FAF96",
        }}
      >
        {t("prayer_mode.as_you_go", { defaultValue: "As you go" })}
      </motion.p>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12 }}
        style={{
          fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700,
          color: "#F0EDE6", letterSpacing: "-0.01em", maxWidth: 320, lineHeight: 1.3,
        }}
      >
        {t("prayer_mode.whats_next_headline", { defaultValue: "Carry the day with you" })}
      </motion.p>

      {/* Today's reflection — tap to open. */}
      <motion.button
        type="button"
        onClick={openReflection}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.24 }}
        className="w-full flex flex-col items-start gap-1.5 rounded-2xl px-5 py-4 text-left transition-opacity hover:opacity-90 active:scale-[0.98]"
        style={{
          maxWidth: 360,
          background: "rgba(46,107,64,0.22)",
          border: "1px solid rgba(46,107,64,0.45)",
          cursor: "pointer",
        }}
      >
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "#8FAF96" }}>
          {t("offices.todays_reflection", { defaultValue: "Today's reflection" })}
        </span>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 17, fontWeight: 600, color: "#F0EDE6" }}>
          {name}
        </span>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600, color: "#A8C5A0", marginTop: 2 }}>
          {t("common.read", { defaultValue: "Read" })} →
        </span>
      </motion.button>

      <motion.button
        type="button"
        onClick={onDone}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.36 }}
        className="px-10 py-3.5 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
        style={{ background: "#2D5E3F", color: "#F0EDE6" }}
      >
        {t("common.done")}
      </motion.button>
    </div>
  );
}

// "Prayer completed" — the close mirrors the home splash: a "Prayer completed"
// heading, the rail of people you prayed with THIS MONTH + the count, and (on a
// morning close with a daily reflection) a WHAT'S NEXT card to read it. Replaces
// the older "Carry the day with you" slide and the blessing send-off, so the
// finish reads like the app's own home hero.
function PrayerCompletedSlide({
  onDone,
  visible,
  doneLabel,
  reflectionSource = null,
}: {
  onDone: () => void;
  visible: boolean;
  doneLabel?: string;
  reflectionSource?: Exclude<ReflectionSource, "none"> | null;
}) {
  const { t } = useTranslation();
  const [, go] = useLocation();
  // The day's rhythm — so once the newsletter is read (or there's none) the close
  // points at WHATEVER ELSE the user has next, not a community tally.
  const rhythm = useRhythmState();

  const refl = reflectionSource;
  const reflName = refl === "fdd" ? "Forward Day by Day" : refl === "ssje" ? "Brother, Give Us a Word" : "CAC Daily Meditation";
  const openReflection = () => {
    if (refl === "fdd") { markFddRead(); openExternal(FDD_TODAY_URL); }
    else if (refl === "ssje") { markSsjeRead(); openExternal(SSJE_TODAY_URL); }
    else { markCacRead(); openExternal(CAC_TODAY_URL); }
  };
  // Has today's reflection been read? When so the card flips to a DONE state —
  // a ✓ and a pulsing green border, the same freshly-completed cue the home
  // daily-progress shows. Re-checks on the read events + return-to-app signals,
  // so reading it (then coming back) flips the card live.
  const reflRead = () => refl === "fdd" ? hasReadFddToday() : refl === "ssje" ? hasReadSsjeToday() : hasReadCacToday();
  const [reflDone, setReflDone] = useState(() => (refl ? reflRead() : false));
  // If they'd ALREADY read today's reflection before this close, don't prompt it
  // again — the card is hidden entirely (captured at mount so reading it during
  // this close still flips the shown card to its Done state, see below).
  const alreadyReadRef = useRef(refl ? reflRead() : false);
  useEffect(() => {
    if (!refl) return;
    const check = () => setReflDone(reflRead());
    const evs = [CAC_READ_EVENT, FDD_READ_EVENT, SSJE_READ_EVENT, "focus", "pageshow", "phoebe:appactive", "phoebe:browserfinished"];
    evs.forEach((e) => window.addEventListener(e, check));
    return () => evs.forEach((e) => window.removeEventListener(e, check));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refl]);

  // Show the newsletter as the what's-next IF it's this user's reflection and
  // hasn't been read yet; otherwise point them at WHATEVER ELSE is next in their
  // rhythm (the first still-undone anchor, in day order). When nothing's left we
  // just send them off with the blessing line — no community tally either way.
  const showReflCard = !!refl && !alreadyReadRef.current;
  const nextUp = (() => {
    if (showReflCard) return null;
    if (rhythm.eveningActive && !rhythm.eveningDone)
      return { emoji: "🌙", title: t("rhythm.card_evening", { defaultValue: "Evening Prayer" }), blurb: t("rhythm.blurb_evening", { defaultValue: "Mark the day's end with the office" }), href: "/begin-prayer?side=evening" };
    if (rhythm.silenceActive && !rhythm.silenceDone)
      return { emoji: "🕯️", title: t("rhythm.card_contemplation", { defaultValue: "Contemplation" }), blurb: t("rhythm.blurb_silence", { defaultValue: "A few minutes of stillness" }), href: "/contemplation" };
    if (rhythm.examenActive && !rhythm.examenDone)
      return { emoji: "🌗", title: t("rhythm.card_examen", { defaultValue: "The Examen" }), blurb: t("rhythm.blurb_examen", { defaultValue: "Review the day with God" }), href: "/examen" };
    if (rhythm.gratitudeActive && !rhythm.gratitudeDone)
      return { emoji: "🌾", title: t("rhythm.card_gratitude", { defaultValue: "Gratitude" }), blurb: t("rhythm.blurb_gratitude", { defaultValue: "Name today's gifts" }), href: "/gratitude" };
    if (rhythm.listeningActive && !rhythm.listeningDone)
      return { emoji: "🎵", title: t("rhythm.card_listening", { defaultValue: "Audio Divina" }), blurb: t("rhythm.blurb_listening", { defaultValue: "Sacred listening" }), href: "/listening" };
    return null;
  })();

  return (
    <div className="w-full flex flex-col items-center text-center" style={{ opacity: visible ? 1 : 0, transition: "opacity 0.4s ease", gap: 26 }}>
      <motion.p
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em" }}
      >
        {t("prayer_mode.prayer_completed", { defaultValue: "Prayer completed" })}
      </motion.p>

      {/* Today's reflection — rendered as the SAME card as the home daily-progress
          rhythm (left bar, 📖, publication, blurb, Read pill → ✓ when done), not a
          bespoke slide card. Shown only when the newsletter is THIS user's
          reflection and hasn't been read yet; otherwise the next-up card below
          takes its place. Reading it flips this card to its Done state live. */}
      {showReflCard && (
        <motion.button
          type="button" onClick={openReflection}
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.24 }}
          className={`w-full relative flex rounded-2xl overflow-hidden text-left transition-opacity hover:opacity-90 active:scale-[0.98]${reflDone ? " dp-card-pulse" : ""}`}
          style={{
            maxWidth: 360, cursor: "pointer",
            background: "linear-gradient(180deg, rgba(46,107,64,0.08) 0%, rgba(46,107,64,0.14) 100%)",
            border: reflDone ? undefined : "1px solid rgba(46,107,64,0.16)",
          }}
        >
          <div className="w-1 flex-shrink-0" style={{ background: "rgba(110,180,130,0.7)" }} />
          <div className="flex-1 min-w-0 px-4 py-3.5 flex items-center gap-3">
            <span className="text-xl flex-shrink-0" aria-hidden>📖</span>
            <div className="flex-1 min-w-0">
              <p className="text-[14.5px] font-semibold leading-tight truncate" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>{reflName}</p>
              <p className="text-[12px] mt-0.5 leading-snug truncate" style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}>
                {reflDone
                  ? t("rhythm.kept", { defaultValue: "Kept today" })
                  : t("rhythm.blurb_reflect", { defaultValue: "A few minutes with the day's word" })}
              </p>
            </div>
            {reflDone ? (
              <span
                className="flex-shrink-0 rounded-full text-[12px] font-semibold px-3.5 py-1.5"
                style={{ background: "rgba(46,107,64,0.18)", color: "rgba(240,237,230,0.85)", border: "1px solid rgba(46,107,64,0.45)" }}
                aria-hidden
              >✓</span>
            ) : (
              <span className="flex-shrink-0 rounded-full text-[12px] font-semibold px-3.5 py-1.5 text-center" style={{ minWidth: 84, background: "rgba(46,107,64,0.85)", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                {t("common.read", { defaultValue: "Read" })} <span aria-hidden>→</span>
              </span>
            )}
          </div>
        </motion.button>
      )}

      {/* Newsletter already done (or none) → point at whatever else is next in
          the rhythm. Same card shape as the reflection card, tapping it begins
          that practice (leaving the close — they're done praying). */}
      {!showReflCard && nextUp && (
        <motion.button
          type="button" onClick={() => go(nextUp.href)}
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.24 }}
          className="w-full relative flex rounded-2xl overflow-hidden text-left transition-opacity hover:opacity-90 active:scale-[0.98]"
          style={{
            maxWidth: 360, cursor: "pointer",
            background: "linear-gradient(180deg, rgba(46,107,64,0.08) 0%, rgba(46,107,64,0.14) 100%)",
            border: "1px solid rgba(46,107,64,0.16)",
          }}
        >
          <div className="w-1 flex-shrink-0" style={{ background: "rgba(110,180,130,0.7)" }} />
          <div className="flex-1 min-w-0 px-4 py-3.5 flex items-center gap-3">
            <span className="text-xl flex-shrink-0" aria-hidden>{nextUp.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[9.5px] font-semibold leading-none mb-1" style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.16em", textTransform: "uppercase" }}>
                {t("prayer_mode.up_next", { defaultValue: "Up next" })}
              </p>
              <p className="text-[14.5px] font-semibold leading-tight truncate" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>{nextUp.title}</p>
              <p className="text-[12px] mt-0.5 leading-snug truncate" style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}>{nextUp.blurb}</p>
            </div>
            <span className="flex-shrink-0 rounded-full text-[12px] font-semibold px-3.5 py-1.5 text-center" style={{ minWidth: 84, background: "rgba(46,107,64,0.85)", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              {t("common.begin", { defaultValue: "Begin" })} <span aria-hidden>→</span>
            </span>
          </div>
        </motion.button>
      )}

      <motion.button
        type="button" onClick={onDone}
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.36 }}
        className="px-10 py-3.5 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
        style={{ background: "#2D5E3F", color: "#F0EDE6" }}
      >
        {doneLabel ?? t("common.done")}
      </motion.button>
    </div>
  );
}

// Upcoming events on the close — three of the user's next events (gatherings,
// fellow plans, feed events), rendered with the same card the Events page uses.
// Replaces the old "As you go" newsletter slide; a gentle send-off when the
// calendar is clear.
function OfficeCloseEventsSlide({ onDone, visible }: { onDone: () => void; visible: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="w-full flex flex-col items-center text-center" style={{ opacity: visible ? 1 : 0, transition: "opacity 0.4s ease", gap: 26 }}>
      <motion.p
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
        style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 12, letterSpacing: "0.22em", textTransform: "uppercase", color: "#8FAF96" }}
      >
        {t("prayer_mode.coming_up", { defaultValue: "Coming up" })}
      </motion.p>
      <OfficeCloseEvents max={3} onResolvedEmpty={onDone} onEmpty={(
        <motion.p
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.12 }}
          style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic", fontSize: 19, color: "#F0EDE6", maxWidth: 320, lineHeight: 1.45 }}
        >
          {t("prayer_mode.go_in_peace_line", { defaultValue: "Go in peace to love and serve the Lord." })}
        </motion.p>
      )} />
      <motion.button
        type="button" onClick={onDone}
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.36 }}
        className="px-10 py-3.5 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
        style={{ background: "#2D5E3F", color: "#F0EDE6" }}
      >
        {t("common.done")}
      </motion.button>
    </div>
  );
}

// The blessing — the universal final beat of a prayer close. An office ends not
// on a tally but on a gift: a benediction spoken over you, then you are sent on.
// The Aaronic blessing (Numbers 6) by day; a Compline rest at night. This is
// what replaced the old abrupt fade-to-home, so no close ends cold.
function BlessingSlide({
  isEvening,
  onDone,
  visible,
}: {
  isEvening: boolean;
  onDone: () => void;
  visible: boolean;
}) {
  const { t } = useTranslation();
  const blessing = isEvening
    ? t("prayer_mode.blessing_evening", {
        defaultValue:
          "Guide us waking, O Lord, and guard us sleeping; that awake we may watch with Christ, and asleep we may rest in peace.",
      })
    : t("prayer_mode.blessing_day", {
        defaultValue:
          "The Lord bless you and keep you; the Lord make his face to shine upon you, and be gracious to you; the Lord lift up his countenance upon you, and give you peace.",
      });
  return (
    <div
      className="w-full flex flex-col items-center text-center"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 0.5s ease",
        gap: 30,
      }}
    >
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          fontFamily: "'Space Grotesk', sans-serif", fontSize: 12,
          letterSpacing: "0.24em", textTransform: "uppercase", color: "#8FAF96",
        }}
      >
        {t("prayer_mode.go_in_peace", { defaultValue: "Go in peace" })}
      </motion.p>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.2 }}
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontStyle: "italic",
          fontSize: 21, lineHeight: 1.55, color: "#E8E4D8", maxWidth: 340,
        }}
      >
        {blessing}
      </motion.p>

      <motion.button
        type="button"
        onClick={onDone}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.55 }}
        className="px-12 py-3.5 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
        style={{ background: "#2D5E3F", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
      >
        {t("prayer_mode.amen", { defaultValue: "Amen" })}
      </motion.button>
    </div>
  );
}

export default function PrayerModePage() {
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  // Offices-only accounts have no access to /api/moments,
  // /api/prayer-requests, /api/prayers-for, or /api/groups — the
  // server middleware (OFFICES_ONLY_BLOCKED_PREFIXES) 403s those
  // routes. Firing those queries unconditionally on prayer-mode
  // mount caused a loading-screen-forever bug for offices-only
  // users hitting the prayer-feed CTA: dataReady never flipped true
  // (the 403s left isSuccess=false), so frozenSlides was never set,
  // and the slideshow stayed parked behind the loading screen.
  // queue=feed only needs feedIntercessionsQuery anyway; gate the
  // four broad queries off for offices-only viewers and treat their
  // "data" as empty in dataReady + closing-detection below.
  const officesOnly = user?.accessTier === "offices-only";

  // Defense in depth: an offices-only viewer who lands on /prayer-mode
  // without a queue param (old push deep-link, manually typed URL,
  // missed-update copy in some non-chooser surface) would hang on the
  // loading screen because the default queue requires four daily
  // queries that 403 for them. Send them back to the chooser, which
  // routes them to /prayer-mode?queue=feed&slug=… instead.
  useEffect(() => {
    if (!officesOnly) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const queue = params.get("queue");
    if (!queue) {
      setLocation("/prayer-chooser");
    }
  }, [officesOnly, setLocation]);

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
  // afterOffice=1 → the user just finished the read-aloud office ("pray
  // along") from the home-screen Begin-prayer flow and is now praying the
  // community intercessions. Run the full prayer walk, then continue into
  // the news + weekly-progress (habit) tail at the end — the same closing
  // sequence the text office's handoff produces.
  const afterOffice = (() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("afterOffice") === "1";
  })();
  // progressOnly=1 → jump straight to the weekly-progress (habit) slide,
  // skipping the prayer rotation and the closing recap. Used when an office
  // was prayed on its own (chosen directly, no community intercessions).
  const progressOnly = (() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("progressOnly") === "1";
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
    // Weekly prayer-feed digest — opened from the Tuesday push/email.
    // Plays the new intercessions on the viewer's subscribed feeds
    // since their previous digest.
    if (v === "feed-digest") return "feed-digest";
    // "{Name} is praying for you" push tap — plays every active prayer
    // someone is currently offering for the viewer, with the tapped one
    // first (via ?focus=<prayerForId>). Before this, the push went to a
    // single-prayer modal on /prayer-list, which surfaced only the one
    // prayer the notification pointed at; if multiple people had started
    // prayers in close succession the rest were buried in the list.
    if (v === "prayers-for-me") return "prayers-for-me";
    // queue=feed + ?slug=… — walks every active intercession of a
    // single feed using the canonical intercession-slide template.
    // Opened from the dashboard FeedPrayerCard's "Begin praying" CTA
    // and from /prayer-feeds/:slug's "Pray the full list" button so
    // both surfaces share the same slideshow look as the daily walk.
    if (v === "feed") return "feed";
    return null;
  })();
  // Feed slug for queue=feed. Drives which feed's intercessions we
  // fetch + how we tag each slide's feed pill.
  const feedSlug = (() => {
    if (typeof window === "undefined") return null;
    const v = new URLSearchParams(window.location.search).get("slug");
    return v && v.length > 0 ? v : null;
  })();
  // Focused row id (any queue, but currently only used by
  // queue=prayers-for-me to lead with the prayer the user just tapped).
  const focusId = (() => {
    if (typeof window === "undefined") return null;
    const v = new URLSearchParams(window.location.search).get("focus");
    const n = v ? parseInt(v, 10) : NaN;
    return Number.isFinite(n) ? n : null;
  })();
  // ?focusMoment=<momentToken> — a community-intercession card on the prayer
  // list opens the walk LED by that intercession, then continues the deck.
  const focusMomentToken = (() => {
    if (typeof window === "undefined") return null;
    const v = new URLSearchParams(window.location.search).get("focusMoment");
    return v && v.trim().length > 0 ? v.trim() : null;
  })();
  // Where the slideshow returns to on finish / X-out. An explicit
  // returnTo (the office handoff) always wins. Otherwise default to
  // the viewer's home: offices-only + parish-only tiers live at
  // /parish, everyone else at /dashboard. Without the tier check an
  // offices-only user finishing a feed walk would land on /dashboard,
  // flash the full-app home + fire its queries, then get bounced to
  // /parish by the router gate.
  const tierHome = (user?.accessTier === "offices-only" || user?.accessTier === "parish-only")
    ? "/parish"
    : "/dashboard";
  const finishHref = returnToHref ?? tierHome;

  const momentsQuery = useQuery<{ moments: Moment[] }>({
    queryKey: ["/api/moments"],
    queryFn: () => apiRequest("GET", "/api/moments"),
    enabled: !!user && !officesOnly,
  });
  const momentsData = momentsQuery.data;

  const prayerRequestsQuery = useQuery<PrayerRequest[]>({
    queryKey: ["/api/prayer-requests"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests"),
    enabled: !!user && !officesOnly,
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

  // Weekly prayer-feed digest — only fetched when opened via
  // queue=feed-digest. Each entry maps to an intercession slide below.
  type FeedDigestEntry = {
    id: number;
    feedId: number;
    feedSlug: string;
    feedTitle: string;
    feedCoverEmoji: string | null;
    title: string;
    body: string | null;
    source: string | null;
    learnMoreUrl: string | null;
    momentToken: string | null;
    createdAt: string;
  };
  const feedDigestQuery = useQuery<{
    sinceDate: string;
    entries: FeedDigestEntry[];
    actionEntries: FeedDigestEntry[];
  }>({
    queryKey: ["/api/me/feed-digest"],
    queryFn: () => apiRequest("GET", "/api/me/feed-digest"),
    enabled: !!user && queueMode === "feed-digest",
    staleTime: 60_000,
  });
  const feedDigestData = feedDigestQuery.data;

  // queue=feed — fetch the target feed + its intercessions. Both
  // endpoints are existing (subscriber-side reads), so no server
  // change needed; we just stitch them together into PrayerSlide[]
  // below. Each intercession is rendered through the same code path
  // as the daily-walk's community intercessions, so the slideshow
  // looks identical to prayer-mode's normal intercession slide.
  type FeedQSlide = {
    id: number;
    intercessionTopic: string | null;
    intercessionFullText: string | null;
    intercessionSource: string | null;
    learnMoreUrl: string | null;
    learnMoreTitle: string | null;
    momentToken: string | null;
    weekPrayCount: number | null;
  };
  const feedMetaQuery = useQuery<{ feed: { slug: string; title: string; coverEmoji: string | null } }>({
    queryKey: [`/api/prayer-feeds/${feedSlug}`],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${feedSlug}`),
    enabled: !!user && queueMode === "feed" && !!feedSlug,
    staleTime: 60_000,
  });
  const feedIntercessionsQuery = useQuery<{ intercessions: FeedQSlide[] }>({
    queryKey: [`/api/prayer-feeds/${feedSlug}/intercessions`],
    queryFn: () => apiRequest("GET", `/api/prayer-feeds/${feedSlug}/intercessions`),
    enabled: !!user && queueMode === "feed" && !!feedSlug,
    staleTime: 30_000,
  });

  // Prayers OTHERS are offering for the viewer — only fetched when
  // opened via queue=prayers-for-me (from the "{Name} is praying for
  // you" push). Same shape as the for-me list on /prayer-list, used
  // here to build one slide per active prayer.
  const prayersForMeQuery = useQuery<PrayerForMe[]>({
    queryKey: ["/api/prayers-for/for-me"],
    queryFn: () => apiRequest("GET", "/api/prayers-for/for-me"),
    enabled: !!user && queueMode === "prayers-for-me",
    staleTime: 60_000,
  });
  const prayersForMeData = prayersForMeQuery.data ?? [];

  const myPrayersForQuery = useQuery<MyActivePrayerFor[]>({
    queryKey: ["/api/prayers-for/mine"],
    queryFn: () => apiRequest("GET", "/api/prayers-for/mine"),
    enabled: !!user && !officesOnly,
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
    enabled: !!user && !officesOnly,
  });
  const circleIntentionsData = circleIntentionsQuery.data;

  // (The legacy /api/prayer-feeds/today query lived here. Prayer feeds
  // are now a flat, ongoing list of intercessions — sharedMomentsTable
  // rows with prayer_feed_id set — which reach the slideshow through
  // /api/moments like any other intercession. The day-scheduled entry
  // system it queried has been retired.)

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
    mutationFn: ({ body, durationDays }: { body: string; durationDays: number }) =>
      apiRequest("POST", "/api/prayer-requests", { body, isAnonymous: false, durationDays }),
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

  // Prayer feeds render as a rotating deck: for each feed, at most
  // three intercessions — the viewer's un-prayed ones first, then
  // newest first. Slides aren't skip-marked, so the deck loops — once
  // everything's prayed it simply replays, with un-prayed always
  // surfacing on top. Non-feed (community) intercessions are unchanged.
  const FEED_DECK_SIZE = 3;
  const deckedIntercessions: Moment[] = (() => {
    const nonFeed = intercessions.filter((m) => m.prayerFeedId == null);
    const byFeed = new Map<number, Moment[]>();
    for (const m of intercessions) {
      if (m.prayerFeedId == null) continue;
      const arr = byFeed.get(m.prayerFeedId);
      if (arr) arr.push(m);
      else byFeed.set(m.prayerFeedId, [m]);
    }
    const deck: Moment[] = [];
    for (const arr of byFeed.values()) {
      const sorted = [...arr].sort((a, b) => {
        const ap = a.myPrayedToday ? 1 : 0;
        const bp = b.myPrayedToday ? 1 : 0;
        if (ap !== bp) return ap - bp;
        return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
      });
      deck.push(...sorted.slice(0, FEED_DECK_SIZE));
    }
    return [...nonFeed, ...deck];
  })();

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
  // (The "ask-request" closing nudge is removed, so we no longer compute a
  // hasActiveOwnRequest gate here — the reciprocity rule is long gone too.)

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

  const slides: PrayerSlide[] = queueMode === "prayers-for-me"
    ? (() => {
        // Build one slide per active "someone is praying for me" entry,
        // newest first (the API already sorts startedAt DESC). If the
        // push tap provided ?focus=<prayerForId>, move that one to the
        // head of the deck so the tapped prayer reads first.
        const built: PrayerSlide[] = prayersForMeData.map((p): PrayerSlide => {
          const then = new Date(p.startedAt);
          const days = Number.isFinite(then.getTime())
            ? Math.floor((Date.now() - then.getTime()) / 86400000)
            : 0;
          const sinceLabel =
            days <= 0 ? "Since today"
            : days === 1 ? "Since yesterday"
            : days < 7 ? `Since ${then.toLocaleDateString(undefined, { weekday: "long" })}`
            : `${days} days`;
          return {
            kind: "prayer-from",
            text: p.prayerName,
            attribution: "",
            fullText: p.prayerText,
            prayerFromId: p.id,
            authorName: p.prayerName,
            authorAvatarUrl: p.prayerAvatarUrl,
            prayingSinceLabel: sinceLabel,
          };
        });
        if (focusId != null) {
          const i = built.findIndex(s => s.prayerFromId === focusId);
          if (i > 0) {
            const [hit] = built.splice(i, 1);
            if (hit) built.unshift(hit);
          }
        }
        return built;
      })()
    : queueMode === "feed-digest"
    ? (feedDigestData?.entries ?? []).map((e): PrayerSlide => ({
        // The Tuesday digest's new intercessions, played as a focused
        // walk. Built as plain intercession slides so the Take-action
        // / Learn-more pill, momentToken-backed Amen, and feed-name
        // chip all reuse the existing intercession render path.
        kind: "intercession",
        text: e.title,
        intention: null,
        fullText: e.body?.trim() || null,
        source: e.source ?? null,
        attribution: "",
        weekPrayCount: 0,
        momentToken: e.momentToken,
        myUserToken: null,
        feedTag: e.feedTitle,
        learnMoreUrl: e.learnMoreUrl?.trim() || null,
      }))
    : queueMode === "feed"
    ? (feedIntercessionsQuery.data?.intercessions ?? []).map((e): PrayerSlide => {
        // queue=feed — every active intercession of one feed.
        // Built with the exact same intercession-slide shape as the
        // default walk (text, fullText, feedTag, momentToken,
        // weekPrayCount) so the slideshow visuals match — the user's
        // direction was "just use the same template."
        const title = e.intercessionTopic || "Intercession";
        return {
          kind: "intercession",
          text: title,
          intention: null,
          fullText: e.intercessionFullText?.trim() || null,
          source: e.intercessionSource ?? null,
          attribution: "",
          weekPrayCount: e.weekPrayCount ?? 0,
          momentToken: e.momentToken,
          myUserToken: null,
          feedTag: feedMetaQuery.data?.feed.title ?? null,
          learnMoreUrl: e.learnMoreUrl?.trim() || null,
          learnMoreTitle: e.learnMoreTitle?.trim() || null,
        };
      })
    : queueMode === "parish-weekly"
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
            learnMoreTitle: (m as { learnMoreTitle?: string | null }).learnMoreTitle?.trim() || null,
            groups,
          }];
        }
        return [];
      })
    : queueMode === "new"
    ? [
        // queue=new is requests-only. The home "N prayer requests
        // waiting" card counts prayer requests (not intercessions), so
        // the slideshow it opens must show exactly those. Community
        // intercessions — prayed or not — live in the main daily
        // slideshow and the parish-weekly card; padding this focused
        // queue with them (especially ones the viewer already prayed)
        // made the tap target disagree with the count.
        ...prayerRequests
          .filter((r) => {
            if (r.isAnswered) return false;
            if (r.closedAt) return false;
            // Skip the viewer's own requests — there's nothing to pray
            // for yourself in the slideshow, and surfacing them was
            // creating a "why am I being asked to pray for me" loop.
            if (r.isOwnRequest === true) return false;
            // "Undone" = not prayed TODAY (the viewer's tz), not "never prayed".
            // So the walk re-includes a request each new day and matches the home
            // card's ✓ (which is myAmenedToday). Was myAmenedEver, which dropped a
            // request from the walk forever after the first amen.
            if (r.myAmenedToday === true) return false;
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
            isAdopted: r.isAdopted === true,
            adoptCount: r.adoptCount ?? 0,
            // Always false in queue-new — these are by definition un-prayed.
            alreadyPrayedToday: false,
          })),
      ]
    : [
    ...deckedIntercessions.map((m) => {
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
        learnMoreTitle: m.learnMoreTitle?.trim() || null,
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
    // (Legacy prayer-feed day-entries used to be spliced in here from
    // /api/prayer-feeds/today. Feeds are now a flat list of
    // intercessions and flow through `deckedIntercessions` above.)
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
        // Keep the viewer's OWN active intentions (the reframed "Prayer") so
        // they show in their own slideshow as "Your prayer" — rendered without
        // the amen / word-of-comfort / pray-along controls (see isOwnPrayer in
        // the slide view). Own LIFE-EVENTS keep their dedicated handling, so
        // skip only those here; own default-kind prayers stay in.
        if (r.isOwnRequest === true && r.kind != null && r.kind !== "request") return false;
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
        isOwnPrayer: r.isOwnRequest === true,
        isAdopted: r.isAdopted === true,
        adoptCount: r.adoptCount ?? 0,
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

  // ?focus=<requestId> — the prayer-hands button on a prayer-list card opens
  // the walk at that request, then continues through the rest of the list.
  if (focusId != null) {
    const fi = slides.findIndex((s) => s.kind === "request" && s.requestId === focusId);
    if (fi > 0) {
      const [hit] = slides.splice(fi, 1);
      if (hit) slides.unshift(hit);
    }
  }
  // ?focusMoment=<token> — lead with the tapped community intercession.
  if (focusMomentToken != null) {
    const fi = slides.findIndex((s) => s.kind === "intercession" && s.momentToken === focusMomentToken);
    if (fi > 0) {
      const [hit] = slides.splice(fi, 1);
      if (hit) slides.unshift(hit);
    }
  }

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

  // The ask-request nudge + the closing pause are the daily
  // slideshow's gentle ending. queue=new is a focused "respond to the
  // N waiting requests" deck — the home card counts exactly those
  // requests, so the deck ends on the last one and goes straight to
  // the closing summary, with no trailing nudge or breath. Same shape
  // for queue=prayers-for-me (notification → see who's praying for you,
  // not a moment to make a new ask).
  if (queueMode !== "new" && queueMode !== "prayers-for-me" && queueMode !== "feed") {
    // The "Add a prayer" closing nudge slide (kind: "ask-request") is REMOVED
    // per request — the office slideshow no longer ends on an empty add-a-prayer
    // button. The viewer's OWN active prayers render INLINE in the request block
    // above (as "Your prayer" slides), so they still appear in the slideshow.

    // Pause slide — the final slide before the closing summary. A
    // meditative breath: the user is invited to bring anything else
    // on their heart to prayer that the slideshow couldn't know
    // about. Keeping it inside the slides array (rather than as its
    // own phase) means it inherits the same swipe/Amen advance and
    // persists in slideshow-progress for partial-completion math.
    slides.push({
      kind: "pause",
      text: "",
      attribution: "",
    });
  }

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
  // Focused-queue dataReady is scoped to the queries that queue
  // actually reads. We can't just AND all six together unconditionally:
  // offices-only accounts 403 on /moments, /prayer-requests,
  // /prayers-for/mine, and /groups/me/circle-intentions, so those four
  // never reach isSuccess — and a queue=feed walker landing here from
  // the dashboard FeedPrayerCard would hang on the loading screen
  // forever even though all the data the feed queue NEEDS has long
  // since arrived.
  const dataReady = (() => {
    if (queueMode === "feed") {
      return feedIntercessionsQuery.isSuccess && feedMetaQuery.isSuccess;
    }
    if (queueMode === "prayers-for-me") {
      return prayersForMeQuery.isSuccess;
    }
    if (queueMode === "feed-digest") {
      return feedDigestQuery.isSuccess;
    }
    // Default / queue=new / queue=parish-weekly all build slides off
    // the daily queries (intercessions, requests, prayers-for, circle
    // intentions). Parish-weekly additionally needs its own list.
    return (
      momentsQuery.isSuccess &&
      prayerRequestsQuery.isSuccess &&
      myPrayersForQuery.isSuccess &&
      circleIntentionsQuery.isSuccess &&
      (queueMode !== "parish-weekly" || parishWeeklyQuery.isSuccess)
    );
  })();

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
    // queue=feed with ?focus={intercessionId}: opens the slideshow
    // directly on the tapped intercession (e.g. a Prayer List card
    // on the offices-only home routes here so an offices-only viewer
    // can pray a specific climate intercession without us routing
    // them to /moments/:id, which 403s for their tier). We match the
    // focusId against feedIntercessionsQuery.data.intercessions and
    // use its array index — the slide-build step preserves order, so
    // index N in intercessions == slide N in the deck for queue=feed.
    if (queueMode === "feed" && focusId !== null) {
      const list = feedIntercessionsQuery.data?.intercessions ?? [];
      const matchIdx = list.findIndex(e => e.id === focusId);
      if (matchIdx >= 0 && matchIdx < captured.length) {
        resumeAt = matchIdx;
      }
    }
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
    // A tapped prayer-list card (?focus=ID / ?focusMoment=token) always opens ON
    // that item — even if it's already been prayed today — rather than skipping
    // to the first un-prayed slide or jumping straight to the closing summary.
    // The focused slide was moved to the front of the deck above, so start at 0.
    const focusedLeads =
      (focusId != null && captured[0]?.kind === "request" && captured[0]?.requestId === focusId) ||
      (focusMomentToken != null && captured[0]?.kind === "intercession" && captured[0]?.momentToken === focusMomentToken);
    if (!focusedLeads && !seamlessFlow && !resetFlow && queueMode !== "new" && queueMode !== "parish-weekly" && queueMode !== "feed-digest" && queueMode !== "prayers-for-me" && queueMode !== "feed") {
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
  const [phase, setPhase] = useState<"prayer" | "closing" | "news" | "habit" | "blessing">(() => progressOnly ? "habit" : closingOnly ? "closing" : "prayer");
  // A real prayer close ends on the blessing send-off (the universal final
  // beat). Only "just viewing my rhythm" (?progressOnly=1) skips it and goes
  // straight home.
  const shouldBless = !progressOnly;
  // New stories from followed news sources, if any — gates the optional
  // "As you go" news slide between the closing summary and the habit
  // rhythm screen. Empty (and free) for anyone who follows nothing.
  const unseenNews = useUnseenNews();
  // Daily reflections (CAC / FDD / SSJE) are no longer shown inside the
  // office slideshow — they live only on the home screen now. The office
  // close goes straight to the celebration summary.
  const showReflectionGate = false;
  // Morning office/devotion send-off. The recap ("who you prayed with this
  // week") is replaced on the MORNING close by a "what's next → today's
  // reflection" hand-off when the user keeps a reflection ("newsletter").
  // If they keep no reflection, we don't park them on the recap either —
  // the close just fades smoothly back to the home screen (see the effect
  // below). Evening closes are unaffected and still show the recap.
  const reflectionSource = useEffectiveReflectionSource(closingIsEvening ? "evening" : "morning");
  const isMorningClose = (closingOnly || afterOffice) && !closingIsEvening;
  const endOnReflection = isMorningClose && reflectionSource !== "none";
  // The "Add prayer / Done" closing card (ClosingSlide) is REMOVED for the plain
  // daily prayer-list walk — being there already means you prayed, so an empty
  // add-a-prayer card to end on made no sense. Those closes now fade to the
  // blessing send-off and home, reusing this flag. Office finishes keep their
  // recap / news / reminder closing slide; reflection closes keep WhatsNext.
  const isOfficeClose = closingOnly || afterOffice || officesOnly;
  const fadeHomeNoNewsletter =
    (isMorningClose && reflectionSource === "none") ||
    (!isOfficeClose && !endOnReflection && !showReflectionGate);
  // Contemplation timer overlay — opened from the pause slide's
  // quick-start card. Rendered at the page root below so it covers the
  // whole screen regardless of which slide is showing. startMinutes is
  // set by the 5/10/20 quick buttons (begin immediately); undefined
  // from "Begin contemplation" shows the picker.
  const [contemplationOpen, setContemplationOpen] = useState(false);
  const [contemplationStartMinutes, setContemplationStartMinutes] = useState<number | undefined>(undefined);
  // Cobreathe overlay — also opened from the pause slide, beside the timer.
  const [cobreatheOpen, setCobreatheOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  // Starts false so the FIRST slide fades up via the 0.22s content transition,
  // same as every later slide (advance() drives the false→true cycle). The
  // visible-gate effect raises it once the slide is ready. Initializing it true
  // made the first intercession pop in at full opacity (no fade).
  const [slideVisible, setSlideVisible] = useState(false);
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
    // Functional setPhase: only transition "prayer" → "closing". Once the
    // user advances past "closing" (to "news", or out via Done), a background
    // query refetch (coPrayers, streak, etc.) re-fires this effect — without
    // the guard, it'd reset phase back to "closing" and flash them backward.
    const toClosing = () => setPhase((p) => (p === "prayer" ? "closing" : p));
    if (closingOnly) {
      toClosing();
      return;
    }
    // Offices-only viewers have momentsData permanently undefined
    // (the underlying query is disabled to avoid a 403), so we
    // can't gate on it for them — fall back to dataReady, which
    // for queue=feed reflects feedIntercessionsQuery alone.
    const queriesSettled = officesOnly
      ? dataReady
      : !!(momentsData && prayerRequests && myPrayersFor);
    if (displaySlides.length === 0 && queriesSettled) {
      if (seamlessFlow || queueMode === "feed") {
        // Feed walks (and seamless office handoffs) never show the
        // friends/community closing recap — if the deck is empty,
        // just return to where the user came from.
        setLocation(finishHref);
      } else {
        toClosing();
      }
    }
  }, [displaySlides.length, momentsData, prayerRequests, myPrayersFor, officesOnly, dataReady, seamlessFlow, queueMode, closingOnly, finishHref, setLocation]);

  // Focused-queue gating-query failure → bail home instead of spinning
  // forever. dataReady only flips on isSuccess, so if the queue's source
  // query ERRORS (e.g. queue=feed for a feed that was deleted, paused,
  // unsubscribed, or made private since the link was created — its
  // /prayer-feeds/:slug fetch 404s), dataReady never becomes true, the
  // frozenSlides snapshot is never taken, and the user is stuck on the
  // loading spinner. Redirect them back to where they came from. Only
  // applies to the focused queues whose deck depends on a single source
  // query; the default walk degrades to an empty closing recap instead.
  const focusedQueueErrored =
    (queueMode === "feed" && (feedMetaQuery.isError || feedIntercessionsQuery.isError)) ||
    (queueMode === "feed-digest" && feedDigestQuery.isError) ||
    (queueMode === "prayers-for-me" && prayersForMeQuery.isError);
  useEffect(() => {
    if (focusedQueueErrored) setLocation(finishHref);
  }, [focusedQueueErrored, finishHref, setLocation]);

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
    return () => {
      body.style.overflow = prevBodyOverflow;
      body.style.backgroundColor = prevBodyBg;
      html.style.backgroundColor = prevHtmlBg;
      meta?.setAttribute("content", prevMeta);
      // Hand the native status bar back to the app green on exit.
      setNativeStatusBarColor(APP_STATUS_BAR);
    };
  }, []);

  // Fade the content in once it's actually ready (after the loading screen) —
  // not 30ms after mount, which made the first slide POP in over the spinner
  // instead of fading. Non-prayer phases (closing / blessing / etc.) have no
  // slide list to wait on, so they fade in straight away. (gate + fade)
  useEffect(() => {
    if (phase !== "prayer" || (frozenSlides && index >= 0)) {
      const t = setTimeout(() => { setVisible(true); setSlideVisible(true); }, 30);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase, frozenSlides, index]);

  // Keep the status bar (native iOS strip + web theme-color + the body/html
  // ground) matched to the CURRENT phase's background — the closing slide is
  // the warmer #11291C, every other phase is #0C1F12 — so the top of the
  // screen never reads as a different color than the slide under it.
  useEffect(() => {
    const phaseBg = phase === "closing" || phase === "blessing" ? "#11291C" : "#0C1F12";
    document.body.style.backgroundColor = phaseBg;
    document.documentElement.style.backgroundColor = phaseBg;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", phaseBg);
    setNativeStatusBarColor(phaseBg);
  }, [phase]);

  // Fade out + navigate to finishHref without showing the closing
  // summary. Used by queue=feed walks: a feed's "Pray the full list"
  // is about carrying causes, not friends, so the "you prayed for N
  // people this week" recap doesn't belong at the end. Per-slide amen
  // POSTs already logged every check-in during the walk, so there's
  // nothing left to record here — we just exit. Mirrors the fade
  // timing handleDone uses so the transition feels the same.
  const exitToFinish = () => {
    setSlideVisible(false);
    setTimeout(() => {
      setVisible(false);
      setTimeout(() => setLocation(finishHref), 500);
    }, 300);
  };

  // Morning close with no daily reflection ("newsletter"): skip the community
  // recap entirely and fade smoothly back to the home screen. Fires once when
  // we land on the closing phase for that case (reflection-on closes render the
  // WhatsNextSlide instead; evening closes keep the recap).
  const fadedHomeRef = useRef(false);
  useEffect(() => {
    if (phase === "closing" && fadeHomeNoNewsletter && !fadedHomeRef.current) {
      fadedHomeRef.current = true;
      // No reflection hand-off to show, but don't end cold — go to the blessing
      // send-off (its Amen fades home). Everyone gets a send-off.
      setPhase("blessing");
    }
  }, [phase, fadeHomeNoNewsletter]);

  // The old "Add prayer / Done" closing card (ClosingSlide) is GONE everywhere —
  // an empty add-a-prayer slide to end a slideshow on made no sense. The office /
  // offices-only closes that used to render it now auto-route past it: if there's
  // unseen "As you go" news to hand off to we still show that; otherwise we run
  // the normal finish (handleDone — logs check-ins, marks completed, send-off).
  // Mirrors fadeHomeNoNewsletter, but keeps the news handoff + completion logging.
  const autoClosedRef = useRef(false);

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
        // Thanksgiving + final blessing. Feed walks skip the
        // friends/community recap too. Otherwise show the streak /
        // "you've prayed for X people" closing as usual.
        if (seamlessFlow) {
          setLocation(finishHref);
        } else if (queueMode === "feed") {
          exitToFinish();
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
    // Back from the FIRST slide leaves the office entirely → home screen.
    if (index <= 0) { handleExit(); return; }
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
      // Optimistically flip myAmenedToday / myAmenedEver on the cached
      // prayer-list right now, before the network call resolves. The home
      // check then shows the instant the user returns — even on a slow or
      // offline connection, and even if the subsequent refetch is served
      // from the persisted (pre-amen) snapshot first. Without this the list
      // could keep showing the un-checked state until a fresh fetch landed,
      // which reads as "I held Amen but it never checked."
      queryClient.setQueryData<any[]>(["/api/prayer-requests"], (old) =>
        Array.isArray(old)
          ? old.map((r) =>
              r && r.id === rid ? { ...r, myAmenedToday: true, myAmenedEver: true } : r,
            )
          : old,
      );
      amenWithLocation(rid)
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
          // The POST failed, so the optimistic myAmenedToday:true above is now
          // a lie the server never recorded. Reconcile the list against the
          // server so the card doesn't show a phantom "Prayed today" ✓ (and the
          // user can re-amen) instead of swallowing the failure outright.
          queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
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
            // up the moment the viewer lands there. The feed-subscribed
            // query backs the dashboard FeedPrayerCard's prayedToday /
            // New-Prayers state, so it has to refresh too when the
            // amen lands on a feed-scoped intercession.
            queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
            queryClient.invalidateQueries({ queryKey: ["/api/prayer-feeds/subscribed"] });
          })
          .catch(() => {
            /* swallow — best-effort, handleDone will retry if still pending */
          });
      }
    }
    // (Legacy feed day-entry pray-logging was here — feed intercessions
    // are now sharedMomentsTable rows and log through the moment path
    // above like any other intercession.)
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
        } else if (queueMode === "feed") {
          // Feed walks skip the friends/community closing recap.
          exitToFinish();
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

  const handleDone = async (opts?: { skipBless?: boolean }) => {
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
    await Promise.allSettled(
      toLog.map((s) =>
        s.myUserToken
          ? apiRequest("POST", `/api/moment/${s.momentToken}/${s.myUserToken}/post`, {
              isCheckin: true,
            })
          : apiRequest("POST", `/api/moment/${s.momentToken}/amen`, {}),
      ),
    );
    queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
    // Feed-scoped intercessions (queue=feed walk) back the dashboard
    // FeedPrayerCard — refresh that query so it flips to "Completed"
    // and clears the "New Prayers" pulse when the user lands home.
    queryClient.invalidateQueries({ queryKey: ["/api/prayer-feeds/subscribed"] });

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
      // For a real prayer close, hand off to the blessing send-off rather than
      // dropping straight home — the blessing's own Amen fades the rest of the
      // way out (see exitToFinish). SKIP it when the closing slide was ALREADY
      // the "Prayer completed" hero (the morning-reflection path) — the blessing
      // phase now renders that same hero, so blessing-after-hero would show it
      // twice. Those callers pass skipBless and exit straight home.
      if (shouldBless && !opts?.skipBless) {
        setPhase("blessing");
        setSlideVisible(true);
        return;
      }
      setVisible(false);
      setTimeout(() => setLocation(finishHref), 500);
    }, 300);
  };

  // Auto-route past the removed "Add prayer / Done" closing card. When we land on
  // the closing phase for the office / offices-only paths (the only ones that
  // still hit this branch — the rest fade via fadeHomeNoNewsletter), skip the
  // empty slide: hand off to the "As you go" news slide if there's unseen news,
  // otherwise run the normal finish. Same routing the slide's Done used to do.
  useEffect(() => {
    if (
      phase === "closing" &&
      !showReflectionGate &&
      !endOnReflection &&
      !fadeHomeNoNewsletter &&
      !autoClosedRef.current
    ) {
      autoClosedRef.current = true;
      if ((closingOnly || officesOnly || afterOffice) && unseenNews.hasUnseen) {
        setPhase("news");
      } else {
        void handleDone();
      }
    }
  }, [phase, showReflectionGate, endOnReflection, fadeHomeNoNewsletter, closingOnly, officesOnly, afterOffice, unseenNews.hasUnseen]);

  // When offices-only users finish a prayer-feed walk, also stamp
  // the daily office-completed localStorage flag for the current
  // half-day (morning vs evening, threshold = noon local). The
  // HabitSlide reads those flags from localStorage in addition to
  // the server-side prayer_sessions rows, so writing them here makes
  // the feed walk count toward the user's daily rhythm grid. Without
  // this the rhythm shows blank pillars for offices-only viewers
  // since they never run a Daily Office, even though they DID pray.
  useEffect(() => {
    if (phase !== "closing") return;
    if (!officesOnly) return;
    try {
      const now = new Date();
      const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const side = now.getHours() < 12 ? "morning" : "evening";
      // Reuse the office-completed flag the BCP screen writes — same
      // key shape, so HabitSlide picks it up without a code change.
      // We pick the "devotion" variant rather than the full office
      // variant since a feed walk is closer in length / shape to a
      // Daily Devotion than a Morning/Evening Prayer.
      const key = side === "morning"
        ? `phoebe:office-completed:morning-devotion:${dateKey}`
        : `phoebe:office-completed:early-evening-devotion:${dateKey}`;
      localStorage.setItem(key, "1");
    } catch {
      /* private mode / quota — non-fatal */
    }
  }, [phase, officesOnly]);

  // While auth is still resolving, hold a dark field (NOT a blank white frame)
  // so arriving on the web fades dark → dark into the loading screen and the
  // first slide, instead of flashing white first.
  if (authLoading) return <div style={{ background: "#0C1F12", minHeight: "100dvh" }} />;
  if (!user) return null;

  // Hold a calm loading screen until the slide list is captured into
  // `frozenSlides` AND the resume index is computed. The snapshot is
  // taken when `dataReady` first flips true; after that, background
  // refetches (mount-time invalidate, focus refetch, …) flip
  // `isFetching` true again, but we keep displaying the snapshot
  // rather than reverting to the spinner. Without this, the user
  // saw the first slide flash for a render, get replaced by the
  // spinner during the refetch, then come back identical.
  if (!frozenSlides || index < 0) {
    // Seamless intercessions handoff from the office: the office held its
    // "Intercessions" title and prefetched the data, so don't flash a loading
    // orb here — just hold a plain dark field (matching the office) until the
    // first intercession is ready and fades up. No "loading circle."
    if (seamlessFlow) {
      return <div style={{ background: "#0C1F12", minHeight: "100dvh" }} />;
    }
    // A calm "gathering" screen while the community intercession slideshow is
    // assembled — a slow breathing glow + a reverent line, over the same
    // drifting green backdrop the prayer slides use. Replaces the old bare
    // spinner so the wait feels like the start of prayer, not a buffering app.
    return (
      <div
        style={{
          background: "#0C1F12",
          minHeight: "100dvh",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <AnimatedBackground base="#0C1F12" variant="subtle" fadeTop />
        <div
          className="flex flex-col items-center"
          style={{ position: "relative", zIndex: 1, padding: "0 32px" }}
        >
          <div
            className="intercession-loader-orb"
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 50% 38%, rgba(150,205,170,0.55) 0%, rgba(46,107,64,0.35) 55%, rgba(46,107,64,0.08) 100%)",
              boxShadow: "0 0 36px rgba(46,107,64,0.55), inset 0 0 18px rgba(140,205,160,0.35)",
            }}
          />
          <p
            className="mt-7 text-center"
            style={{
              color: "rgba(182,210,188,0.82)",
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontStyle: "italic",
              fontSize: 16,
              lineHeight: 1.5,
              textShadow: "0 2px 16px rgba(8,30,18,0.6)",
              maxWidth: 320,
            }}
          >
            {t("prayer_mode.gathering", { defaultValue: "Gathering the prayers of your community…" })}
          </p>
        </div>
      </div>
    );
  }

  const slide = displaySlides[index];
  // A DIFFERENT calm landscape rests behind each office slide/section (keyed by
  // the slide index, from the "life on earth" library), under a dark wash so the
  // prayer text stays legible. On the prayer slides — closing/blessing keep their look.
  const officePhoto = LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[index % LEAF_PHOTOS.length] : null;

  return (
    <div
      // Closing-slide background pulses gently to mark "you arrived" —
      // a slow color breathe between the base #0C1F12 and a softly
      // brighter green, ~3.2s per cycle, infinite while the closing
      // slide is up. The pulse is implemented as a CSS animation on
      // the .closing-pulse class (see index.css). Other phases keep
      // the static background.
      onTouchStart={handleSwipeTouchStart}
      onTouchEnd={handleSwipeTouchEnd}
      style={{
        background: "#0C1F12",
        minHeight: "100dvh",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.5s ease",
        position: "relative",
        isolation: "isolate",
      }}
    >
      {/* Office backdrop. On the prayer slides: a daily landscape photo under a
          strong dark wash (legible text), in place of the drifting gradient.
          The closing slide runs its own pulse; other phases keep the gradient.
          Both layers sit at z-index:-1 behind the content (host is isolated). */}
      {officePhoto ? (
        <>
          <OfficeBackdropPhoto key={officePhoto} src={officePhoto} slideVisible={slideVisible} />
          <div
            aria-hidden
            style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,22,15,0.62) 0%, rgba(8,22,15,0.80) 52%, rgba(8,22,15,0.90) 100%)" }}
          />
        </>
      ) : (
        <AnimatedBackground base="#0C1F12" variant="subtle" fadeTop />
      )}
      {/* Exit button — lands on the dashboard so leaving prayer is a clean
          return to the home view rather than dropping the user back into
          the prayer-list they were just trying to step away from. */}
      <button
        onClick={handleExit}
        aria-label="Exit prayer mode"
        className="absolute right-6 w-10 h-10 flex items-center justify-center rounded-full z-10 text-xl"
        style={{ top: "calc(var(--safe-top) + 12px)", color: "rgba(200,212,192,0.4)", background: "rgba(200,212,192,0.06)" }}
      >
        ×
      </button>

      {/* Content — vertically CENTERED in the viewport (so a short prayer
          request / intercession sits in the middle of the screen rather than
          clinging to the top with a big empty gap below). The asymmetric
          padding biases the centring upward: the larger paddingBottom reserves
          the bottom band for the fixed "Not today" link + slide counter, so the
          content centres within the area ABOVE them and a taller slide's Amen
          still sits clear of that link. */}
      <div
        className="flex flex-col items-center text-center px-6 w-full"
        style={{
          maxWidth: 560,
          margin: "0 auto",
          minHeight: "100dvh",
          justifyContent: "center",
          paddingTop: "clamp(24px, 6dvh, 72px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 160px)",
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
              onAskSubmit={(body, durationDays) => {
                createRequestMutation.mutate({ body, durationDays }, { onSuccess: () => advance() });
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
              onStartContemplation={(minutes) => {
                setContemplationStartMinutes(minutes);
                setContemplationOpen(true);
              }}
              onStartCobreathe={() => { primeAudio(); setCobreatheOpen(true); }}
            />
          </div>
        )}

        {/* Closing summary. For offices-only viewers we keep this
            slide visible but its copy adapts in ClosingSlide itself
            (no "friends" language when there are no co-prayers).
            Done advances to the HabitSlide for both closingOnly (the
            office-handoff path) AND offices-only feed walks — that's
            where the user's morning/evening rhythm grid lives, and
            we want feed prayer to feed into it. */}
        {phase === "closing" && endOnReflection && (
          <PrayerCompletedSlide
            reflectionSource={reflectionSource as Exclude<ReflectionSource, "none">}
            // This closing slide IS the "Prayer completed" hero, so skip the
            // blessing phase (which renders the same hero) — exit straight home.
            onDone={() => setPhase("news")}
            visible={slideVisible}
          />
        )}
        {/* The "Add prayer / Done" ClosingSlide was removed everywhere — this
            office / offices-only branch now auto-routes (see the autoClosedRef
            effect above): unseen news → the news slide, else the normal finish. */}
        {/* Optional "As you go" news slide — only when a followed source
            has new stories (unseenNews.hasUnseen gates the transition into
            this phase from the closing slide). Continue marks seen + lands
            on the habit rhythm screen. */}
        {phase === "news" && (
          <OfficeCloseEventsSlide onDone={() => handleDone({ skipBless: true })} visible={slideVisible} />
        )}
        {phase === "habit" && (
          <HabitSlide onDone={handleDone} visible={slideVisible} isEvening={closingIsEvening} coPrayers={coPrayersData?.people ?? []} />
        )}
        {phase === "blessing" && (
          <PrayerCompletedSlide onDone={exitToFinish} visible={slideVisible} />
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
            {t("prayer_mode.not_today")}
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

      {/* Contemplation timer — full-screen overlay launched from the
          pause slide's quick-start card. */}
      <ContemplationTimer
        open={contemplationOpen}
        startMinutes={contemplationStartMinutes}
        onClose={(result) => {
          // A completed sit proceeds to the next slide. Hide the slide
          // UNDERNEATH first so the office doesn't flash the old (pause) slide
          // as the overlay unmounts — then advance(), which fades the next slide
          // up smoothly. Backing out of the picker just closes the overlay.
          if (result?.completed) setSlideVisible(false);
          setContemplationOpen(false);
          setContemplationStartMinutes(undefined);
          if (result?.completed) advance();
        }}
      />

      {/* Cobreathe — full-screen overlay launched from the pause slide,
          beside the contemplation timer. A finished breath advances the
          slideshow like a completed sit.

          The pause slide is the LAST slide, so advancing always hits the
          end-of-deck branch. Two shapes:
            • In-app close (setPhase("closing")) — the view stays mounted, so
              we pre-advance behind the opaque summary on onSummary and let
              Continue fade onto the ready closing slide (the original design).
            • Seamless office hand-off (setLocation → the office's closing) —
              a ROUTE CHANGE that unmounts this view AND the summary with it.
              Running it on onSummary made the summary flash and vanish into
              the office's last screen. Defer it to Continue, and close
              instantly so we navigate straight from the stable summary. */}
      <CobreatheOverlay
        open={cobreatheOpen}
        // Advance the office UNDERNEATH the moment the summary appears (in BOTH
        // flows) so the summary then fades out onto the next slide — the Lord's
        // Prayer — instead of flashing the contemplation picker slide behind it.
        // onSummary fires only on a COMPLETED breath; cancelling (✕) calls
        // onClose with no summary, so it just returns to the pause slide.
        onSummary={() => advance()}
        onClose={() => setCobreatheOpen(false)}
      />
    </div>
  );
}
