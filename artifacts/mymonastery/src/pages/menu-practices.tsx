import { useLocation } from "wouter";
import { MenuHub } from "@/components/MenuHub";
import { CREATION_PRAYER_ENABLED } from "@/lib/creationFlag";
import { useGuestMode } from "@/hooks/useGuestMode";

// The core contemplative practices. (Gratitude + Examen are still reachable via
// their own surfaces; they're just not listed here.)
export default function MenuPracticesPage() {
  const [, setLocation] = useLocation();
  // PUBLIC no-login version: guests keep exactly Listen to Scripture ·
  // Contemplation · Co-Breathe — no Audio Divina anywhere in the public
  // version (owner re-reversal 2026-07-02), and Creation Prayer stays behind
  // its own flag. See memory "project_public_no_login".
  const { isGuest } = useGuestMode();
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
          // Contemplation leads the list.
          { emoji: "🕯️", label: "Contemplation", sub: "Loving God in silence", onClick: () => go("/contemplation") },
          { emoji: "📖", label: "Listen to Scripture", sub: "Hear the day's OT, Psalm, NT & Gospel", onClick: () => go("/scripture/readings") },
          { emoji: "👟", label: "Daily steps", sub: "Walk toward a step goal, counted from Apple Health", onClick: () => go("/daily-steps") },
          ...(!isGuest ? [
            { emoji: "🎧", label: "Audio Divina", sub: "Music as a way of prayer", onClick: () => go("/listening") },
          ] : []),
          // Guided courses now live in their own "Learn" menu tab.
          { emoji: "🌍", label: "Creation Prayer", sub: "12 breaths, a prayer with all creation", onClick: () => go("/cobreathe") },
          // Prayers for the Climate sits at the bottom (behind CREATION_PRAYER_ENABLED).
          // The standalone "Creation Prayer" devotion was removed per owner.
          ...(CREATION_PRAYER_ENABLED && !isGuest ? [
            { emoji: "🌍", label: "Prayers for the Climate", sub: "Collects, prayers & words on creation", onClick: () => go("/creation-prayers") },
          ] : []),
        ],
      }]}
    />
  );
}
