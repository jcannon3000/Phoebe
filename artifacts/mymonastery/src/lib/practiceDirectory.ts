import { CREATION_PRAYER_ENABLED } from "@/lib/creationFlag";
import { useGuestMode } from "@/hooks/useGuestMode";
import { useAuth } from "@/hooks/useAuth";
import { isDeviceLocalGuest } from "@/lib/guestFlag";

// ── The practices, as one list ───────────────────────────────────────────────
//
// What the Practices page lists, in its order, behind its gates. Two surfaces
// read it: that page's cards (pages/menu-practices) and the home's Practices
// ticker (components/HomePracticesSection, owner 2026-09-16). Neither keeps a
// copy, so a practice added, moved or hidden from guests here changes both —
// a second list would be one more place for them to disagree
// (reference_second_renderer_drift).

export interface PracticeEntry {
  /**
   * This practice's key in lib/offline's registry, when the registry carries
   * it. Offline, both surfaces sort on THIS, never the label — see
   * MenuHubItem.offlineKey for why titles can't be the contract.
   */
  offlineKey?: string;
  emoji: string;
  label: string;
  sub: string;
  href: string;
}

export function usePracticeDirectory(): PracticeEntry[] {
  // PUBLIC no-login version: guests keep exactly Contemplation · Co-Breathe —
  // no Audio Divina anywhere in the public version (owner re-reversal
  // 2026-07-02), and Breathing Together stays behind its own flag. See memory
  // "project_public_no_login".
  const { isGuest } = useGuestMode();
  const { user } = useAuth();
  // Signed in = a real account. A device-local guest has a provisioned
  // anonymous user, which is not one.
  const signedIn = !isDeviceLocalGuest(user);
  return [
    // Daily Offices leads the list — also reachable from the BCP page
    // (menu.tsx → /menu/bcp), but Practices gets its own entry point too.
    { offlineKey: "office", emoji: "📖", label: "Daily Offices", sub: "Morning, Midday and Evening Prayer, Compline", href: "/bcp/daily-office" },
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
    { offlineKey: "scripture", emoji: "📰", label: "Daily Scripture Reading", sub: "Today's appointed psalm & lessons", href: "/bcp/daily-office?mode=scripture" },
    // Owner: put Lectio Divina under Scripture Reading — same
    // lectionary source (today's Old Testament / New Testament /
    // Gospel), a different, slower way to sit with one of them.
    // Contemplation leads the rest of the list.
    { offlineKey: "contemplation", emoji: "🕯️", label: "Contemplation", sub: "Loving God in silence", href: "/contemplation" },
    { offlineKey: "lectio", emoji: "📜", label: "Lectio Divina", sub: "Meditate on today's readings", href: "/lectio" },
    // Novenas hidden for all users per owner request (2026-08-07) — see
    // useRhythmState.ts's NOVENAS_ENABLED comment for why.
    { offlineKey: "examen", emoji: "🌗", label: "The Examen", sub: "Review the day with God", href: "/examen" },
    // PACT — Praise · Ask · Confess · Thanks. Side-less from here (no
    // ?side=), so it logs as a standalone practice rather than closing
    // out a morning/evening anchor.
    { offlineKey: "guided-prayer", emoji: "🙏🏽", label: "Simple Guided Prayer", sub: "Praise, ask, confess, give thanks", href: "/guided-prayer" },
    // The Rosary — a guided walk through a set of mysteries, on Simple
    // Guided Prayer's own recipe. Open to everyone (owner). Sits beside
    // PACT because it is the same kind of thing: a shaped prayer you are
    // walked through rather than a reading.
    //
    // Its offline key was missing: lib/offline's registry has carried the
    // Rosary as bundled since aeb89d8c (2026-09-07), a day after this list
    // learned to split offline, so the Practices page filed it under "Not
    // available" while /offline listed it as kept.
    { offlineKey: "rosary", emoji: "📿", label: "The Rosary", sub: "Pray the mysteries, a decade at a time", href: "/rosary" },
    // Guided courses now live in their own "Learn" menu tab.
    { offlineKey: "cobreathe", emoji: "🌍", label: "Breathing Together", sub: "Breathing together with God's creation", href: "/cobreathe" },
    // Prayers for the Climate sits at the bottom (behind CREATION_PRAYER_ENABLED).
    // The standalone "Breathing Together" devotion was removed per owner.
    ...(CREATION_PRAYER_ENABLED && !isGuest ? [
      { emoji: "🌍", label: "Prayers for the Climate", sub: "Collects, prayers & words on creation", href: "/creation-prayers" },
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
    { offlineKey: "visio", emoji: "🖼️", label: "Visio Divina", sub: "Pray with the day's image, slowly", href: "/visio" },
    // Praying with Icons — beside Visio because they share the same
    // catalogue, with the choice inverted: there the day picks the
    // image, here the person searches it out by name and sits with it
    // on a timer. Same guest posture as Visio for the same reasons —
    // the artworks and licences are public and completion is device-local.
    { emoji: "🪟", label: "Praying with Icons", sub: "Choose an icon and sit with it", href: "/icon-prayer" },
    // NO SPIRITUALS ROW (owner, 2026-09-05: "take out reading and
    // spirituals from the practices ... both on the main practice page
    // and in the customizer"). The practice itself and /spirituals still
    // exist — see lib/spiritualsFlag.ts — but nothing links to it here.
    /**
     * EVERY SIGNED-IN PERSON SEES IT (owner, 2026-09-06: "I want all
     * signed in users to see it"). The gate was `!isGuest`, and the
     * public shape covers every ordinary account — so this row reached
     * pilot-group members and super admins only, which is not what
     * "not in the public version" was meant to mean. The no-login
     * version still doesn't carry it (owner, 2026-07-02), and that is
     * what `signedIn` now says: an anonymous device user is not an
     * account. /listening itself was never gated.
     *
     * Audio Divina sits at the BOTTOM of Practices (owner).
     */
    ...(signedIn ? [
      { offlineKey: "listening", emoji: "🎧", label: "Audio Divina", sub: "Music as a way of prayer", href: "/listening" },
    ] : []),
  ];
}
