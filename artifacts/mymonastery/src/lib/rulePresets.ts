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
   * inseparable — a rule wanting Forward Day by Day AS its morning office
   * while the newsletter CARD is the CAC's meditation got a morning anchor
   * titled "CAC Daily Meditation" without this.
   *
   * NO PRESET USES IT TODAY. Canterbury Downtown was the case it was written
   * for, and the owner has since reshaped that rule to the Psalter; this is
   * kept because the seam it covers is real and the next rule pairing an
   * anchor-reflection with a different newsletter would hit it again.
   * Omitted = the side follows the rule's newsletter, as before.
   */
  anchorReflection?: Partial<Record<OfficeSideKey, ReflectionSource>>;
  /**
   * Standing practices of the rule's own that aren't one of the named ones —
   * written as CUSTOM ANCHORS, the app's existing shape for "a practice only
   * you keep": its own card, its own dot, kept with a tap. `days` scopes it to
   * weekdays (see customAnchors.anchorOnDay).
   */
  customAnchors?: Array<{
    title: string; emoji: string; slot: CustomSlot; days?: number[];
    /** BESPOKE TO VTS (owner): this practice can also be kept by praying an
     *  office in the app — its log popup offers that as a third choice, and
     *  finishing the office credits it. Nothing else sets this. */
    office?: "morning" | "evening";
  }>;
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
      { emoji: "🙌🏽", label: "Simple Guided Prayer in the morning" },
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
    // The morning is SIMPLE GUIDED PRAYER (owner). Chapel is no longer the
    // morning's named practice: it stands on its own below, with its own card
    // and its own "Open Morning Prayer" door. Carrying it in BOTH places put
    // two Chapels in the rhythm — one from the side, one from the practice.
    pray: "guidedPrayer", evening: "none",
    silence: true, silenceSide: "evening", contemplationStyle: "cobreathe", goalMin: 10,
    reflections: ["vts"],
    customAnchors: [
      // CHAPEL — the seminary's own practice, and the reason `office` exists.
      // Chapel is sometimes Morning Prayer, so its log popup offers "Open
      // Morning Prayer" alongside Done: a student without the physical prayer
      // book prays it here and it counts (owner). It arrives ONLY with this
      // preset — it isn't in the customizer's list of practices to add.
      { title: "Chapel", emoji: "⛪", slot: "morning", days: WEEKDAYS, office: "morning" as const },
      { title: "Community Meal", emoji: "🍽️", slot: "midday", days: WEEKDAYS },
    ],
    // Chapel scopes ITSELF to weekdays now (its own `days`), so these rules are
    // only about the weekend's own shape: Saturday keeps Morning Prayer, and
    // Sunday is worship — a thing you go to rather than a thing the app leads,
    // so it stays a practice of your own that you keep with a tap.
    dayRules: {
      morning: [
        { days: [6], pray: "offices" },
        { days: [0], pray: "ownPractice", name: "Worship" },
      ],
    },
    title: "VTS Chapel & Commentary", blurb: "The seminary's day — Chapel on weekdays, Morning Prayer on Saturday, worship on Sunday, the Dean's word, ten minutes of silence, and Creation Prayer at its close.",
    rows: [
      { emoji: "⛪", label: "Chapel on weekdays — or pray Morning Prayer here" },
      { emoji: "🙌🏽", label: "Simple Guided Prayer in the morning" },
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
      { emoji: "🚶🏽", label: "A Contemplative Walk" },
      { emoji: "🌗", label: "The Examen in the evening" },
    ] },
  // CANTERBURY DOWNTOWN (owner) — the chaplaincy's rhythm, reshaped: "Morning
  // Psalms / Creation Prayer for Contemplation / Evening Psalms."
  //
  // The Psalter on both sides, and the contemplation is Creation Prayer rather
  // than a silent sit — `contemplationStyle: "cobreathe"` is that practice
  // (the creation OFFICE, PrayChoice "creation", is flag-off and degrades to a
  // normal office, so a preset must never reach for it by that name).
  //
  // `silence: true` with no silenceSide is what carries the contemplation onto
  // every side the rule turns on; goalMin 10 sizes it, as VTS's does.
  //
  // Audio Divina and the standing Creation Prayer practice are BOTH gone from
  // here: music WAS this rule's contemplation and Creation Prayer has taken
  // that seat, so keeping either would leave the rule holding two answers to
  // one question. The CAC meditation stays — a reflection is a different axis
  // from the anchors, and the owner's three lines didn't touch it.
  { id: "canterbury-downtown", emoji: "🏙️", sides: { morning: true, evening: true },
    pray: "psalms",
    /**
     * "Creation Prayer for contemplation" is the STANDALONE practice — one 🌍
     * card, available all day — so it's said with `practices`, the vocabulary
     * for exactly that (as Contemplative Art says its walk and its artwork).
     *
     * It was said with `silence: true, contemplationStyle: "cobreathe",
     * goalMin: 10` — and with no silenceSide that means a breath ANCHOR on
     * BOTH sides plus a ten-minute silence goal: the adopted rule grew
     * "Morning Creation Prayer", "Evening Creation Prayer" AND "Silence ·
     * 10 min a day", three rows the card never promised (owner, with
     * screenshots: "those extra practices shouldn't have been there in the
     * first place"). silence/goalMin/contemplationStyle describe SITS; a
     * standing practice is `practices`. The card's rows are the contract —
     * if an encoding produces a row the card doesn't show, the encoding is
     * wrong, not the card.
     */
    silence: false, goalMin: 0,
    practices: { cobreathe: true },
    practiceSlots: { cobreathe: "anytime" },
    reflections: ["cac"],
    title: "Canterbury Downtown", blurb: "The Psalter morning and evening, Creation Prayer as the day's contemplation, and Richard Rohr's meditation between them.",
    rows: [
      { emoji: "📜", label: "Psalms in the morning" },
      { emoji: "🌍", label: "Creation Prayer for contemplation" },
      { emoji: "📖", label: "The CAC Daily Meditation" },
      { emoji: "📜", label: "Psalms in the evening" },
    ] },
];
