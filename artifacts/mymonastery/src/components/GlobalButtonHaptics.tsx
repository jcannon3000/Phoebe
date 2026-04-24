import { useEffect } from "react";

/**
 * Fires a light native haptic on every button-like element press.
 *
 * Rationale: the prayer-mode "Amen" already has its own heavier haptic
 * (`triggerAmenFeedback`), but the rest of the app was silent on tap.
 * One document-level pointerdown listener is lighter than wiring the
 * effect into every button. We match on the nearest `<button>`,
 * `[role="button"]`, `<a>`, or `<summary>` ancestor.
 *
 * Uses `pointerdown` (not click) so the tactile feedback is synchronous
 * with the finger press — feels like the button "accepts" the touch,
 * not like it responds after a delay.
 *
 * Native-shell (phoebe-mobile) listens for `phoebe:haptic` and routes
 * to Capacitor Haptics on iOS. On the web build nothing listens —
 * silent no-op, no audio, no cost.
 */

const INTERACTIVE_SELECTOR =
  'button, [role="button"], a, summary, [data-haptic]';

// Opt-out hook: add `data-no-haptic` to an element (or ancestor) to
// silence the tap. Useful for repeated micro-interactions like sliders.
const OPT_OUT_ATTR = "data-no-haptic";

export function GlobalButtonHaptics() {
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      const el = target.closest(INTERACTIVE_SELECTOR);
      if (!el) return;
      if (el.closest(`[${OPT_OUT_ATTR}]`)) return;
      // Skip disabled buttons.
      if ((el as HTMLButtonElement).disabled) return;
      try {
        window.dispatchEvent(
          new CustomEvent("phoebe:haptic", { detail: { style: "light" } }),
        );
      } catch {
        /* non-fatal */
      }
    };
    document.addEventListener("pointerdown", handler, { passive: true });
    return () => document.removeEventListener("pointerdown", handler);
  }, []);

  return null;
}
