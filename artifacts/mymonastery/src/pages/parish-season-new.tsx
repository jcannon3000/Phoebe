/**
 * Start a parish season — "pray with your priest."
 *
 * A priest DESIGNS the season's daily rhythm with the rule-of-life customizer
 * (in "prescribe" mode — nothing is written to the priest's own account), names
 * it, picks a length, and starts it. Parishioners then take up that rhythm for
 * the season and pray it together (the /season/:token player: a shared Day-N
 * clock, check-ins, and the priest's occasional notes).
 *
 * Mirrors prescribe-routine.tsx's snapshot/restore of the designer's own
 * routine localStorage so designing for the parish never disturbs the priest's
 * own rhythm.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import WayOfLoveRuleFlow, { type RoutineSpec } from "@/components/WayOfLoveRuleFlow";
import { apiRequest } from "@/lib/queryClient";
import { pushRoutineConfig } from "@/lib/routineSync";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

// Same routine-structure localStorage keys the customizer writes — snapshot on
// entry, restore on exit (identical set to prescribe-routine.tsx).
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

const DURATIONS = [14, 21, 28] as const;

export default function ParishSeasonNewPage() {
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
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState<number>(21);
  const [phase, setPhase] = useState<"design" | "params" | "done">("design");
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
    setPhase("params");
  };

  const start = async () => {
    if (!spec || busy || parishId === null) return;
    setBusy(true); setError(null);
    try {
      const res = await apiRequest("POST", "/api/parish/season", {
        parishId, spec, title: title.trim() || undefined, durationDays: duration,
      }) as { ok?: boolean };
      if (!res?.ok) throw new Error("failed");
      setPhase("done");
    } catch {
      setError("Couldn't start the season. A season may already be running, or you may not be an admin of this parish.");
    } finally {
      setBusy(false);
    }
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

  if (phase === "params") {
    return (
      <div style={wrap}>
        <div>
          <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: SAGE, fontFamily: FONT, marginBottom: 6 }}>
            Rhythm ready 🌿
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.25 }}>
            Name your season
          </h1>
          <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, marginTop: 8 }}>
            Your parish will see this and pray the rhythm you just built, together, for the length you choose.
          </p>
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder="e.g. Three weeks toward Advent"
          style={{ ...card, padding: "14px 16px", color: WARM, fontFamily: FONT, fontSize: 15, outline: "none" }}
        />
        <div>
          <p style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: SAGE, fontFamily: FONT, marginBottom: 8 }}>How long</p>
          <div style={{ display: "flex", gap: 8 }}>
            {DURATIONS.map((d) => (
              <button key={d} type="button" onClick={() => setDuration(d)}
                style={{
                  flex: 1, background: duration === d ? "rgba(46,107,64,0.85)" : "transparent",
                  color: duration === d ? WARM : SAGE,
                  border: `1px solid ${duration === d ? "rgba(126,210,140,0.5)" : "rgba(143,175,150,0.25)"}`,
                  borderRadius: 12, padding: "12px", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer",
                }}>
                {d / 7} weeks
              </button>
            ))}
          </div>
        </div>
        {error && <p style={{ color: "#E5A3A3", fontSize: 13, fontFamily: FONT }}>{error}</p>}
        <button type="button" onClick={start} disabled={busy}
          style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", borderRadius: 14, padding: "15px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Starting…" : "Start the season"}
        </button>
        <button type="button" onClick={() => setLocation(backTarget)}
          style={{ background: "transparent", color: SAGE, border: "1px solid rgba(143,175,150,0.25)", borderRadius: 14, padding: "12px 20px", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    );
  }

  // Done
  return (
    <div style={wrap}>
      <div>
        <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: SAGE, fontFamily: FONT, marginBottom: 6 }}>
          Season begun 🕊️
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.25 }}>
          {title.trim() ? `“${title.trim()}” has begun` : "Your season has begun"}
        </h1>
        <p style={{ fontSize: 14, color: SAGE, fontFamily: FONT, marginTop: 8 }}>
          Your parish will see it on their dashboard and can take up the rhythm. Post a note now and then to walk with them.
        </p>
      </div>
      <button type="button" onClick={() => setLocation(backTarget)}
        style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", borderRadius: 14, padding: "15px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
        Back to parish admin
      </button>
    </div>
  );
}
