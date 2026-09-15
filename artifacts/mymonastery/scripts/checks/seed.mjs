import { R, store } from "./_env.mjs";
const seed = await import(R + "guestSeed.ts"); const prefs = await import(R + "officePrefs.ts");
const PRESETS = { presets: [], default: { cards: ["requests","office","contemplation","fdd","lectio","feeds"], slots: { visio: "anytime" }, evening: "examen", morning: "guided-prayer", version: 1, reflection: "fdd", relational: ["gratitude"], silenceMin: 0 }, updatedAt: 1, fetchedAt: Date.now() };
// The admin override DELETED ("back to what ships in the app") — the server then answers default: null.
const NO_DEFAULT = { presets: [], default: null, updatedAt: 1, fetchedAt: Date.now() };
const NEWS = ["cac","fdd","ssje","vts","nouwen","sojo","grist"];
const base = { "phoebe:guest-seeded-ymd": "2026-08-13", "phoebe:office:level:morning": "guided-prayer", "phoebe:office:level:evening": "examen" };
const lay = (order, hidden = []) => JSON.stringify({ order, hidden, v: 2 });
const cases = [
  ["fresh device, admin default", { "phoebe:routine-presets": JSON.stringify(PRESETS) }, { news: ["fdd"], entry: "read" }],
  ["v8 device with BOTH newsletters (the Android repro)", { ...base, "phoebe:guest-seed-version": "8", "phoebe:office:level:morning": "psalms", "phoebe:home-layout": JSON.stringify({ order: ["cac","visio","requests","office","contemplation","fdd","lectio","feeds"], hidden: [], v: 2 }), "phoebe:routine-presets": JSON.stringify(PRESETS) }, { news: ["fdd"], entry: "read" }],
  ["v7 device, CAC, no admin default", { ...base, "phoebe:guest-seed-version": "7", "phoebe:office:level:evening": "ask", "phoebe:home-layout": JSON.stringify({ order: ["cac","visio"], hidden: [], v: 2 }) }, { news: ["fdd"], entry: "read" }],
  ["chose CAC", { ...base, "phoebe:guest-seed-version": "8", "phoebe:office:reflection-source": "cac", "phoebe:home-layout": JSON.stringify({ order: ["cac","visio"], hidden: [], v: 2 }) }, { news: ["cac"], entry: "read" }],
  ["chose SSJE, no admin default", { ...base, "phoebe:guest-seed-version": "9", "phoebe:office:reflection-source": "ssje", "phoebe:home-layout": JSON.stringify({ order: ["ssje","visio"], hidden: [], v: 2 }) }, { news: ["ssje"], entry: "read" }],
  ["chose Nouwen under the admin default", { ...base, "phoebe:guest-seed-version": "8", "phoebe:office:level:morning": "psalms", "phoebe:office:reflection-source": "nouwen", "phoebe:home-layout": JSON.stringify({ order: ["nouwen","visio"], hidden: [], v: 2 }), "phoebe:routine-presets": JSON.stringify(PRESETS) }, { news: ["nouwen"], entry: "read" }],
  ["chose venite — entry untouched", { ...base, "phoebe:guest-seed-version": "9", "phoebe:office:entry:morning": "venite", "phoebe:office:entry:evening": "venite", "phoebe:routine-presets": JSON.stringify(PRESETS) }, { news: ["fdd"], entry: "venite" }],
  // v11 (owner, 2026-09-14): Simple · Examen · Visio · Feast Day Hagiographies · Forward Day by Day.
  ["v11 fresh device, no admin default", { "phoebe:routine-presets": JSON.stringify(NO_DEFAULT) }, { news: ["fdd"], entry: "read", on: ["fdd","visio","hagiography"], off: ["lectio"] }],
  ["v10 device seeded by the old override, override deleted", { ...base, "phoebe:guest-seed-version": "10", "phoebe:guest-seed-default-version": "1", "phoebe:home-layout": lay(["requests","office","contemplation","fdd","lectio","feeds"]), "phoebe:routine-presets": JSON.stringify(NO_DEFAULT) }, { news: ["fdd"], entry: "read", on: ["fdd","visio","hagiography"], off: ["lectio"] }],
  ["v10 device that added Lectio itself — kept", { ...base, "phoebe:guest-seed-version": "10", "phoebe:home-layout": lay(["fdd","visio","lectio"]), "phoebe:routine-presets": JSON.stringify(NO_DEFAULT) }, { news: ["fdd"], entry: "read", on: ["fdd","visio","hagiography","lectio"] }],
  ["v10 device that hid hagiography — stays hidden", { ...base, "phoebe:guest-seed-version": "10", "phoebe:guest-seed-default-version": "1", "phoebe:home-layout": lay(["fdd","visio"], ["hagiography"]), "phoebe:routine-presets": JSON.stringify(NO_DEFAULT) }, { news: ["fdd"], entry: "read", on: ["fdd","visio"], off: ["hagiography"] }],
  // The override applied on THIS build (stamped 11), then deleted by the owner.
  ["v11 device seeded by the override, override deleted", { ...base, "phoebe:guest-seed-version": "11", "phoebe:guest-seed-default-version": "1", "phoebe:home-layout": lay(["requests","office","contemplation","fdd","lectio","feeds"]), "phoebe:routine-presets": JSON.stringify(NO_DEFAULT) }, { news: ["fdd"], entry: "read", on: ["fdd","visio","hagiography"], off: ["lectio"] }],
  // …and while the override is still there, it stays (no flip-flop).
  // (The override set the office entries to "read" when it applied; a no-op leaves them.)
  ["v11 device on the override, override still live", { ...base, "phoebe:guest-seed-version": "11", "phoebe:guest-seed-default-version": "1", "phoebe:office:entry:morning": "read", "phoebe:office:entry:evening": "read", "phoebe:home-layout": lay(["requests","office","contemplation","fdd","lectio","feeds"]), "phoebe:routine-presets": JSON.stringify(PRESETS) }, { news: ["fdd"], entry: "read", on: ["fdd","lectio"] }],
];
let fail = 0;
for (const [label, state, want] of cases) {
  store.clear(); Object.entries(state).forEach(([k, v]) => store.set(k, v)); seed.seedGuestRule();
  const l = JSON.parse(store.get("phoebe:home-layout") || "null");
  const isOn = (k) => (l?.order ?? []).includes(k) && !(l?.hidden ?? []).includes(k);
  const news = (l?.order ?? []).filter(k => NEWS.includes(k) && !(l?.hidden ?? []).includes(k));
  const entry = prefs.getSideEntry("morning");
  const missing = (want.on ?? []).filter(k => !isOn(k));
  const unwanted = (want.off ?? []).filter(k => isOn(k));
  const ok = JSON.stringify(news) === JSON.stringify(want.news) && entry === want.entry && missing.length === 0 && unwanted.length === 0;
  if (!ok) fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}  → newsletters ${JSON.stringify(news)} entry ${entry}${missing.length ? ` MISSING ${JSON.stringify(missing)}` : ""}${unwanted.length ? ` UNWANTED ${JSON.stringify(unwanted)}` : ""}`);
}
console.log(fail ? `✗ seed: ${fail}` : "✓ seed: one newsletter, explicit choices kept, office entry read, v11 default cards"); process.exit(fail ? 1 : 0);
