import { useEffect } from "react";
import { useLocation } from "wouter";
import { MenuHub } from "@/components/MenuHub";
import { playOpeningSwell } from "@/lib/amenFeedback";

// Daily reflections from across the church. A "View all" CTA opens a reader
// that flips through Forward Day by Day, SSJE, and CAC (CAC last — it can't be
// embedded inline, so it shows a "Read now" card there). Arriving here plays
// the lowest octave of the slideshow chime; selecting a reflection plays it an
// octave up.
export default function MenuReflectionsPage() {
  const [, setLocation] = useLocation();

  // Entering Reflections from the menu sounds the slideshow chime at its
  // lowest octave — a soft, grounded "you've arrived" tone.
  useEffect(() => {
    playOpeningSwell(0);
  }, []);

  // Selecting a reflection climbs an octave, then opens the reader.
  const openReflection = (source: "fdd" | "ssje" | "cac" | "all") => {
    playOpeningSwell(1);
    setLocation(`/menu/reflections/${source}`);
  };

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
