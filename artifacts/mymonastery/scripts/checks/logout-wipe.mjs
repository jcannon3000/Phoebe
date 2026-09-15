// Logout forgets the day's reads. Every day tracker (lib/cacReadState) is driven
// through its real mark function, so the keys come from the writes rather than a
// list; then resetDeviceRuleForLogout runs, as useLogout and the boot wipe do.
import { R, store } from "./_env.mjs";
const posts = [];
globalThis.fetch = async (url, init = {}) => {
  posts.push(`${init.method ?? "GET"} ${url}`);
  return new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } });
};
const reads = await import(R + "cacReadState.ts"); const seed = await import(R + "guestSeed.ts");
const settle = () => new Promise((r) => setTimeout(r, 0));
let fail = 0;
const check = (ok, label) => { if (!ok) fail++; console.log(`  ${ok ? "✓" : "✗"} ${label}`); };

// Person A reads everything. Explicit side levels keep the office-credit paths
// quiet, and the wipe removing them is the proof that it ran.
store.clear();
store.set("phoebe:office:level:morning", "office"); store.set("phoebe:office:level:evening", "office");
store.set("phoebe:anon-provisioned", "1"); // about the device, not the person: survives logout
for (const f of ["markCacRead", "markFddRead", "markSsjeRead", "markVtsRead", "markNouwenRead", "markSojoRead", "markGristRead"]) reads[f](20_000);
reads.markHagiographyRead();
for (const side of ["morning", "evening"]) {
  for (const f of ["markPsalmsPrayed", "markGuidedPrayerPrayed", "markCustomPrayed", "markFddPrayed", "markCacPrayed", "markSsjePrayed", "markVtsPrayed", "markReadingsPrayed"]) reads[f](side);
  for (const s of ["nouwen", "sojo", "grist"]) reads.markReflectionPrayed(s, side);
}
await settle();
const written = [...store.keys()].filter((k) => k.includes("last-read-day"));
check(["phoebe:cac:last-read-day:synced", "phoebe:cac:last-read-day:dwell", "phoebe:psalms:evening:last-read-day:synced"].every((k) => written.includes(k)),
  `A's reads wrote ${written.length} tracker keys`);

seed.resetDeviceRuleForLogout();
check(!store.has("phoebe:office:level:morning"), "the wipe ran");
check(store.get("phoebe:anon-provisioned") === "1", "phoebe:anon-provisioned survives");
const left = [...store.keys()].filter((k) => k.includes("last-read-day"));
check(left.length === 0, `no tracker key survives${left.length ? `: ${left.join(" ")}` : ""}`);

// Person B signs in on the same phone, the same day.
posts.length = 0;
reads.retryPendingReflectionReads(); await settle();
check(posts.length === 0, "none of A's reads is re-sent under B's session");
check(!reads.hasReadCacToday(), "B's CAC card is not already read");
reads.markCacRead(); await settle();
check(posts.some((p) => p.endsWith("/api/cac/read")), "B's own first read POSTs");
console.log(fail ? `✗ logout-wipe: ${fail}` : "✓ logout-wipe: no day read survives logout, and the next account's first read syncs"); process.exit(fail ? 1 : 0);
