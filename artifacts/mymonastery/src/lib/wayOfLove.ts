// ─── The Way of Love — static content library + deterministic engine ─────────
//
// Extends the (deterministic, no-model) Rule of Life maker so it's congruent
// with The Episcopal Church's "Way of Love: Practices for a Jesus-Centered
// Life." Everything here is the Church's OWN authored framework — the seven
// practices, their definitions, and a curated menu of recommended practices —
// plus a rules-based engine that suggests and maps them. THERE IS NO AI: no
// model call, no generation. Recommendations come from lookup tables over
// this static library. Attributed to The Episcopal Church.
//
// Deliberately self-contained: pure data + pure functions, with NO imports
// from the maker's own files (slideshow / recommend route / officePrefs), so
// it can be wired into the existing deterministic recommend logic without
// duplicating routes/endpoints/components. The wiring layer maps the
// `PhoebeSettingTarget`s below onto the existing officePrefs setters + server
// prefs — this module only NAMES them, staying decoupled from the apply path.
//
// i18n: labels are { key, default } pairs; render with t(key, { defaultValue:
// default }) — the app convention. Spanish keys are added in the i18n files in
// the wiring pass; until then the English default shows.

export const WAY_OF_LOVE_ATTRIBUTION =
  "Adapted from the Way of Love, a rule of life from The Episcopal Church.";

// ── The seven practices ───────────────────────────────────────────────
export type PracticeId = "turn" | "learn" | "pray" | "worship" | "bless" | "go" | "rest";

// Canonical order (as the Church presents the practices).
export const PRACTICE_ORDER: PracticeId[] = [
  "turn", "learn", "pray", "worship", "bless", "go", "rest",
];

// Where a practice option lives. "app" options drive a Phoebe setting; "offline"
// options become personal commitments with an optional reminder.
export type PracticeHome = "app" | "offline";

// The Phoebe settings an "app" option can drive. The wiring layer maps each to
// the existing officePrefs setters / server prefs (setConfession, office
// depth / way-to-pray, reflection source, silence minutes, podcasts). This
// module only references them by name so it never touches the apply path.
export type PhoebeSettingTarget =
  | "confession"
  | "office"
  | "reflectionSource"
  | "silence"
  | "podcasts";

export type Cadence = "daily" | "weekly" | "occasional";

// How an "app" option's completion is detected — read by the Way of Love home
// + sub-screens to (a) decide which content card the section resolves to and
// (b) derive "done" automatically from an existing app signal. This same
// engagement also credits Turn (the consistency spine). Options with no
// completionSignal (every "offline"/custom option) get a manual "mark done".
export type CompletionSignal =
  | "officeToday"          // an office was completed today (any depth)
  | "reflectionToday"      // a daily reflection (CAC/FDD/SSJE) was read today
  | "contemplationToday"   // a contemplation sit was finished today
  | "examenToday"          // the Ignatian Examen was prayed today
  | "communityPrayedWeek"  // prayed for your worshipping community this week
  | "prayerListWeek"       // prayed through your prayer list this week
  | "feedEngagedWeek";     // engaged a prayer feed this week

// Which office depth a Pray option maps to (drives the office-settings sync).
export type OptionOfficeLevel = "office" | "devotion" | "intercessions" | "reflect-sit" | "journal";

// An i18n label: a key plus the English default rendered via t().
export type I18nText = { key: string; default: string };

export type PracticeOption = {
  // Stable id — used for pre-selection state + dedupe; never shown.
  id: string;
  label: I18nText;
  defaultCadence: Cadence;
  home: PracticeHome;
  // Present iff home === "app": which Phoebe setting this option configures.
  setting?: PhoebeSettingTarget;
  // For the reflection-source option, which source it selects (the maker's
  // existing reflection picker resolves the final value).
  reflectionSource?: "cac" | "fdd" | "ssje";
  // How completion is detected for an "app" option (absent ⇒ manual). Every
  // surface reads this instead of hardcoding the section's content/signal.
  completionSignal?: CompletionSignal;
  // For Pray office-depth options: the office level this commits the side to.
  officeLevel?: OptionOfficeLevel;
  // For Go feed options: the prayer-feed slug this engages.
  feedSlug?: string;
};

export type Practice = {
  id: PracticeId;
  title: I18nText;
  // The Church's one-line definition — reflected verbatim on the card.
  definition: I18nText;
  // The Church's curated menu of recommended practices for this movement.
  options: PracticeOption[];
};

const txt = (key: string, def: string): I18nText => ({ key, default: def });

// Curated menus seeded from the Way of Love material. Each practice leads with
// its definition (used in copy + the assembled rule) and offers the Church's
// recommended options, tagged app/offline + cadence.
export const PRACTICES: Record<PracticeId, Practice> = {
  turn: {
    id: "turn",
    title: txt("way_of_love.turn.title", "Turn"),
    definition: txt("way_of_love.turn.def", "Pause, listen, and choose to follow Jesus."),
    options: [
      { id: "turn-confession", label: txt("way_of_love.turn.confession", "Pray the Confession daily (BCP p. 79)"), defaultCadence: "daily", home: "app", setting: "confession", completionSignal: "officeToday" },
      { id: "turn-examen", label: txt("way_of_love.turn.examen", "Pray a daily Examen"), defaultCadence: "daily", home: "app", completionSignal: "examenToday" },
      { id: "turn-psalm51", label: txt("way_of_love.turn.psalm51", "Read Psalm 51 morning and night"), defaultCadence: "daily", home: "offline" },
      { id: "turn-forgive", label: txt("way_of_love.turn.forgive", "Work on forgiving a wrong"), defaultCadence: "occasional", home: "offline" },
    ],
  },
  learn: {
    id: "learn",
    title: txt("way_of_love.learn.title", "Learn"),
    definition: txt("way_of_love.learn.def", "Reflect on Scripture daily, especially Jesus' life and teachings."),
    options: [
      { id: "learn-office-readings", label: txt("way_of_love.learn.office_readings", "Read the Daily Office readings"), defaultCadence: "daily", home: "app", setting: "office", officeLevel: "office", completionSignal: "officeToday" },
      { id: "learn-devotional", label: txt("way_of_love.learn.devotional", "Read a daily devotional (CAC, Forward Day by Day, or SSJE)"), defaultCadence: "daily", home: "app", setting: "reflectionSource", completionSignal: "reflectionToday" },
      { id: "learn-podcast", label: txt("way_of_love.learn.podcast", "Follow a Scripture podcast"), defaultCadence: "daily", home: "app", setting: "podcasts" },
      { id: "learn-reading-plan", label: txt("way_of_love.learn.reading_plan", "Follow a Bible reading plan"), defaultCadence: "daily", home: "offline" },
      { id: "learn-lectio", label: txt("way_of_love.learn.lectio", "Practice lectio divina"), defaultCadence: "daily", home: "offline" },
    ],
  },
  pray: {
    id: "pray",
    title: txt("way_of_love.pray.title", "Pray"),
    definition: txt("way_of_love.pray.def", "Dwell intentionally with God daily."),
    options: [
      { id: "pray-silence", label: txt("way_of_love.pray.silence", "Keep contemplative silence for a set time"), defaultCadence: "daily", home: "app", setting: "silence", completionSignal: "contemplationToday" },
      { id: "pray-office", label: txt("way_of_love.pray.office", "Pray the Daily Office"), defaultCadence: "daily", home: "app", setting: "office", officeLevel: "office", completionSignal: "officeToday" },
      { id: "pray-devotions-136", label: txt("way_of_love.pray.devotions_136", "Pray the BCP Daily Devotions for Individuals & Families (p. 136)"), defaultCadence: "daily", home: "offline" },
      { id: "pray-beads", label: txt("way_of_love.pray.beads", "Pray with prayer beads"), defaultCadence: "daily", home: "offline" },
      { id: "pray-walking", label: txt("way_of_love.pray.walking", "Walk and pray"), defaultCadence: "occasional", home: "offline" },
      { id: "pray-ignatian", label: txt("way_of_love.pray.ignatian", "Pray with Ignatian imagination"), defaultCadence: "occasional", home: "offline" },
    ],
  },
  worship: {
    id: "worship",
    title: txt("way_of_love.worship.title", "Worship"),
    definition: txt("way_of_love.worship.def", "Gather in community weekly to thank, praise, and dwell with God."),
    options: [
      { id: "worship-weekly", label: txt("way_of_love.worship.weekly", "Attend worship each week"), defaultCadence: "weekly", home: "offline" },
      { id: "worship-arrive-early", label: txt("way_of_love.worship.arrive_early", "Arrive early for silence and thanksgiving"), defaultCadence: "weekly", home: "offline" },
      { id: "worship-pray-community", label: txt("way_of_love.worship.pray_community", "Pray for your worshipping community daily"), defaultCadence: "daily", home: "app", completionSignal: "communityPrayedWeek" },
    ],
  },
  bless: {
    id: "bless",
    title: txt("way_of_love.bless.title", "Bless"),
    definition: txt("way_of_love.bless.def", "Share your faith, and unselfishly give and serve."),
    options: [
      { id: "bless-prayer-list", label: txt("way_of_love.bless.prayer_list", "Pray for the people on your prayer list"), defaultCadence: "weekly", home: "app", completionSignal: "prayerListWeek" },
      { id: "bless-volunteer", label: txt("way_of_love.bless.volunteer", "Keep a regular volunteer shift"), defaultCadence: "weekly", home: "offline" },
      { id: "bless-neighbor", label: txt("way_of_love.bless.neighbor", "Check on a neighbor"), defaultCadence: "weekly", home: "offline" },
      { id: "bless-coffee", label: txt("way_of_love.bless.coffee", "Invite someone to coffee to hear their life"), defaultCadence: "weekly", home: "offline" },
      { id: "bless-witness", label: txt("way_of_love.bless.witness", "Tell someone how God's been working in you"), defaultCadence: "occasional", home: "offline" },
      { id: "bless-creation", label: txt("way_of_love.bless.creation", "Take a creation-care act, like composting"), defaultCadence: "occasional", home: "offline" },
    ],
  },
  go: {
    id: "go",
    title: txt("way_of_love.go.title", "Go"),
    definition: txt("way_of_love.go.def", "Cross boundaries, listen deeply, and live like Jesus."),
    options: [
      { id: "go-learn-community", label: txt("way_of_love.go.learn_community", "Learn about a community unlike your own — attend, read, or reach out"), defaultCadence: "occasional", home: "offline" },
      { id: "go-share-faith", label: txt("way_of_love.go.share_faith", "Share your faith with one person a week"), defaultCadence: "weekly", home: "offline" },
      { id: "go-justice-feed", label: txt("way_of_love.go.justice_feed", "Follow a Creation Care or justice prayer feed"), defaultCadence: "daily", home: "app", completionSignal: "feedEngagedWeek", feedSlug: "phoebe-climate" },
    ],
  },
  rest: {
    id: "rest",
    title: txt("way_of_love.rest.title", "Rest"),
    definition: txt("way_of_love.rest.def", "Receive the gift of God's grace, peace, and restoration."),
    options: [
      { id: "rest-sabbath", label: txt("way_of_love.rest.sabbath", "Choose a day or time you don't work"), defaultCadence: "weekly", home: "offline" },
      { id: "rest-hobby", label: txt("way_of_love.rest.hobby", "Take up a hobby"), defaultCadence: "occasional", home: "offline" },
      { id: "rest-tech-limits", label: txt("way_of_love.rest.tech", "Set tech limits — phone off at meals and bedtime"), defaultCadence: "daily", home: "offline" },
      { id: "rest-unstructured", label: txt("way_of_love.rest.unstructured", "Keep unstructured time with family or friends"), defaultCadence: "weekly", home: "offline" },
      { id: "rest-nature", label: txt("way_of_love.rest.nature", "Take a walk or bike ride in nature"), defaultCadence: "weekly", home: "offline" },
    ],
  },
};

// ── Covenant + recommitment (the Church's framing, first-person) ──────
// A commitment moment after the rule is assembled. First-person singular,
// attributed. The Way of Love is explicitly "a work in progress," so the
// recommitment loop returns to it rather than grading it.
export const COVENANT: I18nText = txt(
  "way_of_love.covenant",
  "With God's help, I will follow Jesus in the Way of Love. I will Turn toward him, Learn from his life and teaching, Pray and dwell with God, Worship in community, Bless others through service and witness, Go beyond myself to listen and love, and Rest in God's grace. This is a beginning, not a finish line — a work in progress I will return to.",
);

export const RECOMMITMENT_QUESTIONS: I18nText[] = [
  txt("way_of_love.recommit.q1", "Which practice has felt most alive these past weeks?"),
  txt("way_of_love.recommit.q2", "Which one slipped away — and is that okay, or worth taking up again?"),
  txt("way_of_love.recommit.q3", "What will you keep, change, or add as you begin again?"),
];

// ── Deterministic engine: connection diagnostic → suggested practices ──
// The slideshow's longing/connection question asks which connections feel
// thin. The thinnest connection(s) become the focus; this lens maps focus →
// the practices that tend to nourish it. Those practices are marked
// "suggested for you" and pre-expanded on the result screen.
export type Connection = "self" | "others" | "world" | "god";

export const CONNECTION_TO_PRACTICES: Record<Connection, PracticeId[]> = {
  self: ["turn", "rest"],
  others: ["bless", "worship"],
  world: ["go"],
  god: ["pray", "worship", "learn"],
};

export const CONNECTION_LABELS: Record<Connection, I18nText> = {
  self: txt("way_of_love.connection.self", "with yourself"),
  others: txt("way_of_love.connection.others", "with others"),
  world: txt("way_of_love.connection.world", "with the world around you"),
  god: txt("way_of_love.connection.god", "with God"),
};

// The set of practices suggested for the chosen thin connection(s).
export function suggestedPractices(thinnest: readonly Connection[]): Set<PracticeId> {
  const out = new Set<PracticeId>();
  for (const c of thinnest) {
    for (const p of CONNECTION_TO_PRACTICES[c] ?? []) out.add(p);
  }
  return out;
}

// ── Deterministic engine: logistics → outcomes (lookup tables) ─────────
// Pure mappings the wiring layer feeds into the EXISTING settings object the
// apply path already writes — they don't produce that object here (its shape
// lives in the maker), they just express the rules at this module's level.
export type TimeOfDay = "morning" | "midday" | "evening" | "night";

// Time-of-day chips → which office side(s) to enable.
export function sidesForTimes(times: readonly TimeOfDay[]): { morning: boolean; evening: boolean } {
  return {
    morning: times.includes("morning") || times.includes("midday"),
    evening: times.includes("evening") || times.includes("night"),
  };
}

// A default reminder time (HH:MM, 24h) per slot — the wiring maps to the
// reminder prefs. Conservative, gentle defaults.
export const REMINDER_TIME: Record<TimeOfDay, string> = {
  morning: "07:30",
  midday: "12:30",
  evening: "18:00",
  night: "21:30",
};

// Minutes-available chip → office depth. Short office for a few minutes; the
// full office when there's room.
export function officeDepthForMinutes(minutes: number): "short" | "full" {
  return minutes >= 12 ? "full" : "short";
}

// Minutes-available → a sensible contemplative-silence length (the Pray
// silence option). Capped so it never overwhelms a short window.
export function silenceMinutesForMinutes(minutes: number): number {
  if (minutes >= 30) return 15;
  if (minutes >= 20) return 10;
  if (minutes >= 10) return 5;
  return 2;
}

// ── Default selection (pre-checked options on the result screen) ───────
// Given the suggested practices (from the diagnostic), the engine pre-selects
// each suggested practice's PRIMARY option — its first app option if any, else
// its first option — so the result screen opens already populated. The person
// confirms or tweaks via chips; nothing is mandatory ("a work in progress").
export function primaryOption(p: Practice): PracticeOption {
  return p.options.find((o) => o.home === "app") ?? p.options[0];
}

export function defaultSelectedOptionIds(thinnest: readonly Connection[]): Set<string> {
  const suggested = suggestedPractices(thinnest);
  const out = new Set<string>();
  for (const id of suggested) {
    const opt = primaryOption(PRACTICES[id]);
    if (opt) out.add(opt.id);
  }
  return out;
}

// All options across all practices that drive a Phoebe setting — the wiring
// layer iterates the SELECTED subset of these to build the settings object.
export function appOptions(): Array<PracticeOption & { practice: PracticeId }> {
  const out: Array<PracticeOption & { practice: PracticeId }> = [];
  for (const id of PRACTICE_ORDER) {
    for (const o of PRACTICES[id].options) {
      if (o.home === "app") out.push({ ...o, practice: id });
    }
  }
  return out;
}
