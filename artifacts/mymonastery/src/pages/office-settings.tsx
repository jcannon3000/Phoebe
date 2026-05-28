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
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, ChevronLeft, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  useOfficePrefs,
  setReflectionSource,
  setIncludeGratitudeSlide,
  setDefaultContemplationMinutes,
  type ReflectionSource,
} from "@/lib/officePrefs";

const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const ACCENT = "#A8C5A0";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

type OfficePref = "none" | "office" | "devotion";
type DefaultPrayerLevel = "ask" | "devotion" | "office" | "intercessions";
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

// Static (non-selectable) info card — used by the "ways to pray" slide.
function InfoCard({ emoji, label, sub }: { emoji: string; label: string; sub: string }) {
  return (
    <div
      className="w-full flex items-center gap-3 rounded-2xl px-4 py-4"
      style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.22)" }}
    >
      <span style={{ fontSize: 24, lineHeight: 1 }}>{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[16px] font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>
          {label}
        </p>
        <p className="text-[13px]" style={{ color: SAGE, margin: "2px 0 0", lineHeight: 1.35 }}>
          {sub}
        </p>
      </div>
    </div>
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
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5 mt-1"
      style={{ background: "rgba(46,107,64,0.06)", border: "1px dashed rgba(46,107,64,0.3)" }}
    >
      <div className="flex items-center gap-3">
        <span style={{ fontSize: 22 }}>⏰</span>
        <p className="text-[15px] font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>
          Reminder time
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
        style={{ background: "rgba(9,26,16,0.7)", border: "1px solid rgba(46,107,64,0.45)", color: WARM, fontFamily: SPACE_GROTESK }}
      />
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────

export default function OfficeSettingsPage() {
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
  const [reflection, setReflection] = useState<ReflectionSource>(local.reflectionSource);
  const [gratitudeOn, setGratitudeOn] = useState(local.includeGratitudeSlide);
  const [medMinutes, setMedMinutes] = useState(local.defaultContemplationMinutes);

  const morning = eff.morning ?? "none";
  const evening = eff.evening ?? "none";
  const morningTime = eff.morningTime ?? "07:00";
  const eveningTime = eff.eveningTime ?? "18:00";
  const defaultPrayerLevel: DefaultPrayerLevel = eff.defaultPrayerLevel ?? "devotion";

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const TOTAL = 9;

  const goNext = () => { setDir(1); setStep((s) => Math.min(s + 1, TOTAL - 1)); };
  const goBack = () => { setDir(-1); setStep((s) => Math.max(s - 1, 0)); };
  const close = () => setLocation("/bcp/daily-office");
  // Single-choice questions auto-advance after a short beat so the
  // selection is visible before the slide slides away.
  const autoAdvance = () => window.setTimeout(goNext, 320);

  // ── Slides (index aligns with the dots) ──────────────────────────
  const slides: Array<() => React.ReactNode> = [
    // 0 — Intro
    () => (
      <div className="flex flex-col items-center text-center px-2">
        <div style={{ fontSize: 56, lineHeight: 1 }}>🌅</div>
        <h2 className="text-[27px] md:text-[31px] font-bold leading-tight mt-5 mb-2" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
          Shape your Daily Office
        </h2>
        <p className="text-[15px]" style={{ color: SAGE, lineHeight: 1.5, maxWidth: 360 }}>
          A few quick questions to set a prayer rhythm that fits you. You can change any answer anytime.
        </p>
      </div>
    ),

    // 1 — Default prayer
    () => (
      <SlideShell
        eyebrow="Step 1 · Your default"
        headline="When you tap “Begin prayer,” where to?"
        sub="The one-tap entry point from your home screen."
      >
        {([
          { value: "ask" as const, emoji: "🤔", label: "Ask each time", sub: "Show me the choices when I begin." },
          { value: "devotion" as const, emoji: "🌱", label: "Daily Devotion", sub: "The short BCP form (~5 min). The gentlest start." },
          { value: "office" as const, emoji: "📖", label: "Full Daily Office", sub: "Morning or Evening Prayer (~15–20 min)." },
          { value: "intercessions" as const, emoji: "🙏🏽", label: "Community Intercessions", sub: "The slideshow of prayer requests your community holds." },
        ]).map((o) => (
          <OptionCard
            key={o.value}
            emoji={o.emoji}
            label={o.label}
            sub={o.sub}
            selected={defaultPrayerLevel === o.value}
            onSelect={() => { saveServer({ defaultPrayerLevel: o.value }); autoAdvance(); }}
          />
        ))}
      </SlideShell>
    ),

    // 2 — Morning reminder
    () => (
      <SlideShell
        eyebrow="Step 2 · Mornings"
        headline="Want a morning nudge?"
        sub="A gentle push notification to begin your day in prayer."
      >
        {([
          { value: "none" as const, emoji: "🔕", label: "No reminder", sub: "" },
          { value: "office" as const, emoji: "📖", label: "Morning Prayer", sub: "Full Daily Office" },
          { value: "devotion" as const, emoji: "🌱", label: "Morning Devotion", sub: "Short BCP form" },
        ]).map((o) => (
          <OptionCard
            key={o.value}
            emoji={o.emoji}
            label={o.label}
            sub={o.sub || undefined}
            selected={morning === o.value}
            onSelect={() => saveServer({ morning: o.value })}
          />
        ))}
        {morning !== "none" && (
          <ReminderTimeField value={morningTime} onChange={(t) => saveServer({ morningTime: t })} />
        )}
      </SlideShell>
    ),

    // 3 — Evening reminder
    () => (
      <SlideShell
        eyebrow="Step 3 · Evenings"
        headline="And an evening nudge?"
        sub="A reminder to close the day in prayer."
      >
        {([
          { value: "none" as const, emoji: "🔕", label: "No reminder", sub: "" },
          { value: "office" as const, emoji: "📖", label: "Evening Prayer", sub: "Full Daily Office" },
          { value: "devotion" as const, emoji: "🌙", label: "Early Evening Devotion", sub: "Short BCP form" },
        ]).map((o) => (
          <OptionCard
            key={o.value}
            emoji={o.emoji}
            label={o.label}
            sub={o.sub || undefined}
            selected={evening === o.value}
            onSelect={() => saveServer({ evening: o.value })}
          />
        ))}
        {evening !== "none" && (
          <ReminderTimeField value={eveningTime} onChange={(t) => saveServer({ eveningTime: t })} />
        )}
      </SlideShell>
    ),

    // 4 — Confession of Sin
    () => (
      <SlideShell
        eyebrow="Step 4 · The opening"
        headline="Open with the Confession of Sin?"
        sub="Morning and Evening Prayer can begin with the BCP Confession & Absolution."
      >
        {([
          { value: true, emoji: "🤲", label: "Include it", sub: "Begin with the Confession of Sin & Absolution." },
          { value: false, emoji: "🌅", label: "Skip it", sub: "Begin straight at the Opening Sentence." },
        ]).map((o) => (
          <OptionCard
            key={String(o.value)}
            emoji={o.emoji}
            label={o.label}
            sub={o.sub}
            selected={!!eff.showConfession === o.value}
            onSelect={() => { saveServer({ showConfession: o.value }); autoAdvance(); }}
          />
        ))}
      </SlideShell>
    ),

    // 5 — Meditation timer
    () => (
      <SlideShell
        eyebrow="Step 5 · Silence"
        headline="A default for silent contemplation?"
        sub="When you begin a silent sit, start straight at this length — or leave it off to choose each time."
      >
        {([
          { value: 0, emoji: "🔕", label: "Off", sub: "No default — I’ll pick a length when I sit." },
          { value: 5, emoji: "🕯️", label: "5 minutes", sub: "" },
          { value: 10, emoji: "🕯️", label: "10 minutes", sub: "" },
          { value: 20, emoji: "🕯️", label: "20 minutes", sub: "" },
        ]).map((o) => (
          <OptionCard
            key={o.value}
            emoji={o.emoji}
            label={o.label}
            sub={o.sub || undefined}
            selected={medMinutes === o.value}
            onSelect={() => { setMedMinutes(o.value); setDefaultContemplationMinutes(o.value); autoAdvance(); }}
          />
        ))}
      </SlideShell>
    ),

    // 6 — Ways to pray (informational)
    () => (
      <SlideShell
        eyebrow="Step 6 · Three ways to pray"
        headline="Read it, hear it, or watch it"
        sub="On the office screen you can choose any of these — switch whenever you like."
      >
        <InfoCard emoji="📖" label="Read along" sub="The full text of the office, at your own pace." />
        <InfoCard emoji="🎧" label="Listen" sub="Morning & Evening Prayer read aloud (Forward Movement)." />
        <InfoCard emoji="📺" label="Watch" sub="Pray live with the National Cathedral each weekday morning." />
      </SlideShell>
    ),

    // 7 — After the office (reflection)
    () => (
      <SlideShell
        eyebrow="Step 7 · After the office"
        headline="A daily reflection to close with?"
        sub="One reflection pill appears on the closing slide and as a home card."
      >
        {([
          { value: "cac" as const, emoji: "🌅", label: "Center for Action & Contemplation", sub: "Today’s CAC daily reflection." },
          { value: "fdd" as const, emoji: "📖", label: "Forward Day by Day", sub: "Today’s Forward Movement meditation." },
          { value: "ssje" as const, emoji: "✍🏽", label: "SSJE Reflections", sub: "Today’s “Brother, Give Us a Word.”" },
          { value: "none" as const, emoji: "🚫", label: "None", sub: "No reflection pill or card." },
        ]).map((o) => (
          <OptionCard
            key={o.value}
            emoji={o.emoji}
            label={o.label}
            sub={o.sub}
            selected={reflection === o.value}
            onSelect={() => { setReflection(o.value); setReflectionSource(o.value); autoAdvance(); }}
          />
        ))}
      </SlideShell>
    ),

    // 8 — Gratitude pause + finish
    () => (
      <SlideShell
        eyebrow="Step 8 · The final touch"
        headline="A gratitude pause before the close?"
        sub="A short thanksgiving prompt slides in before the office ends."
      >
        {([
          { value: true, emoji: "🌾", label: "Yes, add it", sub: "A gratitude prompt before the closing." },
          { value: false, emoji: "🍃", label: "No thanks", sub: "Run straight to the closing." },
        ]).map((o) => (
          <OptionCard
            key={String(o.value)}
            emoji={o.emoji}
            label={o.label}
            sub={o.sub}
            selected={gratitudeOn === o.value}
            onSelect={() => { setGratitudeOn(o.value); setIncludeGratitudeSlide(o.value); }}
          />
        ))}
      </SlideShell>
    ),
  ];

  const isLast = step === TOTAL - 1;

  return (
    <div className="fixed inset-0 z-30 flex flex-col" style={{ background: BG }}>
      {/* Top bar — close, progress dots, counter */}
      <div
        className="flex items-center justify-between px-4 pb-3"
        style={{ paddingTop: "max(1rem, calc(env(safe-area-inset-top) + 0.5rem))" }}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="inline-flex items-center gap-1 text-sm transition-opacity hover:opacity-80"
          style={{ color: SAGE, background: "transparent", cursor: "pointer" }}
        >
          <X size={18} /> Close
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
              {slides[step]()}
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
            <ChevronLeft size={18} /> Back
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
            Done ✓
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            className="rounded-full px-7 py-3 text-[15px] font-semibold transition-opacity hover:opacity-90 active:scale-[0.98]"
            style={{ background: "#2D5E3F", color: WARM, border: `1px solid ${ACCENT}`, fontFamily: SPACE_GROTESK, cursor: "pointer" }}
          >
            {step === 0 ? "Get started →" : "Next →"}
          </button>
        )}
      </div>
    </div>
  );
}
