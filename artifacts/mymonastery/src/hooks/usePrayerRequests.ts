import { useAuth } from "./useAuth";

// Whether the prayer-request feature is available to this account.
//
// Product decision (2026-07-23): prayer requests / community intercessions are
// turned OFF for EVERYONE — no exceptions (previously scoped to pilot groups +
// super admins). Nobody sees a prayer-request surface: no Prayer list, no
// /prayer-mode, no request creation, no community intercessions in the office.
// In its place the office offers a contemplative pause (see the office deck),
// and prayer-* routes redirect home (see PrayerGate in App.tsx).
//
// NOTE: this is a product/UX gate, not a security boundary — the server routes
// and data model are untouched; we only stop surfacing the feature. Flip this
// back to a per-user condition to re-enable. A full code + data removal is a
// later, separate step.
//
// `useAuth` is called to keep the hook's shape stable (and so re-enabling is a
// one-line change), even though the result is currently unconditional.
export function usePrayerRequestsEnabled(): boolean {
  useAuth();
  return false;
}

// Whether the PRIVATE prayer list (prayer_intentions) is surfaced anywhere —
// the home screen section, the menu entry, and the tail slides woven into
// the BCP office / Simple Guided Prayer / Psalms.
//
// Product decision (2026-07-29): turned OFF for everyone, same day it was
// restored — the owner wants both the old community prayer-request feature
// AND this private list off. The underlying data/route/API (/intentions,
// /api/prayer-intentions) stays intact; only the surfaces are hidden. Flip
// this back to re-enable.
export function usePrayerListEnabled(): boolean {
  useAuth();
  return false;
}
