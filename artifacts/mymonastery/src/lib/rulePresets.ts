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
import type { CustomSlot, SlottedPractice } from "@/lib/customAnchors";
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
   * WHICH newsletter a side reads when its `pray` is "fdd".
   *
   * The "fdd" level is a sentinel meaning "a reflection is this side's
   * prayer" — whichever one; the source comes from that side's own reflection
   * pref, and sideOfficeTitle names the card from it. Adopting a rule
   * otherwise points every side at `reflections[0]`, which makes the two
   * inseparable: Canterbury Downtown wants Forward Day by Day AS the morning
   * office while the newsletter CARD is the CAC's meditation, and without
   * this the morning anchor came out titled "CAC Daily Meditation".
   * Omitted = the side follows the rule's newsletter, as before.
   */
  anchorReflection?: Partial<Record<OfficeSideKey, ReflectionSource>>;
  /**
   * Standing practices of the rule's own that aren't one of the named ones —
   * written as CUSTOM ANCHORS, the app's existing shape for "a practice only
   * you keep": its own card, its own dot, kept with a tap. `days` scopes it to
   * weekdays (see customAnchors.anchorOnDay).
   */
  customAnchors?: Array<{ title: string; emoji: string; slot: CustomSlot; days?: number[] }>;
  /**
   * A DIFFERENT practice on given weekdays — the seminary keeps Chapel Monday
   * to Friday, Morning Prayer on Saturday and worship on Sunday. Written as
   * officePrefs day rules, which getSideLevel resolves for today; anything
   * unlisted falls through to the side's own `pray`, so "Chapel on weekdays"
   * needs no rule of its own — it's what Saturday and Sunday are excused from.
   */
  dayRules?: Partial<Record<OfficeSideKey, Array<{ days: number[]; pray: PrayChoice; name?: string }>>>;
  /**
   * Standing practices that aren't a side's ANCHOR — Visio Divina, a
   * Contemplative Walk, Audio Divina. They have their own home cards rather
   * than replacing an office, so a rule whose morning IS Visio Divina sets
   * `pray: "none"` for that side and turns the practice on here.
   *
   * adoptRule clears all of these first, so a preset only has to name what it
   * wants — nothing carries over from the rule being replaced.
   */
  practices?: Partial<Record<"cobreathe" | "audio" | "examen" | "walk" | "visio" | "compline", boolean>>;
  /** Which part of the day those practices ride at (customAnchors.setPracticeSlot). */
  practiceSlots?: Partial<Record<SlottedPractice, CustomSlot>>;
};

// The order is the owner's, not a formula: A Gentle Start leads because it's
// where someone with no rule should begin, and the Daily Office follows it.
// Each maps to a real school of prayer — the catechumen's first anchor,
// prayer-book Anglicanism, the Keating/Centering stream, and one seminary's
// own day.
export const RULE_PRESETS: RulePreset[] = [
  // A GENTLE START — the default rhythm, and the one a person with no rule
  // gets. Simple Guided Prayer opens the day (three minutes: praise,
  // confession, thanksgiving, supplication) and the Examen closes it — the
  // SAME row on either side, which is how the customizer already pairs them.
  //
  // Forward Day by Day is this rule's contemplative practice. That isn't a
  // metaphor: with no silence goal and no per-side sit, computeWeeklyGrid's
  // middle row falls to the newsletter (middleIsNewsletter), so FDD is
  // literally what sits between Morning and Evening on the weekly card.
  { id: "morning-anchor", emoji: "🌅", sides: { morning: true, evening: true },
    pray: "guidedPrayer", evening: "examen", silence: false, goalMin: 0, reflections: ["fdd"],
    title: "A Gentle Start", blurb: "The everyday rhythm: three minutes to open the day, the day's word to carry, and the Examen to close it.",
    rows: [
      { emoji: "🙌", label: "Simple Guided Prayer in the morning" },
      { emoji: "📖", label: "Forward Day by Day" },
      { emoji: "🌙", label: "The Examen in the evening" },
    ] },
  // THE DAILY OFFICE — full Morning & Evening Prayer from the Book of Common Prayer.
  { id: "offices",        emoji: "📖", sides: { morning: true, evening: true },  pray: "offices",  silence: false, goalMin: 0, reflections: ["fdd"],
    title: "The Daily Office", blurb: "Morning and Evening Prayer in full, from the Book of Common Prayer.",
    rows: [{ emoji: "🌅", label: "Morning Prayer" }, { emoji: "🌆", label: "Evening Prayer" }, { emoji: "📖", label: "Forward Day by Day" }] },
  // CENTERING PRAYER — two daily sits of silence in the school of Thomas Keating,
  // with the Center for Action & Contemplation's daily meditation. Contemplation
  // IS the prayer (pray "none" + silence), so it's the sit alone — no office.
  { id: "centering",      emoji: "🕯️", sides: { morning: true, evening: true },  pray: "none", silence: true, goalMin: 15, reflections: ["cac"],
    title: "Centering Prayer", blurb: "Two daily sits in the school of Thomas Keating. The silence is the prayer.",
    rows: [{ emoji: "🕯️", label: "15 minutes of silence, morning and evening" }, { emoji: "📖", label: "The CAC's Daily Meditation" }] },
  // VTS CHAPEL & COMMENTARY — the seminary's own day (owner). Chapel opens it,
  // Creation Prayer closes it, the Dean's word and a ten-minute sit sit between,
  // and the community meal is kept on the days the community actually eats
  // together.
  //
  // The evening side is the BREATH (silence + silenceSide "evening" +
  // contemplationStyle "cobreathe"), while goalMin 10 raises the separate
  // all-day contemplation card — useRhythmState's silenceGoalCardActive
  // explicitly allows that pairing (`creationPerSide && contemplationGoalMin >
  // 0`), and that card opens the SILENT timer, so the ten minutes are a real
  // sit rather than breaths.
  { id: "vts", emoji: "🦩", sides: { morning: true, evening: true },
    pray: "ownPractice", evening: "none",
    customNames: { morning: "Chapel" },
    silence: true, silenceSide: "evening", contemplationStyle: "cobreathe", goalMin: 10,
    reflections: ["vts"],
    customAnchors: [{ title: "Community Meal", emoji: "🍽️", slot: "midday", days: WEEKDAYS }],
    // Chapel is a WEEKDAY thing (owner). It needs no rule of its own — these
    // two excuse the weekend from it: Saturday keeps Morning Prayer, and
    // Sunday is worship, which is a thing you go to rather than a thing the
    // app leads, so it's a practice of your own that you keep with a tap.
    // Rename it "Eucharist" here if that's the truer word for the Sunday.
    dayRules: {
      morning: [
        { days: [6], pray: "offices" },
        { days: [0], pray: "ownPractice", name: "Worship" },
      ],
    },
    title: "VTS Chapel & Commentary", blurb: "The seminary's day — Chapel on weekdays, Morning Prayer on Saturday, worship on Sunday, the Dean's word, ten minutes of silence, and Creation Prayer at its close.",
    rows: [
      { emoji: "⛪", label: "Chapel on weekdays" },
      { emoji: "📖", label: "Morning Prayer on Saturdays" },
      { emoji: "🕊️", label: "Worship on Sundays" },
      { emoji: "🦩", label: "The VTS Dean's Commentary" },
      { emoji: "🕯️", label: "10 minutes of contemplative prayer" },
      { emoji: "🌍", label: "Creation Prayer in the evening" },
      { emoji: "🍽️", label: "Community Meal, weekdays" },
    ] },
  // CONTEMPLATIVE ART (owner) — a rule for someone who prays with their eyes.
  // The morning is Visio Divina, which is a practice with its OWN card rather
  // than an office, so the morning side takes no anchor (`pray: "none"`) and
  // the practice is turned on instead. Richard Rohr's daily meditation is the
  // word between them, the day closes with the Examen, and the contemplation
  // is a walk rather than a sit — nothing here asks you to sit still, which is
  // the point of it.
  { id: "contemplative-art", emoji: "🖼️", sides: { morning: true, evening: true },
    pray: "none", evening: "examen",
    practices: { visio: true, walk: true },
    practiceSlots: { visio: "morning", walk: "afternoon" },
    silence: false, goalMin: 0,
    reflections: ["cac"],
    title: "Contemplative Art", blurb: "Praying with your eyes — an artwork in the morning, Richard Rohr's meditation in the day, a walk instead of a sit, and the Examen at its close.",
    rows: [
      { emoji: "🖼️", label: "Visio Divina in the morning" },
      { emoji: "📖", label: "The CAC Daily Meditation" },
      { emoji: "🚶", label: "A Contemplative Walk" },
      { emoji: "🌗", label: "The Examen in the evening" },
    ] },
  // CANTERBURY DOWNTOWN (owner) — the chaplaincy's rhythm. Forward Day by Day
  // IS the morning office here (level "fdd", not the newsletter card), Simple
  // Guided Prayer closes the day, and the contemplation is Audio Divina —
  // music as the way of prayer rather than a sit. Creation Prayer rides
  // alongside as a standing practice.
  //
  // Audio Divina and Creation Prayer are practices with their own cards, not
  // office anchors, so they're turned on in `practices` rather than named as a
  // side's way. Note the vocabulary seam: the practices key is "audio" while
  // the slot/home-layout key for the same thing is "listening".
  //
  // No silence goal and no per-side sit — the listening is the contemplation.
  { id: "canterbury-downtown", emoji: "🏙️", sides: { morning: true, evening: true },
    pray: "fdd", evening: "guidedPrayer",
    // The morning office IS Forward Day by Day; the newsletter card is the
    // CAC's meditation. Two different readings, so the side's source is named
    // here rather than inherited from `reflections`.
    anchorReflection: { morning: "fdd" },
    practices: { audio: true, cobreathe: true },
    practiceSlots: { listening: "anytime", cobreathe: "anytime" },
    silence: false, goalMin: 0,
    reflections: ["cac"],
    title: "Canterbury Downtown", blurb: "Forward Day by Day to open the morning, music as the day's contemplation, Richard Rohr's meditation, and three minutes of guided prayer at its close.",
    rows: [
      { emoji: "🌅", label: "Forward Day by Day in the morning" },
      { emoji: "📖", label: "The CAC Daily Meditation" },
      { emoji: "🎵", label: "Audio Divina" },
      { emoji: "🌍", label: "Creation Prayer" },
      { emoji: "🙌", label: "Simple Guided Prayer in the evening" },
    ] },
];
