/**
 * Lectio Divina — routes for the three-stage Mon/Wed/Fri reflection cycle.
 *
 * Auth: token-based, like the rest of the moments flow. Routes take
 * :momentToken/:userToken so the practice can be used from an invite link
 * without a full session login.
 *
 * The "week" is anchored to the UPCOMING Sunday. Each calendar week runs:
 *   - Monday   → stage = lectio
 *   - Wednesday→ stage = meditatio
 *   - Friday   → stage = oratio
 *   - Sunday   → read-only "this week's journey" reveal
 * Other days either show the most-recently-passed stage (after Mon) or a
 * "starts Monday" placeholder (before Mon of the new week).
 *
 * THE GATE: a user only sees other members' reflections for a given stage
 * AFTER they've submitted their own for that stage.
 */

import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  sharedMomentsTable,
  momentUserTokensTable,
  lectioReflectionsTable,
} from "@workspace/db";
import type { LectionaryReading } from "@workspace/db";
import { getReadingForSunday, nextSundayDate } from "../lib/rclLectionary";

const router: IRouter = Router();

// ─── Stage / day-of-week helpers ────────────────────────────────────────────

type Stage = "lectio" | "meditatio" | "oratio";
const STAGES: Stage[] = ["lectio", "meditatio", "oratio"];

const STAGE_PROMPTS: Record<Stage, string> = {
  lectio: "What word or phrase is speaking to you?",
  meditatio: "What is this passage stirring in you?",
  oratio: "What is this passage calling you to do or to be?",
};

const STAGE_LABELS: Record<Stage, string> = {
  lectio: "Lectio",
  meditatio: "Meditatio",
  oratio: "Oratio",
};

function getDowInTz(tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).formatToParts(new Date());
    const name = (parts.find((p) => p.type === "weekday")?.value ?? "").toLowerCase();
    const map: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
    };
    return map[name] ?? new Date().getDay();
  } catch {
    return new Date().getDay();
  }
}

interface WeekState {
  // The stage the user should currently see (if any).
  currentStage: Stage | null;
  // The stages that have already "unlocked" this week (current + past, in order).
  unlockedStages: Stage[];
  // Human label like "Starts Monday" / "Monday reading" / "This week's journey".
  phaseLabel: string;
  // Is it Sunday — the read-only communal reveal view?
  isSunday: boolean;
}

function computeWeekState(tz: string): WeekState {
  const dow = getDowInTz(tz);
  // dow: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  if (dow === 0) {
    return {
      currentStage: null,
      unlockedStages: ["lectio", "meditatio", "oratio"],
      phaseLabel: "This week's journey",
      isSunday: true,
    };
  }
  if (dow === 1 || dow === 2) {
    return {
      currentStage: "lectio",
      unlockedStages: ["lectio"],
      phaseLabel: "Monday · Lectio",
      isSunday: false,
    };
  }
  if (dow === 3 || dow === 4) {
    return {
      currentStage: "meditatio",
      unlockedStages: ["lectio", "meditatio"],
      phaseLabel: "Wednesday · Meditatio",
      isSunday: false,
    };
  }
  if (dow === 5 || dow === 6) {
    return {
      currentStage: "oratio",
      unlockedStages: ["lectio", "meditatio", "oratio"],
      phaseLabel: "Friday · Oratio",
      isSunday: false,
    };
  }
  return {
    currentStage: null,
    unlockedStages: [],
    phaseLabel: "Next reading starts Monday",
    isSunday: false,
  };
}

// ─── Shared loader: resolve moment + user by token pair ─────────────────────

async function loadMomentAndMember(momentToken: string, userToken: string) {
  const [moment] = await db
    .select()
    .from(sharedMomentsTable)
    .where(eq(sharedMomentsTable.momentToken, momentToken));
  if (!moment) return { error: "moment_not_found" as const };
  if (moment.templateType !== "lectio-divina") return { error: "wrong_template" as const };

  const [userRow] = await db
    .select()
    .from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.userToken, userToken));
  if (!userRow || userRow.momentId !== moment.id) return { error: "invalid_token" as const };

  return { moment, userRow };
}

// ─── GET /api/lectio/:momentToken/:userToken — full current-week state ──────

router.get("/lectio/:momentToken/:userToken", async (req, res): Promise<void> => {
  const { momentToken, userToken } = req.params;
  const loaded = await loadMomentAndMember(momentToken, userToken);
  if ("error" in loaded) {
    const map: Record<string, number> = {
      moment_not_found: 404,
      wrong_template: 400,
      invalid_token: 404,
    };
    res.status(map[loaded.error] ?? 400).json({ error: loaded.error });
    return;
  }
  const { moment, userRow } = loaded;

  const tz = moment.timezone || "UTC";

  // Which Sunday is "this week's" reading anchored to?
  // Use upcoming Sunday — for Sunday itself, nextSundayDate() returns today.
  const sundayDate = nextSundayDate();

  // 1. Fetch (or read from cache) the reading for this Sunday.
  let reading: LectionaryReading;
  try {
    reading = await getReadingForSunday(sundayDate);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[lectio] fetch failed:", err);
    res.status(502).json({ error: "lectionary_fetch_failed", detail: msg });
    return;
  }
  const sundayIso = reading.sundayDate;

  // 2. Week state.
  const week = computeWeekState(tz);

  // 3. Load all members.
  const allMembers = await db
    .select()
    .from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.momentId, moment.id));

  // 4. Load reflections for this week (all stages, all members).
  const reflections = await db
    .select()
    .from(lectioReflectionsTable)
    .where(and(
      eq(lectioReflectionsTable.momentId, moment.id),
      eq(lectioReflectionsTable.sundayDate, sundayIso),
    ));

  // 5. Group reflections by stage.
  const reflectionsByStage: Record<Stage, typeof reflections> = {
    lectio: [],
    meditatio: [],
    oratio: [],
  };
  for (const r of reflections) {
    if (r.stage === "lectio" || r.stage === "meditatio" || r.stage === "oratio") {
      reflectionsByStage[r.stage as Stage].push(r);
    }
  }

  // 6. What the user has submitted (by stage).
  const mine: Record<Stage, string | null> = { lectio: null, meditatio: null, oratio: null };
  for (const s of STAGES) {
    const r = reflectionsByStage[s].find((x) => x.userToken === userToken);
    if (r) mine[s] = r.reflectionText;
  }

  // 7. Apply THE GATE: for each unlocked stage, only reveal others' reflections
  // if the current user has submitted their own for that stage.
  const stageReveals: Record<Stage, {
    label: string;
    prompt: string;
    unlocked: boolean;
    userHasSubmitted: boolean;
    myReflection: string | null;
    reflections: Array<{
      userName: string;
      isYou: boolean;
      text: string;
      createdAt: string;
    }> | null; // null if gated
    nonSubmitterNames: string[];
  }> = {
    lectio: { label: STAGE_LABELS.lectio, prompt: STAGE_PROMPTS.lectio, unlocked: false, userHasSubmitted: false, myReflection: null, reflections: null, nonSubmitterNames: [] },
    meditatio: { label: STAGE_LABELS.meditatio, prompt: STAGE_PROMPTS.meditatio, unlocked: false, userHasSubmitted: false, myReflection: null, reflections: null, nonSubmitterNames: [] },
    oratio: { label: STAGE_LABELS.oratio, prompt: STAGE_PROMPTS.oratio, unlocked: false, userHasSubmitted: false, myReflection: null, reflections: null, nonSubmitterNames: [] },
  };

  for (const s of STAGES) {
    const unlocked = week.unlockedStages.includes(s);
    stageReveals[s].unlocked = unlocked;
    stageReveals[s].userHasSubmitted = mine[s] !== null;
    stageReveals[s].myReflection = mine[s];
    if (!unlocked) continue;

    if (mine[s] !== null) {
      // Reveal: user-first, then others (sorted by createdAt).
      const all = [...reflectionsByStage[s]].sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const mineRow = all.find((x) => x.userToken === userToken);
      const others = all.filter((x) => x.userToken !== userToken);
      const ordered = mineRow ? [mineRow, ...others] : all;
      stageReveals[s].reflections = ordered.map((r) => ({
        userName: r.userName,
        isYou: r.userToken === userToken,
        text: r.reflectionText,
        createdAt: r.createdAt.toISOString(),
      }));
      const submitterTokens = new Set(all.map((x) => x.userToken));
      stageReveals[s].nonSubmitterNames = allMembers
        .filter((m) => !submitterTokens.has(m.userToken))
        .map((m) => m.name ?? m.email.split("@")[0]);
    }
  }

  res.json({
    moment: {
      id: moment.id,
      name: moment.name,
      templateType: moment.templateType,
      timezone: tz,
    },
    userName: userRow.name ?? userRow.email.split("@")[0],
    userToken,
    memberCount: allMembers.length,
    week: {
      sundayDate: sundayIso,
      phaseLabel: week.phaseLabel,
      currentStage: week.currentStage,
      unlockedStages: week.unlockedStages,
      isSunday: week.isSunday,
    },
    reading: {
      sundayDate: reading.sundayDate,
      sundayName: reading.sundayName,
      liturgicalSeason: reading.liturgicalSeason,
      liturgicalYear: reading.liturgicalYear,
      gospelReference: reading.gospelReference,
      gospelText: reading.gospelText,
      sourceUrl: reading.sourceUrl,
    },
    stages: stageReveals,
  });
});

// ─── POST /api/lectio/:momentToken/:userToken/reflect — submit a reflection ─

const ReflectSchema = z.object({
  stage: z.enum(["lectio", "meditatio", "oratio"]),
  reflectionText: z.string().min(1).max(4000),
});

router.post("/lectio/:momentToken/:userToken/reflect", async (req, res): Promise<void> => {
  const { momentToken, userToken } = req.params;
  const parsed = ReflectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_failed", details: parsed.error.flatten() });
    return;
  }
  const { stage, reflectionText } = parsed.data;

  const loaded = await loadMomentAndMember(momentToken, userToken);
  if ("error" in loaded) {
    res.status(404).json({ error: loaded.error });
    return;
  }
  const { moment, userRow } = loaded;

  const tz = moment.timezone || "UTC";

  // Make sure the stage being submitted is currently unlocked.
  const week = computeWeekState(tz);
  if (!week.unlockedStages.includes(stage)) {
    res.status(400).json({ error: "stage_not_unlocked" });
    return;
  }

  // Use the same Sunday anchor as the GET route.
  let reading: LectionaryReading;
  try {
    reading = await getReadingForSunday(nextSundayDate());
  } catch {
    res.status(502).json({ error: "lectionary_fetch_failed" });
    return;
  }
  const sundayIso = reading.sundayDate;

  // One submission per user/week/stage — enforced by unique index.
  // If they already submitted, we treat this as an update (edit your own reflection).
  const existing = await db
    .select()
    .from(lectioReflectionsTable)
    .where(and(
      eq(lectioReflectionsTable.momentId, moment.id),
      eq(lectioReflectionsTable.sundayDate, sundayIso),
      eq(lectioReflectionsTable.userToken, userToken),
      eq(lectioReflectionsTable.stage, stage),
    ));

  if (existing[0]) {
    await db
      .update(lectioReflectionsTable)
      .set({ reflectionText })
      .where(eq(lectioReflectionsTable.id, existing[0].id));
  } else {
    await db.insert(lectioReflectionsTable).values({
      momentId: moment.id,
      sundayDate: sundayIso,
      userToken,
      userName: userRow.name ?? userRow.email.split("@")[0],
      userEmail: userRow.email,
      stage,
      reflectionText,
    });
  }

  res.json({ ok: true });
});

// ─── GET /api/lectio/:momentToken/:userToken/archive — past weeks ───────────

router.get("/lectio/:momentToken/:userToken/archive", async (req, res): Promise<void> => {
  const { momentToken, userToken } = req.params;
  const loaded = await loadMomentAndMember(momentToken, userToken);
  if ("error" in loaded) {
    res.status(404).json({ error: loaded.error });
    return;
  }
  const { moment } = loaded;

  // All reflections ever submitted for this moment, grouped by sundayDate.
  const all = await db
    .select()
    .from(lectioReflectionsTable)
    .where(eq(lectioReflectionsTable.momentId, moment.id));

  const bySunday = new Map<string, typeof all>();
  for (const r of all) {
    const key = r.sundayDate;
    if (!bySunday.has(key)) bySunday.set(key, []);
    bySunday.get(key)!.push(r);
  }

  // Only weeks strictly before today.
  const todayIso = new Date().toISOString().slice(0, 10);
  const sundays = Array.from(bySunday.keys())
    .filter((d) => d < todayIso)
    .sort((a, b) => b.localeCompare(a));

  const out = [];
  for (const sundayIso of sundays) {
    const reflections = bySunday.get(sundayIso)!;
    // Look up the reading for this Sunday (will almost always be cached).
    let reading: LectionaryReading | null = null;
    try {
      reading = await getReadingForSunday(new Date(sundayIso + "T12:00:00Z"));
    } catch { /* skip */ }
    out.push({
      sundayDate: sundayIso,
      sundayName: reading?.sundayName ?? null,
      gospelReference: reading?.gospelReference ?? null,
      reflectionCount: reflections.length,
    });
  }

  res.json({ weeks: out });
});

export default router;
