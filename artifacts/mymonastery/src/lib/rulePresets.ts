// ── The named starter rules ──────────────────────────────────────────────────
//
// The DATA behind "start from a preset", lifted out of WayOfLoveRuleFlow so the
// light customizer (/customize, the logged-out / device-local editor) can offer
// the same rules from the same definitions. Only the data lives here: the full
// customizer applies a rule through its own React state so it can land on the
// review screen, while /customize writes device-local prefs directly — but both
// read THIS list, so a rule can't mean two different things depending on which
// editor you opened.

import type { ReflectionSource } from "@/lib/officePrefs";
import type { CustomSlot } from "@/lib/customAnchors";
import { WEEKDAYS } from "@/lib/customAnchors";

export type OfficeSideKey = "morning" | "evening";

export type PrayChoice = "none" | "community" | "devotion" | "offices" | "compline" | "contemplation" | "fdd" | "readings" | "psalms" | "examen" | "creation" | "guidedPrayer" | "ownPractice";

export type RulePreset = {
  id: string; emoji: string;
  sides: { morning: boolean; evening: boolean };
  pray: PrayChoice;
  /** Evening's way when it differs from the morning (e.g. Morning Prayer +
   *  Evening Devotion). Omitted = same as `pray`. */
  evening?: PrayChoice;
  silence: boolean; goalMin: number;
  /** Display copy — present on the NAMED rules (which a person picks off a
   *  list and must be able to read before adopting), absent on the time
   *  ladder's inline presets (whose rows live on the TimeStep instead). */
  title?: string; blurb?: string;
  rows?: Array<{ emoji: string; label: string }>;
  /** Which side carries the silent sit. Omitted = every side the preset turns
   *  on (the named rules); the time ladder pins ONE sit ("5 minutes of
   *  silence" means five, not five per side). */
  silenceSide?: OfficeSideKey;
  /** Which contemplative practice the sit IS. Omitted = the silent sit.
   *  "cobreathe" is the practice the owner renamed "Creation Prayer" — the
   *  creation OFFICE (PrayChoice "creation") is flag-off and degrades to a
   *  normal office, so a preset must never reach for it by that name. */
  contemplationStyle?: "silent" | "cobreathe";
  reflections: ReflectionSource[];
  /** Names for sides whose `pray` is "ownPractice" (e.g. VTS's "Chapel"). */
  customNames?: Partial<Record<OfficeSideKey, string>>;
  /**
   * Standing practices of the rule's own that aren't one of the named ones —
   * written as CUSTOM ANCHORS, the app's existing shape for "a practice only
   * you keep": its own card, its own dot, kept with a tap. `days` scopes it to
   * weekdays (see customAnchors.anchorOnDay).
   */
  customAnchors?: Array<{ title: string; emoji: string; slot: CustomSlot; days?: number[] }>;
};

// Ordered by ascending commitment (least → most time), so a beginner reads down
// from the gentlest rule. Each maps to real schools of prayer: the catechumen's
// first anchor, the Benedictine psalter, the Keating/Centering stream, and
// prayer-book Anglicanism.
export const RULE_PRESETS: RulePreset[] = [
  // A GENTLE START — the smallest rule: one short morning prayer. For beginning.
  { id: "morning-anchor", emoji: "🌅", sides: { morning: true, evening: false }, pray: "devotion", silence: false, goalMin: 0, reflections: ["fdd"],
    title: "A Gentle Start", blurb: "The smallest rule that is still a rule: one short prayer to open the day.",
    rows: [{ emoji: "🌅", label: "A short morning devotion" }, { emoji: "📖", label: "Forward Day by Day" }] },
  // THE PSALMS — the shape a brand-new user already has on their home (Morning +
  // Evening Psalms + Forward Day by Day + a 5-minute silence). Keep in sync with
  // the new-user defaults: getSideLevel→"psalms", the FDD reflection fallback,
  // and the 5-minute starter goal in useRhythmState — so Customize opens
  // reflecting what's on the home, not a different rule.
  { id: "psalms-daily",   emoji: "📜", sides: { morning: true, evening: true },  pray: "psalms",   silence: true,  goalMin: 5,  reflections: ["fdd"],
    title: "The Psalms", blurb: "The Benedictine shape — the psalter morning and evening, with a few minutes of silence.",
    rows: [{ emoji: "🌅", label: "The morning Psalms" }, { emoji: "🌆", label: "The evening Psalms" }, { emoji: "📖", label: "Forward Day by Day" }, { emoji: "🕯️", label: "5 minutes of silence" }] },
  // CENTERING PRAYER — two daily sits of silence in the school of Thomas Keating,
  // with the Center for Action & Contemplation's daily meditation. Contemplation
  // IS the prayer (pray "none" + silence), so it's the sit alone — no office.
  { id: "centering",      emoji: "🕯️", sides: { morning: true, evening: true },  pray: "none", silence: true, goalMin: 15, reflections: ["cac"],
    title: "Centering Prayer", blurb: "Two daily sits in the school of Thomas Keating. The silence is the prayer.",
    rows: [{ emoji: "🕯️", label: "15 minutes of silence, morning and evening" }, { emoji: "📖", label: "The CAC's Daily Meditation" }] },
  // THE DAILY OFFICE — full Morning & Evening Prayer from the Book of Common Prayer.
  { id: "offices",        emoji: "📖", sides: { morning: true, evening: true },  pray: "offices",  silence: false, goalMin: 0, reflections: ["fdd"],
    title: "The Daily Office", blurb: "Morning and Evening Prayer in full, from the Book of Common Prayer.",
    rows: [{ emoji: "🌅", label: "Morning Prayer" }, { emoji: "🌆", label: "Evening Prayer" }, { emoji: "📖", label: "Forward Day by Day" }] },
  // VTS CULTIVATE — Virginia Theological Seminary's rule (owner). The breath
  // morning and evening + the Dean's word. "Creation Prayer" here is the BREATH
  // (contemplationStyle "cobreathe"), which is what that name now means; pray
  // "none" because the breath IS the prayer, the same shape "centering" uses.
  { id: "vts-cultivate", emoji: "🦩", sides: { morning: true, evening: true }, pray: "none",
    // goalMin 0 on purpose: `silence: true` is what puts the practice on both
    // sides, while goalMin writes a daily contemplative-MINUTES goal. The breath
    // is counted in breaths (a dozen of them, a minute or two), so a 5-minute
    // goal would be one this rule can never meet — an unfillable dot.
    silence: true, goalMin: 0, contemplationStyle: "cobreathe", reflections: ["vts"],
    title: "VTS Cultivate", blurb: "Virginia Theological Seminary's rhythm — breathing with creation at both ends of the day, and the Dean's word between them.",
    rows: [{ emoji: "🌅", label: "Creation Prayer in the morning" }, { emoji: "🌆", label: "Creation Prayer in the evening" }, { emoji: "🦩", label: "The VTS Dean's Commentary" }] },
  // VTS — the seminary's own day (owner). Chapel opens it, Creation Prayer
  // closes it, the Dean's word and a ten-minute sit sit between, and the
  // community meal is kept on the days the community actually eats together.
  //
  // The evening side is the BREATH (silence + silenceSide "evening" +
  // contemplationStyle "cobreathe"), while goalMin 10 raises the separate
  // all-day contemplation card — useRhythmState's silenceGoalCardActive
  // explicitly allows that pairing (`creationPerSide && contemplationGoalMin >
  // 0`), and that card opens the SILENT timer, so the ten minutes are a real
  // sit rather than breaths. This is why goalMin is safe here where VTS
  // Cultivate had to leave it at 0: that rule had no second contemplative
  // anchor to hold the minutes.
  { id: "vts", emoji: "🦩", sides: { morning: true, evening: true },
    pray: "ownPractice", evening: "none",
    customNames: { morning: "Chapel" },
    silence: true, silenceSide: "evening", contemplationStyle: "cobreathe", goalMin: 10,
    reflections: ["vts"],
    customAnchors: [{ title: "Community Meal", emoji: "🍽️", slot: "midday", days: WEEKDAYS }],
    title: "VTS", blurb: "The seminary's day — Chapel in the morning, the Dean's word, ten minutes of silence, and Creation Prayer at its close.",
    rows: [
      { emoji: "⛪", label: "Chapel in the morning" },
      { emoji: "🦩", label: "The VTS Dean's Commentary" },
      { emoji: "🕯️", label: "10 minutes of contemplative prayer" },
      { emoji: "🌍", label: "Creation Prayer in the evening" },
      { emoji: "🍽️", label: "Community Meal, weekdays" },
    ] },
];
