// Printable weekly routine — a paper version of the user's daily rhythm for
// people who'd rather keep it on the wall/desk than in the app. Reuses the
// SAME rhythm state the home Daily-progress cards do (useRhythmState + the
// practice slots), lays the practices out in time-of-day order with a 7-day
// checkbox grid, and goes to PDF via the system print dialog — Save as PDF on
// web, the Share/Print sheet on iOS. No server PDF tooling.
import { useLocation } from "wouter";
import { ArrowLeft, Printer, Sliders } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRhythmState } from "@/hooks/useRhythmState";
import { getPracticeSlot, getJournalingSlot, type CustomSlot } from "@/lib/customAnchors";
import { getExplicitSideLevel, getPsalmCycle, type OfficeLevel } from "@/lib/officePrefs";
import { isNativeShell } from "@/lib/isNativeShell";
import { Fragment, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const SLOT_LABEL: Record<CustomSlot, string> = {
  morning: "Morning",
  anytime: "Anytime",
  midday: "Midday",
  afternoon: "Afternoon",
  evening: "Evening",
};
const REFLECTION_NAME: Record<"cac" | "fdd" | "ssje", string> = {
  cac: "CAC Daily Meditation",
  fdd: "Forward Day by Day",
  ssje: "Brother, Give Us a Word",
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Item = { emoji: string; label: string; slot: CustomSlot };

// The per-day ordo from /api/office/ordo-week — mirrors lib/officeOrdo on the
// server (built from the same selectors + pickers the office assemblers use, so
// the printout matches exactly what's prayed).
type OrdoLesson = { label: string; ref: string };
type OrdoCanticle = { label: string; name: string; number: number | null };
type OrdoSide = {
  invitatory: string;
  psalms: string[];
  cyclePsalms: string[];
  lessons: OrdoLesson[];
  canticles: OrdoCanticle[];
  suffrages: "A" | "B";
  collect: string;
  prayerForMission: string;
};
type OrdoDay = { date: string; weekdayLabel: string; sundayLabel: string; season: string; morning: OrdoSide; evening: OrdoSide };
// A private prayer intention — the "mine" tab on the prayer-list page. Mirrors
// the PrayerIntention shape in pages/prayer-list.tsx.
type PrayerIntention = { id: number; kind: "text" | "person"; personName: string; body: string; answered: boolean; shared: boolean };

// Which office methods get a printed guide page, and how it's titled. The full
// office and a devotion both show the appointed psalms + lessons; "Praying the
// Psalms" shows just the psalms (on its own cycle). Other methods
// (intercessions, reflect-sit, journaling, examen, Forward Day by Day) have no
// appointed readings to print, so they get no guide page.
type GuideMode = "office" | "devotion" | "psalms";
type Guide = { title: string; mode: GuideMode };
// Resolve the side's guide. The EXPLICIT per-device level wins (office /
// devotion / psalms each get a guide; intercessions / reflect-sit / journaling /
// examen / FDD have no appointed readings, so none). When there's no explicit
// per-device choice — the office is on via the synced server pref, or was set on
// another device — fall back to the resolved prayerKind so a cross-device office
// still prints its guide instead of silently dropping it.
function sideGuide(
  side: "morning" | "evening",
  explicit: OfficeLevel | null,
  prayerKind: "office" | "devotion" | "community",
): Guide | null {
  const cap = side === "morning" ? "Morning" : "Evening";
  if (explicit === "office") return { title: `${cap} Prayer`, mode: "office" };
  if (explicit === "devotion") return { title: `${cap} Devotion`, mode: "devotion" };
  if (explicit === "psalms") return { title: `Praying the Psalms · ${cap}`, mode: "psalms" };
  // An explicit non-office method — nothing appointed to print.
  if (explicit != null) return null;
  // No explicit per-device level: use what the app actually prays.
  if (prayerKind === "office") return { title: `${cap} Prayer`, mode: "office" };
  if (prayerKind === "devotion") return { title: `${cap} Devotion`, mode: "devotion" };
  return null;
}

export default function RoutinePrintPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const r = useRhythmState();

  // The week's office ordo — only fetched when an office is part of the rhythm;
  // feeds the per-office weekly-grid guide pages below.
  const officeActive = r.morningActive || r.eveningActive;
  const { data: ordoData } = useQuery<{ days: OrdoDay[] }>({
    queryKey: ["/api/office/ordo-week"],
    queryFn: () => apiRequest("GET", "/api/office/ordo-week"),
    enabled: officeActive,
    staleTime: 6 * 60 * 60_000,
  });
  const weekDays = ordoData?.days ?? [];

  // The user's current prayer list — their PRIVATE intentions (the "mine" tab on
  // the prayer-list page; only they ever see these). Printed as its own page so
  // they can pray it on paper. Active = not yet marked answered.
  const { data: intentionsData } = useQuery<{ intentions: PrayerIntention[]; encrypted?: boolean }>({
    queryKey: ["/api/prayer-intentions"],
    queryFn: () => apiRequest("GET", "/api/prayer-intentions"),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
  const activeIntentions = (intentionsData?.intentions ?? []).filter((i) => !i.answered);
  const intentionsEncrypted = !!intentionsData?.encrypted;

  // Which office method each side uses → its guide page. Full office, devotion,
  // and Praying-the-Psalms each get one (with the right title + readings); other
  // methods get none. Uses the explicit per-device level, falling back to the
  // resolved prayerKind so an office that's on via the server pref (or set on
  // another device) still prints — the office is active here, after all.
  const morningGuide = r.morningActive ? sideGuide("morning", getExplicitSideLevel("morning"), r.prayerKind) : null;
  const eveningGuide = r.eveningActive ? sideGuide("evening", getExplicitSideLevel("evening"), r.prayerKind) : null;
  const psalmCycle = getPsalmCycle();
  // Enumerate the active rhythm in time-of-day order — same ordering as the
  // home Daily-progress list (offices anchor morning/evening; optional
  // practices ride at their chosen slot; Examen + Gratitude are evening).
  const items: Item[] = [];
  if (r.morningActive) items.push({ emoji: "🌅", label: morningGuide?.title ?? "Morning Prayer", slot: "morning" });
  for (const refl of r.reflections) items.push({ emoji: "📖", label: REFLECTION_NAME[refl.source], slot: "morning" });
  if (r.silenceActive) items.push({ emoji: "🕯️", label: r.contemplationGoalMin > 0 ? `Silence · ${r.contemplationGoalMin} min/day` : "Silence", slot: "morning" });
  if (r.scriptureActive) items.push({ emoji: "📖", label: "Listen to Scripture", slot: getPracticeSlot("scripture") });
  if (r.lectioActive) items.push({ emoji: "📖", label: "Lectio Divina", slot: getPracticeSlot("lectio") });
  // Co-Breathe is intentionally NEVER on the printout (per direction).
  if (r.listeningActive) items.push({ emoji: "🎵", label: "Audio Divina", slot: getPracticeSlot("listening") });
  if (r.readingActive) items.push({ emoji: "📚", label: "Reading", slot: getPracticeSlot("reading") });
  if (r.walkActive) items.push({ emoji: "🚶", label: "Contemplative Walk", slot: getPracticeSlot("walk") });
  if (r.journalingActive) items.push({ emoji: "📓", label: "Journaling", slot: getJournalingSlot() });
  if (r.podcastsActive) items.push({ emoji: "🎙️", label: "Podcasts", slot: "afternoon" });
  if (r.prayerListActive) items.push({ emoji: "🕊️", label: "My Prayer List", slot: "anytime" });
  for (const a of r.customAnchors) {
    if (!a.skipped) items.push({ emoji: a.emoji || "🌿", label: a.title, slot: a.slot });
  }
  if (r.examenActive) items.push({ emoji: "🌗", label: "The Examen", slot: "evening" });
  if (r.gratitudeActive) items.push({ emoji: "🙏", label: "Gratitude", slot: "evening" });
  if (r.eveningActive) items.push({ emoji: "🌙", label: eveningGuide?.title ?? "Evening Prayer", slot: "evening" });
  // Group into distinct time-of-day sections (Anytime last — it's not a clock time).
  const SLOT_ORDER: CustomSlot[] = ["morning", "midday", "afternoon", "evening", "anytime"];
  const grouped = SLOT_ORDER
    .map((slot) => ({ slot, list: items.filter((it) => it.slot === slot) }))
    .filter((g) => g.list.length > 0);

  const firstName = (user?.name ?? "").trim().split(/\s+/)[0] || "";
  const title = firstName ? `${firstName}'s Weekly Rhythm` : "My Weekly Rhythm";

  // Saved-PDF filename — browsers default the file name to document.title, so we
  // swap in "<name> — Daily Practice — Week of <date>" just for the print and
  // restore the tab title afterward.
  const fullName = (user?.name ?? "").trim();
  const weekLabel = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const pdfFileName = `${fullName ? `${fullName} — ` : ""}Daily Practice — Week of ${weekLabel}`;
  const handlePrint = () => {
    // The native iOS app (WKWebView) has no window.print(); route to the native
    // iOS print sheet (Save to Files as PDF / AirPrint / share) via the shell.
    if (isNativeShell()) {
      window.dispatchEvent(new CustomEvent("phoebe:print", { detail: { jobName: pdfFileName } }));
      return;
    }
    // Web: the browser print dialog. document.title becomes the default PDF name.
    const prev = document.title;
    document.title = pdfFileName;
    const restore = () => { document.title = prev; window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  return (
    <div className="routine-print-root" style={{ minHeight: "100dvh", background: "#FFFFFF", color: "#14241A" }}>
      <style>{`
        /* Screen toolbar only — hidden when printing. The sheet itself prints
           clean black-on-white at any size. */
        @media print {
          .routine-print-toolbar { display: none !important; }
          .routine-print-root { background: #fff !important; }
          @page { margin: 14mm; }
          /* The weekly-office grids need the width — print them landscape. The
             checklist + prayer-text pages stay on the default portrait page. */
          @page office { size: landscape; margin: 12mm; }
          .rp-office-grid { page: office; }
        }
        .rp-row { break-inside: avoid; }
        .rp-office-grid, .rp-office-page { break-before: page; }
        .rp-grid-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .rp-grid-cell { padding: 6px 5px; font-size: 10.5px; border-bottom: 1px solid #ECEFEA; vertical-align: top; overflow-wrap: anywhere; }
      `}</style>

      {/* Screen-only toolbar (hidden in print): Back on the left, Save-as-PDF
          on the right. */}
      <div
        className="routine-print-toolbar"
        style={{ position: "sticky", top: 0, zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "max(0.75rem, var(--safe-top)) 16px 12px", background: "#FFFFFF", borderBottom: "1px solid #E7E3DA" }}
      >
        <button onClick={() => setLocation("/daily-progress")} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#3A6B40", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
          <ArrowLeft size={18} /> Back
        </button>
        <button onClick={handlePrint} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#2D5E3F", color: "#F0EDE6", border: "none", borderRadius: 999, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
          <Printer size={16} /> Save as PDF
        </button>
      </div>

      {/* Checklist sheet — portrait. */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 24px 8px" }}>
        <header style={{ textAlign: "center", marginBottom: 24 }}>
          <p style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#7E9A85", margin: "0 0 6px", fontFamily: "'Space Grotesk', sans-serif" }}>Phoebe · Weekly Rhythm</p>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.01em", margin: "0 0 8px", fontFamily: "'Space Grotesk', sans-serif" }}>{title}</h1>
          <p style={{ fontSize: 14, color: "#55665C", margin: 0, fontStyle: "italic", fontFamily: "Georgia, 'Times New Roman', serif" }}>
            A rhythm to keep through the week — check off each practice as you go.
          </p>
        </header>

        {items.length === 0 ? (
          <p style={{ textAlign: "center", color: "#55665C", fontFamily: "'Space Grotesk', sans-serif", marginTop: 32 }}>
            Your rhythm is empty. Shape it first under Daily Progress → Shape your rhythm.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Space Grotesk', sans-serif" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 6px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7E9A85", borderBottom: "2px solid #D8E0D4" }}>Practice</th>
                {DAYS.map((d) => (
                  <th key={d} style={{ width: 34, padding: "8px 2px", fontSize: 10.5, color: "#7E9A85", borderBottom: "2px solid #D8E0D4", textAlign: "center" }}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map((group) => (
                <Fragment key={group.slot}>
                  {/* Time-of-day section header. */}
                  <tr className="rp-row">
                    <td colSpan={1 + DAYS.length} style={{ padding: "16px 6px 4px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#3A6B40" }}>
                      {SLOT_LABEL[group.slot]}
                    </td>
                  </tr>
                  {group.list.map((it, i) => (
                    <tr key={`${group.slot}-${it.label}-${i}`} className="rp-row">
                      <td style={{ padding: "11px 6px", fontSize: 15, fontWeight: 600, borderBottom: "1px solid #ECEFEA" }}>
                        <span aria-hidden style={{ marginRight: 8 }}>{it.emoji}</span>{it.label}
                      </td>
                      {DAYS.map((d) => (
                        <td key={d} style={{ padding: "11px 2px", borderBottom: "1px solid #ECEFEA", textAlign: "center" }}>
                          <span style={{ display: "inline-block", width: 16, height: 16, border: "1.5px solid #B6C2B4", borderRadius: 4 }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Office-guide pages — the weekly office grid for each office in the
          rhythm (full office / devotion), Praying-the-Psalms as a psalm list,
          then the office's fixed prayers in full, once. Each starts on a new
          printed page; the grids print landscape so the seven day-columns have
          room. Rendered outside the 760px sheet so the landscape grids can use
          the full page width. */}
      {morningGuide && weekDays.length > 0 && (
        morningGuide.mode === "psalms" ? (
          <PsalmCycleWeek title={morningGuide.title} office="morning" days={weekDays} psalmCycle={psalmCycle} />
        ) : (
          <OfficeWeekGrid title={morningGuide.title} office="morning" days={weekDays} devotion={morningGuide.mode === "devotion"} />
        )
      )}
      {eveningGuide && weekDays.length > 0 && (
        eveningGuide.mode === "psalms" ? (
          <PsalmCycleWeek title={eveningGuide.title} office="evening" days={weekDays} psalmCycle={psalmCycle} />
        ) : (
          <OfficeWeekGrid title={eveningGuide.title} office="evening" days={weekDays} devotion={eveningGuide.mode === "devotion"} />
        )
      )}
      {activeIntentions.length > 0 && (
        <MyPrayerListPage intentions={activeIntentions} encrypted={intentionsEncrypted} />
      )}

      <p style={{ marginTop: 28, marginBottom: 96, fontSize: 11, color: "#90A096", textAlign: "center", fontFamily: "'Space Grotesk', sans-serif" }}>
        withphoebe.app
      </p>

      {/* Screen-only floating button (hidden when printing) — if the previewed
          rhythm isn't right, jump straight to the customizer to change it. */}
      <button
        type="button"
        className="routine-print-toolbar"
        onClick={() => setLocation("/rule-of-life")}
        aria-label="Change your daily rhythm"
        style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)", zIndex: 40, display: "inline-flex", alignItems: "center", gap: 8, background: "#2D5E3F", color: "#F0EDE6", border: "none", borderRadius: 999, padding: "11px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
      >
        <Sliders size={16} /> Change your daily rhythm
      </button>
    </div>
  );
}

// ── Weekly office grid ───────────────────────────────────────────────────────
// The office prayed down each day's column: the order of service on the left,
// one column per day, with the appointed psalms, lessons, canticles, suffrages,
// and collect filled in (the fixed prayers are marked "said daily" and printed
// in full by DailyPrayersBlock). Morning Prayer reads OT + Epistle with two
// canticles; Evening Prayer reads the Gospel with one canticle (Phos hilaron in
// place of an invitatory psalm) — so the two offices have different rows.
type GridRow = {
  label: string;
  kind: "fixed" | "day";
  note?: string;                       // shown across the days for fixed rows
  highlight?: boolean;                 // tint the per-day cells (the propers)
  cell?: (s: OrdoSide) => string;      // per-day value
};

const fmtPsalms = (ps: string[]): string => (ps.length ? ps.join(", ") : "—");
// "21 · Te Deum" — lead with the BCP canticle number when we have it.
const fmtCanticle = (c?: OrdoCanticle): string => (!c ? "—" : c.number ? `${c.number} · ${c.name}` : c.name);

const MORNING_ROWS: GridRow[] = [
  { label: "Opening sentence", kind: "fixed", note: "Seasonal" },
  { label: "Confession + absolution", kind: "fixed", note: "Said daily" },
  { label: "Invitatory", kind: "day", cell: (s) => s.invitatory },
  { label: "The Psalms", kind: "day", highlight: true, cell: (s) => fmtPsalms(s.psalms) },
  { label: "First lesson · OT", kind: "day", highlight: true, cell: (s) => s.lessons[0]?.ref ?? "—" },
  { label: "Canticle", kind: "day", cell: (s) => fmtCanticle(s.canticles[0]) },
  { label: "Second lesson · Epistle", kind: "day", highlight: true, cell: (s) => s.lessons[1]?.ref ?? "—" },
  { label: "Canticle", kind: "day", cell: (s) => fmtCanticle(s.canticles[1]) },
  { label: "Apostles' Creed", kind: "fixed", note: "Said daily" },
  { label: "The Lord's Prayer", kind: "fixed", note: "Said daily" },
  { label: "The Suffrages", kind: "day", cell: (s) => s.suffrages },
  { label: "Collect of the day", kind: "day", highlight: true, cell: (s) => s.collect || "—" },
  { label: "Prayer for mission", kind: "day", cell: (s) => s.prayerForMission },
  { label: "General thanksgiving", kind: "fixed", note: "Said daily" },
  { label: "Dismissal + blessing", kind: "fixed", note: "Rotates daily" },
];

const EVENING_ROWS: GridRow[] = [
  { label: "Opening sentence", kind: "fixed", note: "Seasonal" },
  { label: "Confession + absolution", kind: "fixed", note: "Said daily" },
  { label: "Phos hilaron", kind: "fixed", note: "O Gracious Light — said daily" },
  { label: "The Psalms", kind: "day", highlight: true, cell: (s) => fmtPsalms(s.psalms) },
  { label: "The Gospel", kind: "day", highlight: true, cell: (s) => s.lessons[0]?.ref ?? "—" },
  { label: "Canticle", kind: "day", cell: (s) => fmtCanticle(s.canticles[0]) },
  { label: "Apostles' Creed", kind: "fixed", note: "Said daily" },
  { label: "The Lord's Prayer", kind: "fixed", note: "Said daily" },
  { label: "The Suffrages", kind: "day", cell: (s) => s.suffrages },
  { label: "Collect of the day", kind: "day", highlight: true, cell: (s) => s.collect || "—" },
  { label: "Prayer for mission", kind: "day", cell: (s) => s.prayerForMission },
  { label: "General thanksgiving", kind: "fixed", note: "Said daily" },
  { label: "Dismissal + blessing", kind: "fixed", note: "Rotates daily" },
];

function dayHeader(d: OrdoDay): { wd: string; dom: string } {
  const wd = (d.weekdayLabel || "").slice(0, 3) || d.date.slice(5);
  const dom = d.date.slice(8, 10).replace(/^0/, "");
  return { wd, dom };
}

function OfficeWeekGrid({ title, office, days, devotion }: { title: string; office: "morning" | "evening"; days: OrdoDay[]; devotion: boolean }) {
  const rows = office === "morning" ? MORNING_ROWS : EVENING_ROWS;
  const side = (d: OrdoDay): OrdoSide => (office === "morning" ? d.morning : d.evening);
  const labelCell: CSSProperties = { padding: "6px 8px 6px 5px", fontSize: 11, fontWeight: 600, borderBottom: "1px solid #ECEFEA", color: "#1F3326", overflowWrap: "anywhere" };
  return (
    <section className="rp-office-grid" style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 0", fontFamily: "'Space Grotesk', sans-serif" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 2px" }}>{title} · this week</h2>
      <p style={{ fontSize: 12.5, color: "#55665C", fontStyle: "italic", fontFamily: "Georgia, 'Times New Roman', serif", margin: "0 0 12px" }}>
        {devotion
          ? "A devotion is a shorter form — a psalm or portion, a reading, the Lord's Prayer, and the collect. Each day's full appointments are below; pray the parts that fit."
          : "Pray the office down each day's column — the appointed psalms, lessons, canticles, suffrages, and collect are filled in. The rows marked “said daily” are the same at every office."}
      </p>
      <table className="rp-grid-table">
        <colgroup>
          <col style={{ width: 118 }} />
          {days.map((d) => <col key={d.date} />)}
        </colgroup>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "6px 5px", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "#7E9A85", borderBottom: "2px solid #D8E0D4" }}>Order</th>
            {days.map((d) => {
              const h = dayHeader(d);
              return (
                <th key={d.date} style={{ padding: "6px 4px", fontSize: 11, color: "#14241A", fontWeight: 700, borderBottom: "2px solid #D8E0D4", textAlign: "center" }}>
                  {h.wd}<span style={{ display: "block", fontSize: 9.5, color: "#7E9A85", fontWeight: 500 }}>{h.dom}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="rp-row">
              <td style={labelCell}>{row.label}</td>
              {row.kind === "fixed" ? (
                <td colSpan={days.length} style={{ padding: "6px 6px", fontSize: 10.5, color: "#90A096", fontStyle: "italic", borderBottom: "1px solid #ECEFEA" }}>{row.note}</td>
              ) : (
                days.map((d) => (
                  <td key={d.date} className="rp-grid-cell" style={{ textAlign: "center", background: row.highlight ? "#F3F7F0" : undefined, color: "#33473B" }}>
                    {row.cell ? row.cell(side(d)) : "—"}
                  </td>
                ))
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// Praying-the-Psalms guide — a psalm-only weekly list (the office grid would
// overstate it). Uses the monthly 30-day Coverdale portion or the office-cycle
// psalms, per the user's chosen cycle.
function PsalmCycleWeek({ title, office, days, psalmCycle }: { title: string; office: "morning" | "evening"; days: OrdoDay[]; psalmCycle: "office" | "monthly" }) {
  const fmtDay = (d: OrdoDay) => {
    const dt = new Date(`${d.date}T00:00:00`);
    const md = Number.isNaN(dt.getTime()) ? d.date : dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${d.weekdayLabel ? `${d.weekdayLabel.slice(0, 3)} · ` : ""}${md}`;
  };
  const psalmsFor = (s: OrdoSide) => (psalmCycle === "monthly" ? s.cyclePsalms : s.psalms);
  const th: CSSProperties = { textAlign: "left", padding: "8px 6px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7E9A85", borderBottom: "2px solid #D8E0D4" };
  const td: CSSProperties = { padding: "10px 6px", fontSize: 13, borderBottom: "1px solid #ECEFEA", verticalAlign: "top" };
  return (
    <section className="rp-office-page" style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px 0", fontFamily: "'Space Grotesk', sans-serif" }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>{title} · this week</h2>
      <p style={{ fontSize: 13, color: "#55665C", fontStyle: "italic", fontFamily: "Georgia, 'Times New Roman', serif", margin: "0 0 16px" }}>
        Pray through the Psalter — the psalms appointed for each day ({psalmCycle === "monthly" ? "the 30-day cycle" : "in step with the daily office"}) are below.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={th}>Day</th><th style={th}>Psalms</th></tr></thead>
        <tbody>
          {days.map((d) => {
            const ps = psalmsFor(office === "morning" ? d.morning : d.evening);
            return (
              <tr key={d.date} className="rp-row">
                <td style={{ ...td, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtDay(d)}</td>
                <td style={{ ...td, color: "#55665C" }}>{ps.length ? ps.map((p) => `Ps. ${p}`).join(", ") : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// The user's current prayer list — their private intentions, printed so they
// can pray through them on paper. Person-intentions lead with the name; text
// intentions print the prayer. A small box lets them mark each as prayed.
function MyPrayerListPage({ intentions, encrypted }: { intentions: PrayerIntention[]; encrypted: boolean }) {
  return (
    <section className="rp-office-page" style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px 0", fontFamily: "'Space Grotesk', sans-serif" }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>My Prayer List</h2>
      <p style={{ fontSize: 13, color: "#55665C", fontStyle: "italic", fontFamily: "Georgia, 'Times New Roman', serif", margin: "0 0 18px" }}>
        The prayers you're holding — carry them through the week in your own words.
      </p>
      {encrypted ? (
        <p style={{ fontSize: 13, color: "#55665C" }}>
          Your prayers are encrypted on your device — open Phoebe to read them.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {intentions.map((it) => {
            const name = it.kind === "person" ? (it.personName ?? "").trim() : "";
            const body = (it.body ?? "").trim();
            const showBody = !!body && !(name && body === name);
            return (
              <li key={it.id} className="rp-row" style={{ display: "flex", gap: 9, alignItems: "baseline", padding: "8px 0", borderBottom: "1px solid #ECEFEA" }}>
                <span aria-hidden style={{ color: "#8FAF96", flexShrink: 0 }}>•</span>
                <span style={{ fontSize: 13.5, lineHeight: 1.45, color: "#1F3326" }}>
                  {name ? <span style={{ fontWeight: 700 }}>{name}{showBody ? " — " : ""}</span> : null}
                  {showBody ? <span style={{ color: "#33473B" }}>{body}</span> : null}
                  {!name && !showBody ? <span style={{ color: "#90A096" }}>(untitled prayer)</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
