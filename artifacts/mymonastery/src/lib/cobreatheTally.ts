// A lightweight per-device tally of breaths taken in Cobreathe this week, for
// the summary's "X breaths this week" line. Per-device (localStorage) is fine
// — it's gentle encouragement, not a synced stat. Week starts Sunday, local.

function weekStartKey(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return `phoebe:cobreathe-breaths:${d.toLocaleDateString("en-CA")}`;
}

export function breathsThisWeek(): number {
  try { return parseInt(localStorage.getItem(weekStartKey()) || "0", 10) || 0; }
  catch { return 0; }
}

/** Add a completed set's breaths to this week's tally; returns the new total. */
export function addBreathsThisWeek(n: number): number {
  try {
    const next = breathsThisWeek() + n;
    localStorage.setItem(weekStartKey(), String(next));
    return next;
  } catch { return n; }
}
