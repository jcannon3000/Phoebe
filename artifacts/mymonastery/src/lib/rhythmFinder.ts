// Rhythm Finder — three questions, then two follow-ups chosen from the answers,
// then a rhythm shaped from all of it and written into the SAME prefs the
// customizers use. Deterministic — no model at runtime; every combination of
// answers maps to a concrete recommendation here.
//
// Owner, 2026-10-01, of the Shape your rhythm flow: "I want to adjust the
// questionnaire to the current nature of the app" · "Lets have it start with
// three questions" · "How would you like to use the Phoebe app?" · "What
// practices most connect you with God?" · "How would you like to grow in your
// love of God?" · "Then ask two follow ups based on that".
//
// WHY IT WAS REWRITTEN AND NOT TRIMMED. The eight-question version recommended
// from a menu the app no longer has, and wrote its result with a hand-built
// home layout that predates the rules every other writer now follows:
//   - it could place only the office/devotion/silence, one reflection, Audio
//     Divina and the Examen — never Breathing Together, a walk or Lectio, which
//     it could only mention in a sentence;
//   - it hid two newsletters' worth of cards and NOTHING ELSE, and `hidden`
//     governs (reference_home_layout_hidden_governs: a key absent from both
//     lists comes back ON when the server backfills `order`), so a finished
//     questionnaire could turn on practices nobody chose;
//   - its contemplation branch set the retired "reflect-sit" level instead of
//     the per-side silent sit the customizers write now;
//   - its results screen sent people to the Way of Love weekly, a practice
//     that is no longer in the app.
// So the writer below follows the light customizer's own primitives, and the
// recommendation only ever names a practice a person can actually have.

import { apiRequest } from "@/lib/queryClient";
import {
  setSideLevel, setSideContemplation, setSideContemplationKind, setSideEntry, setSideMinutes,
  clearSideDaySwap, OFFICE_PREFS_EVENT, TRACKED_REFLECTION_SOURCES, type OfficeLevel,
} from "@/lib/officePrefs";
import {
  saveHomeLayout, cacheHomeLayoutLocalOnly, readCachedHomeLayout, HOME_LAYOUT_VERSION, type HomeLayout,
} from "@/lib/homeLayoutCache";
import { setGuestSilenceGoalMin } from "@/lib/guestSeed";
import { pushRoutineConfig } from "@/lib/routineSync";

// ——— Question model (drives the slideshow UI) ———

export type FinderOption = { id: string; emoji: string; label: string; sub?: string };
export type FinderQuestion = {
  id: keyof FinderAnswers;
  kind: "multi" | "single";
  eyebrow: string;
  prompt: string;
  sub?: string;
  options: FinderOption[];
};

export type FinderAnswers = {
  // The three openers.
  use: string;           // daily | moment | learn
  meet: string[];        // silence | scripture | music | nature | breath | community | day
  grow: string[];        // silence | scripture | examen | music | learn | community
  // The follow-ups — at most two are ever asked (see followUps).
  silenceLevel: string;  // new | sometimes | daily
  readingVoice: string;  // cac | nouwen | taizeprayer | unsure
  whenSpace: string[];   // morning | midday | evening | night
  time: string;          // short | some | plenty
};

export const EMPTY_ANSWERS: FinderAnswers = {
  use: "", meet: [], grow: [], silenceLevel: "", readingVoice: "", whenSpace: [], time: "",
};

const has = (arr: string[], x: string) => arr.includes(x);

/** The three questions every person is asked, in order. */
export const OPENING_QUESTIONS: FinderQuestion[] = [
  {
    id: "use", kind: "single", eyebrow: "To begin",
    prompt: "How would you like to use the Phoebe app?",
    options: [
      { id: "daily", emoji: "🌅", label: "To pray every day", sub: "A steady rhythm, morning and evening." },
      { id: "moment", emoji: "🕯️", label: "To pray when I have a moment", sub: "Something light I can keep." },
      { id: "learn", emoji: "🎓", label: "To learn about prayer", sub: "Courses and readings, at my own pace." },
    ],
  },
  {
    id: "meet", kind: "multi", eyebrow: "Where you meet God",
    prompt: "What practices most connect you with God?",
    sub: "Choose as many as feel true.",
    options: [
      { id: "silence", emoji: "🕯️", label: "Silence and stillness" },
      { id: "scripture", emoji: "📖", label: "Scripture and reading" },
      { id: "music", emoji: "🎧", label: "Music" },
      { id: "nature", emoji: "🚶🏽", label: "Walking and being outdoors" },
      { id: "breath", emoji: "🌬️", label: "Breath and the body" },
      { id: "community", emoji: "🙏🏽", label: "Praying with others, in the church's words" },
    ],
  },
  {
    id: "grow", kind: "multi", eyebrow: "Growing",
    prompt: "How would you like to grow in your love of God?",
    sub: "Choose as many as you like.",
    options: [
      { id: "silence", emoji: "🕯️", label: "In stillness and silence" },
      { id: "scripture", emoji: "📖", label: "Through Scripture" },
      { id: "examen", emoji: "🌗", label: "By noticing God in my day" },
      { id: "music", emoji: "🎧", label: "Through music" },
      { id: "learn", emoji: "🎓", label: "By learning from others" },
      { id: "community", emoji: "🙏🏽", label: "Alongside others" },
    ],
  },
];

/**
 * Every follow-up that exists, with the answers that make it worth asking. Each
 * one changes the recommendation — a question that changes nothing is not
 * asked — and only the FIRST TWO that apply are ever put to the person.
 *
 * In priority order, so the two that matter most to what they have already said
 * win: someone who chose silence AND Scripture is asked about those two and not
 * about the time of day; someone who chose neither is asked the two that always
 * apply.
 */
const FOLLOW_UPS: Array<FinderQuestion & { applies: (a: FinderAnswers) => boolean }> = [
  {
    id: "silenceLevel", kind: "single", eyebrow: "Silence",
    prompt: "Where are you with silent prayer?",
    applies: (a) => has(a.meet, "silence") || has(a.grow, "silence"),
    options: [
      { id: "new", emoji: "🌱", label: "New to it", sub: "A few quiet minutes is plenty." },
      { id: "sometimes", emoji: "🍃", label: "I sit sometimes", sub: "I'd like it to be steadier." },
      { id: "daily", emoji: "🌳", label: "A daily practice", sub: "Silence is already part of my day." },
    ],
  },
  {
    id: "readingVoice", kind: "single", eyebrow: "A daily word",
    prompt: "Which voice speaks to you?",
    applies: (a) => has(a.meet, "scripture") || has(a.grow, "scripture"),
    options: [
      { id: "cac", emoji: "🌅", label: "Contemplative and justice", sub: "Center for Action and Contemplation" },
      { id: "nouwen", emoji: "😊", label: "Gentle and personal", sub: "Henri Nouwen's Daily Devotion" },
      { id: "taizeprayer", emoji: "🕊️", label: "Monastic and reflective", sub: "Taizé Daily Prayer" },
      { id: "unsure", emoji: "🤍", label: "Not sure — choose for me" },
    ],
  },
  {
    id: "whenSpace", kind: "multi", eyebrow: "Your day",
    prompt: "When do you have the most space for God?",
    sub: "We'll set your reminders around this.",
    applies: () => true,
    options: [
      { id: "morning", emoji: "🌅", label: "Morning" },
      { id: "midday", emoji: "☀️", label: "Midday" },
      { id: "evening", emoji: "🌙", label: "Evening" },
      { id: "night", emoji: "🌌", label: "Late night" },
    ],
  },
  {
    id: "time", kind: "single", eyebrow: "Your day",
    prompt: "How much time could you give each day?",
    sub: "We'll keep your rhythm to what you can actually keep.",
    applies: () => true,
    options: [
      { id: "short", emoji: "⏱️", label: "A few minutes" },
      { id: "some", emoji: "🕰️", label: "About ten minutes" },
      { id: "plenty", emoji: "🌿", label: "Twenty minutes or more" },
    ],
  },
];

/** The (at most two) follow-ups that suit what has been said so far. */
export function followUps(a: FinderAnswers): FinderQuestion[] {
  return FOLLOW_UPS.filter((q) => q.applies(a)).slice(0, 2).map(({ applies: _applies, ...q }) => q);
}

/**
 * The questions to show right now: the three openers, and — once those are
 * answered — the two follow-ups they lead to. Until the openers are answered
 * there is nothing to branch on, so the follow-ups are not shown (and the
 * total the page counts is the real one, never a guess).
 */
export function questionsFor(a: FinderAnswers): FinderQuestion[] {
  const openersDone = !!a.use && a.meet.length > 0 && a.grow.length > 0;
  return openersDone ? [...OPENING_QUESTIONS, ...followUps(a)] : OPENING_QUESTIONS;
}

// ——— The recommendation (deterministic) ———

export type RecommendedPrayer = "guided-prayer" | "office" | "readings" | "contemplation";
export type RecommendedExtra = "examen" | "listening" | "cobreathe" | "lectio" | "walk";

export type RecommendedRhythm = {
  /** Evening is its own choice: only someone who wants a daily rhythm gets one. */
  sides: { morning: boolean; evening: boolean };
  prayer: RecommendedPrayer;
  /**
   * What the evening holds, when there is one. The Examen closes a day that
   * opened with Simple Guided Prayer or the readings (the same pairing the light
   * customizer writes), the office repeats itself, and a silent sit sits twice.
   */
  eveningLevel: "ask" | "examen" | "office" | "contemplation";
  /**
   * HOW LONG A SIT IS — not a daily quota (owner, 2026-10-01: "Contemplation
   * (Have it not be qouta but just one session…)", said of the default and
   * taken here as what contemplation IS in Phoebe).
   *
   * It used to be a daily GOAL, and a goal is not just a different number: it
   * draws a different CARD — the silence goal card with its progress bar — and
   * feeds the day's total differently. So a person who answered the questions
   * and a person who took the default ended up with structurally different
   * homes for the same practice. Now both keep a session, and the answers
   * decide how long it is rather than how much is owed.
   */
  silenceMinutes: number;
  reflectionSource: "cac" | "nouwen" | "taizeprayer" | null;
  extras: RecommendedExtra[];
  morningReminder: boolean;
  eveningReminder: boolean;
  /** Human-readable "why" lines for the results screen. */
  reasons: string[];
};

/** How many practices beyond the daily prayer their time can carry. */
const EXTRAS_BY_TIME: Record<string, number> = { short: 1, some: 2, plenty: 4 };
const EXTRAS_UNASKED = 3;

export function recommend(a: FinderAnswers): RecommendedRhythm {
  const reasons: string[] = [];
  const mentions = (x: string) => has(a.meet, x) || has(a.grow, x);

  const morning = true;
  const evening = a.use === "daily";
  if (evening) reasons.push("You'd like a daily rhythm, so it has a morning and an evening.");
  else if (a.use === "learn") reasons.push("You're here to learn, so the rhythm stays small and the courses are on your Learn tab.");
  else reasons.push("You'd like something light, so it's a single practice to begin with.");

  // The daily prayer.
  let prayer: RecommendedPrayer;
  if (mentions("community")) {
    prayer = "office";
    reasons.push("You pray with others, so we gave you the Daily Office — the same prayers your church prays each day.");
  } else if (has(a.meet, "silence") && a.meet.length === 1) {
    prayer = "contemplation";
    reasons.push("Silence is where you meet God — so your prayer itself is a daily sit.");
  } else if (has(a.meet, "scripture")) {
    prayer = "readings";
    reasons.push("You meet God in Scripture, so your prayer is the day's appointed readings.");
  } else {
    prayer = "guided-prayer";
    reasons.push("Simple Guided Prayer — praise, ask, confess, give thanks — is an easy way to begin the day.");
  }

  const eveningLevel: RecommendedRhythm["eveningLevel"] = !evening ? "ask"
    : prayer === "guided-prayer" || prayer === "readings" ? "examen"
      : prayer === "office" ? "office" : "contemplation";
  if (eveningLevel === "examen") reasons.push("The Examen closes your day — a few quiet minutes to notice where God was.");

  // Silence.
  let silenceMinutes = 0;
  if (mentions("silence")) {
    const base = a.silenceLevel === "daily" ? 15 : a.silenceLevel === "sometimes" ? 10 : 5;
    // The silent-sit prayer counts the day's TOTAL and splits it across the
    // sides, in ten-minute steps so each gets a clean half.
    // The length of ONE sit. A rhythm whose prayer IS the sit gets a longer
    // one; a rhythm where silence rides alongside another prayer gets the
    // plain length. No doubling for two sides: each side's sit is a sit, not
    // half of a daily allowance.
    silenceMinutes = prayer === "contemplation" ? base * 2 : base;
    reasons.push(`A sit of ${silenceMinutes} minutes, set to where you are with it.`);
  }

  // A daily reflection — only for someone who reads.
  let reflectionSource: RecommendedRhythm["reflectionSource"] = null;
  if (has(a.meet, "scripture")) {
    reflectionSource = a.readingVoice === "cac" ? "cac" : a.readingVoice === "taizeprayer" ? "taizeprayer" : "nouwen";
    reasons.push("A daily reflection to read, in the voice you chose.");
  }

  // Practices beyond the prayer, in the order they matter, then trimmed to the
  // time they said they have. Each is a real home card a person can have.
  const wanted: RecommendedExtra[] = [];
  // The evening Examen already IS the Examen — don't offer it twice.
  if (has(a.grow, "examen") && eveningLevel !== "examen") wanted.push("examen");
  if (mentions("music")) wanted.push("listening");
  if (has(a.meet, "breath")) wanted.push("cobreathe");
  if (has(a.grow, "scripture")) wanted.push("lectio");
  if (has(a.meet, "nature")) wanted.push("walk");
  const room = EXTRAS_BY_TIME[a.time] ?? EXTRAS_UNASKED;
  const extras = wanted.slice(0, room);
  if (extras.includes("examen")) reasons.push("The Examen, to notice God in your day.");
  if (extras.includes("listening")) reasons.push("Audio Divina — music as a way of prayer.");
  if (extras.includes("cobreathe")) reasons.push("Breathing Together, a few breaths prayed with all creation.");
  if (extras.includes("lectio")) reasons.push("Lectio Divina, to pray slowly with a reading.");
  if (extras.includes("walk")) reasons.push("A contemplative walk, for meeting God in motion.");
  if (wanted.length > extras.length) reasons.push("The rest can wait — it's better to keep a few things than to drop many.");

  const morningReminder = has(a.whenSpace, "morning") || a.whenSpace.length === 0;
  // A daily rhythm's evening keeps its reminder unless they told us when they
  // have space and evening wasn't in it — silence on the question is not "no".
  const eveningReminder = evening && (a.whenSpace.length === 0 || has(a.whenSpace, "evening") || has(a.whenSpace, "night"));

  return {
    sides: { morning, evening }, prayer, eveningLevel, silenceMinutes, reflectionSource, extras,
    morningReminder, eveningReminder, reasons,
  };
}

// ——— Apply: write the recommendation into Phoebe's real settings ———

/**
 * The practice cards a person can add. Any of these not chosen is HIDDEN — not
 * merely left out of `order`: the server backfills every known key into `order`
 * and lets `hidden` decide what shows, so a card named in neither list comes
 * back on (reference_home_layout_hidden_governs).
 */
const PRACTICE_CARDS: readonly RecommendedExtra[] = ["examen", "listening", "cobreathe", "lectio", "walk"];

/** Turn one card on or off, always stating it in BOTH lists. */
function setCard(layout: HomeLayout, key: string, on: boolean): HomeLayout {
  const order = layout.order.includes(key) ? [...layout.order] : [...layout.order, key];
  const hidden = layout.hidden.filter((k) => k !== key);
  if (!on) hidden.push(key);
  return { ...layout, order, hidden };
}

/** Where a layout starts when the device has none — the customizer's own. */
const FALLBACK_LAYOUT: HomeLayout = {
  order: ["requests", "office", "contemplation", "feeds", "ncmp", "podcasts"],
  hidden: ["ncmp", "podcasts", "reading", "cobreathe", "prayer-list"],
  v: HOME_LAYOUT_VERSION,
};

export async function applyRhythm(rec: RecommendedRhythm, opts: { guest: boolean }): Promise<void> {
  const { guest } = opts;
  const { morning, evening } = rec.sides;
  try {
    clearSideDaySwap("morning"); clearSideDaySwap("evening");

    if (rec.prayer === "contemplation") {
      // The silent sit as the prayer itself: the per-side anchor, never the
      // retired "reflect-sit" level. "ask" is a side's OFF state.
      setSideLevel("morning", "ask");
      setSideLevel("evening", "ask");
      setSideContemplation("morning", morning);
      setSideContemplation("evening", evening);
      setSideContemplationKind("morning", "silent");
      setSideContemplationKind("evening", "silent");
      // Each side's sit is the full length. It was halved when this was a
      // daily total to divide; a session is not divided.
      setSideMinutes("morning", rec.silenceMinutes);
      if (evening) setSideMinutes("evening", rec.silenceMinutes);
    } else {
      /**
       * SILENCE ALONGSIDE ANOTHER PRAYER IS A SESSION TOO.
       *
       * Someone who says silence is where they meet God, but whose prayer is
       * Simple Guided or the readings, used to get ONLY a minutes goal — a
       * progress bar and no sit to keep. They now get the same morning
       * contemplation card the default writes, sized by their answer.
       */
      const wantsSit = rec.silenceMinutes > 0;
      setSideContemplation("morning", wantsSit && morning);
      setSideContemplation("evening", false);
      if (wantsSit && morning) {
        setSideContemplationKind("morning", "silent");
        setSideMinutes("morning", rec.silenceMinutes);
      }
      // A side the recommendation leaves out gets no practice — "ask" is OFF,
      // and under the derived-sides model (WayOfLoveRuleFlow) having a
      // practice is the whole of what "on" means.
      setSideLevel("morning", morning ? (rec.prayer as OfficeLevel) : "ask");
      // Simple Guided Prayer and the readings are morning shapes that the
      // Examen closes; the office repeats. ("ask" is a side's OFF state.)
      setSideLevel("evening", rec.eveningLevel === "contemplation" ? "ask" : (rec.eveningLevel as OfficeLevel));
    }
    // The slideshow, written explicitly — an unwritten side falls back to
    // handing the reader off to a website.
    setSideEntry("morning", "read");
    setSideEntry("evening", "read");
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* ignore */ }

  // The silence goal — local for a device with no account, the server pref
  // otherwise — and the reminders.
  /**
   * NO DAILY GOAL, EVER, FROM HERE. The sit above is the practice; a goal on
   * top of it would put the quota card beside the session card and count the
   * same silence twice. Written as 0 rather than left alone, so a rhythm built
   * here replaces an older one's goal instead of inheriting it.
   */
  if (guest) {
    try { setGuestSilenceGoalMin(0); } catch { /* ignore */ }
  } else {
    await apiRequest("PUT", "/api/me/office-prefs", {
      defaultPrayerLevel: rec.prayer === "contemplation" ? "ask" : rec.prayer,
      contemplationGoalMinutes: 0,
      // Tied to KEEPING a sit, not to owing minutes — the goal is always 0 now.
      contemplationReminderEnabled: rec.silenceMinutes > 0,
      morning: rec.morningReminder ? (rec.prayer === "office" ? "office" : "devotion") : "none",
      evening: rec.eveningReminder ? "devotion" : "none",
      morningTime: rec.morningReminder ? "07:30" : null,
      eveningTime: rec.eveningReminder ? "20:00" : null,
    }).catch(() => { /* best-effort */ });
  }

  // The home layout: start from what the device already has, say every practice
  // card and every reflection source exactly once, on or off.
  let layout: HomeLayout = readCachedHomeLayout() ?? FALLBACK_LAYOUT;
  for (const key of PRACTICE_CARDS) layout = setCard(layout, key, rec.extras.includes(key));
  // Every tracked source — Pray As You Go is a practice with a card of its own,
  // not a newsletter, so a newsletter choice never turns it off.
  for (const src of TRACKED_REFLECTION_SOURCES) {
    if (src === "payg") continue;
    layout = setCard(layout, src, src === rec.reflectionSource);
  }
  if (guest) cacheHomeLayoutLocalOnly(layout);
  else await saveHomeLayout(layout).catch(() => { /* stays cached + dirty; re-pushed next app-active */ });

  try { localStorage.setItem("phoebe:contemplation-style", "silent"); } catch { /* ignore */ }
  if (!guest) { try { pushRoutineConfig(); } catch { /* ignore */ } }
}
