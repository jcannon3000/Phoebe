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
import { sanitizeSpec, applyRoutineSpecToUser } from "../lib/routineSpec";
import { perUserRateLimit } from "../lib/rate-limit";

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
  reflect-sit   — Contemplative Prayer: a silent sit
  compline      — Compline, the night office
  custom        — a practice of their own naming
  ask           — no anchor on this side (the side is effectively off)

How they take the office, ruleConfig "phoebe:office:entry:<side>":
  read (on screen) | book (their physical BCP) | listen (read-aloud audio)
  | watch (a livestream, morning only) | venite (opens venite.app in a browser)

A daily reflection they read, ruleConfig "phoebe:office:reflection:<side>"
and "phoebe:office:reflection-source":
  cac (Center for Action and Contemplation) | fdd (Forward Day by Day)
  | ssje (Society of St John the Evangelist) | vts (VTS Dean's Commentary) | none

Silent prayer:
  "phoebe:office:contemplation:<side>" = "1" or "0" — a silent sit attached to
      that side, shown as its own Morning/Evening Contemplation card
  "phoebe:office:minutes:<side>" = minutes for THAT side's sit, e.g. "10"
  "phoebe:contemplation-style" = "silent" or "cobreathe" (a guided breath)
  officePrefs.contemplationGoalMinutes = total silent minutes across the day (0-180)

Practices available all day, placed with ruleConfig "phoebe:slot:<name>" set to
one of morning | midday | afternoon | evening | anytime:
  phoebe:slot:cobreathe | phoebe:slot:listening (Audio Divina)
  | phoebe:slot:walk (Contemplative Walk) | phoebe:slot:reading
  | phoebe:slot:examen

Reminders (officePrefs):
  morning / evening = "office" | "devotion" | "none"  — "none" means NO reminder
      push for that side. Use "none" whenever they didn't say they want a nudge.
  morningTime / eveningTime = "HH:MM" 24-hour, or null when that side has no
      reminder. Use the time THEY said. Only fall back to "07:00" / "18:00" if
      they asked for a reminder without naming a time.
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
  if (key.includes(":level:") && side) return `a ${side} practice`;
  if (key.includes(":entry:") && side) return `a way to pray the ${side} office`;
  if (key.includes(":reflection")) return "a daily reflection";
  if (key.startsWith("phoebe:slot:")) return `a time of day for ${key.slice("phoebe:slot:".length)}`;
  if (key === "phoebe:contemplation-style") return "a style of silent prayer";
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
    if (k.includes(":contemplation:")) { if (v !== "1" && v !== "0") delete rc[k]; continue; }
    if (k.includes(":minutes:")) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 180) delete rc[k];
      continue;
    }
  }
  return notes.slice(0, 4);
}

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
  office: "the full Daily Office",
  devotion: "a short devotion",
  psalms: "the appointed psalms",
  readings: "the day's scripture readings",
  "guided-prayer": "Simple Guided Prayer",
  examen: "the Examen",
  fdd: "Forward Day by Day",
  "reflect-sit": "silent contemplative prayer",
  compline: "Compline",
  custom: "your own practice",
};
const ENTRY_LABEL: Record<string, string> = {
  read: "on screen",
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
const SLOT_LABEL: Record<string, string> = {
  morning: "in the morning", midday: "at midday", afternoon: "in the afternoon",
  evening: "in the evening", anytime: "any time of day",
};
const PRACTICE_LABEL: Record<string, string> = {
  cobreathe: "Creation Prayer", listening: "Audio Divina",
  walk: "a Contemplative Walk", reading: "Reading", examen: "the Examen",
};

function prettyTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Plain-language lines describing what this spec will actually set. */
function describeSpec(spec: {
  officePrefs: { morning: string; evening: string; morningTime: string | null; eveningTime: string | null; contemplationGoalMinutes: number };
  ruleConfig: Record<string, string>;
}): string[] {
  const rc = spec.ruleConfig;
  const lines: string[] = [];

  for (const side of ["morning", "evening"] as const) {
    const cap = side === "morning" ? "Morning" : "Evening";
    const level = rc[`phoebe:office:level:${side}`];
    if (!level || level === "ask") {
      lines.push(`${cap}: nothing set — this side is off.`);
      continue;
    }
    const bits = [LEVEL_LABEL[level] ?? level];
    const entry = rc[`phoebe:office:entry:${side}`];
    if (entry && ENTRY_LABEL[entry] && (level === "office" || level === "devotion")) {
      bits.push(ENTRY_LABEL[entry]);
    }
    lines.push(`${cap}: ${bits.join(", ")}.`);

    if (rc[`phoebe:office:contemplation:${side}`] === "1") {
      const mins = rc[`phoebe:office:minutes:${side}`];
      lines.push(`${cap}: a silent sit${mins ? ` of ${mins} minutes` : ""}.`);
    }
    const reflection = rc[`phoebe:office:reflection:${side}`];
    if (reflection && REFLECTION_LABEL[reflection]) {
      lines.push(`${cap}: reading ${REFLECTION_LABEL[reflection]}.`);
    }

    const pref = side === "morning" ? spec.officePrefs.morning : spec.officePrefs.evening;
    const time = side === "morning" ? spec.officePrefs.morningTime : spec.officePrefs.eveningTime;
    lines.push(
      pref !== "none" && time
        ? `${cap} reminder: ${prettyTime(time)}.`
        : `${cap} reminder: none.`,
    );
  }

  if (spec.officePrefs.contemplationGoalMinutes > 0) {
    lines.push(`Silence: ${spec.officePrefs.contemplationGoalMinutes} minutes a day in total.`);
  }
  for (const [k, v] of Object.entries(rc)) {
    if (!k.startsWith("phoebe:slot:")) continue;
    const name = PRACTICE_LABEL[k.slice("phoebe:slot:".length)];
    if (name && SLOT_LABEL[v]) lines.push(`Also: ${name}, ${SLOT_LABEL[v]}.`);
  }
  return lines;
}

/** Home-layout keys the model asked for that aren't real cards. */
function droppedCardNote(raw: unknown, keptOrder: string[]): string | null {
  const order = (raw as any)?.homeLayout?.order;
  if (!Array.isArray(order)) return null;
  const kept = new Set(keptOrder);
  const dropped = order.filter((k: unknown) => typeof k === "string" && !kept.has(k));
  if (dropped.length === 0) return null;
  return `These aren't cards Phoebe has, so they were left off: ${dropped.slice(0, 4).join(", ")}.`;
}

// ── POST /api/routine-interview/followups ────────────────────────────────────
// Owner: "ask the LLM for two follow-up questions." Exactly two — the point is
// one short clarifying round, not an interrogation.
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
  · "You mentioned evening prayer — how do you read it?"    ✓ asks

Write every question so that "no, I don't do that" is an easy and complete
answer that costs them nothing. Never imply a fuller practice would be better,
never propose a practice by name as something to take up, and never comment on
what they told you. A person who prays once a day has given you a whole answer.

Never ask about something they already answered clearly. Never ask them to pick
between Phoebe's internal option names — ask about their practice in their own
words, the way a person would.

Respond with ONLY JSON: {"questions": ["...", "..."]}
Exactly two questions. Each one sentence, plainly worded, no jargon.`;

  const out = await askOpenAi(system, `THEIR DESCRIPTION:\n${description}`, 500);
  if (!out.ok) { res.status(out.status).json({ error: out.error }); return; }

  const raw = Array.isArray(out.data?.questions) ? out.data.questions : [];
  const questions = raw
    .map((q: unknown) => cleanText(q, 300))
    .filter((q: string) => q.length > 0)
    .slice(0, 2);
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
        .slice(0, 4)
        .map((f: any) => ({ q: cleanText(f?.q, 300), a: cleanText(f?.a, 1000) }))
        .filter((f: { q: string; a: string }) => f.q.length > 0)
    : [];

  const system = `${TRANSCRIBE_NOT_PRESCRIBE}

${PHOEBE_VOCAB}

Now produce their routine. Respond with ONLY JSON in exactly this shape:

{
  "summary": "2-3 sentences, second person, describing the rhythm you programmed in plain language. No option names, no JSON keys.",
  "notes": ["short note about any judgement call or closest-match you had to make"],
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

  const userMsg = [
    `THEIR DESCRIPTION:\n${description}`,
    followups.length > 0
      ? `\n\nCLARIFICATIONS:\n${followups.map((f) => `Q: ${f.q}\nA: ${f.a || "(no answer)"}`).join("\n\n")}`
      : "",
  ].join("");

  const out = await askOpenAi(system, userMsg, 2000);
  if (!out.ok) { res.status(out.status).json({ error: out.error }); return; }

  // The model's spec is untrusted input. sanitizeSpec allowlists every field
  // and returns null when what's left isn't a usable routine.
  const spec = sanitizeSpec(out.data?.spec);
  if (!spec) { res.status(502).json({ error: "ai_bad_spec" }); return; }

  // Value-check the rule-config the model wrote (sanitizeSpec only checked its
  // shape) — mutates `spec.ruleConfig`, so it must run before the response.
  const scrubNotes = scrubRuleConfig(spec.ruleConfig);

  const modelNotes = Array.isArray(out.data?.notes)
    ? out.data.notes.map((n: unknown) => cleanText(n, 300)).filter((n: string) => n.length > 0).slice(0, 6)
    : [];
  // The model's own judgement calls, plus anything we had to reject — both
  // belong on the review screen for the same reason.
  const cardNote = droppedCardNote(out.data?.spec, spec.homeLayout.order);
  const notes = [...modelNotes, ...scrubNotes, ...(cardNote ? [cardNote] : [])].slice(0, 8);

  res.json({
    spec,
    summary: cleanText(out.data?.summary, 800),
    // Derived from the sanitized spec, not from the model — this is what the
    // review screen asks them to approve. See describeSpec.
    settings: describeSpec(spec),
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
  // from the client, which could post one that never went through /build.
  scrubRuleConfig(spec.ruleConfig);

  try {
    await applyRoutineSpecToUser(userId, spec);
    res.json({ ok: true });
  } catch (err) {
    console.error("[routine-interview] apply failed:", err);
    res.status(500).json({ error: "apply_failed" });
  }
});

export default router;
