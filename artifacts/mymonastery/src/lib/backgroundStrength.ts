// ── How strongly the background reads ───────────────────────────────────────
//
// Owner, 2026-09-25: "We want in settings in a way to increase the backround
// color by 20%" · "for the whole app", and — asked which of the two layers he
// meant — both: the leaf photo AND the green wash over it.
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

const KEY = "phoebe:bg-strength";
export const BACKGROUND_STRENGTH_EVENT = "phoebe:bg-strength-changed";

/** The owner's 20%: the multiplier both layers take when the setting is on. */
const STRONGER = 1.2;

export function backgroundStronger(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

/**
 * Put the current setting on the document root. Called at boot and on every
 * change; safe to call when nothing has been chosen (it writes the 1s, which
 * is what the stylesheet would fall back to anyway).
 */
export function applyBackgroundStrength(on = backgroundStronger()): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const v = on ? String(STRONGER) : "1";
  root.style.setProperty("--bg-photo", v);
  root.style.setProperty("--bg-wash", v);
}

export function setBackgroundStronger(on: boolean): void {
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* private mode — this session only */ }
  applyBackgroundStrength(on);
  try { window.dispatchEvent(new Event(BACKGROUND_STRENGTH_EVENT)); } catch { /* ignore */ }
}
