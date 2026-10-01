// ── Reflections that have been retired, and what takes their place ──────────
//
// Owner, 2026-09-30: "I want to hide Forward Day by Day and SSJE from
// practices and the customizer, turning those off" · "If someone has Forward
// in their routine, switch it to Henri Nouwen" · "If someone had SSJE in their
// routine, switch it to Taize".
//
// Two halves. OFFERING: both sources join UNOFFERED_REFLECTION_SOURCES
// (lib/officePrefs), which every picker reads, so nobody can choose them.
// HAVING: migrateRetiredReflections() moves a routine that already holds one
// onto its replacement — the home card, a side whose prayer is that
// reflection, and the day's reflection setting. It runs at boot, after a
// routine arrives from the server, and after the guest seed, so neither an old
// server copy nor an old admin default can bring one back.
//
// It writes through the ordinary setters (and saveHomeLayout), so an account's
// server copy is updated the same way any edit is. A device whose routine was
// never authored (the sync clock at 0 — an untouched seed) is left at 0, the
// invariant reference_routine_sync keeps for non-authored defaults.

import type { ReflectionSource } from "@/lib/officePrefs";
import {
  getExplicitReflectionSource,
  getSideLevel,
  getSideReflectionExplicit,
  setReflectionSource,
  setSideReflection,
} from "@/lib/officePrefs";
import { readCachedHomeLayout, saveHomeLayout } from "@/lib/homeLayoutCache";
import { clearRoutineSyncClock } from "@/lib/routineSync";

/**
 * EMPTY SINCE 2026-10-01 (owner: "lets bring back forward and SSJE"). Forward
 * Day by Day and SSJE are offered again, so nothing is moved off a routine any
 * more. Routines already moved to Nouwen / Taizé on 2026-09-30 keep that until
 * the person picks again. Put a pair back here to retire a source again.
 */
export const RETIRED_REFLECTIONS: Readonly<Record<string, ReflectionSource>> = {};

export function isRetiredReflection(s: string | null | undefined): boolean {
  return !!s && s in RETIRED_REFLECTIONS;
}

/** The home layout with each retired card swapped for its replacement. A card
 *  that was ON puts its replacement where it stood (unless that is already
 *  there); a card that was only in `order` but hidden simply leaves. `hidden`
 *  is left alone: it records what the person removed on purpose. */
function migrateLayout(): boolean {
  const layout = readCachedHomeLayout();
  if (!layout) return false;
  const order = [...(layout.order ?? [])];
  const hidden = new Set(layout.hidden ?? []);
  let changed = false;
  for (const [old, next] of Object.entries(RETIRED_REFLECTIONS)) {
    const at = order.indexOf(old);
    if (at === -1) continue;
    const wasOn = !hidden.has(old);
    order.splice(at, 1);
    changed = true;
    if (wasOn) {
      if (!order.includes(next)) order.splice(at, 0, next);
      hidden.delete(next);
    }
  }
  if (!changed) return false;
  void saveHomeLayout({ order, hidden: [...hidden], v: layout.v }).catch(() => { /* queued as dirty; retried */ });
  return true;
}

/** Move anything retired onto its replacement. Idempotent; true if it changed
 *  something. */
export function migrateRetiredReflections(): boolean {
  let clockWasZero = false;
  try {
    const at = Number(localStorage.getItem("phoebe:routine:updated-at") ?? "0");
    clockWasZero = !at;
  } catch { /* private mode */ }

  let changed = migrateLayout();

  // Each side whose prayer is a reflection (the "fdd" level is the generic
  // "a reflection is this side's prayer" sentinel). With no source of its own
  // it reads Forward Day by Day, so that counts as retired too.
  for (const side of ["morning", "evening"] as const) {
    const explicit = getSideReflectionExplicit(side);
    if (explicit && isRetiredReflection(explicit)) {
      setSideReflection(side, RETIRED_REFLECTIONS[explicit]);
      changed = true;
    } else if (!explicit && getSideLevel(side) === "fdd") {
      setSideReflection(side, RETIRED_REFLECTIONS.fdd);
      changed = true;
    }
  }

  const source = getExplicitReflectionSource();
  if (source && isRetiredReflection(source)) {
    setReflectionSource(RETIRED_REFLECTIONS[source]);
    changed = true;
  }

  // Not authored → stay not-authored (see the header).
  if (changed && clockWasZero) {
    try { clearRoutineSyncClock(); } catch { /* ignore */ }
  }
  return changed;
}
