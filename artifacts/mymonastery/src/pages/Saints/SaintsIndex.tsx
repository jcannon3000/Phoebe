import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  SAINTS,
  type Saint,
  type Intention,
  getTodaysSaints,
  getNextCommemoration,
  getSaintsOn,
  getSaintsByIntention,
  searchSaints,
  intentionsInUse,
  intentionLabel,
  feastDateLabel,
  RANK_LABELS,
} from "@/data/saints";

// Saints — the browsable, searchable index. Three tabs: Today (the
// commemoration of the day), Calendar (a quiet month view), and Find (the
// intercession search: "What do you carry today?"). Devotional, spare — no
// images, serif for the holy names, sans for the chrome.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const GREEN = "#2D5E3F";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Space Grotesk', system-ui, sans-serif";

type Tab = "today" | "calendar" | "find";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ─── shared bits ───────────────────────────────────────────────────────────

function RankEyebrow({ saint }: { saint: Saint }) {
  return (
    <p
      className="text-[10px] uppercase tracking-[0.18em] font-semibold"
      style={{ color: "rgba(143,175,150,0.6)", fontFamily: SANS, margin: 0 }}
    >
      {RANK_LABELS[saint.rank]} · {feastDateLabel(saint.feastDate)}
    </p>
  );
}

// A quiet row for the calendar day-list and find results.
function SaintListRow({ saint }: { saint: Saint }) {
  return (
    <Link href={`/saints/${saint.id}`}>
      <div
        className="rounded-xl px-4 py-3 cursor-pointer transition-opacity hover:opacity-90"
        style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.20)" }}
      >
        <p className="text-[10px] uppercase tracking-[0.16em] font-semibold mb-1" style={{ color: "rgba(143,175,150,0.55)", fontFamily: SANS }}>
          {RANK_LABELS[saint.rank]} · {feastDateLabel(saint.feastDate)}
        </p>
        <p className="text-[17px] leading-snug" style={{ color: WARM, fontFamily: SERIF }}>
          {saint.name}
        </p>
        {saint.patronOf.length > 0 && (
          <p className="text-[12px] mt-1" style={{ color: SAGE, fontFamily: SANS }}>
            Invoked for {saint.patronOf.slice(0, 3).join(", ")}
          </p>
        )}
      </div>
    </Link>
  );
}

// ─── Today ─────────────────────────────────────────────────────────────────

function TodayTab() {
  const [, setLocation] = useLocation();
  const todays = getTodaysSaints();
  const isToday = todays.length > 0;
  const shown = isToday ? todays : getNextCommemoration();
  const now = new Date();
  const todayLabel = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div>
      <p className="text-[12px] mb-4" style={{ color: "rgba(143,175,150,0.7)", fontFamily: SERIF, fontStyle: "italic" }}>
        {isToday ? todayLabel : "No commemoration today — the next on the calendar:"}
      </p>
      <div className="space-y-4">
        {shown.map((saint) => (
          <div
            key={saint.id}
            className="rounded-2xl p-5"
            style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}
          >
            <RankEyebrow saint={saint} />
            <Link href={`/saints/${saint.id}`}>
              <h2
                className="mt-2 mb-1 cursor-pointer"
                style={{ color: WARM, fontFamily: SERIF, fontSize: 28, lineHeight: 1.15, fontWeight: 400 }}
              >
                {saint.name}
              </h2>
            </Link>
            {saint.yearsLived && (
              <p className="text-[13px] mb-3" style={{ color: SAGE, fontFamily: SANS }}>
                {saint.yearsLived}
              </p>
            )}
            <p className="text-[15px] leading-relaxed" style={{ color: "rgba(240,237,230,0.88)", fontFamily: SERIF }}>
              {saint.knownFor}
            </p>
            {saint.collectExcerpt && (
              <p
                className="text-[15px] leading-relaxed mt-3 pl-3"
                style={{ color: "rgba(168,197,160,0.95)", fontFamily: SERIF, fontStyle: "italic", borderLeft: "2px solid rgba(46,107,64,0.5)" }}
              >
                {saint.collectExcerpt}
              </p>
            )}
            <button
              type="button"
              onClick={() => setLocation(`/saints/${saint.id}/pray`)}
              className="mt-5 w-full rounded-xl py-3 text-center transition-opacity hover:opacity-90 active:scale-[0.99]"
              style={{ background: GREEN, color: WARM, border: "1px solid rgba(46,107,64,0.7)", fontFamily: SANS, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
            >
              Pray with {saint.name}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Calendar ────────────────────────────────────────────────────────────

function CalendarTab() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1); // 1–12
  const [selectedDay, setSelectedDay] = useState<number | null>(
    getSaintsOn(now.getMonth() + 1, now.getDate()).length > 0 ? now.getDate() : null,
  );

  // Weekday offset for the 1st of this month, using the current year only to
  // line up the grid (commemorations themselves are year-agnostic).
  const year = now.getFullYear();
  const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const step = (delta: number) => {
    setMonth((m) => {
      const next = ((m - 1 + delta + 12) % 12) + 1;
      return next;
    });
    setSelectedDay(null);
  };

  const selected = selectedDay ? getSaintsOn(month, selectedDay) : [];

  return (
    <div>
      {/* Month header */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous month"
          className="w-9 h-9 rounded-full flex items-center justify-center transition-opacity hover:opacity-80"
          style={{ color: SAGE, background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.3)", cursor: "pointer" }}
        >
          ‹
        </button>
        <p style={{ color: WARM, fontFamily: SERIF, fontSize: 20 }}>{MONTH_NAMES[month - 1]}</p>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next month"
          className="w-9 h-9 rounded-full flex items-center justify-center transition-opacity hover:opacity-80"
          style={{ color: SAGE, background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.3)", cursor: "pointer" }}
        >
          ›
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold" style={{ color: "rgba(143,175,150,0.5)", fontFamily: SANS }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} />;
          const has = getSaintsOn(month, day).length > 0;
          const isSel = selectedDay === day;
          const isCurrent = month === now.getMonth() + 1 && day === now.getDate();
          return (
            <button
              key={day}
              type="button"
              onClick={() => has && setSelectedDay(isSel ? null : day)}
              className="aspect-square rounded-lg flex flex-col items-center justify-center transition-opacity"
              style={{
                background: isSel ? "rgba(46,107,64,0.4)" : has ? "rgba(46,107,64,0.12)" : "transparent",
                border: isCurrent ? "1px solid rgba(168,197,160,0.6)" : "1px solid transparent",
                color: has ? WARM : "rgba(143,175,150,0.4)",
                cursor: has ? "pointer" : "default",
                fontFamily: SANS,
                fontSize: 14,
              }}
            >
              {day}
              {has && (
                <span
                  className="block rounded-full"
                  style={{ width: 4, height: 4, marginTop: 2, background: isSel ? WARM : "rgba(168,197,160,0.8)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day's commemorations */}
      <div className="mt-5 space-y-2">
        {selectedDay && selected.length > 0 ? (
          selected.map((s) => <SaintListRow key={s.id} saint={s} />)
        ) : (
          <p className="text-[13px] text-center py-4" style={{ color: "rgba(143,175,150,0.5)", fontFamily: SERIF, fontStyle: "italic" }}>
            {selectedDay ? "No commemoration on this day." : "Tap a marked day to see who is remembered."}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Find ──────────────────────────────────────────────────────────────────

function FindTab() {
  const [active, setActive] = useState<Intention | null>(null);
  const [query, setQuery] = useState("");
  const intentions = intentionsInUse();

  const results: Saint[] = query.trim()
    ? searchSaints(query)
    : active
      ? getSaintsByIntention(active)
      : [];

  return (
    <div>
      <p className="text-center text-[22px] leading-snug mb-1" style={{ color: WARM, fontFamily: SERIF, fontStyle: "italic" }}>
        What do you carry today?
      </p>
      <p className="text-center text-[13px] mb-6" style={{ color: "rgba(143,175,150,0.6)", fontFamily: SERIF, fontStyle: "italic" }}>
        Choose what's on your heart, and find a companion in prayer.
      </p>

      {/* Free-text search */}
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActive(null); }}
        placeholder="Search by name or need…"
        className="w-full rounded-xl px-4 py-3 mb-5 text-[15px]"
        style={{
          background: "rgba(0,0,0,0.25)",
          border: "1px solid rgba(46,107,64,0.35)",
          color: WARM,
          fontFamily: SANS,
        }}
      />

      {/* Intention grid — hidden while typing a free-text query */}
      {!query.trim() && (
        <div className="flex flex-wrap gap-2 justify-center mb-6">
          {intentions.map((i) => {
            const on = active === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setActive(on ? null : i)}
                className="rounded-full px-4 py-2 transition-opacity hover:opacity-90 active:scale-[0.97]"
                style={{
                  background: on ? "rgba(46,107,64,0.45)" : "rgba(46,107,64,0.12)",
                  border: `1px solid ${on ? "rgba(46,107,64,0.8)" : "rgba(46,107,64,0.3)"}`,
                  color: on ? WARM : "rgba(240,237,230,0.85)",
                  fontFamily: SANS,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {intentionLabel(i)}
              </button>
            );
          })}
        </div>
      )}

      {/* Results */}
      <div className="space-y-2">
        {results.map((s) => <SaintListRow key={s.id} saint={s} />)}
        {(active || query.trim()) && results.length === 0 && (
          <p className="text-[13px] text-center py-4" style={{ color: "rgba(143,175,150,0.5)", fontFamily: SERIF, fontStyle: "italic" }}>
            No one found — try another word.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function SaintsIndex() {
  const [tab, setTab] = useState<Tab>("today");

  const tabs: { key: Tab; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "calendar", label: "Calendar" },
    { key: "find", label: "Find" },
  ];

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full">
        <div className="flex items-start gap-3 mb-5">
          <div
            className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0"
            style={{ background: "rgba(62,124,122,0.18)", border: "1px solid rgba(62,124,122,0.35)" }}
          >
            ✝︎
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold leading-tight" style={{ color: WARM, fontFamily: SANS }}>
              Saints
            </h1>
            <p className="text-xs mt-0.5" style={{ color: SAGE }}>
              The great cloud of witnesses — a companion for prayer.
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div
          className="flex rounded-xl p-1 mb-6"
          style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.22)" }}
        >
          {tabs.map((t) => {
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className="flex-1 rounded-lg py-2 text-center transition-colors"
                style={{
                  background: on ? GREEN : "transparent",
                  color: on ? WARM : "rgba(143,175,150,0.8)",
                  fontFamily: SANS,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === "today" && <TodayTab />}
        {tab === "calendar" && <CalendarTab />}
        {tab === "find" && <FindTab />}

        <p className="text-[11px] text-center mt-10" style={{ color: "rgba(143,175,150,0.4)", fontFamily: SANS }}>
          {SAINTS.length} commemorations · Lesser Feasts &amp; Fasts and A Great Cloud of Witnesses
        </p>
      </div>
    </Layout>
  );
}
