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
import { Eye, EyeOff } from "lucide-react";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import {
  useOfficePrefs,
  useEffectiveReflectionSource,
  setReflectionSource,
  setIncludeGratitudeSlide,
} from "@/lib/officePrefs";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FAINT_GREEN = "rgba(143,175,150,0.55)";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

type OfficePref = "none" | "office" | "devotion";
// Default prayer "depth" — picks which surface the home-screen office
// card's "Begin prayer" CTA jumps to in a single tap. The picker
// below writes the column via the same /me/office-prefs endpoint;
// the home card reads user.defaultPrayerLevel from /auth/me. Default
// is "devotion" (the gentlest entry point) when the user hasn't
// chosen one.
type DefaultPrayerLevel = "ask" | "devotion" | "office" | "intercessions";
type OfficePrefs = {
  morning: OfficePref;
  evening: OfficePref;
  morningTime: string | null;
  eveningTime: string | null;
  showConfession?: boolean;
  defaultPrayerLevel?: DefaultPrayerLevel;
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

function SubHeader({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[10px] uppercase tracking-[0.16em] font-semibold mt-4 mb-2"
      style={{ color: "rgba(143,175,150,0.5)", fontFamily: SPACE_GROTESK }}
    >
      {children}
    </p>
  );
}

// Reminder time picker, styled as a standalone row to sit beneath the
// reminder radios in the same list. The dashed border sets it apart as a
// dependent detail rather than another pick-one option.
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
      className="flex items-center justify-between gap-3 rounded-xl px-3 py-3"
      style={{
        background: "rgba(46,107,64,0.06)",
        border: "1px dashed rgba(46,107,64,0.28)",
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span style={{ fontSize: 20 }}>⏰</span>
        <p
          className="text-[15px] font-semibold"
          style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}
        >
          {label}
        </p>
      </div>
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

// Pick-one row in the customize-home aesthetic: a standalone rounded-xl
// card with a radio dot, emoji, and label/sub. Selected rows read like a
// "visible" module on customize-home (fuller background, full opacity);
// unselected ones recede like a "hidden" module.
function RadioRow({
  label,
  sub,
  emoji,
  selected,
  onSelect,
}: {
  label: string;
  sub?: string;
  emoji: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left select-none"
      style={{
        background: selected ? "rgba(46,107,64,0.10)" : "rgba(46,107,64,0.04)",
        border: "1px solid rgba(46,107,64,0.22)",
        opacity: selected ? 1 : 0.6,
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
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>
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

// Boolean show/hide toggle styled like customize-home's draggable rows:
// rounded-xl card with emoji + label/sub on the left and Eye/EyeOff on
// the right. Tapping the row OR the eye flips the value — matching the
// affordance from customize-home where the eye is the visible control
// but the whole row is also clickable.
function EyeToggleRow({
  label,
  subOn,
  subOff,
  emoji,
  value,
  onChange,
  showLabel,
  hideLabel,
}: {
  label: string;
  subOn: string;
  subOff: string;
  emoji: string;
  value: boolean;
  onChange: (next: boolean) => void;
  showLabel: string;
  hideLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left select-none"
      style={{
        background: value ? "rgba(46,107,64,0.10)" : "rgba(46,107,64,0.04)",
        border: "1px solid rgba(46,107,64,0.22)",
        opacity: value ? 1 : 0.6,
        cursor: "pointer",
      }}
    >
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>
          {label}
        </p>
        <p className="text-[12px]" style={{ color: SAGE, margin: "2px 0 0" }}>
          {value ? subOn : subOff}
        </p>
      </div>
      <span
        aria-label={value ? hideLabel : showLabel}
        className="transition-opacity"
        style={{ color: value ? "#A8C5A0" : "rgba(143,175,150,0.6)", lineHeight: 0, padding: 4, flexShrink: 0 }}
      >
        {value ? <Eye size={18} /> : <EyeOff size={18} />}
      </span>
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
  const defaultPrayerLevel: DefaultPrayerLevel = data?.defaultPrayerLevel ?? "ask";

  const defaultLevelOptions: Array<{ value: DefaultPrayerLevel; label: string; emoji: string; sub: string }> = [
    { value: "ask", label: "Ask me each time", emoji: "🧭", sub: "Show the options screen, with whatever you prayed last on top." },
    { value: "devotion", label: "Daily Devotion", emoji: "🌱", sub: "The short BCP form (~5 min). The gentlest entry point." },
    { value: "office", label: "Full Daily Office", emoji: "📖", sub: "Morning or Evening Prayer (~15-20 min). The fuller liturgy." },
    { value: "intercessions", label: "Community Intercessions", emoji: "🙏🏽", sub: "The slideshow of prayer requests your community is holding." },
  ];

  // Read the local-only office prefs (CAC / FDD / NCMP closing pills,
  // Gratitude slide). useOfficePrefs subscribes to the custom event
  // bus in lib/officePrefs.ts so the setters below trigger a refresh
  // without a remount.
  const local = useOfficePrefs();
  // Effective source (explicit pick → visible home card → FDD) drives
  // the radio so it matches the pill the user actually gets, even when
  // they haven't made an explicit pick yet. The hook re-derives on
  // OFFICE_PREFS_EVENT (which setReflectionSource fires synchronously),
  // so tapping a row updates the selection immediately — no optimistic
  // copy needed.
  const effectiveSource = useEffectiveReflectionSource();

  // Local copy so the gratitude toggle flips immediately while the bool
  // settles into localStorage. (The setter fires a custom event,
  // useOfficePrefs picks it up, but immediate optimistic state is
  // smoother than waiting one render cycle.)
  const [gratitudeOn, setGratitudeOn] = useState(local.includeGratitudeSlide);

  const morningOptions: Array<{ value: OfficePref; label: string; emoji: string; sub: string }> = [
    { value: "none", label: t("settings.no_reminder", { defaultValue: "No reminder" }), emoji: "🔕", sub: "" },
    { value: "office", label: t("offices.morning_prayer", { defaultValue: "Morning Prayer" }), emoji: "📖", sub: t("settings.full_daily_office", { defaultValue: "Full Daily Office" }) },
    { value: "devotion", label: t("offices.morning_devotion", { defaultValue: "Morning Devotion" }), emoji: "🌱", sub: t("settings.short_bcp_form", { defaultValue: "Short BCP form" }) },
  ];
  const eveningOptions: Array<{ value: OfficePref; label: string; emoji: string; sub: string }> = [
    { value: "none", label: t("settings.no_reminder", { defaultValue: "No reminder" }), emoji: "🔕", sub: "" },
    { value: "office", label: t("offices.evening_prayer", { defaultValue: "Evening Prayer" }), emoji: "📖", sub: t("settings.full_daily_office", { defaultValue: "Full Daily Office" }) },
    { value: "devotion", label: t("offices.early_evening_devotion", { defaultValue: "Early Evening Devotion" }), emoji: "🌙", sub: t("settings.short_bcp_form", { defaultValue: "Short BCP form" }) },
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
          Default prayer, daily reminders, the penitential opening, and the closing pills.
        </p>

        <SectionHeader label="Default prayer" />
        <Blurb>
          When you tap "Begin prayer" on the home screen, this is what opens. Leave it on "Ask me each time" for the options screen, or pick a depth to jump straight in. You can still reach anything else from /offices anytime.
        </Blurb>
        <div className="flex flex-col gap-2">
          {defaultLevelOptions.map((opt) => (
            <RadioRow
              key={opt.value}
              label={opt.label}
              sub={opt.sub}
              emoji={opt.emoji}
              selected={defaultPrayerLevel === opt.value}
              onSelect={() => save.mutate({ defaultPrayerLevel: opt.value })}
            />
          ))}
        </div>

        <SectionHeader label="Daily reminders" />
        <Blurb>
          Pick the office Phoebe will nudge you toward each morning and evening — or none, if you'd rather not be pinged.
        </Blurb>
        <SubHeader>In the morning</SubHeader>
        <div className="flex flex-col gap-2">
          {morningOptions.map((opt) => (
            <RadioRow
              key={opt.value}
              label={opt.label}
              sub={opt.sub}
              emoji={opt.emoji}
              selected={morning === opt.value}
              onSelect={() => save.mutate({ morning: opt.value })}
            />
          ))}
          {morning !== "none" && (
            <ReminderTimeRow
              label="Reminder time"
              value={morningTime}
              onChange={(time) => save.mutate({ morningTime: time })}
            />
          )}
        </div>
        <SubHeader>In the evening</SubHeader>
        <div className="flex flex-col gap-2">
          {eveningOptions.map((opt) => (
            <RadioRow
              key={opt.value}
              label={opt.label}
              sub={opt.sub}
              emoji={opt.emoji}
              selected={evening === opt.value}
              onSelect={() => save.mutate({ evening: opt.value })}
            />
          ))}
          {evening !== "none" && (
            <ReminderTimeRow
              label="Reminder time"
              value={eveningTime}
              onChange={(time) => save.mutate({ eveningTime: time })}
            />
          )}
        </div>

        <SectionHeader label="Confession of Sin" />
        <Blurb>
          Morning and Evening Prayer open with the BCP Confession of Sin and Absolution by default. Turn this off to begin straight at the Opening Sentence instead.
        </Blurb>
        <EyeToggleRow
          label="Include Confession of Sin"
          subOn="Shown before the Opening Sentence."
          subOff="The office begins with the Opening Sentence."
          emoji="🤲"
          value={!!data?.showConfession}
          onChange={(next) => save.mutate({ showConfession: next })}
          showLabel={t("customize_home.show", { defaultValue: "Show" })}
          hideLabel={t("customize_home.hide", { defaultValue: "Hide" })}
        />

        <SectionHeader label="After the office" />
        <Blurb>
          One daily reflection pill appears on the closing slide and as a card on the home screen. Pick the source you'd like to read each day — or turn the pill off.
        </Blurb>
        <div className="flex flex-col gap-2">
          {([
            { value: "cac" as const,  label: "Center for Action and Contemplation", emoji: "🌅", sub: "Today's CAC daily reflection." },
            { value: "fdd" as const,  label: "Forward Day by Day", emoji: "📖", sub: "Today's Forward Movement meditation." },
            { value: "ssje" as const, label: "SSJE Reflections", emoji: "✍🏽", sub: "Today's “Brother, Give Us a Word.”" },
            { value: "none" as const, label: "None", emoji: "🚫", sub: "No reflection pill or card." },
          ]).map((opt) => (
            <RadioRow
              key={opt.value}
              label={opt.label}
              sub={opt.sub}
              emoji={opt.emoji}
              selected={effectiveSource === opt.value}
              onSelect={() => setReflectionSource(opt.value)}
            />
          ))}
        </div>

        <SectionHeader label="In the office" />
        <Blurb>
          Optional reflective slides spliced into Morning and Evening Prayer.
        </Blurb>
        <EyeToggleRow
          label="Personal thanksgiving slide"
          subOn="A short gratitude prompt slides in before the closing."
          subOff="The office runs straight to the closing."
          emoji="🌾"
          value={gratitudeOn}
          onChange={(next) => {
            setGratitudeOn(next);
            setIncludeGratitudeSlide(next);
          }}
          showLabel={t("customize_home.show", { defaultValue: "Show" })}
          hideLabel={t("customize_home.hide", { defaultValue: "Hide" })}
        />

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
