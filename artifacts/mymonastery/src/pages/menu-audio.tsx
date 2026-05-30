import { useLocation } from "wouter";
import { MenuHub } from "@/components/MenuHub";

export default function MenuAudioPage() {
  const [, setLocation] = useLocation();
  const go = (p: string) => setLocation(p);
  return (
    <MenuHub
      title="Audio"
      emoji="🎧"
      subtitle="Everything to listen to, in one place."
      backLabel="Menu"
      backHref="/menu"
      groups={[{
        items: [
          { emoji: "🌅", label: "Morning Prayer", sub: "The office read aloud", onClick: () => go("/podcast/morning-office") },
          { emoji: "🌙", label: "Evening Prayer", sub: "The office read aloud", onClick: () => go("/podcast/evening-office") },
          { emoji: "🎙️", label: "Podcasts", sub: "The full library", onClick: () => go("/podcasts") },
          { emoji: "🕯️", label: "Reflect & Sit", sub: "Today's reflection, then silence", onClick: () => go("/reflect/fdd") },
        ],
      }]}
    />
  );
}
