import { usePresenceTurn } from "@/hooks/usePresenceTurn";

// Mounts the passive-dwell Turn tracker (lights the Fellows "Turn" dot after
// ~30s of foreground use, once per day). Renders nothing — it lives inside the
// query providers so the hook can read auth + post.
export function PresenceTurn(): null {
  usePresenceTurn();
  return null;
}
