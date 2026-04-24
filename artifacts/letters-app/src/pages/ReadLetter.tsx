import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

const PAPER = "#F8F3EC";
const DARK = "#2C1810";
const MUTED = "#9a9390";
const GREEN = "#5C7A5F";

interface Letter {
  id: number;
  authorEmail: string;
  authorName: string;
  content: string;
  letterNumber: number;
  periodNumber: number;
  sentAt: string;
}

interface CorrespondenceDetail {
  id: number;
  name: string;
  groupType: string;
  members: Array<{ name: string | null; email: string }>;
  letters: Letter[];
  myTurn: boolean;
  currentPeriod: { periodNumber: number; hasWrittenThisPeriod: boolean };
}

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function formatDate(d: string) {
  const dt = new Date(d);
  return `${DAYS[dt.getDay()]}, ${MONTHS_LONG[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
}

export default function ReadLetter() {
  const { id, letterId } = useParams<{ id: string; letterId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const { data: correspondence } = useQuery<CorrespondenceDetail>({
    queryKey: [`/api/letters/correspondences/${id}`],
    queryFn: () =>
      api<CorrespondenceDetail>("GET", `/api/phoebe/correspondences/${id}`)
        .catch(() => api("GET", `/api/letters/correspondences/${id}`)),
    enabled: !!id && !!user,
  });

  const letter = correspondence?.letters.find(l => String(l.id) === letterId);
  const isOTO = correspondence?.groupType === "one_to_one";

  // Force paper background
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = PAPER;
    return () => { document.body.style.background = prev; };
  }, []);

  if (!correspondence || !letter) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: PAPER }}>
        <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "#aaa", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const isMine = letter.authorEmail.toLowerCase() === (user?.email ?? "").toLowerCase();
  const canWrite = correspondence.myTurn && !correspondence.currentPeriod.hasWrittenThisPeriod;

  return (
    <div className="min-h-screen" style={{ background: PAPER, fontFamily: "'Space Grotesk', sans-serif" }}>

      {/* Header */}
      <div className="px-6 pt-8 pb-4 max-w-2xl mx-auto flex items-start justify-between gap-4" style={{ borderBottom: "1px solid #EDE6D9" }}>
        <button onClick={() => setLocation(`/letters/${id}`)} className="text-sm mt-1" style={{ color: MUTED }}>←</button>
        <div className="flex-1 text-center">
          <p className="text-[13px] font-medium" style={{ color: MUTED }}>
            {isMine ? "You wrote" : `${letter.authorName} wrote`}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "rgba(154,147,144,0.6)" }}>
            {isOTO ? `Letter ${letter.letterNumber}` : `Round ${letter.periodNumber}`}
          </p>
        </div>
        <div className="w-8" />
      </div>

      {/* Letter content */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="px-6 pt-8 pb-24 max-w-2xl mx-auto"
      >
        {/* Heading */}
        <div className="mb-8">
          <p className="text-base font-semibold" style={{ color: DARK }}>
            {isMine ? "You" : letter.authorName}
          </p>
          <p className="text-[13px] mt-0.5" style={{ color: MUTED }}>
            {formatDate(letter.sentAt)}
          </p>
        </div>

        {/* Divider */}
        <div className="mb-8" style={{ borderTop: "1px solid #DDD7CE" }} />

        {/* Body */}
        <div
          className="letter-body"
          style={{
            color: DARK,
            fontSize: "18px",
            lineHeight: "1.8",
            whiteSpace: "pre-wrap",
          }}
        >
          {letter.content}
        </div>

        {/* Reply CTA */}
        {!isMine && canWrite && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-16 text-center"
          >
            <div className="mb-4" style={{ borderTop: "1px solid #DDD7CE" }} />
            <p className="text-sm mb-4" style={{ color: MUTED }}>Write back when you're ready.</p>
            <button
              onClick={() => setLocation(`/letters/${id}/write`)}
              className="px-6 py-3 rounded-2xl text-sm font-semibold transition-opacity hover:opacity-85"
              style={{ background: GREEN, color: "#fff" }}
            >
              Write your reply 🖋️
            </button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
