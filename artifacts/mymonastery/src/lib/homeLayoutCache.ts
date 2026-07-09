// homeLayoutCache — make "my routine saved" survive iOS WebView suspension.
//
// The home layout (which cards make up the daily rhythm) lives ONLY on the
// server (users.home_layout, read via /auth/me). The customizer persists it
// with a single fire-and-forget `PUT /api/me/home-layout`. On iOS, finishing
// the customizer and immediately leaving/backgrounding the app can suspend the
// WKWebView while that PUT is still in flight — the request is dropped, never
// reaches the server, and on next launch the home reverts to the old layout
// ("I set a new routine and it didn't save"). Desktop/Safari rarely hit this
// because the request completes before the page is frozen.
//
// Fix: cache the layout to localStorage SYNCHRONOUSLY at save time (can't be
// lost to suspension) and mark it dirty. On success the dirty flag clears. If
// the app is reopened still-dirty, flushHomeLayout() re-sends it, and until it
// lands applyCachedHomeLayout() lets the local copy win over the stale server
// value so the user sees their routine immediately. Mirrors the migrate-up
// philosophy of lib/routineSync (which already covers the office levels/slots).
import { apiRequest } from "@/lib/queryClient";

export const HOME_LAYOUT_VERSION = 2; // keep in sync with the customizer writers

export type HomeLayout = { order: string[]; hidden: string[]; v?: number };

const LS_KEY = "phoebe:home-layout";
const DIRTY_KEY = "phoebe:home-layout:dirty";

export function readCachedHomeLayout(): HomeLayout | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HomeLayout;
    if (!parsed || !Array.isArray(parsed.order) || !Array.isArray(parsed.hidden)) return null;
    return parsed;
  } catch { return null; }
}

export function isHomeLayoutDirty(): boolean {
  try { return localStorage.getItem(DIRTY_KEY) === "1"; } catch { return false; }
}

function markDirty(layout: HomeLayout): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ order: layout.order, hidden: layout.hidden, v: layout.v ?? HOME_LAYOUT_VERSION }));
    localStorage.setItem(DIRTY_KEY, "1");
  } catch { /* private mode */ }
}
function markSynced(): void {
  try { localStorage.removeItem(DIRTY_KEY); } catch { /* ignore */ }
}

// Cache locally (synchronous — survives suspension) THEN PUT. On success the
// dirty flag clears; on failure it stays set so flushHomeLayout() retries on
// the next app-active/launch. Returns the PUT promise so callers can chain a
// query invalidation as before.
export function saveHomeLayout(layout: HomeLayout): Promise<unknown> {
  markDirty(layout);
  return apiRequest("PUT", "/api/me/home-layout", {
    order: layout.order,
    hidden: layout.hidden,
    v: layout.v ?? HOME_LAYOUT_VERSION,
  }).then((r) => { markSynced(); return r; });
}

// PUBLIC no-login version: a guest's layout is device-local TRUTH, not a
// pending sync — cache it WITHOUT the dirty flag (there's no account to flush
// to; a dirty flag would make flushHomeLayout 401-retry forever). The guest
// rhythm reads it back via readCachedHomeLayout (see useRhythmState).
export function cacheHomeLayoutLocalOnly(layout: HomeLayout): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ order: layout.order, hidden: layout.hidden, v: layout.v ?? HOME_LAYOUT_VERSION }));
  } catch { /* private mode */ }
}

// Re-send a layout whose save never reached the server (dropped to WebView
// suspension / offline). No-op when nothing is pending. Best-effort; on success
// it clears the flag and runs the optional invalidate so the UI re-reads.
export function flushHomeLayout(invalidate?: () => void): void {
  if (!isHomeLayoutDirty()) return;
  const layout = readCachedHomeLayout();
  if (!layout) { markSynced(); return; }
  apiRequest("PUT", "/api/me/home-layout", {
    order: layout.order,
    hidden: layout.hidden,
    v: layout.v ?? HOME_LAYOUT_VERSION,
  })
    .then(() => { markSynced(); invalidate?.(); })
    .catch(() => { /* stays dirty; retried next app-active */ });
}

// Recovery for a short-lived bug: the basic /customize editor briefly wrote a
// home layout containing only "cobreathe" for the Creation Prayer pick. Any
// present home layout disables the "un-set-up user falls back to Forward Day by
// Day" reflection rule in useRhythmState, so that spurious write silently
// dropped the newsletter card. A guest NEVER legitimately has a home layout —
// the full customizer that writes one requires an account, and it always
// includes the structural "office" key in its order. So a cached layout whose
// order lacks "office" is that spurious write; clear it (and its dirty flag) so
// `hl` returns to null and the FDD fallback — and the newsletter — come back.
// Returns true if it cleared something. Safe to call on every guest boot.
export function clearSpuriousGuestHomeLayout(): boolean {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as HomeLayout;
    const order = Array.isArray(parsed?.order) ? parsed.order : [];
    if (order.includes("office")) return false; // a real full-customizer layout
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(DIRTY_KEY);
    return true;
  } catch { return false; }
}

// While a save is still pending, the local copy is the user's true latest
// intent — let it win over a stale server `homeLayout` so the routine they just
// set shows immediately (and keeps showing if the push is still retrying).
export function applyCachedHomeLayout<T extends { homeLayout?: HomeLayout | null }>(user: T): T {
  if (!isHomeLayoutDirty()) return user;
  const layout = readCachedHomeLayout();
  if (!layout) return user;
  return { ...user, homeLayout: layout };
}
