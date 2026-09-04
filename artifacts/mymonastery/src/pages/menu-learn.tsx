import { useLocation } from "wouter";
import { MenuHub } from "@/components/MenuHub";
import { isNativeShell } from "@/lib/isNativeShell";
import { useBetaStatus } from "@/hooks/useDemo";
import { useCacLibrary } from "@/hooks/useCacLibrary";

// Learn — the guided courses, as their own menu category (the drawer's Learn
// row and /menu's Learn group both land here). Centering Prayer and the deeper
// Spiritual Journey are YouTube video courses → WEB ONLY; The Way of Love
// (Bishop Budde) rides the podcast library, so it's the one course that also
// works on iOS. Open to everyone, guests included — courses are part of the
// light experience.
export default function MenuLearnPage() {
  const [, setLocation] = useLocation();
  const go = (p: string) => setLocation(p);
  /**
   * CAC Courses sits here for ADMINS (owner: "i want admins to see CAC courses
   * under learn like the way of love").
   *
   * Gated on exactly the same test /cac-courses itself uses to admit a visitor
   * — its own guard is `if (!isBeta && !isAdmin)`. Deliberately the SAME
   * expression rather than a similar one: a row shown more widely than the
   * page admits is a row that bounces people into a "not open yet" screen, and
   * a row shown less widely hides a feature from someone who can use it. If
   * that guard is ever widened, widen it here in the same change.
   *
   * It rides CAC's podcast feeds, so — like The Way of Love, and unlike the two
   * YouTube courses above — it works on iOS as well as web, and needs no
   * isNativeShell() branch.
   */
  const { isAdmin } = useBetaStatus();
  // Pilot groups too — the SAME test the three CAC pages use to admit a
  // visitor, so this row is never offered to someone they turn away.
  const { enabled: cacLibraryGranted } = useCacLibrary();
  return (
    <MenuHub
      title="Learn"
      emoji="🎓"
      subtitle="Guided courses in the life of prayer."
      backLabel="Menu"
      backHref="/menu"
      groups={[{
        items: [
          ...(!isNativeShell() ? [
            { emoji: "🕯️", label: "Centering Prayer", sub: "Learn the practice with Fr. Keating", onClick: () => go("/centering-prayer") },
            { emoji: "🎓", label: "The Spiritual Journey", sub: "Keating's full contemplative series", onClick: () => go("/journey") },
          ] : []),
          { emoji: "❤️", label: "The Way of Love", sub: "Bishop Budde on a rule of life", onClick: () => go("/way-of-love-course") },
          // The reading topics (/learn) had no row here at all — the page was
          // reachable only from the features deck. Admin-only for now because
          // the sermon it currently carries is.
          ...(isAdmin ? [
            { emoji: "📖", label: "Readings", sub: "Short pieces to read a slide at a time", onClick: () => go("/learn") },
          ] : []),
          ...(isAdmin || cacLibraryGranted ? [
            { emoji: "🌵", label: "CAC Courses", sub: "Rohr, Finley and McLaren — a season at a time", onClick: () => go("/cac-courses") },
          ] : []),
        ],
      }]}
    />
  );
}
