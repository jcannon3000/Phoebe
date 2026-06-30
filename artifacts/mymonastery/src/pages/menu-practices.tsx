import { useLocation } from "wouter";
import { MenuHub } from "@/components/MenuHub";

export default function MenuPracticesPage() {
  const [, setLocation] = useLocation();
  const go = (p: string) => setLocation(p);
  return (
    <MenuHub
      title="Practices"
      emoji="🕯️"
      subtitle="Contemplative practices to weave through your day."
      backLabel="Menu"
      backHref="/menu"
      groups={[{
        items: [
          { emoji: "📖", label: "Listen to Scripture", sub: "Hear the day's OT, Psalm, NT & Gospel", onClick: () => go("/scripture/readings") },
          { emoji: "🕯️", label: "Contemplation", sub: "A timer for silent prayer", onClick: () => go("/contemplation") },
          { emoji: "🌍", label: "Co-Breathe", sub: "12 breaths as a prayer for climate justice", onClick: () => go("/cobreathe") },
          { emoji: "🎧", label: "Audio Divina", sub: "Sacred listening", onClick: () => go("/listening") },
          { emoji: "🌾", label: "Gratitude", sub: "A daily thanksgiving journal", onClick: () => go("/gratitude") },
          { emoji: "🤔", label: "Examen", sub: "End-of-day reflective prayer", onClick: () => go("/examen") },
        ],
      }]}
    />
  );
}
