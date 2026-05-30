import { MenuHub } from "@/components/MenuHub";
import { openExternal } from "@/lib/openExternal";
import {
  FDD_TODAY_URL, markFddRead,
  CAC_TODAY_URL, markCacRead,
  SSJE_TODAY_URL, markSsjeRead,
} from "@/lib/cacReadState";

// Daily external readings. Each opens in the in-app browser and stamps today
// as read so the matching home card flips to "Read again."
export default function MenuReflectionsPage() {
  return (
    <MenuHub
      title="Reflections"
      emoji="🌅"
      subtitle="Today's reflections from across the church."
      backLabel="Menu"
      backHref="/menu"
      groups={[{
        items: [
          { emoji: "📔", label: "Forward Day by Day", sub: "Today's meditation from Forward Movement", onClick: () => { markFddRead(); openExternal(FDD_TODAY_URL); } },
          { emoji: "🌵", label: "CAC Daily Reflection", sub: "Center for Action & Contemplation", onClick: () => { markCacRead(); openExternal(CAC_TODAY_URL); } },
          { emoji: "✍🏽", label: "SSJE Reflections", sub: "Today's Brother, Give Us a Word", onClick: () => { markSsjeRead(); openExternal(SSJE_TODAY_URL); } },
        ],
      }]}
    />
  );
}
