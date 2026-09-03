// ── Designing a rule that isn't yours ────────────────────────────────────────
//
// The customizer writes as you go: picking a morning office sets
// phoebe:office:level:morning on THIS device and pushes it. That is right when
// you are editing your own rhythm and wrong in every other use of the same
// flow — designing a routine to prescribe to someone else, or editing a PRESET
// in the admin tools. Both need the flow's full UI and none of its writes.
//
// So both snapshot the routine keys on entry and put them back on the way out,
// with the sync suspended in between. This lived inside prescribe-routine.tsx;
// the preset editor needs exactly the same guard, and a second copy of a
// list-of-keys is how the first one drifted twice (see the note on
// ROUTINE_EXACT below).
import { ROUTINE_KEYS, setRoutineSyncSuspended, pushRoutineConfig } from "@/lib/routineSync";

// Per-side office/slot keys are enumerated dynamically (custom anchors add
// their own), so the prefixes stay rather than being listed literally.
const ROUTINE_PREFIXES = ["phoebe:office:", "phoebe:slot:"];
/**
 * DERIVED from ROUTINE_KEYS, never hand-mirrored. The hand-written version
 * drifted twice — phoebe:contemplation-log-method and
 * phoebe:hide-turn-learn-pray were added to ROUTINE_KEYS and not here, so
 * touching either control while designing for someone else permanently
 * overwrote the designer's own setting and pushed it to their devices.
 */
const ROUTINE_EXACT = new Set<string>([
  ...ROUTINE_KEYS,
  "phoebe:scripture-scope",
  "phoebe:routine:updated-at",
]);

export function isRoutineKey(k: string): boolean {
  return ROUTINE_PREFIXES.some((p) => k.startsWith(p)) || ROUTINE_EXACT.has(k);
}

export function snapshotRoutine(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && isRoutineKey(k)) { const v = localStorage.getItem(k); if (v != null) out[k] = v; }
    }
  } catch { /* private mode */ }
  return out;
}

export function restoreRoutine(snap: Record<string, string>): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && isRoutineKey(k)) toRemove.push(k); }
    for (const k of toRemove) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(snap)) localStorage.setItem(k, v);
  } catch { /* private mode */ }
  // Designing is over: let this device sync again, and re-assert the owner's
  // OWN routine. The push is SUSPENDED for the whole design session rather
  // than reverted afterwards, so there is normally nothing on the server to
  // undo even if the tab closes mid-design.
  setRoutineSyncSuspended(false);
  pushRoutineConfig();
}
