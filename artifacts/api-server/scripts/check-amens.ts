/**
 * One-off: dump every amen / prayer-recording surface for a given email
 * so you can answer "are X's amens being counted?" in one shot.
 *
 * Reads the DATABASE_URL env var. Always read-only — no writes.
 *
 * Usage from artifacts/api-server/:
 *   DATABASE_URL='<railway-prod-url>' npx tsx scripts/check-amens.ts anabelle.helsell@gmail.com
 *
 * To get the prod DATABASE_URL: Railway → Postgres service → Variables
 * → copy DATABASE_URL (or DATABASE_PUBLIC_URL if running off-network).
 *
 * What it prints:
 *   • The user's id (or "(no user row)" if the email isn't registered)
 *   • prayer_request_amens count + most recent timestamp
 *   • moment_posts count where userToken belongs to this user (joined
 *     through moment_user_tokens.email), broken out by isCheckin
 *   • prayer_feed_prayers count + most recent timestamp + per-feed
 *     breakdown
 *
 * Anything missing or zero where you expect non-zero is the smoking
 * gun. Common causes:
 *   • She isn't a registered user yet → user_id null → moment_posts
 *     can't be linked
 *   • She isn't a member of the climate intercession moment (the
 *     reconcile job runs at intercession-create time + on subscribe;
 *     if her subscription post-dates both, she won't have a userToken)
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Usage: npx tsx scripts/check-amens.ts <email>");
  process.exit(1);
}

async function main() {
  const userRows = await db.execute<{
    id: number;
    email: string;
    name: string | null;
    created_at: Date;
  }>(sql`SELECT id, email, name, created_at FROM users WHERE LOWER(email) = ${email}`);
  const user = userRows.rows[0];

  console.log(`\n── ${email} ──`);
  if (!user) {
    console.log("(no user row — never registered)");
    return;
  }
  console.log(`user_id: ${user.id}  name: ${user.name ?? "(unset)"}  created: ${user.created_at.toISOString()}`);

  // 1. prayer_request_amens — solo prayer-request taps in the slideshow.
  const amenRows = await db.execute<{ count: string; latest: Date | null }>(sql`
    SELECT COUNT(*)::text AS count, MAX(created_at) AS latest
    FROM prayer_request_amens
    WHERE user_id = ${user.id}
  `);
  const a = amenRows.rows[0];
  console.log(`\nprayer_request_amens: ${a.count}${a.latest ? `  latest: ${a.latest.toISOString()}` : ""}`);

  // 2. moment_posts — community/climate intercession taps. Linked via
  // moment_user_tokens.email, since moment_posts itself only stores
  // the (per-moment) userToken.
  const postRows = await db.execute<{
    is_checkin: number;
    count: string;
    latest: Date | null;
  }>(sql`
    SELECT mp.is_checkin, COUNT(*)::text AS count, MAX(mp.created_at) AS latest
    FROM moment_posts mp
    INNER JOIN moment_user_tokens mut ON mp.user_token = mut.user_token
    WHERE LOWER(mut.email) = ${email}
    GROUP BY mp.is_checkin
    ORDER BY mp.is_checkin DESC
  `);
  console.log(`\nmoment_posts (joined via moment_user_tokens.email):`);
  if (postRows.rows.length === 0) {
    console.log("  (none — likely not a member of any intercession moment)");
  } else {
    for (const r of postRows.rows) {
      const label = r.is_checkin === 1 ? "amens (isCheckin=1)" : "non-checkin posts";
      console.log(`  ${label}: ${r.count}${r.latest ? `  latest: ${r.latest.toISOString()}` : ""}`);
    }
  }

  // Member-of check, broken out per moment so you can see which
  // intercessions she's actually wired into.
  const memberRows = await db.execute<{
    moment_id: number;
    name: string | null;
    template_type: string | null;
    prayer_feed_id: number | null;
  }>(sql`
    SELECT mut.moment_id, sm.name, sm.template_type, sm.prayer_feed_id
    FROM moment_user_tokens mut
    INNER JOIN shared_moments sm ON sm.id = mut.moment_id
    WHERE LOWER(mut.email) = ${email}
    ORDER BY mut.moment_id
  `);
  console.log(`\nmoment_user_tokens membership (${memberRows.rows.length} moments):`);
  for (const r of memberRows.rows) {
    const tag = r.prayer_feed_id ? `feed=${r.prayer_feed_id}` : r.template_type ?? "(no type)";
    console.log(`  moment ${r.moment_id} [${tag}]: ${r.name ?? "(unnamed)"}`);
  }

  // 3. prayer_feed_prayers — Pray button on a prayer-feed entry's
  // detail page (separate from the slideshow path).
  const feedPrayerRows = await db.execute<{
    feed_id: number;
    feed_slug: string;
    count: string;
    latest: Date | null;
  }>(sql`
    SELECT pf.id AS feed_id, pf.slug AS feed_slug, COUNT(*)::text AS count, MAX(pfp.created_at) AS latest
    FROM prayer_feed_prayers pfp
    INNER JOIN prayer_feeds pf ON pf.id = pfp.feed_id
    WHERE pfp.user_id = ${user.id}
    GROUP BY pf.id, pf.slug
    ORDER BY pf.slug
  `);
  console.log(`\nprayer_feed_prayers (per-feed):`);
  if (feedPrayerRows.rows.length === 0) {
    console.log("  (none)");
  } else {
    for (const r of feedPrayerRows.rows) {
      console.log(`  ${r.feed_slug} (id=${r.feed_id}): ${r.count}  latest: ${r.latest?.toISOString() ?? "(null)"}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
