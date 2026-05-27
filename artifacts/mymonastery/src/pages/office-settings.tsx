/**
 * Office Settings — focused page for office-only prefs.
 *
 * Reached from the "Settings" pill on the Daily Offices chooser at
 * /bcp/daily-office. Surfaces just the office-relevant controls so a
 * user customizing their office doesn't have to scroll the full
 * /settings page looking for the right card:
 *
 *   • Daily reminders — morning + evening office reminder push
 *     (none / full office / short devotion + time picker). Server-
 *     backed via PUT /api/me/office-prefs.
 *   • Confession of Sin — opt-out toggle for the penitential opening
 *     of Morning / Evening Prayer (same office-prefs endpoint).
 *   • Closing pills (CAC / FDD / NCMP) and the optional Gratitude
 *     slide — local-only prefs from lib/officePrefs.ts.
 *
 * Mirrors the same form controls that live in /settings —
 * intentionally duplicated rather than refactored out because
 * /settings is heavily touched by the i18n parallel work and a shared
 * component would have to thread through both pages at once. The
 * shared bits (the server office-prefs endpoint, the localStorage
 * helpers in lib/officePrefs.ts) ARE shared; this file just hosts the
 * focused UI.
 */

import { useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import {
  useOfficePrefs,
  setReflectionSource,
  setIncludeGratitudeSlide,
  type ReflectionSource,
} from "@/lib/officePrefs";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT_GREEN = "rgba(143,175,150,0.55)";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

type OfficePref = "none" | "office" | "devotion";
type OfficePrefs = {
  morning: OfficePref;
  evening: OfficePref;
  morningTime: string | null;
  eveningTime: string | null;
  showConfession?: boolean;
};

// ── shared chrome ───────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3 mt-7">
      <h2
        className="text-lg font-semibold"
        style={{ color: WARM, fontFamily: SPACE_GROTESK }}
      >
        {label}
      </h2>
      <div className="flex-1 h-px" style={{ background: "rgba(200, 212, 192, 0.15)" }} />
    </div>
  );
}

function Blurb({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[13px] mb-3"
      style={{
        color: "rgba(143,175,150,0.8)",
        fontFamily: "Georgia, serif",
        fontStyle: "italic",
      }}
    >
      {children}
    </p>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl px-5 py-4 mb-3"
      style={{
        background: "rgba(46,107,64,0.10)",
        border: "1px solid rgba(46,107,64,0.18)",
      }}
    >
      {children}
    </div>
  );
}

function ReminderTimeRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-2.5"
      style={{ borderTop: "1px solid rgba(200,212,192,0.12)" }}
    >
      <p
        className="text-[14px]"
        style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}
      >
        {label}
      </p>
      <input
        type="time"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (/^\d{2}:\d{2}$/.test(v)) onChange(v);
        }}
        className="text-[14px] rounded-md px-2 py-1"
        style={{
          background: "rgba(15,40,24,0.6)",
          border: "1px solid rgba(46,107,64,0.4)",
          color: WARM,
          fontFamily: SPACE_GROTESK,
        }}
      />
    </div>
  );
}

// ── Radio row + toggle row helpers ──────────────────────────────────

function RadioRow({
  label,
  sub,
  selected,
  onSelect,
  first,
}: {
  label: string;
  sub?: string;
  selected: boolean;
  onSelect: () => void;
  first: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-3 py-2.5 text-left"
      style={{
        borderTop: first ? "none" : "1px solid rgba(200,212,192,0.12)",
        background: "transparent",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          border: `2px solid ${selected ? "#A8C5A0" : "rgba(143,175,150,0.4)"}`,
          background: selected ? "#A8C5A0" : "transparent",
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="text-[14px]" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>
          {label}
        </p>
        {sub && (
          <p className="text-[12px]" style={{ color: SAGE, margin: "2px 0 0" }}>
            {sub}
          </p>
        )}
      </div>
    </button>
  );
}

function ToggleRow({
  label,
  subOn,
  subOff,
  value,
  onChange,
  first,
}: {
  label: string;
  subOn: string;
  subOff: string;
  value: boolean;
  onChange: (next: boolean) => void;
  first?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="w-full flex items-center gap-3 py-2.5 text-left"
      style={{
        borderTop: first ? "none" : "1px solid rgba(200,212,192,0.12)",
        background: "transparent",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          border: `2px solid ${value ? "#A8C5A0" : "rgba(143,175,150,0.4)"}`,
          background: value ? "#A8C5A0" : "transparent",
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="text-[14px]" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>
          {label}
        </p>
        <p className="text-[12px]" style={{ color: SAGE, margin: "2px 0 0" }}>
          {value ? subOn : subOff}
        </p>
      </div>
    </button>
  );
}

// ── Page ────────────────────────────────────────────────────────────

export default function OfficeSettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery<OfficePrefs>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs") as Promise<OfficePrefs>,
  });
  const save = useMutation({
    mutationFn: (patch: Partial<OfficePrefs>) =>
      apiRequest("PUT", "/api/me/office-prefs", patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/me/office-prefs"] }),
  });

  const morning = data?.morning ?? "none";
  const evening = data?.evening ?? "none";
  const morningTime = data?.morningTime ?? "07:00";
  const eveningTime = data?.eveningTime ?? "18:00";

  // Read the local-only office prefs (CAC / FDD / NCMP closing pills,
  // Gratitude slide). useOfficePrefs subscribes to the custom event
  // bus in lib/officePrefs.ts so the setters below trigger a refresh
  // without a remount.
  const local = useOfficePrefs();

  // Local copies so the toggle UI flips immediately while the bool
  // settles into localStorage. (The setters fire a custom event,
  // useOfficePrefs picks it up, but immediate optimistic state is
  // smoother than waiting one render cycle.)
  const [reflection, setReflection] = useState<ReflectionSource>(local.reflectionSource);
  const [gratitudeOn, setGratitudeOn] = useState(local.includeGratitudeSlide);

  const morningOptions: Array<{ value: OfficePref; label: string; sub: string }> = [
    { value: "none", label: t("settings.no_reminder", { defaultValue: "No reminder" }), sub: "" },
    { value: "office", label: t("offices.morning_prayer", { defaultValue: "Morning Prayer" }), sub: t("settings.full_daily_office", { defaultValue: "Full Daily Office" }) },
    { value: "devotion", label: t("offices.morning_devotion", { defaultValue: "Morning Devotion" }), sub: t("settings.short_bcp_form", { defaultValue: "Short BCP form" }) },
  ];
  const eveningOptions: Array<{ value: OfficePref; label: string; sub: string }> = [
    { value: "none", label: t("settings.no_reminder", { defaultValue: "No reminder" }), sub: "" },
    { value: "office", label: t("offices.evening_prayer", { defaultValue: "Evening Prayer" }), sub: t("settings.full_daily_office", { defaultValue: "Full Daily Office" }) },
    { value: "devotion", label: t("offices.early_evening_devotion", { defaultValue: "Early Evening Devotion" }), sub: t("settings.short_bcp_form", { defaultValue: "Short BCP form" }) },
  ];

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24 px-4 sm:px-0">
        <Link
          href="/bcp/daily-office"
          className="text-sm mb-3 inline-block"
          style={{ color: SAGE }}
        >
          ← Daily Offices
        </Link>
        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: WARM, fontFamily: SPACE_GROTESK }}
        >
          Customize your office ⚙️
        </h1>
        <p className="text-sm mb-2" style={{ color: SAGE }}>
          Daily reminders, the penitential opening, and the closing pills.
        </p>

        <SectionHeader label="Daily reminders" />
        <Blurb>
          Pick the office Phoebe will nudge you toward each morning and evening — or none, if you'd rather not be pinged.
        </Blurb>
        <Card>
          <p
            className="text-[12px] font-semibold mb-2"
            style={{ color: SAGE, fontFamily: SPACE_GROTESK }}
          >
            In the morning
          </p>
          {morningOptions.map((opt, i) => (
            <RadioRow
              key={opt.value}
              label={opt.label}
              sub={opt.sub}
              selected={morning === opt.value}
              onSelect={() => save.mutate({ morning: opt.value })}
              first={i === 0}
            />
          ))}
          {morning !== "none" && (
            <ReminderTimeRow
              label="Reminder time"
              value={morningTime}
              onChange={(time) => save.mutate({ morningTime: time })}
            />
          )}
        </Card>
        <Card>
          <p
            className="text-[12px] font-semibold mb-2"
            style={{ color: SAGE, fontFamily: SPACE_GROTESK }}
          >
            In the evening
          </p>
          {eveningOptions.map((opt, i) => (
            <RadioRow
              key={opt.value}
              label={opt.label}
              sub={opt.sub}
              selected={evening === opt.value}
              onSelect={() => save.mutate({ evening: opt.value })}
              first={i === 0}
            />
          ))}
          {evening !== "none" && (
            <ReminderTimeRow
              label="Reminder time"
              value={eveningTime}
              onChange={(time) => save.mutate({ eveningTime: time })}
            />
          )}
        </Card>

        <SectionHeader label="Confession of Sin" />
        <Blurb>
          Morning and Evening Prayer open with the BCP Confession of Sin and Absolution by default. Turn this off to begin straight at the Opening Sentence instead.
        </Blurb>
        <Card>
          <ToggleRow
            label="Include Confession of Sin"
            subOn="Shown before the Opening Sentence."
            subOff="The office begins with the Opening Sentence."
            value={!!data?.showConfession}
            onChange={(next) => save.mutate({ showConfession: next })}
            first
          />
        </Card>

        <SectionHeader label="After the office" />
        <Blurb>
          One daily reflection pill appears on the closing slide and as a card on the home screen. Pick the source you'd like to read each day — or turn the pill off.
        </Blurb>
        <Card>
          {([
            { value: "cac" as const,  label: "Center for Action and Contemplation", sub: "Today's CAC daily reflection." },
            { value: "fdd" as const,  label: "Forward Day by Day", sub: "Today's Forward Movement meditation." },
            { value: "ssje" as const, label: "SSJE Reflections", sub: "Today's “Brother, Give Us a Word.”" },
            { value: "none" as const, label: "None", sub: "No reflection pill or card." },
          ]).map((opt, i) => (
            <RadioRow
              key={opt.value}
              label={opt.label}
              sub={opt.sub}
              selected={reflection === opt.value}
              onSelect={() => { setReflection(opt.value); setReflectionSource(opt.value); }}
              first={i === 0}
            />
          ))}
        </Card>

        <SectionHeader label="In the office" />
        <Blurb>
          Optional reflective slides spliced into Morning and Evening Prayer.
        </Blurb>
        <Card>
          <ToggleRow
            label="Personal thanksgiving slide"
            subOn="A short gratitude prompt slides in before the closing."
            subOff="The office runs straight to the closing."
            value={gratitudeOn}
            onChange={(next) => {
              setGratitudeOn(next);
              setIncludeGratitudeSlide(next);
            }}
            first
          />
        </Card>

        <p
          className="text-[11px] mt-6 text-center"
          style={{ color: FAINT_GREEN, fontFamily: SPACE_GROTESK }}
        >
          Looking for the full Settings page? <Link href="/settings" style={{ color: SAGE, textDecoration: "underline" }}>Open Settings →</Link>
        </p>
      </div>
    </Layout>
  );
}
