import { useLocation } from "wouter";
import { MenuHub } from "@/components/MenuHub";
import { openExternal } from "@/lib/openExternal";

export default function MenuResourcesPage() {
  const [, setLocation] = useLocation();
  const go = (p: string) => setLocation(p);
  return (
    <MenuHub
      title="Resources"
      emoji="📚"
      subtitle="Reference surfaces for the wider church."
      backLabel="Menu"
      backHref="/menu"
      groups={[{
        items: [
          { emoji: "📅", label: "Sunday Lectionary", sub: "This Sunday's readings", onClick: () => openExternal("https://withphoebe.app/api/lectionary/today") },
          { emoji: "⛪", label: "Find a Church", sub: "The Episcopal Church's parish finder", onClick: () => openExternal("https://www.episcopalchurch.org/find-a-church/") },
          { emoji: "😇", label: "Saints", badge: "Beta", sub: "A browsable index", onClick: () => go("/saints") },
          { emoji: "📰", label: "Building Faith", sub: "Formation articles", onClick: () => go("/building-faith") },
        ],
      }]}
    />
  );
}
