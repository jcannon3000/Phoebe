// ─── /centering-prayer — the short PRACTICE course ───────────────────────────
// Fr. Keating's five method videos (The Method + The Psychological Experience),
// split out of the long series so someone can learn the practice in an evening
// — with the practice bridge (sit 15/20 min now, or make it a daily rhythm via
// the customizer's Centering preset). components/CoursePage.tsx is the shell.

import { useEffect } from "react";
import { CoursePage } from "@/components/CoursePage";
import { CENTERING_PRAYER, CENTERING_INDEX, SPIRITUAL_JOURNEY } from "@/lib/spiritualJourney";
import { migrateCourseProgress } from "@/lib/courseProgress";

export default function CenteringPrayerPage() {
  // One-time migration: these five videos used to live inside the Spiritual
  // Journey course — anyone who completed them there keeps that progress here.
  useEffect(() => {
    migrateCourseProgress(SPIRITUAL_JOURNEY.id, CENTERING_PRAYER.id, CENTERING_INDEX.videos.map((v) => v.id));
  }, []);
  return <CoursePage course={CENTERING_PRAYER} index={CENTERING_INDEX} />;
}
