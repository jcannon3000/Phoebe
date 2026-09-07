import { useEffect, useRef, useState } from "react";

/**
 * SAY THE SLIDE OUT LOUD.
 *
 * The decks changed their whole content on Next and announced nothing: the
 * VoiceOver cursor stayed parked on the button it had just activated, so a
 * blind reader heard silence and had to hunt the screen again — on every one
 * of an office's thirty-odd slides. There were exactly two aria-live regions
 * in the entire app, and neither was in a practice.
 *
 * A polite region, so it waits for the reader to finish rather than cutting
 * across them; `atomic` so the whole line is read as one; and the text is
 * rebuilt only when the slide actually changes. Visually hidden rather than
 * `display: none` — a hidden region is not announced at all.
 *
 * Deliberately not `assertive`: this is a change the reader asked for by
 * tapping Next, not an alert.
 */
export function DeckAnnouncer({ label }: { label: string }) {
  const [spoken, setSpoken] = useState("");
  const lastRef = useRef("");

  useEffect(() => {
    const next = label.trim();
    if (!next || next === lastRef.current) return;
    lastRef.current = next;
    // Clear first, so re-announcing an identical string still speaks (some
    // screen readers ignore a live region whose text did not change).
    setSpoken("");
    const id = window.setTimeout(() => setSpoken(next), 60);
    return () => window.clearTimeout(id);
  }, [label]);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        margin: -1,
        padding: 0,
        overflow: "hidden",
        clip: "rect(0 0 0 0)",
        clipPath: "inset(50%)",
        whiteSpace: "nowrap",
        border: 0,
      }}
    >
      {spoken}
    </div>
  );
}
