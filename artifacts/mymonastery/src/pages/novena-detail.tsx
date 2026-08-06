import { useMemo, useState, type CSSProperties } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useRhythmState } from "@/hooks/useRhythmState";
import { Layout } from "@/components/layout";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

// Novena preview — source/attribution + Start, before any reading begins.
// Starting asks replace-vs-addition, and (if both sides are on) which slot to
// replace, matching the guided-prayer / office pattern of asking up front
// rather than burying the choice in settings.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT = "rgba(143,175,150,0.6)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const CARD_BG = "rgba(9,26,16, 0.34)";
const CARD_BORDER = "rgba(46,107,64,0.38)";

type Novena = {
  id: number; title: string; saint: string | null; sourceNote: string | null; dayCount: number;
  history: string | null; intention: string | null; isCurrent: boolean; lastCompletedAt: string | null;
};
type Mode = "choose" | "slot" | null;

export default function NovenaDetailPage() {
  const params = useParams<{ id: string }>();
  const novenaId = Number(params.id);
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { novena: activeNovena, morningActive, eveningActive } = useRhythmState();
  const bgPhoto = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  const { data } = useQuery<{ novenas: Novena[] }>({
    queryKey: ["/api/novenas"],
    queryFn: () => apiRequest("GET", "/api/novenas"),
  });
  const novena = (data?.novenas ?? []).find((n) => n.id === novenaId) ?? null;

  const isCurrent = activeNovena?.novenaId === novenaId;
  const [mode, setMode] = useState<Mode>(null);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const start = useMutation({
    mutationFn: (replacesSlot: "morning" | "evening" | null) =>
      apiRequest("POST", `/api/novenas/${novenaId}/start`, { confirmSwitch: true, replacesSlot }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/me/novena"] });
      setMode(null);
      setJustAdded(true);
    },
  });

  if (!novena) {
    return (
      <Layout bgPhoto={bgPhoto}>
        <div className="flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ minHeight: "60dvh", color: WARM, fontFamily: FONT }}>
          <p style={{ color: SAGE }}>Loading…</p>
        </div>
      </Layout>
    );
  }

  const bothSidesOn = morningActive && eveningActive;
  const otherActive = activeNovena && !isCurrent;

  function beginFlow() {
    if (otherActive) { setConfirmSwitch(true); return; }
    setMode("choose");
  }

  function chooseAddition() {
    setMode(null);
    start.mutate(null);
  }
  function chooseReplace() {
    if (bothSidesOn) { setMode("slot"); return; }
    start.mutate(morningActive ? "morning" : eveningActive ? "evening" : null);
  }

  return (
    <Layout bgPhoto={bgPhoto}>
      <div style={{ position: "relative", isolation: "isolate", minHeight: "100dvh" }}>
        <div style={{ maxWidth: 560, width: "100%", margin: "0 auto", color: WARM, fontFamily: FONT, paddingBottom: 64 }}>
          <button
            type="button"
            onClick={() => setLocation("/novena-library")}
            style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            ← Novenas
          </button>

          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: FAINT, margin: "0 0 8px" }}>
            {novena.dayCount}-Day Novena{novena.saint ? ` · ${novena.saint}` : ""}
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 18px", letterSpacing: "-0.02em", lineHeight: 1.15 }}>
            {novena.title}
          </h1>

          {novena.history && (
            <div style={{ background: CARD_BG, backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)", border: `1px solid ${CARD_BORDER}`, borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: FAINT, margin: "0 0 6px" }}>History</p>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(240,237,230,0.9)", fontFamily: SERIF, margin: 0 }}>{novena.history}</p>
            </div>
          )}

          {novena.intention && (
            <div style={{ background: CARD_BG, backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)", border: `1px solid ${CARD_BORDER}`, borderRadius: 16, padding: "16px 18px", marginBottom: 14 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: FAINT, margin: "0 0 6px" }}>Intention</p>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(240,237,230,0.9)", fontFamily: SERIF, margin: 0 }}>{novena.intention}</p>
            </div>
          )}

          {novena.sourceNote && (
            <div style={{ background: CARD_BG, backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)", border: `1px solid ${CARD_BORDER}`, borderRadius: 16, padding: "16px 18px", marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: FAINT, margin: "0 0 6px" }}>Source</p>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(240,237,230,0.9)", fontFamily: SERIF, margin: 0 }}>{novena.sourceNote}</p>
            </div>
          )}

          <p style={{ fontSize: 14, lineHeight: 1.6, color: SAGE, margin: "0 0 28px" }}>
            One day rides in your daily routine at a time — it only advances when you mark that day complete, never automatically by the calendar. You can stop at any point.
          </p>

          {isCurrent ? (
            <p style={{ fontSize: 13, color: SAGE, marginBottom: 14 }}>
              Day {activeNovena!.currentDay} of {activeNovena!.dayCount} · already in your routine
            </p>
          ) : novena.lastCompletedAt ? (
            <p style={{ fontSize: 13, color: SAGE, marginBottom: 14 }}>
              Last completed {new Date(novena.lastCompletedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </p>
          ) : null}

          {justAdded ? (
            <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 16, padding: "18px", textAlign: "center", marginBottom: 16 }}>
              <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>✓ Added to your routine</p>
              <p style={{ fontSize: 13, color: SAGE, marginBottom: 16 }}>{novena.title} now shows as a card on your home screen.</p>
              <button
                type="button"
                onClick={() => setLocation("/dashboard")}
                className="rounded-full py-2.5 px-8"
                style={{ background: "#2D5E3F", color: WARM, fontFamily: FONT, fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer" }}
              >
                Go to home
              </button>
            </div>
          ) : mode === "choose" ? (
            <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 16, padding: "18px", marginBottom: 16 }}>
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Would you like this to replace your daily prayer, or be in addition to it?</p>
              <p style={{ fontSize: 12.5, color: SAGE, marginBottom: 16, lineHeight: 1.5 }}>
                Replacing takes over morning or evening prayer for these nine days — what you normally pray there returns once the novena ends. In addition rides alongside your routine as its own card.
              </p>
              <div className="flex flex-col gap-2">
                <button type="button" onClick={chooseReplace} disabled={start.isPending}
                  className="rounded-full py-2.5 px-6 disabled:opacity-60"
                  style={{ background: "#2D5E3F", color: WARM, fontFamily: FONT, fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer" }}>
                  Replace morning or evening prayer
                </button>
                <button type="button" onClick={chooseAddition} disabled={start.isPending}
                  className="rounded-full py-2.5 px-6 disabled:opacity-60"
                  style={{ background: "transparent", color: WARM, fontFamily: FONT, fontSize: 14, fontWeight: 700, border: `1px solid ${SAGE}`, cursor: "pointer" }}>
                  Add alongside my routine
                </button>
                <button type="button" onClick={() => setMode(null)} style={{ background: "none", border: "none", color: FAINT, fontFamily: FONT, fontSize: 12.5, cursor: "pointer", marginTop: 4 }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : mode === "slot" ? (
            <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 16, padding: "18px", marginBottom: 16 }}>
              <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Which prayer should it replace?</p>
              <div className="flex flex-col gap-2">
                <button type="button" onClick={() => start.mutate("morning")} disabled={start.isPending}
                  className="rounded-full py-2.5 px-6 disabled:opacity-60"
                  style={{ background: "#2D5E3F", color: WARM, fontFamily: FONT, fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer" }}>
                  Morning prayer
                </button>
                <button type="button" onClick={() => start.mutate("evening")} disabled={start.isPending}
                  className="rounded-full py-2.5 px-6 disabled:opacity-60"
                  style={{ background: "#2D5E3F", color: WARM, fontFamily: FONT, fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer" }}>
                  Evening prayer
                </button>
                <button type="button" onClick={() => setMode("choose")} style={{ background: "none", border: "none", color: FAINT, fontFamily: FONT, fontSize: 12.5, cursor: "pointer", marginTop: 4 }}>
                  Back
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => (isCurrent ? setLocation("/novena") : beginFlow())}
              className="rounded-full py-3 px-10"
              style={{ background: "#2D5E3F", color: WARM, fontFamily: FONT, fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer" }}
            >
              {isCurrent ? "Continue" : "Begin"}
            </button>
          )}

          {confirmSwitch && (
            <div className="fixed inset-0 flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,0.6)", zIndex: 20 }}>
              <div className="rounded-2xl p-5 max-w-sm w-full" style={{ background: "#0F2818", border: `1px solid ${CARD_BORDER}`, fontFamily: FONT, color: WARM }}>
                <p className="mb-4" style={{ fontSize: 14, lineHeight: 1.5 }}>
                  Stop {activeNovena?.title ?? "your current novena"} and start {novena.title}?
                </p>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setConfirmSwitch(false)} className="px-4 py-2 rounded-full text-sm" style={{ color: SAGE, background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
                  <button
                    onClick={() => { setConfirmSwitch(false); setMode("choose"); }}
                    className="px-4 py-2 rounded-full text-sm font-semibold"
                    style={{ background: "#2D5E3F", color: WARM, border: "none", cursor: "pointer" }}
                  >
                    Switch
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
