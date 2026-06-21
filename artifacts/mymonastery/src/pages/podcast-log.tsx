import { SimpleLogPage } from "@/components/SimpleLogPage";

// Podcasts — log what you listened to each day, with optional notes; private or shared.
export default function PodcastLogPage() {
  return (
    <SimpleLogPage
      kind="podcasts"
      practiceKey="podcasts"
      title="Podcasts"
      subtitle="What you're listening to."
      emoji="🎙️"
      whatLabel="What did you listen to?"
      whatPlaceholder="A podcast or episode…"
      logCta="Log today's podcast"
    />
  );
}
