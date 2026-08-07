/**
 * One-off: mark EVERY user's active novena as abandoned, so no one has a
 * novena in progress — a clean slate for testing.
 *
 * Reads the DATABASE_URL env var. Only touches rows with status='active';
 * completed/abandoned history is left alone (this is a reset, not a wipe).
 *
 * Usage from lib/db/:
 *   DATABASE_URL='<railway-prod-url>' npx --yes -p tsx@latest tsx scripts/reset-all-novenas.ts
 *
 * To get the prod DATABASE_URL: Railway → Postgres service → Variables
 * → copy DATABASE_URL (or DATABASE_PUBLIC_URL if running off-network).
 */
import { db, novenaProgressTable, pool } from "../src/index";
import { eq } from "drizzle-orm";

async function main() {
  const before = await db.select().from(novenaProgressTable).where(eq(novenaProgressTable.status, "active"));
  console.log(`Active novena rows before: ${before.length}`);
  for (const row of before) {
    await db.update(novenaProgressTable).set({ status: "abandoned" }).where(eq(novenaProgressTable.id, row.id));
    console.log(`  abandoned progress id ${row.id} — user ${row.userId}, novena ${row.novenaId}`);
  }
  console.log(`Done. Abandoned ${before.length} active novena row(s).`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
