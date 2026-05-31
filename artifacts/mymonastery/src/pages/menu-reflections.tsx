import { useLocation } from "wouter";
import { MenuHub } from "@/components/MenuHub";
import { openExternal } from "@/lib/openExternal";
import { CAC_TODAY_URL, markCacRead } from "@/lib/cacReadState";

// Daily reflections from across the church. "View all" opens a reader that
// flips through Forward Day by Day and SSJE inline, with a "Next" button that
// walks Forward → SSJE → CAC; CAC is last and opens in a new page (the in-app
// browser) since cac.org can't be embedded. The CAC card here opens that page
// directly. The select sound is handled centrally by MenuHub (the highest
// octave of the slideshow chime), matching the menu's pill → category → item
// ladder.
export default function MenuReflectionsPage() {
  const [, setLocation] = useLocation();
  const openReflection = (source: "fdd" | "ssje" | "all") =>
    setLocation(`/menu/reflections/${source}`);
  // CAC can't be embedded inline — open it in a new page (the in-app browser).
  const openCac = () => { markCacRead(); openExternal(CAC_TODAY_URL); };

  return (
    <MenuHub
      title="Reflections"
      emoji="🌅"
      subtitle="Today's reflections from across the church."
      backLabel="Menu"
      backHref="/menu"
      groups={[
        {
          items: [
            { emoji: "📖", label: "View all today's reflections", sub: "Flip through each of today's reflections in one place", onClick: () => openReflection("all") },
          ],
        },
        {
          header: "Or read one",
          items: [
            { emoji: "📔", label: "Forward Day by Day", sub: "Today's meditation from Forward Movement", onClick: () => openReflection("fdd") },
            { emoji: "✍🏽", label: "SSJE Reflections", sub: "Today's Brother, Give Us a Word", onClick: () => openReflection("ssje") },
            // CAC last — opens in a new page (can't be embedded inline).
            { emoji: "🌵", label: "CAC Daily Reflection", sub: "Center for Action & Contemplation", onClick: openCac },
          ],
        },
      ]}
    />
  );
}
