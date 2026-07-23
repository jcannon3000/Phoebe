/**
 * Set the parish's standing rhythm — the always-on daily rule of life the
 * priest keeps for the whole congregation. The priest DESIGNS it with the
 * rule-of-life customizer (prescribe mode — nothing written to their own
 * account), names it, and saves it (PUT /api/parish/rule). Parishioners then
 * adopt it in one tap and get a "you prayed with your parish this week" signal.
 *
 * Same snapshot/restore of the designer's own routine as prescribe-routine.tsx.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import WayOfLoveRuleFlow, { type RoutineSpec } from "@/components/WayOfLoveRuleFlow";
import { apiRequest } from "@/lib/queryClient";
import { pushRoutineConfig } from "@/lib/routineSync";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

const ROUTINE_PREFIXES = ["phoebe:office:", "phoebe:slot:"];
const ROUTINE_EXACT = [
  "phoebe:scripture-scope", "phoebe:fdd-mode",
  "phoebe:psalm-cycle", "phoebe:contemplation-style", "phoebe:routine:updated-at",
  "phoebe:cobreathe-length", "phoebe:commitment-start", "phoebe:weekly-practices", "phoebe:rest-window",
];
function isRoutineKey(k: string): boolean {
  return ROUTINE_PREFIXES.some((p) => k.startsWith(p)) || ROUTINE_EXACT.includes(k);
}
function snapshotRoutine(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && isRoutineKey(k)) { const v = localStorage.getItem(k); if (v != null) out[k] = v; }
    }
  } catch { /* private mode */ }
  return out;
}
function restoreRoutine(snap: Record<string, string>): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && isRoutineKey(k)) toRemove.push(k); }
    for (const k of toRemove) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(snap)) localStorage.setItem(k, v);
  } catch { /* private mode */ }
  pushRoutineConfig();
}

export default function ParishRuleNewPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const parishId = (() => {
    const n = Number(new URLSearchParams(search).get("parishId"));
    return Number.isFinite(n) ? n : null;
  })();
  const backTarget = "/parish/admin";

  const snapRef = useRef<Record<string, string> | null>(null);
  const restoredRef = useRef(false);

  const [spec, setSpec] = useState<RoutineSpec | null>(null);
  const [label, setLabel] = useState("");
  const [phase, setPhase] = useState<"design" | "name" | "done">("design");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    snapRef.current = snapshotRoutine();
    return () => {
      if (!restoredRef.current && snapRef.current) { restoreRoutine(snapRef.current); restoredRef.current = true; }
    };
  }, []);
  const restoreNow = () => {
    if (!restoredRef.current && snapRef.current) { restoreRoutine(snapRef.current); restoredRef.current = true; }
  };

  const handlePrescribe = (s: RoutineSpec) => { setSpec(s); restoreNow(); setPhase("name"); };

  const save = async () => {
    if (!spec || busy || parishId === null) return;
    setBusy(true); setError(null);
    try {
      const res = await apiRequest("PUT", "/api/parish/rule", { parishId, spec, label: label.trim() || undefined }) as { ok?: boolean };
      if (!res?.ok) throw new Error("failed");
      setPhase("done");
    } catch {
      setError("Couldn't save the rhythm. Make sure you're an admin of this parish.");
    } finally { setBusy(false); }
  };

  if (parishId === null) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <p style={{ color: SAGE, fontFamily: FONT, fontSize: 14, textAlign: "center" }}>
          No parish selected.{" "}
          <button onClick={() => setLocation(backTarget)} style={{ background: "none", border: "none", color: WARM, textDecoration: "underline", cursor: "pointer", fontFamily: FONT }}>Back to admin</button>
        </p>
      </div>
    );
  }

  if (phase === "design") {
    return (
      <WayOfLoveRuleFlow
        prescribe
        onPrescribe={handlePrescribe}
        onBack={() => setLocation(backTarget)}
        onDone={() => { /* prescribe mode routes commit() → onPrescribe */ }}
      />
    );
  }

  const wrap: React.CSSProperties = {
    minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center",
    alignItems: "stretch", gap: 18, padding: "24px 22px", maxWidth: 460, margin: "0 auto",
  };
  const card: React.CSSProperties = {
    background: "rgba(9,26,16,0.42)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
    border: "1px solid rgba(46,107,64,0.35)", borderRadius: 18, padding: 18,
  };

  if (phase === "name") {
    return (
      <div style={wrap}>
        <div>
          <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: SAGE, fontFamily: FONT, marginBottom: 6 }}>Rhythm ready 🌿</p>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.25 }}>Name your parish rhythm</h1>
          <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, marginTop: 8 }}>
            This is the daily rhythm your parish keeps together. Your congregation will be invited to take it up.
          </p>
        </div>
        <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="e.g. Our daily rhythm"
          style={{ ...card, padding: "14px 16px", color: WARM, fontFamily: FONT, fontSize: 15, outline: "none" }} />
        {error && <p style={{ color: "#E5A3A3", fontSize: 13, fontFamily: FONT }}>{error}</p>}
        <button type="button" onClick={save} disabled={busy}
          style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", borderRadius: 14, padding: "15px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Saving…" : "Set as our parish rhythm"}
        </button>
        <button type="button" onClick={() => setLocation(backTarget)}
          style={{ background: "transparent", color: SAGE, border: "1px solid rgba(143,175,150,0.25)", borderRadius: 14, padding: "12px 20px", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div>
        <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: SAGE, fontFamily: FONT, marginBottom: 6 }}>Set 🕊️</p>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.25 }}>Your parish rhythm is set</h1>
        <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, marginTop: 8 }}>
          Your parish will see it on their dashboard and can take it up in one tap. From then on they pray it with you and one another.
        </p>
      </div>
      <button type="button" onClick={() => setLocation(backTarget)}
        style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", borderRadius: 14, padding: "15px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
        Back to parish admin
      </button>
    </div>
  );
}
