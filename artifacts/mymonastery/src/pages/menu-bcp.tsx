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
          // Creation Prayer AND its Prayers-for-the-Climate library live under
          // PRACTICES (owner, 2026-07-03) — nothing creation in the BCP menu.
          { emoji: "📖", label: "Prayers", sub: "Intercessions & thanksgivings", onClick: () => go("/bcp/intercessions") },
          { emoji: "📜", label: "Psalter", sub: "The Psalms", onClick: () => go("/bcp/psalter") },
          { emoji: "🙏", label: "Collects", sub: "Prayers for the day & season", onClick: () => go("/bcp/collects") },
        ],
      }]}
    />
  );
}
