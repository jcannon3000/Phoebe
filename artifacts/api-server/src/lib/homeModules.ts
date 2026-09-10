/**
 * THE HOME MODULES — one list, because two copies of it drifted.
 *
 * A "home module" is a card the home screen can show, addressed by key in
 * `users.home_layout`'s `order` / `hidden`. Anything not on this list is
 * stripped by the layout sanitiser and by the prescribed-routine spec
 * sanitiser — which is exactly why a stale copy is dangerous rather than
 * merely untidy: a key missing here is silently deleted from a person's saved
 * layout, and `cleanHomeLayout`'s backfill cannot restore a key it does not
 * know about.
 *
 * It had already happened twice. `routes/prayer.ts` and
 * `lib/routineSpec.ts` each carried their own array, and routineSpec's was
 * missing six of the newsletter/inbox keys — so every prescribed routine,
 * group rule of life, creator season and snapshot restore quietly dropped
 * them for the adopter, landing them with no newsletter card at all. The
 * fix for `visio` and `prayer-list` in that file is a note about the same
 * bug one iteration earlier.
 *
 * ADD A HOME CARD, ADD IT HERE — and nowhere else on the server. The client
 * has its own list in `customize-home.tsx`; keep the two in step.
 */
export const HOME_MODULE_KEYS = [
  "office",
  "feeds",
  "contemplation",
  "listening",
  "reading",
  "walk",
  "cobreathe",
  "compline",
  "examen",
  "visio",
  // Praying with Icons — one icon a week, sat with daily.
  "icons",
  "lectio",
  // The Rosary — Roman mysteries or Anglican prayer beads, chosen in the deck.
  // Missing from this list until the 2026-09-07 audit, which is the bug this
  // file's header is about: the card was a real customizer option with a home
  // card and a weekly dot, and the layout sanitiser would have quietly dropped
  // it from any prescribed routine, group rule or restored snapshot.
  "rosary",
  // The inbox practices: they wait rather than expiring at midnight.
  "taize",
  // "Andrew's Version" — a weekly lectionary comment, kept as an inbox like
  // Taizé. Admin-only on the client for now.
  "andrews",
  "spirituals",
  /**
   * The day's commemoration — the life behind the feast, read at Forward
   * Movement (see lib/liturgical/forwardMovementCalendar.ts for why it is
   * their page and not our copy of the text).
   *
   * Conditional like Taizé and the weeklies: it draws a card only on days that
   * actually carry a commemoration, which is most but not all of the year.
   */
  "hagiography",
  // The reflection newsletters.
  "cac",
  "fdd",
  "ssje",
  "vts",
  "nouwen",
  "sojo",
  "grist",
  "ncmp",
  "podcasts",
  "requests",
  "prayer-list",
] as const;

export type HomeModuleKey = (typeof HOME_MODULE_KEYS)[number];
