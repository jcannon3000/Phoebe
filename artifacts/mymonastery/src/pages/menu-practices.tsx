import { useLocation } from "wouter";
import { MenuHub, type MenuHubGroup } from "@/components/MenuHub";
import { OFFLINE_PRACTICES, useOnline } from "@/lib/offline";
import { CREATION_PRAYER_ENABLED } from "@/lib/creationFlag";
import { useGuestMode } from "@/hooks/useGuestMode";
import { getReadingsTodayUrl } from "@/lib/cacReadState";
import { openExternal } from "@/lib/openExternal";

// The core contemplative practices. (Gratitude is still reachable via its own
// surface; it's just not listed here.)
export default function MenuPracticesPage() {
  const [, setLocation] = useLocation();
  // PUBLIC no-login version: guests keep exactly Contemplation · Co-Breathe —
  // no Audio Divina anywhere in the public version (owner re-reversal
  // 2026-07-02), and Creation Prayer stays behind its own flag. See memory
  // "project_public_no_login".
  const { isGuest } = useGuestMode();
  const go = (p: string) => setLocation(p);
  /**
   * OFFLINE, THE LIST SPLITS IN TWO (owner, 2026-09-06: "on the practices page
   * let's do two sections when it's offline, for available and not available").
   *
   * Which is which comes from lib/offline's registry — the same list the home's
   * "Not available" section and /offline read — so the three surfaces cannot
   * drift apart. A row whose practice the registry doesn't carry needs the
   * network: the climate prayers and the icon catalogue are both fetched.
   *
   * Matched on the registry KEY each row carries, never on its title: titles
   * are copy the owner edits by feel, and a rename would silently empty this
   * list with nothing failing anywhere.
   */
  const online = useOnline();
  const savedKeys = new Set(OFFLINE_PRACTICES.map((p) => p.key));
  const splitForOffline = (groups: MenuHubGroup[]): MenuHubGroup[] => {
    const all = groups.flatMap((g) => g.items);
    const saved = (i: { offlineKey?: string }) => !!i.offlineKey && savedKeys.has(i.offlineKey);
    const available = all.filter(saved);
    const missing = all.filter((i) => !saved(i));
    return [
      ...(available.length ? [{ header: "Available", items: available }] : []),
      ...(missing.length ? [{ header: "Not available", items: missing }] : []),
    ];
  };
  const hubGroups: MenuHubGroup[] = [{
        header: "Daily Office",
        items: [
          // Daily Offices leads the list — also reachable from the BCP page
          // (menu.tsx → /menu/bcp), but Practices gets its own entry point too.
          { offlineKey: "office", emoji: "📖", label: "Daily Offices", sub: "Morning Prayer, Evening Prayer, Compline", onClick: () => go("/bcp/daily-office") },
          // Quick link straight to Forward Movement's daily-readings page (the
          // day's appointed psalm + lessons) — NOT Forward Day by Day (owner
          // correction: this was wired to FDD_TODAY_URL at first, but Daily
          // Scripture Reading means the daily-readings page). A plain external
          // open, no read-tracking (that's the side-anchor Daily Scripture
          // Readings card's job, not this quick link's).
          // Owner: a slideshow rather than a link out — the psalms said in
          // full first, then the three lessons, each opening in the reader.
          // (It was a plain external open of Forward Movement's readings page;
          // that page is still what the lessons themselves open into.)
          { offlineKey: "scripture", emoji: "📰", label: "Daily Scripture Reading", sub: "Today's appointed psalm & lessons", onClick: () => go("/bcp/daily-office?mode=scripture") },
          // Owner: put Lectio Divina under Scripture Reading — same
          // lectionary source (today's Old Testament / New Testament /
          // Gospel), a different, slower way to sit with one of them.
        ],
      }, {
        items: [
          // Contemplation leads the rest of the list.
          { offlineKey: "contemplation", emoji: "🕯️", label: "Contemplation", sub: "Loving God in silence", onClick: () => go("/contemplation") },
          { offlineKey: "lectio", emoji: "📜", label: "Lectio Divina", sub: "Meditate on today's readings", onClick: () => go("/lectio") },
          // Novenas hidden for all users per owner request (2026-08-07) — see
          // useRhythmState.ts's NOVENAS_ENABLED comment for why.
          { offlineKey: "examen", emoji: "🌗", label: "The Examen", sub: "Review the day with God", onClick: () => go("/examen") },
          // PACT — Praise · Ask · Confess · Thanks. Side-less from here (no
          // ?side=), so it logs as a standalone practice rather than closing
          // out a morning/evening anchor.
          { offlineKey: "guided-prayer", emoji: "🙏🏽", label: "Simple Guided Prayer", sub: "Praise, ask, confess, give thanks", onClick: () => go("/guided-prayer") },
          // Guided courses now live in their own "Learn" menu tab.
          { offlineKey: "cobreathe", emoji: "🌍", label: "Creation Prayer", sub: "Breathing together with God's creation", onClick: () => go("/cobreathe") },
          // Prayers for the Climate sits at the bottom (behind CREATION_PRAYER_ENABLED).
          // The standalone "Creation Prayer" devotion was removed per owner.
          ...(CREATION_PRAYER_ENABLED && !isGuest ? [
            { emoji: "🌍", label: "Prayers for the Climate", sub: "Collects, prayers & words on creation", onClick: () => go("/creation-prayers") },
          ] : []),
          // Visio Divina — the looking sibling of Audio Divina, beside it.
          //
          // NO GUEST GATE (owner: "Visio Divina should be available to users
          // without an account and everyone"). Nothing in the practice needs
          // one: the artwork and its licence are public, the lectionary fetch
          // falls back to praying without it, and completion is a local flag
          // whose server write already treats a 401 as "signed-out guest, no
          // sync to do". The gate was also far wider than it read — isGuest is
          // true for any signed-in non-beta account, so this row was hidden
          // from nearly everyone, not just visitors without an account.
          { offlineKey: "visio", emoji: "🖼️", label: "Visio Divina", sub: "Pray with the day's image, slowly", onClick: () => go("/visio") },
          // Praying with Icons — beside Visio because they share the same
          // catalogue, with the choice inverted: there the day picks the
          // image, here the person searches it out by name and sits with it
          // on a timer. Same guest posture as Visio for the same reasons —
          // the artworks and licences are public and completion is device-local.
          { emoji: "🪟", label: "Praying with Icons", sub: "Choose an icon and sit with it", onClick: () => go("/icon-prayer") },
          // NO SPIRITUALS ROW (owner, 2026-09-05: "take out reading and
          // spirituals from the practices ... both on the main practice page
          // and in the customizer"). The practice itself and /spirituals still
          // exist — see lib/spiritualsFlag.ts — but nothing links to it here.
          // Audio Divina sits at the BOTTOM of Practices (owner).
          ...(!isGuest ? [
            { offlineKey: "listening", emoji: "🎧", label: "Audio Divina", sub: "Music as a way of prayer", onClick: () => go("/listening") },
          ] : []),
        ],
      }];
  return (
    <MenuHub
      title="Practices"
      emoji="🕯️"
      subtitle="Contemplative practices to weave through your day."
      backLabel="Menu"
      backHref="/menu"
      groups={online ? hubGroups : splitForOffline(hubGroups)}
    />
  );
}
