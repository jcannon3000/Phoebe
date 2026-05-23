import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { usePeople, type PersonSummary } from "@/hooks/usePeople";
import { useGardenSocket } from "@/hooks/useGardenSocket";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
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

function sortPeople(people: PersonSummary[], presentEmails: Set<string>): PersonSummary[] {
  return [...people].sort((a, b) => {
    const aPrayer = a.activePrayerRequest ? 1 : 0;
    const bPrayer = b.activePrayerRequest ? 1 : 0;
    if (aPrayer !== bPrayer) return bPrayer - aPrayer;
    const aPresent = presentEmails.has(a.email) ? 1 : 0;
    const bPresent = presentEmails.has(b.email) ? 1 : 0;
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
  const { data: people, isLoading } = usePeople(user?.id);
  const highlightEmail = new URLSearchParams(location.includes("?") ? location.split("?")[1] : "").get("highlight") ?? null;
  const highlightRef = useRef<HTMLDivElement | null>(null);
  // Search query for the top-of-page filter. Lives in component state
  // so a query is preserved while the user scrolls + interacts with
  // cards but is dropped on navigation away.
  const [searchQuery, setSearchQuery] = useState("");

  const gardenEmails = useMemo(() => new Set((people ?? []).map(p => p.email)), [people]);
  const emptyMomentIds = useMemo(() => new Set<number>(), []);
  const { presentUsers } = useGardenSocket(user, gardenEmails, emptyMomentIds);
  const presentEmails = useMemo(() => new Set(presentUsers.map(u => u.email)), [presentUsers]);

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

  const sorted = people ? sortPeople(people, presentEmails) : [];
  // Case-insensitive name + email + active-prayer-text match. Trimmed
  // empty query falls through and the full sorted list renders, so
  // the search bar acts as a filter overlay rather than a separate
  // mode. Matched on name + email so power users can paste an email
  // straight in; matched on activePrayerRequest body so a user
  // searching "moving" finds whoever asked for moving prayers.
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filtered = trimmedQuery.length === 0
    ? sorted
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
            Stay close to your community
          </p>
          <h1 style={{ color: "#F0EDE6", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.02em" }}>
            People 🌿
          </h1>
        </div>

        {/* Search bar — filters the garden list by name, email, or
            active prayer-request body. Sits above the find-friends
            entry so it's the first interactive element on the page,
            and the user-flow reads "search → find → write a prayer"
            top to bottom. Empty query falls through and the full
            sorted list renders. */}
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
            placeholder="Search your garden"
            aria-label="Search your garden"
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

        {/* Find friends entry — native-only. The underlying flow reads
            iOS Contacts via the Capacitor plugin, which doesn't exist
            on the plain web build; showing the card there dropped
            users onto a "open Phoebe on iOS" dead-end. Gate on
            PhoebeNative.isNative() and hide entirely on web. */}
        <FindFriendsEntry />

        {/* Section divider */}
        <div className="flex items-center gap-2 mb-3">
          <p className="text-[11px] font-bold" style={{ color: "#F0EDE6" }}>Your garden</p>
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
                  Your garden is empty
                </p>
                <p className="mt-0.5" style={{ color: "#8FAF96", fontSize: "13px" }}>
                  Start a practice with someone to see them here
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
                <p className="font-semibold" style={{ color: "#F0EDE6", fontSize: "15px", fontFamily: "'Space Grotesk', sans-serif" }}>
                  No matches
                </p>
                <p className="mt-0.5" style={{ color: "#8FAF96", fontSize: "13px" }}>
                  Nobody in your garden matches "{searchQuery.trim()}"
                </p>
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
                    isPresent={presentEmails.has(person.email)}
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
      </div>
    </Layout>
  );
}
