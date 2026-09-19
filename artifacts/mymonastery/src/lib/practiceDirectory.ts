import { CREATION_PRAYER_ENABLED } from "@/lib/creationFlag";
import { useGuestMode } from "@/hooks/useGuestMode";
import { useAuth } from "@/hooks/useAuth";
import { isDeviceLocalGuest } from "@/lib/guestFlag";

// ── The practices, as one list ───────────────────────────────────────────────
//
// What the Practices page lists, in its order, behind its gates, read by that
// page's cards (pages/menu-practices). It was lifted out of the page for the
// home's Practices ticker (2026-09-16), since taken out by the owner ("Take
// out the practice ticker"); a surface that needs the practice list again
// reads it from here rather than keeping a copy that could disagree
// (reference_second_renderer_drift).

export interface PracticeEntry {
  /**
   * This practice's key in lib/offline's registry, when the registry carries
   * it. Offline, the Practices page sorts on THIS, never the label — see
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
    // ?begin=1 — the SIT, not its statistics (owner, 2026-09-18: "when you hit
    // contemplation from the practice page, go to that into page where the
    // routine card would take you, not the stats page"). Bare /contemplation
    // opens the history, goal and tabs; ?begin=1 is the focused slide the
    // rhythm card, the widget and the goal notification all open — length,
    // Start, and the Breathing Together pill. No ?sit here: from Practices
    // there is no side to take a length from, so their own default stands.
    { offlineKey: "contemplation", emoji: "🕯️", label: "Contemplation", sub: "Loving God in silence", href: "/contemplation?begin=1" },
    { offlineKey: "lectio", emoji: "📜", label: "Lectio Divina", sub: "Meditate on today's readings", href: "/lectio" },
    // Novenas hidden for all users per owner request (2026-08-07) — see
    // useRhythmState.ts's NOVENAS_ENABLED comment for why.
    { offlineKey: "examen", emoji: "🌗", label: "The Examen", sub: "Review the day with God", href: "/examen" },
    /**
     * PRAY AS YOU GO DAILY (owner, 2026-09-18: "Have pray as you ago availible
     * in practices as well", then "no we want it higher then the icons, like
     * after examen"). The Jesuits' daily session — music, a reading and
     * a few questions — played in Phoebe's own audio player, the same way its
     * reflection card opens it (pages/reflect-payg, [[project_payg_daily]]).
     *
     * NO offlineKey: it streams their audio, so with no connection it belongs
     * under "Not available" rather than being offered and failing. Open to
     * everyone, as the route itself is — their feed is public.
     */
    { emoji: "🙇🏽", label: "Pray As You Go Daily", sub: "A guided audio meditation on scripture", href: "/reflect/payg" },
    // PACT — Praise · Ask · Confess · Thanks. Side-less from here (no
    // ?side=), so it logs as a standalone practice rather than closing
    // out a morning/evening anchor.
    { offlineKey: "guided-prayer", emoji: "🙏🏽", label: "Simple Guided Prayer", sub: "Praise, ask, confess, give thanks", href: "/guided-prayer" },
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
     * ABOVE THE ROSARY (owner, 2026-09-18: "Move audio Divina above the
     * rosary"). It sat at the bottom of Practices before that.
     */
    ...(signedIn ? [
      { offlineKey: "listening", emoji: "🎧", label: "Audio Divina", sub: "Music as a way of prayer", href: "/listening" },
    ] : []),
    // BELOW VISIO (owner, 2026-09-18: "move the rosay bellow visio on the
    // practice page and option pages").
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
    // Praying with Icons — beside Visio because they share the same
    // catalogue, with the choice inverted: there the day picks the
    // image, here the person searches it out by name and sits with it
    // on a timer. Same guest posture as Visio for the same reasons —
    // the artworks and licences are public and completion is device-local.
    { emoji: "🪟", label: "Praying with Icons", sub: "Choose an icon and sit with it", href: "/icon-prayer" },
    /**
     * Sacred Image Doom Scroll — owner, 2026-09-18: "also have Sacred Image
     * Doom Scroll be a listed practice". It already had a ticker pill, whose
     * note said the Practices page had not been asked about; now it has.
     * Same door either way (/icon-prayer?gallery=1), so the two can't drift.
     * The name is the owner's, and it is the joke the practice is built on.
     */
    // Renamed Sacred Image Browser (owner, 2026-09-18: "Call the sacred image
    // scroll Sacred Image Browser"). The done screen still says "instead of doom
    // scrolling": that is what the practice is set against, not its name.
    { emoji: "🖼️", label: "Sacred Image Browser", sub: "Scroll through sacred images, and stay where one holds you", href: "/icon-prayer?gallery=1" },
    // NO SPIRITUALS ROW (owner, 2026-09-05: "take out reading and
    // spirituals from the practices ... both on the main practice page
    // and in the customizer"). The practice itself and /spirituals still
    // exist — see lib/spiritualsFlag.ts — but nothing links to it here.
    /**
     * Meditating on the lives of the saints (owner, 2026-09-18). A prompt, the
     * life read on Forward Movement's own page in the in-app reader, a moment
     * to pray with what it stirred, and the company you've been keeping.
     */
    // Named Hagiographies (owner, 2026-09-18: "Call the life of a saint practice
    // Haegriphoies") — spelled as the word, and as the home section heading
    // above the saints row already is.
    // AT THE BOTTOM (owner, 2026-09-18: "Move hagiographies to the bottom").
    { emoji: "🕯️", label: "Hagiographies", sub: "Read a life slowly, and let it ask something of yours", href: "/saints" },
  ];
}
