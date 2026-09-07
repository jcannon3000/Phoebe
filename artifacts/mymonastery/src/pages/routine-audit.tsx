/**
 * Weekly routine audit — "does your rule still match your week?"
 *
 * Owner: the app should look at when a person actually practices, and which
 * practices they open that aren't in their routine, then once a week compare
 * that against what they programmed and suggest adjustments.
 *
 * Super-admin only for now (owner) — the server gates both endpoints, and GET
 * returns an empty list rather than a 403 so this page degrades to "nothing to
 * suggest" instead of an error for anyone else.
 *
 * Every finding is an OFFER with its own button. There is deliberately no
 * "apply all": a drifting rhythm is the person's own business, and an app that
 * rewrote someone's rule of life to match their worst fortnight would be doing
 * something unkind. Dismissing is a first-class outcome.
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD = "rgba(9,26,16,0.42)";
const CARD_B = "rgba(46,107,64,0.35)";
const CTA = "#2D5E3F";

type Change =
  | { type: "ruleConfig"; key: string; value: string }
  | { type: "officePrefs"; field: "morningTime" | "eveningTime"; value: string };
type Finding = { kind: "adopt" | "drop" | "retime"; message: string; change: Change };

const KIND_EMOJI: Record<Finding["kind"], string> = {
  retime: "⏰", adopt: "✨", drop: "🍃",
};

export default function RoutineAuditPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const backdrop = useMemo(
    () => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );
  const [done, setDone] = useState<Record<number, "applied" | "dismissed">>({});
  const [busy, setBusy] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ findings: Finding[] }>({
    queryKey: ["/api/me/routine-audit"],
    queryFn: () => apiRequest("GET", "/api/me/routine-audit"),
    staleTime: 5 * 60_000,
  });
  const findings = data?.findings ?? [];

  const apply = async (i: number, f: Finding) => {
    if (busy !== null) return;
    setBusy(i);
    try {
      await apiRequest("POST", "/api/me/routine-audit/apply", { change: f.change });
      setDone((d) => ({ ...d, [i]: "applied" }));
      // The routine changed server-side; drop the caches that read it so the
      // home and the customizer don't keep showing the old rhythm.
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      qc.invalidateQueries({ queryKey: ["/api/me/office-prefs"] });
      // The card list too — the change now moves the home LAYOUT, and the
      // home reads that from its own query and its local cache.
      qc.invalidateQueries({ queryKey: ["/api/me/home-layout"] });
      try { window.dispatchEvent(new Event("phoebe:prefs-changed")); } catch { /* web no-op */ }
    } catch {
      setDone((d) => ({ ...d, [i]: "dismissed" }));
    } finally {
      setBusy(null);
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

  const open = findings.filter((_, i) => !done[i]);

  return (
    <Layout bgPhoto={backdrop} chromeless onClose={() => setLocation("/daily-progress")}>
      <div style={wrap}>
        <div>
          <p style={eyebrow}>This week 🌿</p>
          <h1 style={{ fontSize: "clamp(26px, 7vw, 32px)", fontWeight: 700, color: WARM, fontFamily: FONT, lineHeight: 1.2, margin: "8px 0 0", letterSpacing: "-0.02em" }}>
            How your week actually went
          </h1>
          <p style={{ color: SAGE, fontFamily: FONT, fontSize: 15, lineHeight: 1.6, marginTop: 10 }}>
            A look at what you kept over the last two weeks, next to what your
            rule says. Change anything that's drifted — or leave it.
          </p>
        </div>

        {isLoading && (
          <div style={{ ...card, textAlign: "center" }}>
            <p style={{ color: SAGE, fontFamily: FONT, fontSize: 14.5, margin: 0 }}>Looking at your two weeks…</p>
          </div>
        )}

        {!isLoading && open.length === 0 && (
          <div style={{ ...card, textAlign: "center" }}>
            <p style={{ color: WARM, fontFamily: FONT, fontSize: 16, margin: 0, lineHeight: 1.5 }}>
              Your rule matches your week.
            </p>
            <p style={{ color: SAGE, fontFamily: FONT, fontSize: 13.5, margin: "8px 0 0", lineHeight: 1.55 }}>
              Nothing to adjust — what you programmed is what you're praying.
            </p>
          </div>
        )}

        {findings.map((f, i) => {
          const state = done[i];
          if (state) {
            return (
              <div key={i} style={{ ...card, opacity: 0.6 }}>
                <p style={{ color: SAGE, fontFamily: FONT, fontSize: 14, margin: 0 }}>
                  {state === "applied" ? "✓ Changed." : "Left as it is."}
                </p>
              </div>
            );
          }
          return (
            <div key={i} style={card}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ fontSize: 22, flexShrink: 0 }} aria-hidden>{KIND_EMOJI[f.kind]}</span>
                <p style={{ color: WARM, fontFamily: FONT, fontSize: 15.5, lineHeight: 1.55, margin: 0 }}>
                  {f.message}
                </p>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => apply(i, f)}
                  disabled={busy !== null}
                  style={{
                    flex: 1, background: CTA, color: WARM, border: `1px solid ${CARD_B}`,
                    borderRadius: 12, padding: "12px 16px", fontSize: 14.5, fontWeight: 700,
                    fontFamily: FONT, cursor: "pointer", opacity: busy === i ? 0.6 : 1,
                  }}
                >
                  {busy === i ? "Changing…" : "Yes, change it"}
                </button>
                <button
                  type="button"
                  onClick={() => setDone((d) => ({ ...d, [i]: "dismissed" }))}
                  style={{
                    flex: 1, background: "transparent", color: SAGE,
                    border: "1px solid rgba(143,175,150,0.25)", borderRadius: 12,
                    padding: "12px 16px", fontSize: 14.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer",
                  }}
                >
                  Leave it
                </button>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          style={{
            background: "transparent", color: SAGE, border: "1px solid rgba(143,175,150,0.25)",
            borderRadius: 14, padding: "12px 20px", fontSize: 14, fontWeight: 600,
            fontFamily: FONT, cursor: "pointer", width: "100%",
          }}
        >
          Done
        </button>
      </div>
    </Layout>
  );
}
