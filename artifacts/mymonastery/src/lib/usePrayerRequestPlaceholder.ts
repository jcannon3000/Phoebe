import { useEffect, useState } from "react";

// Placeholder prompt for the prayer-request input. Mirrors the title
// on /pray-request/new ("What are you carrying?") so the entry point
// and the authoring flow speak with one voice. Used to be a rotation
// of three prompts; flattened to a single static prompt at the user's
// request — the FAB now offers the kind-specific framings (life
// event / justice concern / prayer for other) so the inline input
// can stay simple and warm.
const PROMPTS = [
  "What are you carrying? 🌿",
] as const;

const PROMPT_INTERVAL_MS = 4500;

export function usePrayerRequestPlaceholder(currentValue: string): string {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    // Pause while the user is typing — placeholder is hidden anyway,
    // and we don't want the index to drift in the background.
    if (currentValue) return;
    const t = window.setInterval(
      () => setIdx(i => (i + 1) % PROMPTS.length),
      PROMPT_INTERVAL_MS,
    );
    return () => window.clearInterval(t);
  }, [currentValue]);
  return PROMPTS[idx] ?? PROMPTS[0];
}
