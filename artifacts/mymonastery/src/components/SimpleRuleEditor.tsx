// SimpleRuleEditor — the lightweight "customizer" shown to logged-out / light-mode
// people instead of the full WayOfLoveRuleFlow slideshow.
//
// It shows their CURRENT rule of life as a short stack of tappable cards
// (Morning Prayer, Evening Prayer, Reflection, Silence). Tapping a card opens a
// focused bottom-sheet with just that one setting's options — pick one, it saves
// immediately (writes the same device-local officePrefs the full flow uses) and
// the sheet closes. No slideshow, no multi-step commit.
//
// Also offers:
//   • "Reset to the simple rhythm" — restores the seeded default (Morning +
//     Evening Prayer, Forward Day by Day, a 5-minute silence).
//   • "Full customization" — hands off to the complete WayOfLoveRuleFlow for
//     anyone who wants the whole thing.
//
// Everything here writes localStorage via officePrefs setters (each dispatches
// OFFICE_PREFS_EVENT), so useRhythmState + the home cards update live.

import { useEffect, useState } from "react";
import {
  getExplicitSideLevel,
  setSideLevel,
  setSideEntry,
  getReflectionSource,
  setReflectionSource,
  setSideReflection,
  OFFICE_PREFS_EVENT,
  type OfficeSide,
  type OfficeLevel,
  type ReflectionSource,
} from "@/lib/officePrefs";
import {
  getGuestSilenceGoalMinRaw,
  setGuestSilenceGoalMin,
} from "@/lib/guestSeed";

// ── Option tables ────────────────────────────────────────────────────────────

type OfficeChoice = { value: OfficeLevel; label: string; sub: string };

const OFFICE_CHOICES = (side: OfficeSide): OfficeChoice[] => {
  const when = side === "morning" ? "Morning" : "Evening";
  return [
    { value: "office", label: `${when} Prayer`, sub: "The full office from the Book of Common Prayer" },
    { value: "devotion", label: `${when} Devotion`, sub: "A shorter daily devotion" },
    { value: "psalms", label: "The Psalms", sub: "Pray the appointed psalms" },
    { value: "ask", label: "Not this time", sub: `No ${side} prayer in the rhythm` },
  ];
};

const REFLECTION_CHOICES: { value: ReflectionSource; label: string; sub: string }[] = [
  { value: "fdd", label: "Forward Day by Day", sub: "The classic daily meditation" },
  { value: "cac", label: "Richard Rohr — Daily Meditation", sub: "Center for Action and Contemplation" },
  { value: "ssje", label: "Brother, Give Us a Word", sub: "A daily word from the SSJE monks" },
  { value: "sojo", label: "Sojourners Daily Devotion", sub: "Verse, voice and prayer of the day" },
  { value: "nouwen", label: "Nouwen Daily Devotion", sub: "From the Henri Nouwen Society" },
  { value: "grist", label: "Grist Climate News", sub: "The day's climate reporting" },
  // VTS BELONGS HERE TOO. Without it this editor did something worse than
  // omit an option: the label lookup below falls back to "Forward Day by Day",
  // so a reader whose reflection IS the Dean's Commentary was shown a screen
  // claiming they had chosen something else — and saving from it would have
  // made that true.
  { value: "vts", label: "VTS Dean's Commentary", sub: "Weekday commentary from Virginia Theological Seminary" },
  { value: "none", label: "No reflection", sub: "Leave reflection out of the rhythm" },
];

const SILENCE_CHOICES: { value: number; label: string; sub: string }[] = [
  { value: 5, label: "5 minutes", sub: "A few fragments of silence" },
  { value: 10, label: "10 minutes", sub: "A little longer to rest" },
  { value: 15, label: "15 minutes", sub: "A settled quarter hour" },
  { value: 20, label: "20 minutes", sub: "A full contemplative sit" },
  { value: 30, label: "30 minutes", sub: "A deep stretch of stillness" },
  { value: 0, label: "No silence", sub: "Leave silence out of the rhythm" },
];

// ── Small label helpers ──────────────────────────────────────────────────────

function officeSummary(level: OfficeLevel | null, side: OfficeSide): string {
  switch (level) {
    case "office": return `${side === "morning" ? "Morning" : "Evening"} Prayer`;
    case "devotion": return "Daily Devotion";
    case "psalms": return "The Psalms";
    case "ask": case null: return "Off";
    // Levels only reachable via the full flow — show a gentle catch-all.
    default: return "On";
  }
}

function reflectionSummary(src: ReflectionSource): string {
  return REFLECTION_CHOICES.find((c) => c.value === src)?.label ?? "Forward Day by Day";
}

// ── UI atoms ─────────────────────────────────────────────────────────────────

const CARD_BG = "rgba(9, 26, 16, 0.46)";
const CARD_BORDER = "1px solid rgba(255,255,255,0.14)";

function RuleCard({
  emoji,
  title,
  value,
  onClick,
}: {
  emoji: string;
  title: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        textAlign: "left",
        padding: "16px 18px",
        borderRadius: 18,
        background: CARD_BG,
        border: CARD_BORDER,
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        color: "#fff",
        cursor: "pointer",
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }}>{emoji}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12, letterSpacing: 0.3, opacity: 0.72, textTransform: "uppercase" }}>
          {title}
        </span>
        <span style={{ display: "block", fontSize: 17, fontWeight: 600, marginTop: 2 }}>{value}</span>
      </span>
      <span style={{ fontSize: 20, opacity: 0.5 }}>›</span>
    </button>
  );
}

type SheetOption = { key: string; label: string; sub: string; selected: boolean; onPick: () => void };

function OptionSheet({
  title,
  options,
  onClose,
}: {
  title: string;
  options: SheetOption[];
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 520,
          background: "rgba(16, 34, 22, 0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          border: CARD_BORDER,
          borderBottom: "none",
          padding: "20px 16px calc(24px + env(safe-area-inset-bottom))",
          color: "#fff",
          maxHeight: "82dvh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <span style={{ width: 40, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.25)" }} />
        </div>
        <h3 style={{ fontSize: 20, fontWeight: 600, margin: "0 6px 14px" }}>{title}</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => { o.onPick(); onClose(); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                textAlign: "left",
                padding: "14px 16px",
                borderRadius: 14,
                background: o.selected ? "rgba(143, 175, 150, 0.28)" : "rgba(255,255,255,0.05)",
                border: o.selected ? "1px solid rgba(143,175,150,0.7)" : "1px solid rgba(255,255,255,0.1)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 16, fontWeight: 600 }}>{o.label}</span>
                <span style={{ display: "block", fontSize: 13, opacity: 0.7, marginTop: 2 }}>{o.sub}</span>
              </span>
              {o.selected && <span style={{ fontSize: 18 }}>✓</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

type SheetKind = null | "morning" | "evening" | "reflection" | "silence";

export default function SimpleRuleEditor({
  onFull,
  onDone,
}: {
  onFull: () => void;
  onDone: () => void;
}) {
  const [sheet, setSheet] = useState<SheetKind>(null);
  // Re-read the localStorage-backed getters whenever a setter fires.
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener(OFFICE_PREFS_EVENT, bump);
    return () => window.removeEventListener(OFFICE_PREFS_EVENT, bump);
  }, []);

  const morningLevel = getExplicitSideLevel("morning");
  const eveningLevel = getExplicitSideLevel("evening");
  const reflection = getReflectionSource();
  // 0, not 5: the seed no longer writes a silence goal (Visio Divina is the
  // default's contemplative practice), so a never-written key means "none".
  // Defaulting to 5 here put the Silence card back on the first save.
  const silenceMin = getGuestSilenceGoalMinRaw() ?? 0;

  function chooseOffice(side: OfficeSide, level: OfficeLevel) {
    setSideLevel(side, level);
    // Owner: "on the light customizer, if they chose offices, have the medium
    // be venite." Applied here as well as /customize — both are the light
    // surface, and leaving one of them on "read" would mean the same choice
    // behaved differently depending on which one you came through.
    //
    // Gated to the FULL office specifically: Venite serves morning-prayer and
    // evening-prayer only (Compline renders blank there — checked), so
    // Compline, psalms, a devotion and the rest keep reading on screen.
    if (level === "office") { setSideEntry(side, "venite"); return; }
    // Match the seed: any other chosen practice reads by default.
    if (level !== "ask") setSideEntry(side, "read");
  }

  function chooseReflection(src: ReflectionSource) {
    setReflectionSource(src);
    setSideReflection("morning", src);
    setSideReflection("evening", src);
  }

  function resetToSimple() {
    setSideLevel("morning", "office");
    setSideLevel("evening", "office");
    // Goes through chooseOffice's rule rather than restating it — this reset
    // sets both sides to the full office, so hard-coding "read" here would
    // produce an office+read pairing the editor itself can no longer create.
    setSideEntry("morning", "venite");
    setSideEntry("evening", "venite");
    setReflectionSource("fdd");
    setSideReflection("morning", "fdd");
    setSideReflection("evening", "fdd");
    setGuestSilenceGoalMin(5);
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "8px 18px 40px", color: "#fff" }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 6px" }}>Your daily rhythm</h1>
        <p style={{ fontSize: 15, lineHeight: 1.5, opacity: 0.82, margin: 0 }}>
          This is your rule of life. Tap any part to change it.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <RuleCard
          emoji="🌅"
          title="Morning"
          value={officeSummary(morningLevel, "morning")}
          onClick={() => setSheet("morning")}
        />
        <RuleCard
          emoji="🌙"
          title="Evening"
          value={officeSummary(eveningLevel, "evening")}
          onClick={() => setSheet("evening")}
        />
        <RuleCard
          emoji="📖"
          title="Reflection"
          value={reflectionSummary(reflection)}
          onClick={() => setSheet("reflection")}
        />
        <RuleCard
          emoji="🕯️"
          title="Silence"
          value={silenceMin > 0 ? `${silenceMin} minutes` : "None"}
          onClick={() => setSheet("silence")}
        />
      </div>

      {/* Reset + full flow */}
      <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 10 }}>
        <button
          type="button"
          onClick={resetToSimple}
          style={{
            padding: "13px 16px",
            borderRadius: 14,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.14)",
            color: "#fff",
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          Reset to the simple rhythm
        </button>
        <button
          type="button"
          onClick={onFull}
          style={{
            padding: "13px 16px",
            borderRadius: 14,
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.7)",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Full customization →
        </button>
      </div>

      {/* Done */}
      <button
        type="button"
        onClick={onDone}
        style={{
          marginTop: 18,
          width: "100%",
          padding: "16px",
          borderRadius: 16,
          background: "#8FAF96",
          border: "none",
          color: "#0f2417",
          fontSize: 17,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Done
      </button>

      {/* ── Sheets ── */}
      {sheet === "morning" && (
        <OptionSheet
          title="Morning prayer"
          onClose={() => setSheet(null)}
          options={OFFICE_CHOICES("morning").map((c) => ({
            key: c.value,
            label: c.label,
            sub: c.sub,
            selected: (morningLevel ?? "ask") === c.value,
            onPick: () => chooseOffice("morning", c.value),
          }))}
        />
      )}
      {sheet === "evening" && (
        <OptionSheet
          title="Evening prayer"
          onClose={() => setSheet(null)}
          options={OFFICE_CHOICES("evening").map((c) => ({
            key: c.value,
            label: c.label,
            sub: c.sub,
            selected: (eveningLevel ?? "ask") === c.value,
            onPick: () => chooseOffice("evening", c.value),
          }))}
        />
      )}
      {sheet === "reflection" && (
        <OptionSheet
          title="Daily reflection"
          onClose={() => setSheet(null)}
          options={REFLECTION_CHOICES.map((c) => ({
            key: c.value,
            label: c.label,
            sub: c.sub,
            selected: reflection === c.value,
            onPick: () => chooseReflection(c.value),
          }))}
        />
      )}
      {sheet === "silence" && (
        <OptionSheet
          title="Silence"
          onClose={() => setSheet(null)}
          options={SILENCE_CHOICES.map((c) => ({
            key: String(c.value),
            label: c.label,
            sub: c.sub,
            selected: silenceMin === c.value,
            onPick: () => setGuestSilenceGoalMin(c.value),
          }))}
        />
      )}
    </div>
  );
}
