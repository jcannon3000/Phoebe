import { SimpleLogPage } from "@/components/SimpleLogPage";

// Reading — log what you read each day, with optional notes; private or shared.
export default function ReadingLogPage() {
  return (
    <SimpleLogPage
      kind="reading"
      practiceKey="reading"
      title="Reading"
      subtitle="What you're reading."
      emoji="📚"
      whatLabel="What did you read?"
      whatPlaceholder="A book, an article…"
      logCta="Log today's reading"
    />
  );
}
