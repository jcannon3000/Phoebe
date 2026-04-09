import { useState, useEffect } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { usePersonProfile } from "@/hooks/usePeople";
import { Layout } from "@/components/layout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// ─── Colors ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  { bg: "#2D5E3F", text: "#F0EDE6" },
  { bg: "#5A3D10", text: "#F0EDE6" },
  { bg: "#5A2E20", text: "#F0EDE6" },
];

const CATEGORY = {
  letters:   { bar: "#8E9E42", border: "rgba(142,158,66,0.3)" },
  practices: { bar: "#2E6B40", border: "rgba(46,107,64,0.3)"  },
  gatherings:{ bar: "#6FAF85", border: "rgba(111,175,133,0.3)"},
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
    case "intercession":    return "🙏";
    case "morning-prayer":  return "🌅";
    case "evening-prayer":  return "🌙";
    case "contemplative":   return "🕯️";
    case "fasting":         return "✦";
    case "listening":       return "🎵";
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
  const [wordSent, setWordSent] = useState(false);

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
      setWordSent(true);
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

  const totalTogether =
    sharedLetters.length +
    (person.sharedPractices?.length ?? 0) +
    (person.sharedRituals?.length ?? 0);

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
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-semibold flex-shrink-0"
            style={{ backgroundColor: color.bg, color: color.text }}
          >
            {initials(person.name)}
          </div>
          <div>
            <h1 className="font-semibold text-2xl leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>
              {person.name}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>
              {totalTogether === 0
                ? "Nothing shared yet"
                : `${totalTogether} thing${totalTogether !== 1 ? "s" : ""} together`}
            </p>
          </div>
        </motion.div>

        {/* ── Prayer Request ──────────────────────────────────────────────── */}
        {prayer && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 }}
            className="mb-6 rounded-xl px-4 py-4"
            style={{ background: "rgba(212,137,106,0.06)", border: "1px solid rgba(212,137,106,0.25)" }}
          >
            <p className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: "#D4896A" }}>
              Held in prayer 🙏
            </p>
            <p className="text-sm leading-relaxed mb-1" style={{ color: "#F0EDE6" }}>{prayer.body}</p>
            <p className="text-xs mb-3" style={{ color: "rgba(212,137,106,0.6)" }}>
              {prayerDaysLeft !== null && `${prayerDaysLeft} day${prayerDaysLeft !== 1 ? "s" : ""} remaining · `}
              {formatDistanceToNow(parseISO(prayer.createdAt), { addSuffix: true })}
            </p>
            {wordSent ? (
              <p className="text-xs italic" style={{ color: "#8FAF96" }}>🌿 You left a word</p>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={prayerWord}
                  onChange={e => setPrayerWord(e.target.value.slice(0, 120))}
                  placeholder="Leave a word alongside this…"
                  className="flex-1 text-sm px-3 py-2 rounded-lg border focus:outline-none transition-colors placeholder:text-muted-foreground/40"
                  style={{ background: "rgba(0,0,0,0.2)", borderColor: "rgba(212,137,106,0.25)", color: "#F0EDE6" }}
                />
                <button
                  onClick={() => {
                    if (prayerWord.trim()) sendWordMutation.mutate({ requestId: prayer.id, content: prayerWord.trim() });
                  }}
                  disabled={!prayerWord.trim() || sendWordMutation.isPending}
                  className="px-3 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-30"
                  style={{ background: "rgba(212,137,106,0.15)", color: "#D4896A" }}
                >
                  🙏
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
                <div className="space-y-3">
                  {person.sharedPractices.map(practice => {
                    const streakText = practice.currentStreak > 0
                      ? `${practice.currentStreak} day streak`
                      : practice.totalBlooms > 0
                      ? `${practice.totalBlooms} time${practice.totalBlooms !== 1 ? "s" : ""} together`
                      : "Just beginning";
                    return (
                      <BarCard
                        key={practice.id}
                        href={`/moments/${practice.id}`}
                        barColor={CATEGORY.practices.bar}
                        borderColor={CATEGORY.practices.border}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-sm" style={{ color: "#F0EDE6" }}>
                            {practiceEmoji(practice.templateType)} {practice.name}
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
                            🤝 {ritual.name}
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
            <div className="mt-8 pt-5" style={{ borderTop: "1px solid rgba(200,212,192,0.1)" }}>
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
    </Layout>
  );
}
