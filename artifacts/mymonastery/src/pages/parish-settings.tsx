/**
 * Phoebe Parish — settings page.
 *
 * Parish-only users land here when they tap "Settings" from the parish
 * dashboard. Three sections, top to bottom:
 *
 *   1. Parish — name + tagline + a "Change parish" link that drops the
 *      current subscription and routes to /parish/onboarding.
 *   2. Office reminders — for each of morning + evening, choose between
 *      none / Office (full Daily Prayer) / Devotion (the BCP short form).
 *      Saves on every change (no Save button), so the radio reads as
 *      a setting rather than a form.
 *   3. Account — sign out, app version footer.
 *
 * The full-app SettingsPage is much heavier (notifications, language,
 * privacy, blocked users, push debug, etc.). We keep this page
 * intentionally bare: parish-only users shouldn't see surfaces they
 * can't act on (correspondence settings, group muting, etc.).
 */

import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { apiRequest } from "@/lib/queryClient";

const BG = "#091A10";
const WARM_TEXT = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT_GREEN = "rgba(143,175,150,0.55)";
const BORDER = "rgba(200,212,192,0.15)";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const GEORGIA = "Georgia, 'Times New Roman', serif";

type OfficePref = "none" | "office" | "devotion";

interface ParishPrefs {
  morning: OfficePref;
  evening: OfficePref;
  morningTime: string | null;
  parishFeedId: number | null;
  // True when the caller is the parish creator OR a Phoebe staff
  // admin. Drives whether the "Admin & metrics" entry shows in
  // the parish section.
  canManage: boolean;
}

interface ParishToday {
  parish: {
    id: number;
    slug: string;
    title: string;
    tagline: string | null;
    coverEmoji: string | null;
    timezone: string;
  };
}

const MORNING_OPTIONS: Array<{ value: OfficePref; label: string; sub: string }> = [
  { value: "none", label: "No reminder", sub: "" },
  { value: "office", label: "Morning Prayer", sub: "Full Daily Office" },
  { value: "devotion", label: "Morning Devotion", sub: "Short BCP form" },
];
const EVENING_OPTIONS: Array<{ value: OfficePref; label: string; sub: string }> = [
  { value: "none", label: "No reminder", sub: "" },
  { value: "office", label: "Evening Prayer", sub: "Full Daily Office" },
  { value: "devotion", label: "Evening Devotion", sub: "Short BCP form" },
];

export default function ParishSettings() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const logout = useLogout();
  const { rawIsBeta, isLoading: betaLoading } = useBetaStatus();
  // Beta-preview mode: same carve-out as parish-dashboard. Beta users
  // are "full" tier (beta wins) but should see the parish surface.
  const isParishPreviewer = !!user && user.accessTier === "full" && rawIsBeta && user.parishFeedId != null;
  const showParishContent = !!user && (user.accessTier === "parish-only" || isParishPreviewer);

  useEffect(() => {
    if (authLoading || betaLoading) return;
    if (!user) { setLocation("/"); return; }
    // Full-tier users go to the regular settings, UNLESS they're a
    // beta previewer with a parishFeedId — they get to see parish
    // settings too.
    if (user.accessTier === "full" && !isParishPreviewer) { setLocation("/settings"); return; }
    if (user.accessTier === "unassigned") { setLocation("/parish/onboarding"); return; }
  }, [user, authLoading, betaLoading, isParishPreviewer, setLocation]);

  const prefsQuery = useQuery<ParishPrefs>({
    queryKey: ["/api/parish/prefs"],
    queryFn: () => apiRequest("GET", "/api/parish/prefs"),
    enabled: showParishContent,
  });

  const todayQuery = useQuery<ParishToday>({
    queryKey: ["/api/parish/today"],
    queryFn: () => apiRequest("GET", "/api/parish/today"),
    enabled: showParishContent,
    staleTime: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: (patch: Partial<ParishPrefs>) =>
      apiRequest("PUT", "/api/parish/prefs", patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parish/prefs"] });
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/parish/subscribe"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/parish/onboarding");
    },
  });

  if (authLoading || betaLoading || !user) return null;

  const prefs = prefsQuery.data;
  const parish = todayQuery.data?.parish;

  return (
    <div style={{ background: BG, minHeight: "100vh", color: WARM_TEXT }}>
      <div
        style={{
          maxWidth: 600,
          margin: "0 auto",
          padding: "calc(env(safe-area-inset-top) + 24px) 20px calc(env(safe-area-inset-bottom) + 32px)",
        }}
      >
        <div className="flex items-center justify-between mb-8">
          <Link href="/parish">
            <span style={{ color: SAGE, fontSize: 13, fontFamily: SPACE_GROTESK, cursor: "pointer" }}>
              ← Back
            </span>
          </Link>
          <h1
            style={{
              fontFamily: SPACE_GROTESK,
              fontSize: 16,
              fontWeight: 600,
              color: WARM_TEXT,
              margin: 0,
            }}
          >
            Settings
          </h1>
          <span style={{ width: 40 }} />
        </div>

        {/* Parish */}
        <SectionLabel>Parish</SectionLabel>
        <div
          style={{
            background: "#0F2818",
            border: `1px solid ${BORDER}`,
            borderRadius: 16,
            padding: 16,
            marginBottom: 24,
          }}
        >
          <div className="flex items-center gap-3">
            <div
              style={{
                fontSize: 26,
                width: 44,
                height: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
                background: "rgba(46,107,64,0.18)",
                flexShrink: 0,
              }}
            >
              {parish?.coverEmoji ?? "⛪"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: SPACE_GROTESK, fontSize: 15, fontWeight: 600, margin: 0, color: WARM_TEXT }}>
                {parish?.title ?? "Loading…"}
              </p>
              {parish?.tagline && (
                <p style={{ color: SAGE, fontSize: 12, margin: "2px 0 0" }}>{parish.tagline}</p>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 8 }}>
            <button
              type="button"
              onClick={() => {
                if (confirm("Leave this parish? You can pick a new one afterwards.")) {
                  leaveMutation.mutate();
                }
              }}
              disabled={leaveMutation.isPending}
              style={{
                background: "none",
                border: "none",
                color: SAGE,
                fontSize: 13,
                fontFamily: SPACE_GROTESK,
                padding: 0,
                cursor: leaveMutation.isPending ? "default" : "pointer",
                textDecoration: "underline",
                textDecorationColor: "rgba(143,175,150,0.35)",
                textUnderlineOffset: 4,
              }}
            >
              {leaveMutation.isPending ? "Leaving…" : "Change parish →"}
            </button>
            {prefs?.canManage && (
              <Link href="/parish/admin">
                <span
                  style={{
                    color: "#A8C5A0",
                    fontSize: 13,
                    fontFamily: SPACE_GROTESK,
                    cursor: "pointer",
                    textDecoration: "underline",
                    textDecorationColor: "rgba(168,197,160,0.35)",
                    textUnderlineOffset: 4,
                  }}
                >
                  Admin & metrics →
                </span>
              </Link>
            )}
          </div>
        </div>

        {/* Office reminders */}
        <SectionLabel>Office reminders</SectionLabel>
        <p
          style={{
            color: SAGE,
            fontFamily: GEORGIA,
            fontStyle: "italic",
            fontSize: 13,
            margin: "0 0 12px",
            lineHeight: 1.5,
          }}
        >
          Pick the prayer Phoebe will nudge you toward each morning and evening — or none, if you'd rather not be pinged.
        </p>

        <RadioBlock
          title="In the morning"
          options={MORNING_OPTIONS}
          value={prefs?.morning ?? "none"}
          onChange={(v) => saveMutation.mutate({ morning: v })}
          disabled={prefsQuery.isLoading}
        />
        <RadioBlock
          title="In the evening"
          options={EVENING_OPTIONS}
          value={prefs?.evening ?? "none"}
          onChange={(v) => saveMutation.mutate({ evening: v })}
          disabled={prefsQuery.isLoading}
        />

        {/* Account */}
        <SectionLabel>Account</SectionLabel>
        <button
          type="button"
          onClick={() => logout()}
          style={{
            width: "100%",
            background: "transparent",
            border: `1px solid ${BORDER}`,
            color: WARM_TEXT,
            fontFamily: SPACE_GROTESK,
            fontSize: 14,
            padding: "12px 16px",
            borderRadius: 12,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          Sign out
        </button>

        <p style={{ color: FAINT_GREEN, fontSize: 11, textAlign: "center", marginTop: 32 }}>
          Phoebe Parish · {user.email}
        </p>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: SPACE_GROTESK,
        fontSize: 11,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: FAINT_GREEN,
        margin: "0 0 8px",
      }}
    >
      {children}
    </p>
  );
}

function RadioBlock({
  title,
  options,
  value,
  onChange,
  disabled,
}: {
  title: string;
  options: Array<{ value: OfficePref; label: string; sub: string }>;
  value: OfficePref;
  onChange: (v: OfficePref) => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        background: "#0F2818",
        border: `1px solid ${BORDER}`,
        borderRadius: 16,
        padding: "8px 0",
        marginBottom: 12,
      }}
    >
      <p
        style={{
          fontFamily: SPACE_GROTESK,
          fontSize: 12,
          fontWeight: 600,
          color: SAGE,
          padding: "8px 16px 0",
          margin: 0,
        }}
      >
        {title}
      </p>
      {options.map((opt, i) => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => !disabled && onChange(opt.value)}
            disabled={disabled}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              borderTop: i === 0 ? "none" : `1px solid ${BORDER}`,
              padding: "12px 16px",
              cursor: disabled ? "default" : "pointer",
              textAlign: "left",
              color: WARM_TEXT,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: `2px solid ${isSelected ? "#A8C5A0" : "rgba(143,175,150,0.4)"}`,
                background: isSelected ? "#A8C5A0" : "transparent",
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: SPACE_GROTESK, fontSize: 14, color: WARM_TEXT, margin: 0 }}>
                {opt.label}
              </p>
              {opt.sub && (
                <p style={{ color: SAGE, fontSize: 12, margin: "2px 0 0" }}>{opt.sub}</p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
