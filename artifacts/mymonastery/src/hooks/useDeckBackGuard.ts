import { useEffect, useRef } from "react";

/**
 * MAKE THE BACK GESTURE STEP THE DECK, not close it.
 *
 * On Android, Back — the button or the edge swipe — is how people navigate,
 * and it maps to history.back(). A prayer deck pushes no history of its own
 * (its slides are state, not routes), so one Back press mid-Morning Prayer
 * left the office entirely and landed on the dashboard. Measured on the live
 * Android build 2026-09-06: from slide 4 of the scripture deck, Back went to
 * /dashboard. iOS has no system Back, which is why this was never felt.
 *
 * The mechanism is the ordinary one for a full-screen app view: while the deck
 * is open past its first slide, keep ONE spare history entry in front of the
 * page's own. A Back press pops that spare instead of the page — we hear
 * popstate, step the deck back a slide, and lay a fresh spare. On the FIRST
 * slide no spare is kept, so Back leaves the deck, which is what it should do.
 *
 * Deliberately not a route per slide: slides are not addressable, a URL per
 * slide would put them in the back stack of every other screen, and the deck
 * already owns resume.
 */
export function useDeckBackGuard(opts: {
  /** Is the deck on screen and interactive? */
  active: boolean;
  /** On the first slide — Back should leave, not step. */
  atStart: boolean;
  /** Step back one slide. */
  onBack: () => void;
}): void {
  const { active, atStart } = opts;
  // Read through refs so re-arming doesn't depend on the callback's identity,
  // and so the popstate handler can see the CURRENT slide position rather than
  // the one captured when it was registered.
  const onBackRef = useRef(opts.onBack);
  onBackRef.current = opts.onBack;
  const atStartRef = useRef(atStart);
  atStartRef.current = atStart;
  const activeRef = useRef(active);
  activeRef.current = active;
  const armed = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const shouldArm = active && !atStart;

    if (!shouldArm) {
      // Nothing to guard. Any spare we laid is left in the stack — popping it
      // ourselves here would race the very Back press that triggered this.
      armed.current = false;
      return;
    }

    if (!armed.current) {
      // Same URL, so wouter sees no route change and nothing re-renders.
      window.history.pushState({ phoebeDeckGuard: true }, "");
      armed.current = true;
    }

    const onPop = () => {
      if (!armed.current) return;
      armed.current = false;
      onBackRef.current();
      /**
       * LAY A FRESH SPARE, HERE — not by waiting for the effect.
       *
       * The effect's deps are [active, atStart], and stepping from slide 5 to
       * 4 changes neither, so it does not re-run and nothing re-arms: the
       * FIRST Back stepped the deck and the second left the office. Verified
       * on the live Android build. Re-arming after the step has been applied
       * (hence the timeout, so atStartRef is current) means Back keeps
       * walking the deck back, and stops guarding once the first slide is
       * reached — where Back should be free to leave.
       */
      setTimeout(() => {
        if (!activeRef.current || atStartRef.current || armed.current) return;
        window.history.pushState({ phoebeDeckGuard: true }, "");
        armed.current = true;
      }, 0);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [active, atStart]);
}
