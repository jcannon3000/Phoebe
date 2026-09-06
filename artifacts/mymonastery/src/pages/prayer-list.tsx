import { useEffect, useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, X as CloseIcon, MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { usePilotMode } from "@/hooks/usePilotMode";
import { Layout } from "@/components/layout";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { FROST } from "@/lib/frost";
import { rhythmGradientRgb } from "@/components/DailyProgressBody";
import { apiRequest } from "@/lib/queryClient";
import { PrayerKindPill } from "@/components/prayer-kind-pill";
import { usePrayerSession } from "@/hooks/usePrayerSession";
import { markPracticeDoneToday } from "@/lib/practiceCompletion";
import { isOnline } from "@/lib/offline";

function todayLocalISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

// ─── Types ────────────────────────────────────────────────────────────────

type ReleasedRequest = {
  id: number;
  body: string;
  createdAt: string;
  expiresAt: string | null;
  amenCount: number;
};

type Moment = {
  id: number;
  name: string;
  templateType: string | null;
  intention: string;
  intercessionTopic?: string | null;
  intercessionFullText?: string | null;
  intercessionSource?: string | null;
  members: Array<{ name: string; email: string }>;
  todayPostCount: number;
  windowOpen: boolean;
  myUserToken: string | null;
  momentToken: string | null;
  commitmentSessionsGoal?: number | null;
  commitmentSessionsLogged?: number | null;
  computedSessionsLogged?: number;
  goalDays?: number | null;
  myLastPostAt?: string | null;
  // Per-viewer: have I prayed (logged) this intercession today? Drives the ✓.
  myPrayedToday?: boolean;
  // Group scoping — primary community + any extras it's shared with.
  // Rendered under the intercession title on the prayer list since
  // practices are group-based rather than people-based now.
  group?: { id: number; name: string; slug: string; emoji: string | null } | null;
  additionalGroups?: Array<{ id: number; name: string; slug: string; emoji: string | null }>;
  // Prayer-feed attachment. When non-null this moment is owned by a
  // prayer feed (e.g. "For Oak Flat" under Phoebe Climate). Those
  // moments are surfaced on the prayer-list page via the FeedCard
  // collapse row ("Phoebe Climate — 2 intercessions today"), so we
  // exclude them from the per-intercession card list below to avoid
  // double-rendering the same prayer in the same section.
  prayerFeedId?: number | null;
};

type PrayerRequest = {
  id: number;
  body: string;
  ownerId: number;
  ownerName: string | null;
  ownerAvatarUrl: string | null;
  isOwnRequest: boolean;
  isAnswered: boolean;
  isAnonymous: boolean;
  closedAt: string | null;
  expiresAt: string | null;
  nearingExpiry: boolean;
  needsRenewal: boolean;
  isCorrespondent?: boolean;
  words: Array<{ authorName: string; content: string; createdAt?: string | null }>;
  myWord: string | null;
  createdAt: string;
  amenCountToday?: number | null;
  amenCountTotal?: number | null;
  // Distinct people who've prayed this request. Drives the
  // "Prayed by N people" line (vs amenCountTotal's per-user-per-day).
  amenPeopleCount?: number | null;
  // Author's framing — drives the optional pill in the card header.
  kind?: string | null;
  // Per-viewer: have I prayed (amened) this request today? Drives the ✓.
  myAmenedToday?: boolean;
  // Recent faces of who prayed for THIS request (own-card face stack).
  amenFaces?: Array<{ name?: string | null; avatarUrl?: string | null }>;
};

// Discriminated union for the detail popup — one modal component switches on
// `kind`. Keeps state simple (`detail` is just one field on the page) and
// lets the close-button + backdrop chrome live in one place.
type DetailTarget =
  | { kind: "request"; id: number };

// ─── Helpers ──────────────────────────────────────────────────────────────

function stripEmoji(s: string): string {
  // eslint-disable-next-line no-misleading-character-class
  return s.replace(/[\s\u200d]*(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Emoji_Component})+$/u, "").trim();
}

// Initials fallback for an avatar circle. Used by the "for-me" card when
// the prayer-er has no avatar URL.
function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ─── Chrome: SectionHeader + BarCard ──────────────────────────────────────
//
// Mirrors the dashboard's section/card look so the prayer-list reads as a
// sibling of the home screen — same Space-Grotesk heading, same hairline
// divider trailing off to the right, same left-accent-bar card shape.

// A section shell renders a clickable section header (tap to focus that
// category — which collapses the page down to just this section plus a
// back button). When unfocused, the card list is clamped to ~3.5 cards
// tall with a fade-out gradient so overflow is obviously scrollable. When
// focused, the clamp + fade lift and every card is shown at full height.
type SectionKey = "intercessions" | "requests";

// Backlog row from GET /api/moments/past-intercessions — community
// intercessions the viewer admins that have been retired (state =
// "archived" on the server). Shape is the minimal subset the past-
// intercession card needs to render — see api-server/src/routes/
// moments.ts for the source of truth.
type PastIntercession = {
  id: number;
  name: string;
  intention: string;
  intercessionTopic: string | null;
  intercessionFullText: string | null;
  intercessionSource: string | null;
  learnMoreUrl: string | null;
  customEmoji: string | null;
  createdAt: string;
  group: { id: number; name: string; slug: string } | null;
  feed: { id: number; title: string; slug: string } | null;
};

function SectionShell({
  id,
  label,
  count,
  focused,
  onFocus,
  maxRows = 3.5,
  children,
}: {
  id: SectionKey;
  label: string;
  count: number;
  focused: SectionKey | null;
  onFocus: (id: SectionKey) => void;
  /** Rows to show before the clamp + fade in the collapsed view. Defaults to
   *  3.5 (a peek); the Requests + One-to-ones sections pass 7. */
  maxRows?: number;
  children: React.ReactNode;
}) {
  const isFocused = focused === id;
  const collapsed = focused === null;
  // Clamp to ~maxRows card rows. Cards are ≈64px + 8px gap (~74px/row); the
  // trailing fade signals "more below, scroll." We pad the bottom so the fade
  // gradient doesn't sit on top of the last visible card's text.
  const CLAMP = Math.round(maxRows * 74);
  return (
    <section>
      <button
        type="button"
        onClick={() => !isFocused && onFocus(id)}
        className="flex items-center gap-3 mb-2 mt-6 w-full text-left"
        style={{ cursor: isFocused ? "default" : "pointer" }}
      >
        <h2
          className="text-lg font-semibold"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {label}
        </h2>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
        {collapsed && count > maxRows && (
          <span
            className="text-[10px] font-semibold uppercase"
            style={{ color: "rgba(143,175,150,0.55)", letterSpacing: "0.12em" }}
          >
            View all
          </span>
        )}
      </button>
      <div style={{ position: "relative" }}>
        <div
          className="space-y-2"
          style={
            collapsed
              ? {
                  maxHeight: CLAMP,
                  overflowY: "auto",
                  WebkitOverflowScrolling: "touch",
                  paddingBottom: 8,
                }
              : undefined
          }
        >
          {children}
        </div>
        {/* Bottom fade — matches the dashboard's home-section pattern:
            64px tall, transparent→page background. The prior 24px @ 0.45
            was too subtle to read as "more below" on a long list. */}
        {collapsed && count > maxRows && (
          <div
            className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, transparent 20%, rgba(9,26,16,0.72))" }}
          />
        )}
      </div>
    </section>
  );
}

// A single reusable card shell: left accent bar + padded body. `barColor`
// can be tuned per card state (e.g. a warm amber for "Pray now"). Either
// a Link or a button depending on what the card does on tap.
function BarCard({
  onClick,
  href,
  pulse,
  accent = "#2E6B40",
  bg = "rgba(9,26,16, 0.297)",
  border,
  children,
}: {
  onClick?: () => void;
  href?: string;
  pulse?: boolean;
  accent?: string;
  bg?: string;
  /** Override the default border color — used by past-prayer cards to
   *  fade them visually from active ones. */
  border?: string;
  children: React.ReactNode;
}) {
  const inner = (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative flex rounded-xl overflow-hidden transition-shadow ${pulse ? "animate-turn-pulse-practices" : ""}`}
      style={{
        background: bg,
        backdropFilter: "blur(11.34px)",
        WebkitBackdropFilter: "blur(11.34px)",
        border: `1px solid ${border ?? (pulse ? "rgba(46,107,64,0.15)" : "rgba(46,107,64,0.28)")}`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        cursor: onClick || href ? "pointer" : "default",
      }}
    >
      <div
        className={`w-1 flex-shrink-0 ${pulse ? "animate-bar-pulse-practices" : ""}`}
        style={{ background: pulse ? undefined : accent }}
      />
      <div className="flex-1 px-4 pt-3 pb-3">{children}</div>
    </motion.div>
  );
  if (href) return <Link href={href} className="block">{inner}</Link>;
  return (
    <button type="button" onClick={onClick} className="block w-full text-left">
      {inner}
    </button>
  );
}


// ─── Card variants ────────────────────────────────────────────────────────

function IntercessionCard({ moment, viewerEmail }: { moment: Moment; viewerEmail: string }) {
  // Practices are group-scoped now — show the community the
  // intercession is held in, not the individual members. If the
  // moment is in multiple groups, list the primary first then a
  // "+N more" tail. viewerEmail is accepted for API compatibility
  // but no longer used (we stopped filtering the member list here).
  void viewerEmail;
  // A community intercession reads like a prayer request: the community's emoji
  // as the avatar, "From {community}" as the eyebrow, the prayer as the body,
  // and a 🙏/✓ for whether you've prayed it today. Tapping opens the prayer
  // slideshow led by THIS intercession — never the moment detail page.
  const allGroups = [
    ...(moment.group ? [moment.group] : []),
    ...(moment.additionalGroups ?? []),
  ];
  const communityName =
    allGroups.length === 0 ? "Community"
    : allGroups.length === 1 ? allGroups[0].name
    : `${allGroups[0].name} +${allGroups.length - 1}`;
  const emoji = allGroups[0]?.emoji ?? "🙏🏽";
  const body = moment.intercessionFullText?.trim() || stripEmoji(moment.intercessionTopic || moment.intention || moment.name);
  const prayed = moment.myPrayedToday === true;
  return (
    <BarCard
      href={moment.momentToken ? `/prayer-mode?focusMoment=${encodeURIComponent(moment.momentToken)}` : `/moments/${moment.id}`}
      accent="#8FAF96"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0"
          style={{ background: "#1A4A2E", border: "1px solid rgba(46,107,64,0.3)" }}
          aria-hidden
        >
          {emoji}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-0.5 truncate" style={{ color: "rgba(143,175,150,0.55)" }}>
            From {communityName}
          </p>
          <p className="text-sm leading-snug line-clamp-2" style={{ color: "#F0EDE6" }}>
            {body}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Same right-side pill as the Prayer Requests card (otherCard): a ✓
              once prayed, a 🙏🏽 tap-affordance before — so the two sections read
              as one consistent list. */}
          {prayed ? (
            <span aria-label="Prayed" className="flex-shrink-0 inline-flex items-center justify-center rounded-full font-semibold" style={{ height: 30, padding: "0 14px", background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.45)", color: "rgba(240,237,230,0.85)", fontSize: 14, lineHeight: 1 }}>✓</span>
          ) : (
            <span aria-hidden className="flex-shrink-0 inline-flex items-center justify-center rounded-full" style={{ height: 30, padding: "0 13px", background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.45)", fontSize: 15, lineHeight: 1 }}>🙏🏽</span>
          )}
        </div>
      </div>
    </BarCard>
  );
}

// One card per prayer feed in the Community intercessions section.
// Collapses N (feed, slot) entries for today into a single row with
// a "View" pill, mirroring the IntercessionCard above. The user
// asked for one card per feed (not one per slot) so the list reads
// as "Phoebe Climate has 3 intercessions today" instead of three
// separate cards. Tap routes to the feed detail page where every
// slot's intercession is visible as its own card.
function FeedCard({
  feed,
}: {
  feed: {
    feedId: number;
    feedSlug: string;
    feedTitle: string;
    feedCoverEmoji: string | null;
    entries: Array<{ id: number; slot: number; title: string; momentToken: string | null; isRecurring: boolean; prayedToday: boolean }>;
  };
}) {
  const cover = feed.feedCoverEmoji ?? "🕊️";
  const count = feed.entries.length;
  // Read like a community intercession: the feed's emoji as the avatar, the feed
  // name as the eyebrow, today's intention as the body, and the same ✓/🙏🏽 pill.
  const body = count === 0
    ? "Nothing yet today"
    : count === 1
      ? feed.entries[0].title
      : `${count} intercessions today`;
  const prayed = count > 0 && feed.entries.every((e) => e.prayedToday);
  // Tap opens TODAY'S intercession, not the feed: a single entry goes straight
  // to its pray slideshow (like every other community card); several today go to
  // the feed's pray-through slideshow; nothing today falls back to the feed page.
  const single = count === 1 ? feed.entries[0] : null;
  const href = single
    ? (single.momentToken
        ? `/prayer-mode?focusMoment=${encodeURIComponent(single.momentToken)}`
        : `/moments/${single.id}`)
    : count > 1
      ? `/prayer-mode?queue=feed&slug=${feed.feedSlug}`
      : `/prayer-feeds/${feed.feedSlug}`;
  return (
    <BarCard href={href} accent="#8FAF96">
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0"
          style={{ background: "#1A4A2E", border: "1px solid rgba(46,107,64,0.3)" }}
          aria-hidden
        >
          {cover}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-0.5 truncate" style={{ color: "rgba(143,175,150,0.55)" }}>
            {feed.feedTitle}
          </p>
          <p className="text-sm leading-snug line-clamp-2" style={{ color: "#F0EDE6" }}>
            {body}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {prayed ? (
            <span aria-label="Prayed" className="flex-shrink-0 inline-flex items-center justify-center rounded-full font-semibold" style={{ height: 30, padding: "0 14px", background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.45)", color: "rgba(240,237,230,0.85)", fontSize: 14, lineHeight: 1 }}>✓</span>
          ) : (
            <span aria-hidden className="flex-shrink-0 inline-flex items-center justify-center rounded-full" style={{ height: 30, padding: "0 13px", background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.45)", fontSize: 15, lineHeight: 1 }}>🙏🏽</span>
          )}
        </div>
      </div>
    </BarCard>
  );
}

// Faded card for an archived (retired) community intercession — only
// surfaces to admins of the owning group/feed. Mirrors the past-
// prayers-received treatment: dimmed border, dimmed text, no CTA pill,
// and a tap routes to the moment page so the admin can reopen the
// archived practice if they want.
function PastIntercessionCard({ p }: { p: PastIntercession }) {
  const groupLabel = p.group
    ? `🏘️ ${p.group.name}`
    : p.feed
      ? `📡 ${p.feed.title}`
      : null;
  const cardTitle = stripEmoji(p.intercessionTopic || p.intention || p.name);
  return (
    <BarCard
      href={`/moments/${p.id}`}
      accent="rgba(46,107,64,0.45)"
      bg="rgba(46,107,64,0.04)"
      border="rgba(46,107,64,0.15)"
    >
      <div className="relative pr-12" style={{ opacity: 0.78 }}>
        <span className="text-sm font-semibold truncate block" style={{ color: "rgba(240,237,230,0.7)" }}>
          🙏🏽 {cardTitle}
        </span>
        {groupLabel && (
          <p className="text-[11px] mt-0.5 truncate" style={{ color: "rgba(143,175,150,0.6)" }}>
            {groupLabel}
          </p>
        )}
        <span
          className="absolute bottom-0 right-0 text-[10px] font-semibold uppercase"
          style={{ color: "rgba(143,175,150,0.45)", letterSpacing: "0.12em" }}
        >
          Past
        </span>
      </div>
    </BarCard>
  );
}

function RequestCard({ req, onOpen, viewerAvatarUrl, viewerName, isPast = false }: {
  req: PrayerRequest;
  onOpen: () => void;
  viewerAvatarUrl?: string | null;
  viewerName?: string | null;
  /** Faded backlog treatment for answered / cycle-expired requests —
   *  dimmed accent + border, content at 0.78 opacity, days-left pill
   *  dropped. Mirrors PastIntercessionCard / PrayerFromCard isPast. */
  isPast?: boolean;
}) {
  const daysLeft = req.expiresAt
    ? Math.max(0, Math.ceil((new Date(req.expiresAt).getTime() - Date.now()) / 86400000))
    : null;
  // Authorship display: own requests use the viewer's avatar/name;
  // others use the request's owner fields. Anonymous requests fall
  // back to an anonymous bubble with no avatar and no name.
  const displayName = req.isAnonymous
    ? "Anonymous"
    : (req.isOwnRequest ? (viewerName ?? "You") : (req.ownerName ?? "Someone"));
  const displayAvatar = req.isAnonymous
    ? null
    : (req.isOwnRequest ? (viewerAvatarUrl ?? null) : req.ownerAvatarUrl);
  return (
    <BarCard
      onClick={onOpen}
      accent={isPast ? "rgba(46,107,64,0.45)" : "#8FAF96"}
      bg={isPast ? "rgba(46,107,64,0.04)" : undefined}
      border={isPast ? "rgba(46,107,64,0.15)" : undefined}
    >
      <div className="flex items-center gap-3" style={isPast ? { opacity: 0.78 } : undefined}>
        {/* Author avatar — mirrors PrayerForCard's recipient avatar
            so both sections read with the same visual rhythm. */}
        {displayAvatar ? (
          <img
            src={displayAvatar}
            alt={displayName}
            className="w-9 h-9 rounded-full object-cover shrink-0"
            style={{ border: "1px solid rgba(46,107,64,0.3)" }}
          />
        ) : (
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
            style={{ background: "#1A4A2E", color: "#A8C5A0" }}
          >
            {initials(displayName)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "rgba(143,175,150,0.55)" }}>
              {req.isOwnRequest ? "Your request" : `From ${displayName}`}
            </p>
            <PrayerKindPill kind={req.kind} />
          </div>
          <p className="text-sm leading-snug line-clamp-2" style={{ color: "#F0EDE6" }}>
            {req.body}
          </p>
          {/* No "Prayed by N" count (owner: "take out the indication of who
              prayed the prayer requests… no count"). The detail page it used
              to link into no longer shows a count or faces either. */}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Home-consistent ✓ — once you've left a word alongside someone
              else's request you've prayed it; mark it done the way the home
              screen marks its anchors. */}
          {!isPast && !req.isOwnRequest && req.myWord && (
            <span className="text-[13px] font-bold" style={{ color: "#7ED28C" }} aria-label="Prayed">✓</span>
          )}
          {req.words.length > 0 && (
            <span className="flex items-center gap-1" style={{ color: req.myWord ? "#5C7A5F" : "rgba(143,175,150,0.45)" }}>
              <span className="text-[10px] tabular-nums">{req.words.length}</span>
              <MessageCircle size={14} />
            </span>
          )}
          {!isPast && daysLeft !== null && req.isOwnRequest && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{
                background: daysLeft <= 1 ? "rgba(217,140,74,0.15)" : "rgba(46,107,64,0.15)",
                color: daysLeft <= 1 ? "#D98C4A" : "rgba(143,175,150,0.7)",
                border: `1px solid ${daysLeft <= 1 ? "rgba(217,140,74,0.3)" : "rgba(46,107,64,0.2)"}`,
              }}
            >
              {daysLeft === 0 ? "today" : `${daysLeft}d left`}
            </span>
          )}
          {/* Past rows get a quiet "Renew" hint in place of the
              days-left pill — tapping the card routes to the detail
              page where the owner can renew or release it. */}
          {isPast && req.isOwnRequest && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{
                background: "rgba(46,107,64,0.10)",
                color: "rgba(143,175,150,0.6)",
                border: "1px solid rgba(46,107,64,0.18)",
              }}
            >
              Ended
            </span>
          )}
        </div>
      </div>
    </BarCard>
  );
}

// ─── Detail popup ─────────────────────────────────────────────────────────
// A dialog shell that renders the expanded view for a tapped prayer-request
// card, keeping the backdrop + close-button chrome in one place.

function DetailModal({
  target,
  requests,
  onClose,
}: {
  target: DetailTarget | null;
  requests: PrayerRequest[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [wordDraft, setWordDraft] = useState("");
  // Owner-only edit mode on their own prayer request. editingId tracks
  // WHICH request we're editing (not a bool) so opening a different
  // request through the same modal resets the edit state cleanly.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");

  // Mutations are declared unconditionally (hooks rule) but only invoked
  // from the variants that need them. Invalidations keep the cards on the
  // page behind the modal in sync the moment the modal closes.
  const wordMutation = useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) =>
      apiRequest("POST", `/api/prayer-requests/${id}/word`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      setWordDraft("");
    },
  });
  // Used by the "×" affordance on the "Your word" card so a viewer can
  // retract a word of comfort they've already left (typo, regret,
  // accidental tap). Backed by DELETE /api/prayer-requests/:id/word
  // which is idempotent and self-scoped.
  const deleteWordMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/prayer-requests/${id}/word`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    },
  });
  const editBodyMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) =>
      apiRequest("PATCH", `/api/prayer-requests/${id}`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      setEditingId(null);
      setEditDraft("");
    },
  });
  const releaseMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/prayer-requests/${id}/release`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      // Releasing moves the request into the Past backlog.
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests/mine/past"] });
      onClose();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/prayer-requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests/mine/past"] });
      onClose();
    },
  });
  const renewRequestMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/prayer-requests/${id}/renew`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      // Renewing pulls it back OUT of the Past backlog into active.
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests/mine/past"] });
    },
  });
  // Lock body scroll while the modal is open so the page underneath
  // doesn't slide around on iOS.
  useEffect(() => {
    if (!target) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [target]);

  if (!target) return null;

  // Resolve the record once, up front — keeps the variant block tight.
  const req = target.kind === "request" ? requests.find(r => r.id === target.id) ?? null : null;

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 90,
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <motion.div
          key="sheet"
          initial={{ y: 12, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 6, opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "#0F2818",
            border: "1px solid rgba(46,107,64,0.4)",
            borderRadius: 20,
            maxWidth: 480,
            width: "100%",
            maxHeight: "85vh",
            overflow: "auto",
            padding: "22px 22px 26px",
            fontFamily: "'Space Grotesk', sans-serif",
            color: "#F0EDE6",
            boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
          }}
        >
          {/* close */}
          <div className="flex justify-end -mt-1 -mr-1">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full transition-opacity hover:opacity-70"
              style={{ color: "#8FAF96" }}
              aria-label="Close"
            >
              <CloseIcon size={18} />
            </button>
          </div>

          {/* ── Prayer request ─────────────────────────────────────────── */}
          {req && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] mb-2" style={{ color: "rgba(143,175,150,0.6)" }}>
                {req.isOwnRequest ? "Your request" : `From ${req.ownerName ?? "someone"}`}
              </p>
              {editingId === req.id ? (
                // Edit mode — owner is revising the body. The textarea
                // sits in the same visual slot as the rendered body so
                // the modal doesn't jump; we drop italic/serif here so
                // the editing surface reads as a normal input, not as
                // pre-set copy you're overwriting.
                <div className="mb-4">
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={4}
                    maxLength={1000}
                    autoFocus
                    className="w-full text-base leading-relaxed px-3 py-2.5 rounded-lg focus:outline-none resize-none"
                    style={{
                      background: "#091A10",
                      border: "1px solid rgba(46,107,64,0.3)",
                      color: "#F0EDE6",
                      fontFamily: "'Space Grotesk', sans-serif",
                      fontSize: 16, // iOS Safari: ≥16 to prevent auto-zoom
                    }}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px]" style={{ color: "rgba(143,175,150,0.55)" }}>
                      {editDraft.trim().length}/1000
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { setEditingId(null); setEditDraft(""); }}
                        disabled={editBodyMutation.isPending}
                        className="text-xs font-medium px-3 py-1.5 rounded-full transition-opacity hover:opacity-80 disabled:opacity-40"
                        style={{ color: "rgba(143,175,150,0.75)", border: "1px solid rgba(143,175,150,0.2)" }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => editBodyMutation.mutate({ id: req.id, body: editDraft.trim() })}
                        disabled={!editDraft.trim() || editDraft.trim() === req.body || editBodyMutation.isPending}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full transition-opacity hover:opacity-80 disabled:opacity-40"
                        style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                      >
                        {editBodyMutation.isPending ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p
                  className="text-lg leading-relaxed italic mb-4"
                  style={{ color: "#F0EDE6", fontFamily: "Georgia, 'Times New Roman', serif" }}
                >
                  {req.body}
                </p>
              )}

              {req.myWord && (
                <div
                  className="mb-3 px-3 py-2 rounded-lg relative"
                  style={{ background: "rgba(46,107,64,0.1)", border: "1px solid rgba(46,107,64,0.2)" }}
                >
                  <p className="text-[10px] font-medium uppercase tracking-widest mb-1 pr-7" style={{ color: "rgba(143,175,150,0.5)" }}>
                    Your word
                  </p>
                  <p className="text-sm pr-7" style={{ color: "#A8C5A0" }}>{req.myWord}</p>
                  <button
                    onClick={() => deleteWordMutation.mutate(req.id)}
                    disabled={deleteWordMutation.isPending}
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
                </div>
              )}

              {(() => {
                const others = req.words.filter((w) => !(req.myWord && w.content === req.myWord));
                if (others.length === 0) return null;
                return (
                  <>
                    <p className="text-[10px] font-medium uppercase tracking-widest mt-2 mb-2" style={{ color: "rgba(143,175,150,0.5)" }}>
                      From your community
                    </p>
                    <div className="space-y-1.5 mb-3">
                      {others.map((w, i) => (
                        <p key={i} className="text-sm" style={{ color: "rgba(200,212,192,0.85)" }}>
                          <span className="font-medium" style={{ color: "#C8D4C0" }}>{w.authorName}</span>
                          {": "}{w.content}
                        </p>
                      ))}
                    </div>
                  </>
                );
              })()}

              {!req.isOwnRequest && !req.myWord && (
                <div className="flex gap-2 mt-3">
                  <input
                    type="text"
                    value={wordDraft}
                    onChange={(e) => setWordDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && wordDraft.trim()) {
                        wordMutation.mutate({ id: req.id, content: wordDraft.trim() });
                      }
                    }}
                    placeholder="Leave a word alongside this… 🌿"
                    maxLength={120}
                    className="flex-1 text-sm px-3 py-2 rounded-lg border focus:outline-none transition-all"
                    style={{
                      background: "#091A10",
                      borderColor: "rgba(46,107,64,0.3)",
                      color: "#F0EDE6",
                    }}
                  />
                  <button
                    type="button"
                    disabled={!wordDraft.trim() || wordMutation.isPending}
                    onClick={() => wordMutation.mutate({ id: req.id, content: wordDraft.trim() })}
                    className="px-3 py-2 rounded-lg text-sm disabled:opacity-40 shrink-0"
                    style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                  >
                    🙏🏽
                  </button>
                </div>
              )}

              {req.isOwnRequest && editingId !== req.id && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t" style={{ borderColor: "rgba(200,212,192,0.12)" }}>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => { setEditingId(req.id); setEditDraft(req.body); }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-full transition-opacity hover:opacity-80"
                      style={{ background: "rgba(46,107,64,0.2)", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.3)" }}
                    >
                      ✎ Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => renewRequestMutation.mutate(req.id)}
                      disabled={renewRequestMutation.isPending}
                      className="text-xs font-semibold px-3 py-1.5 rounded-full transition-opacity hover:opacity-80 disabled:opacity-40"
                      style={{ background: "rgba(46,107,64,0.2)", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.3)" }}
                    >
                      🔄 Renew
                    </button>
                    <button
                      type="button"
                      onClick={() => releaseMutation.mutate(req.id)}
                      disabled={releaseMutation.isPending}
                      className="text-xs italic transition-opacity hover:opacity-70 disabled:opacity-40"
                      style={{ color: "rgba(143,175,150,0.5)" }}
                    >
                      Release this 🌿
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Delete this prayer? This can't be undone.")) {
                        deleteMutation.mutate(req.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="text-xs transition-opacity hover:opacity-70"
                    style={{ color: "rgba(143,175,150,0.4)" }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </>
          )}

        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function PrayerListPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const bgPhoto = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  // Mark "this user opened their prayer list" as a prayer event for
  // the community metrics dashboard's Times-prayed rollup. The
  // surface is exempt from the 5-second floor server-side, so a
  // glance-and-back still records. usePrayerSession also tracks the
  // duration so longer dwell times feed the Time-praying rollup
  // through prayer_sessions.
  usePrayerSession(user ? "prayer-list" : null);

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

  // Today's intercessions across every prayer feed the user subscribes
  // to. Together with /subscribed (below) we surface one card per feed
  // — even if the feed has nothing scheduled today — so an admin still
  // sees their feed in the Community intercessions section on quiet
  // days.
  const { data: feedTodayData } = useQuery<{
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
      momentToken: string | null;
      isRecurring: boolean;
      prayedToday: boolean;
    }>;
  }>({
    queryKey: ["/api/prayer-feeds/today"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds/today"),
    enabled: !!user,
  });
  // Every feed the user subscribes to (regardless of whether anything
  // is scheduled today). Drives the card list — feeds with no entries
  // today still appear with a "Nothing yet today" subtitle.
  const { data: subscribedData } = useQuery<{
    subscriptions: Array<{
      feed: {
        id: number;
        slug: string;
        title: string;
        coverEmoji: string | null;
      };
    }>;
  }>({
    queryKey: ["/api/prayer-feeds/subscribed"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds/subscribed"),
    enabled: !!user,
  });
  // Build one card per subscribed feed; attach today's entries (if any)
  // by grouping the /today response by feedId.
  const feedsToday = (() => {
    const entriesByFeed = new Map<
      number,
      Array<{ id: number; slot: number; title: string; momentToken: string | null; isRecurring: boolean; prayedToday: boolean }>
    >();
    for (const e of feedTodayData?.entries ?? []) {
      const cur = entriesByFeed.get(e.feedId) ?? [];
      cur.push({
        id: e.id,
        slot: e.slot,
        title: e.title,
        momentToken: e.momentToken,
        isRecurring: e.isRecurring,
        prayedToday: e.prayedToday,
      });
      entriesByFeed.set(e.feedId, cur);
    }
    return (subscribedData?.subscriptions ?? [])
      // VTS is practices-only — owner: "VTS Should not have a prayer list
      // feed / they are only for practices and such." Excluded here same
      // as the intercessions/events sections on prayer-feed-detail.tsx,
      // the home "Go" feed cards, and communities-browse search.
      .filter((s) => s.feed.slug !== "vts")
      .map((s) => ({
        feedId: s.feed.id,
        feedSlug: s.feed.slug,
        feedTitle: s.feed.title,
        feedCoverEmoji: s.feed.coverEmoji,
        entries: entriesByFeed.get(s.feed.id) ?? [],
      }));
  })();

  // Released-unread popup (kept unchanged — it's a separate closing-ritual
  // surface that doesn't fit inside the card grid).
  const { data: releasedData } = useQuery<{ requests: ReleasedRequest[] }>({
    queryKey: ["/api/prayer-requests/released-unread"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests/released-unread"),
    enabled: !!user,
    staleTime: 60_000,
  });
  const released = releasedData?.requests ?? [];
  const [releasedIndex, setReleasedIndex] = useState(0);
  const currentReleased = released[releasedIndex] ?? null;

  const acknowledgeReleaseMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/prayer-requests/${id}/acknowledge-release`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests/released-unread"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    },
  });
  // "Keep praying" on the released popup — renew brings the prayer back for
  // another 7 days (clears the released state) instead of letting it rest.
  const renewReleasedMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/prayer-requests/${id}/renew`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests/released-unread"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests/mine/past"] });
    },
  });
  // The X closes the popup without deciding — it resurfaces next visit if the
  // release is still unacknowledged. Advance steps to the next released prayer.
  const [releasedDismissed, setReleasedDismissed] = useState(false);
  const advanceReleased = () => setReleasedIndex((i) => (i + 1 < released.length ? i + 1 : 0));

  // The viewer's OWN past prayers (released / answered / expired) — for the
  // collapsible "Past prayers" section on the mine tab, each renewable.
  // /mine/past returns the array directly (not wrapped).
  const { data: pastMineData } = useQuery<Array<{ id: number; body: string }>>({
    queryKey: ["/api/prayer-requests/mine/past"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests/mine/past"),
    enabled: !!user,
    staleTime: 60_000,
  });
  const pastMine = pastMineData ?? [];
  const [showPast, setShowPast] = useState(false);

  // The viewer's OWN pending submissions to communities' moderated prayer
  // lists — owner: a "Pending prayer requests" section at the bottom, for
  // requests submitted but not yet accepted by a group's admin.
  const { data: pendingSubmissionsData } = useQuery<{ requests: Array<{ id: number; body: string; groupName: string; groupSlug: string; createdAt: string }> }>({
    queryKey: ["/api/me/group-prayer-submissions"],
    queryFn: () => apiRequest("GET", "/api/me/group-prayer-submissions"),
    enabled: !!user,
    staleTime: 60_000,
  });
  const pendingSubmissions = pendingSubmissionsData?.requests ?? [];

  // The viewer's OWN private list (prayer_intentions) — owner: "the prayer
  // list page should have both community and individual prayers, on the
  // same page, no toggle, personal second." Fetched with ?ymd= (like
  // /intentions and useRhythmState) so each card can show the same ✓/🙏🏽
  // pill the community cards use instead of a differently-styled button.
  const todayYmd = useMemo(todayLocalISO, []);
  const { data: myIntentionsData } = useQuery<{ intentions: Array<{ id: number; kind: string; personName: string; body: string; answered: boolean; prayedToday: boolean }> }>({
    queryKey: ["/api/prayer-intentions", todayYmd],
    queryFn: () => apiRequest("GET", `/api/prayer-intentions?ymd=${todayYmd}`) as Promise<{ intentions: Array<{ id: number; kind: string; personName: string; body: string; answered: boolean; prayedToday: boolean }> }>,
    enabled: !!user,
  });
  const myIntentions = (myIntentionsData?.intentions ?? []).filter((i) => !i.answered);
  const markIntentionPrayedMut = useMutation({
    /**
     * The server requires `{ ymd }` and this sent no body at all — every
     * tap 400ed, `onSuccess` never ran, and `markPracticeDoneToday
     * ("prayer-list")` never fired. Matches the owner's own report: "I
     * prayed one of my prayers and it didn't check it off when I came
     * back." `todayLocalISO()` freshly here, not the memoized `todayYmd`
     * above — that one is frozen at mount, so a tab left open across
     * midnight would keep sending yesterday's date.
     */
    mutationFn: (id: number) => apiRequest("POST", `/api/prayer-intentions/${id}/pray`, { ymd: todayLocalISO() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-intentions"] });
      // The slideshow's advance() stamps this same legacy flag per personal
      // slide (prayer-mode.tsx) — the weekly grid + widget's "My Prayer
      // List" row reads it, not the live myAmenedToday/prayedToday counts
      // this page itself uses. Without it, praying everything from THIS
      // list page (rather than the slideshow) left that history dot
      // unfilled even though every amen was genuinely recorded — owner:
      // "when you enter the prayer list from the routine card, it counts
      // all the amens."
      markPracticeDoneToday("prayer-list");
    },
  });

  const [detail, setDetail] = useState<DetailTarget | null>(null);
  // When non-null, the page collapses to a single category + a back button.
  // When null, all four sections are visible, each clamped to ~3.5 cards
  // with a scroll + fade so the list reads as "peek, don't bury."
  const [focused, setFocused] = useState<SectionKey | null>(null);
  // Pilot is personal-only — no Community section at all.
  const { isPilot } = usePilotMode();

  // Owner: "have the prayer list page have the community list first, unless
  // they have not community prayers then hide it." Computed straight off the
  // raw queries (not the derived arrays further down, which are declared
  // after this component's early-loading return and so can't feed a hook)
  // so it's available before any hooks below it run.
  const hasCommunityContent = !isPilot && (
    prayerRequests.some((r) => !r.isAnswered && !r.needsRenewal && !r.isOwnRequest) ||
    feedsToday.length > 0 ||
    (momentsData?.moments ?? []).some((m) => m.templateType === "intercession" && m.prayerFeedId == null)
  );

  useEffect(() => {
    /**
     * OFFLINE IS NOT SIGNED OUT (owner, 2026-09-06: "Morning Prayer is not
     * loading offline at all — it would load before").
     *
     * /api/auth/me cannot be answered without a connection, so the query
     * resolves to null and this gate read that as "no account" and sent the
     * person home — every saved office, psalm and prayer became unreachable
     * the moment they lost signal, which is the opposite of what the offline
     * layer is for. A failed ask is not an answer: while offline, stay put and
     * let the page paint from what is saved.
     */
    if (isOnline() && !authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  // Auto-open the DetailModal when arrived here via a deep link that
  // carries `?detail=req:42`. Used by
  // push notifications — when a circle member leaves a word on
  // someone's prayer request, the push payload's `path` is
  // /prayer-list?detail=req:<id>, so tapping the notification lands
  // the user directly inside the popup that holds the comment, not
  // on the bare list.
  //
  // Wouter only re-renders on pathname change, so a deep link that
  // changes only the query string (push lands while user is already
  // on /prayer-list) wouldn't otherwise trigger this effect. We
  // listen to popstate ourselves and read the live search each time.
  useEffect(() => {
    const openFromSearch = (qs: string) => {
      // Pilot is personal-only — never auto-open a community request/prayer-for
      // detail (another user's body) from a ?detail= deep-link.
      if (isPilot) return;
      const raw = new URLSearchParams(qs).get("detail");
      if (!raw) return;
      const [kind, idStr] = raw.split(":");
      const id = parseInt(idStr ?? "", 10);
      if (Number.isNaN(id)) return;
      if (kind === "req") {
        setDetail({ kind: "request", id });
        // Clear the push notification for this request — the user
        // tapped through to view it, the lock-screen banner has
        // done its job. No-op on web.
        try {
          window.dispatchEvent(
            new CustomEvent("phoebe:clear-notifications", { detail: { threadId: `prayer-request-${id}` } })
          );
        } catch { /* non-fatal */ }
      }
    };
    openFromSearch(window.location.search);
    const onPop = () => openFromSearch(window.location.search);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (authLoading || !user) return null;

  const intercessions = (momentsData?.moments ?? []).filter(
    (m) => m.templateType === "intercession"
      // Exclude prayer-feed-attached intercessions ("For Oak Flat"
      // under Phoebe Climate, etc.) — the section already renders
      // a single collapsed FeedCard for each subscribed feed
      // ("Phoebe Climate — 2 intercessions today"), so surfacing
      // each feed intercession as its own card here too means the
      // same prayer shows up twice in the same section.
      && (m.prayerFeedId == null),
  );
  const intercessionsSorted = [
    ...intercessions.filter((m) => m.windowOpen),
    ...intercessions.filter((m) => !m.windowOpen),
  ];

  // Active requests come from the live feed — everything that hasn't
  // been answered and hasn't run past its window. (The live feed also
  // returns the owner's own expired rows flagged needsRenewal; we drop
  // those here since the dedicated past endpoint is the source of truth
  // for the backlog.)
  const activeRequests = prayerRequests.filter((r) => !r.isAnswered && !r.needsRenewal);
  // Past = the viewer's own answered / released / expired requests, from
  // /api/prayer-requests/mine/past. Rendered faded at the bottom of the
  // section (same treatment as the "Prayers for You" / intercessions
  // backlogs) so a request doesn't just vanish when its window closes.
  const hasAnyRequests = activeRequests.length > 0;
  // Own requests float to the top of the active list — the user asked to see
  // their own asks first. Stable sort keeps server order within each group.
  const sortedActiveRequests = [...activeRequests].sort(
    (a, b) => Number(b.isOwnRequest) - Number(a.isOwnRequest),
  );
  return (
    <Layout bgPhoto={bgPhoto}>
      <div className="max-w-2xl mx-auto w-full pb-24">
        {/* Back link to /dashboard — matches the pattern on the
            sibling prayer surfaces (/my-prayer-requests,
            /prayers-for-me) so every drilled-in prayer page has a
            consistent way out. */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-medium mb-6 transition-opacity hover:opacity-80"
          style={{ color: "#8FAF96" }}
        >
          <ChevronLeft size={14} />
          {t("common.back")}
        </Link>

        {/* Header */}
        <div className="mb-4">
          <h1
            className="text-2xl font-bold"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {t("prayer_list.title")} 🙏🏽
          </h1>
          <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>
            {t("prayer_list.subtitle_combined", { defaultValue: "Community prayers, and the people and things you're holding privately." })}
          </p>
        </div>

        {/* "Pray through the whole list" + "Add prayer" — the page's ONE
            slideshow entry point and ONE add entry point (owner: "there
            should not be add twice" / "the add to my list is still there
            and redundant"). Always reachable regardless of whether there's
            any community content — the unified slideshow includes the
            private list too, and the compose screen itself offers "Keep on
            my list" vs "Share with community". */}
        {focused === null && (
          <Link
            href="/prayer-mode?reset=1"
            className="block mb-4 rounded-xl px-4 py-3 cursor-pointer"
            style={{
              background: "rgba(9,26,16, 0.297)",
              backdropFilter: "blur(11.34px)",
              WebkitBackdropFilter: "blur(11.34px)",
              border: "1px solid rgba(46,107,64,0.4)",
              textAlign: "center",
              fontFamily: "'Space Grotesk', sans-serif",
              color: "#F0EDE6",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            🕯️ {t("prayer_list.pray_through_all")}
          </Link>
        )}
        {focused === null && (
          <Link href="/pray-request/new" className="block mb-4">
            <div className="w-full rounded-xl text-center transition-opacity hover:opacity-90 active:scale-[0.99]" style={{ padding: "12px 16px", ...FROST, border: "1px solid rgba(200,212,192,0.3)", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 600 }}>
              {t("dashboard.new_prayer_request", { defaultValue: "Add prayer" })}
            </div>
          </Link>
        )}

        {/* ── Community ─────────────────────────────────────────────────
            No toggle (owner): community leads when there's anything there,
            hidden entirely when there isn't — never an empty tab to land on.
            Header removed (owner: "take out the community intercession
            header") — "Community Prayers" right below already says it. */}
        {hasCommunityContent && (<>
        {/* Back button when drilled into a single category */}
        {focused !== null && (
          <button
            type="button"
            onClick={() => setFocused(null)}
            className="mt-1 mb-1 inline-flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-opacity hover:opacity-80"
            style={{ color: "#A8C5A0" }}
          >
            <ChevronLeft size={16} />
            <span className="text-[12px] font-medium">{t("prayer_list.all_prayers")}</span>
          </button>
        )}

        {/* Prayer requests — mirrors the home prayer section: others' first
            (tap to pray; a ✓ once you've prayed today), then your own, then the
            New-request button. */}
        {focused === null && (() => {
          const others = sortedActiveRequests.filter((r) => !r.isOwnRequest);
          const mine = sortedActiveRequests.filter((r) => r.isOwnRequest);
          const sectionHead = (label: string) => (
            <div className="flex items-center gap-3 mb-2 mt-6">
              <h2 className="text-lg font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>{label}</h2>
              <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
            </div>
          );
          const facesInitials = (name: string | null) => (name ?? "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
          const otherCard = (req: PrayerRequest, i: number) => {
            const rgb = rhythmGradientRgb(i, Math.max(1, (others.length - 1) * 5 + 1));
            const displayName = req.isAnonymous ? t("prayer_list_carousel.anonymous", { defaultValue: "Anonymous" }) : (req.ownerName ?? t("find_friends.someone", { defaultValue: "Someone" }));
            const displayAvatar = req.isAnonymous ? null : (req.ownerAvatarUrl ?? null);
            const amened = !!req.myAmenedToday;
            return (
              <Link key={req.id} href={`/prayer-mode?focus=${req.id}`} className="block">
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`relative flex rounded-xl overflow-hidden transition-transform active:scale-[0.99] ${amened ? "" : "animate-turn-pulse-practices"}`}
                  style={{ background: "rgba(22,46,32, 0.330)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: "1px solid rgba(200,212,192,0.35)", boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)" }}
                >
                  <div className={`w-1 flex-shrink-0 ${amened ? "" : "animate-bar-pulse-practices"}`} style={amened ? { background: `rgba(${rgb},0.72)` } : undefined} />
                  <div className="flex-1 px-4 pt-3 pb-3">
                    <div className="flex items-center gap-3">
                      {displayAvatar ? (
                        <img src={displayAvatar} alt={displayName} className="w-9 h-9 rounded-full object-cover shrink-0" style={{ border: "1px solid rgba(46,107,64,0.3)" }} />
                      ) : (
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0" style={{ background: "#1A4A2E", color: "#A8C5A0" }}>{initials(displayName)}</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-0.5 truncate" style={{ color: "rgba(143,175,150,0.55)" }}>{t("prayer_list_carousel.from_name", { name: displayName, defaultValue: `From ${displayName}` })}</p>
                        <p className="text-sm leading-snug line-clamp-2" style={{ color: "#F0EDE6" }}>{req.body}</p>
                      </div>
                      {amened ? (
                        <span aria-label={t("prayer_card.amened", { defaultValue: "Prayed" })} className="flex-shrink-0 inline-flex items-center justify-center rounded-full font-semibold" style={{ height: 30, padding: "0 14px", background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.45)", color: "rgba(240,237,230,0.85)", fontSize: 14, lineHeight: 1 }}>✓</span>
                      ) : (
                        <span aria-hidden className="flex-shrink-0 inline-flex items-center justify-center rounded-full" style={{ height: 30, padding: "0 13px", background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.45)", fontSize: 15, lineHeight: 1 }}>🙏🏽</span>
                      )}
                    </div>
                  </div>
                </motion.div>
              </Link>
            );
          };
          const ownCard = (req: PrayerRequest) => {
            const amened = !!req.myAmenedToday;
            return (
              <div key={req.id} className="relative flex rounded-xl overflow-hidden" style={{ background: "rgba(22,46,32, 0.330)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: "1px solid rgba(200,212,192,0.35)", boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)" }}>
                <div className="w-1 flex-shrink-0" style={{ background: "rgba(46,107,64,0.8)" }} />
                <Link href={`/prayer-requests/${req.id}`} className="flex-1 min-w-0 px-4 pt-3 pb-3 flex items-center gap-3 transition-opacity active:opacity-80">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.name ?? ""} className="w-9 h-9 rounded-full object-cover shrink-0" style={{ border: "1px solid rgba(46,107,64,0.3)" }} />
                  ) : (
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0" style={{ background: "#1A4A2E", color: "#A8C5A0" }}>{facesInitials(user.name ?? null)}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-0.5 truncate" style={{ color: "rgba(143,175,150,0.55)" }}>{t("prayer_list_carousel.your_request", { defaultValue: "Your request" })}</p>
                    <p className="text-sm leading-snug line-clamp-2" style={{ color: "#F0EDE6" }}>{req.body}</p>
                  </div>
                  {amened ? (
                    <span aria-label={t("prayer_card.amened", { defaultValue: "Prayed" })} className="flex-shrink-0 inline-flex items-center justify-center rounded-full font-semibold" style={{ height: 30, padding: "0 14px", background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.45)", color: "rgba(240,237,230,0.85)", fontSize: 14, lineHeight: 1 }}>✓</span>
                  ) : (
                    <span aria-hidden className="flex-shrink-0 inline-flex items-center justify-center rounded-full" style={{ height: 30, padding: "0 13px", background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.45)", fontSize: 15, lineHeight: 1 }}>🙏🏽</span>
                  )}
                </Link>
                {/* Edit — owner: "there also needs to be an edit button on
                    any of my requests." Deep-links into the detail page
                    already in edit mode (?edit=1). */}
                <Link href={`/prayer-requests/${req.id}?edit=1`} className="flex-shrink-0 self-center mr-3 rounded-full transition-opacity hover:opacity-90" aria-label={t("common.edit", { defaultValue: "Edit" })} style={{ padding: "8px 10px", background: "rgba(200,212,192,0.08)", border: "1px solid rgba(200,212,192,0.25)", color: "#C8D4C0", fontSize: 13 }}>
                  ✎
                </Link>
              </div>
            );
          };
          return (
            <>
              {(others.length > 0 || feedsToday.length > 0 || intercessionsSorted.length > 0) && (
                <section>
                  {sectionHead(t("prayer_list.section_community_prayers", { defaultValue: "Community Prayers" }))}
                  <div className="flex flex-col gap-2">
                    {others.map((r, i) => otherCard(r, i))}
                    {/* Community intercessions — subscribed prayer feeds + ongoing
                        intercessions, grouped here under Community Prayers. */}
                    {feedsToday.map((f) => (
                      <FeedCard key={`feed-${f.feedId}`} feed={f} />
                    ))}
                    {intercessionsSorted.map((m) => (
                      <IntercessionCard key={m.id} moment={m} viewerEmail={user.email ?? ""} />
                    ))}
                  </div>
                </section>
              )}
              {mine.length > 0 && (
                <section>
                  {sectionHead(t("dashboard.your_requests_title", { defaultValue: "Your prayer requests" }))}
                  <div className="flex flex-col gap-2">{mine.map(ownCard)}</div>
                </section>
              )}
            </>
          );
        })()}
        </>)}

        {/* ── My List (private intentions) ──────────────────────────────
            Second (owner) — a separate section, not a tab. Styled like the
            community cards above (✓ once prayed today / 🙏🏽 to pray) instead
            of the old differently-styled "Pray →" text pill. */}
        <section className={hasCommunityContent ? "mt-6" : ""}>
          <div className="flex items-center gap-3 mb-2 mt-6">
            <h2 className="text-lg font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>{t("prayer_list.section_my_list", { defaultValue: "My List" })}</h2>
            <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
          </div>
          {/* Owner: "the add to my list is still there and redundant" —
              the page's one "Add prayer" button (above) already opens the
              same composer with a "Keep on my list" option. */}
          {myIntentions.length > 0 ? (
            <div className="flex flex-col gap-2">
              {myIntentions.map((it) => {
                const prayed = !!it.prayedToday;
                return (
                  <Link key={`intention-${it.id}`} href="/intentions" className="block">
                    <div className="relative flex rounded-xl overflow-hidden transition-transform active:scale-[0.99]" style={{ background: "rgba(22,46,32, 0.330)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: "1px solid rgba(200,212,192,0.35)", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
                      <div className="w-1 flex-shrink-0" style={{ background: "rgba(96,140,180,0.8)" }} />
                      <div className="flex-1 px-4 pt-3 pb-3 flex items-center gap-3">
                        <span aria-hidden className="text-base flex-shrink-0">🕊️</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-0.5" style={{ color: "rgba(143,175,150,0.55)" }}>{t("intentions.private_label", { defaultValue: "Private" })}</p>
                          <p className="text-sm leading-snug line-clamp-2" style={{ color: "#F0EDE6", wordBreak: "break-word" }}>{it.kind === "person" ? (it.personName || it.body) : it.body}</p>
                        </div>
                        {prayed ? (
                          <span aria-label={t("prayer_card.amened", { defaultValue: "Prayed" })} className="flex-shrink-0 inline-flex items-center justify-center rounded-full font-semibold" style={{ height: 30, padding: "0 14px", background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.45)", color: "rgba(240,237,230,0.85)", fontSize: 14, lineHeight: 1 }}>✓</span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); markIntentionPrayedMut.mutate(it.id); }}
                            disabled={markIntentionPrayedMut.isPending}
                            aria-hidden
                            className="flex-shrink-0 inline-flex items-center justify-center rounded-full"
                            style={{ height: 30, padding: "0 13px", background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.45)", fontSize: 15, lineHeight: 1, cursor: markIntentionPrayedMut.isPending ? "wait" : "pointer" }}
                          >
                            🙏🏽
                          </button>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-[14px] text-center mt-6 px-6 leading-relaxed" style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}>
              {t("intentions.empty", { defaultValue: "Add the people and things you want to keep in prayer. They stay private until you choose to share." })}
            </p>
          )}

          {/* Edit — owner: "below my private prayers in my list have an
              edit button that goes to the edit page." /intentions is the
              full CRUD surface for the private list (rename, edit body,
              delete). */}
          {myIntentions.length > 0 && (
            <Link href="/intentions" className="block mt-2">
              <div className="w-full rounded-full text-center transition-opacity hover:opacity-90 active:scale-[0.99]" style={{ padding: "10px 16px", background: "rgba(200,212,192,0.08)", border: "1px solid rgba(200,212,192,0.25)", color: "#C8D4C0", fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600 }}>
                ✎ {t("common.edit", { defaultValue: "Edit" })}
              </div>
            </Link>
          )}

          {/* Past prayers — released / ended / answered ones, collapsed behind a
              button; tap Renew on the right to bring one back. Shown regardless
              of whether the active list is empty. */}
          {pastMine.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowPast((s) => !s)}
                className="w-full rounded-xl text-center transition-opacity hover:opacity-90 active:scale-[0.99]"
                style={{ padding: "10px 16px", ...FROST, border: "1px solid rgba(200,212,192,0.3)", color: "rgba(240,237,230,0.85)", fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600 }}
              >
                🕯️ {t("intentions.past_prayers", { defaultValue: "Past prayers" })} ({pastMine.length}) {showPast ? "▴" : "▾"}
              </button>
              {showPast && (
                <div className="flex flex-col gap-2 mt-2">
                  {pastMine.map((p) => (
                    <div key={`past-${p.id}`} className="relative flex rounded-xl overflow-hidden" style={{ background: "rgba(22,46,32, 0.22)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: "1px solid rgba(200,212,192,0.2)", boxShadow: "0 2px 8px rgba(0,0,0,0.35)" }}>
                      <div className="w-1 flex-shrink-0" style={{ background: "rgba(143,175,150,0.4)" }} />
                      <div className="flex-1 px-4 pt-3 pb-3 flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-0.5" style={{ color: "rgba(143,175,150,0.45)" }}>{t("intentions.past_label", { defaultValue: "Past prayer" })}</p>
                          <p className="text-sm leading-snug line-clamp-2" style={{ color: "rgba(240,237,230,0.8)", wordBreak: "break-word" }}>{p.body}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => renewReleasedMutation.mutate(p.id)}
                          disabled={renewReleasedMutation.isPending}
                          className="flex-shrink-0 rounded-full transition-opacity hover:opacity-90"
                          style={{ padding: "8px 16px", background: "rgba(46,107,64,0.22)", border: "1px solid rgba(46,107,64,0.45)", color: "#F0EDE6", fontSize: 13, fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif", cursor: renewReleasedMutation.isPending ? "wait" : "pointer" }}
                        >
                          {t("intentions.renew", { defaultValue: "Renew" })}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Pending prayer requests — owner: a section at the bottom for
            requests the viewer has submitted to a community's moderated
            prayer list, not yet accepted by that group's admin. Distinct
            from "Past prayers" above (which is the viewer's own PERSONAL
            requests to their garden that have since ended) — these are
            group submissions still awaiting review, and can belong to
            several different communities at once. */}
        {pendingSubmissions.length > 0 && (
          <section className="mt-5">
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.2em] mb-2 px-1"
              style={{ color: "rgba(200,212,192,0.55)" }}
            >
              {t("prayer_list.section_pending", { defaultValue: "Pending prayer requests" })}
            </p>
            <div className="flex flex-col gap-2">
              {pendingSubmissions.map((r) => (
                <div
                  key={r.id}
                  className="rounded-2xl px-4 py-3.5"
                  style={{ ...FROST, border: "1px solid rgba(200,212,192,0.2)" }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: "rgba(143,175,150,0.6)" }}>
                    {t("prayer_list.pending_to_group", { defaultValue: "To {{group}} · awaiting review", group: r.groupName })}
                  </p>
                  <p className="text-sm leading-snug" style={{ color: "rgba(240,237,230,0.85)", wordBreak: "break-word" }}>
                    {r.body}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>

      {/* Detail popup — tap on a prayer-request card (or arrive via a
          ?detail=req:<id> deep link) opens this. */}
      {detail && (
        <DetailModal
          target={detail}
          requests={prayerRequests}
          onClose={() => setDetail(null)}
        />
      )}

      {/* Released-prayer closing popup (unchanged) */}
      <AnimatePresence>
        {currentReleased && !releasedDismissed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 100,
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <motion.div
              key={currentReleased.id}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              style={{
                position: "relative",
                background: "#0F2818",
                border: "1px solid rgba(46,107,64,0.4)",
                borderRadius: 20,
                boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
                padding: 28,
                maxWidth: 440,
                width: "100%",
                textAlign: "center",
                fontFamily: "'Space Grotesk', sans-serif",
                color: "#F0EDE6",
              }}
            >
              {/* Close without deciding — resurfaces next visit if still unacknowledged. */}
              <button
                type="button"
                onClick={() => setReleasedDismissed(true)}
                aria-label="Close"
                style={{ position: "absolute", top: 12, right: 12, width: 32, height: 32, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.06)", border: "none", color: "rgba(240,237,230,0.6)", fontSize: 20, lineHeight: 1, cursor: "pointer" }}
              >
                ×
              </button>
              <p style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(143,175,150,0.7)", marginBottom: 10 }}>
                Your prayer has been released
              </p>
              <p
                style={{
                  fontSize: 17,
                  lineHeight: 1.5,
                  color: "#F0EDE6",
                  marginBottom: 22,
                  fontStyle: "italic",
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                "{currentReleased.body}"
              </p>
              <div
                style={{
                  background: "rgba(46,107,64,0.15)",
                  border: "1px solid rgba(46,107,64,0.3)",
                  borderRadius: 14,
                  padding: "14px 18px",
                  marginBottom: 22,
                }}
              >
                <p style={{ fontSize: 32, fontWeight: 700, color: "#F0EDE6", lineHeight: 1 }}>
                  {currentReleased.amenCount}
                </p>
                <p style={{ fontSize: 12, color: "#8FAF96", marginTop: 6 }}>
                  {currentReleased.amenCount === 1 ? "time prayed" : "times prayed"} by your community
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "stretch", maxWidth: 280, margin: "0 auto" }}>
                {/* Amen — let it rest (acknowledge the release). */}
                <button
                  type="button"
                  onClick={() => { acknowledgeReleaseMutation.mutate(currentReleased.id); advanceReleased(); }}
                  className="rounded-full transition-opacity hover:opacity-90"
                  style={{
                    background: "#2D5E3F",
                    color: "#F0EDE6",
                    padding: "11px 32px",
                    fontSize: 14,
                    fontWeight: 600,
                    border: "none",
                    cursor: acknowledgeReleaseMutation.isPending ? "wait" : "pointer",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  Amen 🙏🏽
                </button>
                {/* Keep praying — renew it for another 7 days instead of letting it go. */}
                <button
                  type="button"
                  onClick={() => { renewReleasedMutation.mutate(currentReleased.id); advanceReleased(); }}
                  className="rounded-full transition-opacity hover:opacity-80"
                  style={{
                    background: "rgba(200,212,192,0.06)",
                    color: "#8FAF96",
                    padding: "11px 32px",
                    fontSize: 14,
                    fontWeight: 600,
                    border: "1px solid rgba(46,107,64,0.4)",
                    cursor: renewReleasedMutation.isPending ? "wait" : "pointer",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  Renew for 7 days
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}

// ─── Compose bar ──────────────────────────────────────────────────────────
// Top-of-page input for starting a prayer. Same shape as the home-page
// PrayerSection composer. Tapping 🙏🏽 submits the prayer as a personal
// prayer request — defaults to a 7-day community watch. The earlier
// "is this for you or for someone else?" branching modal was removed
// per user direction: the home prayer field is for personal requests,
// and prayer-for-someone-else lives behind its own FAB entry point.
export function PrayerListComposeBar() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [value, setValue] = useState("");

  const createOwnRequest = useMutation({
    mutationFn: (body: string) =>
      apiRequest("POST", "/api/prayer-requests", { body, durationDays: 7 }),
    onSuccess: () => {
      setValue("");
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    },
  });

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (createOwnRequest.isPending) return;
    createOwnRequest.mutate(trimmed);
  };

  return (
    <div className="mb-5">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder={t("prayer_list_compose.placeholder")}
          maxLength={1000}
          className="flex-1 text-sm px-4 py-2.5 rounded-xl border placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-[#8FAF96]/40 focus:border-[#8FAF96] transition-all"
          style={{ background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", borderColor: "rgba(46,107,64,0.3)", color: "#F0EDE6" }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          className="px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          style={{ backgroundColor: "#2D5E3F", color: "#F0EDE6" }}
        >
          🙏🏽
        </button>
      </div>
    </div>
  );
}
