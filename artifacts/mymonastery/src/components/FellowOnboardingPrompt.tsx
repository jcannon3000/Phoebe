/**
 * FellowOnboardingPrompt — shown once after you connect with a NEW fellow (both
 * parties see it the next time they open People). Two questions:
 *   1. Do you live in the same place?  → fellow_prefs.samePlace (keeps local
 *      plans local).
 *   2. Share your daily progress with them, for encouragement + accountability?
 *      → starts Walking together (a mutual opt-in via /api/walk; it goes live
 *      once you BOTH say yes).
 * Answering either creates the fellow_prefs row, which is what marks the fellow
 * "onboarded" so this never re-appears for them.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD_B = "rgba(46,107,64,0.3)";

export type OnboardFellow = { userId: number; name: string | null; avatarUrl: string | null };

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

function YesNo({ value, onPick }: { value: boolean | null; onPick: (v: boolean) => void }) {
  const opt = (v: boolean, label: string) => {
    const active = value === v;
    return (
      <button
        type="button" onClick={() => onPick(v)}
        className="flex-1 rounded-full py-2.5 text-[13px] font-semibold transition-opacity active:scale-[0.98]"
        style={{
          background: active ? "rgba(46,107,64,0.85)" : "rgba(255,255,255,0.06)",
          border: `1px solid ${active ? "rgba(110,180,130,0.7)" : "rgba(143,175,150,0.3)"}`,
          color: active ? WARM : "rgba(246,240,230,0.7)", fontFamily: FONT,
        }}
      >{label}</button>
    );
  };
  return <div className="flex items-center gap-2">{opt(true, "Yes")}{opt(false, "No")}</div>;
}

export function FellowOnboardingPrompt({ fellow, onDone }: { fellow: OnboardFellow | null; onDone: () => void }) {
  const qc = useQueryClient();
  const open = !!fellow;
  const [samePlace, setSamePlace] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  const name = fellow?.name ?? "your fellow";
  const ready = samePlace !== null;

  const finish = async () => {
    if (!fellow || !ready || saving) return;
    setSaving(true);
    try {
      // Creating the prefs row marks this fellow onboarded (won't prompt again).
      await apiRequest("PATCH", `/api/fellow-prefs/${fellow.userId}`, { samePlace: !!samePlace }).catch(() => undefined);
      qc.invalidateQueries({ queryKey: ["/api/fellow-prefs"] });
    } finally {
      setSaving(false);
      onDone();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: "rgba(6,18,11,0.62)", zIndex: 70, backdropFilter: "blur(2px)" }} />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            style={{
              position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 71, background: "#0C2417",
              borderTopLeftRadius: 24, borderTopRightRadius: 24, border: "1px solid rgba(46,107,64,0.4)", borderBottom: "none",
              padding: "10px 20px calc(env(safe-area-inset-bottom) + 22px)", maxHeight: "90vh", overflowY: "auto",
            }}
          >
            <div style={{ width: 38, height: 4, borderRadius: 999, background: "rgba(143,175,150,0.4)", margin: "0 auto 16px" }} />

            <div className="flex flex-col items-center text-center mb-5">
              {fellow?.avatarUrl
                ? <img src={fellow.avatarUrl} alt={name} className="rounded-full object-cover" style={{ width: 56, height: 56, border: `1px solid ${CARD_B}` }} />
                : <div className="rounded-full flex items-center justify-center font-semibold" style={{ width: 56, height: 56, background: "#1A4A2E", color: "#A8C5A0", fontSize: 20, fontFamily: FONT }}>{initials(name)}</div>}
              <p className="text-[18px] font-semibold mt-3" style={{ color: WARM, fontFamily: FONT }}>You're fellows with {name}</p>
              <p className="text-[13px] mt-1" style={{ color: SAGE, fontFamily: FONT }}>You're walking together now — you'll see each other's daily rhythm. One quick thing:</p>
            </div>

            <div className="rounded-2xl px-4 py-3.5 mb-4" style={{ background: "rgba(46,107,64,0.12)", border: `1px solid ${CARD_B}` }}>
              <p className="text-[14.5px] font-semibold mb-2.5" style={{ color: WARM, fontFamily: FONT }}>Do you live in the same place?</p>
              <YesNo value={samePlace} onPick={setSamePlace} />
              <p className="text-[11.5px] mt-2" style={{ color: "rgba(143,175,150,0.6)", fontFamily: FONT }}>So local plans you share stay with the people nearby.</p>
            </div>

            <button
              type="button" disabled={!ready || saving} onClick={finish}
              className="w-full rounded-2xl py-3.5 text-[15px] font-semibold transition-opacity active:scale-[0.99]"
              style={{ background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)", fontFamily: FONT, opacity: !ready || saving ? 0.55 : 1 }}
            >
              {saving ? "Saving…" : "Done"}
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
