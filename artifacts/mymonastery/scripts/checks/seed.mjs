import { R, store } from "./_env.mjs";
const seed = await import(R + "guestSeed.ts"); const prefs = await import(R + "officePrefs.ts");
const PRESETS = { presets: [], default: { cards: ["requests","office","contemplation","fdd","lectio","feeds"], slots: { visio: "anytime" }, evening: "examen", morning: "guided-prayer", version: 1, reflection: "fdd", relational: ["gratitude"], silenceMin: 0 }, updatedAt: 1, fetchedAt: Date.now() };
const NEWS = ["cac","fdd","ssje","vts","nouwen","sojo","grist"];
const base = { "phoebe:guest-seeded-ymd": "2026-08-13", "phoebe:office:level:morning": "guided-prayer", "phoebe:office:level:evening": "examen" };
const cases = [
  ["fresh device, admin default", { "phoebe:routine-presets": JSON.stringify(PRESETS) }, { news: ["fdd"], entry: "read" }],
  ["v8 device with BOTH newsletters (the Android repro)", { ...base, "phoebe:guest-seed-version": "8", "phoebe:office:level:morning": "psalms", "phoebe:home-layout": JSON.stringify({ order: ["cac","visio","requests","office","contemplation","fdd","lectio","feeds"], hidden: [], v: 2 }), "phoebe:routine-presets": JSON.stringify(PRESETS) }, { news: ["fdd"], entry: "read" }],
  ["v7 device, CAC, no admin default", { ...base, "phoebe:guest-seed-version": "7", "phoebe:office:level:evening": "ask", "phoebe:home-layout": JSON.stringify({ order: ["cac","visio"], hidden: [], v: 2 }) }, { news: ["fdd"], entry: "read" }],
  ["chose CAC", { ...base, "phoebe:guest-seed-version": "8", "phoebe:office:reflection-source": "cac", "phoebe:home-layout": JSON.stringify({ order: ["cac","visio"], hidden: [], v: 2 }) }, { news: ["cac"], entry: "read" }],
  ["chose SSJE, no admin default", { ...base, "phoebe:guest-seed-version": "9", "phoebe:office:reflection-source": "ssje", "phoebe:home-layout": JSON.stringify({ order: ["ssje","visio"], hidden: [], v: 2 }) }, { news: ["ssje"], entry: "read" }],
  ["chose Nouwen under the admin default", { ...base, "phoebe:guest-seed-version": "8", "phoebe:office:level:morning": "psalms", "phoebe:office:reflection-source": "nouwen", "phoebe:home-layout": JSON.stringify({ order: ["nouwen","visio"], hidden: [], v: 2 }), "phoebe:routine-presets": JSON.stringify(PRESETS) }, { news: ["nouwen"], entry: "read" }],
  ["chose venite — entry untouched", { ...base, "phoebe:guest-seed-version": "9", "phoebe:office:entry:morning": "venite", "phoebe:office:entry:evening": "venite", "phoebe:routine-presets": JSON.stringify(PRESETS) }, { news: ["fdd"], entry: "venite" }],
];
let fail = 0;
for (const [label, state, want] of cases) {
  store.clear(); Object.entries(state).forEach(([k, v]) => store.set(k, v)); seed.seedGuestRule();
  const l = JSON.parse(store.get("phoebe:home-layout") || "null");
  const news = (l?.order ?? []).filter(k => NEWS.includes(k) && !(l?.hidden ?? []).includes(k));
  const entry = prefs.getSideEntry("morning");
  const ok = JSON.stringify(news) === JSON.stringify(want.news) && entry === want.entry;
  if (!ok) fail++; console.log(`  ${ok ? "✓" : "✗"} ${label}  → newsletters ${JSON.stringify(news)} entry ${entry}`);
}
console.log(fail ? `✗ seed: ${fail}` : "✓ seed: one newsletter, explicit choices kept, office entry read"); process.exit(fail ? 1 : 0);
