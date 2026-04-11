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

interface PostmarkData {
  authorName: string;
  city: string;
  sentAt: string;
}

interface UnreadPreview {
  authorName: string;
  content: string;
  postmarkCity: string | null;
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
    homeCity: string | null;
  }>;
  letterCount: number;
  unreadCount: number;
  recentPostmarks: PostmarkData[];
  unreadPreview: UnreadPreview | null;
  myTurn: boolean;
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

const STATE_ABBR: Record<string, string> = {
  Alabama:"AL",Alaska:"AK",Arizona:"AZ",Arkansas:"AR",California:"CA",Colorado:"CO",
  Connecticut:"CT",Delaware:"DE",Florida:"FL",Georgia:"GA",Hawaii:"HI",Idaho:"ID",
  Illinois:"IL",Indiana:"IN",Iowa:"IA",Kansas:"KS",Kentucky:"KY",Louisiana:"LA",
  Maine:"ME",Maryland:"MD",Massachusetts:"MA",Michigan:"MI",Minnesota:"MN",
  Mississippi:"MS",Missouri:"MO",Montana:"MT",Nebraska:"NE",Nevada:"NV",
  "New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY",
  "North Carolina":"NC","North Dakota":"ND",Ohio:"OH",Oklahoma:"OK",Oregon:"OR",
  Pennsylvania:"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD",
  Tennessee:"TN",Texas:"TX",Utah:"UT",Vermont:"VT",Virginia:"VA",Washington:"WA",
  "West Virginia":"WV",Wisconsin:"WI",Wyoming:"WY","District of Columbia":"DC",
};

function parsePostmark(raw: string): { city: string; state: string } {
  // Expected format: "City, State ZIP" or "City, ST ZIP"
  const match = raw.match(/^(.+?),\s*([^,\d]+?)\s*(\d{5}(-\d{4})?)?$/);
  if (!match) return { city: raw, state: "" };
  const city = match[1].trim();
  const stateRaw = match[2].trim();
  const state = STATE_ABBR[stateRaw] ?? stateRaw.slice(0, 2).toUpperCase();
  return { city, state };
}

function CorrespondenceCard({ item, userEmail }: { item: CorrespondenceItem; userEmail: string }) {
  const { currentPeriod } = item;
  const isOneToOne = item.groupType === "one_to_one";

  const otherMembers = item.members
    .filter((m) => m.email !== userEmail)
    .map((m) => m.name || m.email?.split("@")[0])
    .join(", ");

  const lastPostmark = item.recentPostmarks?.[0] ?? null;
  const lastLetterDate = lastPostmark ? formatShortDate(lastPostmark.sentAt) : null;
  const lastPostmarkCity = lastPostmark?.city ? (() => {
    const { city, state } = parsePostmark(lastPostmark.city);
    return state ? `${city}, ${state}` : city;
  })() : null;

  const unread = item.unreadCount > 0;
  const accentColor = item.myTurn && !currentPeriod.hasWrittenThisPeriod ? "#8E9E42" : "rgba(142,158,66,0.35)";
  const title = (item.name?.replace(/^Letters with\b/, "Dialogue with")) || (isOneToOne ? `Dialogue with ${otherMembers}` : `Sharing with ${otherMembers}`);

  return (
    <Link href={`/letters/${item.id}`} className="block">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -2 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="relative flex rounded-xl overflow-hidden cursor-pointer"
        style={{
          background: "#0F2818",
          border: `1px solid rgba(142,158,66,${unread ? "0.35" : "0.2"})`,
          boxShadow: "0 2px 8px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.2)",
        }}
      >
        {/* Left accent bar */}
        <div className="w-1 flex-shrink-0" style={{ background: accentColor }} />

        <div className="flex-1 p-4 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <p className="text-base font-semibold" style={{ color: "#F0EDE6" }}>
              📮 {title}
            </p>
            {lastPostmarkCity && (
              <div className="flex-shrink-0 text-right">
                <p className="text-[11px] font-semibold uppercase" style={{ color: "#C8D4C0", letterSpacing: "0.06em" }}>{lastPostmarkCity}</p>
                {lastLetterDate && <p className="text-[10px]" style={{ color: "#8FAF96" }}>{lastLetterDate}</p>}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[11px] font-semibold uppercase" style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}>
              {isOneToOne ? `Letter ${currentPeriod.periodNumber}` : `Week ${currentPeriod.periodNumber}`}
            </span>
            <span style={{ color: "rgba(200,212,192,0.3)" }}>·</span>
            {currentPeriod.hasWrittenThisPeriod ? (
              <span className="text-xs" style={{ color: "#8FAF96" }}>{isOneToOne ? "Sent · awaiting reply 🌿" : "Update sent 🌿"}</span>
            ) : item.myTurn ? (
              <span className="text-xs font-medium" style={{ color: "#C8D4C0" }}>{isOneToOne ? "Your turn to write 🖋️" : "Write your update 🖋️"}</span>
            ) : unread ? (
              <span className="text-xs font-medium" style={{ color: "#C8D4C0" }}>New {isOneToOne ? "letter" : "update"} 📮</span>
            ) : lastLetterDate ? (
              <span className="text-xs" style={{ color: "#8FAF96" }}>Last: {lastLetterDate}</span>
            ) : (
              <span className="text-xs" style={{ color: "#8FAF96" }}>No letters yet</span>
            )}
          </div>

          {unread && item.unreadPreview && (
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
          <h1 className="text-2xl font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            Letters 📮
          </h1>
          <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>
            Letters have connected people for centuries. One letter every other week.
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
            className="flex flex-col items-center text-center py-12"
          >
            <div className="text-5xl mb-6">📮</div>
            <p className="text-base font-medium mb-1" style={{ color: "#F0EDE6" }}>Letters are how belonging gets cultivated, one week at a time.</p>
            <p className="text-sm mb-8" style={{ color: "#8FAF96" }}>
              A real dialogue. A shared history. A relationship that deepens.
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
              const yourTurn = items.filter(i => i.myTurn && !i.currentPeriod.hasWrittenThisPeriod);
              const waiting = items.filter(i => !i.myTurn || i.currentPeriod.hasWrittenThisPeriod);
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
