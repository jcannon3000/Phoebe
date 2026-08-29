import { MenuHub } from "@/components/MenuHub";
import { openExternal } from "@/lib/openExternal";
import {
  CAC_TODAY_URL, FDD_TODAY_URL, SSJE_TODAY_URL, VTS_TODAY_URL,
  NOUWEN_TODAY_URL, GRIST_TODAY_URL, sojournersTodayUrl,
  markCacRead, markFddRead, markSsjeRead, markVtsRead,
} from "@/lib/cacReadState";

// Daily reflections from across the church. Each source opens via openExternal
// — the in-app browser on iOS, a new tab on web — with no inline reader and no
// return page. We still mark the source read so the Daily-progress "Reflect"
// anchor + home cards update. Select sound handled centrally by MenuHub.
//
// TWO KINDS OF ROW HERE, and the difference matters.
//
// The first four are TRACKED sources: they have a day-flag, they satisfy the
// Reflect anchor, and marking them read is what makes the home card tick. The
// Dean's Commentary was already one of those in every respect except that it
// had no row on this page — the owner asked for it and it was a one-line
// omission, not a feature.
//
// The last three are LINKS. The owner asked for each of them ("include the
// Henri Nouwen Daily meditation just like SSJE", Sojourners' Voice and Verse,
// Grist's daily) and each has a reader view built for it, but none of them has
// a tracker, so opening one counts toward nothing. That is deliberate for now:
// a source that ticks the Reflect anchor needs a tracker, a server read-log
// and a slot in the customizer, and inventing day-flags for three sources at
// once is how a practice ends up counted twice. They read; they don't score.
export default function MenuReflectionsPage() {
  const openFdd = () => { markFddRead(); openExternal(FDD_TODAY_URL, { reader: true }); };
  const openSsje = () => { markSsjeRead(); openExternal(SSJE_TODAY_URL, { reader: true }); };
  const openCac = () => { markCacRead(); openExternal(CAC_TODAY_URL, { reader: true }); };
  const openVts = () => { markVtsRead(); openExternal(VTS_TODAY_URL, { reader: true }); };
  const openNouwen = () => openExternal(NOUWEN_TODAY_URL, { reader: true });
  const openSojo = () => openExternal(sojournersTodayUrl(), { reader: true });
  const openGrist = () => openExternal(GRIST_TODAY_URL, { reader: true });

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
            { emoji: "🏛️", label: "Dean's Commentary", sub: "Virginia Theological Seminary", onClick: openVts },
          ],
        },
        {
          items: [
            { emoji: "🕊️", label: "Daily Henri Nouwen Quotes", sub: "From the Henri Nouwen Society", onClick: openNouwen },
            { emoji: "📣", label: "Voice and Verse", sub: "Verse, voice and prayer of the day · Sojourners", onClick: openSojo },
            { emoji: "🌍", label: "Grist", sub: "The day's climate journalism", onClick: openGrist },
          ],
        },
      ]}
    />
  );
}
