import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, MessageCircle, MapPin, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

// ─── Palette (matches church-deck exactly) ───────────────────────────────────
const C = {
  bg: "#091A10",
  card: "#0F2818",
  text: "#F0EDE6",
  sage: "#8FAF96",
  font: "'Space Grotesk', sans-serif",
} as const;

// ─── Mock UI shell ────────────────────────────────────────────────────────────

function MockPhone({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[28px] md:rounded-[32px] p-4 md:p-5 mx-auto w-full max-w-[320px] md:max-w-[380px]"
      style={{
        background: "#091A10",
        border: "1px solid rgba(200,212,192,0.15)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(200,212,192,0.05)",
        margin: "0 auto",
      }}
    >
      {children}
    </div>
  );
}

// ─── Mock screens ─────────────────────────────────────────────────────────────

function DashboardMock() {
  return (
    <MockPhone>
      <div className="flex items-center justify-between mb-1.5">
        <h2 className="text-base font-bold" style={{ color: C.text, fontFamily: C.font }}>Phoebe</h2>
        <div className="flex gap-1.5">
          <span className="text-[9px] px-2.5 py-1 rounded-full" style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.25)", color: C.sage }}>🕯️ Prayer List</span>
          <span className="text-[9px] px-2.5 py-1 rounded-full" style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.25)", color: C.sage }}>Menu</span>
        </div>
      </div>
      <p className="text-[8px] uppercase tracking-[0.15em] mb-1" style={{ color: "rgba(143,175,150,0.4)" }}>A place set apart for connection</p>
      <p className="text-[13px] font-semibold mb-3" style={{ color: C.text, fontFamily: C.font }}>Sunday, 12 April</p>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-[11px] font-bold" style={{ color: C.text }}>This week</p>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.12)" }} />
      </div>
      <div className="space-y-2">
        <div className="flex rounded-xl overflow-hidden" style={{ background: "#0F2818", border: "1px solid rgba(92,138,95,0.28)" }}>
          <div className="w-1 shrink-0" style={{ background: "#5C8A5F" }} />
          <div className="flex-1 px-3 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold" style={{ color: C.text, fontFamily: C.font }}>📜 Lectio Divina</p>
              <p className="text-[10px] mt-0.5" style={{ color: C.sage }}>with Sarah, David +3</p>
            </div>
            <span className="text-[9px] px-2.5 py-1 rounded-full font-semibold" style={{ background: "#2D5E3F", color: C.text }}>Responses</span>
          </div>
        </div>
        <div className="flex rounded-xl overflow-hidden" style={{ background: "#0F2818", border: "1px solid rgba(92,138,95,0.28)" }}>
          <div className="w-1 shrink-0" style={{ background: "#5C8A5F" }} />
          <div className="flex-1 px-3 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold" style={{ color: C.text, fontFamily: C.font }}>🙏🏽 Prayers for healing</p>
              <p className="text-[10px] mt-0.5" style={{ color: C.sage }}>with Margaret, Anna</p>
            </div>
            <span className="text-[9px] px-2.5 py-1 rounded-full font-semibold" style={{ background: "rgba(46,107,64,0.18)", color: "#C8D4C0", border: "1px solid rgba(46,107,64,0.35)" }}>View</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 mb-2">
        <p className="text-[11px] font-bold" style={{ color: C.text }}>Prayer requests</p>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.12)" }} />
      </div>
      <div className="rounded-xl px-3 py-2.5" style={{ background: "#0F2818", border: "1px solid rgba(92,138,95,0.28)" }}>
        <p className="text-[10px] font-semibold mb-0.5" style={{ color: C.sage }}>Margaret W.</p>
        <p className="text-[11px] leading-snug" style={{ color: C.text }}>For my mother, who begins treatment this week.</p>
        <p className="text-[9px] mt-1" style={{ color: "rgba(143,175,150,0.35)" }}>🙏 4 praying</p>
      </div>
    </MockPhone>
  );
}

function PrayerRequestsMock() {
  const requests = [
    { from: "Margaret W.", body: "For my mother, who begins treatment this week.", words: 4 },
    { from: "David R.", body: "Discernment about the new role.", words: 6 },
    { from: "Anonymous", body: "For peace in a difficult season.", words: 2 },
  ];
  return (
    <MockPhone>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[14px] font-semibold" style={{ color: C.text, fontFamily: C.font }}>Prayer Requests 🙏🏽</h2>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
      </div>
      <div className="flex gap-2 mb-3">
        <div className="flex-1 text-[12px] px-3 py-2.5 rounded-xl" style={{ background: "#091A10", border: "1px solid rgba(46,107,64,0.3)", color: "rgba(143,175,150,0.5)", fontFamily: C.font }}>
          Share a prayer request... 🌿
        </div>
        <div className="px-3 py-2.5 rounded-xl text-[12px]" style={{ background: "#2D5E3F", color: C.text }}>🙏🏽</div>
      </div>
      <div>
        {requests.map((r, i) => (
          <div key={i} className="flex gap-0" style={{ borderBottom: i < 2 ? "1px solid rgba(200,212,192,0.12)" : "none" }}>
            <div className="w-0.5 self-stretch shrink-0" style={{ background: "#8FAF96" }} />
            <div className="flex-1 p-3 pl-2.5 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-medium uppercase tracking-widest mb-0.5" style={{ color: "rgba(200,212,192,0.45)" }}>From {r.from}</p>
                <p className="text-[12px] leading-relaxed" style={{ color: C.text, fontFamily: C.font }}>{r.body}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0 mt-1" style={{ color: "rgba(143,175,150,0.45)" }}>
                <span className="text-[10px] tabular-nums">{r.words}</span>
                <MessageCircle size={12} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

function BCPPrayerModeMock() {
  const categories = [
    { emoji: "⛪", name: "For the Church", count: 8, expanded: false },
    { emoji: "✝️", name: "For the Mission of the Church", count: 5, expanded: true, items: ["For the Spread of the Gospel", "For the Mission of the Church", "For Missionaries", "For our Enemies", "For Those Who Suffer for the Faith"] },
    { emoji: "🏛️", name: "For the Nation", count: 7, expanded: false },
  ];
  return (
    <MockPhone>
      <p className="text-[10px] mb-0.5" style={{ color: "rgba(143,175,150,0.55)" }}>← Book of Common Prayer</p>
      <h2 className="text-[14px] font-bold mb-0.5" style={{ color: C.text, fontFamily: C.font }}>Intercessions 🙏🏽</h2>
      <p className="text-[9px] mb-2.5" style={{ color: C.sage }}>Prayers from the Book of Common Prayer</p>
      <div className="rounded-lg px-2.5 py-1.5 mb-2.5 text-[10px]" style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.15)", color: "rgba(143,175,150,0.4)" }}>
        Search prayers...
      </div>
      <div className="space-y-1">
        {categories.map((cat, i) => (
          <div key={i}>
            <div className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ background: cat.expanded ? "rgba(46,107,64,0.2)" : "rgba(46,107,64,0.06)", border: `1px solid ${cat.expanded ? "rgba(46,107,64,0.4)" : "rgba(46,107,64,0.12)"}` }}>
              <span className="text-[12px]">{cat.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold truncate" style={{ color: C.text, fontFamily: C.font }}>{cat.name}</p>
                {cat.count > 0 && <p className="text-[8px]" style={{ color: "rgba(143,175,150,0.45)" }}>{cat.count} prayers</p>}
              </div>
              <span className="text-[10px]" style={{ color: "rgba(143,175,150,0.4)" }}>{cat.expanded ? "⌄" : "›"}</span>
            </div>
            {cat.expanded && cat.items && (
              <div className="ml-6 space-y-0">
                {cat.items.map((item, j) => (
                  <div key={j} className="flex items-center justify-between px-2 py-1.5" style={{ borderBottom: j < cat.items!.length - 1 ? "1px solid rgba(200,212,192,0.08)" : "none" }}>
                    <p className="text-[9px]" style={{ color: C.sage }}>{item}</p>
                    <span className="text-[8px]" style={{ color: "rgba(143,175,150,0.3)" }}>›</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

function LectioMock() {
  const reflections = [
    { name: "Margaret", isYou: false, time: "Mon · 8am", text: "I keep returning to the moment they recognised him — and then he was gone." },
    { name: "You", isYou: true, time: "Today · 7am", text: "\"Hearts burning\" — the way ordinary moments can hold something we don't see until later." },
    { name: "David", isYou: false, time: "Wed · 6pm", text: "The road itself. They were walking away from Jerusalem. Yet he met them there." },
  ];
  return (
    <MockPhone>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px]" style={{ color: "rgba(143,175,150,0.55)" }}>← Back</p>
        <div className="px-3 py-1 rounded-full text-[10px] font-semibold" style={{ background: "rgba(19,44,29,0.85)", border: "1px solid rgba(200,212,192,0.15)", color: C.text }}>Menu</div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-[0.18em]" style={{ color: "rgba(143,175,150,0.55)" }}>Stage 2</p>
          <p className="text-[10px]" style={{ color: C.sage }}>Luke 24:13–35</p>
        </div>
      </div>
      <p className="text-[9px] uppercase tracking-[0.18em] font-semibold mb-3" style={{ color: "rgba(143,175,150,0.45)" }}>What others heard</p>
      <div className="space-y-2 mb-4">
        {reflections.map((r, i) => (
          <div key={i} className="rounded-xl px-3 py-2.5" style={{ background: r.isYou ? "rgba(111,175,133,0.08)" : "#0F2818", border: `1px solid ${r.isYou ? "rgba(111,175,133,0.35)" : "rgba(200,212,192,0.15)"}` }}>
            <div className="flex items-baseline justify-between mb-1">
              <p className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: r.isYou ? "#6FAF85" : C.sage }}>{r.name}</p>
              <p className="text-[8px]" style={{ color: "rgba(143,175,150,0.45)" }}>{r.time}</p>
            </div>
            <p className="text-[11px] leading-[1.55]" style={{ color: C.text, fontFamily: C.font }}>{r.text}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-full px-3 py-2" style={{ background: "rgba(19,44,29,0.92)", border: "1px solid rgba(200,212,192,0.15)" }}>
        <p className="text-[10px] font-semibold" style={{ color: C.text }}>Back</p>
        <p className="text-[9px] uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.55)" }}>Stage 2 · Meditatio</p>
        <div className="px-2.5 py-1 rounded-full text-[10px] font-semibold" style={{ background: "#2D5E3F", color: C.text }}>Next stage</div>
      </div>
    </MockPhone>
  );
}

function GatheringsMock() {
  const groups = [
    { label: "Today", highlight: true, events: [{ time: "6:30 PM", title: "Wednesday Supper", location: "Parish Hall", people: "Margaret, David +4", kind: "ical" as const }] },
    { label: "Thursday", highlight: false, events: [{ time: "7:00 PM", title: "Lenten Study", location: "Library", people: "Anna, James +3", kind: "phoebe" as const }] },
    { label: "Saturday", highlight: false, events: [{ time: "8:00 AM", title: "Morning Prayer", location: "Chapel", people: "4 regulars", kind: "phoebe" as const }] },
  ];
  return (
    <MockPhone>
      <h2 className="text-[14px] font-bold mb-0.5" style={{ color: C.text, fontFamily: C.font }}>Gatherings</h2>
      <div className="h-px mb-3" style={{ background: "rgba(200,212,192,0.1)" }} />
      <div className="space-y-3">
        {groups.map((g, gi) => (
          <div key={gi}>
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-[9px] font-bold uppercase tracking-widest shrink-0" style={{ color: g.highlight ? "#6FAF85" : "rgba(200,212,192,0.45)" }}>{g.label}</p>
              <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.1)" }} />
            </div>
            <div className="space-y-1.5">
              {g.events.map((ev, ei) => (
                <div key={ei} className="relative flex rounded-xl overflow-hidden" style={{ background: ev.kind === "ical" ? "rgba(10,28,18,0.7)" : "#0F2818", border: `1px solid ${ev.kind === "ical" ? "rgba(74,158,132,0.2)" : "rgba(92,138,95,0.28)"}` }}>
                  <div className="w-0.5 shrink-0" style={{ background: ev.kind === "ical" ? "#4A9E84" : "#5C8A5F" }} />
                  <div className="flex-1 px-2.5 py-2">
                    <p className="text-[9px] font-semibold tabular-nums" style={{ color: "rgba(143,175,150,0.7)" }}>{ev.time}</p>
                    <p className="text-[11px] font-semibold" style={{ color: C.text, fontFamily: C.font }}>{ev.title}</p>
                    {ev.location && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <MapPin size={8} style={{ color: "rgba(143,175,150,0.5)" }} />
                        <span className="text-[9px]" style={{ color: "rgba(143,175,150,0.6)" }}>{ev.location}</span>
                      </div>
                    )}
                    {ev.people && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Users size={8} style={{ color: "rgba(143,175,150,0.5)" }} />
                        <span className="text-[9px]" style={{ color: "rgba(143,175,150,0.6)" }}>{ev.people}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

// ─── Slide definitions ────────────────────────────────────────────────────────

type MockKey = "community" | "prayer-requests" | "bcp" | "lectio" | "gatherings";

type InfoSlide = {
  kind: "info";
  title: string;
  body: string;
  mock: MockKey | null;
  calm?: boolean; // extra breathing room (slide 8)
  footnote?: string;
};

type Slide =
  | { kind: "welcome" }
  | InfoSlide
  | { kind: "bell" }
  | { kind: "prayer-request" };

const SLIDES: Slide[] = [
  // 1
  { kind: "welcome" },
  // 2
  {
    kind: "info",
    title: "Your community is already here.",
    body: "The people in your parish are on Phoebe. You'll share practices, prayers, and life with them throughout the week.",
    mock: "community",
  },
  // 3
  {
    kind: "info",
    title: "Prayer, held in common.",
    body: "Every week your community shares what they're carrying. You can respond with a word or a prayer, and make people feel heard and cared for.",
    mock: "prayer-requests",
  },
  // 4
  {
    kind: "info",
    title: "Intercessions from the prayer book.",
    body: "Phoebe includes the full intercessions and thanksgivings from the Book of Common Prayer. Join others in your community in praying them together.",
    mock: "bcp",
  },
  // 5
  {
    kind: "info",
    title: "Group Lectio Divina.",
    body: "Each week your community reads the Sunday gospel together — moving through each stage on Mondays, Wednesdays, and Fridays. You read, reflect, and see what others heard.",
    mock: "lectio",
  },
  // 6
  {
    kind: "info",
    title: "Upcoming gatherings.",
    body: "Your parish's events and traditions live here. See what's happening this week and who's showing up.",
    mock: "gatherings",
  },
  // 7
  {
    kind: "info",
    title: "Your garden.",
    body: "In Phoebe, the people you choose to stay close to are called your fellows — your garden. Their prayer requests surface first. Your connection grows over time, independent of any shared practice.",
    mock: null,
  },
  // 8
  {
    kind: "info",
    title: "Phoebe is a safe space.",
    body: "This is a place built on trust. If anyone ever makes you feel uncomfortable — in a prayer request, a letter, or anywhere in the app — you can mute them at any time. Muting is quiet and private. They won't be notified, and their content will no longer appear for you.\n\nYou are always in control of your experience here.",
    mock: null,
    calm: true,
    footnote: "To mute someone, visit their profile in the People tab and tap Mute.",
  },
  // 9
  { kind: "bell" },
  // 10
  { kind: "prayer-request" },
];

const MOCK_COMPONENTS: Record<MockKey, () => React.ReactElement> = {
  "community": DashboardMock,
  "prayer-requests": PrayerRequestsMock,
  "bcp": BCPPrayerModeMock,
  "lectio": LectioMock,
  "gatherings": GatheringsMock,
};

// ─── Slide renderers ──────────────────────────────────────────────────────────

function WelcomeSlide() {
  return (
    <div className="flex flex-col items-center justify-center text-center max-w-2xl mx-auto px-2">
      <motion.h1
        className="text-5xl md:text-7xl font-bold mb-6 tracking-tight"
        style={{ color: C.text, fontFamily: C.font }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        Welcome to Phoebe.
      </motion.h1>
      <motion.p
        className="text-lg md:text-xl font-light leading-relaxed"
        style={{ color: C.sage, fontFamily: C.font }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        A place set apart for connection between Sundays — through shared prayer, shared practice, and shared life.
      </motion.p>
    </div>
  );
}

function InfoSlideView({ slide }: { slide: InfoSlide }) {
  const Mock = slide.mock ? MOCK_COMPONENTS[slide.mock] : null;

  if (!Mock) {
    // Text-only layout (slides 7 & 8)
    return (
      <div className="max-w-2xl mx-auto w-full px-2">
        <h2
          className="text-2xl md:text-4xl font-semibold mb-5 leading-tight"
          style={{ color: C.text, fontFamily: C.font }}
        >
          {slide.title}
        </h2>
        <p
          className={`leading-relaxed font-light ${slide.calm ? "text-base md:text-lg" : "text-base md:text-xl"}`}
          style={{ color: C.sage, fontFamily: C.font, whiteSpace: "pre-line", lineHeight: slide.calm ? "1.85" : undefined }}
        >
          {slide.body}
        </p>
        {slide.footnote && (
          <p
            className="mt-8 text-sm"
            style={{ color: "rgba(143,175,150,0.5)", fontFamily: C.font }}
          >
            {slide.footnote}
          </p>
        )}
      </div>
    );
  }

  // Left text + right mock layout
  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-center w-full max-w-5xl mx-auto gap-8 md:gap-16 px-2">
      <div className="w-full md:max-w-md shrink-0">
        <h2
          className="text-2xl md:text-3xl font-semibold mb-4 leading-tight"
          style={{ color: C.text, fontFamily: C.font }}
        >
          {slide.title}
        </h2>
        <p
          className="text-sm md:text-base leading-relaxed font-light"
          style={{ color: C.sage, fontFamily: C.font }}
        >
          {slide.body}
        </p>
      </div>
      <motion.div
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.12, duration: 0.45 }}
        className="w-full md:w-auto flex justify-center shrink-0"
      >
        <Mock />
      </motion.div>
    </div>
  );
}

// ─── Bell slide (interactive) ─────────────────────────────────────────────────

function BellSlide({ onNext }: { onNext: () => void }) {
  const [hour, setHour] = useState(7);
  const [ampm, setAmpm] = useState<"AM" | "PM">("AM");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const to24h = (h: number, ap: "AM" | "PM") => {
    if (ap === "AM") return h === 12 ? "00" : String(h).padStart(2, "0");
    return h === 12 ? "12" : String(h + 12).padStart(2, "0");
  };

  async function handleSet() {
    setSaving(true);
    try {
      const time = `${to24h(hour, ampm)}:00`;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await apiRequest("PUT", "/api/bell/preferences", {
        bellEnabled: true,
        dailyBellTime: time,
        timezone,
      });
      setSaved(true);
      setTimeout(() => onNext(), 900);
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center text-center max-w-lg mx-auto w-full px-2">
      <h2
        className="text-2xl md:text-4xl font-semibold mb-4 leading-tight"
        style={{ color: C.text, fontFamily: C.font }}
      >
        Your daily bell.
      </h2>
      <p
        className="text-sm md:text-base leading-relaxed font-light mb-10"
        style={{ color: C.sage, fontFamily: C.font }}
      >
        Like a monastery bell that calls you to prayer, Phoebe will ring once a day at a time you choose. Five minutes. Whatever practices are waiting will be there. One notification, one rhythm, one daily touchpoint.
      </p>

      {/* Time picker */}
      <div
        className="rounded-2xl px-8 py-6 mb-3 w-full max-w-xs"
        style={{ background: "#0F2818", border: "1px solid rgba(92,138,95,0.28)" }}
      >
        <div className="flex items-center justify-center gap-4">
          {/* Hour stepper */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => setHour(h => h === 12 ? 1 : h + 1)}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-opacity hover:opacity-80"
              style={{ background: "rgba(46,107,64,0.25)", color: C.sage }}
            >
              ▲
            </button>
            <span
              className="text-5xl font-bold tabular-nums w-16 text-center"
              style={{ color: C.text, fontFamily: C.font, letterSpacing: "-0.03em" }}
            >
              {String(hour).padStart(2, "0")}
            </span>
            <button
              onClick={() => setHour(h => h === 1 ? 12 : h - 1)}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-opacity hover:opacity-80"
              style={{ background: "rgba(46,107,64,0.25)", color: C.sage }}
            >
              ▼
            </button>
          </div>

          <span className="text-4xl font-light mb-0.5" style={{ color: "rgba(143,175,150,0.4)" }}>:</span>

          <span
            className="text-5xl font-bold tabular-nums w-16 text-center"
            style={{ color: "rgba(143,175,150,0.3)", fontFamily: C.font, letterSpacing: "-0.03em" }}
          >
            00
          </span>

          {/* AM/PM toggle */}
          <div className="flex flex-col gap-1.5 ml-2">
            {(["AM", "PM"] as const).map(ap => (
              <button
                key={ap}
                onClick={() => setAmpm(ap)}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: ampm === ap ? "#2D5E3F" : "rgba(46,107,64,0.12)",
                  color: ampm === ap ? C.text : C.sage,
                  border: `1px solid ${ampm === ap ? "rgba(46,107,64,0.6)" : "rgba(46,107,64,0.18)"}`,
                }}
              >
                {ap}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs mt-4" style={{ color: "rgba(143,175,150,0.4)", fontFamily: C.font }}>
          You can change this anytime in your settings.
        </p>
      </div>

      {/* Set button */}
      <AnimatePresence mode="wait">
        {saved ? (
          <motion.div
            key="saved"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold"
            style={{ background: "#2D5E3F", color: C.text }}
          >
            ✓ Bell set
          </motion.div>
        ) : (
          <motion.button
            key="set"
            onClick={handleSet}
            disabled={saving}
            className="px-6 py-3 rounded-full text-sm font-semibold transition-opacity disabled:opacity-60"
            style={{ background: "#2D5E3F", color: C.text }}
          >
            {saving ? "Setting…" : "Set my bell"}
          </motion.button>
        )}
      </AnimatePresence>

      <p className="text-xs mt-2 mb-4" style={{ color: "rgba(143,175,150,0.4)", fontFamily: C.font }}>
        One notification a day. No more.
      </p>

      <button
        onClick={onNext}
        className="text-sm transition-opacity hover:opacity-80"
        style={{ color: "rgba(143,175,150,0.55)", fontFamily: C.font }}
      >
        Skip for now
      </button>
    </div>
  );
}

// ─── Prayer request slide (interactive, final) ────────────────────────────────

function PrayerRequestSlide({ onComplete }: { onComplete: () => void }) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/prayer-requests", { body: text.trim() });
      setSubmitted(true);
      setTimeout(() => setDone(true), 1500);
    } catch {
      setSubmitting(false);
    }
  }

  function handleSkip() {
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center text-center max-w-lg mx-auto w-full px-2">
        {submitted && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-base mb-8"
            style={{ color: C.sage, fontFamily: C.font }}
          >
            Your community will hold this.
          </motion.p>
        )}
        <motion.button
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: submitted ? 0.1 : 0 }}
          onClick={onComplete}
          className="px-8 py-3.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: "#2D5E3F", color: C.text }}
        >
          Done
        </motion.button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center text-center max-w-lg mx-auto w-full px-2">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="text-5xl mb-6"
        >
          🌿
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-xl font-semibold mb-2"
          style={{ color: C.text, fontFamily: C.font }}
        >
          Your community will hold this.
        </motion.p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center text-center max-w-lg mx-auto w-full px-2">
      <h2
        className="text-2xl md:text-4xl font-semibold mb-4 leading-tight"
        style={{ color: C.text, fontFamily: C.font }}
      >
        What are you carrying right now?
      </h2>
      <p
        className="text-sm md:text-base leading-relaxed font-light mb-8"
        style={{ color: C.sage, fontFamily: C.font }}
      >
        Share it with your community. It doesn't have to be big. Nothing is too small to be held together.
      </p>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder="Share a prayer request..."
        className="w-full rounded-2xl px-5 py-4 text-sm resize-none outline-none mb-4"
        style={{
          background: "#F5F0E8",
          color: "#1A2E1F",
          fontFamily: C.font,
          border: "none",
          lineHeight: "1.6",
        }}
      />

      <button
        onClick={handleSubmit}
        disabled={!text.trim() || submitting}
        className="w-full px-6 py-3.5 rounded-full text-sm font-semibold transition-opacity disabled:opacity-40 mb-3"
        style={{ background: "#2D5E3F", color: C.text }}
      >
        {submitting ? "Sharing…" : "Share with my community"}
      </button>

      <p className="text-xs mb-4" style={{ color: "rgba(143,175,150,0.5)", fontFamily: C.font }}>
        You can also do this anytime from your home screen.
      </p>

      <button
        onClick={handleSkip}
        className="text-sm transition-opacity hover:opacity-80"
        style={{ color: "rgba(143,175,150,0.55)", fontFamily: C.font }}
      >
        Skip for now
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function UserOnboarding() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);

  // Guard: redirect away if not logged in or already completed
  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
    if (!isLoading && user?.onboardingCompleted) setLocation("/dashboard");
  }, [user, isLoading, setLocation]);

  const completeOnboarding = useCallback(async () => {
    try {
      await apiRequest("PATCH", "/api/auth/me/onboarding");
      queryClient.setQueryData(["/api/auth/me"], (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        return { ...old, onboardingCompleted: true };
      });
    } catch {
      // Best-effort — navigate regardless
    }
    setLocation("/dashboard");
  }, [queryClient, setLocation]);

  const next = useCallback(
    () => setIndex(i => Math.min(i + 1, SLIDES.length - 1)),
    [],
  );
  const prev = useCallback(() => setIndex(i => Math.max(i - 1, 0)), []);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === "Escape") completeOnboarding();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, completeOnboarding]);

  // Touch/swipe support
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) next();
      else prev();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }, [next, prev]);

  if (isLoading || !user) return null;

  const slide = SLIDES[index];
  const isFirst = index === 0;
  const isInteractive = slide.kind === "bell" || slide.kind === "prayer-request";

  function renderSlide() {
    switch (slide.kind) {
      case "welcome":
        return <WelcomeSlide />;
      case "info":
        return <InfoSlideView slide={slide} />;
      case "bell":
        return <BellSlide onNext={next} />;
      case "prayer-request":
        return <PrayerRequestSlide onComplete={completeOnboarding} />;
    }
  }

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: C.bg }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 px-4 md:px-6 pt-4 md:pt-6 pb-2">
        <button
          onClick={completeOnboarding}
          className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-100 shrink-0"
          style={{ color: C.sage, opacity: 0.75 }}
        >
          <X size={16} />
          <span className="hidden md:inline">Close</span>
        </button>

        {/* Mobile: slim progress bar */}
        <div className="flex-1 h-0.5 rounded-full md:hidden" style={{ background: "rgba(200,212,192,0.15)" }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: C.sage }}
            animate={{ width: `${((index + 1) / SLIDES.length) * 100}%` }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>

        {/* Desktop: dot row (clickable) */}
        <div className="hidden md:flex gap-1.5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className="rounded-full transition-all"
              style={{
                width: i === index ? 20 : 6,
                height: 6,
                background: i <= index ? C.sage : "rgba(200,212,192,0.2)",
              }}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>

        <span className="text-xs tabular-nums shrink-0" style={{ color: C.sage, opacity: 0.6 }}>
          {index + 1} / {SLIDES.length}
        </span>
      </div>

      {/* Slide content */}
      <div className="flex-1 flex items-center justify-center px-5 md:px-16 py-8 md:py-12 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="w-full"
          >
            {renderSlide()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav — hidden on interactive slides (they manage their own CTAs) */}
      {!isInteractive && (
        <div
          className="flex items-center justify-between px-5 md:px-8 pb-5 md:pb-8 pt-6 relative z-10"
          style={{ background: "linear-gradient(to top, #091A10 60%, transparent)" }}
        >
          <button
            onClick={prev}
            disabled={isFirst}
            className="flex items-center gap-1.5 text-sm transition-opacity disabled:opacity-0 disabled:pointer-events-none"
            style={{ color: C.sage }}
          >
            <ChevronLeft size={18} />
            Back
          </button>

          <button
            onClick={next}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: "#2D5E3F", color: C.text }}
          >
            Next
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Back button only on interactive slides */}
      {isInteractive && (
        <div
          className="flex items-center px-5 md:px-8 pb-5 md:pb-8 pt-4 relative z-10"
          style={{ background: "linear-gradient(to top, #091A10 60%, transparent)" }}
        >
          <button
            onClick={prev}
            className="flex items-center gap-1.5 text-sm transition-opacity"
            style={{ color: C.sage }}
          >
            <ChevronLeft size={18} />
            Back
          </button>
        </div>
      )}
    </div>
  );
}
