import { useLocation } from "wouter";
import { MenuHub } from "@/components/MenuHub";
import { isNativeShell } from "@/lib/isNativeShell";

// Learn — the guided courses, as their own menu category (the drawer's Learn
// row and /menu's Learn group both land here). Centering Prayer and the deeper
// Spiritual Journey are YouTube video courses → WEB ONLY; The Way of Love
// (Bishop Budde) rides the podcast library, so it's the one course that also
// works on iOS. Open to everyone, guests included — courses are part of the
// light experience.
export default function MenuLearnPage() {
  const [, setLocation] = useLocation();
  const go = (p: string) => setLocation(p);
  return (
    <MenuHub
      title="Learn"
      emoji="🎓"
      subtitle="Guided courses in the life of prayer."
      backLabel="Menu"
      backHref="/menu"
      groups={[{
        items: [
          ...(!isNativeShell() ? [
            { emoji: "🕯️", label: "Centering Prayer", sub: "Learn the practice with Fr. Keating", onClick: () => go("/centering-prayer") },
            { emoji: "🎓", label: "The Spiritual Journey", sub: "Keating's full contemplative series", onClick: () => go("/journey") },
          ] : []),
          { emoji: "❤️", label: "The Way of Love", sub: "Bishop Budde on a rule of life", onClick: () => go("/way-of-love-course") },
        ],
      }]}
    />
  );
}
