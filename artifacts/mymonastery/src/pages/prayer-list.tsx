import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, X as CloseIcon, MessageCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import type { PrayerForMe, MyActivePrayerFor } from "@/components/pray-for-them";

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
  // Group scoping — primary community + any extras it's shared with.
  // Rendered under the intercession title on the prayer list since
  // practices are group-based rather than people-based now.
  group?: { id: number; name: string; slug: string; emoji: string | null } | null;
  additionalGroups?: Array<{ id: number; name: string; slug: string; emoji: string | null }>;
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
};

// Discriminated union for the detail popup — one modal component switches on
// `kind`. Keeps state simple (`detail` is just one field on the page) and
// lets the close-button + backdrop chrome live in one place.
type DetailTarget =
  | { kind: "request"; id: number }
  | { kind: "prayer-for"; id: number }
  | { kind: "prayer-from"; id: number };

// ─── Helpers ──────────────────────────────────────────────────────────────

function stripEmoji(s: string): string {
  // eslint-disable-next-line no-misleading-character-class
  return s.replace(/[\s\u200d]*(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Emoji_Component})+$/u, "").trim();
}

function formatPrayingSince(iso: string): string {
  const then = new Date(iso);
  if (!Number.isFinite(then.getTime())) return "";
  const days = Math.floor((Date.now() - then.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Since today";
  if (days === 1) return "Since yesterday";
  if (days < 7) {
    const dayName = then.toLocaleDateString(undefined, { weekday: "long" });
    return `Since ${dayName}`;
  }
  return `${days} days`;
}

// Calendar-day prayer window: when does "Day N" start? Rounded to the
// start of the day, so an evening-started prayer reads "Day 2" the next
// morning rather than still "Day 1".
function calendarPrayerWindow(startedAt: string, expiresAt: string, durationDays?: number) {
  const started = new Date(startedAt);
  const expires = new Date(expiresAt);
  const nowD = new Date();
  const todayStart = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate());
  const startedStart = new Date(started.getFullYear(), started.getMonth(), started.getDate());
  const expiresStart = new Date(expires.getFullYear(), expires.getMonth(), expires.getDate());
  const totalDays = durationDays
    ?? Math.max(1, Math.round((expiresStart.getTime() - startedStart.getTime()) / 86400000));
  const daysElapsed = Math.round((todayStart.getTime() - startedStart.getTime()) / 86400000);
  const day = Math.max(1, Math.min(totalDays, daysElapsed + 1));
  const daysLeft = Math.max(0, Math.round((expiresStart.getTime() - todayStart.getTime()) / 86400000));
  return { day, daysLeft, totalDays };
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
type SectionKey = "intercessions" | "requests" | "prayers-for" | "prayers-from";

function SectionShell({
  id,
  label,
  count,
  focused,
  onFocus,
  children,
}: {
  id: SectionKey;
  label: string;
  count: number;
  focused: SectionKey | null;
  onFocus: (id: SectionKey) => void;
  children: React.ReactNode;
}) {
  const isFocused = focused === id;
  const collapsed = focused === null;
  // Clamp at ~3.5 card rows. Cards are ≈64px + 8px gap, so 3 full rows plus
  // half a row of peek lands around 250–260px. We pad the bottom so the
  // fade gradient doesn't sit on top of the last visible card's text.
  const CLAMP = 260;
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
        {collapsed && count > 3 && (
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
        {collapsed && count > 3 && (
          <div
            className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, transparent 20%, #091A10)" }}
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
  bg = "rgba(46,107,64,0.15)",
  children,
}: {
  onClick?: () => void;
  href?: string;
  pulse?: boolean;
  accent?: string;
  bg?: string;
  children: React.ReactNode;
}) {
  const inner = (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative flex rounded-xl overflow-hidden transition-shadow ${pulse ? "animate-turn-pulse-practices" : ""}`}
      style={{
        background: bg,
        border: `1px solid ${pulse ? "rgba(46,107,64,0.15)" : "rgba(46,107,64,0.28)"}`,
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
  const allGroups = [
    ...(moment.group ? [moment.group] : []),
    ...(moment.additionalGroups ?? []),
  ];
  const groupLabel =
    allGroups.length === 0
      ? null
      : allGroups.length === 1
        ? `${allGroups[0].emoji ?? "🏘️"} ${allGroups[0].name}`
        : `${allGroups[0].emoji ?? "🏘️"} ${allGroups[0].name} +${allGroups.length - 1}`;
  const cardTitle = stripEmoji(moment.intercessionTopic || moment.intention || moment.name);

  // Intercession cards no longer carry a "Pray now" / "Prayed today" /
  // "Not today" state pill. Community intercessions are a different
  // semantic from personal requests — you open the moment page, not
  // a slideshow — so the CTA is always "View," rendered in the
  // bottom-right corner. Keeps the list visually calm and removes
  // the need for the user to mentally parse what state each moment
  // is in before tapping.
  return (
    <BarCard href={`/moments/${moment.id}`} accent="#2E6B40">
      <div className="relative pr-16">
        <span className="text-sm font-semibold truncate block" style={{ color: "#F0EDE6" }}>
          🙏🏽 {cardTitle}
        </span>
        {groupLabel && (
          <p className="text-[11px] mt-0.5 truncate" style={{ color: "#8FAF96" }}>{groupLabel}</p>
        )}
        <span
          className="absolute bottom-0 right-0 text-[10px] font-semibold rounded-full px-2.5 py-0.5"
          style={{ background: "rgba(46,107,64,0.35)", color: "#C8D4C0", letterSpacing: "0.06em" }}
        >
          View
        </span>
      </div>
    </BarCard>
  );
}

function RequestCard({ req, onOpen, viewerAvatarUrl, viewerName }: {
  req: PrayerRequest;
  onOpen: () => void;
  viewerAvatarUrl?: string | null;
  viewerName?: string | null;
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
    <BarCard onClick={onOpen} accent="#8FAF96">
      <div className="flex items-center gap-3">
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
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-0.5" style={{ color: "rgba(143,175,150,0.55)" }}>
            {req.isOwnRequest ? "Your request" : `From ${displayName}`}
          </p>
          <p className="text-sm leading-snug line-clamp-2" style={{ color: "#F0EDE6" }}>
            {req.body}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {req.words.length > 0 && (
            <span className="flex items-center gap-1" style={{ color: req.myWord ? "#5C7A5F" : "rgba(143,175,150,0.45)" }}>
              <span className="text-[10px] tabular-nums">{req.words.length}</span>
              <MessageCircle size={14} />
            </span>
          )}
          {daysLeft !== null && req.isOwnRequest && (
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
        </div>
      </div>
    </BarCard>
  );
}

function PrayerForCard({ p, onOpen }: { p: MyActivePrayerFor; onOpen: () => void }) {
  const w = calendarPrayerWindow(p.startedAt, p.expiresAt, p.durationDays);
  return (
    <BarCard onClick={onOpen} accent="#5C8A5F">
      <div className="flex items-center gap-3">
        {p.recipientAvatarUrl ? (
          <img
            src={p.recipientAvatarUrl}
            alt={p.recipientName}
            className="w-9 h-9 rounded-full object-cover shrink-0"
            style={{ border: "1px solid rgba(46,107,64,0.3)" }}
          />
        ) : (
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
            style={{ background: "#1A4A2E", color: "#A8C5A0" }}
          >
            {initials(p.recipientName)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate" style={{ color: "#F0EDE6" }}>
            {p.recipientName}
          </p>
          <p className="text-xs italic line-clamp-1" style={{ color: "#A8C5A0", fontFamily: "Playfair Display, Georgia, serif" }}>
            {p.prayerText}
          </p>
        </div>
        <span className="text-[10px] font-semibold shrink-0" style={{ color: "#A8C5A0" }}>
          Day {w.day}/{w.totalDays}
        </span>
      </div>
    </BarCard>
  );
}

function PrayerFromCard({ p, onOpen }: { p: PrayerForMe; onOpen: () => void }) {
  // Mirror the People-page "is praying for you" card: uppercase eyebrow
  // with the pray-er's first name + candle, the actual prayer text in
  // Playfair italic as the preview line, and the "since today / N days
  // ago" timestamp as the small meta underneath. Before this, the card
  // only rendered name + since, with no preview of what they were
  // praying — the user asked for parity with the People card.
  const firstName = p.prayerName.split(/\s+/)[0] || p.prayerName;
  const preview = (p.prayerText ?? "").trim();
  return (
    <BarCard onClick={onOpen} accent="#C19A3A" bg="rgba(193,154,58,0.08)">
      <div className="flex items-start gap-3">
        {p.prayerAvatarUrl ? (
          <img
            src={p.prayerAvatarUrl}
            alt={p.prayerName}
            className="w-9 h-9 rounded-full object-cover shrink-0 mt-0.5"
            style={{ border: "1px solid rgba(193,154,58,0.3)" }}
          />
        ) : (
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5"
            style={{ background: "#3A2E14", color: "#E4C97C" }}
          >
            {initials(p.prayerName)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p
            className="text-[9px] font-semibold uppercase tracking-[0.16em] mb-1"
            style={{ color: "rgba(217,176,82,0.75)" }}
          >
            {firstName} is praying for you 🕯️
          </p>
          {preview.length > 0 && (
            <p
              className="text-[13px] italic leading-snug"
              style={{
                color: "#E8D9B0",
                fontFamily: "Playfair Display, Georgia, serif",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {preview}
            </p>
          )}
          <p className="text-[11px] mt-1" style={{ color: "rgba(228,201,124,0.65)" }}>
            {formatPrayingSince(p.startedAt)}
          </p>
        </div>
        <span className="text-[10px] shrink-0 mt-1" style={{ color: "rgba(228,201,124,0.7)" }}>→</span>
      </div>
    </BarCard>
  );
}

// ─── Detail popup ─────────────────────────────────────────────────────────
// A shared dialog shell that renders the expanded view for whichever card
// the user tapped. Keeping all three variants in one component avoids
// three near-identical backdrop+close-button copies.

function DetailModal({
  target,
  requests,
  prayersFor,
  prayersFrom,
  onClose,
}: {
  target: DetailTarget | null;
  requests: PrayerRequest[];
  prayersFor: MyActivePrayerFor[];
  prayersFrom: PrayerForMe[];
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
      onClose();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/prayer-requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      onClose();
    },
  });
  const renewRequestMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/prayer-requests/${id}/renew`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] }),
  });
  const renewPrayerFor = useMutation({
    mutationFn: ({ id, days }: { id: number; days: 3 | 7 }) =>
      apiRequest("POST", `/api/prayers-for/${id}/renew`, { durationDays: days }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayers-for/mine"] });
      onClose();
    },
  });
  const endPrayerFor = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/prayers-for/${id}/end`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayers-for/mine"] });
      onClose();
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

  // Resolve the record once, up front — keeps each variant block tight.
  const req = target.kind === "request" ? requests.find(r => r.id === target.id) ?? null : null;
  const myFor = target.kind === "prayer-for" ? prayersFor.find(p => p.id === target.id) ?? null : null;
  const fromMe = target.kind === "prayer-from" ? prayersFrom.find(p => p.id === target.id) ?? null : null;

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
                  style={{ color: "#F0EDE6", fontFamily: "Playfair Display, Georgia, serif" }}
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
                      if (window.confirm("Delete this prayer request? This can't be undone.")) {
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

          {/* ── Prayer I'm holding for someone ──────────────────────────── */}
          {myFor && (() => {
            const w = calendarPrayerWindow(myFor.startedAt, myFor.expiresAt, myFor.durationDays);
            return (
              <>
                <div className="flex items-center gap-3 mb-4">
                  {myFor.recipientAvatarUrl ? (
                    <img
                      src={myFor.recipientAvatarUrl}
                      alt={myFor.recipientName}
                      className="w-12 h-12 rounded-full object-cover shrink-0"
                      style={{ border: "1px solid rgba(46,107,64,0.35)" }}
                    />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                      style={{ background: "#1A4A2E", color: "#A8C5A0" }}
                    >
                      {initials(myFor.recipientName)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold truncate" style={{ color: "#F0EDE6" }}>
                      {myFor.recipientName}
                    </p>
                    <p className="text-[11px]" style={{ color: "rgba(168,197,160,0.75)" }}>
                      Day {w.day} of {w.totalDays} · {w.daysLeft} {w.daysLeft === 1 ? "day" : "days"} left
                    </p>
                  </div>
                </div>

                <p
                  className="text-base leading-relaxed italic mb-5"
                  style={{ color: "#F0EDE6", fontFamily: "Playfair Display, Georgia, serif", whiteSpace: "pre-wrap" }}
                >
                  {myFor.prayerText}
                </p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => renewPrayerFor.mutate({ id: myFor.id, days: 7 })}
                    disabled={renewPrayerFor.isPending}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
                    style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                  >
                    🔄 Renew 7 more days
                  </button>
                  <button
                    type="button"
                    onClick={() => endPrayerFor.mutate(myFor.id)}
                    disabled={endPrayerFor.isPending}
                    className="py-3 px-4 rounded-xl text-sm italic disabled:opacity-40"
                    style={{ background: "rgba(200,212,192,0.08)", color: "rgba(143,175,150,0.75)", border: "1px solid rgba(46,107,64,0.2)" }}
                  >
                    End prayer
                  </button>
                </div>
              </>
            );
          })()}

          {/* ── Someone is praying for me ──────────────────────────────── */}
          {fromMe && (
            <>
              <div className="flex items-center gap-3 mb-4">
                {fromMe.prayerAvatarUrl ? (
                  <img
                    src={fromMe.prayerAvatarUrl}
                    alt={fromMe.prayerName}
                    className="w-12 h-12 rounded-full object-cover shrink-0"
                    style={{ border: "1px solid rgba(193,154,58,0.35)" }}
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                    style={{ background: "#3A2E14", color: "#E4C97C" }}
                  >
                    {initials(fromMe.prayerName)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold truncate" style={{ color: "#F0EDE6" }}>
                    {fromMe.prayerName}
                  </p>
                  <p className="text-[11px]" style={{ color: "rgba(228,201,124,0.75)" }}>
                    {formatPrayingSince(fromMe.startedAt)}
                  </p>
                </div>
              </div>

              {fromMe.prayerText && (
                <p
                  className="text-base leading-relaxed italic"
                  style={{ color: "#F0EDE6", fontFamily: "Playfair Display, Georgia, serif", whiteSpace: "pre-wrap" }}
                >
                  {fromMe.prayerText}
                </p>
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

  const { data: prayersForMine = [] } = useQuery<MyActivePrayerFor[]>({
    queryKey: ["/api/prayers-for/mine"],
    queryFn: () => apiRequest("GET", "/api/prayers-for/mine"),
    enabled: !!user,
  });

  const { data: prayersForMe = [] } = useQuery<PrayerForMe[]>({
    queryKey: ["/api/prayers-for/for-me"],
    queryFn: () => apiRequest("GET", "/api/prayers-for/for-me"),
    enabled: !!user,
  });

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

  const [detail, setDetail] = useState<DetailTarget | null>(null);
  // When non-null, the page collapses to a single category + a back button.
  // When null, all four sections are visible, each clamped to ~3.5 cards
  // with a scroll + fade so the list reads as "peek, don't bury."
  const [focused, setFocused] = useState<SectionKey | null>(null);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  // Filter each list with the same final-day rule we use elsewhere — a
  // prayer on Day N of N is visually "done" even if the server hasn't
  // technically marked it expired yet. Matches the People page + prayer
  // slideshow behaviour so nothing ghosts across surfaces.
  const activePrayersFor = prayersForMine.filter((p) => {
    if (p.expired) return false;
    const w = calendarPrayerWindow(p.startedAt, p.expiresAt, p.durationDays);
    return w.daysLeft > 0;
  });

  const intercessions = (momentsData?.moments ?? []).filter(
    (m) => m.templateType === "intercession",
  );
  const intercessionsSorted = [
    ...intercessions.filter((m) => m.windowOpen),
    ...intercessions.filter((m) => !m.windowOpen),
  ];

  const othersRequests = prayerRequests.filter((r) => !r.isAnswered && !r.isOwnRequest);
  const ownRequests = prayerRequests.filter((r) => !r.isAnswered && r.isOwnRequest);
  // Others first, your own request last — the feed is for carrying
  // other people's prayers; your own belongs at the bottom as the tail
  // reminder rather than at the top.
  const allRequests = [...othersRequests, ...ownRequests];

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pb-24">
        {/* Header */}
        <div className="mb-4">
          <h1
            className="text-2xl font-bold"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Prayer List 🙏🏽
          </h1>
          <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>
            Carrying what your community is carrying.
          </p>
        </div>

        {/* Compose bar — same input shape as the home-page prayer
            section. Tapping 🙏🏽 opens a centered popup asking whether
            the prayer is for the viewer (→ prayer request for yourself)
            or for someone else (→ pray-for-new flow). */}
        {focused === null && <PrayerListComposeBar />}

        {/* Back button when drilled into a single category */}
        {focused !== null && (
          <button
            type="button"
            onClick={() => setFocused(null)}
            className="mt-1 mb-1 inline-flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-opacity hover:opacity-80"
            style={{ color: "#A8C5A0" }}
          >
            <ChevronLeft size={16} />
            <span className="text-[12px] font-medium">All prayers</span>
          </button>
        )}

        {/* Community intercessions — intercession practices */}
        {intercessionsSorted.length > 0 && (focused === null || focused === "intercessions") && (
          <SectionShell
            id="intercessions"
            label="Community intercessions"
            count={intercessionsSorted.length}
            focused={focused}
            onFocus={setFocused}
          >
            {intercessionsSorted.map((m) => (
              <IntercessionCard key={m.id} moment={m} viewerEmail={user.email ?? ""} />
            ))}
          </SectionShell>
        )}

        {/* Prayer Requests */}
        {allRequests.length > 0 && (focused === null || focused === "requests") && (
          <SectionShell
            id="requests"
            label="Prayer Requests"
            count={allRequests.length}
            focused={focused}
            onFocus={setFocused}
          >
            {allRequests.map((r) => (
              <RequestCard
                key={r.id}
                req={r}
                viewerAvatarUrl={user.avatarUrl ?? null}
                viewerName={user.name ?? null}
                onOpen={() => setDetail({ kind: "request", id: r.id })}
              />
            ))}
          </SectionShell>
        )}

        {/* Prayers I'm praying — "prayers for others" that I committed
            to. User asked (2026-04) for this section to be restored so
            the prayer list surfaces all four relationships:
            intercessions, requests, prayers-I'm-praying, prayers-for-me.
            Each section still auto-hides when empty. */}
        {activePrayersFor.length > 0 && (focused === null || focused === "prayers-for") && (
          <SectionShell
            id="prayers-for"
            label="My Prayers for Others"
            count={activePrayersFor.length}
            focused={focused}
            onFocus={setFocused}
          >
            {activePrayersFor.map((p) => (
              <PrayerForCard key={p.id} p={p} onOpen={() => setDetail({ kind: "prayer-for", id: p.id })} />
            ))}
          </SectionShell>
        )}

        {/* Prayers for you */}
        {prayersForMe.length > 0 && (focused === null || focused === "prayers-from") && (
          <SectionShell
            id="prayers-from"
            label="Prayers for You"
            count={prayersForMe.length}
            focused={focused}
            onFocus={setFocused}
          >
            {prayersForMe.map((p) => (
              <PrayerFromCard
                key={p.id}
                p={p}
                onOpen={() => setDetail({ kind: "prayer-from", id: p.id })}
              />
            ))}
          </SectionShell>
        )}

        {/* Empty state — only when every section is empty, otherwise the
            existing sections carry their own weight. */}
        {intercessionsSorted.length === 0
          && allRequests.length === 0
          && activePrayersFor.length === 0
          && prayersForMe.length === 0 && (
          <p className="text-sm italic mt-10 text-center" style={{ color: "rgba(143,175,150,0.6)" }}>
            Quiet today. Share a prayer above to start something.
          </p>
        )}
      </div>

      {/* Detail popup — tap on a non-intercession card opens this */}
      {detail && (
        <DetailModal
          target={detail}
          requests={prayerRequests}
          prayersFor={activePrayersFor}
          prayersFrom={prayersForMe}
          onClose={() => setDetail(null)}
        />
      )}

      {/* Released-prayer closing popup (unchanged) */}
      <AnimatePresence>
        {currentReleased && (
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
                  fontFamily: "Playfair Display, Georgia, serif",
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
              <button
                type="button"
                onClick={() => {
                  acknowledgeReleaseMutation.mutate(currentReleased.id);
                  if (releasedIndex + 1 < released.length) {
                    setReleasedIndex((i) => i + 1);
                  } else {
                    setReleasedIndex(0);
                  }
                }}
                className="rounded-full transition-opacity hover:opacity-90"
                style={{
                  background: "#2D5E3F",
                  color: "#F0EDE6",
                  padding: "10px 32px",
                  fontSize: 14,
                  fontWeight: 600,
                  border: "none",
                  cursor: acknowledgeReleaseMutation.isPending ? "wait" : "pointer",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                Amen 🙏🏽
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}

// ─── Compose bar ──────────────────────────────────────────────────────────
// Top-of-page input for starting a prayer. Same shape as the home-page
// PrayerSection composer, but tapping 🙏🏽 branches: a centered modal
// asks whether the prayer is for the viewer themselves (→ personal
// prayer request, same as homepage) or for someone else (→ route to
// /pray-for/new which shows the friend picker + compose form).
function PrayerListComposeBar() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [chooseOpen, setChooseOpen] = useState(false);

  const createOwnRequest = useMutation({
    mutationFn: (body: string) =>
      apiRequest("POST", "/api/prayer-requests", { body, durationDays: 3 }),
    onSuccess: () => {
      setValue("");
      setChooseOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    },
  });

  const submit = () => {
    if (!value.trim()) return;
    setChooseOpen(true);
  };

  return (
    <div className="mb-5">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Share a prayer... 🌿"
          maxLength={1000}
          className="flex-1 text-sm px-4 py-2.5 rounded-xl border placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-[#8FAF96]/40 focus:border-[#8FAF96] transition-all"
          style={{ backgroundColor: "#091A10", borderColor: "rgba(46,107,64,0.3)", color: "#F0EDE6" }}
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

      {/* Centered "who is this for?" popup */}
      <AnimatePresence>
        {chooseOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 100,
              background: "rgba(0,0,0,0.65)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
            onClick={() => !createOwnRequest.isPending && setChooseOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "#0F2818",
                border: "1px solid rgba(46,107,64,0.45)",
                borderRadius: 20,
                boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
                padding: 24,
                maxWidth: 400,
                width: "100%",
                textAlign: "center",
                fontFamily: "'Space Grotesk', sans-serif",
                color: "#F0EDE6",
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "rgba(143,175,150,0.75)",
                  marginBottom: 8,
                }}
              >
                Who is this prayer for?
              </p>
              <p
                className="mb-5"
                style={{
                  fontSize: 15,
                  lineHeight: 1.5,
                  color: "rgba(240,237,230,0.9)",
                  fontStyle: "italic",
                  fontFamily: "Playfair Display, Georgia, serif",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                "{value.trim()}"
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => createOwnRequest.mutate(value.trim())}
                  disabled={createOwnRequest.isPending}
                  className="rounded-full transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{
                    background: "#2D5E3F",
                    color: "#F0EDE6",
                    padding: "11px 20px",
                    fontSize: 14,
                    fontWeight: 600,
                    border: "none",
                    cursor: createOwnRequest.isPending ? "wait" : "pointer",
                  }}
                >
                  {createOwnRequest.isPending ? "Sharing…" : "For me · share with my garden"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChooseOpen(false);
                    // The /pray-for/new page has its own compose
                    // textarea; we don't pass the body through since
                    // the shape there is richer (duration, etc.).
                    setLocation("/pray-for/new");
                  }}
                  className="rounded-full transition-opacity hover:opacity-90"
                  style={{
                    background: "rgba(46,107,64,0.18)",
                    color: "#A8C5A0",
                    border: "1px solid rgba(46,107,64,0.35)",
                    padding: "11px 20px",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  For someone else · start a prayer
                </button>
                <button
                  type="button"
                  onClick={() => setChooseOpen(false)}
                  className="transition-opacity hover:opacity-80"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "rgba(143,175,150,0.55)",
                    fontSize: 12,
                    padding: "6px 0 0",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
