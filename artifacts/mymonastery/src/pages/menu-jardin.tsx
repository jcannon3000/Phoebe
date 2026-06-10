import { useLocation } from "wouter";
import { MenuHub } from "@/components/MenuHub";

export default function MenuJardinPage() {
  const [, setLocation] = useLocation();
  const go = (p: string) => setLocation(p);
  return (
    <MenuHub
      title="El Jardín"
      emoji="🌿"
      subtitle="Formation tools for deeper study and reflection."
      backLabel="Menu"
      backHref="/menu"
      groups={[
        {
          header: "Study",
          items: [
            { emoji: "📖", label: "Bible Study", sub: "Structured worksheet per passage", onClick: () => go("/jardin/bible-study") },
            { emoji: "👤", label: "Character Study", sub: "Deep-dive on a biblical figure", onClick: () => go("/jardin/character-study") },
            { emoji: "🎤", label: "Sermon Notes", sub: "Capture Sunday's message", onClick: () => go("/jardin/sermon-notes") },
            { emoji: "📅", label: "Next Sunday", sub: "Prepare for the coming service", onClick: () => go("/jardin/next-sunday") },
          ],
        },
        {
          header: "Scripture & Accountability",
          items: [
            { emoji: "🔍", label: "Bible Lookup", sub: "Open any passage on Bible.com", onClick: () => go("/jardin/bible") },
            { emoji: "🏆", label: "Streak Leaderboard", sub: "Prayer streaks with friends", onClick: () => go("/jardin/leaderboard") },
          ],
        },
      ]}
    />
  );
}
