import { SimpleLogPage } from "@/components/SimpleLogPage";

// Contemplative Walk — log where you walked each day, with optional notes;
// private or shared with fellows.
export default function WalkLogPage() {
  return (
    <SimpleLogPage
      kind="walk"
      practiceKey="walk"
      title="Contemplative Walk"
      subtitle="A walk as prayer."
      emoji="🚶"
      whatLabel="Where did you walk?"
      whatPlaceholder="A trail, a neighborhood, a garden…"
      logCta="Log today's walk"
      plainBackground
    />
  );
}
