// Heart to Hearts — next-morning delivery.
//
// A shared "prayer for the day" is sealed from the author's partners until the
// next morning in the AUTHOR's timezone, so a partner wakes up to it (the
// Snapchat-style volley the product wants). The route stamps `deliver_after`
// when the prayer is shared; this module (a) computes that instant and (b) runs
// the morning sweep that sends the deferred "new prayer" push once each due
// prayer's moment arrives.
//
// Single absolute instant per prayer (author-tz next 7am) drives BOTH the read
// visibility gate (in routes/daily-prayer.ts) and this push sweep, so they can
// never disagree. Legacy rows (deliver_after NULL) are immediately visible and
// are skipped by the sweep — they were already pushed under the old code.

import { and, or, eq, isNull, lte } from "drizzle-orm";
import {
  db,
  usersTable,
  prayerPartnershipsTable,
  dailyPrayersTable,
  userMutesTable,
} from "@workspace/db";
import { sendDailyPrayerPush } from "./pushSender";

// Prayers land at 7am local — just before the default 7:30 morning reminder, so
// it's already waiting when the partner starts their day.
const DELIVERY_HOUR = 7;

// The UTC offset (ms that local time is ahead of UTC) for a tz at a given
// instant — derived from Intl, so DST is handled without a tz library.
function tzOffsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const m: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") m[p.type] = Number(p.value);
  const asUTC = Date.UTC(m.year!, m.month! - 1, m.day!, m.hour!, m.minute!, m.second!);
  return asUTC - instant.getTime();
}

// The absolute instant of wall-clock {y-m-d hour:00} in tz. One refinement pass
// resolves the DST-transition ambiguity (offset at the naive guess vs. the
// resolved instant).
function zonedWallToUtc(y: number, m: number, d: number, hour: number, tz: string): Date {
  const naive = Date.UTC(y, m - 1, d, hour, 0, 0);
  let inst = naive - tzOffsetMs(new Date(naive), tz);
  inst = naive - tzOffsetMs(new Date(inst), tz);
  return new Date(inst);
}

// The next DELIVERY_HOUR (local to tz) strictly after `now`. Write at 2pm →
// tomorrow 7am; write at 3am → today 7am (still "this morning").
export function nextDeliveryInstant(now: Date, tz: string | null): Date {
  const zone = tz || "America/New_York";
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(now); // YYYY-MM-DD
  const [y, m, d] = todayStr.split("-").map(Number) as [number, number, number];
  let inst = zonedWallToUtc(y, m, d, DELIVERY_HOUR, zone);
  if (inst.getTime() <= now.getTime()) {
    const t = new Date(Date.UTC(y, m - 1, d) + 86_400_000);
    inst = zonedWallToUtc(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), DELIVERY_HOUR, zone);
  }
  return inst;
}

async function areMuted(a: number, b: number): Promise<boolean> {
  const rows = await db.select({ id: userMutesTable.id }).from(userMutesTable).where(or(
    and(eq(userMutesTable.muterId, a), eq(userMutesTable.mutedUserId, b)),
    and(eq(userMutesTable.muterId, b), eq(userMutesTable.mutedUserId, a)),
  ));
  return rows.length > 0;
}

// The morning sweep — fired by the bell scheduler's 15-min tick. Finds every
// shared prayer whose delivery moment has arrived but hasn't been announced,
// pushes each of the author's active partners, and stamps notified_at so it
// fires exactly once. deliver_after IS NULL (legacy) is excluded by the `lte`.
export async function runDailyPrayerDeliverySender(): Promise<void> {
  const now = new Date();
  const due = await db.select().from(dailyPrayersTable).where(and(
    isNull(dailyPrayersTable.notifiedAt),
    lte(dailyPrayersTable.deliverAfter, now),
  ));
  if (due.length === 0) return;

  for (const prayer of due) {
    const partnerships = await db.select().from(prayerPartnershipsTable).where(and(
      eq(prayerPartnershipsTable.status, "active"),
      or(
        eq(prayerPartnershipsTable.userLoId, prayer.authorId),
        eq(prayerPartnershipsTable.userHiId, prayer.authorId),
      ),
    ));
    const [author] = await db.select({ name: usersTable.name })
      .from(usersTable).where(eq(usersTable.id, prayer.authorId));
    const authorName = author?.name || "Your partner";
    for (const pp of partnerships) {
      const partnerId = pp.userLoId === prayer.authorId ? pp.userHiId : pp.userLoId;
      if (!(await areMuted(prayer.authorId, partnerId))) {
        await sendDailyPrayerPush(partnerId, authorName, prayer.id).catch(() => {});
      }
    }
    // Stamp even when there are no partners — the row is "delivered"; a partner
    // added later still sees it (visibility is by deliver_after, not this flag).
    await db.update(dailyPrayersTable)
      .set({ notifiedAt: now })
      .where(eq(dailyPrayersTable.id, prayer.id));
  }
}
