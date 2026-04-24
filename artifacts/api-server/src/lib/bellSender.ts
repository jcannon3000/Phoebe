import { db, usersTable, betaUsersTable, bellNotificationsTable, sharedMomentsTable, momentUserTokensTable, prayerRequestAmensTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { sendEmail } from "./email";
import { sendBellPush, sendEveningNudgePush } from "./pushSender";
import { logger } from "./logger";

const APP_URL = process.env["APP_URL"] ?? "https://withphoebe.app";

// ─── Timezone helpers ───────────────────────────────────────────────────────

function getCurrentTimeInTz(timezone: string): { hour: number; minute: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, hour: "numeric", minute: "numeric", hour12: false,
    }).formatToParts(new Date());
    const hour = parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(parts.find(p => p.type === "minute")?.value ?? "0", 10);
    return { hour: isNaN(hour) ? 0 : hour, minute: isNaN(minute) ? 0 : minute };
  } catch {
    const now = new Date();
    return { hour: now.getUTCHours(), minute: now.getUTCMinutes() };
  }
}

function todayDateInTz(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function getCurrentDayOfWeekInTz(tz: string): number {
  const DOW_LC: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).formatToParts(new Date());
    const name = (parts.find(p => p.type === "weekday")?.value ?? "").toLowerCase();
    return DOW_LC[name] ?? new Date().getDay();
  } catch { return new Date().getDay(); }
}

// ─── Count today's actionable practices for a user ──────────────────────────

async function countActionablePractices(userEmail: string, timezone: string): Promise<{ count: number; names: string[] }> {
  const rows = await db
    .select({
      name: sharedMomentsTable.name,
      templateType: sharedMomentsTable.templateType,
      frequency: sharedMomentsTable.frequency,
      dayOfWeek: sharedMomentsTable.dayOfWeek,
      practiceDays: sharedMomentsTable.practiceDays,
    })
    .from(momentUserTokensTable)
    .innerJoin(sharedMomentsTable, eq(momentUserTokensTable.momentId, sharedMomentsTable.id))
    .where(
      and(
        eq(momentUserTokensTable.email, userEmail.toLowerCase()),
        eq(sharedMomentsTable.state, "active"),
      ),
    );

  const RRULE_DOW: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const DOW_LC: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const todayDow = getCurrentDayOfWeekInTz(timezone);

  const actionable = rows.filter((r) => {
    if (r.templateType === "lectio-divina") return todayDow >= 1 && todayDow <= 6;
    if (r.frequency === "daily") return true;
    if (r.frequency === "weekly") {
      if (r.practiceDays) {
        try {
          const days: string[] = JSON.parse(r.practiceDays);
          if (days.length > 0) return days.some(d => {
            const up = d.toUpperCase();
            if (RRULE_DOW[up] !== undefined) return RRULE_DOW[up] === todayDow;
            return DOW_LC[d.toLowerCase()] === todayDow;
          });
        } catch {}
      }
      if (r.dayOfWeek) {
        const up = r.dayOfWeek.toUpperCase();
        if (RRULE_DOW[up] !== undefined) return RRULE_DOW[up] === todayDow;
        return DOW_LC[r.dayOfWeek.toLowerCase()] === todayDow;
      }
    }
    return true;
  });

  return { count: actionable.length, names: actionable.map(r => r.name) };
}

// ─── Build the bell email ───────────────────────────────────────────────────

function buildBellEmail(userName: string, practiceCount: number, practiceNames: string[]): { subject: string; html: string; text: string } {
  const subject = practiceCount === 0
    ? "Your Daily Bell \u2014 a moment of quiet"
    : `Your Daily Bell \u2014 ${practiceCount} ${practiceCount === 1 ? "practice" : "practices"} today`;

  const bellUrl = `${APP_URL}/bell`;

  const practiceList = practiceNames.length > 0
    ? practiceNames.map(n => `<li style="margin:4px 0;font-size:15px;color:#2d2a26;">${n}</li>`).join("")
    : `<li style="margin:4px 0;font-size:15px;color:#6b6460;font-style:italic;">No practices scheduled today — enjoy the stillness.</li>`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f9f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e8e2d9;padding:40px 36px;">
          <tr>
            <td>
              <div style="margin-bottom:28px;">
                <span style="font-size:22px;font-weight:700;color:#2d2a26;letter-spacing:-0.5px;">🔔 Daily Bell</span>
              </div>

              <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#2d2a26;line-height:1.3;">
                Good morning, ${userName}.
              </h1>
              <p style="margin:0 0 20px;font-size:15px;color:#6b6460;line-height:1.6;">
                ${practiceCount > 0
                  ? `You have ${practiceCount} ${practiceCount === 1 ? "practice" : "practices"} waiting for you today.`
                  : "A gentle moment to pause and be present."}
              </p>

              <ul style="padding-left:20px;margin:0 0 24px;">
                ${practiceList}
              </ul>

              <a href="${bellUrl}" style="display:inline-block;background:#4a7c59;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:-0.2px;">
                Open your practices →
              </a>

              <p style="margin:24px 0 0;font-size:12px;color:#9a9390;line-height:1.6;border-top:1px solid #f0ece6;padding-top:16px;">
                You're receiving this because you enabled the Daily Bell in Phoebe.
                <a href="${APP_URL}/settings" style="color:#9a9390;text-decoration:underline;">Manage preferences</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const text = [
    `Good morning, ${userName}.`,
    "",
    practiceCount > 0
      ? `You have ${practiceCount} ${practiceCount === 1 ? "practice" : "practices"} today:`
      : "A gentle moment to pause and be present.",
    ...practiceNames.map(n => `  - ${n}`),
    "",
    `Open your practices: ${bellUrl}`,
    "",
    `Manage your bell: ${APP_URL}/settings`,
  ].join("\n");

  return { subject, html, text };
}

// ─── Main bell sender ───────────────────────────────────────────────────────

export async function runBellSender(): Promise<void> {
  // Find all users with bell enabled who are beta users
  const bellUsers = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      dailyBellTime: usersTable.dailyBellTime,
      timezone: usersTable.timezone,
    })
    .from(usersTable)
    .where(eq(usersTable.bellEnabled, true));

  if (bellUsers.length === 0) return;

  for (const user of bellUsers) {
    try {
      const tz = user.timezone ?? "America/New_York";
      const bellTime = user.dailyBellTime ?? "07:00";
      const todayStr = todayDateInTz(tz);

      // Check if already sent today
      const [existing] = await db
        .select()
        .from(bellNotificationsTable)
        .where(
          and(
            eq(bellNotificationsTable.userId, user.id),
            eq(bellNotificationsTable.bellDate, todayStr),
          ),
        );
      if (existing) continue;

      // Check if it's time (within a 15-minute window of the bell time)
      const { hour: nowH, minute: nowM } = getCurrentTimeInTz(tz);
      const [bellH, bellM] = bellTime.split(":").map(Number);
      const nowMinutes = nowH * 60 + nowM;
      const bellMinutes = bellH * 60 + bellM;

      // Only send if we're within 0-14 minutes past the bell time
      const diff = nowMinutes - bellMinutes;
      if (diff < 0 || diff >= 15) continue;

      // Verify still a beta user
      const [beta] = await db.select().from(betaUsersTable)
        .where(eq(betaUsersTable.email, user.email.toLowerCase()));
      if (!beta) continue;

      // Count practices
      const { count, names } = await countActionablePractices(user.email, tz);

      // Build and send email
      const { subject, html, text } = buildBellEmail(user.name ?? "friend", count, names);
      const sent = await sendEmail({ to: user.email, subject, html, text });

      // Push notification — fires for any user who has a device token
      // registered. Users without a token (e.g. web-only) still get
      // the email above. sendBellPush is a no-op if there are no
      // active tokens for this user; errors are swallowed so a bad
      // APNs response doesn't break the bell loop. The count mirrors
      // the dashboard's "X prayers waiting for you" subtitle so the
      // push preview matches what they'll see when they tap through.
      try {
        await sendBellPush(user.id);
      } catch (err) {
        logger.warn({ err, userId: user.id }, "[bell] push dispatch failed");
      }

      // Record the notification
      await db.insert(bellNotificationsTable).values({
        userId: user.id,
        bellDate: todayStr,
        sentAt: sent ? new Date() : null,
      });

      if (sent) {
        logger.info({ userId: user.id, bellDate: todayStr, practiceCount: count }, "[bell] sent daily bell");
      } else {
        logger.warn({ userId: user.id }, "[bell] email send failed");
      }
    } catch (err) {
      logger.error({ err, userId: user.id }, "[bell] user bell processing failed");
    }
  }
}

// ─── Evening nudge (7 PM local, push-only, skip if prayed today) ────────────
//
// The morning bell (above) is a reminder at the start of the day. The
// evening nudge catches the users who nodded along in the morning but
// never actually opened the app. We gate on three things:
//
//   1. It's 19:00–19:14 in the user's local timezone.
//   2. We haven't already sent an evening nudge to them today.
//   3. They have NOT logged any prayer ("amen") today — if they did,
//      they already tended to their practice and the nudge would be
//      noise.
//
// We reuse `bell_notifications` with a `"${date}-evening"` row so we
// don't need another table. The row is scoped to the push channel;
// there's no email for the evening nudge.
export async function runEveningNudgeSender(): Promise<void> {
  const bellUsers = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      timezone: usersTable.timezone,
    })
    .from(usersTable)
    .where(eq(usersTable.bellEnabled, true));

  if (bellUsers.length === 0) return;

  for (const user of bellUsers) {
    try {
      const tz = user.timezone ?? "America/New_York";

      // Only inside the 19:00 – 19:14 window in the user's tz.
      const { hour: nowH, minute: nowM } = getCurrentTimeInTz(tz);
      if (nowH !== 19 || nowM >= 15) continue;

      const todayStr = todayDateInTz(tz);
      const eveningKey = `${todayStr}-evening`;

      // De-dup — already nudged today?
      const [existing] = await db
        .select()
        .from(bellNotificationsTable)
        .where(
          and(
            eq(bellNotificationsTable.userId, user.id),
            eq(bellNotificationsTable.bellDate, eveningKey),
          ),
        );
      if (existing) continue;

      // Beta gate — same rule as the morning bell.
      const [beta] = await db.select().from(betaUsersTable)
        .where(eq(betaUsersTable.email, user.email.toLowerCase()));
      if (!beta) continue;

      // Did they pray today? We compute the local-date boundary in UTC
      // (earliest possible "today" starts at UTC midnight of todayStr
      // minus 14h to cover Pacific/Kiritimati). Good enough as a
      // broad floor — we then filter in JS by formatted local date to
      // be exact.
      const sinceUtc = new Date(`${todayStr}T00:00:00Z`);
      sinceUtc.setUTCHours(sinceUtc.getUTCHours() - 14);
      const recent = await db
        .select({ prayedAt: prayerRequestAmensTable.prayedAt })
        .from(prayerRequestAmensTable)
        .where(
          and(
            eq(prayerRequestAmensTable.userId, user.id),
            gte(prayerRequestAmensTable.prayedAt, sinceUtc),
          ),
        );
      const prayedToday = recent.some((r) => {
        if (!r.prayedAt) return false;
        const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(r.prayedAt);
        return ymd === todayStr;
      });
      if (prayedToday) continue;

      // Send the push. No email — evening nudges are push-only by
      // design; email would be too heavy for a secondary reminder.
      try {
        await sendEveningNudgePush(user.id);
      } catch (err) {
        logger.warn({ err, userId: user.id }, "[bell-evening] push dispatch failed");
      }

      await db.insert(bellNotificationsTable).values({
        userId: user.id,
        bellDate: eveningKey,
        sentAt: new Date(),
      });

      logger.info({ userId: user.id, eveningKey }, "[bell-evening] sent evening nudge");
    } catch (err) {
      logger.error({ err, userId: user.id }, "[bell-evening] user processing failed");
    }
  }
}

// Silence unused-import warnings if sql helper is tree-shaken away.
void sql;

// ─── Scheduler ──────────────────────────────────────────────────────────────

let bellInterval: ReturnType<typeof setInterval> | null = null;

export function startBellScheduler(): void {
  if (bellInterval) return;
  logger.info("[bell-scheduler] started — first run in 45s, then every 15 min");

  // Run once 45s after boot
  setTimeout(() => {
    runBellSender().catch((err) =>
      logger.error({ err }, "[bell] initial run failed"),
    );
    runEveningNudgeSender().catch((err) =>
      logger.error({ err }, "[bell-evening] initial run failed"),
    );
  }, 45_000);

  // Then every 15 minutes — morning + evening share the same tick;
  // each function no-ops outside its own time window.
  bellInterval = setInterval(
    () => {
      runBellSender().catch((err) =>
        logger.error({ err }, "[bell] scheduled run failed"),
      );
      runEveningNudgeSender().catch((err) =>
        logger.error({ err }, "[bell-evening] scheduled run failed"),
      );
    },
    15 * 60 * 1000,
  );
}
