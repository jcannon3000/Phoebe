import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { Plus, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useListRituals } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { PrayerSection } from "@/components/prayer-section";
import { apiRequest } from "@/lib/queryClient";
import { format, isToday, parseISO, addDays, isBefore, startOfDay } from "date-fns";

// ─── Shared types ───────────────────────────────────────────────────────────

type Correspondence = {
  id: number;
  name: string;
  groupType: string;
  unreadCount: number;
  members: Array<{ name: string | null; email: string; homeCity: string | null }>;
  recentPostmarks: Array<{ authorName: string; city: string; sentAt: string }>;
  currentPeriod: {
    periodNumber: number;
    periodLabel: string;
    hasWrittenThisPeriod: boolean;
    isLastThreeDays: boolean;
    membersWritten: Array<{ name: string; hasWritten: boolean }>;
  };
};

type Moment = {
  id: number;
  name: string;
  templateType: string | null;
  intention: string;
  currentStreak: number;
  totalBlooms: number;
  state: string;
  memberCount: number;
  members: Array<{ name: string; email: string }>;
  todayPostCount: number;
  windowOpen: boolean;
  intercessionTopic?: string | null;
  fastingFrom?: string | null;
  myUserToken: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dayLabel(date: Date): string {
  if (isToday(date)) return "Today";
  const tomorrow = addDays(startOfDay(new Date()), 1);
  if (startOfDay(date).getTime() === tomorrow.getTime()) return "Tomorrow";
  return format(date, "EEEE");
}

const CARD_STYLE = {
  background: "#0F2818",
  border: "1px solid rgba(200, 212, 192, 0.25)",
  boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
  padding: "18px",
} as const;

const PILL_STYLE = { background: "#2D5E3F", color: "#F0EDE6" } as const;

// ─── FAB ─────────────────────────────────────────────────────────────────────

function FAB() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-2 mb-1"
          >
            <button
              onClick={() => { setOpen(false); setLocation("/moment/new"); }}
              className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
              style={{ background: "#0F2818", border: "1px solid rgba(200,212,192,0.25)", minWidth: 220, boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
            >
              <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>🌱 Start a practice</p>
              <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>Letters, prayer, fasting & more</p>
            </button>
            <button
              onClick={() => { setOpen(false); setLocation("/tradition/new"); }}
              className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
              style={{ background: "#0F2818", border: "1px solid rgba(200,212,192,0.25)", minWidth: 220, boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
            >
              <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>🕯️ Start a gathering</p>
              <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>Meet together regularly</p>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform"
        style={{ background: "#1A4A2E", color: "#F0EDE6" }}
      >
        <motion.div animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.2 }}>
          {open ? <X size={24} /> : <Plus size={24} />}
        </motion.div>
      </button>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-lg font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
        {label}
      </h2>
      <div className="flex-1 h-px" style={{ background: "rgba(200, 212, 192, 0.15)" }} />
    </div>
  );
}

// ─── Practice type emoji lookup ──────────────────────────────────────────────

const PRACTICE_EMOJI: Record<string, string> = {
  "morning-prayer": "🌅",
  "evening-prayer": "🌙",
  "intercession": "🙏",
  "contemplative": "🕯️",
  "fasting": "🌿",
  "listening": "🎵",
  "custom": "🌱",
};

// ─── Today Section ───────────────────────────────────────────────────────────

function TodaySection({
  letterItems,
  openMoments,
  todayGatherings,
}: {
  letterItems: Array<{ id: number; title: string; subtitle: string; writeHref: string; readHref?: string; isUnread: boolean }>;
  openMoments: Array<any>;
  todayGatherings: Array<any>;
}) {
  const hasItems = letterItems.length > 0 || openMoments.length > 0 || todayGatherings.length > 0;
  if (!hasItems) return null;

  return (
    <div className="mb-8">
      <SectionHeader label="Today" />
      <div className="space-y-5">
        {letterItems.map((item) => (
          <Link key={`today-letter-${item.id}`} href={item.isUnread ? item.readHref! : item.writeHref}>
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl cursor-pointer"
              style={CARD_STYLE}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold" style={{ color: "#F0EDE6" }}>{item.title}</p>
                  <p className="text-sm mt-0.5" style={{ color: "#A8C5A0" }}>{item.subtitle}</p>
                </div>
                <span
                  className="text-sm font-semibold rounded-full px-4 py-2 shrink-0"
                  style={PILL_STYLE}
                >
                  {item.isUnread ? "Read →" : "Write →"}
                </span>
              </div>
            </motion.div>
          </Link>
        ))}

        {openMoments.map((m: any) => {
          const isMorningPrayer = m.templateType === "morning-prayer";
          const href = (isMorningPrayer && m.myUserToken)
            ? `/morning-prayer/${m.id}/${m.myUserToken}`
            : `/moments/${m.id}`;
          const cta = isMorningPrayer ? "Open Office →" : "Pray →";
          return (
            <Link key={`today-moment-${m.id}`} href={href}>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl cursor-pointer"
                style={CARD_STYLE}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold" style={{ color: "#F0EDE6" }}>{m.name}</p>
                    <p className="text-sm mt-0.5" style={{ color: "#A8C5A0" }}>Open now</p>
                  </div>
                  <span className="text-sm font-semibold rounded-full px-4 py-2 shrink-0" style={PILL_STYLE}>
                    {cta}
                  </span>
                </div>
              </motion.div>
            </Link>
          );
        })}

        {todayGatherings.map((r: any) => {
          const next = parseISO(r.nextMeetupDate);
          const participants: Array<any> = r.participants ?? [];
          const names = participants.slice(0, 3).map((p: any) => (p.name || p.email || "").split(" ")[0]).join(", ");
          return (
            <Link key={`today-gathering-${r.id}`} href={`/ritual/${r.id}`}>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl cursor-pointer"
                style={CARD_STYLE}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold" style={{ color: "#F0EDE6" }}>{r.name}</p>
                    <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>
                      {format(next, "h:mm a")}{names ? ` · ${names}` : ""}
                    </p>
                  </div>
                  <span
                    className="text-xs font-semibold rounded-full px-3 py-1.5 shrink-0"
                    style={{ background: "rgba(45,94,63,0.4)", color: "#A8C5A0", border: "1px solid rgba(168,197,160,0.3)" }}
                  >
                    Today
                  </span>
                </div>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── This Week Section ───────────────────────────────────────────────────────

function ThisWeekSection({
  letterItems,
  weekGatherings,
}: {
  letterItems: Array<{ id: number; title: string; subtitle: string; href: string; isUnread: boolean }>;
  weekGatherings: Array<any>;
}) {
  const hasItems = letterItems.length > 0 || weekGatherings.length > 0;
  if (!hasItems) return null;

  return (
    <div className="mb-8">
      <SectionHeader label="This week" />
      <div className="space-y-5">
        {letterItems.map((item) => (
          <Link key={`week-letter-${item.id}`} href={item.href}>
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl cursor-pointer"
              style={CARD_STYLE}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold" style={{ color: "#F0EDE6" }}>{item.title}</p>
                  <p className="text-sm mt-0.5" style={{ color: "#A8C5A0" }}>{item.subtitle}</p>
                </div>
                <span
                  className="text-sm font-semibold rounded-full px-4 py-2 shrink-0"
                  style={PILL_STYLE}
                >
                  {item.isUnread ? "Read →" : "Write →"}
                </span>
              </div>
            </motion.div>
          </Link>
        ))}

        {weekGatherings.map((r: any) => {
          const next = parseISO(r.nextMeetupDate);
          const participants: Array<any> = r.participants ?? [];
          const names = participants.slice(0, 3).map((p: any) => (p.name || p.email || "").split(" ")[0]).join(", ");
          return (
            <Link key={`week-gathering-${r.id}`} href={`/ritual/${r.id}`}>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl cursor-pointer"
                style={CARD_STYLE}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold" style={{ color: "#F0EDE6" }}>{r.name}</p>
                    <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>
                      {format(next, "EEEE")} · {format(next, "h:mm a")}{names ? ` · ${names}` : ""}
                    </p>
                  </div>
                  <span
                    className="text-xs font-semibold rounded-full px-3 py-1.5 shrink-0"
                    style={{ background: "rgba(45,94,63,0.4)", color: "#A8C5A0", border: "1px solid rgba(168,197,160,0.3)" }}
                  >
                    {format(next, "EEEE")}
                  </span>
                </div>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Letters Section ─────────────────────────────────────────────────────────

function LettersSection({
  letters,
  userEmail,
  userName,
}: {
  letters: Correspondence[];
  userEmail: string;
  userName: string;
}) {
  return (
    <div className="mb-8">
      <SectionHeader label="Letters" />

      {letters.length === 0 ? (
        <div
          className="rounded-xl p-5 text-center"
          style={{ background: "transparent", border: "1px dashed rgba(200, 212, 192, 0.25)" }}
        >
          <p className="text-sm mb-3" style={{ color: "#8FAF96" }}>No letters yet. Start a correspondence. 📮</p>
          <Link href="/letters/new">
            <span className="text-sm font-semibold" style={{ color: "#A8C5A0" }}>Start writing →</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {letters.map((c) => {
            const isOneToOne = c.groupType === "one_to_one";
            const otherMembers = c.members
              .filter(m => m.email !== userEmail)
              .map(m => m.name || m.email.split("@")[0])
              .join(", ");

            const iWrote = c.currentPeriod.membersWritten.find(m => m.name === userName)?.hasWritten ?? false;
            const theyWrote = c.currentPeriod.membersWritten.find(m => m.name !== userName)?.hasWritten ?? false;
            const hasUnread = c.unreadCount > 0;
            const needsWrite = !iWrote;

            let statusText = "";
            let statusColor = "#8FAF96";

            if (hasUnread) {
              statusText = `${otherMembers} wrote 🌿`;
              statusColor = "#F0EDE6";
            } else if (iWrote && !theyWrote) {
              statusText = isOneToOne ? `Waiting for ${otherMembers}... 🌿` : `Your update is in 🌿`;
              statusColor = "#8FAF96";
            } else if (needsWrite) {
              statusText = isOneToOne ? `Your turn to write 🖋️` : `Share your update 🖋️`;
              statusColor = "#F0EDE6";
            } else {
              statusText = "All written 🌿";
              statusColor = "#8FAF96";
            }

            const shouldPulse = needsWrite || hasUnread;

            return (
              <Link key={`letter-${c.id}`} href={`/letters/${c.id}`}>
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`relative flex rounded-xl overflow-hidden cursor-pointer transition-shadow ${shouldPulse ? "animate-turn-pulse" : ""}`}
                  style={{ background: "#0F2818", border: "1px solid rgba(200, 212, 192, 0.25)", boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)" }}
                >
                  <div className={`w-1 flex-shrink-0 ${shouldPulse ? "animate-bar-pulse" : ""}`} style={{ background: shouldPulse ? undefined : "#5C8A5F" }} />
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="text-base font-semibold" style={{ color: "#F0EDE6" }}>
                          {(c.name?.replace(/^Letters with\b/, "Dialogue with")) || (isOneToOne ? `Dialogue with ${otherMembers}` : `Sharing with ${otherMembers}`)}
                        </span>
                        {hasUnread && (
                          <span
                            className="ml-2 inline-block w-2 h-2 rounded-full align-middle"
                            style={{ background: "#C8D4C0" }}
                          />
                        )}
                      </div>
                      <span className="text-[10px] font-semibold uppercase shrink-0" style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}>
                        {isOneToOne ? `Letter ${c.currentPeriod.periodNumber}` : `Week ${c.currentPeriod.periodNumber}`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-1.5">
                      <p className="text-sm font-medium" style={{ color: statusColor }}>
                        {statusText}
                      </p>
                      {needsWrite && (
                        <Link
                          href={`/letters/${c.id}/write`}
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                          <span
                            className="text-xs font-semibold rounded-full px-3 py-1.5 shrink-0"
                            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                          >
                            Write 🖋️
                          </span>
                        </Link>
                      )}
                    </div>
                  </div>
                </motion.div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Practices Section (moments only) ────────────────────────────────────────

function PracticesSection({
  moments,
  userEmail,
}: {
  moments: Moment[];
  userEmail: string;
}) {
  if (moments.length === 0) return null;

  return (
    <div className="mb-8">
      <SectionHeader label="Practices 🕯️" />
      <div className="space-y-5">
        {moments.map((m) => {
          const emoji = PRACTICE_EMOJI[m.templateType || "custom"] || "🌱";
          const shouldPulse = m.windowOpen && m.todayPostCount === 0;
          const memberNames = m.members
            .filter(p => p.email !== userEmail)
            .map(p => p.name || p.email.split("@")[0])
            .slice(0, 2)
            .join(", ");

          let subtitle = "";
          if (m.intercessionTopic) subtitle = m.intercessionTopic;
          else if (m.fastingFrom) subtitle = `Fasting from ${m.fastingFrom}`;
          else if (memberNames) subtitle = `with ${memberNames}`;

          const isMorningPrayer = m.templateType === "morning-prayer";
          const openHref = (shouldPulse && isMorningPrayer && m.myUserToken)
            ? `/morning-prayer/${m.id}/${m.myUserToken}`
            : `/moments/${m.id}`;

          return (
            <Link key={`moment-${m.id}`} href={`/moments/${m.id}`}>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`relative flex rounded-xl overflow-hidden cursor-pointer transition-shadow ${shouldPulse ? "animate-turn-pulse" : ""}`}
                style={{ background: "#0F2818", border: "1px solid rgba(200, 212, 192, 0.25)", boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)" }}
              >
                <div className={`w-1 flex-shrink-0 ${shouldPulse ? "animate-bar-pulse" : ""}`} style={{ background: shouldPulse ? undefined : "#5C8A5F" }} />
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-base font-semibold" style={{ color: "#F0EDE6" }}>
                        {m.name}
                      </span>
                    </div>
                    {m.currentStreak > 0 && (
                      <span className="text-[10px] font-semibold uppercase shrink-0" style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}>
                        {m.currentStreak} day streak
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <p className="text-sm" style={{ color: "#8FAF96" }}>
                      {subtitle || m.intention}
                    </p>
                    {m.windowOpen && m.todayPostCount === 0 && (
                      <Link href={openHref} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        <span
                          className="text-xs font-semibold rounded-full px-3 py-1.5 shrink-0"
                          style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                        >
                          {emoji} Open
                        </span>
                      </Link>
                    )}
                    {m.todayPostCount > 0 && (
                      <span className="text-xs shrink-0" style={{ color: "#8FAF96" }}>
                        {m.todayPostCount} today 🌿
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Gatherings Section ───────────────────────────────────────────────────────

function GatheringsSection({ gatherings }: { gatherings: Array<any> }) {
  return (
    <div className="mb-4">
      <SectionHeader label="Gatherings 🤝" />

      {gatherings.length === 0 ? (
        <div
          className="rounded-xl p-5 text-center"
          style={{ background: "transparent", border: "1px dashed rgba(200, 212, 192, 0.25)" }}
        >
          <p className="text-sm mb-3" style={{ color: "#8FAF96" }}>No gatherings yet. Start one.</p>
          <Link href="/tradition/new">
            <span className="text-sm font-semibold" style={{ color: "#A8C5A0" }}>Start a gathering →</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {gatherings.map((ritual: any) => {
            const next = ritual.nextMeetupDate ? parseISO(ritual.nextMeetupDate) : null;
            const rhythm = ritual.rhythm as string | undefined;
            const rhythmLabel = rhythm === "weekly" ? "weekly tradition"
              : rhythm === "biweekly" || rhythm === "fortnightly" ? "biweekly tradition"
              : rhythm === "monthly" ? "monthly tradition"
              : ritual.frequency ? `${ritual.frequency} tradition` : "recurring tradition";

            return (
              <Link key={ritual.id} href={`/ritual/${ritual.id}`}>
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative flex rounded-xl overflow-hidden cursor-pointer transition-shadow"
                  style={{ background: "#0F2818", border: "1px solid rgba(200, 212, 192, 0.25)", boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)" }}
                >
                  <div className="w-1 flex-shrink-0" style={{ background: "#5C8A5F" }} />
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-base font-semibold" style={{ color: "#F0EDE6" }}>{ritual.name}</span>
                      <span className="text-[11px]" style={{ color: "#8FAF96" }}>{rhythmLabel}</span>
                    </div>

                    {ritual.participants && (ritual.participants as any[]).length > 0 && (
                      <p className="text-sm mb-1" style={{ color: "#8FAF96" }}>
                        with {(ritual.participants as any[]).slice(0, 3).map((p: any) => (p.name || p.email || "").split(" ")[0]).join(", ")}
                        {(ritual.participants as any[]).length > 3 && ` +${(ritual.participants as any[]).length - 3}`}
                      </p>
                    )}

                    {next && (
                      <p className="text-sm" style={{ color: "#8FAF96" }}>
                        {dayLabel(next)} · {format(next, "h:mm a")}
                        {ritual.location && <> · {ritual.location}</>}
                      </p>
                    )}

                    {ritual.intercessionIntention && (
                      <p className="text-xs mt-1" style={{ color: "#8FAF96" }}>🙏 Praying for {ritual.intercessionIntention}</p>
                    )}
                    {ritual.fastingDescription && (
                      <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>🌿 Fasting together</p>
                    )}
                  </div>
                </motion.div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  // ── All data fetched at the top level ──────────────────────────────────────

  const { data: correspondences, isLoading: lettersLoading } = useQuery<Correspondence[]>({
    queryKey: ["/api/letters/correspondences"],
    queryFn: () => apiRequest("GET", "/api/letters/correspondences"),
    enabled: !!user,
  });

  const { data: momentsData, isLoading: momentsLoading } = useQuery<{ moments: Moment[] }>({
    queryKey: ["/api/moments"],
    queryFn: () => apiRequest("GET", "/api/moments"),
    enabled: !!user,
  });

  const { data: rituals, isLoading: ritualsLoading } = useListRituals({ ownerId: user?.id });

  const isLoading = lettersLoading || momentsLoading || ritualsLoading;

  // ── Deduplication logic ────────────────────────────────────────────────────

  const {
    todayLetterItems,
    todayMoments,
    todayGatherings,
    thisWeekLetterItems,
    thisWeekGatherings,
    filteredLetters,
    filteredGatherings,
    moments,
    totalCount,
  } = useMemo(() => {
    const allLetters = correspondences ?? [];
    const allMoments = momentsData?.moments ?? [];
    const allGatherings = (rituals ?? []) as Array<any>;
    const userEmail = user?.email ?? "";
    const userName = user?.name ?? "";

    const totalCount = allLetters.length + allMoments.length + allGatherings.length;

    // ── Today: letters ──────────────────────────────────────────────────────
    const todayLetterItems: Array<{ id: number; title: string; subtitle: string; writeHref: string; readHref?: string; isUnread: boolean }> = [];
    for (const c of allLetters) {
      const isOneToOne = c.groupType === "one_to_one";
      const otherMembers = c.members
        .filter(m => m.email !== userEmail)
        .map(m => m.name || m.email.split("@")[0])
        .join(", ");
      const title = (c.name?.replace(/^Letters with\b/, "Letters with")) || (isOneToOne ? `Letters with ${otherMembers}` : `Sharing with ${otherMembers}`);

      const iWrote = c.currentPeriod.membersWritten.find(m => m.name === userName)?.hasWritten ?? false;
      const hasUnread = c.unreadCount > 0;
      const needsWrite = !iWrote;

      if (hasUnread) {
        todayLetterItems.push({ id: c.id, title, subtitle: "New letter arrived", writeHref: `/letters/${c.id}`, readHref: `/letters/${c.id}`, isUnread: true });
      } else if (needsWrite) {
        todayLetterItems.push({ id: c.id, title, subtitle: "Your turn to write", writeHref: `/letters/${c.id}/write`, isUnread: false });
      }
    }

    // ── Today: moments (window open, not yet logged) ────────────────────────
    const todayMoments = allMoments.filter(m => m.windowOpen && m.todayPostCount === 0);

    // ── Today: gatherings ───────────────────────────────────────────────────
    const todayGatherings = allGatherings.filter(r => {
      if (!r.nextMeetupDate) return false;
      return isToday(parseISO(r.nextMeetupDate));
    });

    // ── This week: gatherings (next 7 days, not today) ──────────────────────
    const endOfWeek = addDays(startOfDay(new Date()), 7);
    const todayGatheringIds = new Set(todayGatherings.map((r: any) => r.id));

    const thisWeekGatherings = allGatherings.filter(r => {
      if (!r.nextMeetupDate || todayGatheringIds.has(r.id)) return false;
      const d = parseISO(r.nextMeetupDate);
      return isBefore(d, endOfWeek) && !isToday(d);
    });

    // ── This week: letters (unread that weren't shown in Today — covers
    //    "letter arrived this week" case; skip turn-based since we can't
    //    determine "due this week" from the API) ─────────────────────────────
    const todayLetterIds = new Set(todayLetterItems.map(l => l.id));
    const thisWeekLetterItems: Array<{ id: number; title: string; subtitle: string; href: string; isUnread: boolean }> = [];
    // Letters not already surfaced in Today but unread → show in This Week
    for (const c of allLetters) {
      if (todayLetterIds.has(c.id)) continue;
      if (c.unreadCount > 0) {
        const isOneToOne = c.groupType === "one_to_one";
        const otherMembers = c.members
          .filter(m => m.email !== userEmail)
          .map(m => m.name || m.email.split("@")[0])
          .join(", ");
        const title = (c.name?.replace(/^Letters with\b/, "Letters with")) || (isOneToOne ? `Letters with ${otherMembers}` : `Sharing with ${otherMembers}`);
        thisWeekLetterItems.push({ id: c.id, title, subtitle: "New letter", href: `/letters/${c.id}`, isUnread: true });
      }
    }

    // ── Surfaced IDs for deduplication ───────────────────────────────────────
    const surfacedLetterIds = new Set([
      ...todayLetterItems.map(l => l.id),
      ...thisWeekLetterItems.map(l => l.id),
    ]);
    const surfacedGatheringIds = new Set([
      ...todayGatherings.map((r: any) => r.id),
      ...thisWeekGatherings.map((r: any) => r.id),
    ]);

    // ── Filtered sections ───────────────────────────────────────────────────
    const surfacedMomentIds = new Set(todayMoments.map(m => m.id));
    const filteredLetters = allLetters.filter(c => !surfacedLetterIds.has(c.id));
    const filteredGatherings = allGatherings.filter((r: any) => !surfacedGatheringIds.has(r.id));
    const filteredMoments = allMoments.filter(m => !surfacedMomentIds.has(m.id));

    return {
      todayLetterItems,
      todayMoments,
      todayGatherings,
      thisWeekLetterItems,
      thisWeekGatherings,
      filteredLetters,
      filteredGatherings,
      moments: filteredMoments,
      totalCount,
    };
  }, [correspondences, momentsData, rituals, user]);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  return (
    <Layout>
      <div className="flex flex-col w-full pb-36">

        {/* ── Header ── */}
        <div className="mb-6">
          <p style={{ color: "#F0EDE6", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.02em" }}>
            {format(new Date(), "EEEE, d MMMM")}
          </p>
          {totalCount > 0 && (
            <p style={{ color: "#8FAF96", fontSize: "13px", fontWeight: 400 }}>
              {totalCount} {totalCount === 1 ? "thing" : "things"} happening this week
            </p>
          )}
        </div>

        {/* ── Loading skeleton ── */}
        {isLoading && (
          <div className="space-y-5 mb-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "#0F2818" }} />
            ))}
          </div>
        )}

        {!isLoading && (
          <>
            {/* ── 1. Today ── */}
            <TodaySection
              letterItems={todayLetterItems}
              openMoments={todayMoments}
              todayGatherings={todayGatherings}
            />

            {/* ── 2. This week ── */}
            <ThisWeekSection
              letterItems={thisWeekLetterItems}
              weekGatherings={thisWeekGatherings}
            />

            {/* ── 3. Letters (filtered) ── */}
            <LettersSection
              letters={filteredLetters}
              userEmail={user.email}
              userName={user.name ?? ""}
            />

            {/* ── 4. Gatherings (filtered) ── */}
            <GatheringsSection gatherings={filteredGatherings} />

            {/* ── 5. Practices (moments — never deduplicated) ── */}
            <PracticesSection moments={moments} userEmail={user.email} />
          </>
        )}

        {/* ── Prayer Requests ── */}
        <PrayerSection />

        {/* Footer */}
        <p className="text-center text-xs mt-10 mb-4 tracking-wide" style={{ color: "rgba(143, 175, 150, 0.5)" }}>
          A Sanctuary for Fellowship Inspired by Monastic Wisdom
        </p>

        {/* FAB */}
        <FAB />
      </div>
    </Layout>
  );
}
