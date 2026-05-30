import { useLocation } from "wouter";
import { MenuHub } from "@/components/MenuHub";

// Daily reflections from across the church. "View all" opens a reader that
// flips through Forward Day by Day, SSJE, and CAC (CAC last — it can't be
// embedded inline, so it shows a "Read now" card there). The select sound is
// handled centrally by MenuHub (the highest octave of the slideshow chime),
// matching the menu's pill → category → item ladder.
export default function MenuReflectionsPage() {
  const [, setLocation] = useLocation();
  const openReflection = (source: "fdd" | "ssje" | "cac" | "all") =>
    setLocation(`/menu/reflections/${source}`);

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
            // CAC last — it can't be embedded inline (cac.org sends X-Frame-Options).
            { emoji: "🌵", label: "CAC Daily Reflection", sub: "Center for Action & Contemplation", onClick: () => openReflection("cac") },
          ],
        },
      ]}
    />
  );
}
