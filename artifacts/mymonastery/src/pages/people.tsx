import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { usePeople, type PersonSummary } from "@/hooks/usePeople";
import { useGardenSocket } from "@/hooks/useGardenSocket";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { FellowsConnect } from "@/components/FellowsConnect";
import { WalkTogether } from "@/components/WalkTogether";
import { EncouragementBanner } from "@/components/EncouragementBanner";
import { useBetaStatus } from "@/hooks/useDemo";
import type { MyActivePrayerFor, PrayerForMe } from "@/components/pray-for-them";

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");
}

const AVATAR_COLORS = [
  { bg: "rgba(46,107,64,0.15)", text: "#4a6e50" },
  { bg: "rgba(193,127,36,0.15)", text: "#8a5a18" },
  { bg: "rgba(212,137,106,0.15)", text: "#9a5a3a" },
];

const PRACTICE_EMOJI: Record<string, string> = {
  "morning-prayer": "🌅",
  "evening-prayer": "🌙",
  "intercession": "🙏🏽",
  "contemplative": "🕯️",
  "fasting": "🌿",
  "lectio-divina": "📜",
  "custom": "🌱",
};

function colorFor(email: string) {
  let hash = 0;
  for (const c of email) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function sortPeople(people: PersonSummary[], presentUserIds: Set<number>): PersonSummary[] {
  return [...people].sort((a, b) => {
    // Primary: people you've prayed for most (most Amens you've tapped
    // on their requests) rise to the top.
    const aAmens = a.myAmenCount ?? 0;
    const bAmens = b.myAmenCount ?? 0;
    if (aAmens !== bAmens) return bAmens - aAmens;
    // Tiebreakers (incl. everyone at 0 amens): an active request first,
    // then who's present now, then most recently active.
    const aPrayer = a.activePrayerRequest ? 1 : 0;
    const bPrayer = b.activePrayerRequest ? 1 : 0;
    if (aPrayer !== bPrayer) return bPrayer - aPrayer;
    const aPresent = a.userId != null && presentUserIds.has(a.userId) ? 1 : 0;
    const bPresent = b.userId != null && presentUserIds.has(b.userId) ? 1 : 0;
    if (aPresent !== bPresent) return bPresent - aPresent;
    return new Date(b.lastActiveDate).getTime() - new Date(a.lastActiveDate).getTime();
  });
}

/* ── Split-flap rotating subtitle ───────────────────────────────────── */

const FLAP_CSS = `
.pf-root { height: 20px; overflow: hidden; position: relative; }
.pf-line { position: absolute; left: 0; right: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
           font-size: 13px; line-height: 20px; color: #8FAF96; }
.pf-line-out { animation: pf-out 200ms ease-in forwards; }
.pf-line-in  { animation: pf-in  260ms ease-out forwards; }
@keyframes pf-out { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-6px); } }
@keyframes pf-in  { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
`;

type FlapPhase = "show" | "out" | "blank" | "in";

function RotatingLine({ lines }: { lines: string[] }) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<FlapPhase>("show");

  useEffect(() => {
    setIdx(0);
    setPhase("show");
  }, [lines.join("|")]);

  useEffect(() => {
    if (lines.length <= 1) return;
    const delays: Record<FlapPhase, number> = { show: 4000, out: 200, blank: 140, in: 260 };
    const t = setTimeout(() => {
      if (phase === "show") setPhase("out");
      else if (phase === "out") setPhase("blank");
      else if (phase === "blank") { setIdx(i => (i + 1) % lines.length); setPhase("in"); }
      else setPhase("show");
    }, delays[phase]);
    return () => clearTimeout(t);
  }, [phase, lines.length]);

  if (lines.length === 0) return null;
  if (lines.length === 1) return <div className="pf-root"><div className="pf-line">{lines[0]}</div></div>;

  const text = lines[idx] ?? "";
  const visible = phase !== "blank";
  const cls = phase === "out" ? "pf-line-out" : phase === "in" ? "pf-line-in" : "";

  return (
    <div className="pf-root">
      {visible && <div className={`pf-line ${cls}`}>{text}</div>}
    </div>
  );
}

/* ── Person card ─────────────────────────────────────────────────────── */

function PersonCard({
  person,
  isPresent,
  iPrayFor,
  prayForMe,
  isFellow,
  activePrayerFor,
  activePrayerForMe,
}: {
  person: PersonSummary;
  isPresent: boolean;
  iPrayFor: boolean;
  prayForMe: boolean;
  // True when the viewer + this person are linked via a Fellow row.
  // Drives a small "Fellow" pill on the card so a user can tell
  // who they connected with via a share-link Amen flow vs through
  // a normal community / letter path.
  isFellow: boolean;
  activePrayerFor: MyActivePrayerFor | null;
  activePrayerForMe: PrayerForMe | null;
}) {
  const [, setLocation] = useLocation();
  const color = colorFor(person.email);

  // Build rotating subtitle lines
  const practiceNames = person.sharedPractices.map(p => {
    const emoji = PRACTICE_EMOJI[p.templateType ?? "custom"] ?? "🌱";
    return `${emoji} ${p.name}`;
  });
  const traditionNames = person.sharedTraditions.map(t => `🤝🏽 ${t.name}`);
  const allNames = [...practiceNames, ...traditionNames];

  const prayerLine = person.activePrayerRequest
    ? `🙏🏽 ${truncate(person.activePrayerRequest.body, 40)}`
    : "";

  // When the person has an active prayer request, pin it as the second
  // line with no rotation — their ask is the thing to surface, not a
  // rotating shared-practice label. Only fall back to the practice
  // ticker when there's no prayer request to carry.
  const flapLines = prayerLine
    ? [prayerLine]
    : allNames.filter(s => s.length > 0);

  // Best streak across shared practices
  const bestStreak = Math.max(person.maxSharedStreak, ...person.sharedPractices.map(p => p.currentStreak), 0);

  // CTA destination: if the user already has an active prayer for this
  // person, the button links to the detail page; otherwise it opens the
  // authoring flow. Matches the button on the person profile detail page.
  const prayerHref = iPrayFor
    ? `/pray-for/${encodeURIComponent(person.email)}`
    : `/pray-for/new/${encodeURIComponent(person.email)}`;

  // Active prayer card details — calendar-day math so "Day 2" shows the
  // morning after a prayer was started, not after a full 24h elapses.
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

  let prayerDayLabel = "";
  let daysRemaining = 0;
  if (activePrayerFor) {
    const w = calendarPrayerWindow(activePrayerFor.startedAt, activePrayerFor.expiresAt, activePrayerFor.durationDays);
    prayerDayLabel = `Day ${w.day} of ${w.totalDays}`;
    daysRemaining = w.daysLeft;
  }

  let prayerForMeDayLabel = "";
  let prayerForMeDaysRemaining = 0;
  if (activePrayerForMe) {
    const w = calendarPrayerWindow(activePrayerForMe.startedAt, activePrayerForMe.expiresAt);
    prayerForMeDayLabel = `Day ${w.day} of ${w.totalDays}`;
    prayerForMeDaysRemaining = w.daysLeft;
  }

  return (
    <Link href={`/people/${encodeURIComponent(person.email)}`} className="block">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative flex rounded-xl overflow-hidden cursor-pointer transition-shadow hover:shadow-lg"
        style={{
          background: "#0F2818",
          border: "1px solid rgba(92,138,95,0.28)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        }}
      >
        <div className="w-1 flex-shrink-0" style={{ background: "#5C8A5F" }} />
        <div className="flex-1 px-4 pt-3 pb-2.5">
          <div className="flex items-start justify-between gap-3">
            {/* Left: avatar + text */}
            <div className="min-w-0 flex-1 flex items-start gap-2.5">
              {person.avatarUrl ? (
                <img src={person.avatarUrl} alt={person.name} className="w-8 h-8 rounded-full object-cover shrink-0" style={{ border: "1px solid rgba(46,107,64,0.3)" }} />
              ) : (
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0" style={{ background: "#1A4A2E", color: "#A8C5A0" }}>
                  {initials(person.name)}
                </div>
              )}
              <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold truncate" style={{ color: "#F0EDE6" }}>
                  {person.name}
                </span>
                {isPresent && (
                  <span
                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: "#5C7A5F" }}
                  />
                )}
                {iPrayFor && (
                  <span
                    title="You're praying for them"
                    className="text-[11px] flex-shrink-0"
                    style={{ opacity: 0.75 }}
                  >
                    🙏
                  </span>
                )}
                {prayForMe && (
                  <span
                    title={`${person.name.split(" ")[0]} is praying for you`}
                    className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: "#C19A3A", boxShadow: "0 0 6px rgba(193,154,58,0.6)" }}
                  />
                )}
                {isFellow && (
                  <span
                    title="Connected as Fellows"
                    className="text-[10px] font-semibold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      background: "rgba(46,107,64,0.22)",
                      color: "rgba(168,197,160,0.95)",
                      border: "1px solid rgba(46,107,64,0.4)",
                      fontFamily: "'Space Grotesk', sans-serif",
                    }}
                  >
                    Fellow
                  </span>
                )}
              </div>
              <RotatingLine lines={flapLines} />
            </div>
            </div>

            {/* Right: prayer CTA. Stop-propagation so tapping the button
                doesn't also navigate to the person's profile. */}
            <div className="shrink-0 pt-0.5">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setLocation(prayerHref);
                }}
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-opacity hover:opacity-90 active:scale-[0.98]"
                style={{
                  background: iPrayFor ? "rgba(46,107,64,0.2)" : "#2D5E3F",
                  border: iPrayFor ? "1px solid rgba(46,107,64,0.45)" : "1px solid rgba(46,107,64,0.6)",
                  color: iPrayFor ? "#A8C5A0" : "#F0EDE6",
                }}
              >
                🙏 {iPrayFor ? "View prayer" : "Write a prayer"}
              </button>
            </div>
          </div>

          {/* Active-prayer card — shown inline when you're currently
              praying for this person. Tapping goes to the detail page, same
              target as the "View prayer" button above. */}
          {activePrayerFor && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setLocation(prayerHref);
              }}
              className="mt-3 w-full text-left rounded-xl px-3 py-2.5 transition-opacity hover:opacity-90"
              style={{
                background: "rgba(46,107,64,0.18)",
                border: "1px solid rgba(46,107,64,0.35)",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] mb-1" style={{ color: "rgba(168,197,160,0.6)" }}>
                    You're praying 🙏
                  </p>
                  <p
                    className="text-[13px] italic truncate"
                    style={{ color: "#C8D4C0", fontFamily: "Georgia, 'Times New Roman', serif" }}
                  >
                    {activePrayerFor.prayerText}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-semibold" style={{ color: "#A8C5A0" }}>
                    {daysRemaining} {daysRemaining === 1 ? "day" : "days"} left
                  </p>
                  <p className="text-[9px]" style={{ color: "rgba(168,197,160,0.5)" }}>
                    {prayerDayLabel}
                  </p>
                </div>
              </div>
            </button>
          )}

          {/* Mirror card — shown when this person is currently praying for
              you. Warm amber accent to distinguish it from the green
              "You're praying" card. Read-only (the text is theirs, not
              yours to edit), so it's a div, not a button. */}
          {activePrayerForMe && (
            <div
              className="mt-3 w-full rounded-xl px-3 py-2.5"
              style={{
                background: "rgba(193,154,58,0.1)",
                border: "1px solid rgba(193,154,58,0.3)",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] mb-1" style={{ color: "rgba(217,176,82,0.7)" }}>
                    {person.name.split(" ")[0]} is praying for you 🕯️
                  </p>
                  <p
                    className="text-[13px] italic truncate"
                    style={{ color: "#E8D9B0", fontFamily: "Georgia, 'Times New Roman', serif" }}
                  >
                    {activePrayerForMe.prayerText}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-semibold" style={{ color: "#D9B052" }}>
                    {prayerForMeDaysRemaining} {prayerForMeDaysRemaining === 1 ? "day" : "days"} left
                  </p>
                  <p className="text-[9px]" style={{ color: "rgba(217,176,82,0.55)" }}>
                    {prayerForMeDayLabel}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </Link>
  );
}

/* ── (Fellows feature removed; correspondents is the new priority signal) ── */

// iOS-only entry card that deep-links into the contact-discovery flow.
// Hidden on the web build because the flow relies on the Capacitor
// Contacts plugin, which doesn't exist in a plain browser — showing
// the card there just led users to a dead page.
function FindFriendsEntry() {
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    try {
      const phoebeNative = (window as { PhoebeNative?: { isNative?: () => boolean } }).PhoebeNative;
      if (phoebeNative?.isNative?.()) setIsNative(true);
    } catch {
      /* ignore */
    }
  }, []);
  if (!isNative) return null;
  return (
    <Link href="/people/find">
      <a
        className="block w-full mb-6 px-5 py-4 rounded-2xl flex items-center gap-3 transition-opacity hover:opacity-90"
        style={{
          background: "rgba(46,107,64,0.18)",
          border: "1px solid rgba(46,107,64,0.4)",
        }}
      >
        <span style={{ fontSize: 22 }}>📱</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            Find friends on Phoebe
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
            See who in your contacts is already here
          </p>
        </div>
        <span className="text-base" style={{ color: "rgba(168,197,160,0.6)" }}>→</span>
      </a>
    </Link>
  );
}


/* ── Page ─────────────────────────────────────────────────────────────── */

export default function People() {
  const [location, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const { rawIsBeta } = useBetaStatus();
  const { data: people, isLoading } = usePeople(user?.id);
  const highlightEmail = new URLSearchParams(location.includes("?") ? location.split("?")[1] : "").get("highlight") ?? null;
  const highlightRef = useRef<HTMLDivElement | null>(null);
  // Search query for the top-of-page filter. Lives in component state
  // so a query is preserved while the user scrolls + interacts with
  // cards but is dropped on navigation away.
  const [searchQuery, setSearchQuery] = useState("");

  // Garden members by user id — presence is now matched by id (no email on the
  // wire). Email-only invites (no account) can't be present, so dropping them is
  // safe.
  const gardenUserIds = useMemo(
    () => new Set((people ?? []).map(p => p.userId).filter((id): id is number => id != null)),
    [people],
  );
  const emptyMomentIds = useMemo(() => new Set<number>(), []);
  const { presentUsers } = useGardenSocket(user, gardenUserIds, emptyMomentIds);
  const presentUserIds = useMemo(() => new Set(presentUsers.map(u => u.user_id)), [presentUsers]);

  // Fellows — durable person-to-person connections created when
  // someone signs up via a /p/:token share-link Amen. Already part
  // of the /api/people garden, so they appear in the main list; we
  // pull the dedicated list too so we can render a small "Fellow"
  // badge on their card and (later) gate a manage-fellows surface.
  type Fellow = {
    userId: number;
    name: string | null;
    email: string;
    avatarUrl: string | null;
    source: string;
    createdAt: string | null;
  };
  const { data: fellowsData } = useQuery<{ fellows: Fellow[] }>({
    queryKey: ["/api/fellows"],
    queryFn: () => apiRequest("GET", "/api/fellows"),
    enabled: !!user,
    staleTime: 30_000,
  });
  const fellowEmails = useMemo(
    () => new Set((fellowsData?.fellows ?? []).map(f => f.email.toLowerCase())),
    [fellowsData],
  );

  // Subtle "pray for" indicators — both directions. Keyed by lowercase email.
  const { data: iPrayFor = [] } = useQuery<MyActivePrayerFor[]>({
    queryKey: ["/api/prayers-for/mine"],
    queryFn: () => apiRequest("GET", "/api/prayers-for/mine"),
    enabled: !!user,
  });
  const { data: prayForMe = [] } = useQuery<PrayerForMe[]>({
    queryKey: ["/api/prayers-for/for-me"],
    queryFn: () => apiRequest("GET", "/api/prayers-for/for-me"),
    enabled: !!user,
  });
  // Match the active-prayer-card filter below: on the final day (0 days
  // left) we consider the prayer done, so the CTA resets to "Write a
  // prayer". Otherwise a just-expired-but-unacknowledged prayer keeps
  // saying "View prayer" even though the card beneath it disappeared.
  const iPrayForEmails = useMemo(
    () => {
      const now = new Date();
      const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const set = new Set<string>();
      for (const p of iPrayFor) {
        if (p.expired) continue;
        const expires = new Date(p.expiresAt);
        const expiresDay = new Date(expires.getFullYear(), expires.getMonth(), expires.getDate());
        const daysLeft = Math.max(0, Math.round((expiresDay.getTime() - todayDay.getTime()) / 86400000));
        if (daysLeft > 0) set.add(p.recipientEmail.toLowerCase());
      }
      return set;
    },
    [iPrayFor],
  );
  // Mirror the iPrayForEmails filter: a prayer that's on its final day
  // (0 days left) is visually "done" even though the server hasn't
  // marked it expired yet, so it shouldn't surface as "they're praying
  // for you" on the people card. The /prayers-for/for-me/history feed
  // still carries it for the manage-prayer-list backlog.
  const prayForMeEmails = useMemo(
    () => {
      const now = new Date();
      const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const set = new Set<string>();
      for (const p of prayForMe) {
        const expires = new Date(p.expiresAt);
        const expiresDay = new Date(expires.getFullYear(), expires.getMonth(), expires.getDate());
        const daysLeft = Math.max(0, Math.round((expiresDay.getTime() - todayDay.getTime()) / 86400000));
        if (daysLeft > 0) set.add(p.prayerEmail.toLowerCase());
      }
      return set;
    },
    [prayForMe],
  );

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [people, highlightEmail]);

  if (authLoading || !user) return null;

  const sorted = people ? sortPeople(people, presentUserIds) : [];
  // Case-insensitive name + email + active-prayer-text match. Trimmed
  // empty query falls through and the full sorted list renders, so
  // the search bar acts as a filter overlay rather than a separate
  // mode. Matched on name + email so power users can paste an email
  // straight in; matched on activePrayerRequest body so a user
  // searching "moving" finds whoever asked for moving prayers.
  const trimmedQuery = searchQuery.trim().toLowerCase();
  // Default view shows only your Fellows (your connections) — non-fellows are
  // kept off the page. Searching lifts that gate and matches across your WHOLE
  // garden (name + email + active-prayer text), so you can still find anyone you
  // pray with. (Accepting a Heart to Heart invite makes that person a Fellow, so
  // they show up here too.)
  const filtered = trimmedQuery.length === 0
    ? sorted.filter(p => fellowEmails.has(p.email.toLowerCase()))
    : sorted.filter(p => {
        if (p.name.toLowerCase().includes(trimmedQuery)) return true;
        if (p.email.toLowerCase().includes(trimmedQuery)) return true;
        const req = p.activePrayerRequest?.body ?? "";
        if (req.toLowerCase().includes(trimmedQuery)) return true;
        return false;
      });

  return (
    <Layout>
      <style>{FLAP_CSS}</style>
      <div className="max-w-2xl mx-auto w-full pb-20">
        {/* Header — matches dashboard style */}
        <div className="mb-5">
          <p className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "rgba(143,175,150,0.5)" }}>
            {t("people.eyebrow")}
          </p>
          <h1 style={{ color: "#F0EDE6", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.02em" }}>
            {t("people.title")} 🌿
          </h1>
        </div>

        {/* A fellow's 🙌 encouragement, if one's waiting. */}
        <EncouragementBanner />

        {/* Fellows — your 1:1 prayer connections, prioritized at the very
            top of the page so your closest people lead before search or the
            wider garden. Beta users can add (search / contacts) + accept
            requests; everyone sees their fellows list (fellows also form via
            shared-prayer signup). Backed by /api/fellows (the accepted link
            already feeds the garden + your prayer list). Shown when the viewer
            is beta OR already has fellows, so non-beta with none see nothing
            rather than an empty header. */}
        {(rawIsBeta || (fellowsData?.fellows?.length ?? 0) > 0) && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-[11px] font-bold" style={{ color: "#F0EDE6" }}>{t("people.fellows")}</p>
              <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.12)" }} />
            </div>
            <FellowsConnect canManage={rawIsBeta} />
          </div>
        )}

        {/* Start a Heart to Heart — the deepest 1:1: share what's on your heart
            each day and hold each other in prayer, back and forth. The dashboard
            only surfaces this once you HAVE a partner (hideWhenEmpty), so this is
            the discoverable way in to start one. Routes to the full experience. */}
        <Link href="/prayer-partner" className="block mb-6">
          <div
            className="rounded-2xl px-4 py-3.5 flex items-center gap-3 transition-opacity active:scale-[0.99]"
            style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.3)" }}
          >
            <span style={{ fontSize: 26 }}>💛</span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                {t("people.h2h_title", { defaultValue: "Start a Heart to Heart" })}
              </p>
              <p className="text-[12.5px] mt-0.5" style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}>
                {t("people.h2h_body", { defaultValue: "Pray back and forth with one person, a little each day." })}
              </p>
            </div>
            <span style={{ color: "rgba(143,175,150,0.6)", fontSize: 18 }}>›</span>
          </div>
        </Link>

        {/* Walking together — beta accountability layer on Fellows: opt in with
            a fellow to see each other's today-only rhythm dots + send a word of
            encouragement. The component renders its own header, and nothing at
            all when there's nothing to show. */}
        {rawIsBeta && <WalkTogether />}

        {/* Plans ("How About") moved to the Events page — share what you're
            going to there, and your fellows can come. (Lives in the Dashboard's
            eventsOnly view.) */}

        {/* Search bar — filters the garden list by name, email, or active
            prayer-request body. Sits directly above the garden list it filters;
            your Fellows + Plans lead the page, then search → find → garden,
            top to bottom. Empty query falls through and the full sorted list
            renders. */}
        <div className="mb-4 relative">
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 14,
              top: "50%",
              transform: "translateY(-50%)",
              color: "rgba(143,175,150,0.55)",
              fontSize: 14,
              pointerEvents: "none",
            }}
          >
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("people.search_placeholder")}
            aria-label={t("people.search_placeholder")}
            className="w-full"
            style={{
              background: "#0F2818",
              border: "1px solid rgba(46,107,64,0.35)",
              borderRadius: 999,
              color: "#F0EDE6",
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 14,
              padding: "10px 40px 10px 38px",
              outline: "none",
            }}
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                background: "rgba(46,107,64,0.18)",
                border: "1px solid rgba(46,107,64,0.35)",
                color: "#F0EDE6",
                width: 24,
                height: 24,
                borderRadius: 999,
                fontSize: 14,
                lineHeight: 1,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* Finding people from your contacts now lives on the dedicated
            /fellows page (reached from the "Add a fellow" pill), so the People
            page no longer carries a separate contacts card here. */}

        {/* The garden list is SEARCH-ONLY now — your Fellows lead the page and the
            default view no longer repeats them as a separate "garden" list below.
            Searching lifts the gate and matches across everyone you pray with. */}
        {trimmedQuery.length > 0 && (<>
        <div className="flex items-center gap-2 mb-3">
          <p className="text-[11px] font-bold" style={{ color: "#F0EDE6" }}>{t("people.your_garden")}</p>
          <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.12)" }} />
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "#0F2818" }} />
            ))}
          </div>
        ) : !people || people.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div
              className="rounded-xl px-5 py-5 mb-6 flex items-center gap-4"
              style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.35)", boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)" }}
            >
              <span style={{ fontSize: "32px" }}>🌱</span>
              <div>
                <p className="font-semibold" style={{ color: "#F0EDE6", fontSize: "16px", fontFamily: "'Space Grotesk', sans-serif" }}>
                  {t("people.empty_title")}
                </p>
                <p className="mt-0.5" style={{ color: "#8FAF96", fontSize: "13px" }}>
                  {t("people.empty_body")}
                </p>
              </div>
            </div>
          </motion.div>
        ) : filtered.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div
              className="rounded-xl px-5 py-5 mb-6 flex items-center gap-4"
              style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.35)" }}
            >
              <span style={{ fontSize: "28px" }}>🔍</span>
              <div>
                {trimmedQuery.length === 0 ? (
                  // Default view with no Fellows yet — point them at search
                  // (the garden is still there, just behind the search bar).
                  <>
                    <p className="font-semibold" style={{ color: "#F0EDE6", fontSize: "15px", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {t("people.search_garden_title", { defaultValue: "Search to find your people" })}
                    </p>
                    <p className="mt-0.5" style={{ color: "#8FAF96", fontSize: "13px" }}>
                      {t("people.search_garden_body", { defaultValue: "Everyone you pray with is here — search by name to find them." })}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold" style={{ color: "#F0EDE6", fontSize: "15px", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {t("people.no_matches_title")}
                    </p>
                    <p className="mt-0.5" style={{ color: "#8FAF96", fontSize: "13px" }}>
                      {t("people.no_matches_body", { query: searchQuery.trim() })}
                    </p>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-2">
            {filtered.map(person => {
              const isHighlighted = highlightEmail === person.email;
              return (
                <div
                  key={person.email}
                  ref={isHighlighted ? highlightRef : null}
                >
                  <PersonCard
                    person={person}
                    isPresent={person.userId != null && presentUserIds.has(person.userId)}
                    iPrayFor={iPrayForEmails.has(person.email.toLowerCase())}
                    prayForMe={prayForMeEmails.has(person.email.toLowerCase())}
                    isFellow={fellowEmails.has(person.email.toLowerCase())}
                    activePrayerFor={
                      iPrayFor.find(
                        p => {
                          if (p.recipientEmail.toLowerCase() !== person.email.toLowerCase()) return false;
                          if (p.expired) return false;
                          // Hide on the final day: "Day N of N" / "0 days left"
                          // visually implies the commitment is done. Keeping
                          // the card on screen with a 0-days-left chip makes
                          // the list feel stale. We still keep the prayer in
                          // /api/prayers-for/mine until the user explicitly
                          // acknowledges it (so tomorrow's render resolves to
                          // expired), but on the day of expiry we stop
                          // surfacing it on the People page.
                          const started = new Date(p.startedAt);
                          const expires = new Date(p.expiresAt);
                          const now = new Date();
                          const expiresDay = new Date(expires.getFullYear(), expires.getMonth(), expires.getDate());
                          const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                          const daysLeft = Math.max(0, Math.round((expiresDay.getTime() - todayDay.getTime()) / 86400000));
                          void started;
                          return daysLeft > 0;
                        }
                      ) ?? null
                    }
                    activePrayerForMe={
                      prayForMe.find(
                        p => {
                          if (p.prayerEmail.toLowerCase() !== person.email.toLowerCase()) return false;
                          // Hide on the final day ("0 days left / Day N of N")
                          // — same rule as activePrayerFor above. Past prayers
                          // still surface in the manage-prayer-list backlog
                          // via the /prayers-for/for-me/history endpoint.
                          const expires = new Date(p.expiresAt);
                          const now = new Date();
                          const expiresDay = new Date(expires.getFullYear(), expires.getMonth(), expires.getDate());
                          const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                          const daysLeft = Math.max(0, Math.round((expiresDay.getTime() - todayDay.getTime()) / 86400000));
                          return daysLeft > 0;
                        }
                      ) ?? null
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
        </>)}
      </div>
    </Layout>
  );
}
