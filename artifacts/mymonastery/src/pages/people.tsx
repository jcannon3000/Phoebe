import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { usePeople, type PersonSummary } from "@/hooks/usePeople";
import { useGardenSocket } from "@/hooks/useGardenSocket";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { Plus, X, ChevronRight } from "lucide-react";
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
  "listening": "🎵",
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
  activePrayerFor,
  activePrayerForMe,
}: {
  person: PersonSummary;
  isPresent: boolean;
  iPrayFor: boolean;
  prayForMe: boolean;
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

  const flapLines = [prayerLine, ...allNames].filter(s => s.length > 0);

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
                🙏 {iPrayFor ? "View prayer" : "Start a prayer"}
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
                    style={{ color: "#C8D4C0", fontFamily: "Playfair Display, Georgia, serif" }}
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
                    style={{ color: "#E8D9B0", fontFamily: "Playfair Display, Georgia, serif" }}
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

/* ── Fellow type ──────────────────────────────────────────────────────── */

type Fellow = {
  id: number;
  userId: number;
  name: string;
  email: string;
  note: string | null;
  avatarUrl?: string | null;
};

type PendingInviteOutbound = {
  id: number;
  recipientEmail: string;
  recipientName: string;
  recipientUserId: number | null;
  status: string;
  createdAt: string;
};

type IncomingInvite = {
  id: number;
  senderId: number;
  senderName: string;
  senderEmail: string;
  createdAt: string;
  mutualPractices: string[];
};

/* ── Invite Response Popup ───────────────────────────────────────── */

function InvitePopup({
  invites,
  onAccept,
  onDismiss,
  onClose,
}: {
  invites: IncomingInvite[];
  onAccept: (id: number) => void;
  onDismiss: (id: number) => void;
  onClose: () => void;
}) {
  const [currentIdx, setCurrentIdx] = useState(0);

  if (invites.length === 0) return null;

  const invite = invites[currentIdx % invites.length];
  if (!invite) return null;

  const firstName = invite.senderName.split(" ")[0];

  const handleAccept = () => {
    onAccept(invite.id);
    if (invites.length <= 1) {
      onClose();
    } else if (currentIdx >= invites.length - 1) {
      setCurrentIdx(0);
    }
  };

  const handleDismiss = () => {
    onDismiss(invite.id);
    if (invites.length <= 1) {
      onClose();
    } else if (currentIdx >= invites.length - 1) {
      setCurrentIdx(0);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0" style={{ background: "rgba(6,18,10,0.85)" }} onClick={onClose} />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          className="relative z-10 w-[90vw] max-w-sm rounded-3xl px-8 py-8 flex flex-col items-center text-center"
          style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)", boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}
        >
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full"
            style={{ color: "rgba(200,212,192,0.4)", background: "rgba(200,212,192,0.06)" }}
          >
            <X size={14} />
          </button>

          {invites.length > 1 && (
            <p className="text-[10px] uppercase tracking-widest mb-4" style={{ color: "rgba(143,175,150,0.45)" }}>
              {currentIdx + 1} of {invites.length}
            </p>
          )}

          {/* Avatar */}
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold mb-4"
            style={{ background: "#1A4A2E", color: "#A8C5A0", border: "2px solid rgba(92,138,95,0.35)" }}
          >
            {initials(invite.senderName)}
          </div>

          <p className="text-lg font-semibold mb-1" style={{ color: "#F0EDE6" }}>
            {invite.senderName}
          </p>

          <p className="text-sm mb-4" style={{ color: "#8FAF96" }}>
            {firstName} wants to be fellows with you on Phoebe.
          </p>

          {invite.mutualPractices.length > 0 && (
            <p className="text-xs mb-5" style={{ color: "rgba(143,175,150,0.55)" }}>
              You're both in {invite.mutualPractices.slice(0, 2).join(" and ")}
            </p>
          )}

          <div className="flex items-center gap-3 w-full">
            <button
              onClick={handleDismiss}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
              style={{ color: "#8FAF96", background: "rgba(200,212,192,0.06)", border: "1px solid rgba(46,107,64,0.2)" }}
            >
              Not now
            </button>
            <button
              onClick={handleAccept}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
              style={{ background: "#2D5E3F", color: "#F0EDE6" }}
            >
              Add as fellow
            </button>
          </div>

          {invites.length > 1 && (
            <button
              onClick={() => setCurrentIdx((i) => (i + 1) % invites.length)}
              className="mt-4 text-xs transition-opacity hover:opacity-70"
              style={{ color: "rgba(143,175,150,0.45)" }}
            >
              Next →
            </button>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ── Fellows section ─────────────────────────────────────────────────── */

function FellowsSection({ people }: { people: PersonSummary[] | undefined }) {
  const { user } = useAuth();
  // Defense in depth: even though the parent only renders this component
  // when isBeta is true, we still gate the queries here so a stale parent
  // flag can never make us hit a now-403 endpoint.
  const { isBeta } = useBetaStatus();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [showInvitePopup, setShowInvitePopup] = useState(false);

  const { data: fellowsData } = useQuery<{ fellows: Fellow[]; pendingInvites: PendingInviteOutbound[] }>({
    queryKey: ["/api/fellows"],
    queryFn: () => apiRequest("GET", "/api/fellows"),
    enabled: !!user && isBeta,
  });

  const { data: incomingData } = useQuery<{ invites: IncomingInvite[]; count: number }>({
    queryKey: ["/api/fellows/invites"],
    queryFn: () => apiRequest("GET", "/api/fellows/invites"),
    enabled: !!user && isBeta,
  });

  const acceptMutation = useMutation({
    mutationFn: (inviteId: number) => apiRequest("POST", `/api/fellows/invites/${inviteId}/accept`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fellows"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fellows/invites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fellows/invites/count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (inviteId: number) => apiRequest("POST", `/api/fellows/invites/${inviteId}/dismiss`),
  });

  const addMutation = useMutation({
    mutationFn: (email: string) => apiRequest("POST", "/api/fellows", { email }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fellows"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      setSearch("");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: number) => apiRequest("DELETE", `/api/fellows/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fellows"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    },
  });

  const fellows = fellowsData?.fellows ?? [];
  const pendingInvites = fellowsData?.pendingInvites ?? [];
  const incomingInvites = incomingData?.invites ?? [];
  const incomingCount = incomingData?.count ?? 0;
  const fellowEmails = new Set(fellows.map(f => f.email.toLowerCase()));
  const pendingEmails = new Set(pendingInvites.map(p => p.recipientEmail.toLowerCase()));

  // People available to add (from garden, not already fellows, not already invited, not self)
  const addablePeople = (people ?? []).filter(
    p => !fellowEmails.has(p.email.toLowerCase())
      && !pendingEmails.has(p.email.toLowerCase())
      && p.email.toLowerCase() !== user?.email?.toLowerCase()
  );
  const filteredAddable = search.trim()
    ? addablePeople.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.email.toLowerCase().includes(search.toLowerCase())
      )
    : addablePeople;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-bold" style={{ color: "#F0EDE6" }}>Fellows</p>
          </div>
          <p className="text-[11px] mt-0.5" style={{ color: "rgba(143,175,150,0.5)" }}>
            People you've chosen to stay close to.
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(v => !v); setSearch(""); }}
          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-full transition-opacity hover:opacity-80"
          style={{ background: "rgba(46,107,64,0.15)", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.25)" }}
        >
          {showAdd ? <X size={12} /> : <Plus size={12} />}
          {showAdd ? "Done" : "Add"}
        </button>
      </div>

      {/* Incoming invite banner */}
      {incomingCount > 0 && (
        <button
          onClick={() => setShowInvitePopup(true)}
          className="w-full flex items-center justify-between px-3 py-2.5 mb-3 rounded-xl transition-colors hover:opacity-90"
          style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.2)" }}
        >
          <span className="text-xs font-medium" style={{ color: "#A8C5A0" }}>
            {incomingCount} fellow invite{incomingCount !== 1 ? "s" : ""}
          </span>
          <ChevronRight size={14} style={{ color: "rgba(168,197,160,0.5)" }} />
        </button>
      )}

      {/* Add fellow modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-3"
          >
            <div className="rounded-xl px-4 py-3" style={{ background: "rgba(200,212,192,0.03)", border: "1px solid rgba(46,107,64,0.2)" }}>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full rounded-xl px-3 py-2 text-sm outline-none mb-2"
                style={{ background: "rgba(200,212,192,0.05)", border: "1px solid rgba(46,107,64,0.25)", color: "#F0EDE6" }}
              />
              {filteredAddable.length === 0 && search.trim() && (
                <p className="text-xs" style={{ color: "#8FAF96" }}>No one found.</p>
              )}
              {filteredAddable.length === 0 && !search.trim() && addablePeople.length === 0 && (
                <p className="text-xs" style={{ color: "#8FAF96" }}>Everyone in your garden is already a fellow.</p>
              )}
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {filteredAddable.slice(0, 10).map(p => (
                  <div key={p.email} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {p.avatarUrl ? (
                        <img src={p.avatarUrl} alt={p.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" style={{ border: "1px solid rgba(46,107,64,0.3)" }} />
                      ) : (
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                          style={{ background: "#1A4A2E", color: "#A8C5A0" }}
                        >
                          {initials(p.name)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: "#F0EDE6" }}>{p.name}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => addMutation.mutate(p.email)}
                      disabled={addMutation.isPending}
                      className="text-[10px] font-medium px-2.5 py-1 rounded-full shrink-0 transition-opacity hover:opacity-80 disabled:opacity-40"
                      style={{ background: "rgba(46,107,64,0.15)", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.25)" }}
                    >
                      + Invite
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {fellows.length === 0 && pendingInvites.length === 0 ? (
        <div className="rounded-xl px-4 py-4 text-center" style={{ background: "rgba(200,212,192,0.03)", border: "1px dashed rgba(46,107,64,0.2)" }}>
          <p className="text-xs" style={{ color: "rgba(143,175,150,0.5)" }}>
            Add the people you want to stay closest to.
            Their prayer requests will appear first.
          </p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
          {fellows.map(f => {
            const color = colorFor(f.email);
            return (
              <Link key={f.userId} href={`/people/${encodeURIComponent(f.email)}`} className="flex flex-col items-center gap-1.5 shrink-0 group">
                {f.avatarUrl ? (
                  <img src={f.avatarUrl} alt={f.name} className="w-11 h-11 rounded-full object-cover transition-shadow group-hover:shadow-lg" style={{ border: "1.5px solid rgba(92,138,95,0.35)" }} />
                ) : (
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold transition-shadow group-hover:shadow-lg"
                    style={{ background: "#1A4A2E", color: "#A8C5A0", border: "1.5px solid rgba(92,138,95,0.35)" }}
                  >
                    {initials(f.name)}
                  </div>
                )}
                <p className="text-[10px] font-medium text-center max-w-[56px] truncate" style={{ color: "#C8D4C0" }}>
                  {f.name.split(" ")[0]}
                </p>
              </Link>
            );
          })}
          {/* Pending outbound invites — muted with "Invited" label */}
          {pendingInvites.map(p => (
            <div key={`pending-${p.id}`} className="flex flex-col items-center gap-1.5 shrink-0 opacity-50">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold"
                style={{ background: "#1A4A2E", color: "#A8C5A0", border: "1.5px dashed rgba(92,138,95,0.25)" }}
              >
                {initials(p.recipientName)}
              </div>
              <p className="text-[10px] font-medium text-center max-w-[56px] truncate" style={{ color: "rgba(200,212,192,0.5)" }}>
                {p.recipientName.split(" ")[0]}
              </p>
              <p className="text-[8px] uppercase tracking-wide" style={{ color: "rgba(143,175,150,0.4)", marginTop: -2 }}>
                Invited
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Divider */}
      <div className="h-px mt-4" style={{ background: "rgba(200,212,192,0.12)" }} />

      {/* Invite popup */}
      {showInvitePopup && incomingInvites.length > 0 && (
        <InvitePopup
          invites={incomingInvites}
          onAccept={(id) => acceptMutation.mutate(id)}
          onDismiss={(id) => dismissMutation.mutate(id)}
          onClose={() => setShowInvitePopup(false)}
        />
      )}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function People() {
  const [location, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  // Fellows is currently a beta-only feature — without isBeta, the whole
  // Fellows section, its queries, and the invite popup are suppressed.
  const { isBeta } = useBetaStatus();
  const { data: people, isLoading } = usePeople(user?.id);
  const highlightEmail = new URLSearchParams(location.includes("?") ? location.split("?")[1] : "").get("highlight") ?? null;
  const highlightRef = useRef<HTMLDivElement | null>(null);

  const gardenEmails = useMemo(() => new Set((people ?? []).map(p => p.email)), [people]);
  const emptyMomentIds = useMemo(() => new Set<number>(), []);
  const { presentUsers } = useGardenSocket(user, gardenEmails, emptyMomentIds);
  const presentEmails = useMemo(() => new Set(presentUsers.map(u => u.email)), [presentUsers]);

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
  const iPrayForEmails = useMemo(
    () => new Set(iPrayFor.filter(p => !p.expired).map(p => p.recipientEmail.toLowerCase())),
    [iPrayFor],
  );
  const prayForMeEmails = useMemo(
    () => new Set(prayForMe.map(p => p.prayerEmail.toLowerCase())),
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

        {/* Fellows — beta-only */}
        {isBeta && <FellowsSection people={people} />}

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
        ) : (
          <div className="space-y-2">
            {sorted.map(person => {
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
                    activePrayerFor={
                      iPrayFor.find(
                        p => p.recipientEmail.toLowerCase() === person.email.toLowerCase() && !p.expired,
                      ) ?? null
                    }
                    activePrayerForMe={
                      prayForMe.find(
                        p => p.prayerEmail.toLowerCase() === person.email.toLowerCase(),
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
