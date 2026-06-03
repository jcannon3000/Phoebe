/**
 * i18n coverage guard.
 *
 * Fails (exit 1) if any `t("some.key", { defaultValue })` used in the app
 * references a key that doesn't exist in en.ts. Because es.ts is typed
 * `DeepStringify<typeof en>`, every en key already has an es counterpart —
 * so "in en.ts" means "translatable". This catches the easy regression where
 * a new string is added with only a defaultValue and never put in the locale
 * files (English-only for everyone, no Spanish).
 *
 * Run:  pnpm i18n:check   (or: npx tsx scripts/check-i18n-coverage.ts)
 * Wire into CI alongside `typecheck`.
 */
import { en } from "../src/i18n/en";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

type Dict = Record<string, unknown>;
function flatten(obj: Dict, prefix = "", out = new Set<string>()): Set<string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v as Dict, key, out);
    else out.add(key);
  }
  return out;
}
const enKeys = flatten(en as Dict);
// A key counts as defined if it or any of its plural variants exists.
const PLURALS = ["", "_one", "_other", "_zero", "_two", "_few", "_many"];
const defined = (k: string) => PLURALS.some((s) => enKeys.has(k + s));

const files = execSync(`find ${SRC} -name '*.tsx' -o -name '*.ts'`)
  .toString().trim().split("\n").filter((f) => !f.includes("/i18n/"));

// t("key" ...) with a STATIC string key (dynamic `key.${x}` keys are skipped).
const re = /\bt\(\s*["'`]([a-zA-Z0-9_.]+)["'`]/g;
const missing = new Map<string, string>();
for (const f of files) {
  let src: string;
  try { src = readFileSync(f, "utf8"); } catch { continue; }
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const key = m[1];
    if (!defined(key) && !missing.has(key)) missing.set(key, f.replace(SRC + "/", ""));
  }
}

if (missing.size === 0) {
  console.log(`i18n coverage OK — every t() key resolves in en.ts (${enKeys.size} keys).`);
  process.exit(0);
}
console.error(`\n✗ ${missing.size} t() key(s) used in the app are NOT in en.ts (English-only, no Spanish):\n`);
for (const [k, f] of [...missing].sort()) console.error(`  ${k}   [${f}]`);
console.error(`\nAdd each to src/i18n/en.ts (English) and src/i18n/es.ts (Spanish).`);
process.exit(1);
