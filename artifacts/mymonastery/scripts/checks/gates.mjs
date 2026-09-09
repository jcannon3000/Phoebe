// Prove which routes a SESSION-LESS visitor may reach, straight from App.tsx's
// own two lists — the thing the page-level gates were second-guessing.
import { readFileSync } from "node:fs";
const s = readFileSync(new URL("../../src/App.tsx", import.meta.url), "utf8");
const grab = (a, b) => [...s.slice(s.indexOf(a), s.indexOf(b)).matchAll(/"(\/[^"]*)"/g)].map(m => m[1]);
const exact = new Set(grab("const GUEST_ALLOWED_EXACT", "const GUEST_ALLOWED_PREFIX"));
const prefix = grab("const GUEST_ALLOWED_PREFIX", "const WEB_CUSTOMIZER_ROUTES");
const allowed = (r) => exact.has(r) || prefix.some(p => r.startsWith(p));

// Every page that still sends a user-less visitor home, and whether the route
// it serves is one guests are allowed on.
import { execSync } from "node:child_process";
// BOTH shapes. Removing the redirect but leaving the null-gate turns "bounce
// home" into "permanent blank screen" — that half-fix shipped once (6a3c4c5f)
// and a peer caught it (1b9156e7, a5edae98). A page fails this check if EITHER
// shape survives on a guest-allowed route.
const hits = execSync(
  `cd "${new URL("../../", import.meta.url).pathname}" && grep -rlE '!user\\) setLocation\\("/"\\)|\\|\\| !user\\)+ return null' src/pages/*.tsx || true`,
).toString().trim().split("\n").filter(Boolean);
const routeOf = {};
for (const m of s.matchAll(/<Route path="([^"]+)" component=\{(\w+)\}/g)) routeOf[m[2]] = m[1];
const lazy = {};
for (const m of s.matchAll(/const (\w+) = lazy\(\(\) => import\("\.\/pages\/([\w-]+)"\)/g)) lazy[m[2]] = m[1];
for (const m of s.matchAll(/import (\w+) from "@?\/?\.?\/?pages\/([\w-]+)"/g)) lazy[m[2]] = m[1];

let bad = 0;
console.log("pages that still redirect a session-less visitor:\n");
for (const f of hits) {
  const base = f.split("/").pop().replace(".tsx", "");
  const comp = lazy[base];
  const route = comp ? routeOf[comp] : undefined;
  const ok = route ? allowed(route) : null;
  if (ok) { bad++; console.log(`   ✗ ${base.padEnd(24)} ${String(route).padEnd(26)} GUESTS ARE ALLOWED HERE`); }
  else console.log(`   ok ${base.padEnd(24)} ${String(route ?? "(route not resolved)").padEnd(26)} needs an account`);
}
console.log(bad === 0
  ? "\n✓ no page contradicts GuestGate any more"
  : `\n${bad} page(s) still contradict GuestGate`);
