import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

const PAPER = "#FAF6F0";
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
  readBy?: Array<string | number>;
}

interface CorrespondenceDetail {
  id: number;
  name: string;
  groupType: string;
  members: Array<{ id?: number; name: string | null; email: string; avatarUrl?: string | null }>;
  letters: Letter[];
  myTurn: boolean;
  currentPeriod: { periodNumber: number; hasWrittenThisPeriod: boolean };
}

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function formatLetterDate(d: string): string {
  const dt = new Date(d);
  return `${DAYS[dt.getDay()]}, ${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
}

export default function ReadLetter() {
  const { id, letterId } = useParams<{ id: string; letterId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const token = new URLSearchParams(window.location.search).get("token");
  const tp = token ? `?token=${token}` : "";

  const { data } = useQuery<CorrespondenceDetail>({
    queryKey: [`/api/phoebe/correspondences/${id}`],
    queryFn: () => api<CorrespondenceDetail>("GET", `/api/phoebe/correspondences/${id}${tp}`),
    enabled: !!id && (!!user || !!token),
  });

  const letter = data?.letters?.find(l => String(l.id) === letterId);
  const userEmail = user?.email || "";
  const isOTO = data?.groupType === "one_to_one";
  const isMine = letter?.authorEmail?.toLowerCase() === userEmail.toLowerCase();
  const canWrite = (data?.myTurn ?? false) && !(data?.currentPeriod?.hasWrittenThisPeriod ?? false);

  const readByOthers = (() => {
    if (!letter || !isMine || !data) return [];
    const readers = letter.readBy ?? [];
    return data.members
      .filter(m => m.email !== letter.authorEmail)
      .filter(m => readers.includes(m.email) || (m.id && readers.includes(m.id)))
      .map(m => m.name || m.email.split("@")[0]);
  })();

  useEffect(() => { window.scrollTo(0, 0); }, []);

  // Paper background override
  useEffect(() => {
    const root = document.getElementById("root");
    const prevRoot = root?.style.backgroundColor;
    const prevBody = document.body.style.backgroundColor;
    const prevHtml = document.documentElement.style.backgroundColor;
    if (root) root.style.backgroundColor = PAPER;
    document.body.style.backgroundColor = PAPER;
    document.documentElement.style.backgroundColor = PAPER;
    return () => {
      if (root) root.style.backgroundColor = prevRoot || "";
      document.body.style.backgroundColor = prevBody || "";
      document.documentElement.style.backgroundColor = prevHtml || "";
    };
  }, []);

  if (!data || !letter) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: PAPER }}>
        <div className="w-5 h-5 rounded-full border-2 animate-spin"
          style={{ borderColor: "#aaa", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const backUrl = `/letters/${id}${tp}`;
  const writeUrl = `/letters/${id}/write${tp}`;

  return (
    <div className="min-h-screen" style={{ background: PAPER, fontFamily: "'Space Grotesk', sans-serif" }}>

      {/* Back */}
      <div className="px-6 pt-8 pb-4 max-w-3xl mx-auto">
        <button onClick={() => setLocation(backUrl)} className="text-sm" style={{ color: MUTED }}>
          ← Back
        </button>
      </div>

      {/* Letter paper */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-3xl mx-auto relative"
        style={{
          background: PAPER,
          boxShadow: "inset 0 0 0 1px rgba(46,107,64,0.1), 0 4px 24px rgba(44,24,16,0.08)",
          padding: "48px 32px",
          borderRadius: "2px",
          marginTop: "16px",
        }}
      >
        {/* Metadata row */}
        <p className="text-[11px] font-semibold uppercase mb-8"
          style={{ color: MUTED, letterSpacing: "0.1em" }}>
          {letter.authorName}
          {" · "}
          {isOTO ? `Letter ${letter.letterNumber}` : `Update ${letter.letterNumber}`}
          {isOTO && ` · ${formatLetterDate(letter.sentAt)}`}
        </p>

        {/* Body */}
        <div
          className="whitespace-pre-wrap"
          style={{
            color: DARK,
            fontFamily: isOTO ? "Georgia, 'Times New Roman', serif" : "'Space Grotesk', sans-serif",
            fontSize: "19px",
            lineHeight: "2.1",
          }}
        >
          {letter.content}
        </div>

        {/* Read receipt */}
        {isMine && readByOthers.length > 0 && (
          <p className="text-[12px] mt-8" style={{ color: GREEN }}>
            Read by {readByOthers.join(", ")} 🌿
          </p>
        )}
      </motion.div>

      {/* Footer */}
      <div className="max-w-[560px] mx-auto px-6 pt-8 pb-16 text-center">
        <p className="text-[13px]" style={{ color: MUTED }}>
          {formatLetterDate(letter.sentAt)}
        </p>

        {!isMine && canWrite && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
            className="mt-8"
          >
            <div className="mb-4" style={{ borderTop: "1px solid #DDD7CE" }} />
            <p className="text-[15px] italic mb-4" style={{ color: GREEN }}>
              {isOTO ? "Your turn to write back 🖋️" : "Share your update this round 🌿"}
            </p>
            <button
              onClick={() => setLocation(writeUrl)}
              className="px-6 py-3 rounded-xl font-semibold text-sm"
              style={{ background: GREEN, color: "#fff" }}
            >
              {isOTO ? "Write your letter" : "Share your update"}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
