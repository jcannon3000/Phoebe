/**
 * One-off: replace Anabelle Helsell's most recent letter content with
 * her original letter (which failed to send and was followed by a
 * filler). Idempotent and safe — defaults to a dry run that prints
 * what it WOULD update without writing. Pass --apply to commit.
 *
 * Usage from artifacts/api-server/:
 *
 *   # Preview (no DB writes)
 *   DATABASE_URL='<railway-prod-url>' npx tsx scripts/swap-anabelle-letter.ts
 *
 *   # Actually swap
 *   DATABASE_URL='<railway-prod-url>' npx tsx scripts/swap-anabelle-letter.ts --apply
 *
 * To get the prod DATABASE_URL: Railway → Postgres service → Variables
 * → copy DATABASE_URL (or DATABASE_PUBLIC_URL if running off-network).
 */

import { db, lettersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const TARGET_EMAIL = "anabelle.helsell@gmail.com";
// Belt-and-suspenders: confirm we're touching the correct
// correspondence (the URL the user pointed at: /letters/9).
const TARGET_CORRESPONDENCE_ID = 9;

const ORIGINAL_CONTENT = `Hi Jeremy,

Thinking of how I stayed in the Theresa of Avila room when I was at Holy Cross. I had brought her book with me, which maybe you remember I really didn't like. So I thought, hmmm where is the synchronicity here? Felt like I was missing something and appreciate her reappearance now in the form of your thoughts.

Lately I've just been so moved by the astronauts. They have trained and studied for decades. They have to be engineering nerds in near perfect health. I can't imagine the stamina, discipline, and courage they have. I love listening to them talk about seeing earth from outside earth, and it's a perspective I've always dreamt of. I've been thinking about this telescope I won from the library as a kid. It was a raffle for kids who read a lot of books. I fucking loved that library, in the summer our mom took us almost every day. My dad would take me out to the mountains to star gaze with my new fancy telescope, and I wanted to be an astronomer. But I didn't like math and science, and now I see how the same thing I loved in the stars is what I love from poetry, and ancient thought, and hosting parties. I love to wonder.

About to respond to your texts.

Xx, Anabelle`;

async function main() {
  const apply = process.argv.includes("--apply");

  // Find the most recent letter from this email. Limit to one — we
  // explicitly want to swap exactly one row, the most recent.
  const rows = await db.select({
    id: lettersTable.id,
    correspondenceId: lettersTable.correspondenceId,
    authorName: lettersTable.authorName,
    authorEmail: lettersTable.authorEmail,
    sentAt: lettersTable.sentAt,
    content: lettersTable.content,
  })
    .from(lettersTable)
    .where(sql`LOWER(${lettersTable.authorEmail}) = ${TARGET_EMAIL}`)
    .orderBy(sql`${lettersTable.sentAt} DESC`)
    .limit(5);

  if (rows.length === 0) {
    console.error(`❌ No letters found for ${TARGET_EMAIL}.`);
    process.exit(1);
  }

  console.log(`Found ${rows.length} recent letter(s) from ${TARGET_EMAIL}:\n`);
  rows.forEach((r, i) => {
    const marker = i === 0 ? "  ← MOST RECENT (will be swapped)" : "";
    console.log(`  [${i}] id=${r.id} correspondenceId=${r.correspondenceId} sentAt=${r.sentAt.toISOString()}${marker}`);
    console.log(`      "${r.content.slice(0, 100)}…"`);
    console.log();
  });

  const target = rows[0];

  // Double-check we're touching the right correspondence before any
  // write happens. If the most-recent letter from this email lives in
  // a different correspondence than the one the user pointed at, bail
  // — better to fail loudly than swap content into the wrong thread.
  if (target.correspondenceId !== TARGET_CORRESPONDENCE_ID) {
    console.error(
      `❌ Safety check failed: most-recent letter from ${TARGET_EMAIL} is in correspondence ${target.correspondenceId}, ` +
      `but we expected ${TARGET_CORRESPONDENCE_ID}. Refusing to swap. ` +
      `If this is intentional, update TARGET_CORRESPONDENCE_ID at the top of the script.`,
    );
    process.exit(1);
  }

  console.log("─".repeat(60));
  console.log("CURRENT content of most-recent letter (id=" + target.id + "):");
  console.log("─".repeat(60));
  console.log(target.content);
  console.log();
  console.log("─".repeat(60));
  console.log("REPLACEMENT content (the original letter):");
  console.log("─".repeat(60));
  console.log(ORIGINAL_CONTENT);
  console.log();

  if (!apply) {
    console.log("ℹ️  Dry run — no DB writes. Re-run with --apply to commit.");
    process.exit(0);
  }

  console.log("✏️  Applying swap…");
  const result = await db.update(lettersTable)
    .set({ content: ORIGINAL_CONTENT })
    .where(eq(lettersTable.id, target.id))
    .returning({ id: lettersTable.id });

  if (result.length === 1) {
    console.log(`✅ Updated letter id=${result[0].id}.`);
  } else {
    console.error(`❌ Expected 1 row update, got ${result.length}.`);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
  });
