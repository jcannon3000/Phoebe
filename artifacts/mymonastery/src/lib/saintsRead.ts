// ── The saints you have sat with ────────────────────────────────────────────
//
// Owner, 2026-09-18: "then have a closing slide that shows them all the saints
// they've read, read recently."
//
// Device-local, and deliberately small: a name and the day it was read. It is
// the closing slide's material — "these are the ones who have kept you company
// lately" — not a record anybody is scored on. Nothing is sent anywhere.
//
// Kept to thirty, newest first, one row per saint: reading Julian three times
// this month should move her to the front, not fill the slide with Julians.

export type SaintRead = {
  /** month-day, the same key the calendar and Forward Movement join on. */
  id: string;
  name: string;
  /** "January 17" — their day, not the day it was read. */
  when: string;
  /** When it was read, as an ISO date, for "today"/"yesterday" wording. */
  readOn: string;
};

const KEY = "phoebe:saints-read";
const CAP = 30;

export const SAINTS_READ_EVENT = "phoebe:saints-read-changed";

export function getSaintsRead(): SaintRead[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is SaintRead =>
      !!v && typeof v === "object"
      && typeof (v as SaintRead).id === "string"
      && typeof (v as SaintRead).name === "string");
  } catch {
    return [];
  }
}

/** Record that this life was read, newest first, without duplicating a saint. */
export function markSaintRead(entry: Omit<SaintRead, "readOn">): void {
  try {
    const today = new Date().toLocaleDateString("en-CA");
    const rows = getSaintsRead().filter((r) => r.id !== entry.id);
    const next = [{ ...entry, readOn: today }, ...rows].slice(0, CAP);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(SAINTS_READ_EVENT));
  } catch { /* private mode — the practice still works, it just won't remember */ }
}
