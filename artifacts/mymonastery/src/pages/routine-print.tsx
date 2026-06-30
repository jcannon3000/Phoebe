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
import { getPracticeSlot, getJournalingSlot, SLOT_RANK, type CustomSlot } from "@/lib/customAnchors";

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

export default function RoutinePrintPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const r = useRhythmState();

  // Enumerate the active rhythm in time-of-day order — same ordering as the
  // home Daily-progress list (offices anchor morning/evening; optional
  // practices ride at their chosen slot; Examen + Gratitude are evening).
  const items: Item[] = [];
  if (r.morningActive) items.push({ emoji: "🌅", label: "Morning Prayer", slot: "morning" });
  for (const refl of r.reflections) items.push({ emoji: "📖", label: REFLECTION_NAME[refl.source], slot: "morning" });
  if (r.silenceActive) items.push({ emoji: "🕯️", label: "Silence", slot: "morning" });
  if (r.scriptureActive) items.push({ emoji: "📖", label: "Listen to Scripture", slot: getPracticeSlot("scripture") });
  if (r.lectioActive) items.push({ emoji: "📖", label: "Lectio Divina", slot: getPracticeSlot("lectio") });
  if (r.cobreatheActive) items.push({ emoji: "🌍", label: "Co-Breathe", slot: getPracticeSlot("cobreathe") });
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
  if (r.eveningActive) items.push({ emoji: "🌙", label: "Evening Prayer", slot: "evening" });
  items.sort((a, b) => SLOT_RANK[a.slot] - SLOT_RANK[b.slot]);

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

      {/* Screen-only toolbar: back + the Print/Save-as-PDF action. */}
      <div
        className="routine-print-toolbar"
        style={{ position: "sticky", top: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "max(0.75rem, var(--safe-top)) 16px 12px", background: "#FFFFFF", borderBottom: "1px solid #E7E3DA" }}
      >
        <button onClick={() => setLocation("/daily-progress")} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#3A6B40", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
          <ArrowLeft size={18} /> Back
        </button>
        <button onClick={() => window.print()} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#2D5E3F", color: "#F0EDE6", border: "none", borderRadius: 999, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
          <Printer size={16} /> Print / Save as PDF
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
                <th style={{ textAlign: "left", padding: "8px 6px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7E9A85", borderBottom: "2px solid #D8E0D4" }}>When</th>
                {DAYS.map((d) => (
                  <th key={d} style={{ width: 34, padding: "8px 2px", fontSize: 10.5, color: "#7E9A85", borderBottom: "2px solid #D8E0D4", textAlign: "center" }}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={`${it.label}-${i}`} className="rp-row">
                  <td style={{ padding: "11px 6px", fontSize: 15, fontWeight: 600, borderBottom: "1px solid #ECEFEA", whiteSpace: "nowrap" }}>
                    <span aria-hidden style={{ marginRight: 8 }}>{it.emoji}</span>{it.label}
                  </td>
                  <td style={{ padding: "11px 6px", fontSize: 13, color: "#55665C", borderBottom: "1px solid #ECEFEA" }}>{SLOT_LABEL[it.slot]}</td>
                  {DAYS.map((d) => (
                    <td key={d} style={{ padding: "11px 2px", borderBottom: "1px solid #ECEFEA", textAlign: "center" }}>
                      <span style={{ display: "inline-block", width: 16, height: 16, border: "1.5px solid #B6C2B4", borderRadius: 4 }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p style={{ marginTop: 28, fontSize: 11, color: "#90A096", textAlign: "center", fontFamily: "'Space Grotesk', sans-serif" }}>
          withphoebe.app
        </p>
      </div>
    </div>
  );
}
