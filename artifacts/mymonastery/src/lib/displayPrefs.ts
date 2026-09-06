/**
 * Device-local display preferences shared by Settings and the shell.
 *
 * The keys used to live in pages/settings.tsx, which the drawer must not
 * import (settings imports the layout — a cycle). One tiny module both sides
 * can read instead.
 */

/** Settings → "Hide community features": Community, Prayer list and Events
 *  leave the drawer (owner, 2026-09-05). */
export const HIDE_COMMUNITY_KEY = "phoebe:hide-community";

export function readDisplayBool(key: string): boolean {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}
export function writeDisplayBool(key: string, value: boolean): void {
  try { localStorage.setItem(key, value ? "1" : "0"); } catch { /* private mode */ }
  try { window.dispatchEvent(new Event("phoebe:prefs-changed")); } catch { /* web no-op */ }
}
