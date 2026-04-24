import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { api } from "@/lib/api";

const BG = "#091A10";
const WARM = "#F0EDE6";
const MUTED = "#8FAF96";
const FAINT = "rgba(143,175,150,0.45)";
const CARD_BG = "#0F2818";
const BORDER = "rgba(142,158,66,0.22)";
const ACCENT = "#8E9E42";

interface RecentLetter { authorName: string; sentAt: string }
interface UnreadPreview { authorName: string; content: string }

interface CorrespondenceItem {
  id: number;
  name: string;
  groupType: string;
  members: Array<{ name: string | null; email: string }>;
  letterCount: number;
  unreadCount: number;
  recentLetters: RecentLetter[];
  unreadPreview: UnreadPreview | null;
  myTurn: boolean;
  turnState?: "WAITING" | "OPEN" | "OVERDUE" | "SENT";
  currentPeriod: {
    periodNumber: number;
    periodLabel: string;
    hasWrittenThisPeriod: boolean;
    isLastThreeDays: boolean;
  };
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function shortDate(d: string) {
  const dt = new Date(d);
  return `${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
}

function CorrespondenceCard({ item, me }: { item: CorrespondenceItem; me: string }) {
  const isOTO = item.groupType === "one_to_one";
  const isOverdue = isOTO && item.turnState === "OVERDUE";
  const others = item.members
    .filter(m => m.email.toLowerCase() !== me.toLowerCase())
    .map(m => m.name || m.email.split("@")[0])
    .join(", ");

  const title = isOTO ? `${others}` : (item.name || `Circle with ${others}`);
  const lastLetter = item.recentLetters[0] ?? null;
  const hasUnread = item.unreadCount > 0;

  const barColor = isOverdue
    ? "#D9B44A"
    : item.myTurn && !item.currentPeriod.hasWrittenThisPeriod
      ? "#8E9E42"
      : "rgba(142,158,66,0.28)";

  return (
    <Link href={`/letters/${item.id}`} className="block">
      <motion.div
        whileHover={{ y: -2 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="relative flex rounded-2xl overflow-hidden"
        style={{
          background: CARD_BG,
          border: `1px solid ${hasUnread ? "rgba(142,158,66,0.38)" : BORDER}`,
          boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
        }}
      >
        <div className="w-1 shrink-0" style={{ background: barColor }} />
        <div className="flex-1 px-4 py-4 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-[15px] truncate" style={{ color: WARM }}>
                📮 {title}
              </p>
              <p className="text-[11px] mt-0.5 font-semibold uppercase tracking-wide" style={{ color: "rgba(200,212,192,0.6)" }}>
                {isOTO ? `Letter ${item.currentPeriod.periodNumber}` : `Round ${item.currentPeriod.periodNumber}`}
                {" · "}
                {item.letterCount} {item.letterCount === 1 ? "letter" : "letters"}
              </p>
            </div>
            {lastLetter && (
              <div className="text-right shrink-0">
                <p className="text-[10px]" style={{ color: FAINT }}>{shortDate(lastLetter.sentAt)}</p>
              </div>
            )}
          </div>

          <div className="mt-2">
            {isOverdue ? (
              <span className="text-xs font-medium" style={{ color: "#D9B44A" }}>Overdue · write when you're ready 🌿</span>
            ) : item.currentPeriod.hasWrittenThisPeriod ? (
              <span className="text-xs" style={{ color: MUTED }}>
                {isOTO ? "Sent · awaiting reply 🌿" : "Update sent 🌿"}
              </span>
            ) : item.myTurn ? (
              <span className="text-xs font-medium" style={{ color: WARM }}>
                {isOTO ? "Your turn to write 🖋️" : "Write your update 🖋️"}
              </span>
            ) : hasUnread ? (
              <span className="text-xs font-semibold" style={{ color: ACCENT }}>New letter 📮</span>
            ) : lastLetter ? (
              <span className="text-xs" style={{ color: FAINT }}>Last: {shortDate(lastLetter.sentAt)}</span>
            ) : (
              <span className="text-xs" style={{ color: FAINT }}>No letters yet</span>
            )}
          </div>

          {hasUnread && item.unreadPreview && (
            <p
              className="text-[13px] mt-2 line-clamp-2 letter-body italic"
              style={{ color: MUTED, lineHeight: 1.55 }}
            >
              {item.unreadPreview.content}
            </p>
          )}
        </div>
      </motion.div>
    </Link>
  );
}

export default function LettersList() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const logout = useLogout();

  const { data: items, isLoading } = useQuery<CorrespondenceItem[]>({
    queryKey: ["/api/letters/correspondences"],
    queryFn: () =>
      api<CorrespondenceItem[]>("GET", "/api/phoebe/correspondences")
        .catch(() => api("GET", "/api/letters/correspondences")),
    enabled: !!user,
  });

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  const firstName = user.name?.split(" ")[0] ?? "there";

  return (
    <div className="min-h-screen" style={{ background: BG, fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Header */}
      <div className="px-5 pt-10 pb-4 max-w-lg mx-auto">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: FAINT }}>
              Phoebe Letters
            </p>
            <h1 className="text-2xl font-bold" style={{ color: WARM }}>
              Hello, {firstName}.
            </h1>
          </div>
          <button
            onClick={() => setLocation("/letters/new")}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-85"
            style={{ background: "#1A3D2B", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.5)" }}
          >
            <Plus size={14} />
            New
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 max-w-lg mx-auto pb-16">
        {isLoading ? (
          <div className="space-y-3 pt-2">
            {[1,2,3].map(i => (
              <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: CARD_BG }} />
            ))}
          </div>
        ) : !items?.length ? (
          <EmptyState onNew={() => setLocation("/letters/new")} />
        ) : (
          <div className="space-y-3 pt-2">
            {items.map(item => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <CorrespondenceCard item={item} me={user.email} />
              </motion.div>
            ))}
          </div>
        )}

        <button
          onClick={logout}
          className="mt-12 text-xs block mx-auto"
          style={{ color: FAINT }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.1 }}
      className="text-center pt-16 px-4"
    >
      <div className="text-5xl mb-6">📮</div>
      <p className="text-lg font-semibold mb-2" style={{ color: "#F0EDE6" }}>No correspondences yet.</p>
      <p className="text-sm mb-8 leading-relaxed" style={{ color: MUTED }}>
        Start a letter exchange with someone you want to know more slowly.
      </p>
      <button
        onClick={onNew}
        className="px-6 py-3 rounded-2xl text-sm font-semibold"
        style={{ background: "#2D5E3F", color: "#F0EDE6" }}
      >
        Start a correspondence 🖋️
      </button>
    </motion.div>
  );
}
