/**
 * BetaHomeHeader — the home-screen header for beta users: the date with the
 * faces of people who've prayed with you this week on the right, and a subtitle
 * that flip-fades between today's feast and "N people prayed with you this
 * week." Slots in place of the plain date + LiturgicalDateHeader on the home.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LiturgicalDateHeader } from "@/components/LiturgicalDateHeader";

type GardenWeek = { count: number; people: Array<{ id: number; name: string | null; avatarUrl: string | null }> };

function initials(name: string | null): string {
  return (name ?? "?").trim().split(/\s+/).slice(0, 2).map((s) => s[0] ?? "").join("").toUpperCase().slice(0, 2) || "?";
}

export function BetaHomeHeader() {
  // People in your gardens who prayed this week — faces for the date row and
  // the count for the subtitle. (Same query StreakCard reads; React Query dedupes.)
  const { data } = useQuery<GardenWeek>({
    queryKey: ["/api/me/garden-week"],
    queryFn: () => apiRequest("GET", "/api/me/garden-week"),
    staleTime: 5 * 60_000,
  });
  const count = data?.count ?? 0;
  const faces = (data?.people ?? []).slice(0, 4);
  const overflow = Math.max(0, count - faces.length);

  // Flip-fade the subtitle between the feast and the prayed-with line every few
  // seconds. Only flips when there's actually someone to show.
  const [showPrayed, setShowPrayed] = useState(false);
  useEffect(() => {
    if (count <= 0) { setShowPrayed(false); return; }
    const id = setInterval(() => setShowPrayed((s) => !s), 4200);
    return () => clearInterval(id);
  }, [count]);

  const flip = {
    initial: { opacity: 0, rotateX: -80, y: 6 },
    animate: { opacity: 1, rotateX: 0, y: 0 },
    exit: { opacity: 0, rotateX: 80, y: -6 },
    transition: { duration: 0.5 },
  };

  return (
    <>
      {/* Date + the faces of people you've prayed with this week (right). */}
      <div className="flex items-center justify-between gap-3 mb-1">
        <p style={{ color: "#F0EDE6", fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.2, fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
          {format(new Date(), "EEEE, d MMMM")}
        </p>
        {faces.length > 0 && (
          <div className="flex items-center -space-x-2 flex-shrink-0">
            {faces.map((p) => (
              p.avatarUrl ? (
                <img key={p.id} src={p.avatarUrl} alt={p.name ?? ""} className="w-7 h-7 rounded-full object-cover" style={{ border: "1.5px solid #091A10" }} />
              ) : (
                <div key={p.id} className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-semibold" style={{ background: "#1A4A2E", color: "#A8C5A0", border: "1.5px solid #091A10" }}>
                  {initials(p.name)}
                </div>
              )
            ))}
            {overflow > 0 && (
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-semibold" style={{ background: "rgba(46,107,64,0.35)", color: "#C8D4C0", border: "1.5px solid #091A10" }}>
                +{overflow}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Subtitle — flip-fades between feast and the prayed-with line. */}
      <div style={{ marginBottom: 20, minHeight: 22, perspective: 700 }}>
        <AnimatePresence mode="wait" initial={false}>
          {showPrayed && count > 0 ? (
            <motion.p
              key="prayed"
              {...flip}
              style={{ color: "#8FAF96", fontSize: 13, fontFamily: "'Space Grotesk', sans-serif", margin: 0, transformOrigin: "center" }}
            >
              {count === 1 ? "1 person prayed with you this week" : `${count} people prayed with you this week`}
            </motion.p>
          ) : (
            <motion.div key="feast" {...flip} style={{ transformOrigin: "center" }}>
              <LiturgicalDateHeader feastOnly fallbackText="A Place Set Apart for Connection" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
