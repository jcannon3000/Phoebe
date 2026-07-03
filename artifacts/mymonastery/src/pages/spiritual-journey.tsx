// ─── /journey — The Spiritual Journey (the deeper course) ────────────────────
// Fr. Keating's full talk series. The five method videos live in their own
// short course now (/centering-prayer) — see lib/spiritualJourney.ts for the
// split; components/CoursePage.tsx is the shared shell.

import { CoursePage } from "@/components/CoursePage";
import { SPIRITUAL_JOURNEY, JOURNEY_INDEX } from "@/lib/spiritualJourney";

export default function SpiritualJourneyPage() {
  return <CoursePage course={SPIRITUAL_JOURNEY} index={JOURNEY_INDEX} />;
}
