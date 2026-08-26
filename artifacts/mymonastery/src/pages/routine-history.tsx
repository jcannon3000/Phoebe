/**
 * The routine backlog — "go back to a rhythm you kept before."
 *
 * Owner: "a third option where it says revert to past routine, and we have a
 * backlog that saves routines. Every time they get the customizer."
 *
 * A rule of life is meant to be lived with and adjusted, which means changing
 * it has to be safe. Someone who tried a fuller rhythm through Lent and found
 * it didn't hold shouldn't have to rebuild the old one from memory — the app
 * already knew what it was.
 *
 * Snapshots are taken BEFORE a routine changes (opening the customizer,
 * accepting an AI-built one, restoring an older one), so every entry here is a
 * rhythm that was actually in force. Restoring snapshots the current one first,
 * so this screen can undo itself.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { adoptRoutineConfig } from "@/lib/routineSync";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD = "rgba(9,26,16,0.42)";
const CARD_B = "rgba(46,107,64,0.35)";
const CTA = "#2D5E3F";

type SpecRow = { emoji: string; label: string; sub: string; section: string };
type Snapshot = { id: number; source: string; createdAt: string; settings: SpecRow[] };

// What was happening when this routine was saved. Phrased as the moment BEFORE
// the change, because that's what the snapshot holds.
const SOURCE_LABEL: Record<string, string> = {
  customizer: "Before you edited it",
  interview: "Before Phoebe rebuilt it",
  restore: "Before you went back",
};

function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

export default function RoutineHistoryPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const backdrop = LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[0]! : null;

  const { data, isLoading } = useQuery<{ snapshots: Snapshot[] }>({
    queryKey: ["/api/me/routine-snapshots"],
    queryFn: () => apiRequest("GET", "/api/me/routine-snapshots"),
    staleTime: 30_000,
  });
  const snapshots = data?.snapshots ?? [];

  const restore = async (id: number) => {
    if (busy !== null) return;
    setBusy(id);
    setError(null);
    try {
      const res = (await apiRequest("POST", `/api/me/routine-snapshots/${id}/restore`, {})) as
        | { spec?: { ruleConfig?: Record<string, string> } }
        | null;
      // Mirror onto THIS device immediately — the home reads office levels and
      // slots straight from localStorage, so without this they'd sit on the
      // routine they just replaced until the next sync.
      try { if (res?.spec?.ruleConfig) adoptRoutineConfig(res.spec.ruleConfig); } catch { /* server has it */ }
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      qc.invalidateQueries({ queryKey: ["/api/me/office-prefs"] });
      qc.invalidateQueries({ queryKey: ["/api/me/routine-snapshots"] });
      setLocation("/dashboard");
    } catch {
      setError("Couldn't go back to that routine just now. Try again.");
      setBusy(null);
      setConfirming(null);
    }
  };

  const wrap: React.CSSProperties = {
    display: "flex", flexDirection: "column", gap: 18,
    padding: "8px 20px 40px", maxWidth: 560, margin: "0 auto", width: "100%",
    boxSizing: "border-box",
  };
  const card: React.CSSProperties = {
    background: CARD, backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
    border: `1px solid ${CARD_B}`, borderRadius: 18, padding: 16,
  };
  const eyebrow: React.CSSProperties = {
    fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase",
    color: SAGE, fontFamily: FONT, margin: 0, fontWeight: 600,
  };

  return (
    <Layout bgPhoto={backdrop} chromeless onClose={() => setLocation("/rule-of-life")}>
      <div style={wrap}>
        <div>
          <p style={eyebrow}>Your rhythms 🌿</p>
          <h1 style={{ fontSize: "clamp(26px, 7vw, 32px)", fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.2, margin: "8px 0 0", letterSpacing: "-0.02em" }}>
            Go back to a past routine
          </h1>
          <p style={{ color: SAGE, fontFamily: FONT, fontSize: 15, lineHeight: 1.6, marginTop: 10 }}>
            Rhythms you kept before. Going back doesn't lose the one you have
            now — it's saved here too.
          </p>
        </div>

        {isLoading && (
          <div style={{ ...card, textAlign: "center" }}>
            <p style={{ color: SAGE, fontFamily: FONT, fontSize: 14.5, margin: 0 }}>Looking back…</p>
          </div>
        )}

        {!isLoading && snapshots.length === 0 && (
          <div style={{ ...card, textAlign: "center" }}>
            <p style={{ color: WARM, fontFamily: FONT, fontSize: 16, margin: 0, lineHeight: 1.5 }}>
              Nothing to go back to yet.
            </p>
            <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13.5, margin: "8px 0 0", lineHeight: 1.55 }}>
              From now on, each time you change your routine the old one is kept
              here.
            </p>
          </div>
        )}

        {snapshots.map((s) => {
          const isConfirming = confirming === s.id;
          return (
            <div key={s.id} style={card}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <p style={{ color: WARM, fontFamily: FONT, fontSize: 16.5, fontWeight: 700, margin: 0 }}>
                  {whenLabel(s.createdAt)}
                </p>
                <p style={{ color: SAGE, fontFamily: FONT, fontSize: 12.5, margin: 0 }}>
                  {SOURCE_LABEL[s.source] ?? "Saved"}
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                {s.settings.map((r, i) => (
                  <div key={`${r.label}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 17, flexShrink: 0 }} aria-hidden>{r.emoji}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", color: WARM, fontFamily: FONT, fontSize: 14.5, fontWeight: 600 }}>{r.label}</span>
                      <span style={{ display: "block", color: SAGE, fontFamily: FONT, fontSize: 12.5, marginTop: 1 }}>{r.sub}</span>
                    </span>
                  </div>
                ))}
              </div>

              {/* Two taps, because this replaces their whole rule of life and
                  the list is a wall of similar-looking cards — a stray tap on
                  the wrong one shouldn't silently swap their rhythm. */}
              {isConfirming ? (
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button
                    type="button"
                    onClick={() => restore(s.id)}
                    disabled={busy !== null}
                    style={{
                      flex: 1, background: CTA, color: WARM, border: `1px solid ${CARD_B}`,
                      borderRadius: 12, padding: "12px 16px", fontSize: 14.5, fontWeight: 700,
                      fontFamily: FONT, cursor: "pointer", opacity: busy === s.id ? 0.6 : 1,
                    }}
                  >
                    {busy === s.id ? "Going back…" : "Yes, use this one"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    style={{
                      flex: 1, background: "transparent", color: SAGE,
                      border: "1px solid rgba(143,175,150,0.25)", borderRadius: 12,
                      padding: "12px 16px", fontSize: 14.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer",
                    }}
                  >
                    Never mind
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setError(null); setConfirming(s.id); }}
                  style={{
                    width: "100%", marginTop: 16, background: "transparent", color: WARM,
                    border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "12px 16px",
                    fontSize: 14.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer",
                  }}
                >
                  Go back to this
                </button>
              )}
            </div>
          );
        })}

        {error && <p style={{ color: "#E5A3A3", fontSize: 13.5, fontFamily: FONT, margin: 0 }}>{error}</p>}

        <button
          type="button"
          onClick={() => setLocation("/rule-of-life")}
          style={{
            background: "transparent", color: SAGE, border: "1px solid rgba(143,175,150,0.25)",
            borderRadius: 14, padding: "12px 20px", fontSize: 14, fontWeight: 600,
            fontFamily: FONT, cursor: "pointer", width: "100%",
          }}
        >
          Back
        </button>
      </div>
    </Layout>
  );
}
