// ── The named starter rules ──────────────────────────────────────────────────
//
// The DATA behind "start from a preset", lifted out of WayOfLoveRuleFlow so the
// light customizer (/customize, the logged-out / device-local editor) can offer
// the same rules from the same definitions. Only the data lives here: the full
// customizer applies a rule through its own React state so it can land on the
// review screen, while /customize writes device-local prefs directly — but both
// read THIS list, so a rule can't mean two different things depending on which
// editor you opened.

import type { LectioMode, ReflectionSource } from "@/lib/officePrefs";
import type { CustomSlot, SlottedPractice, RelationalPracticeId } from "@/lib/customAnchors";

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
   *  "cobreathe" is the practice the owner renamed "Breathing Together" — the
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
   * for, and the owner has reshaped that rule twice since; this is kept
   * because the seam it covers is real and the next rule pairing an
   * anchor-reflection with a different newsletter would hit it again — all
   * the more so now that Canterbury carries TWO newsletters, where "the
   * side's reflection" and "the rule's newsletters" are no longer the same
   * single thing.
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
  practices?: Partial<Record<"cobreathe" | "audio" | "examen" | "walk" | "visio" | "compline" | "lectio", boolean>>;
  /**
   * WHICH WAY Lectio Divina is kept — the slideshow, or the guided audio.
   * Only meaningful for a rule that turns the lectio practice on (Guided
   * Audio). Omitted = the person's own setting, untouched.
   */
  lectioMode?: LectioMode;
  /** Which part of the day those practices ride at (customAnchors.setPracticeSlot). */
  practiceSlots?: Partial<Record<SlottedPractice, CustomSlot>>;
  /**
   * RELATIONAL practices the rule keeps (customAnchors.RELATIONAL_PRACTICES
   * ids — "gratitude", "hug", "call"). Adopting ADDS these to whatever
   * relational practices the person already keeps; it never removes one —
   * both adopt paths deliberately spare relational anchors in their sweep
   * (see the 2026-09-02 audit fix), and a rule saying "thank someone" is not
   * a reason to stop hugging anyone.
   */
  relational?: RelationalPracticeId[];
};

// The order is the owner's, not a formula: A Gentle Start leads because it's
// where someone with no rule should begin, and the Daily Office follows it.
// Each maps to a real school of prayer — the catechumen's first anchor,
// prayer-book Anglicanism, the Keating/Centering stream, and one seminary's
// own day.
/** Monday–Friday, for practices a seminary keeps on the days it meets. */
const WEEKDAYS = [1, 2, 3, 4, 5];

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
    // The day's word is the Nouwen devotion since Forward Day by Day was
    // retired (owner, 2026-09-30; lib/retiredReflections).
    pray: "guidedPrayer", evening: "examen", silence: false, goalMin: 0, reflections: ["nouwen"],
    // Breathing Together (owner, 2026-10-04). A standing practice with its own
    // card — not a sit, so it needs no silence goal and takes no side's anchor.
    practices: { cobreathe: true },
    title: "A Gentle Start", blurb: "The everyday rhythm: three minutes to open the day, the day's word to carry, a breath for the world, and the Examen to close it.",
    rows: [
      { emoji: "🙌🏽", label: "Simple Guided Prayer in the morning" },
      { emoji: "\u{1F60A}", label: "The Daily Devotion" },
      { emoji: "🌍", label: "Breathing Together" },
      { emoji: "🌙", label: "The Examen in the evening" },
    ] },
  // THE DAILY OFFICE — full Morning & Evening Prayer from the Book of Common Prayer.
  { id: "offices",        emoji: "📖", sides: { morning: true, evening: true },  pray: "offices",  silence: false, goalMin: 0, reflections: ["nouwen"],
    // Breathing Together (owner, 2026-10-04) — see A Gentle Start above.
    practices: { cobreathe: true },
    title: "The Daily Office", blurb: "Morning and Evening Prayer in full, from the Book of Common Prayer, with a breath for the world between them.",
    rows: [
      { emoji: "🌅", label: "Morning Prayer" },
      { emoji: "🌆", label: "Evening Prayer" },
      { emoji: "\u{1F60A}", label: "The Daily Devotion" },
      { emoji: "🌍", label: "Breathing Together" },
    ] },
  // CENTERING PRAYER — two daily sits of silence in the school of Thomas
  // Keating. Contemplation IS the prayer (pray "none" + silence), so it's the
  // sit alone — no office.
  //
  // The day's word is the Nouwen devotion (owner, 2026-10-04: "In Centering
  // Prayer switch it to Nouwen Devotion"). It was the CAC's daily meditation;
  // the CAC is untouched everywhere else, this rule simply no longer names it.
  { id: "centering",      emoji: "🕯️", sides: { morning: true, evening: true },  pray: "none", silence: true, goalMin: 15, reflections: ["nouwen"],
    title: "Centering Prayer", blurb: "Two daily sits in the school of Thomas Keating. The silence is the prayer.",
    rows: [{ emoji: "🕯️", label: "15 minutes of silence, morning and evening" }, { emoji: "\u{1F60A}", label: "The Daily Devotion" }] },
  // CANTERBURY DOWNTOWN (owner) — v4, 2026-10-02: "Make Canterbury Downtown —
  // Morning: Breathing Together · Taize Daily · Audio Divina."
  //
  // (v3, 2026-09-25, was "Morning: Simple Guided / Newsletter: Henri Nowen /
  // Newsletter: Taize / Evening: Breathing Together". Simple Guided Prayer,
  // the Nouwen devotion and the evening are gone with it — a rule is what the
  // owner says it is, and re-adopting sweeps the old shape away like any rule
  // swap.)
  //
  // …AND THE EXAMEN, added the same day (owner, 2026-10-02: "Put the Examen in
  // Canterbury Routine"). Four cards: Breathing Together, Audio Divina and the
  // Examen are standing practices with their own cards and Taizé Daily is a
  // newsletter, so both sides take `pray: "none"` and there is no prayer anchor
  // — the same shape Centering Prayer uses for a sit with no office.
  //
  // THE EXAMEN IS A CARD, NOT THE EVENING'S ANCHOR. The evening side stays off:
  // nobody asked for an evening, and an anchor would be a fifth thing on a rule
  // of four. The card is available all day like the others (getPracticeSlot
  // hard-returns "anytime" for it).
  //
  // "Taize" here is `taizeprayer`, Brother Matthew's DAILY prayer — not the
  // weekly Taizé meditation, which is retired (owner, 2026-09-23).
  //
  // "MORNING" CANNOT BE PINNED. getPracticeSlot (lib/customAnchors) hard-returns
  // "anytime" for cobreathe and listening — their time-of-day pickers are gone —
  // so the slots below are what the rule SAYS, written for the day a picker
  // returns, and the cards will show as available all day until then. The
  // NEWSLETTER is the one thing here with a morning of its own.
  //
  // NOTE THE TWO VOCABULARIES for Audio Divina: `practices` calls it "audio",
  // `practiceSlots` and the home layout call it "listening".
  { id: "canterbury-downtown", emoji: "\u{1F3D9}\u{FE0F}", sides: { morning: true, evening: false },
    pray: "none",
    silence: false, goalMin: 0,
    reflections: ["taizeprayer"],
    practices: { cobreathe: true, audio: true, examen: true },
    practiceSlots: { cobreathe: "morning", listening: "morning" },
    title: "Canterbury Downtown", blurb: "Breathing Together, the daily prayer from Taiz\u00e9 and music as prayer to begin, and the Examen to look back on the day.",
    rows: [
      { emoji: "\u{1F30D}", label: "Breathing Together" },
      { emoji: "\u{1F304}", label: "Taiz\u00e9 Daily Prayer" },
      { emoji: "\u{1F3A7}", label: "Audio Divina" },
      { emoji: "\u{1F317}", label: "The Examen" },
    ] },
  /* VTS and CONTEMPLATIVE ART ARE GONE (owner, 2026-10-04: "Get rid of VTS
     routine" · "Get rid of Contemplative Art"). Removing a rule from this list
     only stops it being OFFERED — a person who adopted one keeps the rhythm
     they adopted, because adopting copies the shape into their own settings
     rather than pointing at the preset. Chapel (VTS's weekday custom anchor)
     and the anchorReflection field both lived here; `anchorReflection` is
     still carried by Guided Audio below, and `customAnchors` + `dayRules` now
     have no caller, which is fine — they are part of the preset vocabulary,
     not of any one rule. */

  // GUIDED AUDIO (owner, 2026-10-04) — "Morning: Pray As You Go / Evening:
  // Lectio guided / The add henri Nouwen / And Breathing Together".
  //
  // THE MORNING IS A REFLECTION, AND A DIFFERENT ONE FROM THE RULE'S. That is
  // what `pray: "fdd"` + `anchorReflection` are for: "fdd" is the sentinel
  // meaning "a reflection is this side's prayer", and anchorReflection says
  // WHICH — Pray As You Go, which is listened to rather than read, so the
  // morning card opens the player. The rule's newsletter is the Nouwen
  // devotion, a different source, which without anchorReflection would have
  // retitled the morning after it. (Contemplative Art was the rule that
  // proved this seam; it is gone, and this one inherits the shape.)
  //
  // Pray As You Go is deliberately NOT in `reflections`: it is the morning
  // anchor, and listing it would put a second card for the same session
  // underneath the one that already is it.
  //
  // THE EVENING IS LECTIO, AS A PRACTICE, NOT AN ANCHOR. Lectio Divina has its
  // own card, so the evening side takes no anchor and the practice is turned
  // on here, slotted to the evening. `lectioMode: "audio"` is what makes it
  // the GUIDED one — /lectio stays the single door and hands off to the audio.
  { id: "guided-audio", emoji: "\u{1F3A7}", sides: { morning: true, evening: true },
    pray: "fdd", evening: "none",
    anchorReflection: { morning: "payg" },
    silence: false, goalMin: 0,
    reflections: ["nouwen"],
    practices: { lectio: true, cobreathe: true },
    practiceSlots: { lectio: "evening" },
    lectioMode: "audio",
    title: "Guided Audio", blurb: "Pray As You Go to open the day, the day's word to carry, a breath for the world, and guided Lectio Divina in the evening.",
    rows: [
      { emoji: "\u{1F647}\u{1F3FD}", label: "Pray As You Go in the morning" },
      { emoji: "\u{1F60A}", label: "The Daily Devotion" },
      { emoji: "\u{1F30D}", label: "Breathing Together" },
      { emoji: "\u{1F4D6}", label: "Guided Lectio Divina in the evening" },
    ] },

  // DAILY SCRIPTURE READING (owner, 2026-10-04) — "Morning and Evening: Daily
  // Scripture / Newsletter: Forward / Contemplative: Breathing Together".
  //
  // "readings" is the Daily Scripture Readings level on BOTH sides, so the
  // same `pray` covers them and no `evening` override is needed. The deck
  // credits ONE side per reading (reference_scripture_deck_side_credit), which
  // is exactly what a rule with a reading morning AND evening wants.
  //
  // Forward Day by Day is offered again since 2026-10-01 ("lets bring back
  // forward and SSJE"), so a rule may name it; RETIRED_REFLECTIONS is empty
  // and nothing will move this rule off it.
  //
  // "Contemplative: Breathing Together" is the standing practice, not a silent
  // sit — no goal, no per-side sit, its own card.
  { id: "daily-scripture", emoji: "\u{1F4DC}", sides: { morning: true, evening: true },
    pray: "readings",
    silence: false, goalMin: 0,
    reflections: ["fdd"],
    practices: { cobreathe: true },
    title: "Daily Scripture Reading", blurb: "The day's appointed readings morning and evening, Forward Day by Day to carry, and a breath for the world.",
    rows: [
      { emoji: "\u{1F305}", label: "The day's readings in the morning" },
      { emoji: "\u{1F306}", label: "The day's readings in the evening" },
      { emoji: "\u{1F4D8}", label: "Forward Day by Day" },
      { emoji: "\u{1F30D}", label: "Breathing Together" },
    ] },
];
