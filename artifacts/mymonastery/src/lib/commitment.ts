// The 30-day commitment — the "keep it for a month" trial that carries a new
// practice through its fragile early stretch, before it has aged into meaning.
//
// Grace is built into the ARCHITECTURE, not enforced as a rule: the day count is
// simply elapsed days since the day you committed, so a missed day never resets
// anything — day 14 is day 14 whether you prayed 14 times or 9. Stored locally
// (a personal, device-local nicety); cross-device sync can come later.

const KEY = "phoebe:commitment-start"; // the ymd the user committed
export const COMMITMENT_DAYS = 30;

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function getCommitmentStart(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

/** Begin a 30-day trial today. No-op if one is already running. */
export function startCommitment(): void {
  try { if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, todayYmd()); } catch { /* ignore */ }
}

export function clearCommitment(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Which day of the trial today is: 1 on the first day, counting up. null if no
 *  commitment. Can exceed COMMITMENT_DAYS once the month is complete. */
export function commitmentDay(): number | null {
  const start = getCommitmentStart();
  if (!start) return null;
  const n = Math.round((ymdToDate(todayYmd()).getTime() - ymdToDate(start).getTime()) / 86_400_000) + 1;
  return n < 1 ? 1 : n;
}

/** In the middle of the trial month (day 1–30). */
export function isCommitmentActive(): boolean {
  const n = commitmentDay();
  return n !== null && n <= COMMITMENT_DAYS;
}

/** The month is complete (day > 30) — time for the rule-review moment. */
export function isCommitmentComplete(): boolean {
  const n = commitmentDay();
  return n !== null && n > COMMITMENT_DAYS;
}
