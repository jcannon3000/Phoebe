import { MenuHub } from "@/components/MenuHub";
import {
  CAC_TODAY_URL, FDD_TODAY_URL, SSJE_TODAY_URL,
  markCacRead, markFddRead, markSsjeRead,
} from "@/lib/cacReadState";

// Daily reflections from across the church. Each source opens in a NEW TAB —
// no in-app inline reader and no return page (per request). We still mark the
// source read so the Daily-progress "Reflect" anchor + home cards update.
// The select sound is handled centrally by MenuHub.
export default function MenuReflectionsPage() {
  const openNewTab = (url: string) => window.open(url, "_blank", "noopener,noreferrer");
  const openFdd = () => { markFddRead(); openNewTab(FDD_TODAY_URL); };
  const openSsje = () => { markSsjeRead(); openNewTab(SSJE_TODAY_URL); };
  const openCac = () => { markCacRead(); openNewTab(CAC_TODAY_URL); };

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
            { emoji: "📔", label: "Forward Day by Day", sub: "Today's meditation from Forward Movement", onClick: openFdd },
            { emoji: "✍🏽", label: "SSJE Reflections", sub: "Today's Brother, Give Us a Word", onClick: openSsje },
            { emoji: "🌵", label: "CAC Daily Reflection", sub: "Center for Action & Contemplation", onClick: openCac },
          ],
        },
      ]}
    />
  );
}
