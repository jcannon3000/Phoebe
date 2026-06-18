/**
 * WalkPartnerSheet — tap a walking companion to see what they've kept TODAY and
 * send a one-tap word of encouragement. Companionship, not surveillance: only
 * today's shared anchors appear (custom/personal practices never cross), there
 * are no times, no history, no streaks-vs-you. The warm move is the response row.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD_B = "rgba(46,107,64,0.3)";
const DOT_ON = "rgba(110,180,130,0.95)";

export type WalkAnchor = { key: string; label: string; emoji: string; done: boolean };
export type WalkProgress = { ymd: string; tz: string; anchors: WalkAnchor[]; keptCount: number; totalCount: number; allKept: boolean };
export type WalkCompanion = {
  pairId: number; userId: number; name: string | null; avatarUrl: string | null;
  intention: string | null; progress: WalkProgress | null;
  // True when you're still walking together but the grace week is over and you
  // haven't prayed a 1:1 Heart to Heart recently — so today's dots are hidden
  // until you reconnect.
  progressLocked?: boolean;
  lastNudge: { kind: string; at: string } | null;
};

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}
function Avatar({ name, url, size = 48 }: { name: string; url: string | null; size?: number }) {
  if (url) return <img src={url} alt={name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size, border: `1px solid ${CARD_B}` }} />;
  return <div className="rounded-full flex items-center justify-center font-semibold shrink-0" style={{ width: size, height: size, background: "#1A4A2E", color: "#A8C5A0", fontSize: size * 0.32, fontFamily: FONT }}>{initials(name)}</div>;
}

const NUDGES: Array<{ kind: "praying" | "cheer" | "thinking"; emoji: string; label: string }> = [
  { kind: "praying", emoji: "🙏", label: "Praying for you" },
  { kind: "cheer", emoji: "🌿", label: "Glad you're here" },
  { kind: "thinking", emoji: "💛", label: "Thinking of you" },
];

export function WalkPartnerSheet({ companion, onClose }: { companion: WalkCompanion | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [sent, setSent] = useState<string | null>(null);
  const [overflow, setOverflow] = useState(false);

  const nudge = useMutation({
    mutationFn: (kind: string) => apiRequest("POST", `/api/walk/${companion!.pairId}/nudge`, { kind }),
    onSuccess: (_d, kind) => { setSent(kind); qc.invalidateQueries({ queryKey: ["/api/walk"] }); },
  });
  const pause = useMutation({
    mutationFn: () => apiRequest("POST", `/api/walk/${companion!.pairId}/pause`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/walk"] }); onClose(); },
  });
  const stop = useMutation({
    mutationFn: () => apiRequest("POST", `/api/walk/${companion!.pairId}/stop`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/walk"] }); onClose(); },
  });

  const open = !!companion;
  const name = companion?.name ?? "Someone";
  const first = name.split(/\s+/)[0] || name;
  const progress = companion?.progress ?? null;
  const locked = !!companion?.progressLocked;
  // You can only send a word of encouragement once they've completed their day.
  const completed = !!progress?.allKept;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: "fixed", inset: 0, background: "rgba(6,18,11,0.6)", zIndex: 60, backdropFilter: "blur(2px)" }}
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            style={{
              position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 61,
              background: "#0C2417", borderTopLeftRadius: 24, borderTopRightRadius: 24,
              border: "1px solid rgba(46,107,64,0.4)", borderBottom: "none",
              padding: "10px 20px calc(env(safe-area-inset-bottom) + 22px)",
              maxHeight: "86vh", overflowY: "auto",
            }}
          >
            <div style={{ width: 38, height: 4, borderRadius: 999, background: "rgba(143,175,150,0.4)", margin: "0 auto 16px" }} />

            <div className="flex items-center gap-3.5 mb-1">
              <Avatar name={name} url={companion?.avatarUrl ?? null} />
              <div className="flex-1 min-w-0">
                <p className="truncate text-[18px] font-semibold" style={{ color: WARM, fontFamily: FONT }}>{name}</p>
                {progress && (
                  <p className="text-[13px]" style={{ color: SAGE, fontFamily: FONT }}>
                    {progress.totalCount === 0 ? "Walking with you"
                      : progress.allKept ? `Kept the whole rhythm today · ${progress.keptCount}/${progress.totalCount}`
                      : `${progress.keptCount} of ${progress.totalCount} kept today`}
                  </p>
                )}
              </div>
            </div>
            {companion?.intention && (
              <p className="text-[13.5px] italic mt-1 mb-1" style={{ color: "rgba(182,210,188,0.8)", fontFamily: "Georgia, serif" }}>“{companion.intention}”</p>
            )}

            {locked ? (
              /* Grace week is over and no recent Heart to Heart — dots are hidden
                 until they reconnect 1:1. A gentle nudge toward prayer, not a wall. */
              <div className="mt-5 mb-2 rounded-2xl px-4 py-5 text-center" style={{ background: "rgba(46,107,64,0.12)", border: `1px solid ${CARD_B}` }}>
                <div style={{ fontSize: 26 }}>💛</div>
                <p className="text-[14px] mt-2" style={{ color: WARM, fontFamily: "Georgia, serif", fontStyle: "italic" }}>
                  It's been a little while. Pray a Heart to Heart with {first} this week to see each other's days again.
                </p>
                <button
                  type="button"
                  onClick={() => { onClose(); setLocation(`/prayer-partner`); }}
                  className="inline-flex items-center justify-center rounded-full px-5 py-2.5 mt-4 text-[13px] font-semibold transition-opacity active:scale-[0.98]"
                  style={{ background: "rgba(46,107,64,0.9)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT }}
                >
                  Pray a Heart to Heart
                </button>
              </div>
            ) : (
              <>
                {/* Today's anchors — only the shared rhythm; personal practices never cross. */}
                <div className="mt-4 mb-1">
                  {progress && progress.anchors.length > 0 ? progress.anchors.map((a) => (
                    <div key={a.key} className="flex items-center gap-3 py-2">
                      <span style={{ fontSize: 18, width: 24, textAlign: "center", opacity: a.done ? 1 : 0.45 }}>{a.emoji}</span>
                      <span className="flex-1 text-[15px]" style={{ color: a.done ? WARM : "rgba(182,210,188,0.6)", fontFamily: FONT }}>{a.label}</span>
                      <span
                        aria-hidden
                        style={{
                          width: 18, height: 18, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center",
                          background: a.done ? DOT_ON : "transparent", border: a.done ? "none" : "1px solid rgba(143,175,150,0.5)",
                          color: "#0C2417", fontSize: 11, fontWeight: 800,
                        }}
                      >{a.done ? "✓" : ""}</span>
                    </div>
                  )) : (
                    <p className="text-[14px] py-2" style={{ color: SAGE, fontFamily: FONT }}>Their rhythm for today will appear here.</p>
                  )}
                </div>
                <p className="text-[11.5px] mt-1 mb-4" style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}>
                  Personal and private practices stay between {first} and God.
                </p>

                {/* Respond — a warm, one-tap word, unlocked once they've kept the whole day. */}
                {completed ? (
                  <>
                    <div className="flex items-center gap-2">
                      {NUDGES.map((n) => (
                        <button
                          key={n.kind}
                          type="button"
                          disabled={nudge.isPending || sent !== null}
                          onClick={() => nudge.mutate(n.kind)}
                          className="flex-1 flex flex-col items-center justify-center gap-1 rounded-2xl py-3 transition-opacity active:scale-[0.97]"
                          style={{
                            background: sent === n.kind ? "rgba(46,107,64,0.55)" : "rgba(46,107,64,0.16)",
                            border: `1px solid ${sent === n.kind ? "rgba(110,180,130,0.7)" : CARD_B}`,
                            opacity: sent !== null && sent !== n.kind ? 0.45 : 1, fontFamily: FONT,
                          }}
                        >
                          <span style={{ fontSize: 20 }}>{n.emoji}</span>
                          <span className="text-[11.5px] font-semibold" style={{ color: WARM }}>{n.label}</span>
                        </button>
                      ))}
                    </div>
                    {sent && <p className="text-[12.5px] text-center mt-2.5" style={{ color: "#A8C5A0", fontFamily: FONT }}>Sent to {first} 🌿</p>}
                  </>
                ) : (
                  <p className="text-[12.5px] text-center py-2" style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}>
                    You can send {first} a word of encouragement once they've kept their whole day 🌿
                  </p>
                )}
              </>
            )}

            <button
              type="button"
              onClick={() => { onClose(); setLocation(`/messages/new?to=${companion!.userId}`); }}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3 mt-3 text-[14px] font-semibold transition-opacity active:scale-[0.99]"
              style={{ background: "transparent", color: "#C8D4C0", border: `1px solid ${CARD_B}`, fontFamily: FONT }}
            >
              ✉️ Send {first} a message
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
