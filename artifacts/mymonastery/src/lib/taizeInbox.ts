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

/**
 * THREE SOURCES NOW, ONE SHAPE. Taizé was the first; the owner has since asked
 * for other weekly sources; the
 * National Cathedral's sermons ("doing National Cathedral Sermons as a
 * newsletter in the imbox way").
 *
 * Everything below was written for Taizé and is unchanged in substance — the
 * state is still "done THIS ONE", keyed on the item's own id, and still must
 * never be wired into the day-scoped completion helpers. It is simply keyed by
 * SOURCE as well, so three inboxes can't read each other's ids. The Taizé
 * functions remain as thin wrappers so existing call sites keep working.
 */
export type InboxSource = "taize" | "andrews";

const READ_KEY_FOR: Record<InboxSource, string> = {
  taize: "phoebe:taize:read-ids",
  // "Andrew's Version" — a weekly lectionary comment (abmcg.substack.com),
  // kept on exactly these terms: read THIS one, and nothing returns until a
  // new one is posted.
  andrews: "phoebe:andrews:read-ids",
};
/** How many ids to remember. Only the newest is ever asked about; the rest are
 *  kept so re-reading an older one doesn't resurrect it in the list view. */
const KEEP = 40;
/**
 * WHEN each issue was read — id → local YYYY-MM-DD. Kept beside the id list
 * rather than inside it so nothing already stored changes shape. Owner
 * (2026-09-04): "weekly newsletters shouldn't show in Done after the day
 * they were read" — so "done" for a weekly card is "read TODAY", which needs
 * the day, and the id list alone can't say it.
 */
const READ_DAY_KEY_FOR: Record<InboxSource, string> = {
  taize: "phoebe:taize:read-days",
  andrews: "phoebe:andrews:read-days",
};
function localDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function readDays(source: InboxSource): Record<string, string> {
  try {
    const raw = localStorage.getItem(READ_DAY_KEY_FOR[source]);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch { return {}; }
}
/** The local day this issue was read, or null if it never was. */
export function inboxReadDay(source: InboxSource, id: string): string | null {
  const d = readDays(source)[id];
  return typeof d === "string" ? d : null;
}
/** Was this issue read TODAY (local)? What a weekly card's "done" means. */
export function inboxReadToday(source: InboxSource, id: string): boolean {
  return inboxReadDay(source, id) === localDay();
}

export type TaizeMeditation = {
  id: string;
  title: string;
  url: string;
  published: string | null;
};
/** The same shape for every inbox source — a title, a link, a date. */
export type InboxItem = TaizeMeditation;

function readIds(source: InboxSource = "taize"): string[] {
  try {
    const raw = localStorage.getItem(READ_KEY_FOR[source]);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Has this person read this particular item, from this source? */
export function hasReadInbox(source: InboxSource, id: string): boolean {
  return !!id && readIds(source).includes(id);
}

/** Has this person read this particular meditation? */
export function hasReadTaize(id: string): boolean {
  return hasReadInbox("taize", id);
}

/**
 * Mark one read. Idempotent, and it never expires — that is what makes this an
 * inbox rather than a daily card.
 */
export function markInboxRead(source: InboxSource, id: string): void {
  if (!id) return;
  const kept = readIds(source).filter((x) => x !== id);
  try {
    localStorage.setItem(READ_KEY_FOR[source], JSON.stringify([id, ...kept].slice(0, KEEP)));
    window.dispatchEvent(new CustomEvent(TAIZE_READ_EVENT, { detail: { id, source } }));
  } catch {
    /* private mode — it just won't be remembered */
  }
  try {
    const days = readDays(source);
    days[id] = localDay();
    // Cap alongside the id list so it can't grow without bound.
    const keep = Object.entries(days).slice(-KEEP);
    localStorage.setItem(READ_DAY_KEY_FOR[source], JSON.stringify(Object.fromEntries(keep)));
  } catch { /* non-fatal */ }
}
export function markTaizeRead(id: string): void { markInboxRead("taize", id); }
export function markAndrewsRead(id: string): void { markInboxRead("andrews", id); }

/** Put it back in the inbox — the undo for a mis-tap, mirroring unlog elsewhere. */
export function unmarkInboxRead(source: InboxSource, id: string): void {
  if (!id) return;
  try {
    localStorage.setItem(READ_KEY_FOR[source], JSON.stringify(readIds(source).filter((x) => x !== id).slice(0, KEEP)));
    window.dispatchEvent(new CustomEvent(TAIZE_READ_EVENT, { detail: { id, source } }));
  } catch {
    /* ignore */
  }
  try {
    const days = readDays(source);
    delete days[id];
    localStorage.setItem(READ_DAY_KEY_FOR[source], JSON.stringify(days));
  } catch { /* non-fatal */ }
}
export function unmarkTaizeRead(id: string): void { unmarkInboxRead("taize", id); }

export const TAIZE_READ_EVENT = "phoebe:taize-read";

/**
 * Is there something waiting?
 *
 * `null` for "nothing to show" covers both the no-meditation case and the
 * already-read case, so a caller can't accidentally render a card for a
 * meditation that isn't there — the blank-card failure this app has had.
 */
export function waitingItem(source: InboxSource, latest: InboxItem | null | undefined): InboxItem | null {
  if (!latest?.id) return null;
  return hasReadInbox(source, latest.id) ? null : latest;
}
export function waitingMeditation(latest: TaizeMeditation | null | undefined): TaizeMeditation | null {
  return waitingItem("taize", latest);
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
