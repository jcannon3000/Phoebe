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

export function BetaHomeHeader() {
  // People in your gardens who prayed this week — faces for the date row and
  // the count for the subtitle. (Same query StreakCard reads; React Query dedupes.)
  const { data } = useQuery<GardenWeek>({
    queryKey: ["/api/me/garden-week"],
    queryFn: () => apiRequest("GET", "/api/me/garden-week"),
    staleTime: 5 * 60_000,
  });
  const count = data?.count ?? 0;
  // Only people who actually have a profile picture, and show all of them —
  // matching the old hero card's avatar rail (no initials placeholders).
  const faces = (data?.people ?? []).filter((p) => p.avatarUrl);

  // Cross-fade the subtitle between the feast and the prayed-with line every few
  // seconds. Only fades when there's actually someone to show.
  const [showPrayed, setShowPrayed] = useState(false);
  useEffect(() => {
    if (count <= 0) { setShowPrayed(false); return; }
    const id = setInterval(() => setShowPrayed((s) => !s), 4200);
    return () => clearInterval(id);
  }, [count]);

  // Simple opacity fade — no flip/translate, so it never nudges the layout.
  const fade = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.6 },
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
              <img key={p.id} src={p.avatarUrl ?? ""} alt={p.name ?? ""} className="w-7 h-7 rounded-full object-cover" style={{ border: "1.5px solid #091A10" }} />
            ))}
          </div>
        )}
      </div>

      {/* Subtitle — cross-fades between feast and the prayed-with line. A fixed
          minHeight that both lines fit under keeps the cards below from
          shifting while it fades. */}
      <div style={{ marginBottom: 20, minHeight: 20 }}>
        <AnimatePresence mode="wait" initial={false}>
          {showPrayed && count > 0 ? (
            <motion.p
              key="prayed"
              {...fade}
              style={{ color: "#8FAF96", fontSize: 13, fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}
            >
              {count === 1 ? "1 person prayed with you this week" : `${count} people prayed with you this week`}
            </motion.p>
          ) : (
            <motion.div key="feast" {...fade}>
              <LiturgicalDateHeader feastOnly fallbackText="A Place Set Apart for Connection" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
