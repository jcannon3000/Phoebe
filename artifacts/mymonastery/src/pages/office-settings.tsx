/**
 * Customize your Daily Office — a Hallow-style questionnaire.
 *
 * Reached from the "Customize" pill on /bcp/daily-office and the
 * "Your office" row in Daily Practice. Replaces the old scrollable
 * settings form with a full-screen, one-question-per-screen wizard:
 * progress dots up top, a single question with big tappable cards in
 * the middle, Back / Next at the bottom. Single-choice questions auto-
 * advance after a beat (the Hallow feel); the reminder questions (which
 * reveal a time picker) and the informational slides use Next.
 *
 * Every answer saves the moment it's picked — server-backed prefs via
 * PUT /api/me/office-prefs, local prefs via lib/officePrefs.ts — so
 * closing mid-wizard never loses progress, and re-opening lands on the
 * first question with the current answers pre-selected.
 *
 * Questions:
 *   1. Default prayer    → /me/office-prefs defaultPrayerLevel
 *   2. Morning reminder  → morning + morningTime
 *   3. Evening reminder  → evening + eveningTime
 *   4. Confession of Sin → showConfession
 *   5. Meditation timer  → local defaultContemplationMinutes (off / set)
 *   6. Ways to pray      → informational (read / listen / watch)
 *   7. After the office  → local reflectionSource
 *   8. Gratitude pause   → local includeGratitudeSlide
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, ChevronLeft, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  useOfficePrefs,
  getSideLevel,
  setSideLevel,
  getSideEntry,
  setSideEntry,
  getSideReflectionExplicit,
  setSideReflection,
  getSideConfession,
  setSideConfession,
  getSideGratitude,
  setSideGratitude,
  getSideMinutes,
  setSideMinutes,
  type ReflectionSource,
  type DefaultOfficeEntry,
  type OfficeSide,
} from "@/lib/officePrefs";

const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const ACCENT = "#A8C5A0";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

type OfficePref = "none" | "office" | "devotion";
type DefaultPrayerLevel = "ask" | "devotion" | "office" | "intercessions" | "reflect-sit";
type OfficePrefs = {
  morning: OfficePref;
  evening: OfficePref;
  morningTime: string | null;
  eveningTime: string | null;
  showConfession?: boolean;
  defaultPrayerLevel?: DefaultPrayerLevel;
};

// ── Reusable bits ───────────────────────────────────────────────────

function OptionCard({
  emoji,
  label,
  sub,
  selected,
  onSelect,
}: {
  emoji?: string;
  label: string;
  sub?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-3 rounded-2xl px-4 py-4 text-left transition-all active:scale-[0.99]"
      style={{
        background: selected ? "rgba(46,107,64,0.22)" : "rgba(46,107,64,0.08)",
        border: `1.5px solid ${selected ? ACCENT : "rgba(46,107,64,0.25)"}`,
        cursor: "pointer",
      }}
    >
      {emoji && <span style={{ fontSize: 24, lineHeight: 1 }}>{emoji}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-[16px] font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>
          {label}
        </p>
        {sub && (
          <p className="text-[13px]" style={{ color: SAGE, margin: "2px 0 0", lineHeight: 1.35 }}>
            {sub}
          </p>
        )}
      </div>
      <span
        className="flex items-center justify-center shrink-0"
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: `2px solid ${selected ? ACCENT : "rgba(143,175,150,0.4)"}`,
          background: selected ? ACCENT : "transparent",
        }}
      >
        {selected && <Check size={13} color={BG} strokeWidth={3} />}
      </span>
    </button>
  );
}

function SlideShell({
  eyebrow,
  headline,
  sub,
  children,
}: {
  eyebrow?: string;
  headline: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      {eyebrow && (
        <p
          className="text-[11px] uppercase tracking-[0.18em] mb-3"
          style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}
        >
          {eyebrow}
        </p>
      )}
      <h2
        className="text-[25px] md:text-[29px] font-bold leading-tight mb-2"
        style={{ color: WARM, fontFamily: SPACE_GROTESK, letterSpacing: "-0.01em" }}
      >
        {headline}
      </h2>
      {sub && <p className="text-[15px] mb-6" style={{ color: SAGE, lineHeight: 1.5 }}>{sub}</p>}
      {!sub && <div className="mb-6" />}
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function ReminderTimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5 mt-1"
      style={{ background: "rgba(46,107,64,0.06)", border: "1px dashed rgba(46,107,64,0.3)" }}
    >
      <div className="flex items-center gap-3">
        <span style={{ fontSize: 22 }}>⏰</span>
        <p className="text-[15px] font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>
          {t("office_settings.reminder_time")}
        </p>
      </div>
      <input
        type="time"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (/^\d{2}:\d{2}$/.test(v)) onChange(v);
        }}
        className="text-[15px] rounded-lg px-2.5 py-1.5"
        style={{ background: "rgba(9,26,16, 0.770)", border: "1px solid rgba(46,107,64,0.45)", color: WARM, fontFamily: SPACE_GROTESK }}
      />
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────

export default function OfficeSettingsPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data } = useQuery<OfficePrefs>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs") as Promise<OfficePrefs>,
  });
  const save = useMutation({
    mutationFn: (patch: Partial<OfficePrefs>) => apiRequest("PUT", "/api/me/office-prefs", patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/me/office-prefs"] }),
  });

  // Optimistic mirror of the server prefs so a tapped card shows
  // selected instantly (the card highlights before the slide animates
  // away), without waiting on the PUT → invalidate → refetch round-trip.
  const [opt, setOpt] = useState<Partial<OfficePrefs>>({});
  const eff: OfficePrefs = { morning: "none", evening: "none", morningTime: null, eveningTime: null, ...(data ?? {}), ...opt };
  const saveServer = (patch: Partial<OfficePrefs>) => {
    setOpt((o) => ({ ...o, ...patch }));
    save.mutate(patch);
  };

  // Local-only prefs (per device). Optimistic copies flip the card
  // immediately; the setters persist + broadcast the change.
  const local = useOfficePrefs();

  // Which side this wizard configures — Daily Practice opens it with
  // ?side=morning | ?side=evening (the split Morning / Evening flows).
  const side: OfficeSide = (() => {
    try { return new URLSearchParams(window.location.search).get("side") === "evening" ? "evening" : "morning"; }
    catch { return "morning"; }
  })();
  const sideLabel = side === "evening" ? t("office_settings.side_evening") : t("office_settings.side_morning");

  const morning = eff.morning ?? "none";
  const evening = eff.evening ?? "none";
  const morningTime = eff.morningTime ?? "07:00";
  const eveningTime = eff.eveningTime ?? "18:00";
  const defaultPrayerLevel: DefaultPrayerLevel = eff.defaultPrayerLevel ?? "devotion";

  // Per-side selections. Each falls back to the shared global when this
  // side has no override. Read the getters directly — useOfficePrefs
  // re-renders the page on every pref event, so taps reflect immediately.
  const sideLevel: DefaultPrayerLevel = (getSideLevel(side) ?? defaultPrayerLevel) as DefaultPrayerLevel;
  const sideEntry: DefaultOfficeEntry = getSideEntry(side);
  const sideReflection: ReflectionSource = getSideReflectionExplicit(side) ?? local.reflectionSource;
  // Now-per-side too: confession (Office only), the gratitude pause, and the
  // silence default — each falls back to the shared global when this side is
  // unset.
  const sideConfession: boolean = getSideConfession(side) ?? !!eff.showConfession;
  const sideGratitude: boolean = getSideGratitude(side);
  const sideMinutes: number = getSideMinutes(side);

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  // Confession belongs to the full Office only — show it for this side
  // only when this side's depth is the Office (skip it for Devotion).
  const includeConfession = sideLevel === "office";
  // Side-scoped: 9 base slides minus the OTHER side's reminder, minus the
  // Confession step when this side isn't the Office.
  const TOTAL = includeConfession ? 8 : 7;

  const goNext = () => { setDir(1); setStep((s) => Math.min(s + 1, TOTAL - 1)); };
  const goBack = () => { setDir(-1); setStep((s) => Math.max(s - 1, 0)); };
  // Return to wherever the wizard was opened from: the practice page sends
  // ?from=practice, so finishing a per-side build lands back on /daily-practice;
  // the office list's "Customize" pill sends nothing, so it returns to the
  // office list as before.
  const close = () => {
    let from = "";
    try { from = new URLSearchParams(window.location.search).get("from") ?? ""; } catch { /* ignore */ }
    setLocation(from === "practice" ? "/daily-practice" : "/bcp/daily-office");
  };
  // Single-choice questions auto-advance after a short beat so the
  // selection is visible before the slide slides away.
  const autoAdvance = () => window.setTimeout(goNext, 320);

  // ── Slides (index aligns with the dots) ──────────────────────────
  const slides: Array<() => React.ReactNode> = [
    // 0 — Intro
    () => (
      <div className="flex flex-col items-center text-center px-2">
        <div style={{ fontSize: 56, lineHeight: 1 }}>{side === "evening" ? "🌙" : "🌅"}</div>
        <h2 className="text-[27px] md:text-[31px] font-bold leading-tight mt-5 mb-2" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
          {side === "evening" ? t("office_settings.intro_headline_evening") : t("office_settings.intro_headline_morning")}
        </h2>
        <p className="text-[15px]" style={{ color: SAGE, lineHeight: 1.5, maxWidth: 360 }}>
          {side === "evening" ? t("office_settings.intro_body_evening") : t("office_settings.intro_body_morning")}
        </p>
      </div>
    ),

    // 1 — Depth (per side)
    () => (
      <SlideShell
        eyebrow={side === "evening" ? t("office_settings.depth_eyebrow_evening") : t("office_settings.depth_eyebrow_morning")}
        headline={side === "evening" ? t("office_settings.depth_headline_evening") : t("office_settings.depth_headline_morning")}
        sub={t("office_settings.depth_sub")}
      >
        {(getSideLevel(side) === "fdd" || getSideLevel(side) === "psalms") && (
          <p className="text-[13px] mb-3 px-1" style={{ color: "#C8A86A", lineHeight: 1.5 }}>
            {t("office_settings.depth_replace_note", { defaultValue: `This side is set to ${getSideLevel(side) === "fdd" ? "Forward Day by Day" : "Praying the Psalms"} in your Rule of Life. Choosing below will replace it.` })}
          </p>
        )}
        {([
          { value: "ask" as const, emoji: "🤔", label: t("office_settings.depth_ask_label"), sub: t("office_settings.depth_ask_sub") },
          { value: "devotion" as const, emoji: "🌱", label: t("office_settings.depth_devotion_label"), sub: t("office_settings.depth_devotion_sub") },
          { value: "office" as const, emoji: "📖", label: t("office_settings.depth_office_label"), sub: side === "evening" ? t("office_settings.depth_office_sub_evening") : t("office_settings.depth_office_sub_morning") },
          { value: "intercessions" as const, emoji: "🙏🏽", label: t("office_settings.depth_intercessions_label"), sub: t("office_settings.depth_intercessions_sub") },
          { value: "reflect-sit" as const, emoji: "🕯️", label: t("office_settings.depth_reflect_sit_label"), sub: t("office_settings.depth_reflect_sit_sub") },
        ]).map((o) => (
          <OptionCard
            key={o.value}
            emoji={o.emoji}
            label={o.label}
            sub={o.sub}
            selected={sideLevel === o.value}
            onSelect={() => { setSideLevel(side, o.value); autoAdvance(); }}
          />
        ))}
      </SlideShell>
    ),

    // 2 — Morning reminder. On/off only — the notification opens whatever
    // the user set as their default in Step 1 (see begin-prayer.tsx), so we
    // don't make them pick an office here. ("office" is just the stored
    // "on" sentinel; the specific value no longer drives the reminder.)
    () => (
      <SlideShell
        eyebrow={t("office_settings.morning_reminder_eyebrow")}
        headline={t("office_settings.morning_reminder_headline")}
        sub={t("office_settings.morning_reminder_sub")}
      >
        <OptionCard
          emoji="🔕"
          label={t("office_settings.reminder_off_label")}
          selected={morning === "none"}
          onSelect={() => saveServer({ morning: "none" })}
        />
        <OptionCard
          emoji="🔔"
          label={t("office_settings.morning_reminder_on_label")}
          sub={t("office_settings.reminder_on_sub")}
          selected={morning !== "none"}
          onSelect={() => saveServer({ morning: "office" })}
        />
        {morning !== "none" && (
          <ReminderTimeField value={morningTime} onChange={(t) => saveServer({ morningTime: t })} />
        )}
      </SlideShell>
    ),

    // 3 — Evening reminder. On/off only — same as mornings, the tap opens
    // the user's default prayer (begin-prayer routes by level + time of day).
    () => (
      <SlideShell
        eyebrow={t("office_settings.evening_reminder_eyebrow")}
        headline={t("office_settings.evening_reminder_headline")}
        sub={t("office_settings.evening_reminder_sub")}
      >
        <OptionCard
          emoji="🔕"
          label={t("office_settings.reminder_off_label")}
          selected={evening === "none"}
          onSelect={() => saveServer({ evening: "none" })}
        />
        <OptionCard
          emoji="🔔"
          label={t("office_settings.evening_reminder_on_label")}
          sub={t("office_settings.reminder_on_sub")}
          selected={evening !== "none"}
          onSelect={() => saveServer({ evening: "office" })}
        />
        {evening !== "none" && (
          <ReminderTimeField value={eveningTime} onChange={(t) => saveServer({ eveningTime: t })} />
        )}
      </SlideShell>
    ),

    // 4 — Confession of Sin
    () => (
      <SlideShell
        eyebrow={t("office_settings.confession_eyebrow")}
        headline={t("office_settings.confession_headline")}
        sub={t("office_settings.confession_sub")}
      >
        {([
          { value: true, emoji: "🤲", label: t("office_settings.confession_include_label"), sub: t("office_settings.confession_include_sub") },
          { value: false, emoji: "🌅", label: t("office_settings.confession_skip_label"), sub: t("office_settings.confession_skip_sub") },
        ]).map((o) => (
          <OptionCard
            key={String(o.value)}
            emoji={o.emoji}
            label={o.label}
            sub={o.sub}
            selected={sideConfession === o.value}
            onSelect={() => { setSideConfession(side, o.value); autoAdvance(); }}
          />
        ))}
      </SlideShell>
    ),

    // 5 — Meditation timer
    () => (
      <SlideShell
        eyebrow={t("office_settings.silence_eyebrow")}
        headline={t("office_settings.silence_headline")}
        sub={t("office_settings.silence_sub")}
      >
        {([
          { value: 0, emoji: "🔕", label: t("office_settings.silence_off_label"), sub: t("office_settings.silence_off_sub") },
          { value: 5, emoji: "🕯️", label: t("office_settings.silence_minutes", { count: 5 }), sub: "" },
          { value: 10, emoji: "🕯️", label: t("office_settings.silence_minutes", { count: 10 }), sub: "" },
          { value: 20, emoji: "🕯️", label: t("office_settings.silence_minutes", { count: 20 }), sub: "" },
        ]).map((o) => (
          <OptionCard
            key={o.value}
            emoji={o.emoji}
            label={o.label}
            sub={o.sub || undefined}
            selected={sideMinutes === o.value}
            onSelect={() => { setSideMinutes(side, o.value); autoAdvance(); }}
          />
        ))}
      </SlideShell>
    ),

    // 6 — Ways to pray (selectable default)
    () => (
      <SlideShell
        eyebrow={t("office_settings.ways_eyebrow")}
        headline={t("office_settings.ways_headline")}
        sub={t("office_settings.ways_sub")}
      >
        {([
          { value: "read" as const, emoji: "📖", label: t("office_settings.ways_read_label"), sub: t("office_settings.ways_read_sub") },
          { value: "book" as const, emoji: "📕", label: t("office_settings.ways_book_label"), sub: t("office_settings.ways_book_sub") },
          { value: "listen" as const, emoji: "🎧", label: t("office_settings.ways_listen_label"), sub: side === "evening" ? t("office_settings.ways_listen_sub_evening") : t("office_settings.ways_listen_sub_morning") },
          { value: "watch" as const, emoji: "📺", label: t("office_settings.ways_watch_label"), sub: t("office_settings.ways_watch_sub") },
        ]).filter((o) => o.value !== "watch" || side === "morning").map((o) => (
          <OptionCard
            key={o.value}
            emoji={o.emoji}
            label={o.label}
            sub={o.sub}
            selected={sideEntry === o.value}
            onSelect={() => {
              setSideEntry(side, o.value);
              autoAdvance();
            }}
          />
        ))}
      </SlideShell>
    ),

    // 7 — After the office (reflection)
    () => (
      <SlideShell
        eyebrow={t("office_settings.reflection_eyebrow")}
        headline={t("office_settings.reflection_headline")}
        sub={t("office_settings.reflection_sub")}
      >
        {([
          { value: "cac" as const, emoji: "🌅", label: t("office_settings.reflection_cac_label"), sub: t("office_settings.reflection_cac_sub") },
          { value: "fdd" as const, emoji: "📖", label: t("office_settings.reflection_fdd_label"), sub: t("office_settings.reflection_fdd_sub") },
          { value: "ssje" as const, emoji: "✍🏽", label: t("office_settings.reflection_ssje_label"), sub: t("office_settings.reflection_ssje_sub") },
          { value: "none" as const, emoji: "🚫", label: t("office_settings.reflection_none_label"), sub: t("office_settings.reflection_none_sub") },
        ]).map((o) => (
          <OptionCard
            key={o.value}
            emoji={o.emoji}
            label={o.label}
            sub={o.sub}
            selected={sideReflection === o.value}
            onSelect={() => { setSideReflection(side, o.value); autoAdvance(); }}
          />
        ))}
      </SlideShell>
    ),

    // 8 — Gratitude pause + finish
    () => (
      <SlideShell
        eyebrow={t("office_settings.gratitude_eyebrow")}
        headline={t("office_settings.gratitude_headline")}
        sub={t("office_settings.gratitude_sub")}
      >
        {([
          { value: true, emoji: "🌾", label: t("office_settings.gratitude_yes_label"), sub: t("office_settings.gratitude_yes_sub") },
          { value: false, emoji: "🍃", label: t("office_settings.gratitude_no_label"), sub: t("office_settings.gratitude_no_sub") },
        ]).map((o) => (
          <OptionCard
            key={String(o.value)}
            emoji={o.emoji}
            label={o.label}
            sub={o.sub}
            selected={sideGratitude === o.value}
            onSelect={() => { setSideGratitude(side, o.value); }}
          />
        ))}
      </SlideShell>
    ),
  ];

  // Side-scoped: show only THIS side's reminder (slide 2 = morning, 3 =
  // evening) and drop the Confession step (slide 4) unless this side's
  // depth is the Office.
  const dropReminderIdx = side === "morning" ? 3 : 2;
  const visibleSlides = slides.filter((_, i) => {
    if (i === dropReminderIdx) return false;
    if (i === 4 && !includeConfession) return false;
    return true;
  });

  const isLast = step === TOTAL - 1;

  return (
    <div className="fixed inset-0 z-30 flex flex-col" style={{ background: BG }}>
      {/* Top bar — close, progress dots, counter */}
      <div
        className="flex items-center justify-between px-4 pb-3"
        style={{ paddingTop: "max(1rem, calc(var(--safe-top) + 0.5rem))" }}
      >
        <button
          type="button"
          onClick={close}
          aria-label={t("office_settings.close")}
          className="inline-flex items-center gap-1 text-sm transition-opacity hover:opacity-80"
          style={{ color: SAGE, background: "transparent", cursor: "pointer" }}
        >
          <X size={18} /> {t("office_settings.close")}
        </button>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? 22 : 6,
                height: 6,
                borderRadius: 3,
                background: i <= step ? ACCENT : "rgba(143,175,150,0.25)",
                transition: "all 0.25s ease",
              }}
            />
          ))}
        </div>
        <span className="text-[13px] tabular-nums" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SPACE_GROTESK }}>
          {step + 1}/{TOTAL}
        </span>
      </div>

      {/* Slide */}
      <div className="flex-1 overflow-y-auto px-5">
        <div className="w-full max-w-md mx-auto min-h-full flex flex-col justify-center py-6">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              initial={{ opacity: 0, x: dir * 36 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -36 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {visibleSlides[step]()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom nav */}
      <div
        className="px-5 pt-3 flex items-center gap-3 max-w-md mx-auto w-full"
        style={{ paddingBottom: "max(1.25rem, calc(env(safe-area-inset-bottom) + 0.5rem))" }}
      >
        {step > 0 ? (
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-1 text-[15px] font-medium px-3 py-3 transition-opacity hover:opacity-80"
            style={{ color: SAGE, background: "transparent", cursor: "pointer", fontFamily: SPACE_GROTESK }}
          >
            <ChevronLeft size={18} /> {t("office_settings.back")}
          </button>
        ) : (
          <span className="flex-1" />
        )}
        <div className="flex-1" />
        {isLast ? (
          <button
            type="button"
            onClick={close}
            className="rounded-full px-7 py-3 text-[15px] font-semibold transition-opacity hover:opacity-90 active:scale-[0.98]"
            style={{ background: ACCENT, color: BG, fontFamily: SPACE_GROTESK, cursor: "pointer" }}
          >
            {t("office_settings.done")} ✓
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            className="rounded-full px-7 py-3 text-[15px] font-semibold transition-opacity hover:opacity-90 active:scale-[0.98]"
            style={{ background: "#2D5E3F", color: WARM, border: `1px solid ${ACCENT}`, fontFamily: SPACE_GROTESK, cursor: "pointer" }}
          >
            {step === 0 ? `${t("office_settings.get_started")} →` : `${t("office_settings.next")} →`}
          </button>
        )}
      </div>
    </div>
  );
}
