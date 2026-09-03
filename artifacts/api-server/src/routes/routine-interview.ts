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
import { sanitizeSpec, applyRoutineSpecToUser, captureRoutineSpec, readCustomAnchorDefs, HOME_MODULE_KEYS } from "../lib/routineSpec";
import { isSuperAdminUser } from "../lib/superAdmin";
import { perUserRateLimit } from "../lib/rate-limit";
import { describeSpec, SLOT_LABEL, type SpecRow, type SpecSection, type CustomAnchorDef } from "../lib/routineDescribe";
import { saveRoutineSnapshot } from "./routine-snapshots";

const router: IRouter = Router();

/**
 * ADMINS ONLY, ON THE SERVER TOO.
 *
 * Owner: "the routine interview is only in admin tools for admins" — which is
 * true of the DOOR: the customizer's own entry is switched off for everyone
 * (ROUTINE_INTERVIEW_ENTRY_HIDDEN) and the only link lives behind Admin Tools.
 * But a hidden link is not a lock: /followups and /build each spend OpenAI
 * tokens on a model call, and until now any signed-in person who typed the
 * path could spend them. So the server now enforces what the UI already
 * assumes, and the two agree.
 *
 * Returns true when the request has been answered (401/403) and the handler
 * should stop.
 */
async function refuseUnlessAdmin(req: any, res: any): Promise<boolean> {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return true; }
  if (!(await isSuperAdminUser(userId))) { res.status(403).json({ error: "Admin access required" }); return true; }
  return false;
}

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

/**
 * The two calls are different jobs, so they can run on different models.
 *
 * Owner: "there's two or three different times we run things through the LLM —
 * could the [one] be a higher model and the clarifying ones a lower model?"
 *
 * FOLLOW-UPS is the judgment call, and the one worth paying for. It has to
 * notice what someone DIDN'T say — that a detailed morning never mentioned
 * silence, and that the gap matters more than the exact minute of a reminder —
 * and it gets two or three questions to do it in. It also has NO safety net: a
 * wasted question is a gap that never gets filled, and nothing downstream can
 * recover it.
 *
 * BUILD is mapping free text onto a fixed vocabulary, and it is heavily
 * guarded: sanitizeSpec allowlists every field, scrubRuleConfig rejects values
 * that aren't real, PRESET_BY_TITLE folds mislabelled presets back, and
 * normalizeContemplation / defaultEntryToVenite / hideUnchosen fix the
 * structural mistakes deterministically. Its failure modes are the ones we
 * already catch, which is exactly where a cheaper model is safe.
 *
 * Both default to ROUTINE_INTERVIEW_MODEL, so setting nothing changes nothing.
 */
const FOLLOWUP_MODEL = process.env.ROUTINE_INTERVIEW_FOLLOWUP_MODEL || MODEL;
const BUILD_MODEL = process.env.ROUTINE_INTERVIEW_BUILD_MODEL || MODEL;

// ── The FLAT catalogue (the new framework) ───────────────────────────────────
//
// Owner (2026-09-03): the interview "was based on the old framework of the
// weekly progress cards with three dots, and so it needed to ask specifically
// about each anchor — but we moved away from anchors so much." The home is a
// flat list of practice cards now — every card one equal unit, the day kept
// when all are done; morning/evening survive as PLUMBING (office levels,
// extras, per-side kinds), not as the three things a person is asked about.
//
// So the model no longer fills the anchor-shaped spec. It returns ONE LIST of
// practices — what they keep, and when — over the same catalogue the
// customizer offers, and specFromPractices() below maps that list onto the
// existing PrescribedRoutineSpec so sanitizeSpec, scrubRuleConfig, the
// normalizers, hideUnchosen, describeSpec and applyRoutineSpecToUser all keep
// working untouched. The anchor rules live in the adapter, where they are
// deterministic, instead of in a thousand words of prompt.
//
// PHOEBE_VOCAB (below) is kept only for the LEGACY response shape — a model
// that returns "spec" instead of "practices" still goes through the old path.
type FlatKind = "prayer" | "silence" | "practice" | "newsletter" | "custom";
type CatalogueEntry = { kind: FlatKind; label: string; hint: string; side?: "morning" | "evening" };
/**
 * Every key the model may use. `kind` decides how the adapter places it:
 *   prayer     — a form of prayer that takes a HALF of the day (the plumbing
 *                still calls this a side's level). `side` is the default when
 *                the person named none.
 *   silence    — the daily silence goal (minutes / sits / log method).
 *   practice   — a card kept somewhere in the day (a home-layout key).
 *   newsletter — a daily reflection (a home-layout key).
 *   custom     — their own, by name.
 * Keep in step with the customizer's contemplative step + /customize rows.
 */
const CATALOGUE: Record<string, CatalogueEntry> = {
  office:          { kind: "prayer", label: "the Daily Office (Morning/Evening Prayer, BCP 1979)", hint: "\"Morning Prayer\", \"Evening Prayer\", \"the office(s)\", \"the hours\"" },
  devotion:        { kind: "prayer", label: "a short devotion", hint: "much briefer than the office" },
  psalms:          { kind: "prayer", label: "the day's appointed psalms", hint: "\"the psalter\"" },
  readings:        { kind: "prayer", label: "Daily Scripture Reading — the appointed lectionary readings", hint: "\"the lectionary\", \"the daily readings\"; NOT a book they chose (that is \"reading\")" },
  "guided-prayer": { kind: "prayer", label: "Simple Guided Prayer — a ~3 minute guided form", hint: "morning-shaped", side: "morning" },
  examen:          { kind: "prayer", label: "the Examen — reviewing the day with God", hint: "evening-shaped", side: "evening" },
  compline:        { kind: "prayer", label: "Compline, the night office", hint: "always evening", side: "evening" },
  fdd:             { kind: "prayer", label: "Forward Day by Day AS their prayer for that part of the day", hint: "only when the meditation IS what they pray; otherwise it is the newsletter \"fdd\"" },
  "reflect-sit":   { kind: "prayer", label: "a silent sit AS their prayer for that part of the day", hint: "centering prayer, Christian meditation, the Jesus Prayer kept silently — when the sit IS the morning or the evening" },
  custom:          { kind: "custom", label: "a practice of their own naming", hint: "\"Chapel\", \"The Rosary\", \"Morning Pages\" — give \"title\"; NEVER a placeholder like \"Morning practice\"" },
  silence:         { kind: "silence", label: "time in silence across the day", hint: "minutes ALL TOLD, one sit or several, timer or logged by hand; NOT for a sit that is itself the morning/evening prayer (use reflect-sit)" },
  creation:        { kind: "practice", label: "Creation Prayer — a guided breath", hint: "\"Co-Breathe\", \"the breath\"" },
  walk:            { kind: "practice", label: "a Contemplative Walk", hint: "\"prayer walk\"" },
  listening:       { kind: "practice", label: "Audio Divina — praying with music", hint: "\"sacred listening\"" },
  visio:           { kind: "practice", label: "Visio Divina — praying with an image", hint: "" },
  icons:           { kind: "practice", label: "Praying with Icons — one icon for the week", hint: "" },
  taize:           { kind: "practice", label: "the Taizé meditation (weekly)", hint: "" },
  spirituals:      { kind: "practice", label: "Meditating on Spirituals — a spiritual sung as prayer", hint: "" },
  lectio:          { kind: "practice", label: "Lectio Divina — a passage read slowly three times", hint: "" },
  reading:         { kind: "practice", label: "Reading — a book they are working through", hint: "honours \"when\"" },
  podcasts:        { kind: "practice", label: "Podcasts", hint: "" },
  cac:             { kind: "newsletter", label: "the CAC Daily Meditation (Center for Action and Contemplation, Richard Rohr)", hint: "\"the daily meditation\"" },
  ssje:            { kind: "newsletter", label: "SSJE — Brother, Give Us a Word", hint: "" },
  vts:             { kind: "newsletter", label: "the VTS Dean's Commentary", hint: "\"the Dean's\", \"VTS\" — never fdd" },
  sojo:            { kind: "newsletter", label: "the Sojourners daily devotion", hint: "" },
  nouwen:          { kind: "newsletter", label: "the Henri Nouwen daily devotion", hint: "" },
  grist:           { kind: "newsletter", label: "Grist climate news", hint: "" },
};
// "fdd" is a newsletter too — the same key, read as a card when it is not a
// side's prayer. The adapter decides by `when`: no side → newsletter.
const NEWSLETTER_KEYS = new Set(["cac", "fdd", "ssje", "vts", "sojo", "nouwen", "grist"]);
const WHEN = new Set(["morning", "midday", "afternoon", "evening", "anytime"]);

const FLAT_VOCAB = `
PHOEBE'S CATALOGUE — every practice you may record, by key. Use only these keys.

${Object.entries(CATALOGUE).map(([k, e]) => `  ${k.padEnd(14)} — ${e.label}${e.hint ? ` (${e.hint})` : ""}`).join("\n")}

A rhythm is ONE LIST of practices. There are no "anchors" to choose and no
"main practice" to decide between — if someone prays Morning Prayer AND sits
in silence AND reads the CAC, that is three entries, each recorded once.

For each entry:
  key      one of the keys above (required)
  when     morning | midday | afternoon | evening | anytime. Use what they
           said. For a form of prayer (office, devotion, psalms, readings,
           guided-prayer, examen, compline, fdd, reflect-sit, custom) "when"
           says which half of the day it is prayed in; leave it out if they
           didn't say and the practice has no natural time.
  medium   for office / devotion only: book | read | listen | venite.
           DEFAULT "venite" unless they clearly described another way. Never
           ask — a later screen offers it as a dropdown.
  time     "HH:MM" 24-hour, only when they named one.
  minutes  for "silence": total minutes across the day (1-180).
  sits     for "silence": "one" | "several".
  log      for "silence": "timer" when they name a length (they are timing
           it), "manual" only when a timer is ruled out (church, a bell, no
           length at all).
  title    for "custom": ≤40 chars in their own words. emoji: one emoji.

NEVER record one practice twice (the lectionary as "readings" AND as
"reading"; a silent sit as "reflect-sit" AND as "silence"). A sit that IS
their morning or evening prayer is "reflect-sit" with that "when"; silence
kept beside another prayer is "silence".

VIRGINIA THEOLOGICAL SEMINARY — the single exception to "add nothing they
didn't describe": if they are at / attend / teach at / graduated from VTS, or
write "VTS", include { "key": "vts" } and say so in notes. Nothing else may be
added on similar reasoning.
`.trim();

// ── Phoebe's vocabulary (LEGACY shape) ──────────────────────────────────────
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
  custom        — a practice of their own naming. NAME IT AS THEY NAMED IT:
                  "Chapel", "The Rosary", "Morning Pages". NEVER a placeholder
                  like "Morning practice" or "Evening practice" — that is a
                  label for the slot, not a practice, and it tells them nothing
                  they didn't already know. Reported: someone said "I go to
                  Chapel at seminary in the morning" and got an anchor called
                  "Morning practice" with Chapel demoted to a second practice.
                  Chapel WAS the anchor.
  ask           — no anchor on this side (the side is effectively off)

CHOOSING THE ANCHOR. The anchor is the MAIN thing they pray on that side, in
their own words. Work from what they actually said:
  "I go to Chapel"                → custom, named "Chapel"
  "I close my day with Audio Divina" → that IS the evening anchor. Set the
                                    evening level to custom named "Audio Divina"
                                    (a preset slot practice can't be an anchor,
                                    but a custom one carrying its name can, and
                                    the app links it to the real practice).
  "I read the lectionary / the daily readings / the appointed readings"
                                  → level "readings". This is Daily Scripture
                                    Reading, an ANCHOR — not the "reading"
                                    slot practice, which is a book they're
                                    working through at their own pace.
  "I read scripture in the morning" → ambiguous. ASK whether that's the
                                    lectionary (the appointed readings) or
                                    something they've chosen themselves. The
                                    first is level "readings"; the second is
                                    phoebe:slot:reading.
NEVER record the same practice twice — once as the anchor and again as a slot
or custom practice. Reported: "morning scripture reading" produced BOTH the
lectionary anchor AND a custom reading practice.

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
These are four DIFFERENT publications; do not substitute one for another.
"the Dean's Commentary", "the Dean's", "VTS" → vts, never fdd.
"Forward Day by Day", "FDD", "Forward Movement" → fdd.
"the CAC", "Richard Rohr", "the daily meditation" → cac.
"SSJE", "Brother Give Us a Word" → ssje.
Turn one on by putting its key in homeLayout.order (that list is what the home
actually reads). "phoebe:office:reflection:<side>" is a single legacy value —
set it to the primary one if you like, but the LAYOUT is what decides.

A SIT THAT IS THE ANCHOR IS NOT ALSO THE CONTEMPLATIVE PRACTICE.

If their morning prayer IS a silent sit, or their evening prayer is, that sit is
the SIDE'S ANCHOR (level "reflect-sit") and nothing else. Do not also set a
contemplation flag, a silence goal, or a contemplative slot for it — that
records one practice twice and makes their day look fuller than it is.

Someone can have a sit as an anchor AND separate silence elsewhere; that's real,
but only when they describe both. If a sit is their only contemplative practice
and it's serving as an anchor, then contemplation is EMPTY — and the middle of
their day is whatever else they keep (a newsletter, a walk). Don't invent a
second sit to fill it, and if you can't tell what the middle of their day is,
ASK.

THE RULE ABOVE IS ABOUT A SIT, NOT ABOUT EVERY CONTEMPLATIVE PRACTICE. Silence
has a level of its own ("reflect-sit"), and so does Creation Prayer
("creation"), so for those two the anchor is the level and the flag stays off.
A contemplative WALK, Audio Divina and Visio Divina have no level — the side's
contemplation flag plus its kind IS how that side's practice is recorded. So
someone whose whole evening is a contemplative walk gets
  "phoebe:office:contemplation:evening" = "1"
  "phoebe:office:contemplation-kind:evening" = "walk"
and no evening level. Don't force that onto the nearest level, and don't demote
it to an all-day slot — a slot means "somewhere in the day", which is a
different claim from "this is how they pray the evening".

Contemplative prayer. A side's contemplation flag is ONLY for a side whose
PRAYER IS that contemplative practice. If they pray Morning Prayer AND sit in
silence, that is one morning practice plus a silence habit — put the minutes in
officePrefs.contemplationGoalMinutes and leave the side's flag off. Set the
per-side flag only when that side has no other practice.

The silence GOAL is silence only. officePrefs.contemplationGoalMinutes counts
SITTING, so it is never where a walk, a breath, Audio Divina or Visio Divina
goes — those are a side's practice (flag + kind) or an all-day practice with a
slot, and folding their minutes into the goal reports a day of silence nobody
sat. A goal also never implies a per-side practice: someone can keep twenty
minutes of silence a day with neither side contemplative.
  "phoebe:office:contemplation:<side>" = "1" or "0" — a contemplative practice
      attached to that side, shown as its own Morning/Evening card
  "phoebe:office:contemplation-kind:<side>" = WHAT that side's contemplative
      practice is. One of:
        "silent"   — sitting in silence
        "creation" — Creation Prayer, a guided breath
        "walk"     — a contemplative walk
        "audio"    — Audio Divina, praying with music
        "visio"    — Visio Divina, praying with an image
      SET THIS WHENEVER you set a side's contemplation flag to "1". A side
      whose practice is a walk is not a sit that happens to move: the card, the
      timer, what completes it and whether it counts toward a silence goal all
      follow this key. Leaving it off means the side is read as silent, so an
      evening of Creation Prayer becomes an evening of silence.
  "phoebe:office:minutes:<side>" = minutes for THAT side's practice, e.g. "10"
  "phoebe:contemplation-style" = "silent" or "cobreathe" — a GLOBAL fallback
      for surfaces with no side in hand. Don't set it: it applies to both
      sides at once, so writing it here retypes a side you didn't ask about.
      Say what each side is with the per-side kind above.
  "phoebe:contemplation-sits" = "one" or "several" — whether the daily minutes
      are a single sit or spread across the day. Doesn't change what's counted
      (the goal is a daily TOTAL either way); it's what makes the number mean
      the right thing, and it's remembered so we don't ask twice.
  "phoebe:contemplation-log-method" — INFER "timer" when they name a length.
      "fifteen minutes", "I sit for twenty" means they are timing it, so give
      them the countdown; they can switch to a manual log on the screen. Only
      choose "manual" when the way they describe it rules a timer out — sitting
      in church, keeping time by a bell, a sit with no length at all.
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

TWO PRACTICES ON ONE SIDE. A side has exactly ONE anchor, but people really do
keep two — owner: "one user wanted both the devotion and the office in the
morning, because they'd use the devotion themselves and then go to Morning
Prayer." Don't drop one and don't merge them. Instead:
  · The one they name as their main prayer for that half of the day is the
    ANCHOR (phoebe:office:level:<side>).
  · The other becomes a "customPractices" entry, titled the way they'd say it —
    "Morning Devotion", "Evening Devotion" — with the matching slot.
DON'T ASK WHEN ONE OF THEM ISN'T AN ANCHOR-SHAPED PRACTICE. If a side has two
practices and one of them is a silent sit (centering prayer, contemplative
prayer, meditation), sacred listening / Audio Divina, a contemplative walk, or
Creation Prayer, then the OTHER one is the anchor and that one is the
additional practice.
That isn't a guess, it's what the two things are. Reported: "I said I do
centering prayer in the morning and daily scripture reading in the morning, and
it asked me which one was my main practice" — the answer was already there.

Ask only when the two are genuinely the same KIND of thing and nothing
distinguishes them ("I read Forward Day by Day and I read the Dean's
Commentary" — which anchors the morning?). Phrase it as the anchor:
"Which of those is your main morning prayer?" Never guess between two practices
of the same kind that someone told you they both keep.

AND NAME THE RIGHT SIDE. A question about the evening offers evening practices;
one about the morning offers morning ones. Reported: "Which is your main
evening practice, Morning Prayer or Audio Divina?" — which asks about one half
of the day and then offers a practice from the other, so neither answer can be
right. If a practice they named belongs to a different side than the one you're
asking about, that is itself the thing to sort out, not a choice to offer.

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
WHAT YOU ARE DEFINING — the practices they keep, as ONE list:

  · The forms of PRAYER they keep and WHEN — Morning Prayer, Evening Prayer,
    Compline, the psalms, the appointed readings, a short devotion, Simple
    Guided Prayer, the Examen, a silent sit that is itself their prayer, or
    something they name.
  · SILENCE — whether they sit at all, roughly how many minutes all told, and
    whether that is one sit or several.
  · Practices kept through the day — a walk, a breath, sacred listening,
    Visio Divina, an icon, a spiritual, Lectio, a book, podcasts.
  · NEWSLETTERS — the daily reflections they read: the CAC meditation, Forward
    Day by Day, SSJE, the VTS Dean's Commentary, Sojourners, Nouwen, Grist.

Every one of these is a card of equal standing on their home. There is no
"main" practice and no anchor to pick — do not ask which of two practices
matters more. Reminder times are worth capturing when mentioned, but they
are a detail of a practice, never the subject.
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

PLURALS AND COLLECTIVES ARE ANSWERS TOO:
  "I pray the offices" / "I pray the Daily Office"  → BOTH sides, level
      "office". They have told you morning AND evening. Do not ask which ones,
      and do not ask what they pray at each — you already know. Reported: "I
      said I pray the offices and it asked me if I pray morning and evening and
      what I pray at each."
  "I pray the hours"                → same: the offices, both sides.
  "I do Morning and Evening Prayer" → both sides, level "office".

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
function requestBody(system: string, user: string, budget: number, legacy: boolean, model: string) {
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  return legacy
    ? { model, temperature: 0.2, max_tokens: budget, response_format: { type: "json_object" }, messages }
    : {
        model,
        max_completion_tokens: budget,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages,
      };
}

async function askOpenAi(
  system: string,
  user: string,
  maxTokens: number,
  model: string = MODEL,
): Promise<OpenAiResult> {
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
        body: JSON.stringify(requestBody(system, user, budget, legacy, model)),
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
    console.warn(`[routine-interview] OpenAI network error (model "${model}"):`, err);
    return { ok: false, status: 502, error: "ai_unreachable" };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Name the model in the log: the commonest cause of a 404 here is a model
    // this account cannot see, and a log line that omits WHICH model sends you
    // hunting through env vars.
    console.warn(`[routine-interview] OpenAI ${res.status} for model "${model}": ${body.slice(0, 300)}`);
    // Distinguish the failures that need a HUMAN to fix something from the ones
    // that are worth retrying. They used to collapse into one "couldn't reach
    // the assistant", which reads as a network blip — so a bad key or a model
    // this account can't see looked like weather, and nobody went to check.
    // Nothing from the upstream body is echoed to the client; only which KIND
    // of failure it was.
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: 502, error: "ai_bad_key" };
    }
    if (res.status === 404 || /model_not_found|does not exist|do not have access/i.test(body)) {
      return { ok: false, status: 502, error: "ai_bad_model" };
    }
    // OpenAI returns 429 for two unrelated things: too many requests, and an
    // account with no money in it. Only the first is worth waiting out — an
    // exhausted balance never clears on its own, so "give it a minute" would
    // send someone away to retry forever. Checked BEFORE the rate-limit case
    // because both arrive as 429; the body is the only thing that separates
    // them.
    if (/insufficient_quota|credit_balance_exhausted|billing/i.test(body)) {
      return { ok: false, status: 502, error: "ai_no_credits" };
    }
    if (res.status === 429) {
      return { ok: false, status: 502, error: "ai_rate_limited" };
    }
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

/**
 * What Phoebe can hold, in PLAIN WORDS — for the question-asking call only.
 *
 * The follow-up call used to get PHOEBE_VOCAB: a thousand words of ruleConfig
 * key syntax ("phoebe:office:level:<side>", allowed enum values, homeLayout
 * mechanics). It writes no rule-config and never will. Measured, 60% of its
 * prompt was instructions for an output it doesn't produce — spent by the one
 * call whose whole job is judgment about a person.
 *
 * What it actually needs is the SHAPE of what's answerable, so it can tell a
 * real gap from a detail. That's this: names, not keys.
 */
const PRACTICE_MENU_PLAIN = `
WHAT PHOEBE CAN RECORD — so you know what counts as an answer. One list:

  Forms of prayer, each at a time of day: the Daily Office (Morning/Evening
  Prayer), a short devotion, the appointed psalms, the day's readings, Simple
  Guided Prayer, the Examen, Compline, Forward Day by Day, a silent sit, or
  something they name themselves. As many as they keep.

  How they take an office: from their prayer book, on a screen, read aloud, or
  on venite.app. DON'T ASK — a later screen offers this as a dropdown.

  Silence: whether they sit, how many minutes ALL TOLD across the day, and
  whether that's one sit or several.

  Daily reflections, any number: the CAC meditation, Forward Day by Day, SSJE,
  the VTS Dean's Commentary, Sojourners, Nouwen, Grist.

  Practices kept through the day: a contemplative walk, sacred listening,
  Creation Prayer (a guided breath), Visio Divina, Praying with Icons, the
  Taizé meditation, Spirituals, Lectio Divina, reading a book, podcasts.

  Anything else they keep is recorded under its own name, so an unusual
  practice is never a problem — you don't need to force it onto this list.

  Reminders are ON by default at a sensible hour. Only worth asking about if
  they raise the subject.
`.trim();

/**
 * The scribe framing, written for ASKING rather than programming.
 *
 * TRANSCRIBE_NOT_PRESCRIBE is six numbered rules about producing a spec —
 * don't lengthen their times, leave the reminder "none", your notes describe
 * what you recorded. All correct for the build call, all noise for this one.
 */
const ASKING_BRIEF = `
Someone has just described the daily prayer practice they ALREADY KEEP, in
their own words. Your only job is to decide what still isn't clear, and ask.

You are a scribe, not a spiritual director. You are not designing a rhythm or
improving one. A question that nudges them toward a fuller practice is a
failure of this task even if the practice would be good for them.

An unmentioned area is a gap in YOUR KNOWLEDGE, not a hole in their life. Ask
because you don't know, never because something is missing.

WHAT THEY WANT TO START COUNTS TOO. "I'd like to pray the office more often",
"I want to start sitting in silence", "I've been meaning to read Compline" —
that is a person telling you what to put in their rhythm. Program it. Do NOT
interrogate whether they already do it: asking "are you currently practicing
contemplative prayer?" of someone who just said they'd like to practise it more
answers a question they didn't ask and refuses the one they did. Reported
verbatim. Ask about the SHAPE of the practice they want — when, how long — not
about whether they've earned it yet.
`.trim();

/**
 * One worked example. The rules describe how to phrase a question; this shows
 * the harder thing — WHICH questions are worth spending, and why the obvious
 * ones aren't. That judgment is the whole reason this call exists, and it was
 * the one thing the prompt never demonstrated.
 */
const FOLLOWUP_EXAMPLE = `
WORKED EXAMPLE — what good judgement looks like here.

They wrote: "I do Morning Prayer most days from my prayer book, usually around
7. I read the CAC meditation with my coffee. Evenings are hit or miss."

Good questions:
  · "Do you pray anything in the evening on the days it does happen?"
  · "Is there any part of the day you spend in silence?"

Why those: the morning is fully answered — "Morning Prayer" names the office,
"from my prayer book" names the form, "around 7" names the time, so asking
anything about the morning wastes a question. "Hit or miss" says the evening
EXISTS but not what it is. Silence was never mentioned at all, and an unasked
silence is the difference between a rhythm with a contemplative centre and one
without.

Bad questions, and why:
  · "How do you take Morning Prayer?" — already answered, and it's a dropdown
    later regardless.
  · "Would you like to add Compline?" — proposes a practice. Not your job.
  · "What time do you read the CAC meditation?" — a detail that changes almost
    nothing about the routine.
`.trim();


const RC_LEVELS = new Set([
  "ask", "devotion", "office", "intercessions", "reflect-sit", "journal", "fdd",
  "readings", "psalms", "examen", "creation", "guided-prayer", "custom", "compline",
]);
const RC_ENTRIES = new Set(["read", "listen", "watch", "book", "venite"]);
const RC_REFLECTIONS = new Set(["cac", "fdd", "ssje", "vts", "sojo", "nouwen", "grist", "none"]);
const RC_SLOTS = new Set(["morning", "anytime", "midday", "afternoon", "evening"]);
const RC_STYLES = new Set(["silent", "cobreathe"]);
/**
 * What a side's contemplative practice IS — the per-side model.
 *
 * Mirrors CONTEMPLATION_KINDS in the client's officePrefs. Deliberately NOT
 * the two-valued global above: "cobreathe" is that global's spelling of the
 * breath, while a side says "creation".
 */
const RC_KINDS = new Set(["silent", "creation", "walk", "audio", "visio"]);

function labelFor(key: string): string {
  const side = key.endsWith(":morning") ? "morning" : key.endsWith(":evening") ? "evening" : null;
  // "an evening practice", not "a evening practice" — this string is shown to
  // the person on the review screen, so the article has to agree.
  if (key.includes(":level:") && side) return `${side === "evening" ? "an" : "a"} ${side} practice`;
  if (key.startsWith("phoebe:office:extra:") && side) return `a second ${side} practice`;
  if (key.includes(":entry:") && side) return `a way to pray the ${side} office`;
  if (key.includes(":reflection")) return "a daily reflection";
  if (key.startsWith("phoebe:slot:")) return `a time of day for ${key.slice("phoebe:slot:".length)}`;
  if (key.startsWith("phoebe:office:contemplation-kind:") && side) return `a ${side} contemplative practice`;
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
    // A side's SECOND practice holds a LEVEL too, so it validates against the
    // same enum. Without a case here it fell through unchecked and any string
    // the model invented would have been stored as a practice.
    if (k.startsWith("phoebe:office:extra:")) { if (!RC_LEVELS.has(v)) reject(k, v); continue; }
    if (k.includes(":entry:")) { if (!RC_ENTRIES.has(v)) reject(k, v); continue; }
    if (k.includes(":reflection")) { if (!RC_REFLECTIONS.has(v)) reject(k, v); continue; }
    if (k.startsWith("phoebe:slot:")) { if (!RC_SLOTS.has(v)) reject(k, v); continue; }
    if (k === "phoebe:contemplation-style") { if (!RC_STYLES.has(v)) reject(k, v); continue; }
    // A SIDE's contemplative practice has a KIND, and it validates like every
    // other enum here. Without this case the key fell through unchecked and
    // any string the model invented was stored — the same hole that let an
    // invented practice through phoebe:office:extra: before it got a case.
    // The client's reader validates on the way out and falls back, so a bad
    // value showed up as "this side is silent" rather than as an error.
    if (k.startsWith("phoebe:office:contemplation-kind:")) { if (!RC_KINDS.has(v)) reject(k, v); continue; }
    if (k === "phoebe:contemplation-log-method") { if (v !== "timer" && v !== "manual") reject(k, v); continue; }
    if (k === "phoebe:contemplation-sits") { if (v !== "one" && v !== "several") delete rc[k]; continue; }
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
  // "ask" means the side has NO practice — and it's a truthy string, so a plain
  // presence check forced the Office card onto the home of someone who
  // described only a walk and a newsletter. The build prompt explicitly asks
  // for "ask" on an empty side, so that output is expected, not exceptional.
  // describeSpec emits no row for it either, meaning the card appeared without
  // ever showing up on the review they approved.
  const realLevel = (side: string) => {
    const lvl = rc[`phoebe:office:level:${side}`];
    return !!lvl && lvl !== "ask";
  };
  if (realLevel("morning") || realLevel("evening")) required.push("office");
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

/**
 * A side with a practice gets a reminder.
 *
 * Owner: "we want notifications to be defaulted on." The prompt has said so
 * since the beginning, but a prompt is a request — the model still returned
 * "none" often enough that people landed on a routine with the bell off and no
 * idea why. Enforced here instead, the same way the Venite default is.
 *
 * Turning it OFF stays easy and visible: the read-back slide carries the
 * switch. This only decides where the switch STARTS.
 */
function defaultRemindersOn(spec: {
  officePrefs: {
    morning: string; evening: string;
    morningTime: string | null; eveningTime: string | null;
  };
  ruleConfig: Record<string, string>;
}): void {
  for (const side of ["morning", "evening"] as const) {
    const level = spec.ruleConfig[`phoebe:office:level:${side}`];
    if (!level || level === "ask") continue;
    const op = spec.officePrefs as unknown as Record<string, string | null>;
    if (!op[side] || op[side] === "none") {
      op[side] = level === "devotion" ? "devotion" : "office";
    }
    if (!op[`${side}Time`]) op[`${side}Time`] = side === "morning" ? "07:00" : "18:00";
  }
}

/**
 * One practice, recorded once.
 *
 * Reported twice: "whenever the questionnaire hears scripture reading, it adds
 * scripture reading AND reading as a separate practice." The prompt forbids it
 * and the model kept doing it anyway — the two really are near-synonyms in
 * English, so this is the kind of thing to settle in code rather than ask for.
 *
 * A side whose ANCHOR is the appointed readings already has the lectionary; a
 * "reading" slot beside it is the same act listed twice. Same for a side whose
 * anchor is the Examen, the psalms, or a silent sit — each has a slot twin.
 */
const ANCHOR_SLOT_TWINS: Record<string, string> = {
  readings: "reading",
  examen: "examen",
};

/**
 * Carry a sit-frequency ANSWER into the spec, deterministically.
 *
 * Reported: the follow-up asked "once a day or more than once?", they answered
 * "more than once", and the third stage still came up with "Once a day"
 * selected. The vocab documents "phoebe:contemplation-sits", but the model
 * treats it as optional and routinely omits it — and an absent key reads as
 * "one" on the client, so a direct answer to a direct question was being
 * thrown away.
 *
 * This is not something to fix by asking the prompt more firmly. When the
 * person has already answered in words, the answer is data; a post-pass that
 * reads it is exact, and costs nothing when the model got it right.
 */
function carrySitFrequency(
  spec: { ruleConfig: Record<string, string> },
  followups: Array<{ q: string; a: string }>,
): void {
  for (const f of followups) {
    const q = (f?.q || "").toLowerCase();
    const a = (f?.a || "").toLowerCase();
    if (!a) continue;
    // Only a question that actually offered the choice — otherwise "twice" in
    // an answer about anything else would land here.
    const asksFrequency = /(once|how (many times|often))/.test(q)
      && /(sit|silen|contempl|medit|pray)/.test(q);
    if (!asksFrequency) continue;
    // Check "more" first: "more than once" contains "once".
    if (/(more than once|several|multiple|twice|three times|a few times|couple of times|throughout the day|morning and (evening|night))/.test(a)) {
      spec.ruleConfig["phoebe:contemplation-sits"] = "several";
    } else if (/(once|one time|just the once|single sit)/.test(a)) {
      spec.ruleConfig["phoebe:contemplation-sits"] = "one";
    }
  }
}

function dropSlotTwinsOfAnchors(spec: { ruleConfig: Record<string, string> }): string[] {
  const rc = spec.ruleConfig;
  const notes: string[] = [];
  for (const side of ["morning", "evening"] as const) {
    const level = rc[`phoebe:office:level:${side}`];
    const twin = level ? ANCHOR_SLOT_TWINS[level] : undefined;
    if (twin && rc[`phoebe:slot:${twin}`]) {
      delete rc[`phoebe:slot:${twin}`];
      notes.push(`That's one practice, not two — it's recorded as your ${side} prayer rather than twice.`);
    }
  }
  return notes;
}

function normalizeContemplation(spec: {
  officePrefs: { contemplationGoalMinutes: number };
  ruleConfig: Record<string, string>;
}): void {
  const rc = spec.ruleConfig;
  for (const side of ["morning", "evening"] as const) {
    if (rc[`phoebe:office:contemplation:${side}`] !== "1") continue;
    /**
     * ONLY a SILENT sit can be re-homed into the silence goal. This loop was
     * kind-blind: an evening of Creation Prayer beside an office anchor had
     * its side flag forced to "0" and its minutes folded into
     * contemplationGoalMinutes — the practice silently retyped as silence,
     * which is the exact conflation the per-side kind key exists to prevent.
     * A creation/walk/audio/visio side is a DIFFERENT practice, not a sit in
     * the wrong home; it coexists with the anchor and stays.
     */
    const kind = rc[`phoebe:office:contemplation-kind:${side}`];
    const isSilent = kind ? kind === "silent" : rc["phoebe:contemplation-style"] !== "cobreathe";
    if (!isSilent) continue;
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
    // Write "0", don't DELETE — and this one is worth spelling out.
    //
    // getSideContemplationExplicit() returns NULL for a missing key, and the
    // customizer has a legacy migration keyed on exactly that: "a goal with no
    // explicit per-side pick must be an old global goal, so check BOTH sides."
    // Deleting the keys here made a freshly-built routine look exactly like
    // that legacy state, so opening Customize turned a 90-minute daily quota
    // into Morning + Evening Contemplation at 5 minutes each — and finishing
    // the customizer then wrote those sits back over the quota. Reported as:
    // "when I went to the manual it showed morning and evening instead of
    // being a quota ... and I didn't change anything."
    //
    // "0" means off. Absence means unknown. They are not the same thing, and
    // the difference was a routine quietly rewriting itself.
    rc[`phoebe:office:contemplation:${side}`] = "0";
    delete rc[`phoebe:office:minutes:${side}`];
    // The kind key would otherwise outlive the practice it described.
    delete rc[`phoebe:office:contemplation-kind:${side}`];
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

/**
 * Titles that are ACTUALLY Phoebe presets, however the model labelled them.
 *
 * Reported: "I asked it to add creation prayer to the routine and it didn't
 * recognise it as a Phoebe practice." It came back as a custom practice —
 * alongside the real Creation Prayer card — so the review showed the same
 * practice twice, once as "Creation prayer, in the afternoon" with a leaf, once
 * as "Creation Prayer, any time of day" with the globe, plus a note explaining
 * it "does not match a preset option". It plainly does.
 *
 * Enforced here rather than by asking the prompt more nicely. The vocabulary
 * already lists these; a model that misses the mapping once will miss it again,
 * and the cost is a duplicated practice in someone's rule of life.
 */
const PRESET_BY_TITLE: Record<string, string> = {
  "creation prayer": "cobreathe",
  "co-breathe": "cobreathe",
  "cobreathe": "cobreathe",
  "audio divina": "listening",
  "sacred listening": "listening",
  "contemplative walk": "walk",
  "prayer walk": "walk",
  "walking prayer": "walk",
  "the examen": "examen",
  "examen": "examen",
  "reading": "reading",
};

/** Split what the model called "custom" into real presets and genuine customs. */
function splitCustomPractices(items: CustomPractice[]): {
  presets: Array<{ key: string; slot: string }>;
  customs: CustomPractice[];
} {
  const presets: Array<{ key: string; slot: string }> = [];
  const customs: CustomPractice[] = [];
  for (const item of items) {
    const key = PRESET_BY_TITLE[item.title.trim().toLowerCase()];
    if (key) presets.push({ key, slot: item.slot });
    else customs.push(item);
  }
  return { presets, customs };
}

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


/**
 * The routine they're standing on, for the ADJUST flow.
 *
 * Owner: "if someone already has a routine and they click 'ask me about my
 * practice', have two more options — start from scratch, or adjust my routine
 * ... just create a flow where it says what would you like to adjust."
 *
 * Adjusting is a different task from transcribing, and the model cannot do it
 * blind: told only "move evening prayer to nine" with no idea what else is in
 * force, it invents a plausible whole routine and quietly drops the practices
 * they never mentioned. So the current routine goes into the prompt, with an
 * explicit instruction to carry forward everything untouched.
 */
async function currentRoutineContext(userId: number): Promise<string> {
  // Swallow its own failures. This is CONTEXT, not the request: if the read
  // fails, the right outcome is a build that treats the description as a fresh
  // routine, not a 502 that loses everything they typed.
  let spec: Awaited<ReturnType<typeof captureRoutineSpec>> = null;
  try {
    spec = await captureRoutineSpec(userId);
  } catch (err) {
    console.error("[routine-interview] current-routine context failed:", err);
    return "";
  }
  if (!spec) return "";
  const rows = describeSpec(spec);
  if (rows.length === 0) return "";
  return [
    "THEIR CURRENT ROUTINE — this is what is in force right now:",
    ...rows.map((r) => `\u00b7 [${r.section}] ${r.label} \u2014 ${r.sub}`),
    "",
    "They are ADJUSTING this, not replacing it. Produce the WHOLE routine with",
    "their change applied. Everything they did not ask to change must come back",
    "exactly as it is above \u2014 a practice missing from your output is a practice",
    "deleted from their rule of life, and they did not ask for that.",
  ].join("\n");
}

// The routine currently in force, described the same way the review describes a
// new one \u2014 so the adjust flow can show them what they're changing.
router.get("/routine-interview/current", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  // NOT admin-gated: this is a plain read of the CALLER'S OWN routine, and
  // the customizer's edit list (WayOfLoveRuleFlow's reloadEditRows) calls it
  // for every user. Gating it here would empty "Your rhythm" for everyone
  // who isn't an admin. It spends nothing and discloses nothing but your own.
  try {
    const spec = await captureRoutineSpec(userId);
    // Standing practices ride their own column, not the spec — see describeSpec.
    const defs = await readCustomAnchorDefs(userId) as CustomAnchorDef[];
    res.json({ settings: spec ? describeSpec(spec, defs) : [] });
  } catch (err) {
    console.error("[routine-interview] current failed:", err);
    // An empty list just means "no routine to adjust" \u2014 the client falls back
    // to the from-scratch flow rather than showing an error.
    res.json({ settings: [] });
  }
});


/**
 * Which parts of the day an adjustment actually touched.
 *
 * Owner: "if we're in the adjustment flow and the adjustment does not pertain
 * to the morning or evening practice, don't go through morning and evening and
 * contemplation on the third stage. If it's pertaining to the morning, just
 * show morning."
 *
 * Derived by DIFFING the rebuilt routine against the one in force, not by
 * asking the model what it changed. A model reporting on its own edit is the
 * same unreliable narrator the review rows were introduced to get away from —
 * and here a wrong answer either hides a change they never agreed to, or makes
 * them re-confirm two parts of their day they never mentioned.
 *
 * Compared as rendered rows, because that's exactly what the read-back shows:
 * if the slide would look identical, there is nothing on it to confirm.
 */
function changedSections(before: SpecRow[], after: SpecRow[]): SpecSection[] {
  const key = (rows: SpecRow[], section: SpecSection) =>
    JSON.stringify(
      rows.filter((r) => r.section === section).map((r) => [r.emoji, r.label, r.sub]),
    );
  const sections: SpecSection[] = ["morning", "contemplation", "evening"];
  return sections.filter((sec) => key(before, sec) !== key(after, sec));
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
  if (await refuseUnlessAdmin(req, res)) return;

  const description = cleanText(req.body?.description, 4000);
  if (description.length < 10) { res.status(400).json({ error: "too_short" }); return; }

  /**
   * The follow-up prompt is NOT the build prompt.
   *
   * It used to be: both calls got TRANSCRIBE_NOT_PRESCRIBE (six rules about
   * writing a spec) plus PHOEBE_VOCAB (a thousand words of ruleConfig key
   * syntax). Measured, 60% of this call's prompt described an output it never
   * produces — spent by the one call whose entire job is judgment about a
   * person. It now gets the asking brief, the four areas, the Episcopal
   * reading, the voice, a plain menu of what's answerable, and a worked
   * example of which questions are worth spending.
   */
  const system = `${ASKING_BRIEF}

${FOUR_THINGS}

${EPISCOPAL_LENS}

${VOICE}

${PRACTICE_MENU_PLAIN}

${FOLLOWUP_EXAMPLE}

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

IF THEY NAMED TWO FORMS OF PRAYER AT THE SAME TIME OF DAY, that is two
practices, both recorded — never ask which is the "main" one. Ask only when
you genuinely can't tell WHEN one of them is kept.

CONTEMPLATION needs its SHAPE, not just its presence. If silence comes up at
all, make sure you end up knowing: is it ONE sit, or several practices spread
through the day — and roughly how many minutes ALL TOLD. Ask only the part
they haven't already told you.

A YES/NO QUESTION MUST HAVE YES/NO CHOICES. "Should Evening Prayer be your
evening practice?" is not a paragraph to compose — give it
  "choices": ["Yes", "No"]
and let them tap. The same holds for any question with a small closed set of
answers. Reported: the questions had gone back to being open text fields even
where the answer was obviously one of two or three things. A free-text box is
for something only their own words can express.

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

  // In an ADJUSTMENT the floor of two is wrong, and expensively so. Someone who
  // said "move my evening reminder to nine" has told you everything; forcing
  // two questions makes the model invent them, and the person pays for a
  // manufactured interrogation plus a second model round-trip to answer a
  // request that was already complete. Zero is the right answer more often than
  // not here.
  const adjusting = req.body?.mode === "adjust";
  const questionFloor = adjusting
    ? `
OVERRIDE — THIS IS AN ADJUSTMENT, SO THE MINIMUM IS ZERO.

Return {"questions": []} whenever their request is already clear enough to act
on. That is the common case: "move evening prayer to 9", "turn off my morning
reminder", "add a contemplative walk" need nothing from you. Ask ONLY when you
genuinely cannot carry out the change without knowing more — an ambiguous time,
a practice named two ways, a change that could mean two different things.

Never ask to confirm what they already said. Never ask about a part of their
day the change does not touch.`
    : "";

  // In the ADJUST flow the questions have to be about the CHANGE, not a fresh
  // inventory of their whole day — asking "do you pray in the morning?" of
  // someone who just asked to move their evening reminder is an interrogation
  // about things we already know.
  const context = adjusting ? await currentRoutineContext(userId) : "";
  const askSystem = context
    ? `${system}
${questionFloor}

THIS IS AN ADJUSTMENT, NOT A NEW ROUTINE.

${context}

Ask ONLY about what their change leaves unclear. Never ask about a part of the
routine above that their request doesn't touch — you already have it. If the
change is completely clear on its own, ask about its edges (when, how long, how
often), never about the rest of their day.`
    : system;

  const out = await askOpenAi(
    askSystem,
    adjusting ? `WHAT THEY WANT TO ADJUST:\n${description}` : `THEIR DESCRIPTION:\n${description}`,
    500,
    FOLLOWUP_MODEL,
  );
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
  // Zero questions is a real answer for an adjustment ("move it to 9" needs
  // nothing) — the client skips straight to building. For a from-scratch run
  // it means the model returned nothing usable, which IS an error.
  if (questions.length === 0 && !adjusting) { res.status(502).json({ error: "ai_bad_json" }); return; }
  res.json({ questions });
});

/**
 * FLAT LIST → the existing spec.
 *
 * The one place the plumbing's shape is known. Deterministic on purpose: the
 * old prompt asked the model to decide anchors, extras, per-side kinds and
 * where a sit "belongs", and every one of those became a normalizer when the
 * model got it wrong. Here the rules are code:
 *
 *   · A form of prayer takes the half of the day it names (or its natural
 *     one). The FIRST on a side is that side's level; a SECOND becomes the
 *     side's extra practice (the plumbing's "two practices on one side"
 *     escape hatch); a third or a custom one becomes a custom practice with
 *     that slot. Nothing is dropped.
 *   · A walk / breath / Audio Divina / Visio Divina named for a half of the
 *     day that has NO prayer form IS that side's contemplative practice
 *     (flag + kind); otherwise it is an all-day card.
 *   · "silence" is the daily goal; "reflect-sit" is a side's prayer. The
 *     existing normalizeContemplation still re-homes a stray sit.
 *   · Every card goes into homeLayout.order; hideUnchosen states the rest.
 */
type FlatPractice = {
  key: string; when?: string; medium?: string; time?: string;
  minutes?: number; sits?: string; log?: string; title?: string; emoji?: string;
};
function parseFlatPractices(raw: unknown): FlatPractice[] {
  if (!Array.isArray(raw)) return [];
  const out: FlatPractice[] = [];
  for (const item of raw.slice(0, 24)) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    const key = cleanText(it.key, 24).toLowerCase();
    if (!key) continue;
    const when = cleanText(it.when, 12).toLowerCase();
    const minutes = typeof it.minutes === "number" ? it.minutes : parseInt(cleanText(it.minutes, 6), 10);
    out.push({
      key,
      when: WHEN.has(when) ? when : undefined,
      medium: cleanText(it.medium, 12).toLowerCase() || undefined,
      time: cleanText(it.time, 5) || undefined,
      minutes: Number.isFinite(minutes) ? Math.max(0, Math.min(180, Math.round(minutes))) : undefined,
      sits: cleanText(it.sits, 8).toLowerCase() || undefined,
      log: cleanText(it.log, 8).toLowerCase() || undefined,
      title: cleanText(it.title, 40) || undefined,
      emoji: cleanText(it.emoji, 8) || undefined,
    });
  }
  return out;
}

const SIDE_KIND_OF: Record<string, string> = { creation: "creation", walk: "walk", listening: "audio", visio: "visio" };
const SLOT_KEY_OF: Record<string, string> = { creation: "cobreathe", walk: "walk", listening: "listening", visio: "visio", reading: "reading" };

function specFromPractices(items: FlatPractice[]): { spec: Record<string, any>; customPractices: CustomPractice[]; notes: string[] } {
  const rc: Record<string, string> = {};
  const order: string[] = [];
  const add = (k: string) => { if (!order.includes(k)) order.push(k); };
  const notes: string[] = [];
  const customs: CustomPractice[] = [];
  const op: Record<string, any> = {
    defaultPrayerLevel: "ask", contemplationGoalMinutes: 0, contemplationReminderEnabled: false,
    morning: "none", evening: "none", morningTime: null, eveningTime: null,
  };
  const sideTaken: Record<"morning" | "evening", boolean> = { morning: false, evening: false };
  const sideOf = (p: FlatPractice, entry: CatalogueEntry): "morning" | "evening" => {
    if (p.when === "morning" || p.when === "evening") return p.when;
    if (entry.side) return entry.side;
    // A prayer form with no time named: the first free half, morning first.
    return sideTaken.morning ? "evening" : "morning";
  };

  // Prayer forms first, so the sides are settled before day practices ask
  // whether a side is free.
  const prayers = items.filter((p) => CATALOGUE[p.key]?.kind === "prayer" || (p.key === "fdd" && (p.when === "morning" || p.when === "evening")) || CATALOGUE[p.key]?.kind === "custom");
  for (const p of prayers) {
    const entry = CATALOGUE[p.key]!;
    const side = sideOf(p, entry);
    const level = p.key; // catalogue prayer keys ARE OfficeLevels (validated by RC_LEVELS later)
    if (!sideTaken[side]) {
      sideTaken[side] = true;
      rc[`phoebe:office:level:${side}`] = level;
      if (level === "custom" && p.title) rc[`phoebe:office:custom-name:${side}`] = p.title;
      if ((level === "office" || level === "devotion") && p.medium && RC_ENTRIES.has(p.medium)) rc[`phoebe:office:entry:${side}`] = p.medium;
      if (p.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.time)) op[`${side}Time`] = p.time;
      if (level === "compline" || level === "examen" || level === "fdd") add(level);
      add("office");
    } else if (level !== "custom" && !rc[`phoebe:office:extra:${side}`]) {
      // The plumbing's second seat on a side.
      rc[`phoebe:office:extra:${side}`] = level;
      notes.push(`Two practices in the ${side}: both kept, one alongside the other.`);
    } else {
      customs.push({ title: p.title || CATALOGUE[p.key]?.label.split(" — ")[0] || p.key, emoji: p.emoji || "🌿", slot: side });
    }
  }

  for (const p of items) {
    const entry = CATALOGUE[p.key];
    if (!entry) { notes.push(`We couldn't match "${p.key}" to a practice Phoebe has, so it was left off.`); continue; }
    if (entry.kind === "prayer" || entry.kind === "custom") continue; // done above
    if (entry.kind === "silence" || p.key === "silence") {
      if (p.minutes && p.minutes > 0) {
        op.contemplationGoalMinutes = Math.max(op.contemplationGoalMinutes, p.minutes);
        op.contemplationReminderEnabled = true;
        rc["phoebe:contemplation-log-method"] = p.log === "manual" ? "manual" : "timer";
        rc["phoebe:contemplation-sits"] = p.sits === "several" ? "several" : "one";
        add("contemplation");
      }
      continue;
    }
    if (entry.kind === "newsletter" || NEWSLETTER_KEYS.has(p.key)) {
      add(p.key);
      if (!rc["phoebe:office:reflection-source"]) rc["phoebe:office:reflection-source"] = p.key;
      continue;
    }
    // A day practice. Named for a half of the day that holds no prayer form →
    // that side's contemplative practice (its own Morning/Evening card).
    const sideKind = SIDE_KIND_OF[p.key];
    if (sideKind && (p.when === "morning" || p.when === "evening") && !sideTaken[p.when]) {
      sideTaken[p.when] = true;
      rc[`phoebe:office:contemplation:${p.when}`] = "1";
      rc[`phoebe:office:contemplation-kind:${p.when}`] = sideKind;
      if (p.minutes && p.minutes > 0) rc[`phoebe:office:minutes:${p.when}`] = String(p.minutes);
      add("contemplation");
      continue;
    }
    const slotKey = SLOT_KEY_OF[p.key];
    if (slotKey) {
      // The app treats cobreathe/listening/walk/examen as available all day and
      // ignores any other slot; only reading honours one.
      rc[`phoebe:slot:${slotKey}`] = slotKey === "reading" && p.when ? p.when : "anytime";
      add(slotKey);
      continue;
    }
    add(p.key); // icons, taize, spirituals, lectio, podcasts — layout-driven cards
  }

  if (!sideTaken.morning) rc["phoebe:office:level:morning"] = rc["phoebe:office:level:morning"] ?? "ask";
  if (!sideTaken.evening) rc["phoebe:office:level:evening"] = rc["phoebe:office:level:evening"] ?? "ask";
  if (order.length === 0) add("office");
  // The global anchor pref: the office when either side prays it, else the
  // first side's level (what the customizer's own commit writes).
  const lv = [rc["phoebe:office:level:morning"], rc["phoebe:office:level:evening"]].filter((l) => l && l !== "ask");
  op.defaultPrayerLevel = lv.includes("office") ? "office" : lv.includes("devotion") ? "devotion" : "ask";

  return {
    spec: { v: 1, officePrefs: op, silenceLadderEnabled: false, homeLayout: { order, hidden: [] }, ruleConfig: rc },
    customPractices: customs,
    notes,
  };
}

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
  if (await refuseUnlessAdmin(req, res)) return;

  const description = cleanText(req.body?.description, 4000);
  if (description.length < 10) { res.status(400).json({ error: "too_short" }); return; }

  const followups: Array<{ q: string; a: string }> = Array.isArray(req.body?.followups)
    ? req.body.followups
        .slice(0, 5)
        .map((f: any) => ({ q: cleanText(f?.q, 300), a: cleanText(f?.a, 1000) }))
        .filter((f: { q: string; a: string }) => f.q.length > 0)
    : [];

  const system = `${TRANSCRIBE_NOT_PRESCRIBE}

${FLAT_VOCAB}

Now record their rhythm. Respond with ONLY JSON in exactly this shape:

{
  "summary": "2-3 sentences, second person, describing the rhythm you recorded in plain language. No option names, no JSON keys.",
  "notes": ["short note about any judgement call or closest-match you had to make"],
  "practices": [
    { "key": "office", "when": "morning", "medium": "book", "time": "07:00" },
    { "key": "silence", "minutes": 20, "sits": "one", "log": "timer" },
    { "key": "cac" },
    { "key": "walk", "when": "afternoon" },
    { "key": "custom", "title": "The Rosary", "emoji": "📿", "when": "evening" }
  ]
}

"practices" must be non-empty. "notes" may be an empty array when nothing
needed judgement.`;

  // Corrections from the read-back round: we showed them what we'd heard for a
  // side and they said it was wrong. These carry more weight than the original
  // description — they are the person looking at our reading and rejecting it.
  const corrections: string[] = Array.isArray(req.body?.corrections)
    ? req.body.corrections.slice(0, 6).map((c: unknown) => cleanText(c, 500)).filter((c: string) => c.length > 0)
    : [];

  const buildAdjusting = req.body?.mode === "adjust";
  const buildContext = buildAdjusting ? await currentRoutineContext(userId) : "";
  // Snapshot how the routine reads BEFORE the change, so the diff below has
  // something to compare against. Only for an adjustment — a from-scratch build
  // has no "before" and confirms every part of the day.
  let beforeRows: SpecRow[] = [];
  if (buildAdjusting) {
    try {
      const cur = await captureRoutineSpec(userId);
      if (cur) beforeRows = describeSpec(cur);
    } catch { /* no baseline — fall back to confirming everything */ }
  }

  const userMsg = [
    buildContext ? `${buildContext}\n\n` : "",
    buildAdjusting ? `WHAT THEY WANT TO ADJUST:\n${description}` : `THEIR DESCRIPTION:\n${description}`,
    followups.length > 0
      ? `\n\nCLARIFICATIONS:\n${followups.map((f) => `Q: ${f.q}\nA: ${f.a || "(no answer)"}`).join("\n\n")}`
      : "",
    corrections.length > 0
      ? `\n\nWE READ THEIR PRACTICE BACK AND THEY CORRECTED US. These override anything above:\n${corrections.map((c) => `· ${c}`).join("\n")}`
      : "",
  ].join("");

  // 3200, not 2000. The system prompt has grown by roughly a third today
  // (the anchor rules, the Episcopal reading, the newsletter disambiguation),
  // and on a reasoning model the thinking tokens come out of the SAME budget
  // as the answer. A spec that gets truncated mid-JSON surfaces as "the
  // assistant's answer came back garbled", which reads like a fluke rather
  // than a budget we quietly outgrew.
  const out = await askOpenAi(system, userMsg, 3200, BUILD_MODEL);
  if (!out.ok) { res.status(out.status).json({ error: out.error }); return; }

  // sanitizeSpec returns null when homeLayout.order is empty — a reasonable
  // rule for a spec authored through the customizer UI, but a brutal one here:
  // the model can produce a perfectly good routine and simply forget the card
  // list, and the person loses a description and two answers to "the
  // assistant's answer came back garbled". The layout is derivable from the
  // routine itself, so derive it rather than fail.
  // THE FLAT LIST is the contract now; the adapter turns it into the spec the
  // rest of this pipeline has always taken. A model that answers in the legacy
  // shape ("spec") still goes through the old path.
  const flat = parseFlatPractices(out.data?.practices);
  const adapted = flat.length > 0 ? specFromPractices(flat) : null;
  const rawSpec = adapted ? adapted.spec : out.data?.spec;
  repairHomeLayout(rawSpec);

  // The model's spec is untrusted input. sanitizeSpec allowlists every field
  // and returns null when what's left isn't a usable routine.
  const spec = sanitizeSpec(rawSpec);
  if (!spec) { res.status(502).json({ error: "ai_bad_spec" }); return; }

  // Value-check the rule-config the model wrote (sanitizeSpec only checked its
  // shape) — mutates `spec.ruleConfig`, so it must run before the response.
  const scrubNotes = scrubRuleConfig(spec.ruleConfig);
  carrySitFrequency(spec, followups);
  normalizeContemplation(spec);
  dropSlotTwinsOfAnchors(spec);
  defaultEntryToVenite(spec);
  defaultRemindersOn(spec);
  hideUnchosen(spec);

  const modelNotes = Array.isArray(out.data?.notes)
    ? out.data.notes.map((n: unknown) => cleanText(n, 300)).filter((n: string) => n.length > 0).slice(0, 6)
    : [];
  // The model's own judgement calls, plus anything we had to reject — both
  // belong on the review screen for the same reason.
  const cardNote = droppedCardNote(rawSpec, spec.homeLayout.order);
  const notes = [...modelNotes, ...(adapted?.notes ?? []), ...scrubNotes, ...(cardNote ? [cardNote] : [])].slice(0, 8);

  // Customs come from the adapter on the flat path (a "custom" entry, or a
  // third prayer form on one side); from the model's own array on the legacy one.
  const parsedCustoms = adapted ? adapted.customPractices : parseCustomPractices(out.data?.customPractices);
  const { presets: mislabelled, customs: customPractices } = splitCustomPractices(parsedCustoms);
  // A preset the model called "custom" becomes the real thing: its own slot and
  // its own card, not a second look-alike beside it. Done before hideUnchosen
  // so the card it turns on is kept visible.
  for (const { key, slot } of mislabelled) {
    spec.ruleConfig[`phoebe:slot:${key}`] = RC_SLOTS.has(slot) ? slot : "anytime";
  }
  if (mislabelled.length > 0) {
    hideUnchosen(spec);
  }
  const afterRows = describeSpec(spec);
  // Empty for a from-scratch build, and for an adjustment with no baseline —
  // both of which mean "confirm the whole day", which is what the client does
  // when this is absent.
  const touched = buildAdjusting && beforeRows.length > 0
    ? changedSections(beforeRows, afterRows)
    : [];

  res.json({
    spec,
    changedSections: touched,
    customPractices,
    summary: cleanText(out.data?.summary, 800),
    // Derived from the sanitized spec, not from the model — this is what the
    // review screen asks them to approve. See describeSpec.
    settings: [
      ...afterRows,
      // Shown on the read-back and the review like any other row, so a custom
      // practice can be corrected the same way a preset one can.
      ...customPractices.map((c) => ({
        id: `custom:${c.title}`,
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
// Rate-limited like its siblings. /apply doesn't call the model, so it was
// left open — but it WRITES a whole rule of life, and a loop against it would
// churn the routine plus a snapshot on every call.
router.post("/routine-interview/apply", perUserRateLimit("routine_interview_apply", {
  max: 30, windowMs: 60 * 60 * 1000,
}), async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (await refuseUnlessAdmin(req, res)) return;

  const spec = sanitizeSpec(req.body?.spec);
  if (!spec) { res.status(400).json({ error: "invalid_spec" }); return; }
  // Same value-check /build runs. Not redundant: this endpoint takes a spec
  // from the client, which could post one that never went through /build —
  // including the extras step's additions, which change what should be hidden.
  scrubRuleConfig(spec.ruleConfig);
  normalizeContemplation(spec);
  dropSlotTwinsOfAnchors(spec);
  defaultEntryToVenite(spec);
  defaultRemindersOn(spec);
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
