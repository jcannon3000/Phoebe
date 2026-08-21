// Venite (venite.app) — a third-party BCP office reader. Offered as a "way to
// pray" alongside the digital slideshow, the physical book, Listen and Watch:
// picking it hands the office off to Venite in the browser instead of praying
// it in a Phoebe surface.
//
// URL shape (verified against the live site for today's date):
//   /pray/{lang}/{rite}/{version}/{yyyy}/{m}/{d}/{office}/{alt}/{options}
//
// Notes that matter, each confirmed rather than assumed:
//   • Month and day are NOT zero-padded — "2026/8/21", not "2026/08/21".
//   • The date is the reader's LOCAL calendar day. Deriving it from a UTC
//     timestamp would hand someone west of UTC yesterday's office late at
//     night, which is exactly the drift the office assembler already guards
//     against elsewhere.
//   • {options} is a JSON blob encoded the way Venite's OWN share links encode
//     it: braces and quotes percent-encoded, but ':' and ',' left literal. A
//     plain encodeURIComponent (which also escapes those two) renders a BLANK
//     page — verified against the live site, so this is not cosmetic.
//   • MORNING AND EVENING ONLY. `compline` renders a blank page on Venite with
//     this path shape (checked directly), so Compline never offers this
//     option — see canPrayOnVenite.
//   • THE DAILY DEVOTIONS ARE A {version}, NOT AN {office}. Owner: "make sure
//     that we are integrating Venite for the devotions too." The natural guess
//     — an office slug like `family-morning-prayer` — renders a blank page;
//     Venite's own picker lists "Daily Devotions" alongside Rite II and EOW,
//     and `Daily-Devotions` + `morning-prayer` serves the short BCP devotion.
//     Both sides were checked against the live site.

const VENITE_OPTIONS = { readingB: "second_reading", ublc: "true" } as const;

export type VeniteOffice = "morning-prayer" | "evening-prayer";

/** Which sides can hand off to Venite. Compline is deliberately excluded. */
export function canPrayOnVenite(side: "morning" | "evening"): boolean {
  return side === "morning" || side === "evening";
}

/**
 * Deep link to today's office on venite.app for the reader's local date.
 * `now` is injectable so the date logic is testable without faking a clock.
 */
export function veniteOfficeUrl(
  side: "morning" | "evening",
  now: Date = new Date(),
  // "devotion" swaps the version, keeping the same office slug — see the note
  // above. Defaulted so every existing caller keeps praying the full office.
  form: "office" | "devotion" = "office",
): string {
  const office: VeniteOffice = side === "morning" ? "morning-prayer" : "evening-prayer";
  const version = form === "devotion" ? "Daily-Devotions" : "Rite-II";
  // Local date parts — getFullYear/getMonth/getDate are already the device's
  // wall clock, which is what we want (see the UTC note above).
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  // Match Venite's own encoding exactly — see the note above: restoring ':'
  // and ',' is what makes the page render at all.
  const opts = encodeURIComponent(JSON.stringify(VENITE_OPTIONS))
    .replace(/%3A/g, ":")
    .replace(/%2C/g, ",");
  return `https://www.venite.app/pray/en/${version}/bcp1979/${y}/${m}/${d}/${office}/false/${opts}`;
}
