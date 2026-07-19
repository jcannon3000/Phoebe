#!/usr/bin/env node
// CI guard: every foreign key that REFERENCES users(id) in the runtime migrate
// DDL must declare an `ON DELETE` behaviour (CASCADE or SET NULL).
//
// Why: account deletion (DELETE /users/me) ends in `DELETE FROM users`. Any FK
// into users(id) with no ON DELETE clause defaults to NO ACTION, so that delete
// throws a foreign-key violation and the account is left permanently
// un-deletable and half-gutted — a broken right-to-erasure (Apple 5.1.1(v) /
// GDPR). This is exactly the class of bug the 2026-07-19 audit found on
// morning_prayer_cache.assembled_by_user_id and correspondences.created_by_user_id.
//
// We scan migrate.ts (NOT the Drizzle schema) because migrate() is the ONLY
// schema mechanism the deploy applies — its CREATE TABLE statements are the
// authoritative constraints. `... REFERENCES users(id)` with no `ON DELETE`
// on the same statement fails this check. Either add ON DELETE, or null the
// column by hand in the delete handler AND annotate the DDL with ON DELETE
// SET NULL so the two agree.
//
// Run: node scripts/check-users-fk-ondelete.mjs   (exits 1 on any bare FK)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migratePath = join(repoRoot, "artifacts/api-server/src/lib/migrate.ts");
const src = readFileSync(migratePath, "utf8");
const lines = src.split("\n");

// A column line that references users(id). The DDL writes one column per line,
// so a per-line scan is reliable. Accept an ON DELETE clause either on the same
// line or (rarely) spilling onto the next.
const violations = [];
lines.forEach((line, i) => {
  if (!/REFERENCES\s+users\s*\(\s*id\s*\)/i.test(line)) return;
  const tail = line + " " + (lines[i + 1] ?? "");
  if (!/ON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION)/i.test(tail)) {
    const col = (line.trim().match(/^([a-z_]+)\b/i) || [])[1] ?? "(column)";
    violations.push(`migrate.ts:${i + 1}  ${col} → REFERENCES users(id) with NO ON DELETE`);
  }
});

if (violations.length > 0) {
  console.error("FK to users(id) without an ON DELETE clause (breaks account deletion):\n");
  for (const v of violations) console.error("  " + v);
  console.error(`\n${violations.length} bare FK(s). Add ON DELETE CASCADE or SET NULL to each CREATE TABLE.`);
  process.exit(1);
}

console.log("OK: every migrate FK referencing users(id) declares an ON DELETE behaviour.");
