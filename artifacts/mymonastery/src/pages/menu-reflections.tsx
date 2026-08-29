import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MenuHub } from "@/components/MenuHub";
import { openExternal, openExternalThenMarkRead } from "@/lib/openExternal";
import { apiRequest } from "@/lib/queryClient";
import { markInboxRead, type InboxItem } from "@/lib/taizeInbox";
import {
  CAC_TODAY_URL, FDD_TODAY_URL, SSJE_TODAY_URL, VTS_TODAY_URL,
  NOUWEN_TODAY_URL, GRIST_TODAY_URL, sojournersTodayUrl,
  markCacRead, markFddRead, markSsjeRead, markVtsRead,
  markNouwenRead, markSojoRead, markGristRead,
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
  const [, setLocation] = useLocation();
  const openFdd = () => { markFddRead(); openExternal(FDD_TODAY_URL, { reader: true }); };
  const openSsje = () => { markSsjeRead(); openExternal(SSJE_TODAY_URL, { reader: true }); };
  const openCac = () => { markCacRead(); openExternal(CAC_TODAY_URL, { reader: true }); };
  /**
   * THE DEAN'S COMMENTARY OPENS ITS OWN SLIDESHOW (owner: "from the reflection
   * page it should be opening the deans comentary slideshow").
   *
   * /vts-reading has existed all along — an in-app reader, one paragraph per
   * slide, built to match the office deck — and this row was sending people to
   * the web page instead, so the one reflection we DO present ourselves was
   * the one you never saw presented. The read is still marked from here, so
   * the home card settles whichever way you arrive.
   */
  const openVts = () => { markVtsRead(); setLocation("/vts-reading"); };
  // These three now MARK READ like the rest. They are trackable sources as of
  // the customizer work — a reflection someone can put in their rhythm has to
  // record having been read, or the card they chose never settles.
  const openNouwen = () => { markNouwenRead(); openExternal(NOUWEN_TODAY_URL, { reader: true }); };
  const openSojo = () => { markSojoRead(); openExternal(sojournersTodayUrl(), { reader: true }); };
  const openGrist = () => { markGristRead(); openExternal(GRIST_TODAY_URL, { reader: true }); };

  /**
   * THE THREE WEEKLIES ARE HERE TOO, not only in the customizer.
   *
   * Owner, looking for one of them: "WHERE IS TAIZE" — and then "make what is
   * build visable". They were built as INBOX PRACTICES, which you turn on in
   * the customizer and then meet on the home screen; that is still what they
   * are, and this does not change anyone's rhythm. But a thing you can only
   * reach by first deciding to adopt it is a thing most people never see. So
   * each also gets a row here, where every other reading already lives, and
   * opening one from here marks it read exactly as the card would — the two
   * surfaces cannot disagree about whether this week's has been read.
   *
   * The latest item is fetched only when this page is open. If the fetch fails
   * or nothing is published, the row still opens the publication's own index
   * rather than dead-ending.
   */
  const weekly = (path: string) => useQuery<InboxItem | null>({
    queryKey: [path],
    queryFn: async () => (await apiRequest("GET", path)) ?? null,
    staleTime: 30 * 60_000,
  });
  const taize = weekly("/api/taize/latest");
  const chittister = weekly("/api/chittister/latest");
  const cathedral = weekly("/api/cathedral-sermons/latest");

  const openWeekly = (
    source: "taize" | "chittister" | "cathedral",
    item: InboxItem | null | undefined,
    fallbackUrl: string,
  ) => () => {
    if (!item?.url) { openExternal(fallbackUrl, { reader: true }); return; }
    openExternalThenMarkRead(item.url, () => markInboxRead(source, item.id), { reader: true });
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
          // ONE section, not two. The split put a rule and a gap above Henri
          // Nouwen for no reason a reader could see — these are seven of the
          // same kind of thing, and a divider implies a distinction that isn't
          // there. Owner: "there shouldnt be a gap above henri nouwen."
          items: [
            { emoji: "🌵", label: "CAC Daily Reflection", sub: "Center for Action & Contemplation", onClick: openCac },
            { emoji: "📔", label: "Forward Day by Day", sub: "Today's meditation from Forward Movement", onClick: openFdd },
            { emoji: "🕊️", label: "Sojourner's Voice and Verse", sub: "Verse, voice and prayer of the day · Sojourners", onClick: openSojo },
            { emoji: "✍🏽", label: "SSJE Reflections", sub: "Today's Brother, Give Us a Word", onClick: openSsje },
            { emoji: "😊", label: "Daily Henri Nouwen Quotes", sub: "From the Henri Nouwen Society", onClick: openNouwen },
            { emoji: "🌎", label: "Grist Climate News", sub: "The day's climate reporting", onClick: openGrist },
            // The weeklies. Their subtitle names THIS week's piece when we
            // know it, which is the honest label — "waits until you've read
            // it" is the card's job, not a menu row's.
            {
              emoji: "🕯️", label: "Taizé meditation",
              sub: taize.data?.title ?? "The newest meditation from Taizé",
              onClick: openWeekly("taize", taize.data, "https://www.taize.fr/en/tag/meditations"),
            },
            {
              emoji: "🌾", label: "Vision and Viewpoint",
              sub: chittister.data?.title ?? "Joan Chittister's weekly",
              onClick: openWeekly("chittister", chittister.data, "https://www.joanchittister.org/pages/newsletters"),
            },
            {
              emoji: "⛪", label: "National Cathedral sermon",
              sub: cathedral.data?.title ?? "Washington National Cathedral",
              onClick: openWeekly("cathedral", cathedral.data, "https://cathedral.org/sermons/"),
            },
            { emoji: "🦩", label: "VTS Dean's Commentary", sub: "Virginia Theological Seminary", onClick: openVts },
          ],
        },
      ]}
    />
  );
}
