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
  // The inbox practices: they wait rather than expiring at midnight.
  "taize",
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
