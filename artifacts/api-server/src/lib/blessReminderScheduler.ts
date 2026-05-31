import { db, blessIntentionTable, usersTable } from "@workspace/db";
import { and, eq, isNull, isNotNull, gte } from "drizzle-orm";
import { sendPushToUser } from "./pushSender";

// ── Bless reminder scheduler ──────────────────────────────────────────────
//
// Self-contained (does NOT touch bellSender): once a minute, fire a gentle
// fire-once push for any open Bless intention whose user-local reminder time
// has just arrived. Scoped to roughly the current cycle (created within 8
// days) and not done. Deduped via reminder_fired_date so each intention's
// reminder nudges exactly once — an invitation, never a nag.
//
// Reuses the exported sendPushToUser; the tz helpers mirror bellSender's
// (kept local so this file owns its behavior and never edits the bell path).

function getCurrentTimeInTz(timezone: string): { hour: number; minute: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, hour: "numeric", minute: "numeric", hour12: false,
    }).formatToParts(new Date());
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    return { hour: hour === 24 ? 0 : hour, minute };
  } catch {
    return { hour: -1, minute: -1 };
  }
}
function todayDateInTz(timezone: string): string {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date()); }
  catch { return ""; }
}

async function tick(): Promise<void> {
  const since = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  let rows: Array<{ id: number; userId: number; text: string; reminderTime: string | null; firedDate: string | null; tz: string | null }>;
  try {
    rows = await db
      .select({
        id: blessIntentionTable.id,
        userId: blessIntentionTable.userId,
        text: blessIntentionTable.text,
        reminderTime: blessIntentionTable.reminderTime,
        firedDate: blessIntentionTable.reminderFiredDate,
        tz: usersTable.timezone,
      })
      .from(blessIntentionTable)
      .innerJoin(usersTable, eq(usersTable.id, blessIntentionTable.userId))
      .where(and(
        isNotNull(blessIntentionTable.reminderTime),
        isNull(blessIntentionTable.doneAt),
        gte(blessIntentionTable.createdAt, since),
      ));
  } catch (err) {
    console.warn("[blessReminder] query failed:", err);
    return;
  }

  for (const r of rows) {
    if (!r.reminderTime || r.firedDate) continue; // fire once per intention
    const tz = r.tz ?? "America/New_York";
    const m = /^(\d{1,2}):(\d{2})$/.exec(r.reminderTime);
    if (!m) continue;
    const { hour, minute } = getCurrentTimeInTz(tz);
    if (hour !== parseInt(m[1]!, 10) || minute !== parseInt(m[2]!, 10)) continue;

    const today = todayDateInTz(tz);
    if (!today) continue;
    // Mark fired FIRST so a slow push can't double-send on the next tick.
    try {
      await db.update(blessIntentionTable).set({ reminderFiredDate: today }).where(eq(blessIntentionTable.id, r.id));
    } catch { continue; }

    const text = (r.text ?? "").trim();
    sendPushToUser(r.userId, {
      title: "A way to bless someone",
      body: text.length > 0 ? text : "Your blessing for this week is waiting.",
      path: "/this-week",
      threadId: "bless-reminder",
      collapseId: `bless-${r.id}`,
    }).catch(() => { /* best-effort */ });
  }
}

let started = false;
export function startBlessReminderScheduler(): void {
  if (started) return;
  started = true;
  setInterval(() => { void tick(); }, 60_000);
  console.log("[blessReminder] scheduler started");
}
