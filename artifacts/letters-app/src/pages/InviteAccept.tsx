import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";

const BG = "#091A10";
const WARM = "#F0EDE6";
const MUTED = "#8FAF96";
const GREEN = "#2D5E3F";

interface InviteInfo {
  correspondenceId: number;
  correspondenceName: string;
  groupType: string;
  inviterName: string;
  memberNames: string[];
  letterCount: number;
}

export default function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<InviteInfo>("GET", `/api/letters/invite/${token}`)
      .then(setInfo)
      .catch(() => setNotFound(true));
  }, [token]);

  async function accept() {
    if (!token) return;
    setAccepting(true);
    try {
      const res = await api<{ correspondenceId: number }>(
        "POST", `/api/letters/invite/${token}/accept`, {}
      );
      setLocation(`/letters/${res.correspondenceId}`);
    } catch {
      setAccepting(false);
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: BG }}>
        <p className="text-5xl mb-4">📮</p>
        <p className="text-base mb-1" style={{ color: WARM }}>This invitation is no longer active.</p>
        <p className="text-sm" style={{ color: MUTED }}>It may have already been accepted or expired.</p>
      </div>
    );
  }

  if (authLoading || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: MUTED, borderTopColor: "transparent" }} />
      </div>
    );
  }

  const isOTO = info.groupType === "one_to_one";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12" style={{ background: BG, fontFamily: "'Space Grotesk', sans-serif" }}>
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="max-w-sm w-full text-center"
      >
        <div className="text-5xl mb-7">📮</div>

        <h1 className="text-[24px] font-bold mb-3 leading-tight" style={{ color: WARM }}>
          {info.inviterName} invited you to correspond.
        </h1>

        <p className="text-base mb-8 leading-relaxed" style={{ color: MUTED }}>
          {isOTO
            ? `You and ${info.inviterName} will take turns writing letters — one every two weeks.`
            : `You'll join a small circle of ${info.memberNames.length + 1} people writing to each other every two weeks.`
          }
        </p>

        {!user ? (
          <>
            <a
              href={`/api/auth/google?redirect=/invite/${token}`}
              className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl font-semibold text-[15px] mb-3 transition-opacity hover:opacity-90"
              style={{ background: GREEN, color: WARM }}
            >
              Sign in to accept ✉️
            </a>
            <p className="text-xs mt-4" style={{ color: "rgba(143,175,150,0.5)" }}>
              You'll need a Phoebe account to write letters.
            </p>
          </>
        ) : (
          <>
            <button
              onClick={accept}
              disabled={accepting}
              className="w-full py-4 rounded-2xl font-semibold text-[15px] disabled:opacity-50 transition-opacity hover:opacity-90 mb-4"
              style={{ background: GREEN, color: WARM }}
            >
              {accepting ? "Accepting…" : "Accept invitation ✉️"}
            </button>
            <button
              onClick={() => setLocation("/letters")}
              className="text-sm"
              style={{ color: "rgba(143,175,150,0.5)" }}
            >
              Not now
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
