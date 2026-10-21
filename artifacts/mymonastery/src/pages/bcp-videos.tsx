// ─── /bcp-videos — the Book of Common Prayer, with Gospel Simplicity ─────────
// Three conversations about the prayer book from Austin Suggs's channel (see
// lib/bcpVideos). components/CoursePage.tsx is the shell every video course
// uses, so this is the whole page.

import { CoursePage } from "@/components/CoursePage";
import { BCP_VIDEOS, BCP_VIDEOS_INDEX } from "@/lib/bcpVideos";

export default function BcpVideosPage() {
  return <CoursePage course={BCP_VIDEOS} index={BCP_VIDEOS_INDEX} />;
}
