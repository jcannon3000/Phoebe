// Western (Gregorian) Easter computation.
//
// Meeus / Jones / Butcher algorithm — the classical one, valid
// 1583–4099. Deterministic, integer-only, no dependencies.
// Source: Jean Meeus, "Astronomical Algorithms" (1991), ch. 8.
//
// Every movable feast in the Episcopal calendar is an offset from
// Easter (Ash Wednesday = Easter − 46, Ascension = Easter + 39,
// Pentecost = Easter + 49, Trinity = Easter + 56, etc.), so a correct
// Easter is the foundation of the whole module.
export function computeEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  // Construct as a local-day date at midnight so downstream day math
  // doesn't drift across a DST boundary.
  return new Date(year, month - 1, day);
}

// Shift a Date by N days (can be negative). Returns a NEW date —
// doesn't mutate the input. Uses local-day math so it doesn't slip
// across DST transitions.
export function addDays(d: Date, days: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + days);
  return out;
}

// Format a Date as YYYY-MM-DD in the viewer's local calendar day. We
// don't use toISOString() because that's UTC; we want local-day keys
// so a user in Pacific time doesn't see an East-Coast day's feast.
export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function ymdEquals(a: Date, b: Date): boolean {
  return toYmd(a) === toYmd(b);
}

export function dayDiff(later: Date, earlier: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const a = new Date(later.getFullYear(), later.getMonth(), later.getDate()).getTime();
  const b = new Date(earlier.getFullYear(), earlier.getMonth(), earlier.getDate()).getTime();
  return Math.round((a - b) / msPerDay);
}
