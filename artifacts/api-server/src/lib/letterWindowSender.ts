// Scheduled letter-window pushes.
//
// Two cases, both gated by letter_window_pushes (correspondence, user,
// periodStart, kind) so retries / redeploys / overlapping ticks can't
// double-notify:
//
//   1. small_group "open"   — at the start of each 14-day period, every
//                             joined member with a userId gets one push:
//                             "your write window opened in {name}."
//   2. one_to_one "open"    — when the alternating 7-day wait expires
//                             and it's the next writer's turn (the
//                             OPEN state from getOneToOneTurnState),
//                             push them once. So each participant gets
//                             a "your turn" ping every other week —
//                             matching the rhythm of the format.
//
// Runs every 15 minutes, sharing the bell scheduler's tick cadence.
// At Phoebe's beta volume the sweep is O(correspondences × members),
// which is trivially cheap; if we ever scale, gate on "active in the
// last N days" first to avoid touching dormant rows.
//
// IMPORTANT: this scheduler does NOT push on letter receipt — that's
// already covered by routes/letters.ts dispatching sendNewLetterPush
// inline at create time for one_to_one. Group letters do NOT push at
// all on arrival; the period-open ping below is the only group push.

import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  correspondencesTable,
  correspondenceMembersTable,
  lettersTable,
  letterWindowPushesTable,
} from "@workspace/db";
import {
  getPeriodStart,
  formatPeriodStartDateString,
  getOneToOneTurnState,
} from "./letterPeriods";
import {
  sendLetterPeriodOpenPush,
  sendLetterReminderDay3Push,
  sendLetterReminderDay7Push,
  sendLetterDayBeforePush,
} from "./pushSender";
import { logger } from "./logger";

export async function runLetterWindowSweep(): Promise<void> {
  const now = new Date();
  // Only ACTIVE, NON-ARCHIVED correspondences. The previous sweep
  // pulled all rows and was firing "Time to write" pushes for old
  // test threads — a tester reported four duplicate pushes on the
  // lock screen for various archived "Letters with X" experiments.
  // Members of an archived correspondence are also archived (the
  // member rows have an archivedAt timestamp), but the cleaner gate
  // is on the correspondence itself.
  const correspondences = await db.select()
    .from(correspondencesTable)
    .where(eq(correspondencesTable.isActive, true));
  void isNull;

  for (const c of correspondences) {
    try {
      const periodDays = c.groupType === "small_group" ? 14 : 7;
      const periodStart = getPeriodStart(c.startedAt, now, periodDays);
      const periodStartStr = formatPeriodStartDateString(periodStart);

      const members = await db.select()
        .from(correspondenceMembersTable)
        .where(eq(correspondenceMembersTable.correspondenceId, c.id));

      if (c.groupType === "small_group") {
        // Every joined member gets one push per period. small_group
        // copy uses "Time to share with {correspondenceName}" — no
        // recipient name to look up.
        for (const m of members) {
          if (!m.userId || !m.joinedAt) continue;
          // Per-member archive: when a participant archives a dialogue
          // on their side, the correspondence may still be active for
          // others, but they shouldn't get window pushes.
          if (m.archivedAt) continue;
          await pushOnce(c.id, m.userId, periodStartStr, c.name, /*isOneToOne*/ false);
        }
      } else {
        // one_to_one: push only the participant whose turn it currently
        // is. We use getOneToOneTurnState's OPEN signal — the wait has
        // expired and they're the next writer. The "period start"
        // tracker key is the date the window opened (from the state's
        // windowOpenDate), so each turn gets its own dedupe row.
        const allLetters = await db.select({
          authorEmail: lettersTable.authorEmail,
          sentAt: lettersTable.sentAt,
        })
          .from(lettersTable)
          .where(eq(lettersTable.correspondenceId, c.id));
        const letterRefs = allLetters.map((l) => ({
          authorEmail: l.authorEmail,
          sentAt: new Date(l.sentAt),
        }));

        // Need the creator email so getOneToOneTurnState can resolve
        // who writes first. The creator is the row with isCreator (or
        // the original creator from the correspondence). We pass it
        // through; falls back to undefined if not findable.
        // Creator member — only have createdByUserId on the
        // correspondence, so resolve through members. Falls back to
        // undefined if the creator's gone (shouldn't happen, but
        // getOneToOneTurnState handles it gracefully).
        const creatorMember = members.find((m) => m.userId === c.createdByUserId);
        const creatorEmail = creatorMember?.email;

        for (const m of members) {
          if (!m.userId || !m.joinedAt) continue;
          // Per-member archive: when a participant archives a dialogue
          // on their side, the correspondence may still be active for
          // others, but they shouldn't get window pushes.
          if (m.archivedAt) continue;
          const other = members.find((x) => x.id !== m.id);
          if (!other) continue;

          const turn = getOneToOneTurnState(
            m.email,
            other.email,
            letterRefs,
            c.firstExchangeComplete,
            now,
            creatorEmail,
          );

          // Resolve recipient name once — needed by every push path
          // (day-before, day-of, day-3, day-7).
          const recipientName = (other.name ?? other.email.split("@")[0] ?? "your friend").trim();

          // Day-before heads-up. Fires when the window opens TOMORROW —
          // i.e. turn state is WAITING, I am the next writer, and the
          // open moment is between ~14 and ~24 hours away. The narrow
          // band keeps the push from landing at 2am the morning of
          // "the day before" (we used to fire whenever hoursUntil was
          // anywhere from 1 minute to 25 hours, which made the timing
          // feel arbitrary). With a 15-min sweep, this firing window
          // is wide enough that we never skip the push but narrow
          // enough that it lands during the recipient's evening on
          // the day prior. Dedupe key is the same windowOpenDate the
          // day-of push will use, with a distinct `kind` so they're
          // independent.
          if (
            turn.state === "WAITING" &&
            turn.windowOpenDate &&
            turn.nextWriterEmail?.toLowerCase() === m.email.toLowerCase()
          ) {
            const hoursUntil =
              (turn.windowOpenDate.getTime() - now.getTime()) / 3_600_000;
            if (hoursUntil >= 14 && hoursUntil <= 24) {
              const dayBeforeKey = formatPeriodStartDateString(turn.windowOpenDate);
              await dayBeforePushOnce(c.id, m.userId, dayBeforeKey, recipientName);
            }
            continue;
          }

          // Fire only on OPEN (and OVERDUE — they still need a nudge
          // even if a tick was missed). Skip remaining WAITING + SENT.
          if (turn.state !== "OPEN" && turn.state !== "OVERDUE") continue;

          // Use the windowOpenDate as the period key so the dedupe is
          // per-turn, not per-calendar-period. (The 7-day cadence
          // doesn't align to a fixed period start anyway — it's
          // anchored to the last letter's sentAt.)
          const turnKey = turn.windowOpenDate
            ? formatPeriodStartDateString(turn.windowOpenDate)
            : periodStartStr;

          await pushOnce(c.id, m.userId, turnKey, c.name, /*isOneToOne*/ true, recipientName);

          // Day-3 + Day-7 reminders. Only fire on one_to_one (the
          // user explicitly scoped this to letter-back-and-forth);
          // small_group threads keep their existing single "open"
          // push at period start.
          //
          // Skip if the user has already written a letter in this
          // window — the "next writer" doesn't need a nudge to
          // reply if they already replied. windowOpenDate is the
          // anchor (turn.windowOpenDate set by getOneToOneTurnState
          // when in OPEN/OVERDUE).
          if (turn.windowOpenDate) {
            const sentInWindow = letterRefs.some(
              (l) => l.authorEmail.toLowerCase() === m.email.toLowerCase()
                && turn.windowOpenDate
                && l.sentAt >= turn.windowOpenDate,
            );
            if (!sentInWindow) {
              const ageMs = now.getTime() - turn.windowOpenDate.getTime();
              const ageDays = ageMs / (24 * 60 * 60 * 1000);
              if (ageDays >= 3) {
                await reminderPushOnce(
                  "reminder_day3",
                  c.id, m.userId, turnKey, recipientName,
                );
              }
              if (ageDays >= 7) {
                await reminderPushOnce(
                  "reminder_day7",
                  c.id, m.userId, turnKey, recipientName,
                );
              }
            }
          }
        }
      }
    } catch (err) {
      logger.error({ err, correspondenceId: c.id }, "[letter-window] correspondence processing failed");
    }
  }
}

// Push once-per-(correspondence, user, periodKey). Inserts the dedupe
// row whether or not the APNs send succeeds — we'd rather miss a push
// than send the same one twice.
async function pushOnce(
  correspondenceId: number,
  userId: number,
  periodKey: string,
  correspondenceName: string,
  isOneToOne: boolean,
  recipientName?: string,
): Promise<void> {
  const [existing] = await db.select({ id: letterWindowPushesTable.id })
    .from(letterWindowPushesTable)
    .where(and(
      eq(letterWindowPushesTable.correspondenceId, correspondenceId),
      eq(letterWindowPushesTable.userId, userId),
      eq(letterWindowPushesTable.periodStartDate, periodKey),
      eq(letterWindowPushesTable.kind, "open"),
    ));
  if (existing) return;

  // Insert the dedupe row FIRST, then send. If insertion succeeds and
  // the send fails, we'd rather miss one push than spam a user with
  // four duplicates next tick (a tester reported four "Time to write
  // in 'Letters with…'" pushes in a row from old archived threads).
  // ON CONFLICT DO NOTHING means a race where two concurrent ticks both
  // checked-then-inserted produces exactly one row + at most one push.
  const ins = await db.insert(letterWindowPushesTable).values({
    correspondenceId,
    userId,
    periodStartDate: periodKey,
    kind: "open",
  }).onConflictDoNothing().returning({ id: letterWindowPushesTable.id });
  if (ins.length === 0) return;  // another tick beat us to it

  await sendLetterPeriodOpenPush(userId, {
    correspondenceId,
    correspondenceName,
    periodStartDate: periodKey,
    isOneToOne,
    recipientName,
  }).catch((err) => logger.warn({ err, userId, correspondenceId }, "[letter-window] open push failed"));
}

// Day-3 / Day-7 reminders share dedupe semantics with pushOnce
// above but a different `kind` (so the unique row is per-(corr,
// user, periodKey, kind)). Helper unifies the insert-then-send
// pattern. The kind decides which push helper fires — both names
// the recipient and deep-links to the write surface.
async function reminderPushOnce(
  kind: "reminder_day3" | "reminder_day7",
  correspondenceId: number,
  userId: number,
  periodKey: string,
  recipientName: string,
): Promise<void> {
  const [existing] = await db.select({ id: letterWindowPushesTable.id })
    .from(letterWindowPushesTable)
    .where(and(
      eq(letterWindowPushesTable.correspondenceId, correspondenceId),
      eq(letterWindowPushesTable.userId, userId),
      eq(letterWindowPushesTable.periodStartDate, periodKey),
      eq(letterWindowPushesTable.kind, kind),
    ));
  if (existing) return;

  const ins = await db.insert(letterWindowPushesTable).values({
    correspondenceId,
    userId,
    periodStartDate: periodKey,
    kind,
  }).onConflictDoNothing().returning({ id: letterWindowPushesTable.id });
  if (ins.length === 0) return;

  const send = kind === "reminder_day3"
    ? sendLetterReminderDay3Push
    : sendLetterReminderDay7Push;
  await send(userId, {
    correspondenceId,
    periodStartDate: periodKey,
    recipientName,
  }).catch((err) => logger.warn(
    { err, userId, correspondenceId, kind },
    "[letter-window] reminder push failed",
  ));
}

// Day-before heads-up push. Same insert-then-send dedupe shape as
// pushOnce / reminderPushOnce, with a dedicated kind so the unique
// row never collides with the day-of "open" push that follows
// ~24 hours later.
async function dayBeforePushOnce(
  correspondenceId: number,
  userId: number,
  periodKey: string,
  recipientName: string,
): Promise<void> {
  const [existing] = await db.select({ id: letterWindowPushesTable.id })
    .from(letterWindowPushesTable)
    .where(and(
      eq(letterWindowPushesTable.correspondenceId, correspondenceId),
      eq(letterWindowPushesTable.userId, userId),
      eq(letterWindowPushesTable.periodStartDate, periodKey),
      eq(letterWindowPushesTable.kind, "open_day_before"),
    ));
  if (existing) return;

  const ins = await db.insert(letterWindowPushesTable).values({
    correspondenceId,
    userId,
    periodStartDate: periodKey,
    kind: "open_day_before",
  }).onConflictDoNothing().returning({ id: letterWindowPushesTable.id });
  if (ins.length === 0) return;

  await sendLetterDayBeforePush(userId, {
    correspondenceId,
    periodStartDate: periodKey,
    recipientName,
  }).catch((err) => logger.warn(
    { err, userId, correspondenceId },
    "[letter-window] day-before push failed",
  ));
}

// Scheduler — same shape as bellSender. First tick 60s after boot,
// then every 15 minutes.
let interval: ReturnType<typeof setInterval> | null = null;

export function startLetterWindowScheduler(): void {
  if (interval) return;
  logger.info("[letter-window-scheduler] started — first run in 60s, then every 15 min");
  setTimeout(() => {
    runLetterWindowSweep().catch((err) =>
      logger.error({ err }, "[letter-window] initial run failed"),
    );
  }, 60_000);
  interval = setInterval(() => {
    runLetterWindowSweep().catch((err) =>
      logger.error({ err }, "[letter-window] scheduled run failed"),
    );
  }, 15 * 60 * 1000);
}
