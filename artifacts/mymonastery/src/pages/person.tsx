import { useState, useEffect } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { usePersonProfile } from "@/hooks/usePeople";
import { Layout } from "@/components/layout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Settings } from "lucide-react";
import { PrayForThemButton } from "@/components/pray-for-them";

// ─── Colors ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  { bg: "#2D5E3F", text: "#F0EDE6" },
  { bg: "#5A3D10", text: "#F0EDE6" },
  { bg: "#5A2E20", text: "#F0EDE6" },
];

const CATEGORY = {
  letters:     { bar: "#8E9E42", border: "rgba(142,158,66,0.3)"  },
  practices:   { bar: "#2E6B40", border: "rgba(46,107,64,0.3)"   },
  gatherings:  { bar: "#6FAF85", border: "rgba(111,175,133,0.3)" },
  communities: { bar: "#7A6FAF", border: "rgba(122,111,175,0.3)" },
};

function colorFor(email: string) {
  let hash = 0;
  for (const c of email) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}

function practiceEmoji(templateType: string | null): string {
  switch (templateType) {
    case "intercession":    return "🙏🏽";
    case "morning-prayer":  return "🌅";
    case "evening-prayer":  return "🌙";
    case "contemplative":   return "🕯️";
    case "fasting":         return "✦";
    default:                return "🌱";
  }
}

function daysRemaining(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

// ─── Correspondence type (mirrors LettersPage) ────────────────────────────────
interface CorrespondenceItem {
  id: number;
  name: string;
  groupType: string;
  members: Array<{ name: string | null; email: string; lastLetterAt: string | null }>;
  letterCount: number;
  unreadCount: number;
  myTurn: boolean;
  currentPeriod: {
    periodNumber: number;
    hasWrittenThisPeriod: boolean;
  };
}

// ─── BarCard ──────────────────────────────────────────────────────────────────
function BarCard({
  href,
  barColor,
  borderColor,
  pulse = false,
  children,
}: {
  href: string;
  barColor: string;
  borderColor: string;
  pulse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="block">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative flex rounded-xl overflow-hidden cursor-pointer transition-shadow ${pulse ? "animate-turn-pulse" : ""}`}
        style={{
          background: "#0F2818",
          border: `1px solid ${pulse ? borderColor.replace("0.3", "0.55") : borderColor}`,
          boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        }}
      >
        <div
          className="w-1 flex-shrink-0"
          style={{ background: barColor }}
        />
        <div className="flex-1 px-4 py-3 min-w-0">
          {children}
        </div>
      </motion.div>
    </Link>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3 mt-6 first:mt-0">
      <span className="text-[10px] font-semibold uppercase tracking-widest shrink-0" style={{ color: "rgba(200,212,192,0.4)" }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.12)" }} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PersonProfile() {
  const [, params] = useRoute("/people/:email");
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const email = params?.email ? decodeURIComponent(params.email) : undefined;
  const { data: person, isLoading, isError } = usePersonProfile(email, user?.id);
  const queryClient = useQueryClient();

  const [prayerWord, setPrayerWord] = useState("");
  const [wordJustSent, setWordJustSent] = useState(false);
  const [showMuteModal, setShowMuteModal] = useState(false);
  const [showSettingsPopup, setShowSettingsPopup] = useState(false);

  // Fetch all correspondences and filter to ones that include this person
  const { data: correspondencesData } = useQuery<CorrespondenceItem[]>({
    queryKey: ["/api/phoebe/correspondences"],
    queryFn: async () => {
      try {
        return await apiRequest("GET", "/api/phoebe/correspondences");
      } catch {
        return await apiRequest("GET", "/api/letters/correspondences");
      }
    },
    enabled: !!user && !!email,
  });

  const sharedLetters = (correspondencesData ?? []).filter(c =>
    c.members.some(m => m.email.toLowerCase() === (email ?? "").toLowerCase())
  );

  const muteMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/mutes/${(person as any)?.userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/people", email, user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/mutes"] });
      setShowMuteModal(false);
    },
  });

  const unmuteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/mutes/${(person as any)?.userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/people", email, user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/mutes"] });
    },
  });

  const sendWordMutation = useMutation({
    mutationFn: async ({ requestId, content }: { requestId: number; content: string }) => {
      const res = await fetch(`/api/prayer-requests/${requestId}/words`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to send word");
      return res.json();
    },
    onSuccess: () => {
      setWordJustSent(true);
      setPrayerWord("");
      queryClient.invalidateQueries({ queryKey: ["/api/people", email] });
    },
  });

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto w-full pt-8 space-y-4">
          <div className="h-6 w-32 rounded animate-pulse" style={{ background: "#0F2818" }} />
          <div className="h-24 rounded-xl animate-pulse" style={{ background: "#0F2818" }} />
          <div className="h-20 rounded-xl animate-pulse" style={{ background: "#0F2818" }} />
          <div className="h-20 rounded-xl animate-pulse" style={{ background: "#0F2818" }} />
        </div>
      </Layout>
    );
  }

  if (isError || !person) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto w-full pt-16 text-center">
          <div className="text-4xl mb-4">🌱</div>
          <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>This person isn't in any of your practices or gatherings yet.</p>
          <Link href="/people" className="text-sm font-medium" style={{ color: "#5C7A5F" }}>← Back</Link>
        </div>
      </Layout>
    );
  }

  const firstName = person.name.split(" ")[0];
  const color = colorFor(person.email);
  const prayer = person.activePrayerRequest;
  const prayerDaysLeft = prayer ? daysRemaining(prayer.expiresAt) : null;
  const alreadyLeftWord = !!prayer?.myWord || wordJustSent;

  const sharedGroups: Array<{ id: number; name: string; slug: string; emoji: string | null }> =
    (person as any).sharedGroups ?? [];

  const totalTogether =
    sharedLetters.length +
    (person.sharedPractices?.length ?? 0) +
    (person.sharedRituals?.length ?? 0) +
    sharedGroups.length;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pb-16 pt-2">

        {/* Back */}
        <Link href="/people" className="inline-flex items-center gap-1 text-xs mb-5 transition-opacity hover:opacity-70" style={{ color: "#8FAF96" }}>
          ← People
        </Link>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex items-center gap-4 mb-6"
        >
          {(person as any).avatarUrl ? (
            <img
              src={(person as any).avatarUrl}
              alt={person.name}
              className="w-14 h-14 rounded-full object-cover flex-shrink-0"
              style={{ border: "2px solid rgba(46,107,64,0.3)" }}
            />
          ) : (
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-semibold flex-shrink-0"
              style={{ backgroundColor: color.bg, color: color.text }}
            >
              {initials(person.name)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-semibold text-2xl leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>
                {person.name}
              </h1>
              {(person as any).isCorrespondent && (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(92,138,95,0.15)", color: "#5C8A5F", border: "1px solid rgba(92,138,95,0.3)" }}
                >
                  📮 Correspondent
                </span>
              )}
              {(person as any).isMuted && (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(194,92,92,0.15)", color: "#C25C5C", border: "1px solid rgba(194,92,92,0.3)" }}
                >
                  🔇 Muted
                </span>
              )}
            </div>
            {sharedGroups.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {sharedGroups.map(group => (
                  <Link
                    key={group.id}
                    href={`/communities/${group.slug}`}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-opacity hover:opacity-80"
                    style={{
                      background: "rgba(122,111,175,0.15)",
                      border: "1px solid rgba(122,111,175,0.3)",
                      color: "#A8A0D0",
                    }}
                  >
                    {group.emoji ?? "🏛️"} {group.name}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>
                {totalTogether === 0 ? "Nothing shared yet" : `${totalTogether} thing${totalTogether !== 1 ? "s" : ""} together`}
              </p>
            )}
          </div>

          {/* Settings gear */}
          {(person as any).userId && (
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowSettingsPopup(v => !v)}
                className="p-2 rounded-xl transition-colors"
                style={{ color: "#8FAF96", background: showSettingsPopup ? "rgba(46,107,64,0.12)" : "transparent" }}
              >
                <Settings size={18} />
              </button>
              {showSettingsPopup && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowSettingsPopup(false)} />
                  <div
                    className="absolute right-0 top-10 z-50 rounded-xl py-1 min-w-[170px]"
                    style={{ background: "#0D1F14", border: "1px solid rgba(46,107,64,0.25)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
                  >
                    {/* Mute toggle */}
                    {(person as any).isMuted ? (
                      <button
                        onClick={() => { setShowSettingsPopup(false); unmuteMutation.mutate(); }}
                        disabled={unmuteMutation.isPending}
                        className="w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-white/5 disabled:opacity-40"
                        style={{ color: "#A8C5A0" }}
                      >
                        {unmuteMutation.isPending ? "Unmuting…" : "Unmute"}
                      </button>
                    ) : (
                      <button
                        onClick={() => { setShowSettingsPopup(false); setShowMuteModal(true); }}
                        className="w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-white/5"
                        style={{ color: "#C25C5C" }}
                      >
                        🔇 Mute {firstName}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </motion.div>

        {/* ── Pray for them (private, directed prayer) ───────────────────── */}
        {(person as any).userId && !(person as any).isMuted && (
          <PrayForThemButton
            recipientUserId={(person as any).userId as number}
            recipientEmail={person.email}
            recipientName={person.name}
          />
        )}

        {/* ── Prayer Request ──────────────────────────────────────────────── */}
        {prayer && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 }}
            className="mb-6 rounded-xl px-4 py-4"
            style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.25)" }}
          >
            <p className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: "#8FAF96" }}>
              Held in prayer 🙏🏽
            </p>
            <p className="text-sm leading-relaxed mb-1" style={{ color: "#F0EDE6" }}>{prayer.body}</p>
            <p className="text-xs mb-3" style={{ color: "rgba(143,175,150,0.6)" }}>
              {prayerDaysLeft !== null && `${prayerDaysLeft} day${prayerDaysLeft !== 1 ? "s" : ""} remaining · `}
              {formatDistanceToNow(parseISO(prayer.createdAt), { addSuffix: true })}
            </p>
            {alreadyLeftWord ? (
              <p className="text-xs italic" style={{ color: "#8FAF96" }}>🌿 You left a word</p>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={prayerWord}
                  onChange={e => setPrayerWord(e.target.value.slice(0, 120))}
                  placeholder="Leave a word alongside this…"
                  className="flex-1 text-sm px-3 py-2 rounded-lg border focus:outline-none transition-colors placeholder:text-muted-foreground/40"
                  style={{ background: "rgba(0,0,0,0.2)", borderColor: "rgba(46,107,64,0.25)", color: "#F0EDE6" }}
                />
                <button
                  onClick={() => {
                    if (prayerWord.trim()) sendWordMutation.mutate({ requestId: prayer.id, content: prayerWord.trim() });
                  }}
                  disabled={!prayerWord.trim() || sendWordMutation.isPending}
                  className="px-3 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-30"
                  style={{ background: "rgba(46,107,64,0.2)", color: "#8FAF96" }}
                >
                  🙏🏽
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Timeline ────────────────────────────────────────────────────── */}
        {totalTogether === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="text-center py-12"
          >
            <div className="text-4xl mb-4">🌱</div>
            <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
              Nothing shared yet. Start something together.
            </p>
            <Link
              href="/moment/new"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium"
              style={{ background: "#2D5E3F", color: "#F0EDE6" }}
            >
              + Invite {firstName} to a practice
            </Link>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.08 }}
          >
            {/* Letters */}
            {sharedLetters.length > 0 && (
              <>
                <SectionHeader label="Letters" />
                <div className="space-y-3">
                  {sharedLetters.map(c => {
                    const isOneToOne = c.groupType === "one_to_one";
                    const needsLetter = c.myTurn && !c.currentPeriod.hasWrittenThisPeriod;
                    const hasUnread = c.unreadCount > 0;
                    const statusText = c.currentPeriod.hasWrittenThisPeriod
                      ? "Sent · awaiting reply 🌿"
                      : c.myTurn
                      ? "Your turn to write 🖋️"
                      : hasUnread
                      ? "New letter 📮"
                      : `Letter ${c.currentPeriod.periodNumber}`;
                    const href = needsLetter
                      ? `/letters/${c.id}/write`
                      : `/letters/${c.id}`;
                    return (
                      <BarCard
                        key={c.id}
                        href={href}
                        barColor={CATEGORY.letters.bar}
                        borderColor={CATEGORY.letters.border}
                        pulse={needsLetter}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-sm" style={{ color: "#F0EDE6" }}>
                            📮 {isOneToOne ? `Letters with ${firstName}` : c.name}
                          </p>
                          {c.letterCount > 0 && (
                            <span className="text-[10px] shrink-0 mt-0.5" style={{ color: "rgba(200,212,192,0.4)" }}>
                              {c.letterCount} letter{c.letterCount !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-1" style={{ color: needsLetter ? "#C8D4C0" : "#8FAF96", fontWeight: needsLetter ? 500 : 400 }}>
                          {statusText}
                        </p>
                      </BarCard>
                    );
                  })}
                </div>
              </>
            )}

            {/* Practices */}
            {person.sharedPractices && person.sharedPractices.length > 0 && (
              <>
                <SectionHeader label="Practices" />
                {(() => {
                  const cards = (
                    <div className="space-y-3">
                      {person.sharedPractices.map(practice => {
                        const streakText = practice.currentStreak > 0
                          ? `${practice.currentStreak} day streak`
                          : practice.totalBlooms > 0
                          ? `${practice.totalBlooms} time${practice.totalBlooms !== 1 ? "s" : ""} together`
                          : "Just beginning";
                        // For custom intercessions, show intention instead of generic name
                        const displayName = (() => {
                          const p = practice as any;
                          if (practice.templateType === "intercession" && p.intention) {
                            const norm = (s: string) => s.trim().toLowerCase();
                            if (norm(p.intention) !== norm(practice.name)) return p.intention;
                          }
                          return practice.name;
                        })();
                        return (
                          <BarCard
                            key={practice.id}
                            href={`/moments/${practice.id}`}
                            barColor={CATEGORY.practices.bar}
                            borderColor={CATEGORY.practices.border}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-sm" style={{ color: "#F0EDE6" }}>
                                {practiceEmoji(practice.templateType)} {displayName}
                              </p>
                              {practice.currentStreak > 0 && (
                                <span className="text-[10px] font-semibold shrink-0 mt-0.5 uppercase" style={{ color: "#C8D4C0", letterSpacing: "0.06em" }}>
                                  {practice.currentStreak} day streak
                                </span>
                              )}
                            </div>
                            <p className="text-xs mt-1 capitalize" style={{ color: "#8FAF96" }}>
                              {practice.frequency}
                              {practice.currentStreak === 0 && ` · ${streakText}`}
                            </p>
                          </BarCard>
                        );
                      })}
                    </div>
                  );
                  return person.sharedPractices.length > 3 ? (
                    <div className="relative">
                      <div className="overflow-y-auto pr-1" style={{ maxHeight: "310px", scrollbarWidth: "none" }}>
                        {cards}
                        <div className="h-4" />
                      </div>
                      <div
                        className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
                        style={{ background: "linear-gradient(to bottom, transparent 20%, #091A10)" }}
                      />
                    </div>
                  ) : cards;
                })()}
              </>
            )}

            {/* Past practices */}
            {((person as any).pastPractices?.length ?? 0) > 0 && (
              <>
                <SectionHeader label="Past practices" />
                {(() => {
                  const pastList = (person as any).pastPractices as typeof person.sharedPractices;
                  const cards = (
                    <div className="space-y-2">
                      {pastList.map(practice => {
                        const timesText = practice.totalBlooms > 0
                          ? `${practice.totalBlooms} time${practice.totalBlooms !== 1 ? "s" : ""} together`
                          : "Practiced together";
                        const displayName = (() => {
                          const p = practice as any;
                          if (practice.templateType === "intercession" && p.intention) {
                            const norm = (s: string) => s.trim().toLowerCase();
                            if (norm(p.intention) !== norm(practice.name)) return p.intention;
                          }
                          return practice.name;
                        })();
                        return (
                          <div
                            key={practice.id}
                            className="relative flex rounded-xl overflow-hidden"
                            style={{
                              background: "rgba(46,107,64,0.04)",
                              border: "1px solid rgba(46,107,64,0.12)",
                              opacity: 0.65,
                            }}
                          >
                            <div className="w-1 flex-shrink-0" style={{ background: "rgba(46,107,64,0.3)" }} />
                            <div className="flex-1 px-4 py-2.5 min-w-0">
                              <p className="text-sm font-medium" style={{ color: "#C8D4C0" }}>
                                {practiceEmoji(practice.templateType)} {displayName}
                              </p>
                              <p className="text-xs mt-0.5 capitalize" style={{ color: "rgba(143,175,150,0.55)" }}>
                                {practice.frequency} · {timesText}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                  return pastList.length > 3 ? (
                    <div className="relative">
                      <div className="overflow-y-auto pr-1" style={{ maxHeight: "260px", scrollbarWidth: "none" }}>
                        {cards}
                        <div className="h-4" />
                      </div>
                      <div
                        className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
                        style={{ background: "linear-gradient(to bottom, transparent 20%, #091A10)" }}
                      />
                    </div>
                  ) : cards;
                })()}
              </>
            )}

            {/* Gatherings */}
            {person.sharedRituals && person.sharedRituals.length > 0 && (
              <>
                <SectionHeader label="Gatherings" />
                <div className="space-y-3">
                  {person.sharedRituals.map(({ ritual }) => {
                    const nextText = ritual.nextMeetupDate
                      ? `Next: ${format(parseISO(ritual.nextMeetupDate), "EEE, MMM d")}`
                      : "No date set yet";
                    return (
                      <BarCard
                        key={ritual.id}
                        href={`/ritual/${ritual.id}`}
                        barColor={CATEGORY.gatherings.bar}
                        borderColor={CATEGORY.gatherings.border}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-sm" style={{ color: "#F0EDE6" }}>
                            🤝🏽 {ritual.name}
                          </p>
                          {ritual.status === "on_track" && (
                            <span className="text-[10px] shrink-0 mt-0.5" style={{ color: "rgba(111,175,133,0.7)" }}>✓</span>
                          )}
                        </div>
                        <p className="text-xs mt-1 capitalize" style={{ color: "#8FAF96" }}>
                          {ritual.frequency} · {nextText}
                        </p>
                      </BarCard>
                    );
                  })}
                </div>
              </>
            )}

            {/* CTA */}
            <div className="mt-8 pt-5" style={{ borderTop: "1px solid rgba(46,107,64,0.15)" }}>
              <Link
                href="/moment/new"
                className="text-sm font-medium transition-opacity hover:opacity-70"
                style={{ color: "#8FAF96" }}
              >
                + Invite {firstName} to something new 🌿
              </Link>
            </div>
          </motion.div>
        )}
      </div>

      {/* ── Mute confirmation modal ───────────────────────────────────── */}
      {showMuteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
          onClick={() => setShowMuteModal(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-sm rounded-2xl px-6 py-6"
            style={{ background: "#0D1F14", border: "1px solid rgba(46,107,64,0.25)" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="text-3xl mb-4 text-center">🔇</div>
            <h2 className="text-lg font-semibold text-center mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              Mute {firstName}?
            </h2>
            <p className="text-sm text-center leading-relaxed mb-6" style={{ color: "#8FAF96" }}>
              Their prayer requests and Lectio reflections will be hidden from your view. You can unmute them any time in Settings.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowMuteModal(false)}
                className="flex-1 py-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
                style={{ background: "rgba(46,107,64,0.08)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.18)" }}
              >
                Cancel
              </button>
              <button
                onClick={() => muteMutation.mutate()}
                disabled={muteMutation.isPending}
                className="flex-1 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "rgba(194,92,92,0.2)", color: "#C25C5C", border: "1px solid rgba(194,92,92,0.3)" }}
              >
                {muteMutation.isPending ? "Muting…" : "Mute"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </Layout>
  );
}
