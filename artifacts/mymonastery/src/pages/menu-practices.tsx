import { useLocation } from "wouter";
import { MenuHub } from "@/components/MenuHub";
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
  return (
    <MenuHub
      title="Practices"
      emoji="🕯️"
      subtitle="Contemplative practices to weave through your day."
      backLabel="Menu"
      backHref="/menu"
      groups={[{
        header: "Daily Office",
        items: [
          // Daily Offices leads the list — also reachable from the BCP page
          // (menu.tsx → /menu/bcp), but Practices gets its own entry point too.
          { emoji: "📖", label: "Daily Offices", sub: "Morning Prayer, Evening Prayer, Compline", onClick: () => go("/bcp/daily-office") },
          // Quick link straight to Forward Movement's daily-readings page (the
          // day's appointed psalm + lessons) — NOT Forward Day by Day (owner
          // correction: this was wired to FDD_TODAY_URL at first, but Daily
          // Scripture Reading means the daily-readings page). A plain external
          // open, no read-tracking (that's the side-anchor Daily Scripture
          // Readings card's job, not this quick link's).
          { emoji: "📰", label: "Daily Scripture Reading", sub: "Today's appointed psalm & lessons", onClick: () => openExternal(getReadingsTodayUrl(), { reader: true }) },
        ],
      }, {
        items: [
          // Contemplation leads the rest of the list.
          { emoji: "🕯️", label: "Contemplation", sub: "Loving God in silence", onClick: () => go("/contemplation") },
          // Novenas hidden for all users per owner request (2026-08-07) — see
          // useRhythmState.ts's NOVENAS_ENABLED comment for why.
          { emoji: "🌗", label: "The Examen", sub: "Review the day with God", onClick: () => go("/examen") },
          // PACT — Praise · Ask · Confess · Thanks. Side-less from here (no
          // ?side=), so it logs as a standalone practice rather than closing
          // out a morning/evening anchor.
          { emoji: "🙏🏽", label: "Simple Guided Prayer", sub: "Praise, ask, confess, give thanks", onClick: () => go("/guided-prayer") },
          // Guided courses now live in their own "Learn" menu tab.
          { emoji: "🌍", label: "Creation Prayer", sub: "Breathing together with God's creation", onClick: () => go("/cobreathe") },
          // Prayers for the Climate sits at the bottom (behind CREATION_PRAYER_ENABLED).
          // The standalone "Creation Prayer" devotion was removed per owner.
          ...(CREATION_PRAYER_ENABLED && !isGuest ? [
            { emoji: "🌍", label: "Prayers for the Climate", sub: "Collects, prayers & words on creation", onClick: () => go("/creation-prayers") },
          ] : []),
          // Audio Divina sits at the BOTTOM of Practices (owner).
          ...(!isGuest ? [
            { emoji: "🎧", label: "Audio Divina", sub: "Music as a way of prayer", onClick: () => go("/listening") },
          ] : []),
        ],
      }]}
    />
  );
}
