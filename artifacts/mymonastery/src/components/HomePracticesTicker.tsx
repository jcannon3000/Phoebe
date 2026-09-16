// ─── Home Practices ticker — every practice, rolling past under the feast ────
//
// Owner, 2026-09-16: "Could we build one of these horizontal scrolls for all
// the practices on the practice page" · "i want them to roll through on a
// ticker" · then, once it had shipped as a headed section after Courses:
// "give me a version like the origonal ticker that goes under the feast day
// eybrow, with out a practices header". So it sits where the April row sat,
// right under the date and the feast line, with no heading of its own.
//
// The pills are the Practices page's own list (lib/practiceDirectory), in its
// order and behind its gates. Offline, only what lib/offline's registry says
// opens with no connection rides the ticker — the Practices page's "Available"
// half, matched on the same registry key.

import { useLocation } from "wouter";
import { PillTicker } from "@/components/PillTicker";
import { usePracticeDirectory } from "@/lib/practiceDirectory";
import { OFFLINE_PRACTICES, useOnline } from "@/lib/offline";

export function HomePracticesTicker() {
  const [, setLocation] = useLocation();
  const practices = usePracticeDirectory();
  const online = useOnline();
  const savedKeys = new Set(OFFLINE_PRACTICES.map((p) => p.key));
  const shown = online ? practices : practices.filter((p) => !!p.offlineKey && savedKeys.has(p.offlineKey));
  if (shown.length === 0) return null;
  // No entrance of its own: it belongs to the header, which doesn't have one,
  // and the April row didn't either. mt-2 is that row's gap under the date.
  return (
    <div className="mt-2">
      <PillTicker
        label="Practices"
        pills={shown.map((p) => ({ key: p.href, emoji: p.emoji, label: p.label, onSelect: () => setLocation(p.href) }))}
      />
    </div>
  );
}
