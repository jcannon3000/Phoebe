/**
 * Turning a routine spec into lines a person can read.
 *
 * Extracted from routes/routine-interview.ts so the routine BACKLOG can
 * describe a past routine with the same words the interview used to describe
 * the new one — a revert screen that named things differently would read as a
 * different routine, which is exactly the doubt this feature exists to remove.
 *
 * Everything here derives from the SANITIZED spec — after the allowlist and
 * the value scrub — so these lines describe what will really be written to the
 * account, never a model's prose about it.
 */
// ── Describing the spec we ACTUALLY built ────────────────────────────────────
// The review screen used to show only the model's prose `summary` — its own
// account of what it did. Nothing tied that prose to the spec, so a model that
// wrote "Forward Day by Day in the evening" while programming the Examen would
// have the person approve a routine they hadn't been shown, with no way to
// catch it. For a feature whose whole promise is "we matched what you already
// do", the thing presented for approval has to be derived from the spec.
//
// So these lines are generated from the SANITIZED spec — after the allowlist
// and the value scrub — which makes them a description of what will really be
// written to the account. The model's prose stays, but as framing, not as the
// record.
const LEVEL_LABEL: Record<string, string> = {
  office: "Prayer",              // → "Morning Prayer" / "Evening Prayer"
  devotion: "Devotion",
  psalms: "Psalms",
  readings: "Scripture Reading",
  "guided-prayer": "Guided Prayer",
  examen: "Examen",
  fdd: "Forward Day by Day",
  "reflect-sit": "Contemplation",
  compline: "Compline",
  custom: "Practice",
  // Both are real OfficeLevels the customizer writes (PRAY_LEVEL maps to
  // them). Missing here, an anchor row fell through to a generic
  // "Morning Prayer" — and worse, the SECOND-practice row is guarded on
  // `LEVEL_LABEL[extra]`, so a side whose additional practice was one of
  // these got no row in Edit at all: a practice with a card and no way to
  // change or remove it.
  creation: "Creation Prayer",
  intercessions: "Prayer with the community",
};
/** Custom-anchor NAMES that are really one of the app's own practices —
 *  mirrors mymonastery/src/lib/anchorPractices.ts BY_NAME. */
const NAMED_ANCHOR_EMOJI: Record<string, string> = {
  "audio divina": "🎵", "creation prayer": "🌍",
  "contemplative walk": "🚶", "visio divina": "🖼️",
};
const NEWSLETTER_LABEL: Record<string, string> = {
  cac: "CAC Daily Meditation",
  fdd: "Forward Day by Day",
  ssje: "SSJE Daily Word",
  vts: "VTS Dean's Commentary",
};
const ENTRY_LABEL: Record<string, string> = {
  // "Digital Slideshow", not "on screen" (owner) — two of the other formats
  // are also on a screen, so it named the device rather than the thing.
  read: "the digital slideshow",
  book: "from your physical prayer book",
  listen: "read aloud",
  watch: "as a livestream",
  venite: "on venite.app",
};
const REFLECTION_LABEL: Record<string, string> = {
  cac: "the CAC daily meditation",
  fdd: "Forward Day by Day",
  ssje: "the SSJE daily word",
  vts: "the VTS Dean's Commentary",
};
export const SLOT_LABEL: Record<string, string> = {
  morning: "in the morning", midday: "at midday", afternoon: "in the afternoon",
  evening: "in the evening", anytime: "any time of day",
};
const PRACTICE_LABEL: Record<string, string> = {
  cobreathe: "Creation Prayer", listening: "Audio Divina", visio: "Visio Divina",
  // Card titles, so no articles: "a Contemplative Walk" reads fine inside a
  // sentence and wrong as the name at the top of a card.
  walk: "Contemplative Walk", reading: "Reading", examen: "The Examen",
};

/**
 * How a sit gets kept. Owner: "for the contemplation it should be asking the
 * logging method."
 *
 * The manual customizer asks this outright on its Silence slide, because it
 * changes what the card DOES when tapped — a timer opens a countdown, a manual
 * log just marks it done. Someone who sits in church, or keeps time with a
 * bell, does not want a countdown starting when they tap. Showing it on the
 * read-back is what gives them the chance to say so.
 */
// Slot practices that ARE a contemplative practice, as opposed to something
// else they keep during the day. Reading and the Examen stay under "practices":
// one is study, the other belongs to the evening.
// Practices whose time-of-day slot the app ignores — see the note where this
// is used. Keep in step with getPracticeSlot() in lib/customAnchors.ts.
// Each practice's own face. They all used to share a generic ✨, which read
// oddly next to the same practice's real card elsewhere in the app — the globe
// for Creation Prayer, the walker for a walk.
const PRACTICE_EMOJI: Record<string, string> = {
  // visio is in PRACTICE_LABEL; without it here the row fell back to ✨.
  cobreathe: "🌍", listening: "🎵", walk: "🚶", reading: "📖", examen: "🌗",
  visio: "🖼️",
};

const ALWAYS_ANYTIME = new Set(["cobreathe", "listening", "examen", "walk"]);

function logMethodLabel(rc: Record<string, string>): string {
  // "timer" is the app's own default, so an unset value is a timer.
  return rc["phoebe:contemplation-log-method"] === "manual" ? "tap to log" : "with a timer";
}

/** Rows describing what this spec will actually set — same emoji/label/sub
 *  shape the manual customizer's review step uses (owner: "I want the routine
 *  to be shown like it would at the end of the manual flow"), so the two
 *  endings of the two flows read as the same screen. */
// `section` groups rows for the read-back round, where each section gets its
// own confirmation slide (owner: "we show what we are hearing for morning,
// contemplation, and evening ... each one has a slide").
export type SpecSection = "morning" | "contemplation" | "evening" | "newsletters" | "practices";
/**
 * `id` names WHAT the row is, so the review screen can edit or delete it.
 *
 * Owner: "when it presents your routine, we want to be able to click into them
 * and edit them — a settings circle, and an X circle to delete."
 *
 * A row was previously just an emoji, a label and a sentence: enough to read,
 * nothing to act on. Matching back on the label would break the first time a
 * practice was renamed or translated, so each row now carries the key its
 * settings actually live under.
 *
 *   side:morning | side:evening   an office/devotion anchor
 *   contemplation                 the silent sit (per-side or the daily goal)
 *   card:cac | card:fdd | …       a newsletter, by home-layout key
 *   slot:walk | slot:listening…   a practice placed at a time of day
 *   custom:<title>                added client-side, has no server key
 */
export type SpecRow = {
  id: string;
  emoji: string;
  label: string;
  sub: string;
  section: SpecSection;
};

/** A person's own standing practices (users.custom_anchors → defs). */
export type CustomAnchorDef = { id?: unknown; title?: unknown; emoji?: unknown; slot?: unknown; days?: unknown };

export function describeSpec(spec: {
  officePrefs: { morning: string; evening: string; morningTime: string | null; eveningTime: string | null; contemplationGoalMinutes: number };
  homeLayout: { order: string[]; hidden: string[] };
  ruleConfig: Record<string, string>;
}, customAnchors?: CustomAnchorDef[]): SpecRow[] {
  const rc = spec.ruleConfig;
  const rows: SpecRow[] = [];

  for (const side of ["morning", "evening"] as const) {
    const cap = side === "morning" ? "Morning" : "Evening";
    const level = rc[`phoebe:office:level:${side}`];
    // NOT `continue` when a side has no office level.
    //
    // Reported against the VTS rule, whose evening is Creation Prayer and
    // nothing else: Edit showed no evening row AND no contemplation row, so
    // the two practices that rule is built around were missing from the one
    // screen that lists your rule. A side's contemplative practice and its
    // second practice are stored independently of its office level — a side
    // can keep either with no office at all — but both were described inside
    // this guard, so an office-less side reported as nothing whatsoever.
    // Only the ANCHOR row depends on the level now.
    const hasAnchor = !!level && level !== "ask";

    // Owner: "have it show the card for the practice and the medium on the
    // second line. But then as a separate UI ... have it ask if they would like
    // a notification or [that] it is off."
    //
    // So the card is only ever the PRACTICE — its name and how they take it.
    // The reminder used to ride the same line ("on screen · 7:00 AM"), which
    // made a setting they hadn't chosen look like something they'd told us, and
    // left no way to change it without rejecting the whole read-back. It gets
    // its own control on the slide instead.
    if (hasAnchor) {
      const entry = rc[`phoebe:office:entry:${side}`];
      const medium = entry && ENTRY_LABEL[entry] && (level === "office" || level === "devotion")
        ? ENTRY_LABEL[entry] : "";
      // A side set to "Create your own" HAS a name — the customizer asks for
      // it, presets carry it (VTS's morning is Chapel), and the home card and
      // every dot use it. Only this list didn't, so the rule you built read
      // back as the generic "Morning Practice" and looked like it had lost
      // the name you gave it.
      const ownName = level === "custom" ? (rc[`phoebe:office:custom-name:${side}`] ?? "").trim() : "";
      // A custom side whose NAME is one of the app's real practices IS that
      // practice (lib/anchorPractices matches on the name). Reported: "Visio
      // Divina flattened" — it read back under the evening's moon like any
      // hand-typed name, losing the practice's own mark.
      const namedEmoji = NAMED_ANCHOR_EMOJI[ownName.toLowerCase()];
      rows.push({
        id: `side:${side}`,
        emoji: namedEmoji ?? (side === "morning" ? "🌅" : "🌙"),
        label: ownName || (LEVEL_LABEL[level!] ? `${cap} ${LEVEL_LABEL[level!]}` : `${cap} Prayer`),
        sub: ownName
          ? (side === "morning" ? "Each morning" : "Each evening")
          : (medium || (side === "morning" ? "Each morning" : "Each evening")),
        section: side,
      });
    }

    if (rc[`phoebe:office:contemplation:${side}`] === "1") {
      const mins = rc[`phoebe:office:minutes:${side}`];
      /**
       * Name it after the practice it actually IS.
       *
       * A side's contemplative practice is either the silent sit or the breath,
       * and phoebe:contemplation-style says which. This row always said
       * "Contemplation" with a candle, so a reader whose practice is Creation
       * Prayer opened Edit and could not find it — the one thing they keep
       * morning and evening was listed under a name they had never chosen.
       */
      /**
       * WHICH practice, per side.
       *
       * This read the ONE global style key, which holds whichever side was
       * written last — so a rule keeping silence in the morning and the breath
       * at night described BOTH rows as Creation Prayer. The read-back then
       * asked the reader to confirm a rule they don't keep.
       *
       * `phoebe:office:contemplation-kind:<side>` rides rule_config (it's in
       * the client's ROUTINE_KEYS and sanitizeSpec passes rule-config keys
       * through), so it's here to be read. The global stays the fallback for a
       * rule that predates it.
       */
      const sideKind = rc[`phoebe:office:contemplation-kind:${side}`];
      const isBreath = sideKind
        ? sideKind === "creation"
        : rc["phoebe:contemplation-style"] === "cobreathe";
      rows.push({
        // Per-SIDE id. Both sides used the bare "contemplation", so a rule
        // that keeps a sit morning and evening rendered two list rows sharing
        // one React key — and deleting one could take the other's place with
        // it. It also let the ✕ only ever mean "clear both sides".
        id: `contemplation:${side}`,
        emoji: isBreath ? "🌍" : "🕯️",
        label: isBreath ? `${cap} Creation Prayer` : `${cap} Contemplation`,
        sub: isBreath
          ? "Breathing with creation"
          : [mins ? `${mins} min` : "A silent sit", logMethodLabel(rc)].join(" · "),
        section: "contemplation",
      });
    }

    /**
     * …and the side's SECOND practice, which had no row at all.
     *
     * Owner: "we want all practices you may have to show." An additional
     * practice is a real office on that side — it has its own home card, its
     * own dot and its own weekly row — but Edit listed only the anchor, so the
     * one place you go to change your rule was the one place it didn't exist.
     */
    const extra = rc[`phoebe:office:extra:${side}`];
    if (extra && LEVEL_LABEL[extra]) {
      rows.push({
        id: `extra:${side}`,
        emoji: "🌿",
        label: `${cap} ${LEVEL_LABEL[extra]}`,
        sub: "Alongside your main practice",
        section: side,
      });
    }
  }

  if (spec.officePrefs.contemplationGoalMinutes > 0
      && rc["phoebe:office:contemplation:morning"] !== "1"
      && rc["phoebe:office:contemplation:evening"] !== "1") {
    rows.push({
      id: "contemplation",
      emoji: "🕯️",
      label: "Silence",
      sub: `${spec.officePrefs.contemplationGoalMinutes} min a day · ${logMethodLabel(rc)}`,
      section: "contemplation",
    });
  }

  // Newsletters — one row EACH. Owner: "you can definitely do two newsletters."
  // The home reads the chosen set from the layout's visible reflection cards
  // (useRhythmState's chosenReflections), not from a single reflection key, so
  // that's what's reported here.
  const hidden = new Set(spec.homeLayout.hidden);
  for (const key of spec.homeLayout.order) {
    if (!NEWSLETTER_LABEL[key] || hidden.has(key)) continue;
    rows.push({ id: `card:${key}`, emoji: key === "vts" ? "🦩" : "📖", label: NEWSLETTER_LABEL[key], sub: "Each day", section: "newsletters" });
  }

  for (const [k, v] of Object.entries(rc)) {
    if (!k.startsWith("phoebe:slot:")) continue;
    const key = k.slice("phoebe:slot:".length);
    const name = PRACTICE_LABEL[key];
    if (!name || !SLOT_LABEL[v]) continue;
    // Owner: "if there's a contemplative walk or something in it as well, don't
    // have that on the third section's 'is this right' page — because we want
    // it to focus just on the sit: asking how much time, how often, things like
    // that."
    //
    // So a walk / breath / sacred listening reads back under "practices", NOT
    // on the sit slide. That slide is now an editable panel for the sit itself
    // (length, how often, how it's logged), and a walk sitting on top of it
    // made those controls look like they belonged to the walk.
    //
    // This does NOT undo the earlier ask that a described walk counts as their
    // contemplative practice: it still lands in a slot, still shows on the
    // home, still counts toward the week, and the extras step still suppresses
    // it as "already in your rhythm" — that check reads the rule-config, not
    // this section. Only where it's DISPLAYED changed.
    const section: SpecSection = "practices";
    // ALWAYS "any time of day" for these four, whatever the spec stored.
    // getPracticeSlot() (lib/customAnchors.ts) hard-returns "anytime" for
    // cobreathe / listening / examen / walk — their time-of-day picker was
    // removed from the customizer — so a read-back promising "in the
    // afternoon" describes a gate the app does not apply. Reading is the one
    // that still honours its slot, and still reads back as chosen.
    const sub = ALWAYS_ANYTIME.has(key) ? SLOT_LABEL["anytime"]! : SLOT_LABEL[v];
    rows.push({ id: `slot:${key}`, emoji: PRACTICE_EMOJI[key] ?? "✨", label: name, sub, section });
  }

  /**
   * The person's OWN standing practices — VTS's Community Meal, and anything
   * built with "Create your own".
   *
   * Reported: a rule with a weekday Community Meal listed it nowhere in Edit.
   * These live in users.custom_anchors, a column captureRoutineSpec never
   * reads, so every rule that had one described itself as missing a practice
   * the home was showing a card for. Passed in separately rather than folded
   * into the spec: the spec is also the PRESCRIBED-routine wire format, and
   * putting anchors in it would quietly change what a shared rule installs.
   */
  for (const a of customAnchors ?? []) {
    const title = typeof a?.title === "string" ? a.title.trim() : "";
    if (!title) continue;
    const slot = typeof a?.slot === "string" && SLOT_LABEL[a.slot] ? a.slot : "anytime";
    const days = Array.isArray(a?.days)
      ? (a.days as unknown[]).filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6)
      : [];
    // A weekday-only practice that reads back as plain "at midday" describes a
    // rule the app does not keep — the days are half of what was chosen.
    const when = days.length > 0 && days.length < 7
      ? `${SLOT_LABEL[slot]} · ${describeDays(days)}`
      : SLOT_LABEL[slot]!;
    rows.push({
      id: `custom:${typeof a?.id === "string" ? a.id : title.toLowerCase()}`,
      emoji: typeof a?.emoji === "string" && a.emoji ? a.emoji : "✨",
      label: title,
      sub: when,
      section: "practices",
    });
  }
  return rows;
}

/** "weekdays" / "weekends" / "Mon, Wed, Fri" — mirrors the client's helper. */
function describeDays(days: number[]): string {
  const set = [...new Set(days)].sort();
  if (set.length === 5 && set.every((d) => d >= 1 && d <= 5)) return "weekdays";
  if (set.length === 2 && set.includes(0) && set.includes(6)) return "weekends";
  const NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return set.map((d) => NAMES[d]).join(", ");
}

/** Home-layout keys the model asked for that aren't real cards. */
