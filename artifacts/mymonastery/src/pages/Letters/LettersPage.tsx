import { useEffect } from "react";
import { Link, useLocation } from "wouter";
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

function PostmarkStamp({ city, date, rotation = -8 }: { city: string; date: string; rotation?: number }) {
  return (
    <div
      className="inline-flex flex-col items-center justify-center flex-shrink-0"
      style={{
        border: "1px solid rgba(200,212,192,0.4)",
        borderRadius: "50% / 40%",
        padding: "4px 10px",
        transform: `rotate(${rotation}deg)`,
        minWidth: "60px",
      }}
    >
      <span
        className="font-semibold uppercase"
        style={{ color: "#C8D4C0", fontSize: "9px", letterSpacing: "0.08em", lineHeight: 1.2 }}
      >
        {city}
      </span>
      <span style={{ color: "#8FAF96", fontSize: "8px", lineHeight: 1.2 }}>
        {formatShortDate(date)}
      </span>
    </div>
  );
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

  const unread = item.unreadCount > 0;

  return (
    <Link href={`/letters/${item.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative cursor-pointer transition-shadow hover:shadow-md active:scale-[0.99] transition-transform"
        style={{
          backgroundColor: "#0F2818",
          border: `1px solid rgba(200,212,192,${unread ? "0.35" : "0.2"})`,
          borderRadius: "12px",
          borderLeft: `3px solid ${item.myTurn && !currentPeriod.hasWrittenThisPeriod ? "#5C7A5F" : "rgba(200,212,192,0.2)"}`,
          boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
          padding: "16px 20px",
          marginBottom: "12px",
        }}
      >
        {/* Postmark stamps */}
        {isOneToOne && lastPostmark?.city && (
          <div className="absolute top-3 right-3">
            <PostmarkStamp city={lastPostmark.city} date={lastPostmark.sentAt} />
          </div>
        )}

        <p className="text-[16px] font-semibold pr-16" style={{ color: "#F0EDE6" }}>
          {(item.name?.replace(/^Letters with\b/, "Dialogue with")) || (isOneToOne ? `Dialogue with ${otherMembers}` : `Sharing with ${otherMembers}`)}
        </p>

        {isOneToOne && otherMembers && (
          <p className="text-[12px] mt-0.5" style={{ color: "#8FAF96" }}>
            with {otherMembers}
          </p>
        )}

        <div className="flex items-center gap-2 mt-2">
          {/* Period pill */}
          <span className="text-[11px] font-semibold uppercase" style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}>
            {isOneToOne ? `Letter ${currentPeriod.periodNumber}` : `Week ${currentPeriod.periodNumber}`}
          </span>
          <span style={{ color: "rgba(200,212,192,0.3)" }}>·</span>

          {/* Status */}
          {currentPeriod.hasWrittenThisPeriod ? (
            <span className="text-[12px]" style={{ color: "#8FAF96" }}>
              {isOneToOne ? "Sent · awaiting reply 🌿" : "Update sent 🌿"}
            </span>
          ) : item.myTurn ? (
            <span className="text-[12px] font-medium" style={{ color: "#C8D4C0" }}>
              {isOneToOne ? "Your turn to write 🖋️" : "Write your update 📮"}
            </span>
          ) : unread ? (
            <span className="text-[12px] font-medium" style={{ color: "#C8D4C0" }}>
              New {isOneToOne ? "letter" : "update"} 📮
            </span>
          ) : lastLetterDate ? (
            <span className="text-[12px]" style={{ color: "#8FAF96" }}>
              Last: {lastLetterDate}
            </span>
          ) : (
            <span className="text-[12px]" style={{ color: "#8FAF96" }}>
              No letters yet
            </span>
          )}
        </div>

        {/* Unread preview */}
        {unread && item.unreadPreview && (
          <p className="text-[13px] mt-2 line-clamp-2 italic" style={{ color: "#8FAF96", fontFamily: isOneToOne ? "Georgia, serif" : undefined }}>
            {item.unreadPreview.content}
          </p>
        )}
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
      <div className="flex flex-col w-full pb-24">
        {/* Header */}
        <div className="mb-2">
          <div className="flex items-center justify-between">
            <h1
              className="text-[28px] font-bold"
              style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Letters 📮
            </h1>
            {!isEmpty && (
              <Link href="/letters/new">
                <span className="text-[13px] font-semibold" style={{ color: "#C8D4C0" }}>
                  + New
                </span>
              </Link>
            )}
          </div>
          <p className="text-[14px] mt-1" style={{ color: "#8FAF96" }}>
            Be together with Phoebe.
          </p>
        </div>

        {/* Rule */}
        <div className="mb-6" style={{ borderTop: "1px solid rgba(200,212,192,0.15)" }} />

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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            {/* Prominent write CTA */}
            {needsLetter && (
              <Link href={`/letters/${needsLetter.id}/write`}>
                <div
                  className="mb-5 p-5 rounded-2xl text-center cursor-pointer hover:shadow-md transition-shadow"
                  style={{ backgroundColor: "#2D5E3F", color: "#F0EDE6", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}
                >
                  <p className="text-lg font-semibold">
                    {needsLetter.groupType === "one_to_one" ? "Write your letter 📮" : "Share your update 📮"}
                  </p>
                  <p className="text-sm opacity-80 mt-1">
                    {needsLetter.name || needsLetter.members.filter(m => m.email !== user.email).map(m => m.name || m.email?.split("@")[0]).join(", ")}
                    {" · "}
                    {needsLetter.groupType === "one_to_one" ? `Letter ${needsLetter.currentPeriod.periodNumber}` : `Week ${needsLetter.currentPeriod.periodNumber}`}
                  </p>
                </div>
              </Link>
            )}

            {items.map((item) => (
              <CorrespondenceCard key={item.id} item={item} userEmail={user.email} />
            ))}
          </motion.div>
        )}
      </div>
    </Layout>
  );
}
