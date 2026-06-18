/**
 * WalkPartnerSheet — tap a walking companion to see what they've kept TODAY and
 * send a one-tap word of encouragement. Companionship, not surveillance: only
 * today's shared anchors appear (custom/personal practices never cross), there
 * are no times, no history, no streaks-vs-you. The warm move is the response row.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useStartHeartToHeart } from "@/hooks/useDailyPrayer";

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
  // True when today is one of their chosen phone-sabbath days — show a calm
  // "taking a sabbath" state instead of progress/behind.
  sabbath?: boolean;
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
  { kind: "thinking", emoji: "💚", label: "Thinking of you" },
];

export function WalkPartnerSheet({ companion, onClose }: { companion: WalkCompanion | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [sent, setSent] = useState<string | null>(null);
  const [overflow, setOverflow] = useState(false);
  // Heart to Heart composer — send a prayer straight to this person.
  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [heartSent, setHeartSent] = useState(false);
  // Whether the sent prayer reached them now (instant first contact) or is
  // sealed until tomorrow morning (the volley cadence) — drives honest copy.
  const [heartDelivered, setHeartDelivered] = useState(false);
  const startHeart = useStartHeartToHeart();

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

  const sendHeart = () => {
    const body = draft.trim();
    if (!body || !companion || startHeart.isPending) return;
    startHeart.reset();
    startHeart.mutate({ partnerUserId: companion.userId, body }, {
      onSuccess: (data) => {
        setHeartDelivered(!!data?.delivered);
        setHeartSent(true);
        setDraft("");
        setComposeOpen(false);
      },
      // onError: leave the composer open with the text intact; the error banner
      // below surfaces what happened so the send isn't silently swallowed.
    });
  };
  const openCompose = () => { setHeartSent(false); startHeart.reset(); setDraft(""); setComposeOpen(true); };

  const open = !!companion;
  const name = companion?.name ?? "Someone";
  const first = name.split(/\s+/)[0] || name;
  const progress = companion?.progress ?? null;
  const locked = !!companion?.progressLocked;
  const onSabbath = !!companion?.sabbath;
  // Accountability sharing shows only the FIRST THREE dots — never the full
  // count of someone's practices. You can send encouragement once those three
  // shared dots are kept (all of the shown set).
  const SHARED_DOTS = 3;
  const shownAnchors = progress?.anchors.slice(0, SHARED_DOTS) ?? [];
  const keptShown = shownAnchors.filter((a) => a.done).length;
  const completed = shownAnchors.length > 0 && keptShown === shownAnchors.length;

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
                    {shownAnchors.length === 0 ? "Walking with you"
                      : completed ? "Kept today 🌿"
                      : `${keptShown} of ${shownAnchors.length} kept today`}
                  </p>
                )}
              </div>
            </div>
            {companion?.intention && (
              <p className="text-[13.5px] italic mt-1 mb-1" style={{ color: "rgba(182,210,188,0.8)", fontFamily: "Georgia, serif" }}>“{companion.intention}”</p>
            )}

            {onSabbath ? (
              /* On a phone sabbath — a calm rest state, no progress, no nudge, so
                 a quiet day reads as rest rather than "fell behind". */
              <div className="mt-5 mb-2 rounded-2xl px-4 py-6 text-center" style={{ background: "rgba(46,107,64,0.10)", border: `1px solid ${CARD_B}` }}>
                <div style={{ fontSize: 30 }}>🌙</div>
                <p className="text-[15px] mt-2.5" style={{ color: WARM, fontFamily: "Georgia, serif", fontStyle: "italic" }}>
                  {first} is taking a phone sabbath today.
                </p>
                <p className="text-[12.5px] mt-2" style={{ color: SAGE, fontFamily: FONT }}>
                  Resting on purpose — nothing to worry about. 🌿
                </p>
              </div>
            ) : locked ? (
              /* Grace week is over and no recent Heart to Heart — dots are hidden
                 until they reconnect 1:1. A gentle nudge toward prayer, not a wall. */
              <div className="mt-5 mb-2 rounded-2xl px-4 py-5 text-center" style={{ background: "rgba(46,107,64,0.12)", border: `1px solid ${CARD_B}` }}>
                <div style={{ fontSize: 26 }}>💚</div>
                <p className="text-[14px] mt-2" style={{ color: WARM, fontFamily: "Georgia, serif", fontStyle: "italic" }}>
                  It's been a little while. Reach back out with a Heart to Heart — your days reappear here once you're praying together again.
                </p>
                <button
                  type="button"
                  onClick={openCompose}
                  className="inline-flex items-center justify-center rounded-full px-5 py-2.5 mt-4 text-[13px] font-semibold transition-opacity active:scale-[0.98]"
                  style={{ background: "rgba(46,107,64,0.9)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT }}
                >
                  Send a Heart to Heart
                </button>
              </div>
            ) : (
              <>
                {/* Today's progress — only the FIRST THREE shared dots (we never
                    reveal how many practices someone keeps); personal/private
                    practices never cross. Bigger dots, three at most. */}
                <div className="mt-4 mb-1">
                  {shownAnchors.length > 0 ? shownAnchors.map((a) => (
                    <div key={a.key} className="flex items-center gap-3.5 py-2.5">
                      <span style={{ fontSize: 20, width: 26, textAlign: "center", opacity: a.done ? 1 : 0.45 }}>{a.emoji}</span>
                      <span className="flex-1 text-[15.5px]" style={{ color: a.done ? WARM : "rgba(182,210,188,0.6)", fontFamily: FONT }}>{a.label}</span>
                      <span
                        aria-hidden
                        style={{
                          width: 24, height: 24, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center",
                          background: a.done ? DOT_ON : "transparent", border: a.done ? "none" : "1.5px solid rgba(143,175,150,0.55)",
                          color: "#0C2417", fontSize: 13, fontWeight: 800,
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
                    {nudge.isError && !sent && <p className="text-[12.5px] text-center mt-2.5" style={{ color: "#E0A87E", fontFamily: FONT }}>Couldn't send — tap to try again</p>}
                  </>
                ) : (
                  <p className="text-[12.5px] text-center py-2" style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}>
                    You can send {first} a word of encouragement once they've kept most of today 🌿
                  </p>
                )}

                {/* Heart to Heart — start a private back-and-forth prayer with
                    {first}, right here. The first one delivers instantly. */}
                <div className="mt-4 pt-4" style={{ borderTop: "1px solid rgba(143,175,150,0.14)" }}>
                  {heartSent ? (
                    <p className="text-[13px] text-center py-1.5" style={{ color: "#A8C5A0", fontFamily: FONT }}>
                      {heartDelivered
                        ? `💚 Your Heart to Heart reached ${first}`
                        : `🌅 ${first} will receive it tomorrow morning`}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={openCompose}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3 text-[14px] font-semibold transition-opacity active:scale-[0.98]"
                      style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT }}
                    >
                      💚 Send {first} a Heart to Heart
                    </button>
                  )}
                </div>
              </>
            )}
          </motion.div>

          {/* Heart to Heart composer — a considered, reverent place to write a
              prayer for {first}, mirroring the prayer-request slide (author face
              with the breathing pulse, eyebrow, italic body). The first one
              delivers instantly; after that it follows the next-morning volley. */}
          <AnimatePresence>
            {composeOpen && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[280] flex flex-col"
                style={{
                  background: "radial-gradient(130% 95% at 50% 22%, #163524 0%, #0C1F12 52%, #06120C 100%)",
                  paddingTop: "calc(var(--safe-top) + 14px)",
                  paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)",
                }}>
                {/* Quiet close in the top-left — the action lives at the bottom. */}
                <div className="px-5">
                  <button
                    type="button"
                    onClick={() => setComposeOpen(false)}
                    aria-label="Cancel"
                    className="w-9 h-9 rounded-full flex items-center justify-center text-[18px] active:scale-[0.95]"
                    style={{ background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.35)", color: "#C8D4C0", fontFamily: FONT }}
                  >×</button>
                </div>

                <div className="flex-1 flex flex-col w-full max-w-lg mx-auto px-8 overflow-y-auto">
                  {/* Who it's for — face with the soft prayer pulse + framing. */}
                  <div className="flex flex-col items-center text-center mt-1 mb-5">
                    {companion?.avatarUrl ? (
                      <img src={companion.avatarUrl} alt={name} className="w-16 h-16 rounded-full object-cover prayer-avatar-pulse" />
                    ) : (
                      <div className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-semibold prayer-avatar-pulse"
                        style={{ background: "#1A4A2E", color: "#A8C5A0", fontFamily: FONT }}>{initials(name)}</div>
                    )}
                    <p className="text-[10px] uppercase tracking-[0.18em] font-semibold mt-3" style={{ color: "rgba(143,175,150,0.5)", fontFamily: FONT }}>
                      Heart to Heart
                    </p>
                    <p className="text-[16px] font-semibold mt-1" style={{ color: WARM, fontFamily: FONT }}>
                      A prayer for {first}
                    </p>
                    {companion?.intention && (
                      <p className="text-[13px] italic mt-1.5" style={{ color: "rgba(182,210,188,0.8)", fontFamily: "Georgia, serif" }}>
                        “{companion.intention}”
                      </p>
                    )}
                  </div>

                  {/* The prayer itself — italic Georgia, the same voice the
                      prayer-request body is written in. */}
                  <textarea
                    autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000}
                    placeholder={`Lord, today I'm holding ${first}…`}
                    className="flex-1 min-h-[120px] bg-transparent outline-none resize-none w-full"
                    style={{ color: "#E8E4D8", fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 21, lineHeight: 1.55, textShadow: "0 1px 12px rgba(8,30,18,0.5)" }}
                  />
                </div>

                {/* Footer — a quiet reassurance, any error, then the send. */}
                <div className="w-full max-w-lg mx-auto px-8 flex flex-col items-center gap-2.5">
                  {startHeart.isError && (
                    <p className="text-[13px]" style={{ color: "#E0A87E", fontFamily: FONT }}>
                      Couldn't send just now — please try again.
                    </p>
                  )}
                  <p className="text-[11.5px]" style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}>
                    🌿 Held between you and {first}
                  </p>
                  <button
                    type="button"
                    onClick={sendHeart}
                    disabled={!draft.trim() || startHeart.isPending}
                    className="w-full rounded-full py-3.5 text-[15px] font-semibold disabled:opacity-40 active:scale-[0.99]"
                    style={{ background: "rgba(46,107,64,0.92)", color: WARM, border: "1px solid rgba(140,195,160,0.45)", fontFamily: FONT }}
                  >
                    {startHeart.isPending ? "Sending…" : `Send to ${first}`}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}
