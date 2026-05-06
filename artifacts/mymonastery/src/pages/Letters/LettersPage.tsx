import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Plus } from "lucide-react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

interface CorrespondenceMemberStatus {
  name: string;
  email: string;
  hasWritten: boolean;
}

interface RecentLetter {
  authorName: string;
  sentAt: string;
}

interface UnreadPreview {
  authorName: string;
  content: string;
}

interface CorrespondenceItem {
  id: number;
  name: string;
  groupType: string;
  members: Array<{
    name: string | null;
    email: string;
    joinedAt: string | null;
    lastLetterAt: string | null;
    avatarUrl?: string | null;
  }>;
  letterCount: number;
  unreadCount: number;
  recentLetters: RecentLetter[];
  unreadPreview: UnreadPreview | null;
  myTurn: boolean;
  turnState?: "WAITING" | "OPEN" | "OVERDUE" | "SENT";
  windowOpenDate?: string | null;
  overdueDate?: string | null;
  currentPeriod: {
    periodNumber: number;
    periodStart: string;
    periodEnd: string;
    periodLabel: string;
    hasWrittenThisPeriod: boolean;
    membersWritten: CorrespondenceMemberStatus[];
    isLastThreeDays: boolean;
    whoseTurn?: "creator" | "member" | "everyone";
  };
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function CorrespondenceCard({ item, userEmail }: { item: CorrespondenceItem; userEmail: string }) {
  const { currentPeriod } = item;
  const isOneToOne = item.groupType === "one_to_one";

  // Case-insensitive email comparison — otherwise the current user's own
  // row leaks into "otherMembers" when the stored email casing differs from
  // the auth email, producing titles like "Dialogue with test" where the
  // email local-part gets displayed as if it were another person.
  const me = (userEmail || "").toLowerCase();
  const otherMembersFull = item.members.filter((m) => (m.email || "").toLowerCase() !== me);
  const otherMembers = otherMembersFull
    .map((m) => m.name || m.email?.split("@")[0])
    .filter(Boolean)
    .join(", ");
  // Up to 3 recipient avatars stacked on the right of the card. For a
  // one-to-one dialogue this is just the other person's face; for a
  // group it's the first three members so the card communicates "who
  // I'm writing to" at a glance, even before the title scrolls past.
  const recipientAvatars = otherMembersFull.slice(0, 3);

  // Local-TZ override of the OPEN verdict. Mirrors the dashboard
  // LetterCard + CorrespondencePage logic: server computes window in UTC,
  // but a letter sent late-evening in the user's local time lands on the
  // *next* UTC date, pushing windowOpen one calendar day past what the
  // user perceives. Recompute using local getDate()/getMonth()/
  // getFullYear() so a letter the user remembers as "April 23" + 7 days
  // = "April 30 OPEN" today regardless of UTC roll-over.
  const lastLetter = item.recentLetters?.[0] ?? null;
  const lastLetterDate = lastLetter ? formatShortDate(lastLetter.sentAt) : null;
  const localWindowOpenForMe = (() => {
    if (!isOneToOne || !lastLetter) return false;
    const lastFromOther = (lastLetter.authorName ?? "").trim().length > 0
      && !item.members.some(m =>
        (m.email || "").toLowerCase() === me
        && (m.name === lastLetter.authorName));
    if (!lastFromOther) return false;
    const sent = new Date(lastLetter.sentAt);
    const sentLocal = new Date(sent.getFullYear(), sent.getMonth(), sent.getDate());
    const opens = new Date(sentLocal.getFullYear(), sentLocal.getMonth(), sentLocal.getDate() + 7);
    const n = new Date();
    const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return today.getTime() >= opens.getTime();
  })();
  const turnState = (localWindowOpenForMe && item.turnState === "WAITING")
    ? "OPEN"
    : item.turnState;
  const isOverdue = isOneToOne && turnState === "OVERDUE";
  const myTurn = item.myTurn || (isOneToOne && (turnState === "OPEN" || turnState === "OVERDUE"));

  // Days until write window opens — only show when we're truly waiting,
  // not when local-TZ override has flipped to OPEN.
  const waitingDays = (isOneToOne && turnState === "WAITING" && item.windowOpenDate)
    ? Math.max(0, Math.ceil((new Date(item.windowOpenDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const showCountdown = waitingDays !== null && waitingDays > 0;

  const unread = item.unreadCount > 0;
  const accent = isOverdue
    ? "#D9B44A"
    : myTurn && !currentPeriod.hasWrittenThisPeriod
      ? "#5C8A5F"
      : "#2E6B40";
  const title = isOneToOne && otherMembers
    ? `Dialogue with ${otherMembers}`
    : (item.name?.replace(/^Letters with\b/, "Dialogue with")) || `Sharing with ${otherMembers}`;

  // Match the BarCard look used on /prayer-list (manage prayer list):
  // 1px left accent bar, rounded-xl, soft green bg + 0.28 border,
  // px-4 pt-3 pb-3 padding.
  return (
    <Link href={`/letters/${item.id}`} className="block">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative flex rounded-xl overflow-hidden cursor-pointer transition-shadow"
        style={{
          background: "rgba(46,107,64,0.15)",
          border: "1px solid rgba(46,107,64,0.28)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        }}
      >
        <div className="w-1 flex-shrink-0" style={{ background: accent }} />

        <div className="flex-1 px-4 pt-3 pb-3 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <p className="text-base font-semibold truncate" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              📮 {title}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              {/* Recipient avatars — stack of up to 3, overlapping. For a
                  one-to-one dialogue this is just the other person; for
                  a group it's the first three. Sits next to the date so
                  the card has both "when did this last move" and "who
                  am I writing to" visible at a glance. */}
              {recipientAvatars.length > 0 && (
                <div className="flex items-center -space-x-2">
                  {recipientAvatars.map((rm) => (
                    rm.avatarUrl ? (
                      <img
                        key={rm.email}
                        src={rm.avatarUrl}
                        alt={rm.name ?? rm.email}
                        className="w-7 h-7 rounded-full object-cover"
                        style={{ border: "1.5px solid #0F2818" }}
                      />
                    ) : (
                      <div
                        key={rm.email}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold"
                        style={{ background: "#1A4A2E", color: "#A8C5A0", border: "1.5px solid #0F2818" }}
                        title={rm.name ?? rm.email}
                      >
                        {((rm.name ?? rm.email) || "?")
                          .trim()
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((s) => s[0] ?? "")
                          .join("")
                          .toUpperCase()
                          .slice(0, 2) || "?"}
                      </div>
                    )
                  ))}
                </div>
              )}
              {lastLetterDate && (
                <p className="text-[10px]" style={{ color: "#8FAF96" }}>{lastLetterDate}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[11px] font-semibold uppercase shrink-0" style={{ color: "#C8D4C0", letterSpacing: "0.08em", fontFamily: "'Space Grotesk', sans-serif" }}>
              {isOneToOne
                ? `Letter ${myTurn && !currentPeriod.hasWrittenThisPeriod ? item.letterCount + 1 : Math.max(1, item.letterCount)}`
                : `Round ${currentPeriod.periodNumber}`}
            </span>
            <span style={{ color: "rgba(200,212,192,0.3)" }}>·</span>
            {isOverdue ? (
              <span className="text-xs font-medium truncate" style={{ color: "#D9B44A" }}>Overdue · write when you're ready 🌿</span>
            ) : myTurn && !currentPeriod.hasWrittenThisPeriod ? (
              <span className="text-xs font-medium truncate" style={{ color: "#C8D4C0" }}>{isOneToOne ? "Your turn to write 🖋️" : "Write your update 🖋️"}</span>
            ) : currentPeriod.hasWrittenThisPeriod ? (
              <span className="text-xs truncate" style={{ color: "#8FAF96" }}>{isOneToOne ? "Sent · awaiting reply 🌿" : "Update sent 🌿"}</span>
            ) : unread ? (
              <span className="text-xs font-medium truncate" style={{ color: "#C8D4C0" }}>New {isOneToOne ? "letter" : "update"} 📮</span>
            ) : lastLetterDate ? (
              <span className="text-xs truncate" style={{ color: "#8FAF96" }}>Last: {lastLetterDate}</span>
            ) : (
              <span className="text-xs truncate" style={{ color: "#8FAF96" }}>No letters yet</span>
            )}
          </div>

          {showCountdown && (() => {
            // If the current user just sent a letter, the windowOpenDate
            // is when the *recipient's* reply window opens — not the
            // user's own. Address them by first name when we have one,
            // falling back to "they".
            const otherFirstName = otherMembersFull[0]?.name?.split(/\s+/)[0]
              || otherMembersFull[0]?.email?.split("@")[0]
              || "they";
            const subject = currentPeriod.hasWrittenThisPeriod ? otherFirstName : "You";
            return (
              <p className="text-xs mt-1.5" style={{ color: "#8FAF96" }}>
                {subject} can reply in {waitingDays} day{waitingDays !== 1 ? "s" : ""}
              </p>
            );
          })()}

          {unread && item.unreadPreview && !showCountdown && (
            <p className="text-sm mt-2 line-clamp-2 italic" style={{ color: "#8FAF96", fontFamily: isOneToOne ? "Georgia, serif" : undefined }}>
              {item.unreadPreview.content}
            </p>
          )}
        </div>
      </motion.div>
    </Link>
  );
}

export default function LettersPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  const { data: correspondences, isLoading } = useQuery<CorrespondenceItem[]>({
    queryKey: ["/api/phoebe/correspondences"],
    queryFn: async () => {
      try {
        return await apiRequest("GET", "/api/phoebe/correspondences");
      } catch {
        return await apiRequest("GET", "/api/letters/correspondences");
      }
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  const items = correspondences ?? [];
  const isEmpty = !isLoading && items.length === 0;

  // Find a correspondence where it's our turn and we haven't written
  const needsLetter = items.find((i) => i.myTurn && !i.currentPeriod.hasWrittenThisPeriod);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pb-24">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              Letters
            </h1>
            <span
              className="text-[9px] font-semibold uppercase tracking-widest self-start mt-2"
              style={{ color: "rgba(143,175,150,0.45)", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              beta
            </span>
          </div>
          <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>
            An experimental way to stay close to people you care about.
          </p>
        </div>

        <div className="h-px mb-6" style={{ background: "rgba(142,158,66,0.25)" }} />

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 rounded-xl animate-pulse" style={{ backgroundColor: "rgba(200,212,192,0.1)" }} />
            ))}
          </div>
        ) : isEmpty ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center text-center py-12 max-w-xl mx-auto"
          >
            <div className="text-5xl mb-6">📮</div>
            <p className="text-sm mb-4" style={{ color: "#C8D4C0", lineHeight: 1.6 }}>
              Most friendships fade not because we stop caring, but because we never find the time. Letters gives that a simple structure: you and a friend each write one letter every two weeks. It doesn't have to be long or profound — it just has to be sent. Over time you build a real shared history.
            </p>
            <p className="text-sm mb-8" style={{ color: "#8FAF96", lineHeight: 1.6 }}>
              This is an early experiment and we're still learning what makes it feel meaningful. If you try it, we'd love to hear what you think.
            </p>
            <Link href="/letters/new">
              <button
                className="px-6 py-3.5 rounded-2xl text-base font-semibold"
                style={{ backgroundColor: "#2D5E3F", color: "#F0EDE6" }}
              >
                Start a correspondence
              </button>
            </Link>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-8">
            {(() => {
              // Mirror the per-card local-TZ override when bucketing into
              // "Your Turn" vs "Waiting" — otherwise a row that the card
              // visually marks as "Your turn to write" stays parked under
              // "Waiting for Response" because the server still says
              // myTurn=false / turnState=WAITING.
              const isLocallyOpen = (i: CorrespondenceItem) => {
                if (i.groupType !== "one_to_one") return false;
                const last = i.recentLetters?.[0];
                if (!last) return false;
                const me = (user.email || "").toLowerCase();
                const lastFromOther = !i.members.some(m =>
                  (m.email || "").toLowerCase() === me
                  && m.name === last.authorName);
                if (!lastFromOther) return false;
                const sent = new Date(last.sentAt);
                const sentLocal = new Date(sent.getFullYear(), sent.getMonth(), sent.getDate());
                const opens = new Date(sentLocal.getFullYear(), sentLocal.getMonth(), sentLocal.getDate() + 7);
                const n = new Date();
                const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
                return today.getTime() >= opens.getTime();
              };
              const isMyTurn = (i: CorrespondenceItem) =>
                (i.myTurn && !i.currentPeriod.hasWrittenThisPeriod)
                || (isLocallyOpen(i) && i.turnState === "WAITING");
              const yourTurn = items.filter(isMyTurn);
              const waiting = items.filter(i => !isMyTurn(i));
              const SectionHeader = ({ label }: { label: string }) => (
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#8FAF96" }}>{label}</span>
                  <div className="flex-1 h-px" style={{ background: "rgba(142,158,66,0.25)" }} />
                </div>
              );
              return (
                <>
                  {yourTurn.length > 0 && (
                    <div>
                      <SectionHeader label="Your Turn To Write" />
                      <div className="space-y-3">
                        {yourTurn.map(item => <CorrespondenceCard key={item.id} item={item} userEmail={user.email} />)}
                      </div>
                    </div>
                  )}
                  {waiting.length > 0 && (
                    <div>
                      <SectionHeader label="Waiting for Response" />
                      <div className="space-y-3">
                        {waiting.map(item => <CorrespondenceCard key={item.id} item={item} userEmail={user.email} />)}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </motion.div>
        )}
      </div>

      {/* Floating + FAB */}
      <Link
        href="/letters/new"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform"
        style={{ background: "#2D4A1E", color: "#F0EDE6" }}
        aria-label="New correspondence"
      >
        <Plus size={24} />
      </Link>
    </Layout>
  );
}
