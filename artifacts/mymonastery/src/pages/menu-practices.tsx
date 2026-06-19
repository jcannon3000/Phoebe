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
          { emoji: "🧭", label: "Find your rhythm", sub: "A few questions → a rule of life shaped for you", onClick: () => go("/find-your-rhythm") },
        ],
      }, {
        items: [
          { emoji: "🕯️", label: "Contemplation", sub: "A timer for silent prayer", onClick: () => go("/contemplation") },
          { emoji: "🎧", label: "Listening", sub: "Music as a way of prayer", onClick: () => go("/listening") },
          { emoji: "🌾", label: "Gratitude", sub: "A daily thanksgiving journal", onClick: () => go("/gratitude") },
          { emoji: "📓", label: "Journal", sub: "Write and reflect", onClick: () => go("/journal") },
          { emoji: "🤔", label: "Examen", sub: "End-of-day reflective prayer", onClick: () => go("/examen") },
        ],
      }]}
    />
  );
}
