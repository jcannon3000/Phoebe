import { useLocation } from "wouter";
import { MenuHub } from "@/components/MenuHub";
import { CREATION_PRAYER_ENABLED } from "@/lib/creationFlag";

// The core contemplative practices. (Gratitude + Examen are still reachable via
// their own surfaces; they're just not listed here.)
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
          // Creation Prayer is hidden behind CREATION_PRAYER_ENABLED.
          ...(CREATION_PRAYER_ENABLED ? [
            { emoji: "🌱", label: "Creation Prayer", sub: "A creation-focused devotion, with Co-Breathe", onClick: () => go("/creation-devotion") },
          ] : []),
          { emoji: "📖", label: "Listen to Scripture", sub: "Hear the day's OT, Psalm, NT & Gospel", onClick: () => go("/scripture/readings") },
          { emoji: "🕯️", label: "Contemplation", sub: "A timer for silent prayer", onClick: () => go("/contemplation") },
          { emoji: "🎧", label: "Audio Divina", sub: "Music as a way of prayer", onClick: () => go("/listening") },
          { emoji: "🌍", label: "Co-Breathe", sub: "12 breaths as a prayer for climate justice", onClick: () => go("/cobreathe") },
        ],
      }]}
    />
  );
}
