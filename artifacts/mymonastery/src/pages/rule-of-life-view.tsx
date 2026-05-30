/**
 * /rule-of-life/:id — revisitable Rule of Life card.
 *
 * Shows the saved narrative + practice summary for a previous session.
 * Allows applying the settings (if not already applied) and emailing.
 */

import { useState, useEffect } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ChevronLeft, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { useBetaStatus } from "@/hooks/useDemo";
import {
  setSideLevel,
  setSideEntry,
  setSideReflection,
  setSideConfession,
  setSideGratitude,
  setSideMinutes,
  type OfficeSide,
  type OfficeLevel,
  type ReflectionSource,
  type DefaultOfficeEntry,
} from "@/lib/officePrefs";

const EP_BG = "#0F2818";
const CREAM = "#E8E4D8";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const CHIP_DEFAULT = "rgba(46,107,64,0.14)";
const CHIP_BORDER = "rgba(46,107,64,0.28)";
const CHIP_ACTIVE = "rgba(46,107,64,0.52)";
const CHIP_BORDER_ACTIVE = "rgba(46,107,64,0.80)";

interface SideSettings {
  enabled: boolean;
  level: OfficeLevel;
  wayToPray: DefaultOfficeEntry;
  reflectionSource: ReflectionSource;
  confession: boolean;
  gratitude: boolean;
  minutes: number;
  reminderTime: string;
}

interface SessionRow {
  id: number;
  subject_name: string | null;
  mode: string;
  narrative: string;
  plain_summary: string;
  settings: { morning: SideSettings | { enabled: false }; evening: SideSettings | { enabled: false } };
  connection_focus: string;
  anchor: string;
  applied_at: string | null;
  delivered_to: string | null;
  created_at: string;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  } catch { return ""; }
}

function applySettings(settings: SessionRow["settings"]): void {
  for (const side of ["morning", "evening"] as OfficeSide[]) {
    const s = settings[side];
    if (!s.enabled) continue;
    const ss = s as SideSettings;
    setSideLevel(side, ss.level as OfficeLevel);
    setSideEntry(side, ss.wayToPray as DefaultOfficeEntry);
    setSideReflection(side, ss.reflectionSource as ReflectionSource);
    setSideConfession(side, ss.confession);
    setSideGratitude(side, ss.gratitude);
    setSideMinutes(side, ss.minutes);
  }
}

export default function RuleOfLifeViewPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { isBeta, isLoading: betaLoading } = useBetaStatus();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  useEffect(() => {
    if (!betaLoading && !isBeta) setLocation("/daily-practice");
  }, [betaLoading, isBeta, setLocation]);

  const [applyDone, setApplyDone] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  const { data: session, isLoading, isError } = useQuery<SessionRow>({
    queryKey: [`/api/rule-of-life/${id}`],
    queryFn: () => apiRequest("GET", `/api/rule-of-life/${id}`),
    enabled: !!id,
  });

  const applyMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/rule-of-life/${id}/apply`),
  });

  const emailMutation = useMutation({
    mutationFn: (to: string) => apiRequest("POST", `/api/rule-of-life/${id}/email`, { to }),
    onSuccess: () => setEmailSent(true),
  });

  const handleApply = () => {
    if (!session) return;
    applySettings(session.settings);
    applyMutation.mutate();
    setApplyDone(true);
    const { morning, evening } = session.settings;
    apiRequest("PUT", "/api/me/office-prefs", {
      morning: morning.enabled ? (morning as SideSettings).level : "none",
      evening: evening.enabled ? (evening as SideSettings).level : "none",
      morningTime: morning.enabled ? (morning as SideSettings).reminderTime : null,
      eveningTime: evening.enabled ? (evening as SideSettings).reminderTime : null,
      showConfession: (morning.enabled && (morning as SideSettings).confession) ||
                     (evening.enabled && (evening as SideSettings).confession),
    }).catch(() => {});
  };

  if (isLoading) {
    return (
      <Layout>
        <div style={{ flex: 1, minHeight: 0, background: EP_BG, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AnimatedBackground base={EP_BG} variant="pronounced" />
          <p style={{ color: SAGE_DIM, fontFamily: "Georgia, serif", fontStyle: "italic", position: "relative", zIndex: 1 }}>
            {t("ruleOfLife.loading", { defaultValue: "Holding what you've shared…" })}
          </p>
        </div>
      </Layout>
    );
  }

  if (isError || !session) {
    return (
      <Layout>
        <div style={{ flex: 1, minHeight: 0, background: EP_BG, position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}>
          <AnimatedBackground base={EP_BG} variant="pronounced" />
          <p style={{ color: CREAM, fontFamily: "system-ui, sans-serif", position: "relative", zIndex: 1 }}>
            {t("ruleOfLife.not_found", { defaultValue: "This rule of life couldn't be found." })}
          </p>
          <Link href="/rule-of-life">
            <button style={{ position: "relative", zIndex: 1, background: CHIP_DEFAULT, border: `1px solid ${CHIP_BORDER}`, color: CREAM, borderRadius: 12, padding: "12px 18px", fontFamily: "system-ui, sans-serif", cursor: "pointer" }}>
              {t("ruleOfLife.start_new", { defaultValue: "Start a new conversation" })}
            </button>
          </Link>
        </div>
      </Layout>
    );
  }

  const alreadyApplied = !!session.applied_at || applyDone;

  return (
    <Layout>
    <div style={{ flex: 1, minHeight: 0, background: EP_BG, position: "relative" }}>
      <AnimatedBackground base={EP_BG} variant="pronounced" />
      <div style={{ position: "relative", zIndex: 1, padding: "24px 20px 60px", maxWidth: 560, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <Link href="/daily-practice">
            <button style={{ background: "none", border: "none", color: SAGE_DIM, cursor: "pointer", fontSize: 14, fontFamily: "system-ui, sans-serif", display: "flex", alignItems: "center", gap: 6 }}>
              <ChevronLeft size={16} />
              {t("ruleOfLife.done", { defaultValue: "Done" })}
            </button>
          </Link>
        </div>

        {/* Title + date */}
        <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 4, fontFamily: "system-ui, sans-serif" }}>
          {t("ruleOfLife.result_label", { defaultValue: "Your Rule of Life" })}
        </p>
        <p style={{ color: SAGE_DIM, fontSize: 13, fontFamily: "system-ui, sans-serif", marginBottom: 28 }}>
          {fmtDate(session.created_at)}
          {session.subject_name ? ` · ${session.subject_name}` : ""}
        </p>

        {/* Applied badge */}
        {alreadyApplied && (
          <div style={{ background: "rgba(46,107,64,0.20)", border: "1px solid rgba(46,107,64,0.40)", borderRadius: 10, padding: "10px 14px", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
            <Check size={15} color={SAGE} />
            <span style={{ color: SAGE, fontSize: 13, fontFamily: "system-ui, sans-serif" }}>
              {t("ruleOfLife.applied_badge", { defaultValue: "Applied to your prayer settings" })}
            </span>
          </div>
        )}

        {/* Narrative */}
        <div style={{ marginBottom: 28 }}>
          {session.narrative.split("\n\n").map((para, i) => (
            <p key={i} style={{ color: CREAM, fontSize: 17, fontFamily: "Georgia, serif", fontStyle: "italic", lineHeight: 1.75, marginBottom: 18 }}>
              {para}
            </p>
          ))}
        </div>

        {/* Practice summary */}
        <div style={{ background: CHIP_DEFAULT, border: `1px solid ${CHIP_BORDER}`, borderRadius: 14, padding: "16px 18px", marginBottom: 24 }}>
          <p style={{ color: SAGE, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 10px", fontFamily: "system-ui, sans-serif" }}>
            {t("ruleOfLife.practice_label", { defaultValue: "The practice" })}
          </p>
          {session.plain_summary.split("\n").filter(Boolean).map((line, i) => (
            <p key={i} style={{ color: CREAM, fontSize: 14, fontFamily: "system-ui, sans-serif", margin: "0 0 6px", lineHeight: 1.5 }}>
              {line}
            </p>
          ))}
        </div>

        {/* Anchor */}
        <p style={{ color: SAGE_DIM, fontSize: 13, fontFamily: "Georgia, serif", fontStyle: "italic", textAlign: "center", marginBottom: 28 }}>
          {t("ruleOfLife.anchor_label", { defaultValue: "Anchor: " })}{session.anchor}
        </p>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {!alreadyApplied && (
            <button
              onClick={handleApply}
              style={{ background: CHIP_ACTIVE, border: `1px solid ${CHIP_BORDER_ACTIVE}`, color: CREAM, borderRadius: 12, padding: "14px 20px", fontSize: 16, fontFamily: "system-ui, sans-serif", cursor: "pointer", fontWeight: 600 }}
            >
              {t("ruleOfLife.apply_btn", { defaultValue: "Apply to my prayer settings" })}
            </button>
          )}

          {/* Email */}
          {showEmail ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {emailSent ? (
                <p style={{ color: SAGE, fontSize: 14, fontFamily: "system-ui, sans-serif", margin: 0 }}>
                  {t("ruleOfLife.email_sent", { defaultValue: "Sent. The rule of life is on its way." })}
                </p>
              ) : (
                <>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder={t("ruleOfLife.email_placeholder", { defaultValue: "Email address" })}
                    style={{ background: CHIP_DEFAULT, border: `1px solid ${CHIP_BORDER}`, borderRadius: 12, padding: "13px 15px", color: CREAM, fontSize: 15, fontFamily: "system-ui, sans-serif", outline: "none" }}
                  />
                  <button
                    onClick={() => emailInput.trim() && emailMutation.mutate(emailInput.trim())}
                    disabled={!emailInput.trim() || emailMutation.isPending}
                    style={{ background: emailInput.trim() ? CHIP_ACTIVE : CHIP_DEFAULT, border: `1px solid ${emailInput.trim() ? CHIP_BORDER_ACTIVE : CHIP_BORDER}`, color: CREAM, borderRadius: 12, padding: "13px 20px", fontSize: 15, fontFamily: "system-ui, sans-serif", cursor: emailInput.trim() ? "pointer" : "not-allowed", fontWeight: 600 }}
                  >
                    {emailMutation.isPending ? t("ruleOfLife.sending", { defaultValue: "Sending…" }) : t("ruleOfLife.send_email", { defaultValue: "Send it" })}
                  </button>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowEmail(true)}
              style={{ background: "none", border: "1px solid rgba(143,175,150,0.25)", color: SAGE, borderRadius: 12, padding: "13px 20px", fontSize: 15, fontFamily: "system-ui, sans-serif", cursor: "pointer" }}
            >
              {t("ruleOfLife.email_btn", { defaultValue: "Email or text it" })}
            </button>
          )}

          <Link href="/rule-of-life">
            <button style={{ background: "none", border: "none", color: SAGE_DIM, fontSize: 13, fontFamily: "system-ui, sans-serif", cursor: "pointer", padding: "8px 0" }}>
              {t("ruleOfLife.start_new", { defaultValue: "Start a new conversation" })}
            </button>
          </Link>
        </div>
      </div>
    </div>
    </Layout>
  );
}
