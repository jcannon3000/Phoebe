/**
 * Set our community's RULE OF LIFE (leaders) — /communities/:slug/rule-of-life/set.
 *
 * The community's shared daily rhythm: designed once by a leader, adoptable by
 * every member in one tap from the community page. Reuses the customizer in
 * "prescribe" mode (the design is CAPTURED, never written to the leader's own
 * account — same snapshot/restore as prescribing for one person), then a name,
 * then PUT — the rule replaces whatever rule came before it.
 */
import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import WayOfLoveRuleFlow, { type RoutineSpec } from "@/components/WayOfLoveRuleFlow";
import { apiRequest } from "@/lib/queryClient";
import { pushRoutineConfig } from "@/lib/routineSync";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

// Snapshot/restore the leader's OWN routine localStorage keys — designing the
// community's rule must never disturb their own rhythm. (Same key set as
// prescribe-routine.tsx / lib/routineSync ROUTINE_KEYS.)
const ROUTINE_PREFIXES = ["phoebe:office:", "phoebe:slot:"];
const ROUTINE_EXACT = [
  "phoebe:journaling-slot", "phoebe:scripture-scope", "phoebe:fdd-mode",
  "phoebe:psalm-cycle", "phoebe:contemplation-style", "phoebe:routine:updated-at",
  // Also written by the customizer's controls (breath-count picker) or carried
  // in ROUTINE_KEYS — missing from this list, designing-for-others permanently
  // overwrote the designer's own values and pushed them to their devices.
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

export default function CommunityRuleSetPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
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

  const handlePrescribe = (s: RoutineSpec) => {
    setSpec(s);
    restoreNow();
    setPhase("name");
  };

  const save = async () => {
    if (!spec || busy) return;
    setBusy(true); setError(null);
    try {
      await apiRequest("PUT", `/api/groups/${slug}/rule`, { spec, label: label.trim() || undefined });
      qc.invalidateQueries({ queryKey: [`/api/groups/${slug}/rule`] });
      setPhase("done");
    } catch {
      setError("Couldn't save the rule. Make sure you're a leader of this community.");
    } finally {
      setBusy(false);
    }
  };

  if (phase === "design") {
    return (
      <WayOfLoveRuleFlow
        prescribe
        onPrescribe={handlePrescribe}
        onBack={() => setLocation(`/communities/${slug}`)}
        onDone={() => { /* unused in prescribe mode */ }}
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
          <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: SAGE, fontFamily: FONT, marginBottom: 6 }}>
            Rule ready 🕯️
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.25 }}>
            Name your community's rule
          </h1>
          <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, marginTop: 8 }}>
            A short name members will see — "Our daily rhythm," "The Lent rule" — or leave it blank.
          </p>
        </div>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={80}
          placeholder="e.g. Our daily rhythm"
          style={{ ...card, padding: "14px 16px", color: WARM, fontFamily: FONT, fontSize: 15, outline: "none" }}
        />
        {error && <p style={{ color: "#E5A3A3", fontSize: 13, fontFamily: FONT }}>{error}</p>}
        <button
          type="button" onClick={save} disabled={busy}
          style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", borderRadius: 14, padding: "15px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer", opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Saving…" : "Set as our rule of life"}
        </button>
        <button
          type="button" onClick={() => setLocation(`/communities/${slug}`)}
          style={{ background: "transparent", color: SAGE, border: "1px solid rgba(143,175,150,0.25)", borderRadius: 14, padding: "12px 20px", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    );
  }

  // Done — the rule is live on the community page.
  return (
    <div style={wrap}>
      <div>
        <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: SAGE, fontFamily: FONT, marginBottom: 6 }}>
          Rule set 🌿
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.25 }}>
          {label.trim() ? `“${label.trim()}” is your community's rule` : "Your community's rule is set"}
        </h1>
        <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, marginTop: 8 }}>
          It now lives on your community page — every member can take it up in one tap, and the week you keep it
          together shows up as "you prayed with…" on their home.
        </p>
      </div>
      <button
        type="button" onClick={() => setLocation(`/communities/${slug}`)}
        style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", borderRadius: 14, padding: "15px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}
      >
        See it on the community page
      </button>
    </div>
  );
}
