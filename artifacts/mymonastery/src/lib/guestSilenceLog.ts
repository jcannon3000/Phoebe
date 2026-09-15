// Device-local minutes tally for the guest "Silence" goal card (the PUBLIC
// no-login version). A guest has no account to POST prayer_sessions to, so a
// finished sit logs its whole minutes here (ContemplationTimer) and the home
// goal card's progress bar reads the day's total (useRhythmState /
// DailyProgressBody). One key, stamped with the LOCAL date — yesterday's
// minutes simply stop counting at midnight, no per-day key buildup.
// See memory "project_public_no_login".

const KEY = "phoebe:guest-silence-min";

// Fired after a write so any mounted rhythm surface re-reads the tally
// without waiting for a focus/pageshow signal.
export const GUEST_SILENCE_EVENT = "phoebe:guest-silence";

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getGuestSilenceMinutesToday(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { ymd?: unknown; min?: unknown };
    if (parsed?.ymd !== todayYmd()) return 0;
    const min = typeof parsed?.min === "number" ? parsed.min : 0;
    return Number.isFinite(min) && min > 0 ? Math.floor(min) : 0;
  } catch { return 0; }
}

/**
 * TODAY'S BREATH, KEPT ON THE DEVICE (audit, 2026-09-14). Breathing Together
 * can be a side's practice ("Choose a different practice"), and the side is
 * kept when today's breath is. An account asks /breath/today; a guest has no
 * account, so a full set stamps the local day here instead.
 */
const BREATH_KEPT_KEY = "phoebe:guest-breath-kept";
export function markGuestBreathKeptToday(): void {
  try {
    localStorage.setItem(BREATH_KEPT_KEY, todayYmd());
    window.dispatchEvent(new Event(GUEST_SILENCE_EVENT));
  } catch { /* private mode — the breath still happened */ }
}
export function guestBreathKeptToday(): boolean {
  try { return localStorage.getItem(BREATH_KEPT_KEY) === todayYmd(); } catch { return false; }
}

/** Add a finished sit's WHOLE minutes to today's tally (0/negative = no-op). */
export function addGuestSilenceMinutes(min: number): void {
  const add = Math.floor(min);
  if (!Number.isFinite(add) || add <= 0) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ymd: todayYmd(), min: getGuestSilenceMinutesToday() + add }));
    window.dispatchEvent(new Event(GUEST_SILENCE_EVENT));
  } catch { /* private mode — the sit still happened */ }
}
