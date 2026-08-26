/**
 * Which rows the weekly card shows — the reader's own choice.
 *
 * The card has always chosen for you: Morning, one auto-selected middle row,
 * Evening. That middle slot does something clever (silence wins it, a
 * newsletter takes it when there's no silence, and it collapses when there's
 * neither) but it's still one slot deciding on your behalf, and it AGGREGATES —
 * a walker, a listener and someone praying with an image all get the same
 * "Contemplative" row, so the week can't show you which of them you actually
 * kept.
 *
 * A saved selection replaces that automatic choice entirely. Absent — which is
 * everyone until they open the editor — the card behaves exactly as before, so
 * this changes nothing for anyone who doesn't ask for it.
 *
 * Ordering is the list's own order, so rows can be arranged as well as chosen.
 */

export const WEEKLY_ROWS_KEY = "phoebe:weekly-rows";
export const WEEKLY_ROWS_EVENT = "phoebe:weekly-rows-changed";

/** A custom anchor's row, so a practice you named yourself can have one. */
export const CUSTOM_ROW_PREFIX = "custom:";

/**
 * Every row the card can draw, in the order the editor offers them.
 *
 * `key` must match what computeWeeklyGrid builds; a key it doesn't recognise is
 * skipped rather than drawn blank, so removing a practice from the app can't
 * leave a permanently empty row behind.
 */
export const WEEKLY_ROW_CHOICES: Array<{ key: string; emoji: string; label: string; sub: string }> = [
  { key: "morning", emoji: "🌅", label: "Morning", sub: "Whatever opens your day." },
  { key: "evening", emoji: "🌙", label: "Evening", sub: "Whatever closes it." },
  { key: "contemplative", emoji: "🕯️", label: "Contemplative", sub: "Any contemplative practice, together." },
  { key: "reflection", emoji: "📖", label: "Reflection", sub: "The day's reading — CAC, Forward, SSJE, the Dean's word." },
  { key: "cobreathe", emoji: "🌍", label: "Creation Prayer", sub: "On its own row." },
  { key: "walk", emoji: "🚶", label: "Contemplative Walk", sub: "On its own row." },
  { key: "listening", emoji: "🎵", label: "Audio Divina", sub: "On its own row." },
  { key: "visio", emoji: "🖼️", label: "Visio Divina", sub: "On its own row." },
  { key: "examen", emoji: "🌗", label: "The Examen", sub: "On its own row." },
  { key: "compline", emoji: "🌒", label: "Compline", sub: "On its own row." },
  { key: "reading", emoji: "📚", label: "Reading", sub: "On its own row." },
  { key: "prayer-list", emoji: "🕊️", label: "Prayer List", sub: "On its own row." },
];

/**
 * The saved selection, or null for "choose for me".
 *
 * An EMPTY saved list is not the same as no list: it means the reader removed
 * every row, and the card should honour that rather than silently reverting to
 * the automatic three. Null is the only "not customized" value.
 */
export function getWeeklyRows(): string[] | null {
  try {
    const raw = localStorage.getItem(WEEKLY_ROWS_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((k): k is string => typeof k === "string" && k.length > 0 && k.length <= 80);
  } catch {
    return null;
  }
}

/** Save a selection, or pass null to hand the choice back to the card. */
export function setWeeklyRows(rows: string[] | null): void {
  try {
    if (rows === null) localStorage.removeItem(WEEKLY_ROWS_KEY);
    else localStorage.setItem(WEEKLY_ROWS_KEY, JSON.stringify([...new Set(rows)]));
    window.dispatchEvent(new Event(WEEKLY_ROWS_EVENT));
  } catch { /* private mode — the card just keeps choosing for itself */ }
}
