/**
 * EncouragementBanner — shows a warm "🙌 {Name} encouraged you — keep growing
 * with Phoebe" card when a fellow has sent you a one-tap encouragement. Polls
 * the unseen feed, renders the newest sender (with a "+N more" tail), and marks
 * everything seen a few seconds after it appears so it lifts once and doesn't
 * nag. Self-contained: drop it anywhere (it renders nothing when there's
 * nothing to show).
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";

const FONT = "'Space Grotesk', sans-serif";

type Encouragement = { id: number; name: string; avatarUrl: string | null; createdAt: string };

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "🙌";
}

export function EncouragementBanner() {
  const qc = useQueryClient();
  const { data } = useQuery<{ encouragements: Encouragement[] }>({
    queryKey: ["/api/encouragements"],
    queryFn: () => apiRequest("GET", "/api/encouragements"),
    staleTime: 30_000,
  });
  const list = data?.encouragements ?? [];
  const top = list[0];

  // Lift once: mark seen ~5s after the banner shows so it doesn't reappear.
  useEffect(() => {
    if (list.length === 0) return undefined;
    const tmr = setTimeout(() => {
      apiRequest("POST", "/api/encouragements/seen")
        .then(() => qc.invalidateQueries({ queryKey: ["/api/encouragements"] }))
        .catch(() => undefined);
    }, 5000);
    return () => clearTimeout(tmr);
  }, [list.length, qc]);

  return (
    <AnimatePresence>
      {top && (
        <motion.div
          key={top.id}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="rounded-2xl px-4 py-3.5 mb-5 flex items-center gap-3"
          style={{ background: "rgba(46,107,64,0.22)", border: "1px solid rgba(111,175,133,0.4)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}
        >
          <span style={{ fontSize: 26 }}>🙌</span>
          {top.avatarUrl
            ? <img src={top.avatarUrl} alt={top.name} className="rounded-full object-cover shrink-0" style={{ width: 34, height: 34, border: "1px solid rgba(46,107,64,0.4)" }} />
            : <div className="rounded-full flex items-center justify-center font-semibold shrink-0" style={{ width: 34, height: 34, background: "#1A4A2E", color: "#A8C5A0", fontSize: 12, fontFamily: FONT }}>{initials(top.name)}</div>}
          <div className="min-w-0">
            <p className="text-[14px] font-semibold" style={{ color: "#F0EDE6", fontFamily: FONT }}>
              {top.name.split(/\s+/)[0]} encouraged you
              {list.length > 1 && <span style={{ color: "#8FAF96", fontWeight: 400 }}> · +{list.length - 1} more</span>}
            </p>
            <p className="text-[12.5px]" style={{ color: "#A8C5A0" }}>Keep growing with Phoebe.</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
