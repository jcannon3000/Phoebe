import { Router, type IRouter, type Request } from "express";
import { pool } from "@workspace/db";
import { sendNewsletterEmail } from "../lib/email";
import { perUserRateLimit } from "../lib/rate-limit";

const router: IRouter = Router();

// ── Types ─────────────────────────────────────────────────────────────────────

type ConnectionFocus = "self" | "others" | "nature" | "transcendent";
type OfficeLevel = "devotion" | "office";
type ReflectionSource = "cac" | "fdd" | "ssje";
type WayToPray = "read";

interface SideSettings {
  enabled: true;
  level: OfficeLevel;
  wayToPray: WayToPray;
  reflectionSource: ReflectionSource;
  confession: boolean;
  gratitude: boolean;
  minutes: number;
  reminderTime: string;
}
interface SideDisabled { enabled: false }

interface RecommendedSettings {
  morning: SideSettings | SideDisabled;
  evening: SideSettings | SideDisabled;
}

export interface RuleOfLifeAnswers {
  mode: "self" | "clergy" | "together";
  subjectName?: string;
  pace: "calm" | "rushing" | "gradual" | "unpredictable";
  pause: "morning-coffee" | "commute" | "walk" | "mealtimes" | "before-sleep" | "still-looking";
  sacred: "morning-quiet" | "walks" | "music" | "reading" | "caring" | "rest" | "nothing";
  longing: "peace" | "direction" | "roots" | "belonging" | "grow" | "heal" | "give-back";
  connectionFocus: ConnectionFocus;
  godMoments: "nature" | "community" | "silence" | "service" | "scripture" | "beauty" | "rarely";
  carrying: "family" | "friends" | "suffering" | "myself" | "none";
  timeOfDay: "morning" | "evening" | "both";
  minutes: 5 | 10 | 15 | 20 | 30;
  frequency: "daily" | "most-days" | "few-times";
}

// ── Rule-based engine ─────────────────────────────────────────────────────────

// Several questions are now "select all that apply" and arrive as arrays.
// The rule engine reasons over a single primary value per field, so we
// collapse arrays to their first selection here while persisting the full
// multi-select payload in the DB.
function primary<T>(v: T | T[] | undefined | null): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

function deriveLevel(minutes: number): OfficeLevel {
  return minutes <= 10 ? "devotion" : "office";
}

function deriveReflectionSource(answers: RuleOfLifeAnswers): ReflectionSource {
  const { godMoments, connectionFocus } = answers;
  if (godMoments === "scripture" || connectionFocus === "transcendent") return "fdd";
  if (godMoments === "silence" || connectionFocus === "self") return "ssje";
  if (godMoments === "service" || connectionFocus === "others") return "cac";
  return "fdd";
}

function deriveAnchor(pause: RuleOfLifeAnswers["pause"]): string {
  const map: Record<RuleOfLifeAnswers["pause"], string> = {
    "morning-coffee": "right after your morning coffee",
    "commute": "during your commute",
    "walk": "before or after your daily walk",
    "mealtimes": "at mealtimes",
    "before-sleep": "before sleep",
    "still-looking": "whenever you find a moment",
  };
  return map[pause];
}

function buildSideSettings(answers: RuleOfLifeAnswers, side: "morning" | "evening"): SideSettings {
  const level = deriveLevel(answers.minutes);
  const reflectionSource = deriveReflectionSource(answers);
  const confession = answers.longing === "heal" && answers.minutes >= 15;
  const gratitude = ["peace", "roots", "belonging"].includes(answers.longing) || answers.connectionFocus === "self";
  const contemplationMinutes = answers.minutes >= 20 ? 10 : answers.minutes >= 15 ? 5 : 0;
  const reminderTime = side === "morning" ? "07:30" : "20:00";
  return { enabled: true, level, wayToPray: "read", reflectionSource, confession, gratitude, minutes: contemplationMinutes, reminderTime };
}

function buildSettings(answers: RuleOfLifeAnswers): RecommendedSettings {
  const enableMorning = answers.timeOfDay === "morning" || answers.timeOfDay === "both";
  const enableEvening = answers.timeOfDay === "evening" || answers.timeOfDay === "both";
  return {
    morning: enableMorning ? buildSideSettings(answers, "morning") : { enabled: false },
    evening: enableEvening ? buildSideSettings(answers, "evening") : { enabled: false },
  };
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = (h ?? 0) >= 12 ? "pm" : "am";
  const h12 = (h ?? 0) % 12 || 12;
  return `${h12}:${String(m ?? 0).padStart(2, "0")} ${ampm}`;
}

function generatePlainSummary(settings: RecommendedSettings, answers: RuleOfLifeAnswers): string {
  const parts: string[] = [];
  const minLabel = answers.minutes === 30 ? "30+ min" : `~${answers.minutes} min`;
  const freqLabel = answers.frequency === "daily" ? "every day" : answers.frequency === "most-days" ? "most days" : "a few times a week";

  for (const side of ["morning", "evening"] as const) {
    const s = settings[side];
    if (!s.enabled) continue;
    const ss = s as SideSettings;
    const levelName = ss.level === "devotion" ? "Daily Devotion" : side === "morning" ? "Morning Prayer" : "Evening Prayer";
    const extras: string[] = [];
    if (ss.gratitude) extras.push("gratitude pause");
    if (ss.confession) extras.push("confession");
    if (ss.minutes > 0) extras.push(`${ss.minutes} min silence`);
    const extrasStr = extras.length ? ` · ${extras.join(", ")}` : "";
    parts.push(`${levelName} (${side}) · ${minLabel}${extrasStr} · reminder ${fmtTime(ss.reminderTime)}`);
  }
  parts.push(freqLabel);
  return parts.join("\n");
}

// ── Narrative generators ──────────────────────────────────────────────────────

function p1_sacred(sacred: RuleOfLifeAnswers["sacred"], you: string): string {
  const youLower = you === "You" ? "you" : you;
  const isThirdPerson = you !== "You";
  switch (sacred) {
    case "morning-quiet":
      return `${you} already ${isThirdPerson ? "has" : "have"} a foothold in the morning. That stillness — even if you've never called it prayer — is a place where something holy already meets you.`;
    case "walks":
      return `Walking, feet on ground, the world moving past — ${youLower} already ${isThirdPerson ? "prays" : "pray"} this way, whether or not that's the word for it.`;
    case "music":
      return `Music already opens something in ${youLower}. That opening — being moved by sound — is one of the oldest forms of prayer.`;
    case "reading":
      return `Reading is already one of ${youLower}'s anchors. The practice we're imagining grows from that ground, not away from it.`;
    case "caring":
      return `What ${youLower} ${isThirdPerson ? "does" : "do"} for others already carries something prayerful. This practice names it and gives it space to breathe.`;
    case "rest":
      return `Rest itself is a practice. The discipline of stopping, releasing the day, lying down open — that's already a form of surrender.`;
    case "nothing":
      return `${you} said nothing yet feels sacred. That honesty is itself the beginning — undefended, available, which is exactly the right posture.`;
  }
}

function p2_longing(longing: RuleOfLifeAnswers["longing"], cf: ConnectionFocus, you: string): string {
  const youLower = you === "You" ? "you" : you;
  const isThirdPerson = you !== "You";
  switch (longing) {
    case "peace":
      if (cf === "others") return `The peace ${youLower} ${isThirdPerson ? "is" : "are"} looking for is partly relational — a quiet knowing of not carrying it alone. Prayer can be where ${youLower} ${isThirdPerson ? "names" : "name"} who ${youLower} ${isThirdPerson ? "is" : "are"} holding, and who is holding ${youLower}.`;
      if (cf === "transcendent") return `The peace ${youLower} ${isThirdPerson ? "is" : "are"} looking for isn't ${youLower}'s to manufacture. The Office names that and shows up for it anyway, day after day.`;
      return `The peace ${youLower} ${isThirdPerson ? "is" : "are"} looking for begins in becoming more present. Not a spiritual achievement — just a few moments of honest attention each day.`;
    case "direction":
      if (cf === "transcendent") return `A daily office won't hand ${youLower} a map. But it gives a posture — a regular turning toward the one who knows the way.`;
      if (cf === "others") return `Sometimes we find direction through the people we are called to serve. The practice ${youLower} ${isThirdPerson ? "is" : "are"} building keeps that calling in view.`;
      return `A sense of direction comes, strangely, from learning to be still enough to hear what ${youLower} already ${isThirdPerson ? "knows" : "know"}.`;
    case "roots":
      if (cf === "others") return `Roots grow in community. The practice ${youLower} ${isThirdPerson ? "is" : "are"} building, even when prayed alone, joins ${youLower} to fifteen centuries of people who prayed these same words.`;
      if (cf === "transcendent") return `Roots in God aren't earned — they are cultivated by showing up. The practice ${youLower} ${isThirdPerson ? "is" : "are"} beginning is exactly that.`;
      return `What ${youLower} ${isThirdPerson ? "means" : "mean"} by deeper roots is the willingness to stay — long enough for something to take hold.`;
    case "belonging":
      if (cf === "transcendent") return `The longing to belong is one of the oldest human prayers. The Psalms are full of it — and so is the tradition ${youLower} ${isThirdPerson ? "is" : "are"} entering.`;
      if (cf === "others") return `The longing to feel less alone has always had good company.`;
      return `Belonging — knowing ${you === "You" ? "yourself" : "themselves"} well enough to come home — is part of what this practice offers.`;
    case "grow":
      if (cf === "transcendent") return `Growth in prayer is less about doing it better and more about showing up — honestly, regularly, without much performance.`;
      if (cf === "others") return `Rooted people give themselves more freely. The practice ${youLower} ${isThirdPerson ? "is" : "are"} building is, ultimately, also for the people ${youLower} ${isThirdPerson ? "loves" : "love"}.`;
      return `The growth ${youLower} ${isThirdPerson ? "is" : "are"} after is the slow kind: more honest, more present, more rooted. This practice doesn't hurry.`;
    case "heal":
      if (cf === "transcendent") return `${you} ${isThirdPerson ? "is" : "are"} not alone in bringing something broken to this practice. The Office is large enough to hold it.`;
      if (cf === "others") return `Sometimes healing comes through the act of praying for others — generosity has a way of giving back to the giver.`;
      return `Healing usually happens quietly. A regular practice creates the conditions — a little stillness each day where something deeper than the surface can be touched.`;
    case "give-back":
      if (cf === "transcendent") return `The Office ends by sending ${youLower} out — "let us go forth in the name of Christ." The daily practice feeds the giving.`;
      if (cf === "self") return `${you} can only give from what ${youLower} ${isThirdPerson ? "has" : "have"}. The practice ${youLower} ${isThirdPerson ? "is" : "are"} beginning is partly about filling what gets emptied.`;
      return `Rooted people give themselves more freely. The practice ${youLower} ${isThirdPerson ? "is" : "are"} building is, at its core, also for the people ${youLower} ${isThirdPerson ? "serves" : "serve"}.`;
  }
}

function p3_practice(answers: RuleOfLifeAnswers, level: OfficeLevel, you: string): string {
  const { pause, timeOfDay, minutes } = answers;
  const youLower = you === "You" ? "you" : you;
  const levelName = level === "devotion" ? "Daily Devotion" : timeOfDay === "evening" ? "Evening Prayer" : "Morning Prayer";
  const minStr = minutes === 30 ? "thirty or more" : String(minutes);
  const possessive = you === "You" ? "your" : "their";
  const isThirdPerson = you !== "You";

  switch (pause) {
    case "morning-coffee":
      return `Right after ${possessive} morning coffee, before the day picks up speed — ${levelName}, about ${minStr} minutes — as ${possessive} anchor. Not because ${youLower} ${isThirdPerson ? "needs" : "need"} to add more, but because ${youLower} already ${isThirdPerson ? "pauses" : "pause"} there.`;
    case "commute":
      return `On the commute, before the day asks things of ${youLower} — the Office is designed for exactly that kind of in-between space. About ${minStr} minutes of ${levelName}.`;
    case "walk":
      return `Before or after ${possessive} daily walk — ${minStr} minutes with ${levelName}, a practice that matches ${possessive} pace.`;
    case "mealtimes":
      return `At the table, before or after a meal, is a time humans have always paused to give thanks. ${levelName} fits there — about ${minStr} minutes.`;
    case "before-sleep":
      return `At the end of the day, before sleep — ${levelName} has been prayed at that threshold for fifteen centuries. About ${minStr} minutes.`;
    case "still-looking":
      if (timeOfDay === "evening") return `Since ${youLower} ${isThirdPerson ? "is" : "are"} still finding ${possessive} pause, we suggest beginning in the evening — at the end of the day, when things quiet down. About ${minStr} minutes of ${levelName}.`;
      return `Since ${youLower} ${isThirdPerson ? "is" : "are"} still finding ${possessive} pause, we suggest trying mornings first — right after waking, before the phone. About ${minStr} minutes of ${levelName}.`;
  }
}

function p4_sustain(frequency: RuleOfLifeAnswers["frequency"], you: string): string {
  const youLower = you === "You" ? "you" : you;
  switch (frequency) {
    case "daily": return `A daily rhythm — even five minutes — is more transformative over time than a longer practice once a week. Roots grow in small increments.`;
    case "most-days": return `Most days is exactly right. Miss one, come back the next. The practice doesn't depend on ${youLower}'s perfect attendance.`;
    case "few-times": return `Two or three times a week is enough to begin. The goal isn't perfect consistency — it's a practice ${youLower} can return to after missing a day.`;
  }
}

function generateNarrative(answers: RuleOfLifeAnswers): string {
  const you = answers.mode === "clergy" && answers.subjectName ? answers.subjectName : "You";
  const level = deriveLevel(answers.minutes);
  return [
    p1_sacred(answers.sacred, you),
    p2_longing(answers.longing, answers.connectionFocus, you),
    p3_practice(answers, level, you),
    p4_sustain(answers.frequency, you),
  ].join("\n\n");
}

// ── Routes ────────────────────────────────────────────────────────────────────

function getUser(req: Request): { id: number; email: string; locale?: string } | null {
  return (req as any).user ?? null;
}

// POST /api/rule-of-life/recommend
router.post("/recommend", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  // The full payload (with multi-select arrays) is persisted as-is; a
  // normalized copy drives the rule engine, which expects one value per field.
  const rawAnswers = (req.body ?? {}) as Record<string, unknown>;
  const answers = {
    ...rawAnswers,
    pace: primary(rawAnswers.pace),
    pause: primary(rawAnswers.pause),
    sacred: primary(rawAnswers.sacred),
    longing: primary(rawAnswers.longing),
    godMoments: primary(rawAnswers.godMoments),
    carrying: primary(rawAnswers.carrying),
    connectionFocus: primary(rawAnswers.connectionFocus),
  } as RuleOfLifeAnswers;

  if (!answers?.timeOfDay || !answers?.minutes || !answers?.frequency ||
      !answers?.pause || !answers?.sacred || !answers?.longing) {
    res.status(400).json({ error: "Incomplete answers" });
    return;
  }

  try {
    const settings = buildSettings(answers);
    const narrative = generateNarrative(answers);
    const plainSummary = generatePlainSummary(settings, answers);
    const connectionFocus = answers.connectionFocus;
    const anchor = deriveAnchor(answers.pause);

    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO rule_of_life_sessions
         (created_by_user_id, subject_name, mode, locale, answers, narrative, plain_summary, settings, connection_focus, anchor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [user.id, answers.subjectName ?? null, answers.mode ?? "self", user.locale ?? "en",
       JSON.stringify(rawAnswers), narrative, plainSummary,
       JSON.stringify(settings), connectionFocus, anchor],
    );
    res.json({ id: rows[0]?.id, narrative, plainSummary, settings, connectionFocus, anchor });
  } catch (err) {
    console.error("[rule-of-life] recommend failed:", err);
    res.status(500).json({ error: "Failed to generate recommendation" });
  }
});

// GET /api/rule-of-life/list
router.get("/list", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const { rows } = await pool.query(
      `SELECT id, subject_name, mode, narrative, plain_summary, connection_focus, anchor, applied_at, created_at
       FROM rule_of_life_sessions WHERE created_by_user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [user.id],
    );
    res.json(rows);
  } catch (err) {
    console.error("[rule-of-life] list failed:", err);
    res.status(500).json({ error: "Failed to list" });
  }
});

// GET /api/rule-of-life/:id
// ── Way of Love selections ──────────────────────────────────────────────────
// NOTE: these literal routes MUST stay above the "/:id" wildcard below —
// otherwise GET /wol matches /:id (id="wol"), parseInt → NaN → 400, and the
// real handler never runs.
//
// GET /api/rule-of-life/wol — load persisted WOL selections. Returns
// { selections } mapping each practiceId → { optionIds, custom }. Empty if
// never saved.
router.get("/wol", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const { rows } = await pool.query(
      `SELECT selections FROM user_wol WHERE user_id = $1`,
      [user.id],
    );
    res.json({ selections: rows[0]?.selections ?? {} });
  } catch (err) {
    console.error("[rule-of-life] GET /wol failed:", err);
    res.status(500).json({ error: "Failed to load Way of Love" });
  }
});

// PUT /api/rule-of-life/wol — MERGE the incoming selection keys into the stored
// map (read-merge-write), never a blind replace. The customizer saves only a
// SUBSET (e.g. { pray, learn }), so a wholesale overwrite silently dropped every
// other Way-of-Love selection. Merging by key means a partial save only updates
// the keys it carries; absence is never a deletion.
router.put("/wol", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { selections } = req.body as { selections?: Record<string, unknown> };
  if (!selections || typeof selections !== "object") {
    res.status(400).json({ error: "selections must be an object" }); return;
  }
  try {
    const { rows } = await pool.query(`SELECT selections FROM user_wol WHERE user_id = $1`, [user.id]);
    const existing = (rows[0]?.selections && typeof rows[0].selections === "object") ? rows[0].selections as Record<string, unknown> : {};
    const merged = { ...existing, ...selections };
    await pool.query(
      `INSERT INTO user_wol (user_id, selections, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET selections = $2, updated_at = NOW()`,
      [user.id, JSON.stringify(merged)],
    );
    res.json({ ok: true, selections: merged });
  } catch (err) {
    console.error("[rule-of-life] PUT /wol failed:", err);
    res.status(500).json({ error: "Failed to save Way of Love" });
  }
});

// GET /api/rule-of-life/:id
router.get("/:id", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id ?? "", 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const { rows } = await pool.query(
      `SELECT id, subject_name, mode, locale, answers, narrative, plain_summary, settings, connection_focus, anchor, applied_at, delivered_to, created_at
       FROM rule_of_life_sessions WHERE id=$1 AND created_by_user_id=$2`,
      [id, user.id],
    );
    if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }
    res.json(rows[0]);
  } catch (err) {
    console.error("[rule-of-life] get failed:", err);
    res.status(500).json({ error: "Failed to fetch" });
  }
});

// POST /api/rule-of-life/:id/apply
router.post("/:id/apply", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id ?? "", 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    await pool.query(
      `UPDATE rule_of_life_sessions SET applied_at=NOW() WHERE id=$1 AND created_by_user_id=$2`,
      [id, user.id],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[rule-of-life] apply failed:", err);
    res.status(500).json({ error: "Failed" });
  }
});

// POST /api/rule-of-life/:id/email
// Rate-limited: this sends a Phoebe-branded email to a caller-supplied
// address, so without a cap an authed user could spray mail to arbitrary
// recipients and burn the sender domain's reputation.
router.post("/:id/email", perUserRateLimit("rule_of_life_email", { max: 10, windowMs: 60 * 60 * 1000 }), async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const { to } = req.body as { to?: string };
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    res.status(400).json({ error: "Valid email address required" });
    return;
  }

  try {
    const { rows } = await pool.query<{ narrative: string; plain_summary: string }>(
      `SELECT narrative, plain_summary FROM rule_of_life_sessions WHERE id=$1 AND created_by_user_id=$2`,
      [id, user.id],
    );
    const row = rows[0];
    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    const appBaseUrl = (process.env.APP_BASE_URL ?? "https://withphoebe.app").replace(/\/$/, "");
    const viewUrl = `${appBaseUrl}/rule-of-life/${id}`;

    const summaryLines = (row.plain_summary ?? "").split("\n").filter(Boolean);
    const summaryMd = summaryLines.map((l: string) => `- ${l}`).join("\n");

    const bodyMarkdown = [
      row.narrative ?? "",
      "",
      "---",
      "",
      "**Your suggested practice:**",
      "",
      summaryMd,
      "",
      `[[Open in Phoebe]](${viewUrl})`,
    ].join("\n");

    const ok = await sendNewsletterEmail({ to, subject: "Your Rule of Life", bodyMarkdown });
    if (ok) {
      await pool.query(
        `UPDATE rule_of_life_sessions SET delivered_to=$1 WHERE id=$2 AND created_by_user_id=$3`,
        [to, id, user.id],
      );
      res.json({ ok: true });
    } else {
      res.status(500).json({ error: "Email could not be sent" });
    }
  } catch (err) {
    console.error("[rule-of-life] email failed:", err);
    res.status(500).json({ error: "Failed to send email" });
  }
});

export default router;
