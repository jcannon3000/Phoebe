/**
 * Weekly routine audit — what they actually did, against what they programmed.
 *
 * Owner: "record at what times a user practices each practice, or opens
 * practices not in their routine. The app once a week would analyze that data
 * compared to what they have programmed, and make suggestions how to adjust it
 * to better fit what they are actually doing."
 *
 * Nothing new is recorded to make this work — the app already timestamps every
 * completion (prayer_sessions.ended_at, practice_completion.created_at,
 * reflection_reads.created_at, breath_sessions.created_at), which is the same
 * substrate /me/yesterday-order reads. This just asks a different question of
 * it.
 *
 * DELIBERATELY NOT AN LLM. Every finding here is a counting exercise against a
 * fixed vocabulary — "did this happen, how often, at what hour" — and the
 * suggestion is a concrete field change. A model would add cost, latency and
 * the chance of proposing a practice that doesn't exist, for no gain. The
 * interview uses one because free text needs interpreting; this doesn't.
 *
 * The suggestions are OFFERS, never applied automatically. A rhythm that has
 * drifted is the person's business, and an app that quietly rewrote their rule
 * of life to match their worst fortnight would be doing something unkind.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

// Two weeks. One is too thin — a single illness or trip would read as "you've
// stopped" — and four is slow to notice a real change.
const WINDOW_DAYS = 14;
// A practice done this often in the window, while absent from the routine, is
// a habit rather than a visit.
const ADOPT_THRESHOLD = 4;
// Below this in the window, a programmed practice looks abandoned rather than
// merely missed.
const DROP_THRESHOLD = 1;
// How far a reminder can sit from when they actually pray before it's worth
// mentioning. Under an hour is just life.
const DRIFT_MINUTES = 60;

export type AuditFinding = {
  kind: "adopt" | "drop" | "retime";
  /** Plain sentence shown to the person. */
  message: string;
  /** What tapping "adjust" would change. Applied only on request. */
  change:
    | { type: "ruleConfig"; key: string; value: string }
    | { type: "officePrefs"; field: "morningTime" | "eveningTime"; value: string };
};

type Row = { key: string; at: Date };

function hhmm(d: Date, tz: string): { hour: number; minute: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour: "numeric", minute: "numeric", hour12: false,
    }).formatToParts(d);
    const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "", 10);
    const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "", 10);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return { hour: h === 24 ? 0 : h, minute: m };
  } catch { return null; }
}

/** Median avoids one 3am insomnia session dragging the whole estimate. */
function medianMinutes(times: Array<{ hour: number; minute: number }>): number | null {
  if (times.length === 0) return null;
  const mins = times.map((t) => t.hour * 60 + t.minute).sort((a, b) => a - b);
  const mid = Math.floor(mins.length / 2);
  return mins.length % 2 ? mins[mid]! : Math.round((mins[mid - 1]! + mins[mid]!) / 2);
}

function fmt(totalMinutes: number): string {
  const h24 = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}
function toHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

const PRACTICE_NAME: Record<string, string> = {
  listening: "Audio Divina",
  walk: "a Contemplative Walk",
  reading: "Reading",
  podcasts: "Podcasts",
  examen: "the Examen",
  "prayer-list": "your prayer list",
  cobreathe: "Creation Prayer",
};

export async function buildRoutineAudit(userId: number): Promise<AuditFinding[]> {
  const [me] = await db
    .select({
      tz: usersTable.timezone,
      ruleConfig: usersTable.ruleConfig,
      morningPref: usersTable.parishOfficeMorningPref,
      eveningPref: usersTable.parishOfficeEveningPref,
      morningTime: usersTable.parishOfficeMorningTime,
      eveningTime: usersTable.parishOfficeEveningTime,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!me) return [];

  const tz = me.tz || "America/New_York";
  const rc = ((me.ruleConfig as { values?: Record<string, string> } | null)?.values) ?? {};
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // ── Gather what actually happened ──────────────────────────────────────────
  const rows: Row[] = [];

  const sessions = await db.execute<{ surface: string; side: string | null; at: string }>(sql`
    SELECT surface, contemplation_side AS side, ended_at AS at
    FROM prayer_sessions
    WHERE user_id = ${userId} AND ended_at >= ${since.toISOString()}
      AND (
        (surface IN ('morning-prayer','morning-devotion','evening-prayer','early-evening-devotion','compline') AND completed = TRUE)
        OR surface IN ('contemplation','morning-office-podcast','evening-office-podcast')
      )
  `);
  for (const r of sessions.rows) {
    if (!r.at) continue;
    const at = new Date(r.at);
    if (r.surface === "contemplation") {
      rows.push({ key: r.side === "evening" ? "contemplation-evening" : "contemplation-morning", at });
    } else if (r.surface.startsWith("morning")) {
      rows.push({ key: "morning", at });
    } else {
      rows.push({ key: "evening", at });
    }
  }

  const practices = await db.execute<{ section: string; at: string }>(sql`
    SELECT section, created_at AS at FROM practice_completion
    WHERE user_id = ${userId} AND created_at >= ${since.toISOString()}
      AND section IN ('listening','reading','podcasts','walk','examen','prayer-list')
  `);
  for (const r of practices.rows) if (r.at) rows.push({ key: r.section, at: new Date(r.at) });

  const breaths = await db.execute<{ at: string }>(sql`
    SELECT created_at AS at FROM breath_sessions
    WHERE user_id = ${userId} AND created_at >= ${since.toISOString()}
  `);
  for (const r of breaths.rows) if (r.at) rows.push({ key: "cobreathe", at: new Date(r.at) });

  const count = (k: string) => rows.filter((r) => r.key === k).length;
  const findings: AuditFinding[] = [];

  // ── 1. Practices they keep but never programmed ────────────────────────────
  // The "opens practices not in their routine" half of the ask.
  for (const key of ["listening", "walk", "reading", "podcasts", "cobreathe", "examen"]) {
    const n = count(key);
    if (n < ADOPT_THRESHOLD) continue;
    const alreadyPlaced = !!rc[`phoebe:slot:${key}`]
      || rc["phoebe:office:level:morning"] === key
      || rc["phoebe:office:level:evening"] === key;
    if (alreadyPlaced) continue;
    findings.push({
      kind: "adopt",
      message: `You've kept ${PRACTICE_NAME[key] ?? key} ${n} times in the last two weeks, but it isn't part of your rhythm. Add it?`,
      change: { type: "ruleConfig", key: `phoebe:slot:${key}`, value: "anytime" },
    });
  }

  // ── 2. Programmed practices that aren't happening ──────────────────────────
  for (const key of ["listening", "walk", "reading", "podcasts", "cobreathe", "examen"]) {
    if (!rc[`phoebe:slot:${key}`]) continue;
    if (count(key) > DROP_THRESHOLD) continue;
    findings.push({
      kind: "drop",
      message: `${PRACTICE_NAME[key] ?? key} has been part of your rhythm but you haven't kept it in two weeks. Take it off for now?`,
      // Removing the slot is what drops the card; the empty string is the
      // sentinel the apply route turns into a delete.
      change: { type: "ruleConfig", key: `phoebe:slot:${key}`, value: "" },
    });
  }

  // ── 3. Reminders set for a time they don't pray ────────────────────────────
  // The "at what times" half. Only for a side with a reminder ON and enough
  // completions to be a pattern rather than a coincidence.
  for (const side of ["morning", "evening"] as const) {
    const pref = side === "morning" ? me.morningPref : me.eveningPref;
    const setTime = side === "morning" ? me.morningTime : me.eveningTime;
    if (!pref || pref === "none" || !setTime) continue;
    const times = rows
      .filter((r) => r.key === side)
      .map((r) => hhmm(r.at, tz))
      .filter((t): t is { hour: number; minute: number } => t !== null);
    if (times.length < 3) continue; // too few to call a pattern
    const median = medianMinutes(times);
    if (median == null) continue;
    const [sh, sm] = setTime.split(":").map((n) => parseInt(n, 10));
    const setMinutes = sh * 60 + sm;
    if (Math.abs(median - setMinutes) < DRIFT_MINUTES) continue;
    findings.push({
      kind: "retime",
      message: `Your ${side} reminder is set for ${fmt(setMinutes)}, but you usually pray around ${fmt(median)}. Move it?`,
      change: {
        type: "officePrefs",
        field: side === "morning" ? "morningTime" : "eveningTime",
        value: toHHMM(median),
      },
    });
  }

  // Three at most. A list of eight adjustments is a chore, not an invitation,
  // and the ones that matter most are the ones about time.
  const order: Record<AuditFinding["kind"], number> = { retime: 0, adopt: 1, drop: 2 };
  return findings.sort((a, b) => order[a.kind] - order[b.kind]).slice(0, 3);
}
