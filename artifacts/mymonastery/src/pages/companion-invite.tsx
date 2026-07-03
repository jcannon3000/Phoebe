import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { startCommitment } from "@/lib/commitment";

// ── /companion/:token — a rhythm-party invite ────────────────────────────────
//
// "Jeremy invited you to keep a month of daily prayer together." The link
// CARRIES THE RULE: accepting joins the party (shared Day-N counter, capped at
// 3) and hands the same rhythm to the customizer via /rule-of-life?adopt=
// <presetId>, so the recipient's first rhythm arrives as a gift — no stick
// shift. Signed-out visitors are sent to sign in first (the token survives the
// round-trip via sessionStorage, same pattern as /fellow/:token).
// Server: memory "project_rhythm_parties".

const CREAM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const BG = "#0C1F12";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD = "rgba(9,26,16, 0.297)";
const CARD_B = "rgba(46,107,64,0.4)";

// Human labels for the rule the invite carries (RULE_PRESETS ids).
const PRESET_LABEL: Record<string, { emoji: string; label: string; sub: string }> = {
  "morning-anchor": { emoji: "🌅", label: "A gentle start", sub: "One short prayer to anchor the morning — ~5 min a day." },
  "psalms-daily": { emoji: "📜", label: "Praying the Psalms", sub: "The day's psalms, morning and evening, with a few minutes of silence." },
  "centering": { emoji: "🕯️", label: "Centering Prayer", sub: "Two daily sits in silence, with the CAC's daily meditation." },
  "offices": { emoji: "📖", label: "The Daily Office", sub: "Morning & Evening Prayer from the Book of Common Prayer." },
  "custom": { emoji: "🌿", label: "A rule of life", sub: "A daily rhythm of prayer they shaped themselves." },
};

type Preview = {
  presetId: string; days: number; status: string;
  createdByName: string | null; createdByAvatar: string | null;
  memberCount: number; full: boolean; alreadyMember: boolean; isCreator: boolean;
};

export default function CompanionInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: preview, isLoading } = useQuery<Preview>({
    queryKey: ["/api/rhythm-party", token],
    queryFn: () => apiRequest("GET", `/api/rhythm-party/${token}`),
    enabled: !!user && !!token,
  });

  const accept = async () => {
    if (!token || accepting) return;
    setAccepting(true);
    try {
      const r = await apiRequest<{ ok: boolean; presetId: string }>("POST", `/api/rhythm-party/${token}/accept`);
      // Aligned Day-1: the local commitment starts now (the party's shared
      // day count comes from the server; this covers the solo band too).
      startCommitment();
      // The invite carries the rule — hand the preset to the customizer,
      // which auto-adopts it (one tap, no stick shift). A custom rule just
      // opens the customizer to shape their own alongside.
      const preset = r.presetId && PRESET_LABEL[r.presetId] && r.presetId !== "custom" ? r.presetId : null;
      setLocation(preset ? `/rule-of-life?adopt=${preset}` : "/rule-of-life", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join — the rhythm may be full.");
      setAccepting(false);
    }
  };

  const meta = PRESET_LABEL[preview?.presetId ?? ""] ?? PRESET_LABEL.custom;
  const name = preview?.createdByName ?? t("companion.someone", { defaultValue: "A friend" });

  return (
    <div style={{ position: "relative", minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 26px", isolation: "isolate", textAlign: "center" }}>
      <AnimatedBackground base={BG} variant="subtle" />
      {authLoading ? null : !user ? (
        <>
          <span style={{ fontSize: 44 }} aria-hidden>🤝</span>
          <h1 style={{ color: CREAM, fontSize: 24, fontWeight: 700, fontFamily: FONT, margin: "18px 0 0", maxWidth: 360 }}>
            {t("companion.signin_title", { defaultValue: "You're invited to keep a rhythm of prayer together" })}
          </h1>
          <p style={{ color: SAGE, fontSize: 14.5, fontFamily: FONT, lineHeight: 1.6, margin: "12px 0 0", maxWidth: 340 }}>
            {t("companion.signin_sub", { defaultValue: "Sign in to see the rhythm and walk the month together." })}
          </p>
          <button
            onClick={() => { try { sessionStorage.setItem("phoebe:companion-token", token ?? ""); } catch { /* ignore */ } setLocation("/signin"); }}
            style={{ marginTop: 26, width: "100%", maxWidth: 340, background: "rgba(46,107,64,0.72)", border: `1px solid ${CARD_B}`, color: CREAM, borderRadius: 14, padding: "16px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}
          >
            {t("companion.signin_cta", { defaultValue: "Sign in to accept" })}
          </button>
        </>
      ) : isLoading || !preview ? (
        <p style={{ color: SAGE, fontFamily: FONT, fontSize: 14 }}>{t("companion.loading", { defaultValue: "Opening the invitation…" })}</p>
      ) : (
        <>
          {preview.createdByAvatar ? (
            <img src={preview.createdByAvatar} alt="" style={{ width: 64, height: 64, borderRadius: 999, objectFit: "cover", border: "2px solid rgba(168,197,160,0.5)" }} />
          ) : (
            <span style={{ fontSize: 44 }} aria-hidden>🤝</span>
          )}
          <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "1.4px", fontFamily: FONT, margin: "16px 0 6px" }}>
            {t("companion.eyebrow", { defaultValue: "Keep a rhythm together" })}
          </p>
          <h1 style={{ color: CREAM, fontSize: 23, fontWeight: 700, fontFamily: FONT, margin: 0, maxWidth: 360, lineHeight: 1.3 }}>
            {t("companion.title", { name, days: preview.days, defaultValue: `${name} invited you to keep ${preview.days} days of daily prayer together` })}
          </h1>
          <div style={{ marginTop: 20, width: "100%", maxWidth: 360, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "15px 16px", display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
            <span style={{ fontSize: 24, flexShrink: 0 }} aria-hidden>{meta.emoji}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", color: CREAM, fontSize: 15.5, fontWeight: 600, fontFamily: FONT }}>{meta.label}</span>
              <span style={{ display: "block", color: SAGE, fontSize: 12.5, fontFamily: FONT, marginTop: 2, lineHeight: 1.45 }}>{meta.sub}</span>
            </span>
          </div>
          {preview.alreadyMember || preview.isCreator ? (
            <button onClick={() => setLocation("/dashboard")} style={{ marginTop: 22, width: "100%", maxWidth: 360, background: "rgba(46,107,64,0.72)", border: `1px solid ${CARD_B}`, color: CREAM, borderRadius: 14, padding: "16px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
              {t("companion.already", { defaultValue: "You're in — back to your rhythm" })}
            </button>
          ) : preview.full ? (
            <p style={{ color: SAGE, fontSize: 14, fontFamily: FONT, marginTop: 22, maxWidth: 340 }}>
              {t("companion.full", { defaultValue: "This rhythm already has its companions — three is a triad. Ask them to start another month with you." })}
            </p>
          ) : (
            <>
              <button onClick={() => { void accept(); }} disabled={accepting} style={{ marginTop: 22, width: "100%", maxWidth: 360, background: "rgba(46,107,64,0.72)", border: `1px solid ${CARD_B}`, color: CREAM, borderRadius: 14, padding: "16px 20px", fontSize: 16, fontWeight: 700, fontFamily: FONT, cursor: "pointer", opacity: accepting ? 0.6 : 1 }}>
                {accepting ? t("companion.joining", { defaultValue: "Joining…" }) : t("companion.accept", { defaultValue: "I'm in — walk it together" })}
              </button>
              {error && <p style={{ color: "#D9A79B", fontSize: 13, fontFamily: FONT, marginTop: 10 }}>{error}</p>}
              <button onClick={() => setLocation("/dashboard")} style={{ marginTop: 12, background: "none", border: "none", color: SAGE, fontSize: 13.5, fontFamily: FONT, cursor: "pointer" }}>
                {t("companion.later", { defaultValue: "Not now" })}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
