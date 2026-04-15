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
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  sharedMomentsTable,
  momentUserTokensTable,
  lectioReflectionsTable,
  usersTable,
  userMutesTable,
} from "@workspace/db";
import type { LectionaryReading } from "@workspace/db";
import { getReadingForSunday, nextSundayDate } from "../lib/rclLectionary";
import { SEED_READINGS } from "../data/lectionary/seed";

const router: IRouter = Router();

// Short request ID so log lines can be correlated across steps.
function rid(): string {
  return Math.random().toString(36).slice(2, 8);
}

// ─── GET /api/debug/lectio-self-test — unauthenticated diagnostic ───────────
// Returns the current resolution of getReadingForSunday(nextSundayDate())
// plus seed metadata so we can verify the backend reading path in one curl.
router.get("/debug/lectio-self-test", async (_req, res): Promise<void> => {
  const seedSize = SEED_READINGS.length;
  const sorted = SEED_READINGS.slice().sort((a, b) => a.sundayDate.localeCompare(b.sundayDate));
  const firstSunday = sorted[0]?.sundayDate ?? null;
  const lastSunday = sorted[sorted.length - 1]?.sundayDate ?? null;
  const targetSunday = nextSundayDate();
  try {
    const reading = await getReadingForSunday(targetSunday);
    res.json({
      ok: true,
      seedSize,
      firstSunday,
      lastSunday,
      target: targetSunday.toISOString().slice(0, 10),
      resolved: {
        sundayDate: reading.sundayDate,
        sundayName: reading.sundayName,
        gospelReference: reading.gospelReference,
        gospelTextLength: reading.gospelText?.length ?? 0,
        gospelTextPreview: reading.gospelText?.slice(0, 120) ?? null,
      },
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      seedSize,
      firstSunday,
      lastSunday,
      target: targetSunday.toISOString().slice(0, 10),
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

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

type LoadError = {
  error: "moment_not_found" | "wrong_template" | "invalid_token";
  stage: "moment_lookup" | "template_check" | "user_lookup";
  detail: string;
};

async function loadMomentAndMember(momentToken: string, userToken: string) {
  const [moment] = await db
    .select()
    .from(sharedMomentsTable)
    .where(eq(sharedMomentsTable.momentToken, momentToken));
  if (!moment) {
    return {
      error: "moment_not_found",
      stage: "moment_lookup",
      detail: `No shared_moments row for momentToken=${momentToken}`,
    } satisfies LoadError;
  }
  if (moment.templateType !== "lectio-divina") {
    return {
      error: "wrong_template",
      stage: "template_check",
      detail: `moment.templateType is "${moment.templateType}", expected "lectio-divina"`,
    } satisfies LoadError;
  }

  const [userRow] = await db
    .select()
    .from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.userToken, userToken));
  if (!userRow || userRow.momentId !== moment.id) {
    return {
      error: "invalid_token",
      stage: "user_lookup",
      detail: userRow
        ? `userToken matches but belongs to moment ${userRow.momentId}, not ${moment.id}`
        : `No moment_user_tokens row for userToken=${userToken}`,
    } satisfies LoadError;
  }

  return { moment, userRow };
}

// ─── GET /api/lectio/:momentToken/:userToken — full current-week state ──────

router.get("/lectio/:momentToken/:userToken", async (req, res): Promise<void> => {
  const id = rid();
  const { momentToken, userToken } = req.params;
  console.log(`[lectio:GET ${id}] start momentToken=${momentToken.slice(0, 6)}… userToken=${userToken.slice(0, 6)}…`);
  try {
  const loaded = await loadMomentAndMember(momentToken, userToken);
  if ("error" in loaded) {
    const status =
      loaded.error === "wrong_template" ? 400 :
      loaded.error === "moment_not_found" ? 404 :
      loaded.error === "invalid_token" ? 404 : 400;
    console.warn(`[lectio:GET ${id}] load_failed stage=${loaded.stage} error=${loaded.error} detail=${loaded.detail}`);
    res.status(status).json({
      error: loaded.error,
      stage: loaded.stage,
      detail: loaded.detail,
    });
    return;
  }
  const { moment, userRow } = loaded;
  console.log(`[lectio:GET ${id}] moment_loaded id=${moment.id} tz=${moment.timezone ?? "UTC"}`);

  const tz = moment.timezone || "UTC";

  // Which Sunday is "this week's" reading anchored to?
  // Use upcoming Sunday — for Sunday itself, nextSundayDate() returns today.
  const sundayDate = nextSundayDate();

  // 1. Fetch (or read from cache) the reading for this Sunday.
  // getReadingForSunday has an infallible nearest-seed fallback, but if the
  // seed is somehow missing in a deploy we fall through to an empty shell
  // so the card can still render and the user's reflections are still usable.
  let reading: LectionaryReading;
  try {
    reading = await getReadingForSunday(sundayDate);
    console.log(`[lectio:GET ${id}] reading_resolved sundayDate=${reading.sundayDate} ref="${reading.gospelReference}" textLen=${reading.gospelText?.length ?? 0}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[lectio:GET ${id}] reading_lookup_failed — falling back to empty shell:`, err);
    reading = {
      id: 0,
      sundayDate: sundayDate.toISOString().slice(0, 10),
      sundayName: "Reading temporarily unavailable",
      liturgicalSeason: null,
      liturgicalYear: null,
      gospelReference: "",
      gospelText: "",
      sourceUrl: null,
      fetchedAt: new Date(),
    } as LectionaryReading;
    // Annotate reading with a non-schema detail field so the frontend can show a banner
    (reading as LectionaryReading & { _fallbackReason?: string })._fallbackReason = msg;
  }
  const sundayIso = reading.sundayDate;

  // 2. Week state.
  const week = computeWeekState(tz);

  // 3. Load all members.
  const allMembers = await db
    .select()
    .from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.momentId, moment.id));

  // Creator = the member with the smallest token id (same convention as
  // moments.ts). Used by the frontend settings menu to show Edit vs Leave.
  const creatorToken = allMembers.length > 0
    ? allMembers.reduce((min, m) => (m.id < min.id ? m : min), allMembers[0])
    : null;
  const isCreator = creatorToken
    ? creatorToken.userToken === userToken
    : false;

  // Check which members have actual user accounts (signed up vs just invited)
  const memberEmails = allMembers.map(t => t.email.toLowerCase());
  const registeredUsers = memberEmails.length > 0
    ? await db.select({ email: usersTable.email }).from(usersTable)
        .where(inArray(usersTable.email, memberEmails))
    : [];
  const registeredEmails = new Set(registeredUsers.map(u => u.email.toLowerCase()));

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

  // 6b. Build muted-email set so we can hide muted members' reflections.
  let mutedEmails = new Set<string>();
  {
    const [currentUserRow] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, userRow.email));
    if (currentUserRow) {
      const mutedRows = await db
        .select({ mutedUserId: userMutesTable.mutedUserId })
        .from(userMutesTable)
        .where(eq(userMutesTable.muterId, currentUserRow.id));
      if (mutedRows.length > 0) {
        const mutedUserRows = await db
          .select({ email: usersTable.email })
          .from(usersTable)
          .where(inArray(usersTable.id, mutedRows.map(r => r.mutedUserId)));
        mutedEmails = new Set(mutedUserRows.map(u => u.email.toLowerCase()));
      }
    }
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
      const others = all.filter((x) =>
        x.userToken !== userToken &&
        !mutedEmails.has((x.userEmail ?? "").toLowerCase())
      );
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
      intention: moment.intention,
      templateType: moment.templateType,
      timezone: tz,
      createdAt: (moment.createdAt instanceof Date
        ? moment.createdAt
        : new Date(moment.createdAt as unknown as string)
      ).toISOString(),
      allowMemberInvites: (moment as unknown as { allowMemberInvites?: boolean }).allowMemberInvites ?? true,
    },
    userName: userRow.name ?? userRow.email.split("@")[0],
    userToken,
    isCreator,
    members: allMembers.map((m) => ({
      name: m.name ?? m.email.split("@")[0],
      email: m.email,
      isYou: m.userToken === userToken,
      joined: registeredEmails.has(m.email.toLowerCase()),
    })),
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
      fallbackReason: (reading as LectionaryReading & { _fallbackReason?: string })._fallbackReason ?? null,
    },
    stages: stageReveals,
  });
  console.log(`[lectio:GET ${id}] done`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[lectio:GET ${id}] unexpected_failure:`, err);
    if (!res.headersSent) {
      res.status(500).json({
        error: "internal_error",
        stage: "unknown",
        detail: msg,
      });
    }
  }
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

  // Stages 2 + 3 ask for a fuller reflection (20–200 words). Lectio stays
  // open because "a single word or phrase" is the whole point of that
  // stage. The client enforces the same bounds, but we validate here too
  // so the rule holds even if someone bypasses the UI.
  if (stage === "meditatio" || stage === "oratio") {
    const wordCount = reflectionText.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 20) {
      res.status(400).json({
        error: "reflection_too_short",
        detail: `This stage asks for at least 20 words (you wrote ${wordCount}).`,
      });
      return;
    }
    if (wordCount > 200) {
      res.status(400).json({
        error: "reflection_too_long",
        detail: `This stage caps reflections at 200 words (you wrote ${wordCount}).`,
      });
      return;
    }
  }

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
    res.status(502).json({ error: "reading_not_available" });
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
