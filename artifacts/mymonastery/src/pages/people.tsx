import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { usePeople, type PersonSummary } from "@/hooks/usePeople";
import { useGardenSocket } from "@/hooks/useGardenSocket";
import { Layout } from "@/components/layout";

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");
}

// Eleanor palette avatar colors: sage, amber, blush — assigned by email hash
const AVATAR_COLORS = [
  { bg: "rgba(46,107,64,0.15)", text: "#4a6e50" },  // sage
  { bg: "rgba(193,127,36,0.15)", text: "#8a5a18" },   // amber
  { bg: "rgba(212,137,106,0.15)", text: "#9a5a3a" },  // blush
];

const PRACTICE_EMOJI: Record<string, string> = {
  "morning-prayer": "🌅",
  "evening-prayer": "🌙",
  "intercession": "🙏🏽",
  "contemplative": "🕯️",
  "fasting": "🌿",
  "listening": "🎵",
  "custom": "🌱",
  "letters": "✉️",
};

function colorFor(email: string) {
  let hash = 0;
  for (const c of email) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

function relativeTimeAgo(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? "s" : ""} ago`;
  return `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? "s" : ""} ago`;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

// Sort: prayer requests first, then present, then by last active
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

export default function People() {
  const [location, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { data: people, isLoading } = usePeople(user?.id);
  const highlightEmail = new URLSearchParams(location.includes("?") ? location.split("?")[1] : "").get("highlight") ?? null;
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);

  // Presence
  const gardenEmails = useMemo(() => new Set((people ?? []).map(p => p.email)), [people]);
  const emptyMomentIds = useMemo(() => new Set<number>(), []);
  const { presentUsers } = useGardenSocket(user, gardenEmails, emptyMomentIds);
  const presentEmails = useMemo(() => new Set(presentUsers.map(u => u.email)), [presentUsers]);

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

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } },
  };
  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pb-20">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            Your garden 🌿
          </h1>
          <p className="mt-1" style={{ color: "#8FAF96", fontSize: "13px", fontWeight: 400 }}>
            Stay close to your community.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "#0F2818" }} />
            ))}
          </div>
        ) : !people || people.length === 0 ? (
          /* ── Empty state ─────────────────────────────────── */
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            {/* Compact empty state */}
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
                  Add people you want to stay close to
                </p>
              </div>
            </div>

            {/* Action rows */}
            <div className="space-y-3">
              <Link href="/letters/new">
                <div
                  className="flex items-center gap-4 px-4 py-4 rounded-xl cursor-pointer hover:shadow-sm transition-shadow"
                  style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.35)", boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)" }}
                >
                  <span className="text-xl">🌿</span>
                  <span className="flex-1 text-sm font-medium" style={{ color: "#F0EDE6" }}>Start a letter with someone</span>
                  <span style={{ color: "#8FAF96" }}>→</span>
                </div>
              </Link>
              <Link href="/tradition/new">
                <div
                  className="flex items-center gap-4 px-4 py-4 rounded-xl cursor-pointer hover:shadow-sm transition-shadow"
                  style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.35)", boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)" }}
                >
                  <span className="text-xl">🏡</span>
                  <span className="flex-1 text-sm font-medium" style={{ color: "#F0EDE6" }}>Create a gathering</span>
                  <span style={{ color: "#8FAF96" }}>→</span>
                </div>
              </Link>
            </div>

            <p className="text-center text-xs mt-12 tracking-wide" style={{ color: "rgba(143,175,150,0.5)" }}>
              Inspired by Monastic Wisdom
            </p>
          </motion.div>
        ) : (
          <motion.div variants={container} initial="hidden" animate="show">
            {/* ── People list ────────────────────────────────── */}
            <div className="space-y-3">
              {sorted.map((person) => {
                const isHighlighted = highlightEmail === person.email;
                const isExpanded = expandedEmail === person.email;
                const isPresent = presentEmails.has(person.email);
                const color = colorFor(person.email);
                const inactiveDays = daysSince(person.lastActiveDate);

                return (
                  <motion.div
                    key={person.email}
                    variants={item}
                    ref={isHighlighted ? highlightRef : null}
                    className="rounded-2xl overflow-hidden transition-shadow hover:shadow-lg"
                    style={{
                      background: "#0F2818",
                      border: `1px solid ${isHighlighted ? "rgba(111,175,133,0.5)" : "rgba(46,107,64,0.2)"}`,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.2)",
                    }}
                  >
                    {/* Row */}
                    <Link
                      href={`/people/${encodeURIComponent(person.email)}`}
                      className="w-full text-left flex items-start gap-4 py-5 px-4 transition-colors duration-150 hover:bg-white/[0.02]"
                    >
                      {/* Avatar */}
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center text-[15px] font-semibold flex-shrink-0 ${isPresent ? "animate-avatar-breathe" : ""}`}
                        style={{ backgroundColor: color.bg, color: color.text }}
                      >
                        {initials(person.name)}
                      </div>

                      {/* Center */}
                      <div className="flex-1 min-w-0">
                        {/* Line 1: Name */}
                        <h3 className="font-semibold text-[17px] text-foreground truncate">
                          {person.name}
                        </h3>

                        {/* Shared practices */}
                        {person.sharedPractices.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {person.sharedPractices.map(p => (
                              <div key={p.id} className="flex items-center justify-between gap-2">
                                <span className="text-sm" style={{ color: "#A8C5A0" }}>
                                  {PRACTICE_EMOJI[p.templateType ?? "custom"] ?? "🌱"}{" "}
                                  {p.name}
                                </span>
                                {p.currentStreak > 0 && (
                                  <span className="text-xs shrink-0" style={{ color: "#C17F24" }}>
                                    🔥 {p.currentStreak}d
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Shared gatherings */}
                        {person.sharedTraditions.length > 0 && (
                          <div className={`space-y-1 ${person.sharedPractices.length > 0 ? "mt-1" : "mt-2"}`}>
                            {person.sharedTraditions.map(t => (
                              <div key={t.id} className="flex items-center gap-2">
                                <span className="text-sm" style={{ color: "#C8B47A" }}>
                                  🤝🏽 {t.name}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Line 3: Prayer request line — links to person detail */}
                        {person.activePrayerRequest && (
                          <Link
                            href={`/people/${encodeURIComponent(person.email)}`}
                            onClick={e => e.stopPropagation()}
                            className="mt-1.5 text-[13px] italic block hover:opacity-70 transition-opacity"
                            style={{ color: "#D4896A" }}
                          >
                            <span className="animate-prayer-pulse inline-block">🙏🏽</span> Asking for prayer · {truncate(person.activePrayerRequest.body, 40)}
                          </Link>
                        )}

                        {/* Line 3 alt: Inactive nudge */}
                        {!person.activePrayerRequest && inactiveDays >= 7 && (
                          <p className="mt-1.5 text-[13px]" style={{ color: "#C17F24", opacity: 0.7 }}>
                            💧 Hasn't practiced in a while
                          </p>
                        )}
                      </div>

                      {/* Right: presence or chevron */}
                      <div className="flex-shrink-0 pt-1">
                        {isPresent ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-block w-2 h-2 rounded-full"
                              style={{
                                backgroundColor: "#5C7A5F",
                                animation: "presence-dot-pulse 2s ease-in-out infinite",
                              }}
                            />
                            <span className="text-xs font-medium" style={{ color: "#5C7A5F" }}>
                              Here now 🌿
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/30 text-lg">→</span>
                        )}
                      </div>
                    </Link>

                    {/* Expanded accordion */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-6 pl-20 space-y-5">
                            {/* Shared practices */}
                            {person.sharedPractices.length > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: "#5C7A5F" }}>
                                  Practices together
                                </p>
                                <div className="space-y-2">
                                  {person.sharedPractices.map(practice => (
                                    <Link
                                      key={practice.id}
                                      href={`/moments/${practice.id}`}
                                      className="flex items-center justify-between py-1.5 group/row"
                                    >
                                      <span className="text-sm text-foreground/80 group-hover/row:text-foreground transition-colors">
                                        {practice.templateType === "intercession" ? "🙏🏽" : practice.templateType === "contemplative" ? "🕯️" : practice.templateType === "morning-prayer" ? "✨" : practice.templateType === "evening-prayer" ? "🌙" : practice.templateType === "fasting" ? "🌿" : practice.templateType === "listening" ? "🎵" : "🌱"}{" "}
                                        {practice.name}
                                      </span>
                                      <span className={`text-xs ${practice.currentStreak >= 3 ? "animate-streak-glow" : ""}`} style={{ color: practice.currentStreak > 0 ? "#C17F24" : "#5C7A5F" }}>
                                        {practice.currentStreak > 0
                                          ? `🔥 ${practice.currentStreak} day${practice.currentStreak !== 1 ? "s" : ""}`
                                          : "🌱 Just beginning"}
                                      </span>
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Shared traditions */}
                            {person.sharedTraditions.length > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: "#C17F24" }}>
                                  Traditions together
                                </p>
                                <div className="space-y-2">
                                  {person.sharedTraditions.map(tradition => (
                                    <Link
                                      key={tradition.id}
                                      href={`/traditions/${tradition.id}`}
                                      className="flex items-center py-1.5 text-sm text-foreground/80 hover:text-foreground transition-colors"
                                    >
                                      🌱 {tradition.name}
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Prayer request section */}
                            {person.activePrayerRequest && (
                              <div>
                                <p className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: "#D4896A" }}>
                                  Held in prayer
                                </p>
                                <div
                                  className="rounded-lg p-3 border-l-2 relative overflow-hidden"
                                  style={{
                                    backgroundColor: "rgba(212,137,106,0.04)",
                                    borderLeftColor: "#D4896A",
                                  }}
                                >
                                  <p className="text-sm text-foreground/80 leading-relaxed">
                                    {person.activePrayerRequest.body}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Invite link */}
                            <Link
                              href="/moment/new"
                              className="inline-block text-[13px] font-medium transition-colors hover:opacity-80"
                              style={{ color: "#5C7A5F" }}
                            >
                              + Invite {person.name.split(" ")[0]} to something new 🌿
                            </Link>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

      </div>
    </Layout>
  );
}
