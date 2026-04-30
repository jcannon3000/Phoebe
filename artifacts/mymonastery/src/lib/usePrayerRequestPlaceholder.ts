import { useEffect, useState } from "react";

// Rotating placeholder prompts for the prayer-request input. Three
// flavors so a returning user doesn't see the same nudge every time
// they land on the dashboard. Cycles every PROMPT_INTERVAL_MS while
// the input is empty; pauses while the user is typing because the
// placeholder isn't visible during typing anyway and rotating in the
// background just churns React.
const PROMPTS = [
  "How would you like to be prayed for this week?",
  "Is there someone you care about to raise in prayer?",
  "Is there a justice you would like prayer for?",
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
