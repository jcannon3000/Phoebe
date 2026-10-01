// ── How strongly the background reads ───────────────────────────────────────
//
// Owner, 2026-09-25: "We want in settings in a way to increase the backround
// color by 20%" · "for the whole app", and — asked which of the two layers he
// meant — both: the leaf photo AND the green wash over it.
//
// REVERSED 2026-10-01 (owner: "The stronger background should be lighter
// background" · "and it doesnt actually do anything right now" · "the make the
// backround lighter togger"). The switch is now LIGHTER, not stronger — more of
// the photograph, less of the dark wash laid over it — and it is big enough to
// SEE. The first version multiplied both layers by 1.2, which moved the wash
// from 0.45 to 0.54 and the photo from 0.4 to 0.48: a change nobody could tell
// from a mistake, which is the whole of "it doesn't actually do anything".
//
// Every page's backdrop is the same two things: a photograph at a low opacity,
// and a dark green gradient above it. Rather than hunt down each gradient when
// the setting changes, both numbers are multiplied by CSS variables set once on
// the document root. A backdrop written as
//
//   opacity: calc(0.4 * var(--bg-photo, 1))
//   rgba(8, 22, 15, calc(0.45 * var(--bg-wash, 1)))
//
// follows the setting with no JavaScript of its own, and reads exactly as it
// always did when the setting is off (both variables are 1).
//
// DEVICE-LOCAL, like the other display preferences: this is about the screen in
// front of a person — its brightness, where they are sitting, how good their
// eyes are today — not about their account. It survives a reload, and it is
// applied before first paint (see main.tsx) so a page never flashes the plain
// strength and then correct itself.

// A NEW KEY. The old one (phoebe:bg-strength) meant "stronger"; a device that
// had that switched on would otherwise wake up lighter without having asked.
const KEY = "phoebe:bg-lighter";
export const BACKGROUND_STRENGTH_EVENT = "phoebe:bg-strength-changed";

/**
 * What each layer is multiplied by when the setting is on. Looked at on the
 * menu: the photograph at 1.6x (0.4 → 0.64) and the wash at 0.6x (0.45–0.80 →
 * 0.27–0.48) is plainly lighter and the ferns plainly more present, while the
 * frosted cards still carry the text — going further washes the type out.
 */
const LIGHTER_PHOTO = 1.6;
const LIGHTER_WASH = 0.6;

export function backgroundLighter(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

/**
 * Put the current setting on the document root. Called at boot and on every
 * change; safe to call when nothing has been chosen (it writes the 1s, which
 * is what the stylesheet would fall back to anyway).
 */
export function applyBackgroundStrength(on = backgroundLighter()): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--bg-photo", on ? String(LIGHTER_PHOTO) : "1");
  root.style.setProperty("--bg-wash", on ? String(LIGHTER_WASH) : "1");
}

export function setBackgroundLighter(on: boolean): void {
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* private mode — this session only */ }
  applyBackgroundStrength(on);
  try { window.dispatchEvent(new Event(BACKGROUND_STRENGTH_EVENT)); } catch { /* ignore */ }
}
