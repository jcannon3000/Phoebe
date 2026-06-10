import { Link, useLocation } from "wouter";
import { Plus } from "lucide-react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

interface RecentLetter { authorName: string; sentAt: string }
interface UnreadPreview { authorName: string; content: string }

interface CorrespondenceItem {
  id: number;
  name: string;
  groupType: string;
  members: Array<{ name: string | null; email: string; joinedAt: string | null; lastLetterAt: string | null; avatarUrl?: string | null }>;
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
    membersWritten: Array<{ name: string; email: string; hasWritten: boolean }>;
    isLastThreeDays: boolean;
    whoseTurn?: "creator" | "member" | "everyone";
  };
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function CorrespondenceCard({ item, userEmail }: { item: CorrespondenceItem; userEmail: string }) {
  const { currentPeriod } = item;
  const isOneToOne = item.groupType === "one_to_one";
  const me = (userEmail || "").toLowerCase();
  const otherMembersFull = item.members.filter(m => (m.email || "").toLowerCase() !== me);
  const otherMembers = otherMembersFull.map(m => m.name || m.email?.split("@")[0]).filter(Boolean).join(", ");
  const recipientAvatars = otherMembersFull.slice(0, 3);

  const lastLetter = item.recentLetters?.[0] ?? null;
  const lastLetterDate = lastLetter ? formatShortDate(lastLetter.sentAt) : null;

  const localWindowOpenForMe = (() => {
    if (!isOneToOne || !lastLetter) return false;
    const lastFromOther = !item.members.some(m =>
      (m.email || "").toLowerCase() === me && m.name === lastLetter.authorName);
    if (!lastFromOther) return false;
    const sent = new Date(lastLetter.sentAt);
    const sentLocal = new Date(sent.getFullYear(), sent.getMonth(), sent.getDate());
    const opens = new Date(sentLocal.getFullYear(), sentLocal.getMonth(), sentLocal.getDate() + 7);
    const n = new Date();
    const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return today.getTime() >= opens.getTime();
  })();

  const turnState = (localWindowOpenForMe && item.turnState === "WAITING") ? "OPEN" : item.turnState;
  const isOverdue = isOneToOne && turnState === "OVERDUE";
  const myTurn = item.myTurn || (isOneToOne && (turnState === "OPEN" || turnState === "OVERDUE"));

  const waitingDays = (isOneToOne && turnState === "WAITING" && item.windowOpenDate)
    ? Math.max(0, differenceInCalendarDays(new Date(item.windowOpenDate), new Date()))
    : null;
  const showCountdown = waitingDays !== null && waitingDays > 0;

  const unread = item.unreadCount > 0;
  const accent = isOverdue ? "#D9B44A" : myTurn && !currentPeriod.hasWrittenThisPeriod ? "#5C8A5F" : "#2E6B40";
  const title = isOneToOne && otherMembers
    ? `Dialogue with ${otherMembers}`
    : (item.name?.replace(/^Letters with\b/, "Dialogue with")) || `Sharing with ${otherMembers}`;

  return (
    <Link href={`/letters/${item.id}`} className="block">
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="relative flex rounded-xl overflow-hidden cursor-pointer"
        style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.28)", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
      >
        <div className="w-1 flex-shrink-0" style={{ background: accent }} />
        <div className="flex-1 px-4 pt-3 pb-3 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <p className="text-base font-semibold truncate" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              📮 {title}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              {recipientAvatars.length > 0 && (
                <div className="flex items-center -space-x-2">
                  {recipientAvatars.map(rm =>
                    rm.avatarUrl ? (
                      <img key={rm.email} src={rm.avatarUrl} alt={rm.name ?? rm.email}
                        className="w-7 h-7 rounded-full object-cover" style={{ border: "1.5px solid #0F2818" }} />
                    ) : (
                      <div key={rm.email} className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold"
                        style={{ background: "#1A4A2E", color: "#A8C5A0", border: "1.5px solid #0F2818" }} title={rm.name ?? rm.email}>
                        {((rm.name ?? rm.email) || "?").trim().split(/\s+/).slice(0,2).map(s => s[0] ?? "").join("").toUpperCase().slice(0,2) || "?"}
                      </div>
                    )
                  )}
                </div>
              )}
              {lastLetterDate && <p className="text-[10px]" style={{ color: "#8FAF96" }}>{lastLetterDate}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[11px] font-semibold uppercase shrink-0" style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}>
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
            const otherFirstName = otherMembersFull[0]?.name?.split(/\s+/)[0] || otherMembersFull[0]?.email?.split("@")[0] || "they";
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

export default function LettersList() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  const { data: correspondences, isLoading } = useQuery<CorrespondenceItem[]>({
    queryKey: ["/api/phoebe/correspondences"],
    queryFn: () => api("GET", "/api/phoebe/correspondences"),
    enabled: !!user,
  });

  if (authLoading) return null;
  if (!user) { setLocation("/"); return null; }

  const items = correspondences ?? [];
  const isEmpty = !isLoading && items.length === 0;

  const me = (user.email || "").toLowerCase();
  const isLocallyOpen = (i: CorrespondenceItem) => {
    if (i.groupType !== "one_to_one") return false;
    const last = i.recentLetters?.[0];
    if (!last) return false;
    const lastFromOther = !i.members.some(m =>
      (m.email || "").toLowerCase() === me && m.name === last.authorName);
    if (!lastFromOther) return false;
    const sent = new Date(last.sentAt);
    const sentLocal = new Date(sent.getFullYear(), sent.getMonth(), sent.getDate());
    const opens = new Date(sentLocal.getFullYear(), sentLocal.getMonth(), sentLocal.getDate() + 7);
    const n = new Date();
    const today = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return today.getTime() >= opens.getTime();
  };
  const isMyTurn = (i: CorrespondenceItem) =>
    (i.myTurn && !i.currentPeriod.hasWrittenThisPeriod) || (isLocallyOpen(i) && i.turnState === "WAITING");
  const yourTurn = items.filter(isMyTurn);
  const waiting = items.filter(i => !isMyTurn(i));

  const SectionHeader = ({ label }: { label: string }) => (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#8FAF96" }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: "rgba(142,158,66,0.25)" }} />
    </div>
  );

  return (
    <div className="min-h-screen px-4 py-6" style={{ background: "#091A10" }}>
      <div className="max-w-2xl mx-auto pb-24">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>Letters</h1>
          <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>Your slow correspondence</p>
        </div>

        <div className="h-px mb-6" style={{ background: "rgba(142,158,66,0.25)" }} />

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-24 rounded-xl animate-pulse" style={{ backgroundColor: "rgba(200,212,192,0.1)" }} />)}
          </div>
        ) : isEmpty ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center text-center py-12 max-w-xl mx-auto">
            <div className="text-5xl mb-6">📮</div>
            <p className="text-sm mb-4" style={{ color: "#C8D4C0", lineHeight: 1.6 }}>
              No correspondences yet. Letters are slow on purpose — a weekly rhythm of thoughtful writing.
            </p>
            <p className="text-sm mb-8" style={{ color: "#8FAF96", lineHeight: 1.6 }}>
              Start a dialogue with someone you want to write to intentionally.
            </p>
            <Link href="/letters/new">
              <button className="px-6 py-3.5 rounded-2xl text-base font-semibold" style={{ backgroundColor: "#2D5E3F", color: "#F0EDE6" }}>
                Start a correspondence
              </button>
            </Link>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-8">
            {yourTurn.length > 0 && (
              <div>
                <SectionHeader label="Your Turn" />
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
          </motion.div>
        )}
      </div>

      <Link href="/letters/new"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform"
        style={{ background: "#2D4A1E", color: "#F0EDE6" }} aria-label="New correspondence">
        <Plus size={24} />
      </Link>
    </div>
  );
}
