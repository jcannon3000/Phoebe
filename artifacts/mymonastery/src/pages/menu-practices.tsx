import { useLocation } from "wouter";
import { MenuHub } from "@/components/MenuHub";

// Simplified for everyone — the three core contemplative practices. (Audio
// Divina, Gratitude, and Examen are still reachable via their own surfaces;
// they're just no longer listed here.)
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
        ],
      }]}
    />
  );
}
