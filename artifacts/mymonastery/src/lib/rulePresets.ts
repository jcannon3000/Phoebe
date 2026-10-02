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
  practices?: Partial<Record<"cobreathe" | "audio" | "examen" | "walk" | "visio" | "compline", boolean>>;
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
    title: "A Gentle Start", blurb: "The everyday rhythm: three minutes to open the day, the day's word to carry, and the Examen to close it.",
    rows: [
      { emoji: "🙌🏽", label: "Simple Guided Prayer in the morning" },
      { emoji: "\u{1F60A}", label: "The Daily Devotion" },
      { emoji: "🌙", label: "The Examen in the evening" },
    ] },
  // THE DAILY OFFICE — full Morning & Evening Prayer from the Book of Common Prayer.
  { id: "offices",        emoji: "📖", sides: { morning: true, evening: true },  pray: "offices",  silence: false, goalMin: 0, reflections: ["nouwen"],
    title: "The Daily Office", blurb: "Morning and Evening Prayer in full, from the Book of Common Prayer.",
    rows: [{ emoji: "🌅", label: "Morning Prayer" }, { emoji: "🌆", label: "Evening Prayer" }, { emoji: "\u{1F60A}", label: "The Daily Devotion" }] },
  // CENTERING PRAYER — two daily sits of silence in the school of Thomas Keating,
  // with the Center for Action & Contemplation's daily meditation. Contemplation
  // IS the prayer (pray "none" + silence), so it's the sit alone — no office.
  { id: "centering",      emoji: "🕯️", sides: { morning: true, evening: true },  pray: "none", silence: true, goalMin: 15, reflections: ["cac"],
    title: "Centering Prayer", blurb: "Two daily sits in the school of Thomas Keating. The silence is the prayer.",
    rows: [{ emoji: "🕯️", label: "15 minutes of silence, morning and evening" }, { emoji: "📖", label: "The CAC's Daily Meditation" }] },
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
  // VTS (owner, 2026-09-03: "Make the VTS Preset — Simple Guided (Morning),
  // VTS Dean's Commentary, Express Gratitude, Visio Divina, The Examen
  // (Evening)"). This REPLACES the seminary's Chapel-and-Community-Meal day
  // under the same id, so anyone who adopted the old shape is still "on VTS"
  // and re-adopting sweeps Chapel and the meal away like any other rule swap.
  //
  // Morning and evening are the same pair A Gentle Start uses (Simple Guided
  // Prayer opens, the Examen closes). Visio Divina is a standing practice
  // with its own card, so it's said with `practices`, at no fixed hour; the
  // Dean's word is the reflection; Express gratitude arrives through
  // `relational`, the same machinery the default seed uses for it.
  { id: "vts", emoji: "🦩", sides: { morning: true, evening: true },
    // v3 (owner, 2026-09-05): "Morning: Simple · Chapel (Weekdays Only) ·
    // Dean's Commentary · Breathing Together · Visio Divina · Evening: Examen".
    // Chapel comes back as the seminary's own practice — a custom anchor on
    // weekdays, whose log popup still offers Morning Prayer as a way to keep
    // it (`office`). Breathing Together and Visio Divina are standing practices
    // with their own cards; Express Gratitude is no longer named (adopting
    // never removes a relational practice anyone already keeps).
    pray: "guidedPrayer", evening: "examen",
    silence: false, goalMin: 0,
    reflections: ["vts"],
    customAnchors: [
      { title: "Chapel", emoji: "⛪", slot: "morning", days: WEEKDAYS, office: "morning" as const },
    ],
    practices: { cobreathe: true, visio: true },
    practiceSlots: { visio: "anytime" },
    title: "VTS", blurb: "Simple Guided Prayer in the morning, Chapel on weekdays, the VTS Dean's Commentary, Breathing Together, Visio Divina, and the Examen in the evening.",
    rows: [
      { emoji: "🙌🏽", label: "Simple Guided Prayer in the morning" },
      { emoji: "⛪", label: "Chapel, weekdays" },
      { emoji: "🦩", label: "The VTS Dean's Commentary" },
      { emoji: "🌍", label: "Breathing Together" },
      { emoji: "🖼️", label: "Visio Divina" },
      { emoji: "🌗", label: "The Examen in the evening" },
    ] },
  // CONTEMPLATIVE ART (owner) — v2, 2026-09-25: "Morning: Pray as You Go /
  // Reflection: Taize Daily / Contemplative: Visio Divina / Evening: Audio
  // Divina."
  //
  // THE MORNING IS A REFLECTION, AND A DIFFERENT ONE FROM THE RULE'S. This is
  // what `pray: "fdd"` + `anchorReflection` are for, and the first rule to use
  // them: "fdd" is the sentinel meaning "a reflection is this side's prayer",
  // and anchorReflection says WHICH — Pray As You Go, which is listened to
  // rather than read, so the morning card opens the player. The rule's
  // newsletter card is Taizé Daily Prayer, a different source, which without
  // anchorReflection would have retitled the morning after it.
  //
  // Pray As You Go is deliberately NOT in `reflections`: it is the morning
  // anchor, and listing it would put a second card for the same session
  // underneath the one that already is it.
  //
  // Visio Divina and Audio Divina both have their own cards, so the evening
  // side takes no anchor (`evening: "none"`) and both are turned on as
  // practices — Visio unpinned, because "Contemplative" is not a time of day,
  // and Audio Divina slotted to the evening because the owner put it there.
  //
  // NOTE THE TWO VOCABULARIES for Audio Divina: `practices` calls it "audio",
  // `practiceSlots` and the home layout call it "listening". Both adopt paths
  // map between them, but only because a bug that hid it was fixed the last
  // time a preset asked — this is the first rule to ask since.
  //
  // Gone with v1: the Contemplative Walk, and Richard Rohr's meditation.
  { id: "contemplative-art", emoji: "\u{1F5BC}\u{FE0F}", sides: { morning: true, evening: true },
    pray: "fdd", evening: "none",
    anchorReflection: { morning: "payg" },
    practices: { visio: true, audio: true },
    practiceSlots: { visio: "anytime", listening: "evening" },
    silence: false, goalMin: 0,
    reflections: ["taizeprayer"],
    title: "Contemplative Art", blurb: "Pray As You Go to open the day, the daily prayer from Taiz\u00e9 to carry, an artwork to sit with, and music as prayer in the evening.",
    rows: [
      { emoji: "\u{1F647}\u{1F3FD}", label: "Pray As You Go in the morning" },
      { emoji: "\u{1F304}", label: "Taiz\u00e9 Daily Prayer" },
      { emoji: "\u{1F5BC}\u{FE0F}", label: "Visio Divina" },
      { emoji: "\u{1F3A7}", label: "Audio Divina in the evening" },
    ] },
];
