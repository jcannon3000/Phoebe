/**
 * The owner's runtime curation of the ACT art library — the client half of
 * act_overrides (see the admin art-library tool, /admin/art-library).
 *
 * Two facts per work, keyed by ACT record id:
 *   hidden — deleted from EVERY surface (Visio, icon prayer, admin grid
 *            still shows it, greyed, so it can be restored);
 *   isIcon — true/false forces the work into/out of the Praying-with-Icons
 *            pool; null leaves it wherever the harvest put it.
 *
 * Read synchronously from a localStorage snapshot so visioSelect — a pure,
 * sync module — can consult it at choose time, refreshed from the server in
 * the background (module load + any admin write). A device that has never
 * fetched simply has no overrides yet: artwork keeps rendering, and the next
 * fetch catches it up. Deletions live server-side so a catalogue
 * REGENERATION can never resurrect them.
 */
import { apiRequest } from "@/lib/queryClient";

const KEY = "phoebe:act-overrides";
export const ACT_OVERRIDES_EVENT = "phoebe:act-overrides";

export type ActOverride = { actId: number; hidden: boolean; isIcon: boolean | null };

let rows: ActOverride[] = [];
let hiddenSet = new Set<number>();
let iconOnSet = new Set<number>();
let iconOffSet = new Set<number>();

function apply(next: ActOverride[]): void {
  rows = next;
  hiddenSet = new Set(next.filter((r) => r.hidden).map((r) => r.actId));
  iconOnSet = new Set(next.filter((r) => r.isIcon === true).map((r) => r.actId));
  iconOffSet = new Set(next.filter((r) => r.isIcon === false).map((r) => r.actId));
  try { window.dispatchEvent(new Event(ACT_OVERRIDES_EVENT)); } catch { /* SSR/tests */ }
}

// Snapshot first — synchronous, so the first chooseArtwork of the session
// already respects yesterday's deletions even before the fetch lands.
try {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      apply(parsed.filter(
        (r): r is ActOverride => !!r && typeof r === "object" && typeof (r as ActOverride).actId === "number",
      ));
    }
  }
} catch { /* private mode / bad snapshot — server refresh below covers it */ }

export function isActHidden(id: number): boolean { return hiddenSet.has(id); }
export function actIconOn(id: number): boolean { return iconOnSet.has(id); }
export function actIconOff(id: number): boolean { return iconOffSet.has(id); }
export function getActOverrideRows(): ActOverride[] { return rows; }
export function actOverrideFor(id: number): ActOverride | null { return rows.find((r) => r.actId === id) ?? null; }

/** Pull the server's copy — cheap, public, fire-and-forget on load. */
export async function refreshActOverrides(): Promise<void> {
  try {
    const r: any = await apiRequest("GET", "/api/act-overrides");
    const next: ActOverride[] = Array.isArray(r?.overrides) ? r.overrides : [];
    apply(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota */ }
  } catch { /* offline — the snapshot stands */ }
}

/** Admin write — super-admin only server-side; applied locally at once. */
export async function setActOverride(actId: number, patch: { hidden?: boolean; isIcon?: boolean | null }): Promise<void> {
  await apiRequest("PUT", "/api/admin/act-overrides", { actId, ...patch });
  const existing = rows.find((r) => r.actId === actId);
  const next = rows.filter((r) => r.actId !== actId);
  next.push({
    actId,
    hidden: patch.hidden ?? existing?.hidden ?? false,
    isIcon: patch.isIcon !== undefined ? patch.isIcon : existing?.isIcon ?? null,
  });
  apply(next);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota */ }
}

// Refresh once per session, as soon as anything art-shaped loads this module.
if (typeof window !== "undefined") void refreshActOverrides();
