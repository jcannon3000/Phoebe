import { useEffect } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

const BG = "#091A10";
const WARM = "#F0EDE6";
const MUTED = "#8FAF96";
const FAINT = "rgba(143,175,150,0.45)";
const CARD_BG = "rgba(15,40,24,0.85)";
const BORDER = "rgba(200,212,192,0.12)";
const GREEN = "#2D5E3F";

interface Letter {
  id: number;
  authorEmail: string;
  authorName: string;
  content: string;
  letterNumber: number;
  periodNumber: number;
  postmarkCity: string | null;
  sentAt: string;
  readBy: Array<string | number>;
}

interface MemberStatus { name: string; email: string; hasWritten: boolean }

interface Correspondence {
  id: number;
  name: string;
  groupType: string;
  members: Array<{ name: string | null; email: string; homeCity: string | null }>;
  letters: Letter[];
  myTurn: boolean;
  turnState?: "WAITING" | "OPEN" | "OVERDUE" | "SENT";
  currentPeriod: {
    periodNumber: number;
    periodLabel: string;
    hasWrittenThisPeriod: boolean;
    membersWritten: MemberStatus[];
    isLastThreeDays: boolean;
  };
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function shortDate(d: string) {
  const dt = new Date(d);
  return `${MONTHS[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
}
function longDate(d: string) {
  const dt = new Date(d);
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${days[dt.getDay()]}, ${months[dt.getMonth()]} ${dt.getDate()}`;
}

export default function ThreadView() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<Correspondence>({
    queryKey: [`/api/letters/correspondences/${id}`],
    queryFn: () =>
      api<Correspondence>("GET", `/api/phoebe/correspondences/${id}`)
        .catch(() => api("GET", `/api/letters/correspondences/${id}`)),
    enabled: !!id && !!user,
  });

  // Read receipts are marked server-side when the GET letters endpoint is called.

  if (isLoading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: MUTED, borderTopColor: "transparent" }} />
      </div>
    );
  }

  const isOTO = data.groupType === "one_to_one";
  const isOverdue = isOTO && data.turnState === "OVERDUE";
  const me = user?.email ?? "";
  const others = data.members
    .filter(m => m.email.toLowerCase() !== me.toLowerCase())
    .map(m => m.name || m.email.split("@")[0])
    .join(", ");

  const title = isOTO ? others : (data.name || `Circle`);
  const sorted = [...data.letters].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());

  const canWrite = data.myTurn || isOverdue;
  const writeUrl = `/letters/${id}/write`;

  return (
    <div className="min-h-screen" style={{ background: BG, fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-5 pt-8 pb-4 max-w-lg mx-auto" style={{ background: BG }}>
        <div className="flex items-start justify-between gap-3">
          <button onClick={() => setLocation("/letters")} className="text-sm mt-0.5" style={{ color: FAINT }}>←</button>
          <div className="flex-1 text-center min-w-0">
            <h1 className="font-bold text-lg truncate" style={{ color: WARM }}>{title}</h1>
            <p className="text-[11px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: FAINT }}>
              {isOTO ? `Letter ${data.currentPeriod.periodNumber}` : `Round ${data.currentPeriod.periodNumber}`}
              {" · "}{data.letters.length} {data.letters.length === 1 ? "letter" : "letters"}
            </p>
          </div>
          <div className="w-6" />
        </div>
      </div>

      {/* Letters */}
      <div className="px-5 max-w-lg mx-auto pb-32 space-y-4">
        {sorted.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <div className="text-4xl mb-4">✉️</div>
            <p className="text-base font-semibold mb-1" style={{ color: WARM }}>Start the conversation.</p>
            <p className="text-sm" style={{ color: MUTED }}>Write the first letter.</p>
          </motion.div>
        ) : sorted.map((letter, idx) => {
          const isMine = letter.authorEmail.toLowerCase() === me.toLowerCase();
          return (
            <motion.div
              key={letter.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
            >
              <Link href={`/letters/${id}/read/${letter.id}`}>
                <div
                  className="rounded-2xl px-5 py-4 cursor-pointer transition-all hover:scale-[1.01]"
                  style={{
                    background: CARD_BG,
                    border: `1px solid ${BORDER}`,
                    boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
                  }}
                >
                  {/* Postmark header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-[13px] font-semibold" style={{ color: WARM }}>
                        {isMine ? "You" : letter.authorName}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: FAINT }}>
                        {longDate(letter.sentAt)}
                        {letter.postmarkCity && ` · ${letter.postmarkCity.split(",")[0]}`}
                      </p>
                    </div>
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wider rounded-full px-2.5 py-1 shrink-0"
                      style={{
                        background: "rgba(46,107,64,0.2)",
                        color: MUTED,
                        border: "1px solid rgba(46,107,64,0.3)",
                      }}
                    >
                      {isOTO ? `#${letter.letterNumber}` : `Round ${letter.periodNumber}`}
                    </span>
                  </div>

                  {/* Snippet */}
                  <p
                    className="text-[14px] letter-body line-clamp-3 italic"
                    style={{ color: "rgba(240,237,230,0.75)", lineHeight: 1.6 }}
                  >
                    {letter.content}
                  </p>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>

      {/* Write CTA */}
      <div className="fixed bottom-0 inset-x-0 px-5 pb-8 pt-4 max-w-lg mx-auto" style={{ background: `linear-gradient(to top, ${BG} 70%, transparent)` }}>
        {canWrite ? (
          <Link href={writeUrl}>
            <button
              className="w-full py-4 rounded-2xl font-semibold text-[15px] transition-opacity hover:opacity-90"
              style={{
                background: isOverdue ? "rgba(217,180,74,0.15)" : GREEN,
                color: isOverdue ? "#D9B44A" : WARM,
                border: isOverdue ? "1px solid rgba(217,180,74,0.4)" : "none",
              }}
            >
              {isOverdue ? "Write when you're ready 🌿" : `Write ${isOTO ? "your letter" : "your update"} 🖋️`}
            </button>
          </Link>
        ) : (
          <div
            className="w-full py-3.5 rounded-2xl text-center text-sm font-medium"
            style={{ background: "rgba(46,107,64,0.08)", color: MUTED, border: `1px solid ${BORDER}` }}
          >
            {data.currentPeriod.hasWrittenThisPeriod
              ? `Sent 🌿 — waiting on ${others}`
              : "Waiting for their letter 📮"}
          </div>
        )}
      </div>
    </div>
  );
}
