import { R, store } from "./_env.mjs";
const seed = await import(R + "guestSeed.ts");
const NO_DEFAULT = { presets: [], default: null, updatedAt: 1, fetchedAt: Date.now() };
const lay = (order, hidden = []) => JSON.stringify({ order, hidden, v: 2 });
const base = { "phoebe:guest-seeded-ymd": "2026-10-01", "phoebe:office:level:morning": "guided-prayer", "phoebe:office:level:evening": "examen", "phoebe:routine-presets": JSON.stringify(NO_DEFAULT) };
const cases = [
  ["fresh device", { "phoebe:routine-presets": JSON.stringify(NO_DEFAULT) }, { breath: true, sit: false }],
  ["v14 untouched device carrying the seeded sit", { ...base, "phoebe:guest-seed-version": "14", "phoebe:office:contemplation:morning": "1", "phoebe:office:contemplation-kind:morning": "silent", "phoebe:home-layout": lay(["nouwen","hagiography"]) }, { breath: true, sit: false }],
  ["v13 untouched device carrying the seeded sit", { ...base, "phoebe:guest-seed-version": "13", "phoebe:office:contemplation:morning": "1", "phoebe:home-layout": lay(["nouwen"]) }, { breath: true, sit: false }],
  ["v14 device the person CUSTOMISED (office/office) keeps its sit", { ...base, "phoebe:guest-seed-version": "14", "phoebe:office:level:morning": "office", "phoebe:office:level:evening": "office", "phoebe:office:contemplation:morning": "1", "phoebe:home-layout": lay(["nouwen"]) }, { breath: false, sit: true }],
  ["v14 untouched device that REMOVED the breath keeps it removed", { ...base, "phoebe:guest-seed-version": "14", "phoebe:office:contemplation:morning": "1", "phoebe:home-layout": lay(["nouwen","cobreathe"], ["cobreathe"]) }, { breath: false, sit: false }],
  ["v12 device (never had the sit) gains the breath", { ...base, "phoebe:guest-seed-version": "12", "phoebe:home-layout": lay(["nouwen"]) }, { breath: true, sit: false }],
  ["v14 device that turned its sit OFF stays off", { ...base, "phoebe:guest-seed-version": "14", "phoebe:office:contemplation:morning": "0", "phoebe:home-layout": lay(["nouwen"]) }, { breath: true, sit: false }],
];
let bad = 0;
for (const [name, ls, want] of cases) {
  store.clear(); for (const [k, v] of Object.entries(ls)) store.set(k, v);
  seed.seedGuestRule();
  const h = JSON.parse(store.get("phoebe:home-layout") || "null");
  const breath = !!h && h.order.includes("cobreathe") && !(h.hidden || []).includes("cobreathe");
  const sit = store.get("phoebe:office:contemplation:morning") === "1";
  const ok = breath === want.breath && sit === want.sit;
  if (!ok) bad++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}  → breath ${breath}, sit ${sit}, stamp ${store.get("phoebe:guest-seed-version")}`);
}
console.log(bad ? `✗ ${bad} failing` : "✓ all v15 cases");
process.exit(bad ? 1 : 0);
