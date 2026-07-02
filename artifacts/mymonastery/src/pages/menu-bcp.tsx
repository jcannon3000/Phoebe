import { useLocation } from "wouter";
import { MenuHub } from "@/components/MenuHub";
import { CREATION_PRAYER_ENABLED } from "@/lib/creationFlag";

export default function MenuBcpPage() {
  const [, setLocation] = useLocation();
  const go = (p: string) => setLocation(p);
  return (
    <MenuHub
      title="Book of Common Prayer"
      emoji="📖"
      subtitle="The daily office, prayers, psalms, and collects."
      backLabel="Menu"
      backHref="/menu"
      groups={[{
        items: [
          { emoji: "🌅", label: "Daily Offices", sub: "Morning & Evening Prayer, devotions", onClick: () => go("/bcp/daily-office") },
          // Creation Prayer + Prayers for the Climate are hidden behind CREATION_PRAYER_ENABLED.
          ...(CREATION_PRAYER_ENABLED ? [
            { emoji: "🌱", label: "Creation Prayer", sub: "A creation-focused devotion, opening with Co-Breathe", onClick: () => go("/creation-devotion") },
            { emoji: "🌍", label: "Prayers for the Climate", sub: "Collects, prayers & words on creation", onClick: () => go("/creation-prayers") },
          ] : []),
          { emoji: "📖", label: "Prayers", sub: "Intercessions & thanksgivings", onClick: () => go("/bcp/intercessions") },
          { emoji: "📜", label: "Psalter", sub: "The Psalms", onClick: () => go("/bcp/psalter") },
          { emoji: "🙏", label: "Collects", sub: "Prayers for the day & season", onClick: () => go("/bcp/collects") },
        ],
      }]}
    />
  );
}
