import { OFFICE_PREFS_EVENT } from "@/lib/officePrefs";

// Which time-of-day slot (if any) the Prayer List counts toward — owner:
// "make community list an option for morning and evening slots... if they
// prayed their community prayers but have not prayed their morning or
// evening, fill in the dot in the weekly based on where they prayed the
// prayer list." This is independent of whether "Prayer List" is that
// side's CHOSEN office practice — it satisfies morningDone/eveningDone
// regardless of what that side is actually set to. null = doesn't satisfy either side;
// the card still shows in Next/Done either way (that part never depends
// on this preference).
export type PrayerListSlot = "morning" | "evening" | null;

const KEY = "phoebe:prayer-list-slot";

export function getPrayerListSlot(): PrayerListSlot {
  try {
    const v = localStorage.getItem(KEY);
    return v === "morning" || v === "evening" ? v : null;
  } catch {
    return null;
  }
}

// Reuses OFFICE_PREFS_EVENT (not a new event) so useRhythmState's existing
// OFFICE_PREFS_EVENT listener — which already forces a re-render on office
// pref changes — picks this up too, without adding a second listener.
export function setPrayerListSlot(slot: PrayerListSlot): void {
  try {
    if (slot) localStorage.setItem(KEY, slot);
    else localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* private mode / quota — non-fatal */ }
}
