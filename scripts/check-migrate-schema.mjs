#!/usr/bin/env node
// CI guard: every Drizzle schema table (pgTable) must have a matching
// CREATE TABLE in api-server's runtime migrate.ts.
//
// Why: migrate() runs on every boot and is the ONLY schema mechanism the
// deploy applies — it does NOT run `drizzle-kit migrate`/`push`. A schema
// table with no CREATE in migrate.ts only exists in prod by historical
// accident and breaks a fresh database (disaster recovery, a new
// environment, local-from-scratch) with "relation <x> does not exist".
//
// This intentionally handles the two declaration forms a naive
// single-line/unquoted grep misses — which is exactly how tables slipped
// through the original audit:
//   1. multi-line `pgTable(\n  "name"` (e.g. action_rsvps, parish_admins)
//   2. quoted CREATEs `CREATE TABLE IF NOT EXISTS "actions"`
//
// Run: node scripts/check-migrate-schema.mjs   (exits 1 if any table is missing)
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = join(repoRoot, "lib/db/src/schema");
const migratePath = join(repoRoot, "artifacts/api-server/src/lib/migrate.ts");

// Schema tables — first string argument to pgTable(, on the same line or the
// next (the `\s*` spans the newline of the multi-line form).
const schemaTables = new Set();
for (const file of readdirSync(schemaDir)) {
  if (!file.endsWith(".ts")) continue;
  const src = readFileSync(join(schemaDir, file), "utf8");
  for (const m of src.matchAll(/pgTable\(\s*["']([a-z_]+)["']/g)) schemaTables.add(m[1]);
}

// Tables created in migrate.ts — CREATE TABLE [IF NOT EXISTS] <name>, with or
// without quoted identifiers.
const created = new Set();
const migrateSrc = readFileSync(migratePath, "utf8");
for (const m of migrateSrc.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?["']?([a-z_]+)["']?/gi)) {
  created.add(m[1]);
}

const missing = [...schemaTables].filter((t) => !created.has(t)).sort();
if (missing.length > 0) {
  console.error("✗ Schema tables with NO CREATE TABLE in migrate.ts:\n");
  for (const t of missing) console.error("    " + t);
  console.error(
    "\nmigrate() is the only schema mechanism that runs on deploy (no drizzle-kit).\n" +
      "Add `CREATE TABLE IF NOT EXISTS <name> (...)` for each to\n" +
      "artifacts/api-server/src/lib/migrate.ts, in FK-dependency order.\n",
  );
  process.exit(1);
}
console.log(`✓ All ${schemaTables.size} schema tables have a CREATE TABLE in migrate.ts.`);
