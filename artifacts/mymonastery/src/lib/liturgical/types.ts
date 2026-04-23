// Shared types for the liturgical calendar module. Kept in a single
// file so the whole module stays loosely coupled — `calendar.ts` is
// the only external API consumers should reach for.

export type LiturgicalRank =
  | "principal_feast"  // Easter, Christmas, Epiphany, Ascension, Pentecost, Trinity, All Saints
  | "holy_day"          // BCP Holy Days — apostles, evangelists, major commemorations
  | "sunday"            // Every Sunday is a feast of our Lord
  | "lesser_feast"      // Optional commemorations from Lesser Feasts and Fasts
  | "ferial";           // Ordinary weekday, no feast

export type LiturgicalColor =
  | "white"
  | "gold"       // Easter Vigil, Easter Day (sometimes distinguished from white)
  | "red"
  | "violet"     // Advent, Lent
  | "green"      // Ordinary Time (after Epiphany, after Pentecost)
  | "rose"       // Advent 3 (Gaudete, optional), Lent 4 (Laetare, optional)
  | "black"      // Good Friday (some parishes)
  | "unbleached"; // Lent (Lenten array — some parishes)

export type LiturgicalSeason =
  | "advent"
  | "christmas"
  | "epiphany"       // After Epiphany — Ordinary Time
  | "lent"
  | "holy_week"      // Palm Sunday through Holy Saturday
  | "easter"         // Easter through the Day of Pentecost
  | "pentecost"      // After Pentecost — Ordinary Time (Trinity onward)
  | "ordinary";      // Fallback / pre-Advent shoulder if we're being loose

export interface LiturgicalDay {
  // The date this entry describes, as YYYY-MM-DD in the viewer's
  // local calendar day (not UTC — liturgical days are local-day
  // facts, tied to when you wake up, not wall-clock UTC).
  ymd: string;

  // Highest-ranking observance for the day. A Sunday that falls on
  // a Holy Day resolves to the Holy Day if it outranks Sunday per
  // BCP table of precedence; otherwise Sunday wins.
  rank: LiturgicalRank;

  // Primary feast/season name to show in the header.
  //   - principal_feast / holy_day / sunday → the feast name
  //   - lesser_feast → the feast name (rendered beneath the date)
  //   - ferial → the season/week label ("The Third Week of Easter")
  name: string;

  // Liturgical color for the day. Feasts override their surrounding
  // season (e.g., a martyr's feast in Easter is red, not white).
  color: LiturgicalColor;

  // The containing season, regardless of rank. A Holy Day in Lent
  // still reports season=lent so UI can know what we're "in".
  season: LiturgicalSeason;

  // Optional: extra commemoration to render beneath the primary
  // header (e.g., a Lesser Feast that falls on a ferial weekday has
  // its commemoration surfaced here — the date is primary, the
  // commemoration sits quietly under it).
  commemoration?: string;

  // Longer text — populated for Holy Days and Principal Feasts. Used
  // by the tappable detail modal. Ferial days have `undefined`.
  description?: string;

  // Collect of the Day — short prayer from the BCP or LFF.
  collect?: string;

  // Dates of the saint's life, where known. Displayed in the detail
  // modal under the feast name: "c. 280 – 304".
  life?: string;
}

// Entry shape for the hand-rolled fixed-date tables. These are the
// raw rows the fixed-feasts / lesser-feasts files export.
export interface FixedFeastEntry {
  month: number; // 1–12
  day: number;   // 1–31
  rank: Exclude<LiturgicalRank, "sunday" | "ferial">;
  name: string;
  color: LiturgicalColor;
  life?: string;
  description?: string;
  collect?: string;
}
