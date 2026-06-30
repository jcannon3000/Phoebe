// Printable weekly routine — a paper version of the user's daily rhythm for
// people who'd rather keep it on the wall/desk than in the app. Reuses the
// SAME rhythm state the home Daily-progress cards do (useRhythmState + the
// practice slots), lays the practices out in time-of-day order with a 7-day
// checkbox grid, and goes to PDF via the system print dialog — Save as PDF on
// web, the Share/Print sheet on iOS. No server PDF tooling.
import { useLocation } from "wouter";
import { ArrowLeft, Printer } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRhythmState } from "@/hooks/useRhythmState";
import { getPracticeSlot, getJournalingSlot, type CustomSlot } from "@/lib/customAnchors";
import { getSideLevel, getPsalmCycle, type OfficeLevel } from "@/lib/officePrefs";
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
type OfficeReadings = { psalms: string[]; lessons: string[]; cyclePsalms: string[] };
type DayReadings = { date: string; morning: OfficeReadings; evening: OfficeReadings };

// Which office methods get a printed guide page, and how it's titled. The full
// office and a devotion both show the appointed psalms + lessons; "Praying the
// Psalms" shows just the psalms (on its own cycle). Other methods
// (intercessions, reflect-sit, journaling, examen, Forward Day by Day) have no
// appointed readings to print, so they get no guide page.
type GuideMode = "office" | "devotion" | "psalms";
type Guide = { title: string; mode: GuideMode };
function sideGuide(side: "morning" | "evening", level: OfficeLevel | null): Guide | null {
  const cap = side === "morning" ? "Morning" : "Evening";
  if (level === "office") return { title: `${cap} Prayer`, mode: "office" };
  if (level === "devotion") return { title: `${cap} Devotion`, mode: "devotion" };
  if (level === "psalms") return { title: `Praying the Psalms · ${cap}`, mode: "psalms" };
  return null;
}

export default function RoutinePrintPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const r = useRhythmState();

  // The week's Daily Office Lectionary readings — only fetched when an office is
  // part of the rhythm; feeds the per-office guide pages below.
  const officeActive = r.morningActive || r.eveningActive;
  const { data: readingsData } = useQuery<{ days: DayReadings[] }>({
    queryKey: ["/api/office/readings-week"],
    queryFn: () => apiRequest("GET", "/api/office/readings-week"),
    enabled: officeActive,
    staleTime: 6 * 60 * 60_000,
  });
  const weekDays = readingsData?.days ?? [];

  // Which office method each side uses → its guide page. Full office, devotion,
  // and Praying-the-Psalms each get one (with the right title + readings); other
  // methods get none. Mirrors how the app renders the office (getSideLevel), so
  // the printout matches the user's actual rhythm.
  const morningGuide = r.morningActive ? sideGuide("morning", getSideLevel("morning")) : null;
  const eveningGuide = r.eveningActive ? sideGuide("evening", getSideLevel("evening")) : null;
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

  return (
    <div className="routine-print-root" style={{ minHeight: "100dvh", background: "#FFFFFF", color: "#14241A" }}>
      <style>{`
        /* Screen toolbar only — hidden when printing. The sheet itself prints
           clean black-on-white at any size. */
        @media print {
          .routine-print-toolbar { display: none !important; }
          .routine-print-root { background: #fff !important; }
          @page { margin: 14mm; }
        }
        .rp-row { break-inside: avoid; }
      `}</style>

      {/* Screen-only toolbar (hidden in print): back to Daily progress. The
          Print / Save-as-PDF action lives at the BOTTOM of the sheet. */}
      <div
        className="routine-print-toolbar"
        style={{ position: "sticky", top: 0, display: "flex", alignItems: "center", gap: 12, padding: "max(0.75rem, var(--safe-top)) 16px 12px", background: "#FFFFFF", borderBottom: "1px solid #E7E3DA" }}
      >
        <button onClick={() => setLocation("/daily-progress")} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#3A6B40", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
          <ArrowLeft size={18} /> Back
        </button>
      </div>

      {/* The sheet. */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 24px 48px" }}>
        <header style={{ textAlign: "center", marginBottom: 24 }}>
          <p style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#7E9A85", margin: "0 0 6px", fontFamily: "'Space Grotesk', sans-serif" }}>Phoebe · Weekly Rhythm</p>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.01em", margin: "0 0 8px", fontFamily: "'Space Grotesk', sans-serif" }}>{title}</h1>
          <p style={{ fontSize: 14, color: "#55665C", margin: 0, fontStyle: "italic", fontFamily: "Georgia, 'Times New Roman', serif" }}>
            A rhythm to keep through the week — check off each practice as you go.
          </p>
        </header>

        {items.length === 0 ? (
          <p style={{ textAlign: "center", color: "#55665C", fontFamily: "'Space Grotesk', sans-serif", marginTop: 32 }}>
            Your rhythm is empty. Shape it first under Daily progress → Shape your rhythm.
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

        {/* Office-guide pages — one per office in the rhythm, each on its own
            printed page, with the week's appointed psalms + lessons so the office
            can be prayed from a paper Book of Common Prayer. */}
        {morningGuide && weekDays.length > 0 && (
          <OfficeReadingsPage title={morningGuide.title} office="morning" mode={morningGuide.mode} psalmCycle={psalmCycle} days={weekDays} />
        )}
        {eveningGuide && weekDays.length > 0 && (
          <OfficeReadingsPage title={eveningGuide.title} office="evening" mode={eveningGuide.mode} psalmCycle={psalmCycle} days={weekDays} />
        )}

        {/* Print / Save-as-PDF — at the bottom, screen-only (hidden in print). */}
        <div className="routine-print-toolbar" style={{ display: "flex", justifyContent: "center", marginTop: 36 }}>
          <button onClick={() => window.print()} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#2D5E3F", color: "#F0EDE6", border: "none", borderRadius: 999, padding: "13px 26px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
            <Printer size={18} /> Print / Save as PDF
          </button>
        </div>

        <p style={{ marginTop: 28, fontSize: 11, color: "#90A096", textAlign: "center", fontFamily: "'Space Grotesk', sans-serif" }}>
          withphoebe.app
        </p>
      </div>
    </div>
  );
}

// One office's guide page: a note to pray it from the BCP + a table of the
// week's appointed psalms + lessons for that office, one row per day. Starts on
// a fresh printed page.
function OfficeReadingsPage({ title, office, mode, psalmCycle, days }: { title: string; office: "morning" | "evening"; mode: GuideMode; psalmCycle: "office" | "monthly"; days: DayReadings[] }) {
  const fmtDay = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  };
  const th: CSSProperties = { textAlign: "left", padding: "8px 6px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7E9A85", borderBottom: "2px solid #D8E0D4" };
  const td: CSSProperties = { padding: "10px 6px", fontSize: 13, borderBottom: "1px solid #ECEFEA", verticalAlign: "top" };
  // Praying-the-Psalms is psalms-only; the office + devotion guides also list
  // the day's lessons.
  const showLessons = mode !== "psalms";
  // For Praying-the-Psalms the psalms come from the chosen cycle — the monthly
  // 30-day Coverdale portion, or (in step with the office) the lectionary
  // psalms. Office/devotion guides always use the office lectionary psalms.
  const psalmsFor = (rd: OfficeReadings): string[] =>
    mode === "psalms" && psalmCycle === "monthly" ? rd.cyclePsalms : rd.psalms;
  const intro =
    mode === "psalms"
      ? `Pray through the Psalter — the psalms appointed for each day (${psalmCycle === "monthly" ? "the 30-day cycle" : "in step with the daily office"}) are below.`
      : mode === "devotion"
        ? `Pray ${title} from your Book of Common Prayer (Daily Devotions for Individuals and Families) — the appointed psalms and readings for each day are below.`
        : `Pray ${title} from your Book of Common Prayer — the appointed psalms and lessons for each day are below.`;
  return (
    <section className="rp-office-page" style={{ breakBefore: "page", paddingTop: 24, fontFamily: "'Space Grotesk', sans-serif" }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>{title} · this week's readings</h2>
      <p style={{ fontSize: 13, color: "#55665C", fontStyle: "italic", fontFamily: "Georgia, 'Times New Roman', serif", margin: "0 0 16px" }}>
        {intro}
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Day</th>
            <th style={th}>Psalms</th>
            {showLessons && <th style={th}>Lessons</th>}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const rd = office === "morning" ? d.morning : d.evening;
            const psalms = psalmsFor(rd);
            return (
              <tr key={d.date} className="rp-row">
                <td style={{ ...td, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtDay(d.date)}</td>
                <td style={{ ...td, color: "#55665C" }}>{psalms.length ? psalms.map((p) => `Ps. ${p}`).join(", ") : "—"}</td>
                {showLessons && <td style={td}>{rd.lessons.length ? rd.lessons.join("; ") : "—"}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
