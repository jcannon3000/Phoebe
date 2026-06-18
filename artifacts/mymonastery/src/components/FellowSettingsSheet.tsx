/**
 * FellowSettingsSheet — per-fellow sharing settings, opened from a fellow row.
 * Two things you control for each 1:1 fellow:
 *   1. Share daily progress → Walking together (a MUTUAL opt-in; we drive it
 *      through the existing /api/walk endpoints, showing the live status).
 *   2. Sharing tied to place → a subjective "lives in the same place as me"
 *      marker + whether your plans are visible to them (default on). Plans are
 *      local, so the natural move is: on for nearby fellows, off for far ones.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD_B = "rgba(46,107,64,0.3)";

export type FellowLite = { userId: number; name: string | null; avatarUrl: string | null };

type WalkData = {
  companions: Array<{ pairId: number; userId: number }>;
  incoming: Array<{ pairId: number; userId: number }>;
  outgoing: Array<{ pairId: number; userId: number }>;
  paused: Array<{ pairId: number; userId: number }>;
  eligibleFellows: Array<{ userId: number }>;
};
type PrefsData = { prefs: Record<number, { samePlace: boolean; sharePlans: boolean }> };

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}
function Avatar({ name, url, size = 44 }: { name: string; url: string | null; size?: number }) {
  if (url) return <img src={url} alt={name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size, border: `1px solid ${CARD_B}` }} />;
  return <div className="rounded-full flex items-center justify-center font-semibold shrink-0" style={{ width: size, height: size, background: "#1A4A2E", color: "#A8C5A0", fontSize: size * 0.32, fontFamily: FONT }}>{initials(name)}</div>;
}

function Switch({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} disabled={disabled} onClick={onClick}
      className="relative shrink-0 transition-colors"
      style={{ width: 46, height: 28, borderRadius: 999, background: on ? "rgba(46,107,64,0.9)" : "rgba(143,175,150,0.25)", border: `1px solid ${on ? "rgba(110,180,130,0.7)" : "rgba(143,175,150,0.35)"}`, cursor: "pointer", opacity: disabled ? 0.5 : 1 }}
    >
      <span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 22, height: 22, borderRadius: 999, background: "#F0EDE6", transition: "left 0.16s ease" }} />
    </button>
  );
}

export function FellowSettingsSheet({ fellow, onClose }: { fellow: FellowLite | null; onClose: () => void }) {
  const qc = useQueryClient();
  const open = !!fellow;
  const fid = fellow?.userId;

  const { data: walk } = useQuery<WalkData>({ queryKey: ["/api/walk"], queryFn: () => apiRequest("GET", "/api/walk"), enabled: open });
  const { data: prefsData } = useQuery<PrefsData>({ queryKey: ["/api/fellow-prefs"], queryFn: () => apiRequest("GET", "/api/fellow-prefs"), enabled: open });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["/api/walk"] }); };
  const invalidatePrefs = () => { qc.invalidateQueries({ queryKey: ["/api/fellow-prefs"] }); qc.invalidateQueries({ queryKey: ["/api/fellow-plans"] }); };

  // Walking-together status for this fellow.
  const find = (arr?: Array<{ pairId: number; userId: number }>) => arr?.find((x) => x.userId === fid) ?? null;
  const active = find(walk?.companions);
  const paused = find(walk?.paused);
  const incoming = find(walk?.incoming);
  const outgoing = find(walk?.outgoing);
  const walkStatus: "active" | "paused" | "incoming" | "outgoing" | "none" =
    active ? "active" : paused ? "paused" : incoming ? "incoming" : outgoing ? "outgoing" : "none";

  const startWalk = useMutation({ mutationFn: () => apiRequest("POST", "/api/walk/request", { userId: fid }), onSuccess: invalidate });
  const acceptWalk = useMutation({ mutationFn: (pairId: number) => apiRequest("POST", `/api/walk/requests/${pairId}/accept`), onSuccess: invalidate });
  const stopWalk = useMutation({ mutationFn: (pairId: number) => apiRequest("POST", `/api/walk/${pairId}/stop`), onSuccess: invalidate });
  const resumeWalk = useMutation({ mutationFn: (pairId: number) => apiRequest("POST", `/api/walk/${pairId}/resume`), onSuccess: invalidate });
  // Remove this fellow entirely (also ends the walk via the server cascade).
  const removeFellow = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/fellows/${fid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/fellows"] });
      qc.invalidateQueries({ queryKey: ["/api/walk"] });
      qc.invalidateQueries({ queryKey: ["/api/fellow-prefs"] });
      onClose();
    },
  });

  // Place prefs (default: not same place, plans shared).
  const pref = fid != null ? prefsData?.prefs?.[fid] : undefined;
  const samePlace = pref?.samePlace ?? false;
  const sharePlans = pref?.sharePlans ?? true;
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const patchPref = (patch: { samePlace?: boolean; sharePlans?: boolean }, key: string) => {
    if (fid == null) return;
    setSavingKey(key);
    apiRequest("PATCH", `/api/fellow-prefs/${fid}`, patch)
      .then(() => invalidatePrefs())
      .catch(() => undefined)
      .finally(() => setSavingKey(null));
  };

  const name = fellow?.name ?? "Someone";
  const first = name.split(/\s+/)[0] || name;
  const walkPending = startWalk.isPending || acceptWalk.isPending || stopWalk.isPending || resumeWalk.isPending;

  const Row = ({ title, sub, control }: { title: string; sub: string; control: React.ReactNode }) => (
    <div className="flex items-center gap-3 py-3.5" style={{ borderTop: "1px solid rgba(200,212,192,0.1)" }}>
      <div className="flex-1 min-w-0">
        <p className="text-[14.5px] font-semibold" style={{ color: WARM, fontFamily: FONT }}>{title}</p>
        <p className="text-[12px] mt-0.5" style={{ color: SAGE, fontFamily: FONT }}>{sub}</p>
      </div>
      {control}
    </div>
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
            style={{ position: "fixed", inset: 0, background: "rgba(6,18,11,0.6)", zIndex: 60, backdropFilter: "blur(2px)" }} />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            style={{
              position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 61, background: "#0C2417",
              borderTopLeftRadius: 24, borderTopRightRadius: 24, border: "1px solid rgba(46,107,64,0.4)", borderBottom: "none",
              padding: "10px 20px calc(env(safe-area-inset-bottom) + 22px)", maxHeight: "86vh", overflowY: "auto",
            }}
          >
            <div style={{ width: 38, height: 4, borderRadius: 999, background: "rgba(143,175,150,0.4)", margin: "0 auto 16px" }} />

            <div className="flex items-center gap-3.5 mb-4">
              <Avatar name={name} url={fellow?.avatarUrl ?? null} />
              <div className="flex-1 min-w-0">
                <p className="truncate text-[18px] font-semibold" style={{ color: WARM, fontFamily: FONT }}>{name}</p>
                <p className="text-[12.5px]" style={{ color: SAGE, fontFamily: FONT }}>Sharing settings</p>
              </div>
            </div>

            {/* 1. Daily progress — inherent for fellows (no opt-in). Informational. */}
            <Row
              title="Daily progress"
              sub={`You're walking together — you each see the other's daily rhythm once you've prayed 1:1 recently.`}
              control={<span className="shrink-0 rounded-full text-[11px] font-semibold px-3 py-1.5" style={{ background: "rgba(46,107,64,0.3)", color: "#C8D4C0", border: "1px solid rgba(46,107,64,0.5)", fontFamily: FONT, textTransform: "uppercase", letterSpacing: "0.1em" }}>On</span>}
            />

            {/* 2. Lives in the same place (subjective). */}
            <Row
              title="Lives in the same place as me"
              sub="You decide — it just helps you keep local plans local."
              control={<Switch on={samePlace} disabled={savingKey === "samePlace"} onClick={() => patchPref({ samePlace: !samePlace }, "samePlace")} />}
            />

            {/* 3. Share my plans with them. */}
            <Row
              title="Share my plans with them"
              sub={sharePlans ? `${first} can see plans you share` : `Your plans stay hidden from ${first}`}
              control={<Switch on={sharePlans} disabled={savingKey === "sharePlans"} onClick={() => patchPref({ sharePlans: !sharePlans }, "sharePlans")} />}
            />

            <button type="button" onClick={onClose} className="w-full rounded-2xl py-3 mt-5 text-[14px] font-semibold" style={{ background: "transparent", color: "#C8D4C0", border: `1px solid ${CARD_B}`, fontFamily: FONT }}>Done</button>

            {/* Remove fellow — moved here from the row's pill. Always confirms. */}
            <button
              type="button"
              disabled={removeFellow.isPending}
              onClick={() => { if (window.confirm(`Remove ${name} as a fellow?`)) removeFellow.mutate(); }}
              className="w-full rounded-2xl py-3 mt-2 text-[13.5px] font-semibold transition-opacity active:scale-[0.99]"
              style={{ background: "transparent", color: "#C47A65", border: "none", fontFamily: FONT, opacity: removeFellow.isPending ? 0.6 : 1 }}
            >
              Remove fellow
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
