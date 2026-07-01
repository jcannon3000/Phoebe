import { MenuHub } from "@/components/MenuHub";
import { openExternal } from "@/lib/openExternal";
import { usePilotMode } from "@/hooks/usePilotMode";
import {
  CAC_TODAY_URL, FDD_TODAY_URL, SSJE_TODAY_URL,
  markCacRead, markFddRead, markSsjeRead,
} from "@/lib/cacReadState";

// Daily reflections from across the church. Each source opens via openExternal
// — the in-app browser on iOS, a new tab on web — with no inline reader and no
// return page. We still mark the source read so the Daily-progress "Reflect"
// anchor + home cards update. Select sound handled centrally by MenuHub.
export default function MenuReflectionsPage() {
  const { isPilot } = usePilotMode();
  const openFdd = () => { markFddRead(); openExternal(FDD_TODAY_URL, { reader: true }); };
  const openSsje = () => { markSsjeRead(); openExternal(SSJE_TODAY_URL, { reader: true }); };
  const openCac = () => { markCacRead(); openExternal(CAC_TODAY_URL, { reader: true }); };

  const items = [
    { emoji: "📔", label: "Forward Day by Day", sub: "Today's meditation from Forward Movement", onClick: openFdd },
    { emoji: "✍🏽", label: "SSJE Reflections", sub: "Today's Brother, Give Us a Word", onClick: openSsje },
    // CAC is trimmed in pilot.
    ...(!isPilot ? [{ emoji: "🌵", label: "CAC Daily Reflection", sub: "Center for Action & Contemplation", onClick: openCac }] : []),
  ];

  return (
    <MenuHub
      title="Reflections"
      emoji="🌅"
      subtitle="Today's reflections from across the church."
      backLabel="Menu"
      backHref="/menu"
      groups={[{ items }]}
    />
  );
}
