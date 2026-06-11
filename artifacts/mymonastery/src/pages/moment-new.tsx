import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { InviteStep } from "@/components/InviteStep";
import { useCommunityAdminToggle } from "@/hooks/useDemo";
import { BCP_PRAYERS, type BcpPrayer } from "@/lib/bcp-prayers";

// ─── DrumPicker ───────────────────────────────────────────────────────────────
// iOS-alarm-style scroll-wheel picker. Snap-scrolls to the nearest item;
// fades items above/below the centre. Works inside Capacitor WebView.
function DrumPicker({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: number; label: string }>;
  value: number;
  onChange: (v: number) => void;
}) {
  const ITEM_H = 48;
  const VISIBLE = 5;
  const containerH = ITEM_H * VISIBLE;
  const scrollRef = useRef<HTMLDivElement>(null);
  const settleTid = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastIdxRef = useRef(-1);
  const [centerIdx, setCenterIdx] = useState(() =>
    Math.max(0, options.findIndex(o => o.value === value))
  );

  // Initialise scroll position on mount
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.max(0, options.findIndex(o => o.value === value));
    el.scrollTop = idx * ITEM_H;
    lastIdxRef.current = idx;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync scroll when value changes externally (e.g. default value set)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = options.findIndex(o => o.value === value);
    if (idx < 0) return;
    if (Math.abs(el.scrollTop - idx * ITEM_H) > ITEM_H * 0.6) {
      el.scrollTo({ top: idx * ITEM_H, behavior: "smooth" });
    }
  }, [value, options]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Live visual update — no React state batching delay
    const raw = el.scrollTop / ITEM_H;
    const nearest = Math.round(raw);
    const clamped = Math.max(0, Math.min(options.length - 1, nearest));
    setCenterIdx(clamped);
    // Debounce settle: snap precisely and notify parent
    clearTimeout(settleTid.current);
    settleTid.current = setTimeout(() => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollTo({ top: clamped * ITEM_H, behavior: "smooth" });
      if (lastIdxRef.current !== clamped) {
        lastIdxRef.current = clamped;
        onChange(options[clamped].value);
      }
    }, 100);
  }, [options, onChange]);

  const scrollTo = (i: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: i * ITEM_H, behavior: "smooth" });
    setCenterIdx(i);
    lastIdxRef.current = i;
    onChange(options[i].value);
  };

  const BG = "#091A10";

  return (
    <div style={{ position: "relative", height: containerH, overflow: "hidden", userSelect: "none" }}>
      {/* Selection band */}
      <div style={{
        position: "absolute", top: ITEM_H * 2, left: 12, right: 12, height: ITEM_H,
        background: "rgba(46,107,64,0.20)",
        border: "1px solid rgba(46,107,64,0.50)",
        borderRadius: 12,
        pointerEvents: "none", zIndex: 1,
      }} />
      {/* Top fade */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: ITEM_H * 2 + 8,
        background: `linear-gradient(to bottom, ${BG} 20%, transparent)`,
        pointerEvents: "none", zIndex: 2,
      }} />
      {/* Bottom fade */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: ITEM_H * 2 + 8,
        background: `linear-gradient(to top, ${BG} 20%, transparent)`,
        pointerEvents: "none", zIndex: 2,
      }} />
      {/* Scroll drum */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          height: "100%",
          overflowY: "scroll",
          scrollSnapType: "y mandatory",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
          paddingTop: ITEM_H * 2,
          paddingBottom: ITEM_H * 2,
        } as React.CSSProperties}
      >
        {options.map((opt, i) => {
          const dist = Math.abs(i - centerIdx);
          return (
            <div
              key={opt.value}
              onClick={() => scrollTo(i)}
              style={{
                height: ITEM_H,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                scrollSnapAlign: "center",
                fontSize: dist === 0 ? 22 : dist === 1 ? 17 : 14,
                fontWeight: dist === 0 ? 700 : 400,
                color: dist === 0
                  ? "#F0EDE6"
                  : dist === 1
                  ? "rgba(240,237,230,0.55)"
                  : "rgba(240,237,230,0.25)",
                fontFamily: "'Space Grotesk', sans-serif",
                cursor: "pointer",
                transition: "color 0.12s, font-size 0.12s",
                letterSpacing: dist === 0 ? "0.01em" : undefined,
              }}
            >
              {opt.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
type StepId = "template" | "daily-office-choice" | "intercession" | "name" | "intention" | "logging" | "schedule" | "commitment" | "duration" | "invite"
  | "bcp-commitment" | "bcp-frequency" | "bcp-days" | "bcp-time" | "bcp-invite" | "intercession-frequency"
  | "contemplative-duration" | "fasting-type" | "fasting-what" | "fasting-why" | "fasting-when";
type FastingTypeChoice = "meat" | "custom" | null;
type LoggingType = "photo" | "reflection" | "both" | "checkin";
type Frequency = "daily" | "weekly";
type TimeOfDay = "early-morning" | "morning" | "midday" | "afternoon" | "late-afternoon" | "evening" | "night";
type BcpFreqType = "once" | "twice" | "three" | "five" | "daily";

type TFn = ReturnType<typeof useTranslation>["t"];

// ─── BCP Frequency options ────────────────────────────────────────────────────
type BcpFreqOption = {
  id: BcpFreqType; emoji: string; label: string; sub: string;
  dots: number; daysPerWeek: number; badge: string | null;
  bg: string; message: string;
};
function buildBcpFreqOptions(t: TFn): BcpFreqOption[] {
  return [
  { id: "once",  emoji: "🌱", label: t("moment_new.bcp_freq.once.label"),  sub: t("moment_new.bcp_freq.once.sub"),  dots: 1, daysPerWeek: 1, badge: null,                              bg: "#0F2818",              message: t("moment_new.bcp_freq.once.message") },
  { id: "twice", emoji: "🌿", label: t("moment_new.bcp_freq.twice.label"), sub: t("moment_new.bcp_freq.twice.sub"), dots: 2, daysPerWeek: 2, badge: null,                              bg: "rgba(46,107,64,0.18)", message: t("moment_new.bcp_freq.twice.message") },
  { id: "three", emoji: "🌸", label: t("moment_new.bcp_freq.three.label"), sub: t("moment_new.bcp_freq.three.sub"), dots: 3, daysPerWeek: 3, badge: t("moment_new.bcp_freq.three.badge"), bg: "rgba(46,107,64,0.25)", message: t("moment_new.bcp_freq.three.message") },
  { id: "five",  emoji: "🌳", label: t("moment_new.bcp_freq.five.label"),  sub: t("moment_new.bcp_freq.five.sub"),  dots: 5, daysPerWeek: 5, badge: null,                              bg: "rgba(46,107,64,0.32)", message: t("moment_new.bcp_freq.five.message") },
  { id: "daily", emoji: "✨", label: t("moment_new.bcp_freq.daily.label"), sub: t("moment_new.bcp_freq.daily.sub"), dots: 7, daysPerWeek: 7, badge: null,                              bg: "rgba(46,107,64,0.40)", message: t("moment_new.bcp_freq.daily.message") },
  ];
}

function buildWeekDays(t: TFn) {
  return [
  { id: "MO", label: t("moment_new.weekday.mon") }, { id: "TU", label: t("moment_new.weekday.tue") }, { id: "WE", label: t("moment_new.weekday.wed") },
  { id: "TH", label: t("moment_new.weekday.thu") }, { id: "FR", label: t("moment_new.weekday.fri") }, { id: "SA", label: t("moment_new.weekday.sat") }, { id: "SU", label: t("moment_new.weekday.sun") },
  ];
}

const SPIRITUAL_TEMPLATES = new Set(["morning-prayer", "evening-prayer", "intercession", "contemplative", "fasting", "lectio-divina", "custom"]);

type TimeOfDayOption = { id: TimeOfDay; emoji: string; label: string; sub: string; range: string };
function buildTimeOfDayOptions(t: TFn): TimeOfDayOption[] {
  return [
  { id: "early-morning",  emoji: "🌄", label: t("moment_new.time_of_day.early_morning.label"),  sub: t("moment_new.time_of_day.early_morning.sub"),  range: "5am – 8am" },
  { id: "morning",        emoji: "🌅", label: t("moment_new.time_of_day.morning.label"),        sub: t("moment_new.time_of_day.morning.sub"),        range: "8am – 11am" },
  { id: "midday",         emoji: "☀️",  label: t("moment_new.time_of_day.midday.label"),         sub: t("moment_new.time_of_day.midday.sub"),         range: "11am – 2pm" },
  { id: "afternoon",      emoji: "🌤", label: t("moment_new.time_of_day.afternoon.label"),      sub: t("moment_new.time_of_day.afternoon.sub"),      range: "2pm – 6pm" },
  { id: "late-afternoon", emoji: "🌇", label: t("moment_new.time_of_day.late_afternoon.label"), sub: t("moment_new.time_of_day.late_afternoon.sub"), range: "4pm – 7pm" },
  { id: "evening",        emoji: "🌆", label: t("moment_new.time_of_day.evening.label"),        sub: t("moment_new.time_of_day.evening.sub"),        range: "7pm – 10pm" },
  { id: "night",          emoji: "🌙", label: t("moment_new.time_of_day.night.label"),          sub: t("moment_new.time_of_day.night.sub"),          range: "9pm – 11pm" },
  ];
}

// Constraints per time-of-day (for the personal time picker)
const TOD_CONSTRAINTS: Record<string, { hours: number[]; amPm: "AM" | "PM" | "mixed"; defaultH: number; defaultAmPm: "AM" | "PM" }> = {
  "early-morning":  { hours: [5,6,7],        amPm: "AM",    defaultH: 6,  defaultAmPm: "AM" },
  "morning":        { hours: [8,9,10,11],     amPm: "AM",    defaultH: 8,  defaultAmPm: "AM" },
  "midday":         { hours: [11,12,1,2],     amPm: "mixed", defaultH: 12, defaultAmPm: "PM" },
  "afternoon":      { hours: [2,3,4,5,6],     amPm: "PM",    defaultH: 3,  defaultAmPm: "PM" },
  "late-afternoon": { hours: [4,5,6,7],       amPm: "PM",    defaultH: 5,  defaultAmPm: "PM" },
  "evening":        { hours: [7,8,9,10],      amPm: "PM",    defaultH: 8,  defaultAmPm: "PM" },
  "night":          { hours: [9,10,11],       amPm: "PM",    defaultH: 9,  defaultAmPm: "PM" },
};

const INTERCESSION_EXAMPLES = [
  "The climate and all those most affected by its changes",
  "Our parish and those we serve in this community",
  "Those who lead our nation — that they find courage and wisdom",
  "The sick, the suffering, and those who care for them",
  "Our enemies and those with whom we are in conflict",
  "The earth and every living thing that depends on it",
];

interface ContactSuggestion { name: string; email: string; }

// ─── Templates ───────────────────────────────────────────────────────────────
type Template = {
  id: string; emoji: string; name: string; desc: string;
  prefill?: {
    name: string; intention: string; loggingType: LoggingType;
    reflectionPrompt: string; scheduledHour: number;
    scheduledAmPm: "AM" | "PM"; frequency: Frequency;
  };
};
function buildTemplates(t: TFn): Template[] {
  return [
  {
    id: "morning-prayer", emoji: "🌅", name: t("moment_new.templates.morning_prayer.name"),
    desc: t("moment_new.templates.morning_prayer.desc"),
  },
  {
    id: "evening-prayer", emoji: "🌙", name: t("moment_new.templates.evening_prayer.name"),
    desc: t("moment_new.templates.evening_prayer.desc"),
  },
  {
    id: "lectio-divina", emoji: "📜", name: t("moment_new.templates.lectio_divina.name"),
    desc: t("moment_new.templates.lectio_divina.desc"),
    prefill: {
      name: t("moment_new.templates.lectio_divina.prefill_name"),
      intention: t("moment_new.templates.lectio_divina.prefill_intention"),
      loggingType: "reflection" as LoggingType,
      reflectionPrompt: "",
      scheduledHour: 8, scheduledAmPm: "AM" as "AM" | "PM",
      frequency: "weekly" as Frequency,
    },
  },
  {
    id: "intercession", emoji: "🙏🏽", name: t("moment_new.templates.intercession.name"),
    desc: t("moment_new.templates.intercession.desc"),
    prefill: {
      name: t("moment_new.templates.intercession.prefill_name"),
      intention: "",
      loggingType: "reflection" as LoggingType,
      reflectionPrompt: t("moment_new.prompt_default.on_your_heart"),
      scheduledHour: 8, scheduledAmPm: "AM" as "AM" | "PM",
      frequency: "daily" as Frequency,
    },
  },
  {
    id: "fasting", emoji: "✦", name: t("moment_new.templates.fasting.name"),
    desc: t("moment_new.templates.fasting.desc"),
    prefill: {
      name: t("moment_new.templates.fasting.prefill_name"),
      intention: t("moment_new.templates.fasting.prefill_intention"),
      loggingType: "checkin" as LoggingType,
      reflectionPrompt: "",
      scheduledHour: 8, scheduledAmPm: "AM" as "AM" | "PM",
      frequency: "weekly" as Frequency,
    },
  },
  ];
}

// ─── Milestone goal options ───────────────────────────────────────────────────
const TO_RRULE: Record<string, string> = {
  sunday: "SU", monday: "MO", tuesday: "TU", wednesday: "WE",
  thursday: "TH", friday: "FR", saturday: "SA",
};

const GOAL_OPTIONS_DAILY = [
  {
    days: 3, emoji: "🌱", label: "3 days", sub: "A first tender",
    bg: "#0F2818", borderColor: "#c8dac9",
    dots: Array(3).fill(0), dotLabel: "3 practices together",
    badge: null,
    message: "A gentle beginning. Three practices to find your rhythm.",
  },
  {
    days: 7, emoji: "🌿", label: "1 week", sub: "Taking root",
    bg: "#E4EEE6", borderColor: "#b0cdb3",
    dots: Array(7).fill(0), dotLabel: "7 practices together",
    badge: "Most chosen 🌿",
    message: "One week of practicing together. This is where something real begins.",
  },
  {
    days: 14, emoji: "🌸", label: "2 weeks", sub: "In bloom — then renew",
    bg: "#E8E4D8", borderColor: "#b0cdb3",
    dots: Array(14).fill(0), dotLabel: "14 practices — then your tradition renews the commitment",
    badge: null, accentBar: true,
    message: "Two weeks. If you reach it, Eleanor will ask you to renew. The practice stays alive.",
  },
  {
    days: 0, emoji: "✨", label: "Just begin", sub: "No goal, tend freely",
    bg: "#FAF6F0", borderColor: "rgba(0,0,0,0.06)",
    dots: [], dotLabel: "",
    badge: null,
    message: "No pressure. The practice is open. Tend it when you can.",
  },
];

const GOAL_OPTIONS_WEEKLY = [
  {
    days: 7, emoji: "🌿", label: "1 week", sub: "Taking root",
    bg: "#E4EEE6", borderColor: "#b0cdb3",
    dots: Array(1).fill(0), dotLabel: "1 practice together",
    badge: "Most chosen 🌿",
    message: "One week of practicing together. This is where something real begins.",
  },
  {
    days: 21, emoji: "🌸", label: "3 weeks", sub: "In bloom — then renew",
    bg: "#E8E4D8", borderColor: "#b0cdb3",
    dots: Array(3).fill(0), dotLabel: "3 practices — then your tradition renews the commitment",
    badge: null, accentBar: true,
    message: "Three weeks. If you reach it, Eleanor will ask you to renew. The practice stays alive.",
  },
  {
    days: 0, emoji: "✨", label: "Just begin", sub: "No goal, tend freely",
    bg: "#FAF6F0", borderColor: "rgba(0,0,0,0.06)",
    dots: [], dotLabel: "",
    badge: null,
    message: "No pressure. The practice is open. Tend it when you can.",
  },
];

// ─── Logging type options ─────────────────────────────────────────────────────
function buildLoggingOptions(t: TFn): { type: LoggingType; icon: string; label: string; description: string }[] {
  return [
  { type: "photo",      icon: "📸", label: t("moment_new.logging.photo.label"),      description: t("moment_new.logging.photo.description") },
  { type: "reflection", icon: "✍🏽", label: t("moment_new.logging.reflection.label"),  description: t("moment_new.logging.reflection.description") },
  { type: "both",       icon: "📸✍🏽", label: t("moment_new.logging.both.label"), description: t("moment_new.logging.both.description") },
  { type: "checkin",    icon: "✅", label: t("moment_new.logging.checkin.label"), description: t("moment_new.logging.checkin.description") },
  ];
}

// ─── Contact search hook ──────────────────────────────────────────────────────
function useContactSearch(query: string) {
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query || query.length < 2) { setSuggestions([]); return; }
    timerRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(query)}`, { credentials: "include" });
        setSuggestions(res.ok ? await res.json() : []);
      } catch { setSuggestions([]); }
      finally { setIsLoading(false); }
    }, 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  return { suggestions, isLoading, clearSuggestions: () => setSuggestions([]) };
}

// ─── Person row ───────────────────────────────────────────────────────────────
function PersonRow({ person, index, showRemove, onUpdate, onRemove, onSelect }: {
  person: { name: string; email: string }; index: number; showRemove: boolean;
  onUpdate: (i: number, f: "name" | "email", v: string) => void;
  onRemove: (i: number) => void;
  onSelect: (i: number, c: ContactSuggestion) => void;
}) {
  const { t } = useTranslation();
  const [activeField, setActiveField] = useState<"name" | "email" | null>(null);
  const [justSelected, setJustSelected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchQuery = activeField === "name" ? person.name : activeField === "email" ? person.email : "";
  const { suggestions, isLoading, clearSuggestions } = useContactSearch(justSelected ? "" : searchQuery);

  const handleSelect = useCallback((contact: ContactSuggestion) => {
    setJustSelected(true); setActiveField(null); clearSuggestions();
    onSelect(index, contact);
    setTimeout(() => setJustSelected(false), 500);
  }, [index, onSelect, clearSuggestions]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveField(null); clearSuggestions();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [clearSuggestions]);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <input type="text" value={person.name}
            onChange={e => { setJustSelected(false); onUpdate(index, "name", e.target.value); }}
            onFocus={() => setActiveField("name")}
            placeholder={t("moment_new.field.name")} autoComplete="off"
            className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
          />
        </div>
        <div className="relative flex-[1.5]">
          <input type="email" value={person.email}
            onChange={e => { setJustSelected(false); onUpdate(index, "email", e.target.value); }}
            onFocus={() => setActiveField("email")}
            placeholder={t("moment_new.field.email")} autoComplete="off"
            className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
          />
        </div>
        {showRemove && (
          <button onClick={() => onRemove(index)} className="text-muted-foreground hover:text-destructive transition-colors text-lg px-1">×</button>
        )}
      </div>
      {(suggestions.length > 0 || isLoading) && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
          {isLoading && <div className="px-4 py-3 text-sm text-muted-foreground">{t("moment_new.searching")}</div>}
          {suggestions.map((s, i) => (
            <button key={i} onMouseDown={e => { e.preventDefault(); handleSelect(s); }}
              className="w-full text-left px-4 py-3 hover:bg-secondary/50 transition-colors border-b border-border/50 last:border-0">
              <span className="font-medium text-sm">{s.name}</span>
              <span className="text-muted-foreground text-xs ml-2">{s.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── BCP Prayer List ──────────────────────────────────────────────────────────
// Emoji per BCP intercession category. Unmapped categories fall back to 🙏🏽.
const BCP_CATEGORY_EMOJI: Record<string, string> = {
  "For the Church": "⛪",
  "For the Mission of the Church": "✝️",
  "For the Nation": "🏛️",
  "For the World": "🌍",
  "For the Natural Order": "🌿",
  "For the Environment": "🌱",
  "For Cities and Towns": "🏙️",
  "For Vocation and Work": "🛠️",
  "For the Poor and Neglected": "🤲",
  "For Social Justice": "⚖️",
  "For Families": "👪",
  "For Those in Need": "🫶",
  "For the Sick": "🩺",
  "For the Dead": "🕊️",
  "Thanksgivings": "🌾",
  "Other Prayers": "🙏🏽",
};
function bcpCategoryEmoji(cat: string): string {
  return BCP_CATEGORY_EMOJI[cat] ?? "🙏🏽";
}

function BcpPrayerList({ onSelect }: { onSelect: (prayer: BcpPrayer) => void }) {
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const grouped = BCP_PRAYERS.reduce<Record<string, BcpPrayer[]>>((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-1.5">
      {Object.entries(grouped).map(([cat, prayers]) => (
        <div key={cat} className="border border-border/40 rounded-xl overflow-hidden">
          <button
            className="w-full text-left px-4 py-3 flex items-center justify-between bg-secondary/20 hover:bg-secondary/40 transition-colors"
            onClick={() => setExpandedCat(expandedCat === cat ? null : cat)}
          >
            <span className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span aria-hidden>{bcpCategoryEmoji(cat)}</span>
              {cat}
            </span>
            <span className="text-muted-foreground text-xs ml-2 shrink-0">{expandedCat === cat ? "▲" : "▼"}</span>
          </button>
          {expandedCat === cat && (
            <div className="divide-y divide-border/20 bg-background">
              {prayers.map(p => (
                <button
                  key={p.title}
                  className="w-full text-left px-5 py-3 flex items-center justify-between hover:bg-secondary/20 transition-colors"
                  onClick={() => onSelect(p)}
                >
                  <span className="text-sm text-foreground">{p.title}</span>
                  <span className="text-muted-foreground/60 text-sm shrink-0 ml-2">→</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function MomentNew() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  // Localized option lists (built from t() so call sites stay unchanged).
  const TEMPLATES = buildTemplates(t);
  const BCP_FREQ_OPTIONS = buildBcpFreqOptions(t);
  const WEEK_DAYS = buildWeekDays(t);
  const TIME_OF_DAY_OPTIONS = buildTimeOfDayOptions(t);
  const LOGGING_OPTIONS = buildLoggingOptions(t);

  // Read optional ritualId from query string (e.g. /moment/new?ritualId=5)
  const ritualIdFromUrl = (() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("ritualId");
    return v ? parseInt(v, 10) : null;
  })();

  // Intro splash (1.5s, first use only)
  const [showIntro, setShowIntro] = useState(() => !localStorage.getItem("eleanor_practice_intro_seen"));

  // Rotating examples for BCP intercession intention step
  const [exampleIdx, setExampleIdx] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setExampleIdx(i => (i + 1) % INTERCESSION_EXAMPLES.length), 3500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (showIntro) {
      localStorage.setItem("eleanor_practice_intro_seen", "1");
      const timer = setTimeout(() => setShowIntro(false), 1600);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [showIntro]);

  // Groups — fetch groups where user is admin for group practice creation
  const { data: groupsData } = useQuery<{ groups: Array<{ id: number; name: string; slug: string; emoji: string | null; myRole: string }> }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
    enabled: !!user,
  });
  const [communityAdminView] = useCommunityAdminToggle();
  const adminGroups = communityAdminView
    ? (groupsData?.groups ?? []).filter(g => g.myRole === "admin" || g.myRole === "hidden_admin")
    : [];
  // Auto-select when the user is admin of exactly one community
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  // Intercessions can span multiple communities. Stored separately from
  // selectedGroupId so the primary ownership stays unambiguous — the
  // primary group drives things like admin controls and the
  // moment_calendar_events owner; extras are "also visible from".
  const [additionalGroupIds, setAdditionalGroupIds] = useState<number[]>([]);
  useEffect(() => {
    if (adminGroups.length === 1 && selectedGroupId === null) {
      setSelectedGroupId(adminGroups[0].id);
    }
  }, [adminGroups, selectedGroupId]);
  // Keep additionalGroupIds consistent with the primary selection. If
  // the user switches primary to a group they had marked additional,
  // drop it from the extras list so we don't double-count.
  useEffect(() => {
    if (selectedGroupId !== null && additionalGroupIds.includes(selectedGroupId)) {
      setAdditionalGroupIds(ids => ids.filter(id => id !== selectedGroupId));
    }
  }, [selectedGroupId, additionalGroupIds]);

  // Step navigation
  const [step, setStep] = useState<StepId>("template");
  const [done, setDone] = useState(false);
  const [createdMomentId, setCreatedMomentId] = useState<number | null>(null);

  // Template
  const [templateId, setTemplateId] = useState<string | null>(null);

  // Intercession
  // Outbound URL for the "Action" intercession type. Slideshow
  // renders a "Take action →" pill that opens this in-browser.
  const [actionLearnMoreUrl, setActionLearnMoreUrl] = useState("");
  const [intercessionTopic, setIntercessionTopic] = useState("");
  const [intercessionSource, setIntercessionSource] = useState<"bcp" | "custom">("custom");
  const [intercessionFullText, setIntercessionFullText] = useState("");
  const [selectedBcpPrayer, setSelectedBcpPrayer] = useState<BcpPrayer | null>(null);

  // Core fields
  const [name, setName] = useState("");
  const [intention, setIntention] = useState("");
  const [loggingType, setLoggingType] = useState<LoggingType>("reflection");
  const [reflectionPrompt, setReflectionPrompt] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [scheduledDays, setScheduledDays] = useState<string[]>([]);
  const [scheduledHour, setScheduledHour] = useState(8);
  const [scheduledMinute, setScheduledMinute] = useState(0);
  const [scheduledAmPm, setScheduledAmPm] = useState<"AM" | "PM">("AM");
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay | null>("morning");
  const [commitmentDays, setCommitmentDays] = useState(30);
  const [commitmentSessionsGoal, setCommitmentSessionsGoal] = useState<number | null>(3);
  const [practiceDurationDays, setPracticeDurationDays] = useState<number | null>(null);
  // BCP-prayer intention step: the prayer is shown by default and the
  // specific-intention field stays hidden behind a pill until asked for.
  const [showSpecificIntention, setShowSpecificIntention] = useState(false);
  // Write-your-own intention step: the article ("learn more") link field
  // stays hidden behind an "Add article" button until asked for.
  const [showArticleLink, setShowArticleLink] = useState(false);
  // Intercession length lives on the schedule step now (under "How often").
  // Seed a sensible default so it shows a value and the submit never sends
  // 0 ("ongoing") by accident; clamp a daily value into the dropdown's 1–14
  // range when the user toggles from weekly back to daily.
  useEffect(() => {
    if (step !== "schedule" || templateId !== "intercession") return;
    if (frequency === "weekly") {
      if (practiceDurationDays === null) setPracticeDurationDays(7);
    } else {
      if (practiceDurationDays === null || practiceDurationDays < 1 || practiceDurationDays > 14) {
        setPracticeDurationDays(7);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, frequency]);
  const [invitedPeople, setInvitedPeople] = useState<{ name: string; email: string }[]>([]);
  const [showInviteDisabledMsg, setShowInviteDisabledMsg] = useState(false);

  // ─── BCP-specific state (Morning Prayer / Evening Prayer) ────────────────────
  const [bcpFreqType, setBcpFreqType] = useState<BcpFreqType | null>(null);
  const [bcpPracticeDays, setBcpPracticeDays] = useState<string[]>([]);
  const [bcpTimeSlot, setBcpTimeSlot] = useState<"early-morning" | "morning" | "late-afternoon" | "evening" | null>(null);
  const [bcpPersonalHour, setBcpPersonalHour] = useState(8);
  const [bcpPersonalMinute, setBcpPersonalMinute] = useState(0);
  const [bcpPersonalAmPm, setBcpPersonalAmPm] = useState<"AM" | "PM">("AM");
  const [bcpTimezone, setBcpTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [bcpParticipants, setBcpParticipants] = useState<{ name: string; email: string }[]>([{ name: "", email: "" }]);
  const [bcpConnections, setBcpConnections] = useState<{ name: string; email: string; invited: boolean }[]>([]);
  const [bcpConnectionsFetched, setBcpConnectionsFetched] = useState(false);
  const [bcpDone, setBcpDone] = useState(false);
  const [bcpCreatedToken, setBcpCreatedToken] = useState<string | null>(null);

  // ─── Contemplative Prayer duration ───────────────────────────────────────────
  const [contemplativeDuration, setContemplativeDuration] = useState<number | null>(null);
  const [customDurationInput, setCustomDurationInput] = useState("20");

  // ─── Fasting-specific state ───────────────────────────────────────────────────
  const [fastingTypeChoice, setFastingTypeChoice] = useState<FastingTypeChoice>(null);
  const [fastingFrom, setFastingFrom] = useState("");
  const [fastingIntention, setFastingIntention] = useState("");
  const [fastingFrequency, setFastingFrequency] = useState<"specific" | "weekly" | "monthly" | null>(null);
  const [fastingDate, setFastingDate] = useState("");
  const [fastingDay, setFastingDay] = useState("friday");
  const [fastingDayOfMonth, setFastingDayOfMonth] = useState<number | null>(null);
  const [customFastName, setCustomFastName] = useState("");
  const [customFastDescription, setCustomFastDescription] = useState("");

  // Rotating fasting examples
  const [fastingFromIdx, setFastingFromIdx] = useState(0);
  const [fastingIntentionIdx, setFastingIntentionIdx] = useState(0);
  const FASTING_FROM_EXAMPLES = [
    t("moment_new.fasting_from_examples.0"),
    t("moment_new.fasting_from_examples.1"),
    t("moment_new.fasting_from_examples.2"),
    t("moment_new.fasting_from_examples.3"),
    t("moment_new.fasting_from_examples.4"),
    t("moment_new.fasting_from_examples.5"),
  ];
  const FASTING_INTENTION_EXAMPLES = [
    t("moment_new.fasting_intention_examples.0"),
    t("moment_new.fasting_intention_examples.1"),
    t("moment_new.fasting_intention_examples.2"),
    t("moment_new.fasting_intention_examples.3"),
    t("moment_new.fasting_intention_examples.4"),
  ];
  useEffect(() => {
    const timer = setInterval(() => setFastingFromIdx(i => (i + 1) % 6), 3500);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setFastingIntentionIdx(i => (i + 1) % 5), 3700);
    return () => clearInterval(timer);
  }, []);

  // Organizer personal time (after creation for spiritual templates)
  const [showPersonalTimePrompt, setShowPersonalTimePrompt] = useState(false);
  const [personalTimeDone, setPersonalTimeDone] = useState(false);
  const [personalHour, setPersonalHour] = useState(8);
  const [personalMinute, setPersonalMinute] = useState(0);
  const [personalAmPm, setPersonalAmPm] = useState<"AM" | "PM">("AM");
  const [personalTimezone, setPersonalTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  const scheduledTime = (() => {
    let h = scheduledHour % 12;
    if (scheduledAmPm === "PM") h += 12;
    if (h === 12 && scheduledAmPm === "AM") h = 0;
    return `${String(h).padStart(2, "0")}:${String(scheduledMinute).padStart(2, "0")}`;
  })();

  const dayOfWeek = frequency === "weekly" && scheduledDays.length === 1
    ? (TO_RRULE[scheduledDays[0]] ?? scheduledDays[0])
    : undefined;
  const isSpiritual = SPIRITUAL_TEMPLATES.has(templateId ?? "");

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  // ─── When personal time prompt opens, constrain hour/ampm to the selected time-of-day ──
  useEffect(() => {
    if (showPersonalTimePrompt && timeOfDay) {
      const c = TOD_CONSTRAINTS[timeOfDay];
      if (c) {
        setPersonalHour(c.defaultH);
        setPersonalAmPm(c.defaultAmPm);
      }
    }
  }, [showPersonalTimePrompt, timeOfDay]);

  // ─── For midday (mixed), auto-set AM/PM when hour changes ──────────────────
  useEffect(() => {
    if (timeOfDay === "midday") {
      if (personalHour === 11 || personalHour === 12) setPersonalAmPm("AM");
      else setPersonalAmPm("PM");
    }
  }, [personalHour, timeOfDay]);

  // ─── Template selection handler ─────────────────────────────────────────────
  function selectTemplate(template: Template) {
    setTemplateId(template.id);
    // Daily Office: choose Morning or Evening first
    if (template.id === "daily-office") {
      setStep("daily-office-choice");
      return;
    }
    // Morning Prayer and Evening Prayer use a completely separate BCP flow
    if (template.id === "morning-prayer" || template.id === "evening-prayer") {
      setStep("bcp-commitment");
      return;
    }
    // Contemplative Prayer: duration selection first
    if (template.id === "contemplative") {
      if (template.prefill) {
        setName(template.prefill.name);
        setIntention(template.prefill.intention);
        setLoggingType(template.prefill.loggingType);
        setReflectionPrompt(template.prefill.reflectionPrompt);
        setFrequency(template.prefill.frequency);
      }
      setStep("contemplative-duration");
      return;
    }
    // Lectio Divina: minimal flow — we just need invitees. Schedule is fixed
    // (weekly Mon/Wed/Fri) and the gospel text is pulled from the lectionary
    // automatically each week.
    if (template.id === "lectio-divina") {
      if (template.prefill) {
        setName(template.prefill.name);
        setIntention(template.prefill.intention);
        setLoggingType(template.prefill.loggingType);
        setReflectionPrompt(template.prefill.reflectionPrompt);
        setFrequency(template.prefill.frequency);
      }
      setStep("invite");
      return;
    }
    // Fasting: choose fast type first (meat vs custom)
    if (template.id === "fasting") {
      setFastingTypeChoice(null);
      setFastingFrom("");
      setFastingIntention("");
      setFastingFrequency("weekly");
      setFastingDate("");
      setFastingDay("friday");
      setFastingDayOfMonth(null);
      setCustomFastName("");
      setCustomFastDescription("");
      setStep("fasting-type");
      return;
    }
    if (template.prefill) {
      setName(template.prefill.name);
      setIntention(template.prefill.intention);
      setLoggingType(template.prefill.loggingType);
      setReflectionPrompt(template.prefill.reflectionPrompt);
      // No pre-filled time or day — user fills these in
      setFrequency(template.prefill.frequency);
    }
    if (template.id === "intercession") {
      setStep("intercession");
    } else {
      setStep("name");
    }
  }

  // ─── Auto-select template from ?template= query param ──────────────────────
  // When the dashboard FAB routes to e.g. /moment/new?template=lectio-divina,
  // skip past the template picker and drop the user directly into the
  // sub-flow for that template. Only runs once on mount.
  const templateAutoSelected = useRef(false);
  useEffect(() => {
    if (templateAutoSelected.current) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tid = params.get("template");
    if (!tid) return;
    const match = TEMPLATES.find((tpl) => tpl.id === tid);
    if (!match) return;
    templateAutoSelected.current = true;
    selectTemplate(match);
    // Strip the query param so back-nav inside the flow doesn't re-trigger it
    params.delete("template");
    const next = params.toString();
    window.history.replaceState({}, "", next ? `${window.location.pathname}?${next}` : window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Intercession BCP selection ─────────────────────────────────────────────
  function selectBcpPrayer(prayer: BcpPrayer) {
    setSelectedBcpPrayer(prayer);
    setIntercessionTopic(prayer.title);
    setIntercessionSource("bcp");
    setIntercessionFullText(prayer.text);
    setName(prayer.title);
    setIntention("");
    setLoggingType("reflection");
    setReflectionPrompt("What is on your heart today?");
    setStep("intention");
  }

  function confirmCustomIntercession() {
    setIntercessionSource("custom");
    setIntercessionFullText("");
    setLoggingType("reflection");
    setReflectionPrompt("What is on your heart today?");
    // Skip the "What is this practice called?" step — custom intercession
    // uses the default name "Intercession 🙏🏽" from the template prefill.
    // Go straight to the combined intention + prayer screen so the flow
    // mirrors the BCP intercession path.
    setStep("intention");
  }

  // ─── Navigation ─────────────────────────────────────────────────────────────
  const isBcpTemplate = templateId === "morning-prayer" || templateId === "evening-prayer";
  const BCP_STEP_ORDER: StepId[] = ["template", "bcp-commitment", "bcp-frequency", "bcp-days", "bcp-time", "bcp-invite"];
  const STEP_ORDER: StepId[] = isBcpTemplate
    ? BCP_STEP_ORDER
    : templateId === "intercession"
      // Custom and BCP intercessions now share the same step order. We
      // drop the "name" step (name defaults from template prefill) and
      // the "logging" step (reflectionPrompt defaults from prefill too)
      // so custom flows through the same minimal path as BCP.
      ? ["template", "intercession", "intention", "schedule", "invite"]
    : templateId === "contemplative"
      ? ["template", "contemplative-duration", "name", "intention", "logging", "schedule", "invite"]
    : templateId === "fasting"
      ? (fastingTypeChoice === "meat"
        ? ["template", "fasting-type", "fasting-when", "invite"]
        : ["template", "fasting-type", "fasting-when", "duration", "invite"])
    : templateId === "lectio-divina"
      ? ["template", "invite"]
      : ["template", "name", "intention", "logging", "schedule", "invite"];

  function goNext() {
    // Skip bcp-days for daily (no specific days to choose), but still show bcp-time
    if (step === "bcp-frequency" && bcpFreqType === "daily") {
      setStep("bcp-time");
      return;
    }
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) setStep(STEP_ORDER[idx + 1]);
    else if (isBcpTemplate) handleSubmitBcp();
    else handleSubmit();
  }

  // Fetch existing connections when entering bcp-invite step
  useEffect(() => {
    if (step === "bcp-invite" && !bcpConnectionsFetched) {
      setBcpConnectionsFetched(true);
      apiRequest<{ connections: { name: string; email: string }[] }>("GET", "/api/connections")
        .then(r => {
          setBcpConnections(r.connections.map(c => ({ ...c, invited: false })));
        })
        .catch(() => {});
    }
  }, [step, bcpConnectionsFetched]);

  function goBack() {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
    else setLocation("/tradition/new");
  }

  const stepIndex = STEP_ORDER.indexOf(step);
  const totalSteps = STEP_ORDER.length;

  // ─── Validation ─────────────────────────────────────────────────────────────
  const canNext = () => {
    if (step === "template") return false;
    if (step === "intercession") return false;
    if (step === "contemplative-duration") return contemplativeDuration !== null;
    if (step === "fasting-type") return false; // navigation handled by type selection buttons
    if (step === "fasting-what") return fastingFrom.trim().length >= 2;
    if (step === "fasting-why") return fastingIntention.trim().length >= 4;
    if (step === "fasting-when") {
      if (!fastingFrequency) return false;
      if (fastingFrequency === "specific") return fastingDate.length > 0;
      if (fastingFrequency === "weekly") return fastingDay.length > 0;
      if (fastingFrequency === "monthly") return fastingDayOfMonth !== null;
      return false;
    }
    if (step === "bcp-commitment") return true;
    if (step === "bcp-frequency") return !!bcpFreqType;
    if (step === "bcp-days") {
      if (bcpFreqType === "daily") return true;
      return bcpPracticeDays.length === (BCP_FREQ_OPTIONS.find(f => f.id === bcpFreqType)?.daysPerWeek ?? 0);
    }
    if (step === "bcp-time") {
      return bcpTimeSlot !== null;
    }
    if (step === "bcp-invite") return true;
    if (step === "name") return name.trim().length >= 2;
    if (step === "intention") {
      if (selectedBcpPrayer) return true; // intention is optional when a BCP prayer is selected
      if (templateId === "intercession" && intercessionSource === "custom") {
        // Custom intercession requires BOTH a named intention and a
        // prayer written out — the group prays the prayer together, so
        // leaving it blank would leave everyone with nothing to pray.
        // The "learn more" article link is optional.
        return intention.trim().length >= 3 && intercessionFullText.trim().length >= 4;
      }
      return intention.trim().length >= 4;
    }
    if (step === "logging") {
      if (loggingType === "reflection") return reflectionPrompt.trim().length >= 1;
      return true;
    }
    if (step === "schedule") {
      if (templateId === "intercession" && frequency === "weekly" && scheduledDays.length !== 1) return false;
      if (templateId !== "intercession" && frequency === "weekly" && scheduledDays.length === 0) return false;
      return true;
    }
    if (step === "commitment") return commitmentSessionsGoal !== null;
    if (step === "duration") return practiceDurationDays !== null;
    if (step === "invite") {
      // Lectio Divina: invite is a person search (no community requirement)
      if (templateId === "lectio-divina") return invitedPeople.length > 0;
      return selectedGroupId !== null;
    }
    return false;
  };

  // ─── Submit ──────────────────────────────────────────────────────────────────
  const plantMutation = useMutation({
    mutationFn: (data: object) => apiRequest<{ moment: { id: number; momentToken: string } }>("POST", "/api/moments", data),
    onSuccess: (data) => {
      setCreatedMomentId(data.moment.id);
      if (ritualIdFromUrl && !isSpiritual) {
        setLocation(`/ritual/${ritualIdFromUrl}`);
        return;
      }
      // Lectio Divina has its own welcome screen baked into the
      // /lectio/... slideshow (shown before any reflection is
      // submitted). Skip the generic "is planted" confirmation for
      // Lectio creators so they land directly on that welcome slide.
      if (templateId === "lectio-divina") {
        setLocation(`/moments/${data.moment.id}`);
        return;
      }
      setDone(true);
    },
  });

  // ─── BCP submit ──────────────────────────────────────────────────────────────
  const bcpPlantMutation = useMutation({
    mutationFn: (data: object) => apiRequest<{ moment: { id: number; momentToken: string } }>("POST", "/api/moments", data),
    onSuccess: (data) => {
      setBcpCreatedToken(data.moment.momentToken);
      // Save organizer personal time
      const h = (() => {
        let hh = bcpPersonalHour % 12;
        if (bcpPersonalAmPm === "PM") hh += 12;
        if (hh === 12 && bcpPersonalAmPm === "AM") hh = 0;
        return hh;
      })();
      const ptStr = `${String(h).padStart(2, "0")}:${String(bcpPersonalMinute).padStart(2, "0")}`;
      apiRequest("POST", `/api/moments/${data.moment.id}/personal-time`, {
        personalTime: ptStr,
        personalTimezone: bcpTimezone,
      }).catch(() => {});
      setBcpDone(true);
    },
  });

  function handleSubmitBcp() {
    const isMorning = templateId === "morning-prayer";
    const freqOpt = BCP_FREQ_OPTIONS.find(f => f.id === bcpFreqType);
    const daysPerWeek = freqOpt?.daysPerWeek ?? 7;
    const isDaily = bcpFreqType === "daily";
    const validParticipants = [
      ...bcpConnections.filter(c => c.invited),
      ...bcpParticipants.filter(p => p.name.trim() && p.email.trim()),
    ];

    // Build the scheduled time from bcpPersonalHour + bcpPersonalAmPm
    const h = (() => {
      let hh = bcpPersonalHour % 12;
      if (bcpPersonalAmPm === "PM") hh += 12;
      if (hh === 12 && bcpPersonalAmPm === "AM") hh = 0;
      return hh;
    })();
    const scheduledTimeStr = `${String(h).padStart(2, "0")}:${String(bcpPersonalMinute).padStart(2, "0")}`;

    bcpPlantMutation.mutate({
      name: isMorning ? `${t("moment_new.payload.morning_prayer_name")} 🌅` : `${t("moment_new.payload.evening_prayer_name")} 🌙`,
      intention: isMorning
        ? t("moment_new.payload.morning_prayer_intention")
        : t("moment_new.payload.evening_prayer_intention"),
      loggingType: "checkin",
      templateType: templateId,
      frequency: isDaily ? "daily" : "weekly",
      scheduledTime: scheduledTimeStr,
      timezone: bcpTimezone,
      goalDays: 0,
      frequencyType: bcpFreqType,
      frequencyDaysPerWeek: daysPerWeek,
      practiceDays: isDaily ? "[]" : JSON.stringify(bcpPracticeDays),
      participants: validParticipants,
    });
  }

  const personalTimeMutation = useMutation({
    mutationFn: (data: object) =>
      apiRequest<{ ok: boolean }>("POST", `/api/moments/${createdMomentId}/personal-time`, data),
    onSuccess: () => {
      setShowPersonalTimePrompt(false);
      setPersonalTimeDone(true);
    },
  });

  function handleSubmit() {
    const validParticipants = invitedPeople;
    const isFasting = templateId === "fasting";
    const isLectio = templateId === "lectio-divina";

    // Fasting: derive name/intention/scheduling from fasting-specific fields
    // "Action" intercessions follow the same custom-intercession plumbing
    // (the user writes title + prayer); the only extra they carry is
    // learnMoreUrl. Lump them together so the name/intention derivation
    // below doesn't branch.
    const isCustomIntercession = templateId === "intercession" && intercessionSource === "custom";
    const finalName = isFasting && fastingTypeChoice === "meat"
      ? t("moment_new.payload.fast_from_meat")
      : isFasting && fastingTypeChoice === "custom"
      ? customFastName.trim() || t("moment_new.payload.fasting_from", { what: fastingFrom.trim() })
      : isFasting
      ? t("moment_new.payload.fasting_from", { what: fastingFrom.trim() })
      : isCustomIntercession
      ? (intention.trim() || name.trim())
      : name.trim();
    const finalIntention = isFasting && fastingTypeChoice === "meat"
      ? t("moment_new.fasting_meat_intention")
      : isFasting && fastingTypeChoice === "custom"
      ? customFastDescription.trim() || fastingIntention.trim()
      : isFasting
      ? fastingIntention.trim()
      : intention.trim() || intercessionTopic.trim() || name.trim() || t("moment_new.payload.praying_together");
    const finalFastingFrom = isFasting && fastingTypeChoice === "meat"
      ? "meat"
      : isFasting ? (customFastName.trim() || fastingFrom.trim()) : "";

    // Fasting frequency/day mapping
    const fastingFreqForApi = isFasting
      ? (fastingFrequency === "specific" ? "weekly" : fastingFrequency ?? "weekly")
      : frequency;
    const fastingDayOfWeekRrule = isFasting && fastingFrequency === "weekly"
      ? fastingDay.toUpperCase().slice(0, 2)
      : undefined;

    plantMutation.mutate({
      name: finalName,
      intention: finalIntention,
      loggingType: isFasting ? "checkin" : loggingType,
      reflectionPrompt: (loggingType === "reflection" || loggingType === "both") && !isFasting
        ? reflectionPrompt.trim() || undefined
        : undefined,
      templateType: templateId,
      intercessionTopic: intercessionTopic.trim() || undefined,
      intercessionSource: (intercessionTopic.trim() || isCustomIntercession) ? intercessionSource : undefined,
      intercessionFullText: intercessionFullText.trim() || undefined,
      // Optional article / "learn more" link on a custom intercession; the
      // server scrapes its title (like prayer feeds). BCP prayers have none.
      learnMoreUrl: (isCustomIntercession && actionLearnMoreUrl.trim())
        ? actionLearnMoreUrl.trim()
        : undefined,
      frequency: (isLectio ? "weekly" : fastingFreqForApi) as "daily" | "weekly" | "monthly",
      scheduledTime: isFasting || isLectio ? "00:00" : scheduledTime,
      dayOfWeek: isFasting ? (fastingDayOfWeekRrule as "MO"|"TU"|"WE"|"TH"|"FR"|"SA"|"SU" | undefined) : dayOfWeek,
      practiceDays: isLectio
        ? JSON.stringify(["MO", "WE", "FR"])
        : isSpiritual && frequency === "weekly" && scheduledDays.length > 0
        ? JSON.stringify(scheduledDays)
        : undefined,
      goalDays: isLectio ? 0 : (isFasting && fastingTypeChoice === "meat") ? 0 : (isFasting || templateId === "intercession") ? (practiceDurationDays ?? 0) : 0,
      commitmentDuration: isLectio ? 0 : (isFasting && fastingTypeChoice === "meat") ? 0 : (isFasting || templateId === "intercession") ? (practiceDurationDays ?? 0) : 0,
      commitmentSessionsGoal: (isFasting && fastingTypeChoice === "meat") ? null : (isFasting || templateId === "intercession") ? practiceDurationDays : null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timeOfDay: timeOfDay ?? undefined,
      participants: validParticipants,
      ritualId: ritualIdFromUrl ?? undefined,
      // Contemplative
      contemplativeDurationMinutes: templateId === "contemplative" ? (contemplativeDuration ?? undefined) : undefined,
      // Fasting
      fastingType: isFasting ? (fastingTypeChoice ?? undefined) : undefined,
      fastingFrom: isFasting ? finalFastingFrom || undefined : undefined,
      fastingIntention: isFasting ? finalIntention || undefined : undefined,
      fastingFrequency: isFasting ? fastingFrequency ?? undefined : undefined,
      fastingDate: isFasting && fastingFrequency === "specific" ? fastingDate || undefined : undefined,
      fastingDay: isFasting && fastingFrequency === "weekly" ? fastingDay || undefined : undefined,
      fastingDayOfMonth: isFasting && fastingFrequency === "monthly" ? fastingDayOfMonth ?? undefined : undefined,
      // Group practice
      groupId: selectedGroupId ?? undefined,
      // Intercessions can be attached to multiple communities at once.
      // Server validates that the caller admins each additional group.
      additionalGroupIds: templateId === "intercession" && additionalGroupIds.length > 0
        ? additionalGroupIds
        : undefined,
    });
  }

  function handleSavePersonalTime() {
    let h = personalHour % 12;
    if (personalAmPm === "PM") h += 12;
    if (h === 12 && personalAmPm === "AM") h = 0;
    const ptStr = `${String(h).padStart(2, "0")}:${String(personalMinute).padStart(2, "0")}`;
    personalTimeMutation.mutate({ personalTime: ptStr, personalTimezone });
  }

  const sv = { initial: { opacity: 0, x: 20 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -20 } };

  if (authLoading) return null;

  // ─── Done / Confirmation ──────────────────────────────────────────────────────
  if (done) {
    const templateInfo = TEMPLATES.find(tpl => tpl.id === templateId);
    const [h, m] = scheduledTime.split(":").map(Number);
    const timeLabel = new Date(0, 0, 0, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const isFastingDone = templateId === "fasting";
    const isIntercessionDone = templateId === "intercession";
    const commitmentLabel = practiceDurationDays !== null && (isFastingDone || isIntercessionDone)
      ? practiceDurationDays === 0
        ? { emoji: "✨", label: t("moment_new.done.ongoing") }
        : practiceDurationDays % 7 === 0
          ? { emoji: "🌿", label: t("moment_new.done.weeks", { count: practiceDurationDays / 7 }) }
          : { emoji: "🌿", label: t("moment_new.done.days", { count: practiceDurationDays }) }
      : null;
    const todEmoji = TIME_OF_DAY_OPTIONS.find(o => o.id === timeOfDay)?.emoji ?? "🌿";
    const todLabel = TIME_OF_DAY_OPTIONS.find(o => o.id === timeOfDay)?.label?.toLowerCase() ?? "morning";

    // ── Organizer personal time prompt (spiritual templates only) ────────────
    return (
      <div className="min-h-screen bg-[#091A10] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-sm w-full text-center text-[#F5EDD8]"
        >
          <div className="text-6xl mb-6">🌱</div>
          <h2 className="text-3xl font-semibold mb-3" style={{ color: "#F0EDE6" }}>{t("moment_new.done.planted", { name })}</h2>
          <p className="mb-2" style={{ color: "#8FAF96" }}>{frequency === "daily" ? t("moment_new.done.freq_daily") : frequency === "weekly" ? t("moment_new.done.freq_weekly") : t("moment_new.done.freq_monthly")} {t("moment_new.done.at_time", { time: timeLabel })}</p>
          {commitmentLabel && (
            <p className="mb-6" style={{ color: "#8FAF96" }}>{commitmentLabel.emoji} {commitmentLabel.label}</p>
          )}
          <p className="mb-8 text-sm leading-relaxed" style={{ color: "#8FAF96" }}>
            {t("moment_new.done.invites_line1")}<br />
            {t("moment_new.done.invites_line2")}<br />
            {t("moment_new.done.invites_line3")}
          </p>
          <button
            onClick={() => createdMomentId ? setLocation(`/moments/${createdMomentId}`) : setLocation("/dashboard")}
            className="px-8 py-3 bg-[#5C7A5F] text-white rounded-full font-medium hover:bg-[#5a7a60] transition-colors"
          >
            {t("moment_new.done.done_button")} 🌿
          </button>
        </motion.div>
      </div>
    );
  }

  // ── BCP Confirmation screen ─────────────────────────────────────────────────
  if (bcpDone) {
    const isMorning = templateId === "morning-prayer";
    const freqOpt = BCP_FREQ_OPTIONS.find(f => f.id === bcpFreqType);
    const freqLabel = freqOpt?.label ?? t("moment_new.bcp_freq.daily.label");
    return (
      <div className="min-h-screen bg-[#091A10] flex items-center justify-center px-6">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="max-w-sm w-full text-center text-[#E8E4D8]">
          <div className="text-6xl mb-6">{isMorning ? "🌅" : "🌙"}</div>
          <h2 className="text-3xl font-bold mb-2">
            {isMorning ? t("moment_new.bcp_done.planted_morning") : t("moment_new.bcp_done.planted_evening")}
          </h2>
          <p className="text-[#E8E4D8]/70 mb-6">{t("moment_new.bcp_done.own_time", { freq: freqLabel })}</p>
          <p className="text-sm text-[#E8E4D8]/60 mb-8">{t("moment_new.bcp_done.calendar_invites")}</p>
          <div className="bg-[#E8E4D8]/10 border border-[#E8E4D8]/20 rounded-2xl p-5 mb-8 text-left">
            <p className="text-sm font-medium text-[#E8E4D8] mb-1">
              {t("moment_new.bcp_done.open_bcp", { page: isMorning ? "75" : "115" })}
            </p>
            <a href={isMorning ? "https://bcponline.org/DailyOffice/mp2.html" : "https://bcponline.org/DailyOffice/ep2.html"}
              target="_blank" rel="noopener noreferrer"
              className="text-sm text-[#5C7A5F] underline underline-offset-2">
              {t("moment_new.bcp_done.pray_online")} {isMorning ? "bcponline.org/DailyOffice/mp2.html" : "bcponline.org/DailyOffice/ep2.html"}
            </a>
          </div>
          <p className="text-[#E8E4D8]/50 font-serif italic text-sm leading-relaxed mb-8">
            {isMorning
              ? t("moment_new.bcp_done.quote_morning")
              : t("moment_new.bcp_done.quote_evening")}
          </p>
          <button onClick={() => setLocation("/dashboard")}
            className="px-10 py-4 bg-[#5C7A5F] text-white rounded-full text-base font-semibold hover:bg-[#5a7a60] transition-colors">
            {t("moment_new.done.done_button")} 🌿
          </button>
        </motion.div>
      </div>
    );
  }

  // ── BCP Commitment screen (full screen, soil bg) ─────────────────────────────
  if (step === "bcp-commitment" && isBcpTemplate) {
    const isMorning = templateId === "morning-prayer";
    return (
      <div className="min-h-screen bg-[#091A10] flex items-center justify-center px-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="max-w-sm w-full text-center text-[#E8E4D8]">
          <div className="text-6xl mb-6">{isMorning ? "🌅" : "🌙"}</div>
          <h1 className="text-3xl font-bold leading-tight mb-2">
            {isMorning ? t("moment_new.bcp_commitment.plant_morning") : t("moment_new.bcp_commitment.plant_evening")}
          </h1>
          <p className="text-[#5C7A5F] text-lg font-semibold mb-8">{t("moment_new.bcp_commitment.with_your_people")}</p>
          <p className="font-serif italic text-[#E8E4D8]/80 text-base leading-loose mb-8 whitespace-pre-line">
            {isMorning
              ? t("moment_new.bcp_commitment.verse_morning")
              : t("moment_new.bcp_commitment.verse_evening")}
          </p>
          <p className="text-[#E8E4D8]/50 text-sm mb-8">
            {isMorning
              ? t("moment_new.bcp_commitment.rite_morning")
              : t("moment_new.bcp_commitment.rite_evening")}
          </p>
          <button onClick={goNext}
            className="w-full py-4 rounded-2xl bg-[#5C7A5F] text-white text-base font-semibold hover:bg-[#5a7a60] transition-colors">
            {t("moment_new.bcp_commitment.plant_cta")} 🌿
          </button>
          <button onClick={() => { setTemplateId(null); setStep("template"); }}
            className="mt-4 text-sm text-[#E8E4D8]/40 hover:text-[#E8E4D8]/70 transition-colors">
            ← {t("moment_new.go_back")}
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Practice intro splash (first use only) ──────────────────────────────────
  if (showIntro) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center min-h-[70vh]">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="w-full max-w-sm mx-auto"
          >
            <div className="bg-[#0F2818] border border-[#5C7A5F]/20 rounded-[2rem] p-10 text-center shadow-[var(--shadow-warm-lg)]">
              <div className="text-5xl mb-5">🌿</div>
              <p className="text-[#F0EDE6] font-serif text-[1.1rem] leading-relaxed italic whitespace-pre-line">
                {t("moment_new.intro_splash")}
              </p>
            </div>
          </motion.div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pt-6 pb-16">

        {/* Header + progress */}
        {step !== "template" && (
          <div className="mb-6 flex items-center gap-4">
            <button onClick={goBack} className="text-sm transition-opacity hover:opacity-70" style={{ color: "#8FAF96" }}>
              ← {(step === "name" || step === "contemplative-duration" || step === "fasting-what" || step === "daily-office-choice") ? t("moment_new.nav_templates") : t("moment_new.nav_back")}
            </button>
            <div className="flex-1 flex gap-1.5">
              {Array.from({ length: Math.max(totalSteps, 1) }, (_, i) => (
                <div
                  key={i}
                  className="h-1 flex-1 rounded-full transition-colors duration-300"
                  style={{ background: i <= stepIndex ? "#2D5E3F" : "rgba(200,212,192,0.2)" }}
                />
              ))}
            </div>
          </div>
        )}

        <div className={step === "template" ? "flex flex-col" : "flex flex-col min-h-[calc(100dvh-160px)]"}>
          {/* Bottom padding clears the fixed Continue bar so the last field
              isn't hidden behind it (and behind the keyboard). */}
          <div className="flex-1 overflow-y-auto min-h-0" style={{ paddingBottom: 120 }}>
          <AnimatePresence mode="wait">
            <motion.div key={step} variants={sv} initial="initial" animate="animate" exit="exit"
              transition={{ duration: 0.22 }} className="flex-1 flex flex-col">

              {/* ── Template selection ──────────────────────────── */}
              {step === "template" && (
                <div className="flex-1">
                  <h2 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {t("moment_new.template_step.title")}
                  </h2>
                  <p className="text-sm mb-8" style={{ color: "#8FAF96" }}>
                    {t("moment_new.template_step.subtitle")}
                  </p>
                  <div className="space-y-3">
                    {TEMPLATES.map(tpl => (
                      <button key={tpl.id} onClick={() => selectTemplate(tpl)}
                        className="w-full text-left rounded-2xl transition-all hover:shadow-md active:scale-[0.99]"
                        style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.35)" }}>
                        <div className="flex items-center gap-4 px-5 py-4">
                          <span className="text-3xl leading-none shrink-0">{tpl.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-[15px] leading-snug" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>{tpl.name}</p>
                            <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>{tpl.desc}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Daily Office choice ─────────────────────────── */}
              {step === "daily-office-choice" && (
                <div className="flex-1">
                  <h2 className="text-2xl font-semibold mb-1" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {t("moment_new.daily_office.title")}
                  </h2>
                  <p className="text-sm italic mb-8" style={{ color: "#8FAF96" }}>
                    {t("moment_new.daily_office.subtitle")}
                  </p>
                  <div className="space-y-3">
                    {[
                      { id: "morning-prayer", emoji: "🌅", name: t("moment_new.daily_office.morning_name"), desc: t("moment_new.daily_office.morning_desc") },
                      { id: "evening-prayer", emoji: "🌙", name: t("moment_new.daily_office.evening_name"), desc: t("moment_new.daily_office.evening_desc") },
                    ].map(office => (
                      <button
                        key={office.id}
                        onClick={() => {
                          setTemplateId(office.id);
                          setStep("bcp-commitment");
                        }}
                        className="w-full text-left p-4 rounded-2xl transition-all hover:shadow-md active:scale-[0.99]"
                        style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.35)" }}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{office.emoji}</span>
                          <div>
                            <p className="font-semibold text-base" style={{ color: "#F0EDE6" }}>{office.name}</p>
                            <p className="text-sm" style={{ color: "#8FAF96" }}>{office.desc}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Intercession sub-flow ───────────────────────── */}
              {step === "intercession" && (
                <div className="flex-1">
                  <div className="mb-5">
                    <h2 className="text-2xl font-semibold mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>{t("moment_new.intercession.title")}</h2>
                    <p className="text-sm text-muted-foreground italic">{t("moment_new.intercession.subtitle")}</p>
                  </div>
                  {/* Land straight on the BCP picker; "Write your own" sits
                      at the bottom as a card. */}
                  <BcpPrayerList onSelect={selectBcpPrayer} />
                  <button
                    onClick={confirmCustomIntercession}
                    className="w-full text-left p-4 rounded-2xl transition-all mt-3 flex items-start gap-3"
                    style={{ background: "#0F2818", border: "1.5px solid rgba(46,107,64,0.45)" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(46,107,64,0.7)")}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(46,107,64,0.45)")}>
                    <span className="text-2xl">✍🏽</span>
                    <div>
                      <p className="font-semibold text-foreground">{t("moment_new.intercession.own_title")}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">{t("moment_new.intercession.own_desc")}</p>
                    </div>
                  </button>
                </div>
              )}

              {/* ── BCP: How often ──────────────────────────────────── */}
              {step === "bcp-frequency" && (() => {
                const isMorning = templateId === "morning-prayer";
                const freqOpt = BCP_FREQ_OPTIONS.find(f => f.id === bcpFreqType);
                const requiredDays = freqOpt && freqOpt.id !== "daily" ? freqOpt.daysPerWeek : 0;
                return (
                  <div className="flex-1 space-y-4">
                    <div>
                      <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>{t("moment_new.bcp_frequency.title")}</h2>
                      <p className="text-sm text-muted-foreground italic">{t("moment_new.bcp_frequency.subtitle")}</p>
                    </div>
                    <div className="space-y-3">
                      {BCP_FREQ_OPTIONS.map(opt => {
                        const sel = bcpFreqType === opt.id;
                        const accentBar = opt.id === "five" || opt.id === "daily";
                        return (
                          <button key={opt.id} onClick={() => {
                            setBcpFreqType(opt.id);
                            if (opt.id === "daily") setBcpPracticeDays([]);
                            else setBcpPracticeDays([]);
                          }}
                            className="relative w-full text-left rounded-2xl overflow-hidden transition-all duration-200"
                            style={{ background: sel ? "#5C7A5F" : opt.bg }}
                          >
                            {accentBar && !sel && (
                              <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: opt.id === "five" ? "#5C7A5F" : "#C17F24" }} />
                            )}
                            <div className={`flex items-center gap-4 px-5 py-4 ${accentBar && !sel ? "pl-6" : ""}`}>
                              <span className="text-3xl">{opt.emoji}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`font-bold text-base ${sel ? "text-[#E8E4D8]" : "text-[#F0EDE6]"}`}>{opt.label}</span>
                                  {opt.badge && !sel && (
                                    <span className="text-xs font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">{opt.badge}</span>
                                  )}
                                  {sel && <span className="ml-auto text-[#E8E4D8] text-lg">✓</span>}
                                </div>
                                <p className={`text-xs mt-0.5 ${sel ? "text-[#E8E4D8]/80" : "text-[#8FAF96]/70"}`}>{opt.sub}</p>
                                <div className="flex gap-1 mt-2">
                                  {Array.from({ length: 7 }).map((_, i) => (
                                    <div key={i} className="w-2.5 h-2.5 rounded-full transition-all duration-300"
                                      style={{ background: i < opt.dots ? (sel ? "#E8E4D8" : "#5C7A5F") : "rgba(46,107,64,0.2)" }} />
                                  ))}
                                </div>
                                <p className={`text-xs mt-1 ${sel ? "text-[#E8E4D8]/60" : "text-[#8FAF96]/50"}`}>
                                  {t("moment_new.bcp_frequency.offices_per_week", { count: opt.dots })}
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {/* Dynamic message */}
                    {bcpFreqType && freqOpt && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="text-sm text-[#5C7A5F] font-medium italic text-center py-2">
                        {freqOpt.message}
                      </motion.p>
                    )}
                  </div>
                );
              })()}

              {/* ── BCP: Which days ─────────────────────────────────── */}
              {step === "bcp-days" && (() => {
                const freqOpt = BCP_FREQ_OPTIONS.find(f => f.id === bcpFreqType);
                const requiredDays = freqOpt?.daysPerWeek ?? 0;
                const chosen = bcpPracticeDays.length;
                return (
                  <div className="flex-1 space-y-6">
                    <div>
                      <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>
                        {t("moment_new.bcp_days.title")} 🌿
                      </h2>
                      <p className="text-sm italic" style={{ color: "#8FAF96" }}>
                        {t("moment_new.bcp_days.choose_days", { count: requiredDays })}
                      </p>
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      {WEEK_DAYS.map(d => {
                        const sel = bcpPracticeDays.includes(d.id);
                        const atMax = chosen >= requiredDays && !sel;
                        return (
                          <button
                            key={d.id}
                            disabled={atMax}
                            onClick={() => {
                              if (sel) setBcpPracticeDays(prev => prev.filter(x => x !== d.id));
                              else if (!atMax) setBcpPracticeDays(prev => [...prev, d.id]);
                            }}
                            className="px-5 py-3 rounded-2xl text-sm font-semibold transition-all"
                            style={{
                              background: sel ? "#5C7A5F" : "rgba(200,212,192,0.08)",
                              color: sel ? "#F0EDE6" : "#8FAF96",
                              border: sel ? "1px solid rgba(46,107,64,0.6)" : "1px solid rgba(46,107,64,0.3)",
                              opacity: atMax ? 0.3 : 1,
                              cursor: atMax ? "not-allowed" : "pointer",
                            }}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                    {chosen > 0 && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="text-sm font-medium italic text-center"
                        style={{ color: "#5C7A5F" }}
                      >
                        {chosen === requiredDays
                          ? t("moment_new.bcp_days.well_chosen", { days: bcpPracticeDays.map(d => WEEK_DAYS.find(w => w.id === d)?.label).join(", ") })
                          : t("moment_new.bcp_days.more_to_go", { count: requiredDays - chosen })}
                      </motion.p>
                    )}
                  </div>
                );
              })()}

              {/* ── BCP: When will you pray? ──────────────────────────── */}
              {step === "bcp-time" && (() => {
                const isMorning = templateId === "morning-prayer";
                const BCP_TIME_SLOTS: { id: "early-morning" | "morning" | "late-afternoon" | "evening"; emoji: string; label: string; sub: string; defaultH: number; defaultAmPm: "AM" | "PM" }[] = [
                  { id: "early-morning", emoji: "🌄", label: t("moment_new.time_of_day.early_morning.label"), sub: "5am – 8am", defaultH: 6, defaultAmPm: "AM" },
                  { id: "morning",       emoji: "🌅", label: t("moment_new.time_of_day.morning.label"),       sub: "8am – 11am", defaultH: 8, defaultAmPm: "AM" },
                  { id: "late-afternoon",emoji: "🌇", label: t("moment_new.time_of_day.late_afternoon.label"), sub: "4pm – 7pm", defaultH: 5, defaultAmPm: "PM" },
                  { id: "evening",       emoji: "🌆", label: t("moment_new.time_of_day.evening.label"),       sub: "7pm – 10pm", defaultH: 8, defaultAmPm: "PM" },
                ];
                return (
                  <div className="flex-1 space-y-5">
                    <div>
                      <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>
                        {t("moment_new.bcp_time.title")} 🌿
                      </h2>
                      <p className="text-sm italic" style={{ color: "#8FAF96" }}>
                        {t("moment_new.bcp_time.subtitle")}
                      </p>
                    </div>
                    <div className="space-y-2.5">
                      {BCP_TIME_SLOTS.map(slot => {
                        const sel = bcpTimeSlot === slot.id;
                        return (
                          <button
                            key={slot.id}
                            onClick={() => {
                              setBcpTimeSlot(slot.id);
                              setBcpPersonalHour(slot.defaultH);
                              setBcpPersonalAmPm(slot.defaultAmPm);
                            }}
                            className="w-full text-left rounded-2xl transition-all active:scale-[0.99]"
                            style={{
                              background: sel ? "#1A4A2E" : "#0F2818",
                              border: `1.5px solid ${sel ? "rgba(46,107,64,0.7)" : "rgba(46,107,64,0.3)"}`,
                            }}
                          >
                            <div className="flex items-center gap-4 px-5 py-4">
                              <span className="text-3xl leading-none shrink-0">{slot.emoji}</span>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-[15px] leading-snug" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                                  {slot.label}
                                </p>
                                <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>{slot.sub}</p>
                              </div>
                              {sel && <span className="font-bold text-base" style={{ color: "#C8D4C0" }}>✓</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {bcpTimeSlot && (
                      <div className="rounded-2xl px-4 py-3 space-y-2" style={{ background: "rgba(200,212,192,0.06)", border: "1px solid rgba(46,107,64,0.25)" }}>
                        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#8FAF96" }}>{t("moment_new.bcp_time.exact_time")}</p>
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1">
                            {TOD_CONSTRAINTS[bcpTimeSlot]?.hours.map(h => (
                              <button
                                key={h}
                                onClick={() => setBcpPersonalHour(h)}
                                className="w-10 h-10 rounded-xl text-sm font-semibold transition-all"
                                style={{
                                  background: bcpPersonalHour === h ? "#2D5E3F" : "rgba(200,212,192,0.08)",
                                  color: bcpPersonalHour === h ? "#F0EDE6" : "#8FAF96",
                                  border: bcpPersonalHour === h ? "1px solid rgba(46,107,64,0.6)" : "1px solid rgba(46,107,64,0.2)",
                                }}
                              >
                                {h > 12 ? h - 12 : h === 0 ? 12 : h}
                              </button>
                            ))}
                          </div>
                          {TOD_CONSTRAINTS[bcpTimeSlot]?.amPm === "mixed" && (
                            <div className="flex gap-1">
                              {(["AM", "PM"] as ("AM"|"PM")[]).map(ap => (
                                <button
                                  key={ap}
                                  onClick={() => setBcpPersonalAmPm(ap)}
                                  className="px-3 h-10 rounded-xl text-sm font-semibold transition-all"
                                  style={{
                                    background: bcpPersonalAmPm === ap ? "#2D5E3F" : "rgba(200,212,192,0.08)",
                                    color: bcpPersonalAmPm === ap ? "#F0EDE6" : "#8FAF96",
                                    border: bcpPersonalAmPm === ap ? "1px solid rgba(46,107,64,0.6)" : "1px solid rgba(46,107,64,0.2)",
                                  }}
                                >
                                  {ap}
                                </button>
                              ))}
                            </div>
                          )}
                          <p className="text-sm font-medium" style={{ color: "#C8D4C0" }}>
                            {bcpPersonalHour > 12 ? bcpPersonalHour - 12 : bcpPersonalHour === 0 ? 12 : bcpPersonalHour}:00 {bcpPersonalAmPm}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── BCP: Invite ──────────────────────────────────────── */}
              {step === "bcp-invite" && (() => {
                const isMorning = templateId === "morning-prayer";
                return (
                  <div className="flex-1 space-y-5">
                    <div>
                      <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>{t("moment_new.bcp_invite.title")} 🌿</h2>
                      <p className="text-sm text-muted-foreground italic">
                        {t("moment_new.bcp_invite.subtitle_line1")}<br />
                        {isMorning ? t("moment_new.bcp_invite.subtitle_line2_morning") : t("moment_new.bcp_invite.subtitle_line2_evening")}
                      </p>
                    </div>
                    {/* Autofill from existing connections */}
                    {bcpConnections.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">{t("moment_new.bcp_invite.from_connections")} 🌿</p>
                        {bcpConnections.map((c, i) => (
                          <div key={i} className="flex items-center justify-between bg-secondary/30 border border-border/60 rounded-xl px-4 py-3">
                            <div>
                              <p className="text-sm font-medium text-foreground">{c.name}</p>
                              <p className="text-xs text-muted-foreground">{c.email}</p>
                            </div>
                            <button onClick={() => setBcpConnections(prev => prev.map((x, j) => j === i ? { ...x, invited: !x.invited } : x))}
                              className={`text-sm font-medium rounded-full px-4 py-1.5 transition-all ${
                                c.invited ? "bg-[#5C7A5F] text-white" : "border border-[#5C7A5F] text-[#5C7A5F] hover:bg-[#5C7A5F]/10"
                              }`}>
                              {c.invited ? `${t("moment_new.bcp_invite.invited")} ✓` : t("moment_new.bcp_invite.invite_cta")}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Manual invite */}
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">{t("moment_new.bcp_invite.invite_by_email")}</p>
                      {bcpParticipants.map((p, i) => (
                        <div key={i} className="flex gap-2">
                          <input type="text" value={p.name} onChange={e => setBcpParticipants(prev => { const n = [...prev]; n[i] = { ...n[i], name: e.target.value }; return n; })}
                            placeholder={t("moment_new.field.name")} className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:border-[#5C7A5F] focus:outline-none" />
                          <input type="email" value={p.email} onChange={e => setBcpParticipants(prev => { const n = [...prev]; n[i] = { ...n[i], email: e.target.value }; return n; })}
                            placeholder={t("moment_new.field.email")} className="flex-[1.5] px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:border-[#5C7A5F] focus:outline-none" />
                          {bcpParticipants.length > 1 && (
                            <button onClick={() => setBcpParticipants(prev => prev.filter((_, j) => j !== i))}
                              className="text-muted-foreground hover:text-destructive px-2">×</button>
                          )}
                        </div>
                      ))}
                      {bcpParticipants.length < 10 && (
                        <button onClick={() => setBcpParticipants(prev => [...prev, { name: "", email: "" }])}
                          className="text-sm text-[#5C7A5F] hover:text-[#4a6b50] transition-colors">
                          {t("moment_new.add_another_person")}
                        </button>
                      )}
                    </div>
                    {/* BCP info card */}
                    <div className="rounded-2xl p-4 space-y-1" style={{ background: "rgba(200,212,192,0.08)", border: "1px solid rgba(46,107,64,0.35)" }}>
                      <p className="text-sm font-semibold" style={{ color: "#C8D4C0" }}>📖 {isMorning ? t("moment_new.bcp_invite.about_morning") : t("moment_new.bcp_invite.about_evening")}</p>
                      <p className="text-sm" style={{ color: "#8FAF96" }}>
                        {isMorning ? t("moment_new.bcp_invite.duration_morning") : t("moment_new.bcp_invite.duration_evening")}<br />
                        {t("moment_new.bcp_invite.begins_on_page", { page: isMorning ? "75" : "115" })}
                      </p>
                      <a href={isMorning ? "https://bcponline.org/DailyOffice/mp2.html" : "https://bcponline.org/DailyOffice/ep2.html"}
                        target="_blank" rel="noopener noreferrer"
                        className="text-sm underline underline-offset-2 block" style={{ color: "#8FAF96" }}>
                        {t("moment_new.bcp_invite.no_bcp")} {isMorning ? "bcponline.org/DailyOffice/mp2.html" : "bcponline.org/DailyOffice/ep2.html"}
                      </a>
                      <p className="text-xs italic mt-1" style={{ color: "rgba(143,175,150,0.7)" }}>{t("moment_new.bcp_invite.together_in_spirit")}</p>
                    </div>
                    {bcpPlantMutation.isError && (
                      <p className="text-xs text-destructive text-center">{t("moment_new.error_generic")}</p>
                    )}
                  </div>
                );
              })()}

              {/* ── Name ───────────────────────────────────────────── */}
              {step === "name" && (
                <div className="space-y-6 flex-1">
                  <div>
                    <h2 className="text-3xl font-semibold mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>{t("moment_new.name.title")}</h2>
                    <p className="text-muted-foreground text-sm">{t("moment_new.name.subtitle")}</p>
                  </div>
                  <input autoFocus type="text" value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && canNext() && goNext()}
                    placeholder={t("moment_new.name.placeholder")}
                    className="w-full text-xl md:text-2xl px-0 py-4 bg-transparent border-b-2 border-border focus:border-[#5C7A5F] focus:outline-none transition-colors placeholder:text-muted-foreground/40"
                  />
                </div>
              )}

              {/* ── Intention ──────────────────────────────────────── */}
              {step === "intention" && selectedBcpPrayer ? (
                <div className="space-y-5 flex-1">
                  <div>
                    <h2 className="text-2xl font-bold mb-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>
                      {t("moment_new.intention_bcp.title")} 🙏🏽
                    </h2>
                    <p className="text-sm leading-relaxed" style={{ color: "#8FAF96" }}>
                      {t("moment_new.intention_bcp.subtitle")}
                    </p>
                  </div>
                  {/* The BCP prayer itself, shown by default. */}
                  <div style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.35)", borderRadius: "16px", padding: "16px 18px" }}>
                    <p className="text-sm italic leading-[1.85] font-serif" style={{ color: "#C8D4C0" }}>{selectedBcpPrayer.text}</p>
                    <p className="text-xs mt-3" style={{ color: "rgba(143,175,150,0.5)" }}>{t("moment_new.from_bcp")}</p>
                  </div>
                  {/* Optional specific intention — hidden behind a pill. */}
                  {showSpecificIntention ? (
                    <div className="relative">
                      <textarea autoFocus value={intention}
                        onChange={e => setIntention(e.target.value.slice(0, 200))}
                        rows={3}
                        placeholder={t("moment_new.intention_bcp.placeholder")}
                        className="w-full px-4 py-4 rounded-2xl resize-none text-base focus:outline-none transition-colors"
                        style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.4)", color: "#F0EDE6" }}
                      />
                      {intention.length > 150 && (
                        <p className="text-right text-xs mt-1" style={{ color: "rgba(143,175,150,0.5)" }}>{intention.length}/200</p>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowSpecificIntention(true)}
                      className="w-full flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold transition-colors"
                      style={{ background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.45)", color: "#C8D4C0" }}
                    >
                      <span aria-hidden>✍🏽</span>
                      {t("moment_new.intention_bcp.add_specific", { defaultValue: "Add a specific intention" })}
                    </button>
                  )}
                </div>
              ) : step === "intention" && templateId === "intercession" && intercessionSource === "custom" ? (
                <div className="space-y-8 flex-1">
                  <div>
                    <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>
                      {t("moment_new.intention_custom.title_intercession")} 🙏🏽
                    </h2>
                    <p className="text-sm leading-relaxed" style={{ color: "#8FAF96" }}>
                      {t("moment_new.intention_custom.subtitle_intercession")}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold uppercase tracking-widest" style={{ color: "#8FAF96" }}>{t("moment_new.intention_custom.title_label")}</label>
                    <input autoFocus type="text" value={intention}
                      onChange={e => setIntention(e.target.value.slice(0, 120))}
                      placeholder={t("moment_new.intention_custom.title_ph")}
                      className="w-full px-4 py-3 rounded-2xl text-base focus:outline-none transition-colors"
                      style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.4)", color: "#F0EDE6" }}
                    />
                    {intention.length > 80 && (
                      <p className="text-right text-xs" style={{ color: "rgba(143,175,150,0.5)" }}>{intention.length}/120</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-semibold uppercase tracking-widest" style={{ color: "#8FAF96" }}>{t("moment_new.intention_custom.prayer_label")}</label>
                    <textarea value={intercessionFullText}
                      onChange={e => setIntercessionFullText(e.target.value)}
                      rows={6}
                      placeholder={t("moment_new.intention_custom.prayer_ph")}
                      className="w-full px-4 py-3 rounded-2xl resize-none text-base leading-relaxed focus:outline-none transition-colors font-serif italic"
                      style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.4)", color: "#F0EDE6" }}
                    />
                  </div>

                  {/* Optional article / "learn more" link — hidden behind an
                      "Add article" button. Same feature as prayer feeds: the
                      server scrapes the article's title to show with it. */}
                  {showArticleLink ? (
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold uppercase tracking-widest" style={{ color: "#8FAF96" }}>
                        {t("moment_new.intention_custom.learn_more_label", { defaultValue: "Article link" })}
                      </label>
                      <input autoFocus type="url" value={actionLearnMoreUrl}
                        onChange={e => setActionLearnMoreUrl(e.target.value.slice(0, 500))}
                        placeholder="https://…"
                        className="w-full px-4 py-3 rounded-2xl text-base focus:outline-none transition-colors"
                        style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.4)", color: "#F0EDE6" }}
                      />
                      <p className="text-xs" style={{ color: "rgba(143,175,150,0.55)" }}>
                        {t("moment_new.intention_custom.learn_more_hint", { defaultValue: "Paste a link — we'll pull in the article's title for everyone praying." })}
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowArticleLink(true)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-colors"
                      style={{ background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.45)", color: "#C8D4C0" }}
                    >
                      <span aria-hidden>🔗</span>
                      {t("moment_new.intention_custom.add_article", { defaultValue: "Add article" })}
                    </button>
                  )}
                </div>
              ) : step === "intention" && (
                <div className="space-y-6 flex-1">
                  <div>
                    <h2 className="text-3xl font-semibold mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>{t("moment_new.intention.title")}</h2>
                    <p className="text-muted-foreground text-sm">{t("moment_new.intention.subtitle")}</p>
                  </div>
                  <textarea autoFocus value={intention}
                    onChange={e => setIntention(e.target.value)}
                    maxLength={280} rows={3}
                    placeholder={t("moment_new.intention.placeholder")}
                    className="w-full px-0 py-3 bg-transparent border-b-2 border-border focus:border-[#5C7A5F] focus:outline-none transition-colors resize-none text-lg placeholder:text-muted-foreground/40 font-serif italic"
                  />
                  <p className="text-right text-xs text-muted-foreground/50">{intention.length}/280</p>
                </div>
              )}

              {/* ── Logging type ───────────────────────────────────── */}
              {step === "logging" && templateId === "intercession" && intercessionSource === "custom" ? (
                <div className="space-y-6 flex-1">
                  <div>
                    <h2 className="text-2xl font-semibold mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>{t("moment_new.logging_intercession.title")} 🌿</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {t("moment_new.logging_intercession.subtitle")}
                    </p>
                  </div>
                  <input autoFocus type="text" value={reflectionPrompt}
                    onChange={e => setReflectionPrompt(e.target.value)}
                    className="w-full px-0 py-3 bg-transparent border-b-2 border-border focus:border-[#5C7A5F] focus:outline-none transition-colors text-base"
                  />
                  <div className="flex flex-wrap gap-2">
                    {[
                      t("moment_new.prompt_default.on_your_heart"),
                      t("moment_new.prompt_chip.bringing_to_prayer"),
                      t("moment_new.prompt_chip.god_stirring"),
                      t("moment_new.prompt_chip.want_to_offer"),
                    ].map(chip => (
                      <button key={chip} onClick={() => setReflectionPrompt(chip)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                          reflectionPrompt === chip
                            ? "border-[#5C7A5F] bg-[#5C7A5F]/10 text-[#5C7A5F]"
                            : "border-border text-muted-foreground hover:border-[#5C7A5F]/40"
                        }`}>
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              ) : step === "logging" && (
                <div className="space-y-5 flex-1">
                  <div>
                    <h2 className="text-2xl font-semibold mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>{t("moment_new.logging.title")} 🌿</h2>
                    <p className="text-sm text-muted-foreground">{t("moment_new.logging.subtitle")}</p>
                  </div>
                  <div className="grid gap-3">
                    {LOGGING_OPTIONS.map(opt => (
                      <button key={opt.type} onClick={() => setLoggingType(opt.type)}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all ${loggingType === opt.type ? "border-[#5C7A5F] bg-[#5C7A5F]/5" : "border-border hover:border-[#5C7A5F]/30"}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{opt.icon}</span>
                          <div className="flex-1">
                            <p className="font-medium text-foreground text-sm">{opt.label}</p>
                            <p className="text-xs text-muted-foreground">{opt.description}</p>
                          </div>
                          {loggingType === opt.type && <span className="text-[#5C7A5F]">✓</span>}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Reflection prompt */}
                  {(loggingType === "reflection" || loggingType === "both") && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                      <label className="block text-sm font-medium text-foreground mb-2">{t("moment_new.logging.reflection_prompt_label")}</label>
                      <input autoFocus type="text" value={reflectionPrompt}
                        onChange={e => setReflectionPrompt(e.target.value)}
                        placeholder={t("moment_new.logging.reflection_prompt_ph")}
                        className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-[#5C7A5F] focus:ring-1 focus:ring-[#5C7A5F] focus:outline-none"
                      />
                    </motion.div>
                  )}
                </div>
              )}

              {/* ── Schedule ───────────────────────────────────────── */}
              {step === "schedule" && (
                <div className="space-y-6 flex-1">
                  <div>
                    <h2 className="text-2xl font-bold mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>
                      {t("moment_new.schedule.title")} 🌿
                    </h2>
                    <p className="text-sm" style={{ color: "#8FAF96" }}>{t("moment_new.schedule.subtitle")}</p>
                  </div>

                  {/* Frequency */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#8FAF96" }}>{t("moment_new.schedule.how_often")}</label>
                    <div className="flex gap-3">
                      {(["daily", "weekly"] as Frequency[]).map(f => (
                        <button key={f} onClick={() => { setFrequency(f); setScheduledDays([]); }}
                          className={`flex-1 py-3 rounded-xl font-semibold text-sm capitalize transition-all ${frequency === f ? "animate-turn-pulse" : ""}`}
                          style={frequency === f
                            ? { background: "#1A4A2E", color: "#F0EDE6", border: "1px solid rgba(46,107,64,0.65)" }
                            : { background: "rgba(200,212,192,0.06)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.3)" }}>
                          {f === "daily" ? t("moment_new.schedule.every_day") : t("moment_new.schedule.once_a_week")}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Day picker for weekly */}
                  {frequency === "weekly" && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                      <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#8FAF96" }}>
                        {templateId === "intercession" ? t("moment_new.schedule.which_day") : t("moment_new.schedule.which_days")}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {[[t("moment_new.weekday_short.mo"),"MO"],[t("moment_new.weekday_short.tu"),"TU"],[t("moment_new.weekday_short.we"),"WE"],[t("moment_new.weekday_short.th"),"TH"],[t("moment_new.weekday_short.fr"),"FR"],[t("moment_new.weekday_short.sa"),"SA"],[t("moment_new.weekday_short.su"),"SU"]].map(([label, val]) => (
                          <button key={val}
                            onClick={() => templateId === "intercession"
                              ? setScheduledDays([val])
                              : setScheduledDays(prev => prev.includes(val) ? prev.filter(d => d !== val) : [...prev, val])
                            }
                            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${scheduledDays.includes(val) ? "animate-turn-pulse" : ""}`}
                            style={scheduledDays.includes(val)
                              ? { background: "#1A4A2E", color: "#F0EDE6", border: "1px solid rgba(46,107,64,0.65)" }
                              : { background: "rgba(200,212,192,0.06)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.3)" }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Length — how long the intention stays before the
                      community. Sits under "How often" (time of day was
                      dropped; the intention runs all day on the calendar). */}
                  {templateId === "intercession" && (
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#8FAF96" }}>
                        {t("moment_new.duration.length_label", { defaultValue: "Length" })}
                      </label>
                      <DrumPicker
                        value={frequency === "weekly"
                          ? (practiceDurationDays ?? 7)
                          : ((practiceDurationDays && practiceDurationDays >= 1 && practiceDurationDays <= 14) ? practiceDurationDays : 7)}
                        onChange={(v) => setPracticeDurationDays(v)}
                        options={frequency === "weekly"
                          ? [
                              { value: 7,  label: t("moment_new.duration.w1.label", { defaultValue: "1 week" }) },
                              { value: 14, label: t("moment_new.duration.w2.label", { defaultValue: "2 weeks" }) },
                              { value: 28, label: t("moment_new.duration.w4.label", { defaultValue: "4 weeks" }) },
                              { value: 0,  label: t("moment_new.duration.ongoing.label", { defaultValue: "Ongoing" }) },
                            ]
                          : Array.from({ length: 14 }, (_, i) => i + 1).map((d) => ({
                              value: d,
                              label: t("moment_new.duration.n_days", { count: d, defaultValue: d === 1 ? "1 day" : `${d} days` }),
                            }))}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* ── Duration (for intercession and fasting) ──────── */}
              {step === "duration" && (() => {
                const isFastingFlow = templateId === "fasting";
                // Fasting is always weekly; intercession can be daily or weekly
                const useWeeks = isFastingFlow || frequency === "weekly";

                type DurationOpt = { days: number; emoji: string; label: string; sub: string };
                const durationOptions: DurationOpt[] = [
                  { days: 7,  emoji: "🌱", label: t("moment_new.duration.w1.label"),  sub: t("moment_new.duration.w1.sub") },
                  { days: 14, emoji: "🌿", label: t("moment_new.duration.w2.label"),  sub: t("moment_new.duration.w2.sub") },
                  { days: 28, emoji: "🌳", label: t("moment_new.duration.w4.label"),  sub: t("moment_new.duration.w4.sub") },
                  { days: 0,  emoji: "✨", label: t("moment_new.duration.ongoing.label"), sub: t("moment_new.duration.ongoing.sub") },
                ];

                const title = isFastingFlow
                  ? `${t("moment_new.duration.title_fasting")} 🌾`
                  : `${t("moment_new.duration.title_intercession")} 🙏🏽`;
                const subtitle = isFastingFlow
                  ? t("moment_new.duration.subtitle_fasting")
                  : t("moment_new.duration.subtitle_intercession");

                // Daily intercessions: a plain length dropdown (1–14 days)
                // instead of the old 3-/7-day "goal" cards — the question is
                // simply how long the intention stays before the community.
                if (!useWeeks) {
                  const selDays = practiceDurationDays && practiceDurationDays >= 1 && practiceDurationDays <= 14
                    ? practiceDurationDays
                    : 7;
                  return (
                    <div className="flex-1 flex flex-col gap-4">
                      <div>
                        <h2 className="text-[1.6rem] font-bold leading-tight mb-1"
                          style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>
                          {title}
                        </h2>
                        <p className="text-sm italic" style={{ color: "#8FAF96" }}>
                          {subtitle}
                        </p>
                      </div>
                      <div
                        className="rounded-2xl px-5 pt-4 pb-3"
                        style={{ background: "#0F2818", border: "1.5px solid rgba(46,107,64,0.5)" }}
                      >
                        <span className="flex items-center gap-3 min-w-0 mb-3">
                          <span className="text-2xl leading-none shrink-0">🕊️</span>
                          <span className="font-bold text-[15px]"
                            style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>
                            {t("moment_new.duration.length_label", { defaultValue: "Length" })}
                          </span>
                        </span>
                        <DrumPicker
                          value={selDays}
                          onChange={(v) => setPracticeDurationDays(v)}
                          options={Array.from({ length: 14 }, (_, i) => i + 1).map((d) => ({
                            value: d,
                            label: t("moment_new.duration.n_days", { count: d, defaultValue: d === 1 ? "1 day" : `${d} days` }),
                          }))}
                        />
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="flex-1 flex flex-col gap-4">
                    <div>
                      <h2 className="text-[1.6rem] font-bold leading-tight mb-1"
                        style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>
                        {title}
                      </h2>
                      <p className="text-sm italic" style={{ color: "#8FAF96" }}>
                        {subtitle}
                      </p>
                    </div>
                    <div className="space-y-2.5">
                      {durationOptions.map(opt => {
                        const sel = practiceDurationDays === opt.days;
                        return (
                          <motion.button
                            key={opt.days}
                            onClick={() => setPracticeDurationDays(opt.days)}
                            animate={{ y: sel ? -2 : 0 }}
                            transition={{ duration: 0.15 }}
                            className={`relative w-full text-left rounded-2xl overflow-hidden transition-all duration-200 ${sel ? "animate-turn-pulse" : ""}`}
                            style={{
                              background: sel ? "#1A4A2E" : "#0F2818",
                              border: `1.5px solid ${sel ? "rgba(46,107,64,0.7)" : "rgba(46,107,64,0.3)"}`,
                              boxShadow: sel ? "0 4px 14px rgba(45,94,63,0.3)" : undefined,
                            }}
                          >
                            {sel && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.6 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="absolute top-3 right-3 font-bold text-base"
                                style={{ color: "#C8D4C0" }}
                              >✓</motion.div>
                            )}
                            <div className="flex items-center gap-4 px-5 py-4">
                              <span className="text-3xl leading-none shrink-0">{opt.emoji}</span>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-[15px] leading-snug"
                                  style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>
                                  {opt.label}
                                </p>
                                <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
                                  {opt.sub}
                                </p>
                              </div>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* ── Invite ─────────────────────────────────────────── */}
              {step === "invite" && templateId === "lectio-divina" && (
                <div className="space-y-5 flex-1">
                  <div>
                    <h2 className="text-xl font-semibold mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>{t("moment_new.invite_lectio.title")} 📜</h2>
                    <p className="text-sm text-muted-foreground">
                      {t("moment_new.invite_lectio.subtitle")}
                    </p>
                  </div>
                  <InviteStep type="practice" onPeopleChange={setInvitedPeople} />
                </div>
              )}
              {step === "invite" && templateId !== "lectio-divina" && (
                <div className="space-y-5 flex-1">
                  <div>
                    <h2 className="text-xl font-semibold mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>{t("moment_new.invite_community.title")} 🌿</h2>
                    <p className="text-sm text-muted-foreground">
                      {selectedGroupId ? t("moment_new.invite_community.subtitle_selected") : t("moment_new.invite_community.subtitle_unselected")}
                    </p>
                  </div>

                  {/* No admin groups — prompt to create one */}
                  {adminGroups.length === 0 && (
                    <div
                      className="rounded-2xl px-5 py-5 space-y-3"
                      style={{ background: "rgba(200,212,192,0.06)", border: "1px solid rgba(46,107,64,0.3)" }}
                    >
                      <p className="text-sm font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                        {t("moment_new.invite_community.need_community_title")} 🌿
                      </p>
                      <p className="text-sm leading-relaxed" style={{ color: "#8FAF96" }}>
                        {t("moment_new.invite_community.need_community_body")}
                      </p>
                      <a
                        href="/tradition/new"
                        className="inline-block mt-1 text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors"
                        style={{ background: "#2D5E3F", color: "#F0EDE6", textDecoration: "none" }}
                      >
                        {t("moment_new.invite_community.create_community_cta")} →
                      </a>
                    </div>
                  )}

                  {/* Community selector */}
                  {adminGroups.length > 0 && (
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold uppercase tracking-widest" style={{ color: "#8FAF96" }}>
                        {t("moment_new.invite_community.community_label")}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {adminGroups.map(g => (
                          <button
                            key={g.id}
                            onClick={() => setSelectedGroupId(g.id)}
                            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${selectedGroupId === g.id ? "animate-turn-pulse" : ""}`}
                            style={selectedGroupId === g.id
                              ? { background: "#1A4A2E", color: "#F0EDE6", border: "1px solid rgba(46,107,64,0.65)" }
                              : { background: "rgba(200,212,192,0.06)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.3)" }}
                          >
                            {g.emoji ? `${g.emoji} ` : ""}{g.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Additional-groups multi-select (intercessions only).
                      Lets one intercession be shared with multiple
                      communities so members of each see it on their
                      community page. Only admins of the extra group can
                      attach — we filter the picker to admin-of groups
                      that aren't the primary. */}
                  {templateId === "intercession" && selectedGroupId !== null
                    && adminGroups.filter(g => g.id !== selectedGroupId).length > 0 && (
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold uppercase tracking-widest" style={{ color: "#8FAF96" }}>
                        {t("moment_new.invite_community.also_share_label")}
                      </label>
                      <p className="text-xs" style={{ color: "rgba(143,175,150,0.55)" }}>
                        {t("moment_new.invite_community.also_share_hint")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {adminGroups.filter(g => g.id !== selectedGroupId).map(g => {
                          const on = additionalGroupIds.includes(g.id);
                          return (
                            <button
                              key={g.id}
                              onClick={() => setAdditionalGroupIds(ids =>
                                on ? ids.filter(id => id !== g.id) : [...ids, g.id]
                              )}
                              className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                              style={on
                                ? { background: "#1A4A2E", color: "#F0EDE6", border: "1px solid rgba(46,107,64,0.65)" }
                                : { background: "rgba(200,212,192,0.06)", color: "#8FAF96", border: "1px dashed rgba(46,107,64,0.3)" }}
                            >
                              {on ? "✓ " : "+ "}{g.emoji ? `${g.emoji} ` : ""}{g.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Contemplative Prayer — duration selection ────── */}
              {step === "contemplative-duration" && (
                <div className="flex-1">
                  <h2 className="text-2xl font-semibold mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>{t("moment_new.contemplative.title")} 🕯️</h2>
                  <p className="text-sm text-muted-foreground italic mb-6">{t("moment_new.contemplative.subtitle")}</p>
                  <div className="grid gap-3">
                    {([
                      { emoji: "🌱", label: t("moment_new.contemplative.m5.label"), sub: t("moment_new.contemplative.m5.sub"), mins: 5 },
                      { emoji: "🌿", label: t("moment_new.contemplative.m10.label"), sub: t("moment_new.contemplative.m10.sub"), mins: 10 },
                      { emoji: "🌸", label: t("moment_new.contemplative.m20.label"), sub: t("moment_new.contemplative.m20.sub"), mins: 20 },
                      { emoji: "🌳", label: t("moment_new.contemplative.m30.label"), sub: t("moment_new.contemplative.m30.sub"), mins: 30 },
                    ] as const).map(opt => (
                      <button key={opt.mins}
                        onClick={() => { setContemplativeDuration(opt.mins); goNext(); }}
                        className="w-full text-left p-4 rounded-2xl border border-border/60 hover:border-[#5C7A5F]/60 hover:bg-[#5C7A5F]/5 transition-all flex items-center gap-4 group">
                        <span className="text-3xl">{opt.emoji}</span>
                        <div>
                          <p className="font-semibold text-sm group-hover:text-[#4a6b50]">{opt.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{opt.sub}</p>
                        </div>
                        <span className="ml-auto text-muted-foreground/40 text-sm">→</span>
                      </button>
                    ))}
                    {contemplativeDuration === -1 ? (
                      <div className="p-4 rounded-2xl border-2 border-[#5C7A5F]/60 bg-[#5C7A5F]/5">
                        <p className="font-semibold text-sm text-[#4a6b50] mb-3">✨ {t("moment_new.contemplative.choose_own")}</p>
                        <div className="flex items-center gap-3">
                          <input type="number" min={1} max={60} value={customDurationInput}
                            onChange={e => setCustomDurationInput(e.target.value)}
                            className="w-20 px-3 py-2 rounded-xl border border-border text-center text-lg font-semibold bg-background" />
                          <span className="text-muted-foreground text-sm">{t("moment_new.contemplative.minutes")}</span>
                          <button
                            onClick={() => { const n = Math.max(1, Math.min(60, parseInt(customDurationInput) || 20)); setContemplativeDuration(n); goNext(); }}
                            className="ml-auto py-2 px-4 rounded-xl bg-[#5C7A5F] text-white text-sm font-semibold">
                            {t("moment_new.continue")} →
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setContemplativeDuration(-1)}
                        className="w-full text-left p-4 rounded-2xl border border-border/60 hover:border-[#5C7A5F]/60 hover:bg-[#5C7A5F]/5 transition-all flex items-center gap-4 group">
                        <span className="text-3xl">✨</span>
                        <div>
                          <p className="font-semibold text-sm group-hover:text-[#4a6b50]">{t("moment_new.contemplative.choose_own")}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{t("moment_new.contemplative.choose_own_sub")}</p>
                        </div>
                        <span className="ml-auto text-muted-foreground/40 text-sm">→</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ── Fasting — what are you fasting from ─────────── */}

              {/* ── Fasting — type selection (meat vs custom) ────── */}
              {step === "fasting-type" && (
                <div className="flex-1">
                  <h2 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {t("moment_new.fasting_type.title")} ✦
                  </h2>
                  <p className="text-sm mb-8" style={{ color: "#8FAF96" }}>
                    {t("moment_new.fasting_type.subtitle")}
                  </p>

                  {!fastingTypeChoice && (
                    <div className="space-y-3">
                      {/* Meat fast — featured */}
                      <button
                        onClick={() => {
                          setFastingTypeChoice("meat");
                          setFastingFrom("meat");
                          setFastingFrequency("weekly");
                          setFastingIntention(t("moment_new.fasting_meat_intention"));
                          setStep("fasting-when");
                        }}
                        className="w-full text-left rounded-2xl transition-all hover:shadow-md active:scale-[0.99]"
                        style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.5)" }}
                      >
                        <div className="px-5 py-4">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">🌿</span>
                            <p className="font-bold text-[15px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                              {t("moment_new.fasting_type.meat_title")}
                            </p>
                          </div>
                          <p className="text-[13px] leading-relaxed" style={{ color: "#8FAF96" }}>
                            {t("moment_new.fasting_type.meat_desc")}
                          </p>
                        </div>
                      </button>

                      {/* Custom fast */}
                      <button
                        onClick={() => setFastingTypeChoice("custom")}
                        className="w-full text-left rounded-2xl transition-all hover:shadow-md active:scale-[0.99]"
                        style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.35)" }}
                      >
                        <div className="px-5 py-4">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">✦</span>
                            <p className="font-bold text-[15px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                              {t("moment_new.fasting_type.custom_title")}
                            </p>
                          </div>
                          <p className="text-[13px] leading-relaxed" style={{ color: "#8FAF96" }}>
                            {t("moment_new.fasting_type.custom_desc")}
                          </p>
                        </div>
                      </button>
                    </div>
                  )}

                  {/* Custom fast — inline name/description fields */}
                  {fastingTypeChoice === "custom" && (
                    <div>
                      <button
                        onClick={() => setFastingTypeChoice(null)}
                        className="text-xs mb-4 flex items-center gap-1 transition-opacity hover:opacity-70"
                        style={{ color: "#8FAF96" }}
                      >
                        ← {t("moment_new.fasting_type.back_to_options")}
                      </button>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-semibold mb-2" style={{ color: "#C8D4C0" }}>
                            {t("moment_new.fasting_type.fast_name_label")}
                          </label>
                          <input
                            type="text"
                            value={customFastName}
                            onChange={e => setCustomFastName(e.target.value.slice(0, 80))}
                            placeholder={t("moment_new.fasting_type.fast_name_ph")}
                            autoFocus
                            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                            style={{
                              background: "rgba(200,212,192,0.06)",
                              border: "1px solid rgba(46,107,64,0.35)",
                              color: "#F0EDE6",
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold mb-2" style={{ color: "#C8D4C0" }}>
                            {t("moment_new.fasting_type.description_label")} <span style={{ color: "rgba(143,175,150,0.5)", fontWeight: 400 }}>{t("moment_new.optional")}</span>
                          </label>
                          <input
                            type="text"
                            value={customFastDescription}
                            onChange={e => setCustomFastDescription(e.target.value.slice(0, 140))}
                            placeholder={t("moment_new.fasting_type.description_ph")}
                            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                            style={{
                              background: "rgba(200,212,192,0.06)",
                              border: "1px solid rgba(46,107,64,0.35)",
                              color: "#F0EDE6",
                            }}
                          />
                        </div>
                        <button
                          onClick={() => {
                            if (customFastName.trim().length >= 2) {
                              setFastingFrom(customFastName.trim());
                              setFastingIntention(customFastDescription.trim());
                              setFastingFrequency("weekly");
                              setStep("fasting-when");
                            }
                          }}
                          disabled={customFastName.trim().length < 2}
                          className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-30"
                          style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                        >
                          {t("moment_new.continue")} →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === "fasting-what" && (
                <div className="flex-1 flex flex-col">
                  <h2 className="text-2xl font-semibold mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>{t("moment_new.fasting_what.title")} 🌿</h2>
                  <p className="text-sm text-muted-foreground italic mb-6">{t("moment_new.fasting_what.subtitle")}</p>
                  <textarea value={fastingFrom}
                    onChange={e => setFastingFrom(e.target.value.slice(0, 140))}
                    rows={3} autoFocus
                    className="w-full px-4 py-4 rounded-2xl border border-border focus:border-[#5C7A5F] focus:ring-1 focus:ring-[#5C7A5F] outline-none bg-background resize-none text-base leading-relaxed mb-2"
                  />
                  <p className="text-xs text-muted-foreground/60 italic mb-2">{t("moment_new.eg_example", { example: FASTING_FROM_EXAMPLES[fastingFromIdx] })}</p>
                  <span className="text-xs text-muted-foreground/40">{fastingFrom.length}/140</span>
                </div>
              )}

              {/* ── Fasting — why are you fasting ────────────────── */}
              {step === "fasting-why" && (
                <div className="flex-1 flex flex-col">
                  <h2 className="text-2xl font-semibold mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F0EDE6" }}>{t("moment_new.fasting_why.title")} 🙏🏽</h2>
                  <p className="text-sm text-muted-foreground italic mb-6">{t("moment_new.fasting_why.subtitle")}</p>
                  <textarea value={fastingIntention}
                    onChange={e => setFastingIntention(e.target.value.slice(0, 200))}
                    rows={4} autoFocus
                    className="w-full px-4 py-4 rounded-2xl border border-border focus:border-[#5C7A5F] focus:ring-1 focus:ring-[#5C7A5F] outline-none bg-background resize-none text-base leading-relaxed mb-2"
                  />
                  <p className="text-xs text-muted-foreground/60 italic mb-2">{t("moment_new.eg_example", { example: FASTING_INTENTION_EXAMPLES[fastingIntentionIdx] })}</p>
                  <span className="text-xs text-muted-foreground/40">{fastingIntention.length}/200</span>
                </div>
              )}

              {/* ── Fasting — when: which day of the week ─────── */}
              {step === "fasting-when" && (() => {
                const FAST_DAYS = [
                  { id: "monday", label: t("moment_new.weekday.mon") }, { id: "tuesday", label: t("moment_new.weekday.tue") }, { id: "wednesday", label: t("moment_new.weekday.wed") },
                  { id: "thursday", label: t("moment_new.weekday.thu") }, { id: "friday", label: t("moment_new.weekday.fri") }, { id: "saturday", label: t("moment_new.weekday.sat") }, { id: "sunday", label: t("moment_new.weekday.sun") },
                ];
                const fastDayNames: Record<string, string> = {
                  monday: t("moment_new.weekday_full.monday"),
                  tuesday: t("moment_new.weekday_full.tuesday"),
                  wednesday: t("moment_new.weekday_full.wednesday"),
                  thursday: t("moment_new.weekday_full.thursday"),
                  friday: t("moment_new.weekday_full.friday"),
                  saturday: t("moment_new.weekday_full.saturday"),
                  sunday: t("moment_new.weekday_full.sunday"),
                };
                const fastDayName = fastingDay ? (fastDayNames[fastingDay] ?? fastingDay) : "";
                return (
                  <div className="flex-1 flex flex-col">
                    <h2 className="text-2xl font-bold mb-2" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {t("moment_new.fasting_when.title")} 📅
                    </h2>
                    <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
                      {t("moment_new.fasting_when.subtitle")}
                    </p>
                    <div className="grid grid-cols-7 gap-1.5">
                      {FAST_DAYS.map(d => (
                        <button key={d.id} onClick={() => setFastingDay(d.id)}
                          className="py-2.5 rounded-xl text-sm font-semibold transition-all"
                          style={{
                            background: fastingDay === d.id ? "#2D5E3F" : "rgba(200,212,192,0.06)",
                            border: fastingDay === d.id ? "1px solid rgba(46,107,64,0.6)" : "1px solid rgba(46,107,64,0.25)",
                            color: fastingDay === d.id ? "#F0EDE6" : "#8FAF96",
                          }}>
                          {d.label}
                        </button>
                      ))}
                    </div>
                    {fastingDay === "friday" && (
                      <p className="text-xs italic mt-4 text-center leading-relaxed" style={{ color: "rgba(143,175,150,0.55)" }}>
                        {t("moment_new.fasting_when.friday_note")}
                      </p>
                    )}
                    {fastingDay && (
                      <p className="text-xs mt-3 text-center" style={{ color: "#8FAF96" }}>
                        {t("moment_new.fasting_when.every_day", { day: fastDayName })} 🌿
                      </p>
                    )}
                  </div>
                );
              })()}

            </motion.div>
          </AnimatePresence>
          </div>

          {/* ── Next button (sticky at bottom, not shown for template, daily-office-choice, intercession main, bcp-commitment, or contemplative-duration) ──
              The step container is sized at `100dvh - 160px`, but on
              iPhones with a home indicator `100dvh` extends into the
              gutter and clipped the bottom of the Next button. Pad the
              button container above env(safe-area-inset-bottom) so it
              always sits above the gutter without changing the layout
              on devices that don't have one. */}
          {step !== "template" && step !== "daily-office-choice" && step !== "intercession" && step !== "bcp-commitment" && step !== "contemplative-duration" && step !== "fasting-type" && (
            <div
              className="fixed left-0 right-0 bottom-0 z-40 border-t border-border/30 pt-3 px-4 sm:px-6 md:px-8"
              style={{
                background: "#091A10",
                // Float above the home indicator, and rise above the keyboard
                // when it's open (--kb-inset is set by the native shell; the
                // WebView doesn't resize, so we lift the bar ourselves).
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + var(--kb-inset, 0px) + 12px)",
              }}
            >
              <div className="max-w-2xl mx-auto w-full">
              {/* Disabled inline message for invite step */}
              {step === "invite" && showInviteDisabledMsg && invitedPeople.length === 0 && (
                <div className="mb-3 px-4 py-3 rounded-2xl bg-[#5C7A5F]/8 border border-[#5C7A5F]/20 text-center">
                  <p className="text-sm text-[#4a6b50] font-medium mb-1">🌿 {t("moment_new.invite_disabled.title")}</p>
                  <p className="text-xs text-[#4a6b50]/70 leading-relaxed">
                    {t("moment_new.invite_disabled.line1")}<br />
                    {t("moment_new.invite_disabled.line2")}<br />
                    {t("moment_new.invite_disabled.line3")}
                  </p>
                </div>
              )}
              <button
                onClick={() => goNext()}
                disabled={!canNext() || plantMutation.isPending || bcpPlantMutation.isPending}
                className={`w-full py-4 rounded-2xl text-base font-semibold transition-colors ${
                  !canNext() ? "cursor-not-allowed opacity-40" : ""
                }`}
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                {(plantMutation.isPending || bcpPlantMutation.isPending)
                  ? t("moment_new.cta.planting")
                  : step === "bcp-invite"
                    ? <>{t("moment_new.cta.plant_practice")} 🌿</>
                    : step === "invite"
                      ? templateId === "lectio-divina"
                        ? invitedPeople.length === 0
                          ? t("moment_new.cta.add_at_least_one")
                          : invitedPeople.length === 1
                            ? <>{t("moment_new.cta.plant_with_person", { name: invitedPeople[0].name || invitedPeople[0].email.split("@")[0] })} 📜</>
                            : <>{t("moment_new.cta.plant_with_people", { count: invitedPeople.length })} 📜</>
                        : selectedGroupId
                          ? <>{t("moment_new.cta.plant_for_community", { community: adminGroups.find(g => g.id === selectedGroupId)?.name ?? t("moment_new.cta.community_fallback") })} 🌿</>
                          : t("moment_new.cta.select_community")
                      : <>{t("moment_new.continue")} →</>}
              </button>
              {plantMutation.isError && (() => {
                const raw = plantMutation.error instanceof Error ? plantMutation.error.message : "";
                let friendly = t("moment_new.error_generic");
                if (raw) {
                  try {
                    const parsed = JSON.parse(raw);
                    friendly = typeof parsed?.message === "string" ? parsed.message
                      : typeof parsed?.error === "string" ? parsed.error
                      : raw;
                  } catch {
                    friendly = raw;
                  }
                }
                return (
                  <p className="text-xs text-destructive text-center mt-2">
                    {friendly}
                  </p>
                );
              })()}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
