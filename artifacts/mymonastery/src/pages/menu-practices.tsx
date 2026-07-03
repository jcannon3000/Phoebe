import { useLocation } from "wouter";
import { MenuHub } from "@/components/MenuHub";
import { CREATION_PRAYER_ENABLED } from "@/lib/creationFlag";
import { useGuestMode } from "@/hooks/useGuestMode";
import { isNativeShell } from "@/lib/isNativeShell";

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
          // Creation Prayer + its prayer library live HERE (owner: not in the
          // BCP menu), both behind CREATION_PRAYER_ENABLED.
          ...(CREATION_PRAYER_ENABLED && !isGuest ? [
            { emoji: "🌱", label: "Creation Prayer", sub: "A creation-focused devotion, with Co-Breathe", onClick: () => go("/creation-devotion") },
            { emoji: "🌍", label: "Prayers for the Climate", sub: "Collects, prayers & words on creation", onClick: () => go("/creation-prayers") },
          ] : []),
          { emoji: "📖", label: "Listen to Scripture", sub: "Hear the day's OT, Psalm, NT & Gospel", onClick: () => go("/scripture/readings") },
          { emoji: "🕯️", label: "Contemplation", sub: "Loving God in silence", onClick: () => go("/contemplation") },
          ...(!isGuest ? [
            { emoji: "🎧", label: "Audio Divina", sub: "Music as a way of prayer", onClick: () => go("/listening") },
          ] : []),
          // Guided courses (web only) — watched/listened like a class with units
          // + progress. Keating's Spiritual Journey (video) + Bishop Budde's Way
          // of Love (the podcast already in Phoebe).
          ...(!isGuest && !isNativeShell() ? [
            { emoji: "🎓", label: "The Spiritual Journey", sub: "A guided course on Centering Prayer", onClick: () => go("/journey") },
            { emoji: "❤️", label: "The Way of Love", sub: "Bishop Budde's course on a rule of life", onClick: () => go("/way-of-love-course") },
          ] : []),
          { emoji: "🌍", label: "Co-Breathe", sub: "12 breaths as a prayer for climate justice", onClick: () => go("/cobreathe") },
        ],
      }]}
    />
  );
}
