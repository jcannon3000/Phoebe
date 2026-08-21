/**
 * AI-assisted routine interview.
 *
 * Owner: "an AI assisted questionnaire that ... is not focused on suggesting a
 * new prayer routine, but would ask someone what their CURRENT routine is and,
 * to the best of its understanding of all the options within Phoebe, program
 * that into Phoebe for them."
 *
 * That framing is the whole point and it drives the prompts below: this is a
 * TRANSCRIPTION task, not a recommendation one. The model's job is to express
 * a practice the person already keeps in Phoebe's vocabulary — not to improve
 * it, round it to something tidier, or add practices they didn't mention.
 *
 * Three steps, two model calls:
 *   1. POST /routine-interview/followups — they describe their practice; the
 *      model returns exactly two clarifying questions.
 *   2. POST /routine-interview/build — description + those answers become a
 *      PrescribedRoutineSpec plus a plain-language summary to show them.
 *   3. POST /routine-interview/apply — they accept; the spec is applied.
 *
 * Provider is OpenAI (owner: "i want you to use openai"). The repo's Anthropic
 * integration is not usable — @workspace/integrations-anthropic-ai is a
 * dangling symlink (points at lib/integrations-anthropic-ai; the real path is
 * lib/integrations/anthropic_ai_integrations) with no package.json and no
 * client export, so its dynamic import always throws and every caller falls
 * back to "unavailable". We use the same direct-fetch shape
 * lib/transcription/buildFddAlignment.ts already uses in production.
 *
 * SAFETY: the model's spec is never trusted. Everything goes through
 * sanitizeSpec() — the same gate the prescribed-routine and creator-season
 * accept paths use — which allowlists every level/pref/home key, clamps the
 * numbers, validates times as real clock times, and bounds the rule-config.
 * A hallucinated practice name doesn't corrupt a routine; it gets dropped.
 */
import { Router, type IRouter } from "express";
import { sanitizeSpec, applyRoutineSpecToUser, HOME_MODULE_KEYS } from "../lib/routineSpec";
import { perUserRateLimit } from "../lib/rate-limit";
import { describeSpec, SLOT_LABEL, type SpecSection } from "../lib/routineDescribe";
import { saveRoutineSnapshot } from "./routine-snapshots";

const router: IRouter = Router();

function getUserId(req: any): number | null {
  return req.user ? (req.user as { id: number }).id : null;
}

// gpt-5.6-luna — OpenAI's current cheap tier ($0.20/$1.20 per 1M as of
// 2026-08). At this feature's measured ~3.3K input / ~800 output per complete
// interview that's ~$0.0016 a head, about 66¢ per thousand more than the
// 2024-era gpt-4o-mini, for a current-generation model. Chosen over mini on
// that basis: the extra is rounding error at any realistic user count, and
// this task is mostly careful instruction-following over a long fixed option
// list, which is exactly where the newer model earns it.
//
// Its own knob, separate from the transcription aligner's OFFICE_ALIGN_MODEL,
// so either can move without the other.
//
// The tradeoff to watch either way: this maps free text onto a FIXED
// vocabulary, and a smaller model is likelier to reach for a plausible-sounding
// value that isn't on the list. scrubRuleConfig() below rejects those and
// surfaces them on the review screen — without it they'd be applied or dropped
// silently, which is the worst outcome for a feature promising to mirror the
// practice you already keep.
const MODEL = process.env.ROUTINE_INTERVIEW_MODEL || "gpt-5.6-luna";

// ── Phoebe's vocabulary ──────────────────────────────────────────────────────
// Kept as ONE string used by both calls so the two can't describe different
// apps. Every value here is one sanitizeSpec() actually accepts — if you add a
// practice to ALLOWED_LEVELS or HOME_MODULE_KEYS in lib/routineSpec.ts, add it
// here too, or the model will never produce it.
const PHOEBE_VOCAB = `
PHOEBE'S OPTIONS — you may only use these exact values.

A "side" is a half of the day: morning or evening. Each side has ONE anchor
practice, set by ruleConfig "phoebe:office:level:<side>":
  office        — the full Daily Office (Morning/Evening Prayer, BCP 1979 Rite II)
  devotion      — a short devotion; much briefer than the full office
  psalms        — praying the day's appointed psalms only
  readings      — the day's appointed scripture readings ("Daily Scripture Readings")
  guided-prayer — Simple Guided Prayer: a ~3 minute guided form (morning-shaped)
  examen        — the Examen: reviewing the day with God (evening-shaped)
  fdd           — Forward Day by Day, the Forward Movement daily meditation
  reflect-sit   — Contemplative Prayer: a silent sit. CENTERING PRAYER IS THIS.
                  So are Christian meditation, "sitting in silence", the Jesus
                  Prayer kept silently, and any wordless sit they name. If a
                  side's prayer IS that sit, this is that side's level — don't
                  reach for "office" and bolt silence on beside it.
  compline      — Compline, the night office
  custom        — a practice of their own naming
  ask           — no anchor on this side (the side is effectively off)

How they take the office, ruleConfig "phoebe:office:entry:<side>":
  read (on screen) | book (their physical BCP) | listen (read-aloud audio)
  | watch (a livestream, morning only) | venite (opens venite.app in a browser;
  works for the full office AND the short devotion)
DEFAULT THIS TO "venite" for every side that has an office or a devotion, unless
they clearly described taking it another way ("from my prayer book", "I listen
to it on my commute"). Venite is Phoebe's default reader. Never ASK which one —
they pick it from a dropdown on a later screen.

Newsletters (daily reflections). MULTIPLE ARE SUPPORTED — owner: "you can
definitely do two newsletters." Someone who reads both Forward Day by Day and
the Dean's Commentary gets BOTH; never make them choose.
  cac (Center for Action and Contemplation) | fdd (Forward Day by Day)
  | ssje (Society of St John the Evangelist) | vts (VTS Dean's Commentary)
Turn one on by putting its key in homeLayout.order (that list is what the home
actually reads). "phoebe:office:reflection:<side>" is a single legacy value —
set it to the primary one if you like, but the LAYOUT is what decides.

Silent prayer. A side's contemplation flag is ONLY for a side whose PRAYER IS
the silent sit. If they pray Morning Prayer AND sit in silence, that is one
morning practice plus a silence habit — put the minutes in
officePrefs.contemplationGoalMinutes and leave the side's flag off. Set the
per-side flag only when that side has no other practice.
  "phoebe:office:contemplation:<side>" = "1" or "0" — a silent sit attached to
      that side, shown as its own Morning/Evening Contemplation card
  "phoebe:office:minutes:<side>" = minutes for THAT side's sit, e.g. "10"
  "phoebe:contemplation-style" = "silent" or "cobreathe" (a guided breath)
  "phoebe:contemplation-log-method" = how the sit gets kept —
      "timer" (sit with a countdown, tap Begin) or "manual" (no timer; tap the
      card to mark it done). Set it from what they describe: someone who says
      they set a timer gets "timer"; someone who just sits, or sits in church,
      or uses a bell, gets "manual".
  officePrefs.contemplationGoalMinutes = total silent minutes across the day (0-180)

Practices available all day, placed with ruleConfig "phoebe:slot:<name>" set to
one of morning | midday | afternoon | evening | anytime:
  phoebe:slot:cobreathe | phoebe:slot:listening (Audio Divina)
  | phoebe:slot:walk (Contemplative Walk) | phoebe:slot:reading
  | phoebe:slot:examen
Use "anytime" for cobreathe, listening, walk and examen — the app treats those
four as available all day and ignores any other value. Only reading honours a
particular time of day.

ANYTHING ELSE THEY KEEP → A CUSTOM PRACTICE. Owner: "if they talk about a
practice that is not a preset option, make it a custom practice." A rosary, a
gratitude list, Ignatian reading, a gym walk they pray through, a novena, an
hour with the church fathers — if it doesn't map onto an option above, DO NOT
force it onto the nearest preset and DO NOT drop it. Return it in
"customPractices" (top level of your JSON, alongside "spec"):
  [{ "title": "The Rosary", "emoji": "📿", "slot": "evening" }]
title ≤40 chars in their own words, one emoji, slot one of
morning | midday | afternoon | evening | anytime. At most four, and only for
things they actually described. Leave the array out when everything they said
already had a home above — a preset is always the better fit when one exists.

Reminders (officePrefs) — ON BY DEFAULT:
  morning / evening = "office" | "devotion" | "none". A side that has a practice
      gets a reminder unless they said they DON'T want one — owner:
      "notifications should be inherent." Only use "none" for a side with no
      practice, or when they explicitly declined a nudge.
  morningTime / eveningTime = "HH:MM" 24-hour. Use the time THEY named. If they
      named a practice but no time, default to "07:00" morning / "18:00"
      evening rather than turning the reminder off.
  defaultPrayerLevel = "office" | "devotion" | "intercessions" | "ask"

homeLayout.order — the cards on their home, in order. Use only these keys, and
include every practice you turned on:
  office, feeds, contemplation, listening, reading, walk, cobreathe, compline,
  examen, cac, fdd, ssje, vts, ncmp, podcasts, requests
homeLayout.hidden — same keys, for cards to hide.
`.trim();

// Owner: "make sure it focuses on defining their morning, evening and
// contemplation practice, and what newsletters they read." Everything Phoebe
// can hold reduces to these four, so they're the interview's whole job —
// stated once here and referenced by both calls, so the follow-up questions
// and the build step are chasing the same four gaps rather than wandering.
const FOUR_THINGS = `
WHAT YOU ARE DEFINING — these four, and nothing else:

  1. MORNING PRACTICE — what they pray in the morning, and how they take it
     (on screen, from their physical prayer book, read aloud, and so on).
  2. EVENING PRACTICE — the same for the evening. May be a different practice
     and a different form from the morning.
  3. CONTEMPLATION — silent prayer. Whether they sit at all, for how long, and
     whether it belongs to a side of the day or stands on its own.
  4. NEWSLETTERS — the daily reflections they read: the CAC daily meditation,
     Forward Day by Day, SSJE, the VTS Dean's Commentary. Which ones, if any,
     and whether a given one is their PRACTICE for a side or a reading
     alongside it.

VIRGINIA THEOLOGICAL SEMINARY — the SINGLE exception to "add nothing they
didn't describe". If they say they are at, attend, teach at, study at, or
graduated from Virginia Theological Seminary — or write "VTS" — turn the Dean's
Commentary ON: set a reflection to "vts" and include "vts" in homeLayout.order.
It is their own seminary's daily word. Note it in your notes so they can see it
was added and take it off.

This exception is exhausted by that one newsletter. It is not a precedent, and
nothing else may be added on similar reasoning — no "they mentioned a parish so
they'd probably want…", no rounding a mention of church into a practice.

Do not chase anything outside these four. Reminder times are worth capturing
when they mention them, but they are a detail of 1 and 2, never the subject.
`.trim();

// Owner: "make sure we are looking through an Episcopal lens. I said morning
// prayer in my response, yet it didn't recognize that as the BCP practice, but
// just in general. If I say I pray in the evening that's one thing, but Evening
// Prayer is a specific practice in the Episcopal practice."
//
// That was a real miss: the model asked a follow-up about the morning even
// though "morning prayer" had already been answered — it read the words
// generically instead of as the name of an office. These are proper nouns in
// this tradition, and treating them as such is most of what "translating to
// Phoebe" means.
const EPISCOPAL_LENS = `
READ THEM AS AN EPISCOPALIAN WOULD.

These are NAMES OF SPECIFIC LITURGIES, not descriptions of a time of day. When
someone uses one, they have already told you their practice — record it and do
NOT ask again:

  "Morning Prayer" / "the morning office" / "MP"     → level "office", morning
  "Evening Prayer" / "the evening office" / "EP"     → level "office", evening
  "Compline"                                          → level "compline"
  "the Daily Office" / "the Office"                   → level "office"
  "the Examen"                                        → level "examen"
  "Forward Day by Day" / "FDD"                        → fdd
  "the psalter" / "the appointed psalms"              → level "psalms"
  "centering prayer" / "silence" / "contemplative prayer" → a silent sit
  "the lectionary readings" / "the daily readings"    → level "readings"

Contrast, and this is the distinction that matters:
  "I pray in the evening"        → vague. WHAT they pray is still unknown; ask.
  "I pray Evening Prayer"        → specific. That IS the office. Don't ask.
  "I read something at night"    → vague; ask.
  "I say Compline"               → specific. Done.

Assume the Book of Common Prayer 1979 and an Episcopal frame throughout. If a
phrase is a recognized name in that tradition, treat it as the answer.
`.trim();

// Owner: ask "from a voice of Mr Rogers towards Gen Z in NYC who is anxious and
// busy and sensitive to institutionalism and declaratives about spirituality."
//
// Those pull against each other on purpose, and the tension is the instruction:
// Rogers is unhurried, but a busy anxious reader experiences length as a
// demand. So the warmth has to arrive through ACCEPTANCE rather than through
// word count — short, and completely un-disappointable.
const VOICE = `
VOICE — this governs every word the person reads.

Write like Fred Rogers speaking to someone in their twenties in New York who is
anxious, short on time, wary of institutions, and allergic to being told what
their spiritual life means.

Assume they have been an Episcopalian for about a year. They know the Book of
Common Prayer and will say "Morning Prayer" or "Compline" and mean it — never
explain those back to them. But they have NOT met every option: Simple Guided
Prayer, the Examen, Audio Divina, a Contemplative Walk, the Dean's Commentary
may all be unfamiliar names. So ask about the THING rather than the label —
"do you spend any time in silence?" rather than "do you practice Contemplative
Prayer?" — and never imply they should already recognize something.

From Rogers, take: unhurried attention, plain short words, and the settled
assumption that the person is fine exactly as they are. He never hurried anyone
and never graded an answer.

From the reader, take: brevity. They are tired and busy. Warmth that costs them
reading time is not warmth. One sentence. No throat-clearing, no "I'd love to
hear...", no stacked qualifiers.

NEVER:
  · Declare what prayer, God, or silence IS or DOES. No "prayer is a gift",
    no "God meets us in the quiet", no "there's no wrong way to pray".
  · Invoke the church, the tradition, a priest, or what one is "supposed" to
    do. They are not answering to an institution here.
  · Praise, encourage, or evaluate the practice they described — not even
    kindly. "That's a beautiful rhythm" grades them; a question doesn't.
  · Perform warmth with exclamation marks or emoji.

ALWAYS:
  · Ask one plain thing, in words they'd use themselves.
  · Leave "not really" or "I don't" sitting comfortably in the question, so it
    costs nothing to say.

  ✗ "Prayer can take many beautiful forms! Would you say silence is part of
     your daily walk with God?"
  ✓ "Is there any part of the day you spend in silence?"

  ✗ "The Church invites us to close the day with Compline — do you observe it?"
  ✓ "Do you pray anything before bed?"

  ✗ "That sounds like a rich morning practice. How do you take it?"
  ✓ "Do you read Morning Prayer from your prayer book, on a screen, or listen?"
`.trim();

const TRANSCRIBE_NOT_PRESCRIBE = `
You are helping someone record the daily prayer practice they ALREADY KEEP into
an app called Phoebe. You are a scribe, not a spiritual director.

Your entire job is TRANSLATION: hear the practice they have and express it in
Phoebe's vocabulary. You are not designing a rhythm, improving one, or filling
one out. Phoebe has a separate surface for suggesting a practice; this is not
it, and a routine that comes back richer than the one they described is a
FAILURE of this task even if it would be good for them.

Rules, in order of importance:
1. Program what they actually described. Do not add practices they did not
   mention, do not lengthen their times, and do not "round up" a modest
   practice into a fuller one.
2. If they described something Phoebe has no exact match for, choose the
   CLOSEST option and say so plainly in your notes. Never invent a value.
3. If they gave no reminder time, do not invent a reminder — leave that side's
   reminder "none".
4. Silence about a practice means it is OFF, not that you should guess.
5. A sparse routine is a correct result. Someone who prays only in the morning
   gets an evening of "ask" and nothing else. Do not balance the day out.
6. Your summary and notes describe what you recorded. They never evaluate the
   practice, never encourage, and never mention what they could add.

${FOUR_THINGS}

${EPISCOPAL_LENS}

${VOICE}
`.trim();

type OpenAiResult = { ok: true; data: any } | { ok: false; status: number; error: string };

// Two request shapes, because the default model is a REASONING model and those
// take different parameters on /chat/completions than the older chat models:
//   · `max_tokens` is replaced by `max_completion_tokens`, and it has to cover
//     the reasoning tokens too — they're generated before the visible answer
//     and count against the same budget, so a tight cap returns an empty or
//     truncated response rather than an error you'd notice.
//   · `temperature` is not accepted (only the default).
//   · `reasoning_effort` selects how hard it thinks. "low" is right here: the
//     task is mapping a description onto a fixed list, not solving anything,
//     and higher effort would spend billed reasoning tokens for no gain.
//
// Older chat models (gpt-4o-mini and friends, still reachable by setting
// ROUTINE_INTERVIEW_MODEL) reject the reasoning shape and want the legacy one.
// Rather than hard-code a guess about which the configured model wants — this
// can't be exercised locally, there's no OPENAI_API_KEY in dev — we send the
// modern shape and fall back ONCE on a 400 mentioning a parameter. Costs one
// wasted request the first time someone points this at a legacy model, and
// nothing at all otherwise.
function requestBody(system: string, user: string, budget: number, legacy: boolean) {
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  return legacy
    ? { model: MODEL, temperature: 0.2, max_tokens: budget, response_format: { type: "json_object" }, messages }
    : {
        model: MODEL,
        max_completion_tokens: budget,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages,
      };
}

async function askOpenAi(system: string, user: string, maxTokens: number): Promise<OpenAiResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return { ok: false, status: 503, error: "ai_unconfigured" };
  }

  // Reasoning tokens share this budget with the answer, so give it real room —
  // being cut off mid-JSON is the failure this guards against, and unused
  // budget is never billed.
  const budget = maxTokens + 2000;

  // Node's fetch has NO default timeout, so a hung upstream would hold this
  // handler (and the caller's request) open indefinitely. A reasoning model at
  // low effort is still slower than a plain chat model, hence 60s rather than
  // the tighter budget the transcription paths use.
  const post = async (legacy: boolean): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      return await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(requestBody(system, user, budget, legacy)),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res: Response;
  try {
    res = await post(false);
    if (res.status === 400) {
      const probe = await res.clone().text().catch(() => "");
      // A 400 naming a parameter means this model wants the other shape.
      if (/max_completion_tokens|reasoning_effort|unsupported_parameter|unknown_parameter/i.test(probe)) {
        console.warn("[routine-interview] retrying with legacy chat params:", probe.slice(0, 200));
        res = await post(true);
      }
    }
  } catch (err) {
    console.warn("[routine-interview] OpenAI network error:", err);
    return { ok: false, status: 502, error: "ai_unreachable" };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`[routine-interview] OpenAI ${res.status}: ${body.slice(0, 300)}`);
    return { ok: false, status: 502, error: "ai_failed" };
  }
  const payload = (await res.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }> }
    | null;
  const text = payload?.choices?.[0]?.message?.content ?? "";
  // response_format json_object should guarantee clean JSON, but a stray
  // preamble has been seen in the wild — slice to the outermost braces before
  // parsing rather than failing the whole interview on it.
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return { ok: false, status: 502, error: "ai_bad_json" };
  try {
    return { ok: true, data: JSON.parse(text.slice(a, b + 1)) };
  } catch {
    return { ok: false, status: 502, error: "ai_bad_json" };
  }
}

function cleanText(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// ── rule-config value validation ─────────────────────────────────────────────
// sanitizeSpec does NOT check the VALUES inside ruleConfig — it validates keys
// and lengths (and officePrefs.defaultPrayerLevel), then copies the rest
// through as string→string. That's fine for its callers, where the spec was
// authored by a privileged human through the customizer UI, but not for one an
// LLM wrote: an invented level like "lectio" would sail through and be written
// to the user's rule_config, where the client's getSideLevel would then meet a
// value it has no case for.
//
// So the values get checked HERE, at the point untrusted model output enters.
// Bad entries are removed (never guessed at) and reported to the review screen,
// so a practice we couldn't match shows up as "we couldn't match this" rather
// than silently vanishing from the routine.
//
// Keep in sync with mymonastery/src/lib/officePrefs.ts (OfficeLevel,
// DefaultOfficeEntry, ReflectionSource) and lib/customAnchors.ts (CustomSlot).
const RC_LEVELS = new Set([
  "ask", "devotion", "office", "intercessions", "reflect-sit", "journal", "fdd",
  "readings", "psalms", "examen", "creation", "guided-prayer", "custom", "compline",
]);
const RC_ENTRIES = new Set(["read", "listen", "watch", "book", "venite"]);
const RC_REFLECTIONS = new Set(["cac", "fdd", "ssje", "vts", "none"]);
const RC_SLOTS = new Set(["morning", "anytime", "midday", "afternoon", "evening"]);
const RC_STYLES = new Set(["silent", "cobreathe"]);

function labelFor(key: string): string {
  const side = key.endsWith(":morning") ? "morning" : key.endsWith(":evening") ? "evening" : null;
  // "an evening practice", not "a evening practice" — this string is shown to
  // the person on the review screen, so the article has to agree.
  if (key.includes(":level:") && side) return `${side === "evening" ? "an" : "a"} ${side} practice`;
  if (key.includes(":entry:") && side) return `a way to pray the ${side} office`;
  if (key.includes(":reflection")) return "a daily reflection";
  if (key.startsWith("phoebe:slot:")) return `a time of day for ${key.slice("phoebe:slot:".length)}`;
  if (key === "phoebe:contemplation-style") return "a style of silent prayer";
  if (key === "phoebe:contemplation-log-method") return "a way to keep a silent sit";
  return "a setting";
}

/** Strip rule-config entries whose value isn't real. Returns the notes to show. */
function scrubRuleConfig(rc: Record<string, string>): string[] {
  const notes: string[] = [];
  const reject = (k: string, v: string) => {
    delete rc[k];
    notes.push(`We couldn't match "${v}" as ${labelFor(k)}, so that part was left as it was.`);
  };
  for (const [k, v] of Object.entries({ ...rc })) {
    if (k.includes(":level:")) { if (!RC_LEVELS.has(v)) reject(k, v); continue; }
    if (k.includes(":entry:")) { if (!RC_ENTRIES.has(v)) reject(k, v); continue; }
    if (k.includes(":reflection")) { if (!RC_REFLECTIONS.has(v)) reject(k, v); continue; }
    if (k.startsWith("phoebe:slot:")) { if (!RC_SLOTS.has(v)) reject(k, v); continue; }
    if (k === "phoebe:contemplation-style") { if (!RC_STYLES.has(v)) reject(k, v); continue; }
    if (k === "phoebe:contemplation-log-method") { if (v !== "timer" && v !== "manual") reject(k, v); continue; }
    if (k.includes(":contemplation:")) { if (v !== "1" && v !== "0") delete rc[k]; continue; }
    if (k.includes(":minutes:")) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 180) delete rc[k];
      continue;
    }
  }
  return notes.slice(0, 4);
}

function droppedCardNote(raw: unknown, keptOrder: string[]): string | null {
  const order = (raw as any)?.homeLayout?.order;
  if (!Array.isArray(order)) return null;
  const kept = new Set(keptOrder);
  const dropped = order.filter((k: unknown) => typeof k === "string" && !kept.has(k));
  if (dropped.length === 0) return null;
  return `These aren't cards Phoebe has, so they were left off: ${dropped.slice(0, 4).join(", ")}.`;
}

/** Backfill homeLayout.order from the routine when the model left it empty. */
function repairHomeLayout(raw: unknown): void {
  if (!raw || typeof raw !== "object") return;
  const spec = raw as Record<string, any>;
  const hl = (spec.homeLayout && typeof spec.homeLayout === "object") ? spec.homeLayout : {};
  const existing = Array.isArray(hl.order) ? hl.order.filter((k: unknown) => typeof k === "string") : [];
  if (existing.length > 0) { spec.homeLayout = { order: existing, hidden: Array.isArray(hl.hidden) ? hl.hidden : [] }; return; }

  const rc = (spec.ruleConfig && typeof spec.ruleConfig === "object") ? spec.ruleConfig as Record<string, string> : {};
  const order: string[] = [];
  const add = (k: string) => { if (!order.includes(k)) order.push(k); };

  // A side with any anchor at all needs the office card.
  for (const side of ["morning", "evening"]) {
    const lvl = rc[`phoebe:office:level:${side}`];
    if (lvl && lvl !== "ask") add("office");
    if (rc[`phoebe:office:contemplation:${side}`] === "1") add("contemplation");
    const refl = rc[`phoebe:office:reflection:${side}`];
    if (refl && refl !== "none") add(refl);
  }
  const source = rc["phoebe:office:reflection-source"];
  if (source && source !== "none") add(source);
  for (const k of Object.keys(rc)) {
    if (k.startsWith("phoebe:slot:")) add(k.slice("phoebe:slot:".length));
  }
  if ((spec.officePrefs?.contemplationGoalMinutes ?? 0) > 0) add("contemplation");
  // Last resort — a routine with an office is still a routine worth saving.
  if (order.length === 0) add("office");

  spec.homeLayout = { order, hidden: Array.isArray(hl.hidden) ? hl.hidden : [] };
}

/**
 * Hide every card the routine didn't ask for.
 *
 * THIS IS LOAD-BEARING, and its absence caused a bad disconnect: the review
 * screen listed the six things the person described, and their home came back
 * carrying Forward Day by Day, SSJE, Creation Prayer, Audio Divina, the prayer
 * list, Reading, Podcasts, Compline and the Examen — none of which they'd
 * mentioned.
 *
 * The reason is cleanHomeLayout (lib/routineSpec.ts), which BACKFILLS every
 * known module key into `order` so the layout is always complete, and lets
 * `hidden` decide what actually shows. So an empty `hidden` doesn't mean "just
 * the cards I listed" — it means "every card in the app". A spec built from a
 * description has to state the negative space explicitly.
 */
function hideUnchosen(spec: {
  officePrefs: { contemplationGoalMinutes: number };
  homeLayout: { order: string[]; hidden: string[] };
  ruleConfig: Record<string, string>;
}): void {
  const chosen = new Set(spec.homeLayout.order);
  const rc = spec.ruleConfig;

  // Before hiding, make sure the layout actually CONTAINS everything the rest
  // of the spec turned on. The model writes `order` and `ruleConfig`
  // separately, and it sometimes sets a slot or a contemplation flag without
  // adding the matching card — harmless while everything was visible by
  // default, and silently practice-erasing now that absence from `order` means
  // hidden. Belt and braces: the rule-config is the thing that was validated,
  // so let it have the last word.
  const required: string[] = [];
  if (rc["phoebe:office:level:morning"] || rc["phoebe:office:level:evening"]) required.push("office");
  for (const k of Object.keys(rc)) {
    if (k.startsWith("phoebe:slot:")) required.push(k.slice("phoebe:slot:".length));
  }
  if (rc["phoebe:office:contemplation:morning"] === "1"
      || rc["phoebe:office:contemplation:evening"] === "1"
      || spec.officePrefs.contemplationGoalMinutes > 0) {
    required.push("contemplation");
  }
  for (const side of ["morning", "evening"] as const) {
    const level = rc[`phoebe:office:level:${side}`];
    if (level === "compline" || level === "examen" || level === "fdd") required.push(level);
  }
  const known = new Set<string>(HOME_MODULE_KEYS);
  for (const k of required) {
    if (known.has(k) && !chosen.has(k)) { chosen.add(k); spec.homeLayout.order.push(k); }
  }

  spec.homeLayout.hidden = HOME_MODULE_KEYS.filter((k) => !chosen.has(k));
}

/**
 * A side's silence only belongs to that side when nothing else does.
 *
 * Owner: "only attribute contemplation to morning if there is no other morning
 * practice identified. But as you can see here, it identified Morning Prayer as
 * the morning practice — so that should be in the morning slot, and the
 * contemplation should just be general contemplation."
 *
 * Phoebe's per-side contemplation card is for a side whose PRAYER is the silent
 * sit. Someone who prays Morning Prayer and also sits for fifteen minutes has
 * one morning practice and a silence habit — not two morning anchors — and
 * showing "Morning Prayer" and "Morning Contemplation" as peers misreads the
 * day. Their silence belongs in the whole-day goal, which surfaces as the
 * single Silence card.
 *
 * Enforced here rather than left to the prompt: it's a structural rule about
 * Phoebe's model, true regardless of phrasing, and cheaper to guarantee than to
 * ask for.
 */
/**
 * Venite is the default reader, so a side that named no medium gets one.
 *
 * Owner: "have Venite digital [be] the default for all of them. If they use
 * any, that would apply." The follow-up round no longer spends a question on
 * the medium, which means the model will often have nothing to go on — and an
 * unset entry would otherwise fall through to the on-screen slideshow, quietly
 * contradicting the app-wide default (getDefaultOfficeEntry).
 *
 * Only fills a BLANK. Anything they actually described — their prayer book, the
 * podcast, the Cathedral stream — is left exactly as it was heard.
 */
function defaultEntryToVenite(spec: { ruleConfig: Record<string, string> }): void {
  const rc = spec.ruleConfig;
  for (const side of ["morning", "evening"] as const) {
    const level = rc[`phoebe:office:level:${side}`];
    // Venite serves the full office and the short devotion, and nothing else —
    // psalms, the Examen and Compline have no deep link that renders.
    if (level !== "office" && level !== "devotion") continue;
    if (!rc[`phoebe:office:entry:${side}`]) rc[`phoebe:office:entry:${side}`] = "venite";
  }
}

function normalizeContemplation(spec: {
  officePrefs: { contemplationGoalMinutes: number };
  ruleConfig: Record<string, string>;
}): void {
  const rc = spec.ruleConfig;
  for (const side of ["morning", "evening"] as const) {
    if (rc[`phoebe:office:contemplation:${side}`] !== "1") continue;
    const level = rc[`phoebe:office:level:${side}`];
    const sideIsTaken = !!level && level !== "ask" && level !== "reflect-sit";
    if (!sideIsTaken) continue;
    // Carry the minutes over so the silence isn't lost, only re-homed. Take the
    // larger of the two — the per-side figure is usually the one they actually
    // named.
    const mins = parseInt(rc[`phoebe:office:minutes:${side}`] ?? "", 10);
    if (Number.isFinite(mins) && mins > 0) {
      spec.officePrefs.contemplationGoalMinutes = Math.max(
        spec.officePrefs.contemplationGoalMinutes || 0,
        Math.min(180, mins),
      );
    }
    delete rc[`phoebe:office:contemplation:${side}`];
    delete rc[`phoebe:office:minutes:${side}`];
  }
}


/**
 * Practices Phoebe has no preset for, kept as CUSTOM ANCHORS.
 *
 * Owner: "if they talk about a practice that is not a preset option, make it a
 * custom practice." Without this the model has two bad options for a rosary or
 * a gratitude list — force it onto the nearest preset, so their rhythm claims a
 * practice they never mentioned, or drop it, so a feature that promises to
 * mirror what you already do quietly loses part of it.
 *
 * These do NOT ride in the spec. Custom anchors sync through their own
 * snapshot-and-tombstone channel (lib/customAnchors.ts), not through
 * ruleConfig's key allowlist, so the client writes them locally on apply.
 */
type CustomPractice = { title: string; emoji: string; slot: string };
const CUSTOM_SLOTS = new Set(["morning", "midday", "afternoon", "evening", "anytime"]);

function parseCustomPractices(raw: unknown): CustomPractice[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomPractice[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const title = cleanText((item as any).title, 40);
    if (!title) continue;
    const emoji = cleanText((item as any).emoji, 8) || "✅";
    const slotRaw = cleanText((item as any).slot, 20);
    out.push({ title, emoji, slot: CUSTOM_SLOTS.has(slotRaw) ? slotRaw : "anytime" });
    // The customizer caps the whole list at 8; four from one interview leaves
    // room for the ones they added by hand.
    if (out.length >= 4) break;
  }
  return out;
}

// ── POST /api/routine-interview/followups ────────────────────────────────────
// Owner: "let's have it be at least two questions, but have it be as ... many
// questions as needed to clarify." So: a floor of two, a ceiling of five, and
// the model decides where in between. A third question has to be EARNED by a
// real remaining gap — the ceiling is there because an interview that keeps
// going stops being a conversation and becomes a form.
//
// Questions may come back with CHOICES. Owner: "for something like this that
// you're asking about three options that pertain to settings, how about instead
// of [a text] field you list the settings and they choose." A question like
// "book, screen, or listen?" is a settings picker wearing a sentence — making
// someone type "Screen" into a textarea to set an enum is work we invented.
// Free text stays for anything genuinely open.
router.post("/routine-interview/followups", perUserRateLimit("routine_interview_followups", {
  max: 15, windowMs: 60 * 60 * 1000,
  message: "You've started the interview a lot in the last hour — give it a moment.",
}), async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const description = cleanText(req.body?.description, 4000);
  if (description.length < 10) { res.status(400).json({ error: "too_short" }); return; }

  const system = `${TRANSCRIBE_NOT_PRESCRIBE}

${PHOEBE_VOCAB}

Right now you are ONLY asking follow-up questions — do not produce a routine yet.

Work through the four in order — morning, evening, contemplation, newsletters —
and find which are still UNCLEAR or UNANSWERED. Ask about the two biggest gaps.
An area they never mentioned at all is a bigger gap than one they described
loosely: someone who detailed their morning but never mentioned silence or
reading should be asked about those, not about the exact minute of a reminder.

CRITICAL — ask what they ALREADY DO, never what they might add.

An unmentioned area is a gap in your KNOWLEDGE, not a hole in their practice.
You are asking because you don't know, not because something is missing. So:

  · "Do you sit in silence at any point in the day?"        ✓ asks
  · "Would you like to add a time of silent prayer?"        ✗ suggests
  · "Is there a daily reading you follow, if any?"          ✓ asks
  · "Have you considered Forward Day by Day?"               ✗ recommends

DO NOT ASK HOW THEY TAKE IT. Book, screen, listen, Venite — that is a dropdown
on a later screen, where it costs one tap instead of one of your two questions.
Owner: "those at least two clarification questions should not be about medium,
because we could actually ask medium on the third stage through a dropdown."
Spend your questions on what only they can tell you: WHAT they pray, WHEN, and
whether there's silence in the day.

Ask in plain words, never in app jargon (owner: "I don't know what 'how you take
it' means"). When a question does have a small fixed set of answers, name them
rather than gesturing at them.

Write every question so that "no, I don't do that" is an easy and complete
answer that costs them nothing. Never imply a fuller practice would be better,
never propose a practice by name as something to take up, and never comment on
what they told you. A person who prays once a day has given you a whole answer.

Never ask about something they already answered clearly. Never ask them to pick
between Phoebe's internal option names — ask about their practice in their own
words, the way a person would.

CONTEMPLATION needs its SHAPE, not just its presence. If silence comes up at
all, make sure you end up knowing: is it ONE sit, or several practices spread
through the day — and roughly how many minutes ALL TOLD. Ask only the part
they haven't already told you.

WHEN THE ANSWER IS A SETTING, LIST THE SETTINGS. If a question has a small fixed
set of real answers — the form they take an office in, which part of the day
something falls in, how long a sit runs — put those answers in "choices" and
they'll be shown as options to tap rather than a box to type in. Write choices
in plain words ("From my prayer book", "On a screen", "Listening"), never
Phoebe's internal names, and keep them to five at most. Leave "choices" off for
anything genuinely open, where a sentence in their own words tells you more
than a list could.

Respond with ONLY JSON:
{"questions": [{"q": "...", "choices": ["...", "..."]}, {"q": "..."}]}

AT LEAST TWO questions, at most five. Ask a third or more ONLY when something
real is still unclear — if two cover it, ask two. Each question one sentence,
plainly worded, no jargon.`;

  const out = await askOpenAi(system, `THEIR DESCRIPTION:\n${description}`, 500);
  if (!out.ok) { res.status(out.status).json({ error: out.error }); return; }

  const raw = Array.isArray(out.data?.questions) ? out.data.questions : [];
  const questions = raw
    // Accept a bare string as well as {q, choices}: that's the older shape, and
    // a model that falls back to it shouldn't cost us the whole round.
    .map((item: unknown) => {
      const q = cleanText(typeof item === "string" ? item : (item as any)?.q, 300);
      const rawChoices = item && typeof item === "object" ? (item as any).choices : null;
      const choices = Array.isArray(rawChoices)
        ? rawChoices.map((c: unknown) => cleanText(c, 60)).filter((c: string) => c.length > 0).slice(0, 5)
        : [];
      // A single choice isn't a choice, it's a leading question — drop the list
      // and let them answer in their own words.
      return choices.length >= 2 ? { q, choices } : { q };
    })
    .filter((item: { q: string }) => item.q.length > 0)
    .slice(0, 5);
  if (questions.length === 0) { res.status(502).json({ error: "ai_bad_json" }); return; }
  res.json({ questions });
});

// ── POST /api/routine-interview/build ────────────────────────────────────────
// Owner: "based on the initial responses and the follow-up clarifications, then
// have it built in ... and then it presents the routine for them." Returns the
// spec plus a human summary; nothing is written to the account until /apply.
router.post("/routine-interview/build", perUserRateLimit("routine_interview_build", {
  max: 15, windowMs: 60 * 60 * 1000,
  message: "You've built a routine a lot in the last hour — give it a moment.",
}), async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const description = cleanText(req.body?.description, 4000);
  if (description.length < 10) { res.status(400).json({ error: "too_short" }); return; }

  const followups: Array<{ q: string; a: string }> = Array.isArray(req.body?.followups)
    ? req.body.followups
        .slice(0, 5)
        .map((f: any) => ({ q: cleanText(f?.q, 300), a: cleanText(f?.a, 1000) }))
        .filter((f: { q: string; a: string }) => f.q.length > 0)
    : [];

  const system = `${TRANSCRIBE_NOT_PRESCRIBE}

${PHOEBE_VOCAB}

Now produce their routine. Respond with ONLY JSON in exactly this shape:

{
  "summary": "2-3 sentences, second person, describing the rhythm you programmed in plain language. No option names, no JSON keys.",
  "notes": ["short note about any judgement call or closest-match you had to make"],
  "customPractices": [{ "title": "The Rosary", "emoji": "📿", "slot": "evening" }],
  "spec": {
    "v": 1,
    "officePrefs": {
      "defaultPrayerLevel": "office",
      "contemplationGoalMinutes": 0,
      "contemplationReminderEnabled": false,
      "morning": "none",
      "evening": "none",
      "morningTime": null,
      "eveningTime": null
    },
    "silenceLadderEnabled": false,
    "homeLayout": { "order": ["office"], "hidden": [] },
    "ruleConfig": { "phoebe:office:level:morning": "office" }
  }
}

homeLayout.order must be non-empty. Put a side's anchor practice in ruleConfig
under phoebe:office:level:<side>, and set that side to "ask" if they don't pray
then. "notes" may be an empty array when nothing needed judgement.`;

  // Corrections from the read-back round: we showed them what we'd heard for a
  // side and they said it was wrong. These carry more weight than the original
  // description — they are the person looking at our reading and rejecting it.
  const corrections: string[] = Array.isArray(req.body?.corrections)
    ? req.body.corrections.slice(0, 6).map((c: unknown) => cleanText(c, 500)).filter((c: string) => c.length > 0)
    : [];

  const userMsg = [
    `THEIR DESCRIPTION:\n${description}`,
    followups.length > 0
      ? `\n\nCLARIFICATIONS:\n${followups.map((f) => `Q: ${f.q}\nA: ${f.a || "(no answer)"}`).join("\n\n")}`
      : "",
    corrections.length > 0
      ? `\n\nWE READ THEIR PRACTICE BACK AND THEY CORRECTED US. These override anything above:\n${corrections.map((c) => `· ${c}`).join("\n")}`
      : "",
  ].join("");

  const out = await askOpenAi(system, userMsg, 2000);
  if (!out.ok) { res.status(out.status).json({ error: out.error }); return; }

  // sanitizeSpec returns null when homeLayout.order is empty — a reasonable
  // rule for a spec authored through the customizer UI, but a brutal one here:
  // the model can produce a perfectly good routine and simply forget the card
  // list, and the person loses a description and two answers to "the
  // assistant's answer came back garbled". The layout is derivable from the
  // routine itself, so derive it rather than fail.
  repairHomeLayout(out.data?.spec);

  // The model's spec is untrusted input. sanitizeSpec allowlists every field
  // and returns null when what's left isn't a usable routine.
  const spec = sanitizeSpec(out.data?.spec);
  if (!spec) { res.status(502).json({ error: "ai_bad_spec" }); return; }

  // Value-check the rule-config the model wrote (sanitizeSpec only checked its
  // shape) — mutates `spec.ruleConfig`, so it must run before the response.
  const scrubNotes = scrubRuleConfig(spec.ruleConfig);
  normalizeContemplation(spec);
  defaultEntryToVenite(spec);
  hideUnchosen(spec);

  const modelNotes = Array.isArray(out.data?.notes)
    ? out.data.notes.map((n: unknown) => cleanText(n, 300)).filter((n: string) => n.length > 0).slice(0, 6)
    : [];
  // The model's own judgement calls, plus anything we had to reject — both
  // belong on the review screen for the same reason.
  const cardNote = droppedCardNote(out.data?.spec, spec.homeLayout.order);
  const notes = [...modelNotes, ...scrubNotes, ...(cardNote ? [cardNote] : [])].slice(0, 8);

  const customPractices = parseCustomPractices(out.data?.customPractices);

  res.json({
    spec,
    customPractices,
    summary: cleanText(out.data?.summary, 800),
    // Derived from the sanitized spec, not from the model — this is what the
    // review screen asks them to approve. See describeSpec.
    settings: [
      ...describeSpec(spec),
      // Shown on the read-back and the review like any other row, so a custom
      // practice can be corrected the same way a preset one can.
      ...customPractices.map((c) => ({
        emoji: c.emoji, label: c.title,
        sub: SLOT_LABEL[c.slot] ?? "Each day",
        section: "practices" as SpecSection,
      })),
    ],
    notes,
  });
});

// ── POST /api/routine-interview/apply ────────────────────────────────────────
// Applies a spec to the CALLER'S OWN account only. Re-sanitized here rather
// than trusted from the round-trip: /build handed the client a spec, and the
// client could send back anything.
router.post("/routine-interview/apply", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const spec = sanitizeSpec(req.body?.spec);
  if (!spec) { res.status(400).json({ error: "invalid_spec" }); return; }
  // Same value-check /build runs. Not redundant: this endpoint takes a spec
  // from the client, which could post one that never went through /build —
  // including the extras step's additions, which change what should be hidden.
  scrubRuleConfig(spec.ruleConfig);
  normalizeContemplation(spec);
  defaultEntryToVenite(spec);
  hideUnchosen(spec);

  try {
    // Keep what they had before replacing it — an AI-built routine is exactly
  // the kind of change someone wants to be able to walk back.
  await saveRoutineSnapshot(userId, "interview").catch(() => { /* never block the apply */ });
  await applyRoutineSpecToUser(userId, spec);
    res.json({ ok: true });
  } catch (err) {
    console.error("[routine-interview] apply failed:", err);
    res.status(500).json({ error: "apply_failed" });
  }
});

export default router;
