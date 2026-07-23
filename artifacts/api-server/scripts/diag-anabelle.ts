/**
 * READ-ONLY diagnostic — finds Anabelle, checks for duplicate/early-account issues,
 * and tests whether jcannon is reachable in her notification garden. NO writes.
 *
 * Run against PROD (read replica or public URL is fine):
 *   cd artifacts/api-server
 *   DATABASE_URL='<railway prod DATABASE_URL>' pnpm dlx tsx scripts/diag-anabelle.ts
 */
import { db, usersTable, groupMembersTable, fellowsTable } from "@workspace/db";
import { getGardenUserIds, getFellowUserIds } from "../src/lib/garden";
import { sql, or, eq, asc } from "drizzle-orm";

const COLS = { id: usersTable.id, email: usersTable.email, name: usersTable.name, created: usersTable.createdAt };

async function main() {
  console.log("DB host:", (process.env.DATABASE_URL ?? "").replace(/.*@/, "").replace(/\/.*/, ""));

  // 1) Anabelle (any spelling) + jcannon  — DUP check
  const an = await db.select(COLS).from(usersTable)
    .where(sql`LOWER(${usersTable.name}) LIKE '%nabelle%' OR LOWER(${usersTable.email}) LIKE '%nabelle%'`);
  const jc = await db.select(COLS).from(usersTable)
    .where(sql`LOWER(${usersTable.email}) = 'jcannon3000@gmail.com'`);
  console.log("\n=== ANABELLE ROW(S) — more than one = duplicate-account bug ===");
  an.forEach((u) => console.log(u));
  console.log("=== JCANNON ===");
  jc.forEach((u) => console.log(u));
  const jcId = jc[0]?.id;

  // 2) early-user email quality (null/empty emails break garden if unguarded)
  const [q] = await db.select({
    total: sql<number>`count(*)`,
    nullEmail: sql<number>`count(*) filter (where ${usersTable.email} is null)`,
    emptyEmail: sql<number>`count(*) filter (where btrim(coalesce(${usersTable.email},'')) = '')`,
  }).from(usersTable);
  console.log("\n=== EMAIL QUALITY (all users) ===", q);
  const early = await db.select(COLS).from(usersTable).orderBy(asc(usersTable.id)).limit(15);
  console.log("=== 15 EARLIEST USERS (watch for NULL email) ===");
  early.forEach((u) => console.log({ ...u, email: u.email ?? "**NULL**" }));

  // 3) per-Anabelle: fellow rows, memberships, and is jcannon in her garden?
  for (const u of an) {
    console.log(`\n=== Anabelle id=${u.id} (${u.email ?? "NULL email"}) ===`);
    const fellows = await db.select({ a: fellowsTable.userId, b: fellowsTable.fellowUserId })
      .from(fellowsTable).where(or(eq(fellowsTable.userId, u.id), eq(fellowsTable.fellowUserId, u.id)));
    console.log("fellow rows:", fellows);
    console.log("jcannon a fellow (either direction)?",
      fellows.some((f) => f.a === jcId || f.b === jcId));
    const mems = await db.select({ groupId: groupMembersTable.groupId, byId: groupMembersTable.userId, byEmail: groupMembersTable.email })
      .from(groupMembersTable)
      .where(or(eq(groupMembersTable.userId, u.id),
        u.email ? sql`LOWER(${groupMembersTable.email}) = ${u.email.toLowerCase()}` : sql`false`));
    console.log("memberships:", mems);
    try {
      const g = await getGardenUserIds(u.id);
      const fl = await getFellowUserIds(u.id);
      console.log(`getGardenUserIds(${u.id}): size=${g.length}; jcannon(${jcId}) present? ${jcId != null && g.includes(jcId)}`);
      console.log(`getFellowUserIds(${u.id}): [${fl.join(", ")}]; jcannon present? ${jcId != null && fl.includes(jcId)}`);
      if (jcId != null && !g.includes(jcId)) {
        console.log(">>> jcannon is NOT in Anabelle's garden — THIS is why her requests don't notify you.");
      }
    } catch (e) {
      console.log(`>>> getGardenUserIds(${u.id}) THREW: ${(e as Error).message}  (a throw here = nobody is notified)`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
