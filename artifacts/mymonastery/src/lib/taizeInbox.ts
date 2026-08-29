// The inbox practice — Taizé's meditations.
//
// Owner: "it could go into your routine, and if you finish it, it goes into
// done, and then you don't have it until the next one is posted. But say you
// didn't do it that day, they have the next day as well. Kind of like an
// inbox."
//
// THIS IS A NEW SHAPE FOR THIS APP, and the difference is the whole point.
// Every other practice is DAY-SCOPED: it appears in the morning and is gone at
// midnight whether or not you kept it, because a prayer you didn't pray
// yesterday isn't owed to you today. A piece of writing someone published on a
// Thursday is not like that. It waits.
//
// So the state here is not "done today" but "done THIS ONE", keyed on the
// meditation's own id. It follows that:
//   • Missing a day costs nothing — it is still there tomorrow.
//   • Reading it clears it, and nothing returns until Taizé posts again.
//   • There is no streak and no lapse. An inbox that shames you for a full
//     inbox is a worse inbox.
//
// It also means this must NEVER be wired into the day-scoped completion
// helpers (markPracticeDoneToday and friends): those reset at midnight, which
// would put a meditation someone already read back in front of them every
// morning until the next one arrived.

const READ_KEY = "phoebe:taize:read-ids";
/** How many ids to remember. Only the newest is ever asked about; the rest are
 *  kept so re-reading an older one doesn't resurrect it in the list view. */
const KEEP = 40;

export type TaizeMeditation = {
  id: string;
  title: string;
  url: string;
  published: string | null;
};

function readIds(): string[] {
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Has this person read this particular meditation? */
export function hasReadTaize(id: string): boolean {
  return !!id && readIds().includes(id);
}

/**
 * Mark one read. Idempotent, and it never expires — that is what makes this an
 * inbox rather than a daily card.
 */
export function markTaizeRead(id: string): void {
  if (!id) return;
  const kept = readIds().filter((x) => x !== id);
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([id, ...kept].slice(0, KEEP)));
    window.dispatchEvent(new CustomEvent(TAIZE_READ_EVENT, { detail: { id } }));
  } catch {
    /* private mode — it just won't be remembered */
  }
}

/** Put it back in the inbox — the undo for a mis-tap, mirroring unlog elsewhere. */
export function unmarkTaizeRead(id: string): void {
  if (!id) return;
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(readIds().filter((x) => x !== id).slice(0, KEEP)));
    window.dispatchEvent(new CustomEvent(TAIZE_READ_EVENT, { detail: { id } }));
  } catch {
    /* ignore */
  }
}

export const TAIZE_READ_EVENT = "phoebe:taize-read";

/**
 * Is there something waiting?
 *
 * `null` for "nothing to show" covers both the no-meditation case and the
 * already-read case, so a caller can't accidentally render a card for a
 * meditation that isn't there — the blank-card failure this app has had.
 */
export function waitingMeditation(latest: TaizeMeditation | null | undefined): TaizeMeditation | null {
  if (!latest?.id) return null;
  return hasReadTaize(latest.id) ? null : latest;
}

/**
 * How long it has been waiting, in plain words — "posted Thursday", "waiting
 * since 27 August". Deliberately NOT a countdown or an overdue badge: the
 * point of an inbox here is that nothing is late.
 */
export function waitingLabel(m: TaizeMeditation | null, now: Date = new Date()): string | null {
  if (!m?.published) return null;
  const then = new Date(`${m.published}T12:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 7) return `Posted ${then.toLocaleDateString(undefined, { weekday: "long" })}`;
  return `Posted ${then.toLocaleDateString(undefined, { day: "numeric", month: "long" })}`;
}
