import { useLocation } from "wouter";
import { MenuHub } from "@/components/MenuHub";

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
          { emoji: "🌿", label: "Season of Creation", sub: "A creation-focused devotion · Sep 1–Oct 4", onClick: () => go("/creation-devotion") },
          { emoji: "🌍", label: "Prayers for the Climate", sub: "Collects, prayers & words on creation", onClick: () => go("/creation-prayers") },
          { emoji: "📖", label: "Prayers", sub: "Intercessions & thanksgivings", onClick: () => go("/bcp/intercessions") },
          { emoji: "📜", label: "Psalter", sub: "The Psalms", onClick: () => go("/bcp/psalter") },
          { emoji: "🙏", label: "Collects", sub: "Prayers for the day & season", onClick: () => go("/bcp/collects") },
        ],
      }]}
    />
  );
}
