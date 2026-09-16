import { useLocation } from "wouter";
import { MenuHub, type MenuHubGroup } from "@/components/MenuHub";
import { OFFLINE_PRACTICES, useOnline } from "@/lib/offline";
import { usePracticeDirectory } from "@/lib/practiceDirectory";

// The core contemplative practices. (Gratitude is still reachable via its own
// surface; it's just not listed here.) The list itself — its order, its gates
// and why each row is there — lives in lib/practiceDirectory, which the home's
// Practices ticker reads too.
export default function MenuPracticesPage() {
  const [, setLocation] = useLocation();
  const practices = usePracticeDirectory();
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
  /**
   * ONE EVENLY SPACED LIST (owner, 2026-09-06: "on the practices page make
   * sure everything is spaced properly … don't have gaps").
   *
   * This was two groups — "Daily Office" over the first two rows, then an
   * UNLABELLED group holding everything else — and MenuHub puts 22px between
   * groups against 10px between rows, so the page had a wide, unexplained gap
   * in the middle under a header that named only part of what followed. The
   * rows read as one list now. The only headings on this page are the ones
   * that mean something: Available / Not available, when offline.
   */
  const hubGroups: MenuHubGroup[] = [{
    items: practices.map((p) => ({ offlineKey: p.offlineKey, emoji: p.emoji, label: p.label, sub: p.sub, onClick: () => go(p.href) })),
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
