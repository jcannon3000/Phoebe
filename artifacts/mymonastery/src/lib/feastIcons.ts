import { getDay, readLesserFeastsPref } from "@/lib/liturgical";
import { ICON_CATALOGUE, type IconArtwork } from "@/lib/iconCatalogue";

/**
 * A feast day's icon, for the app-open splash.
 *
 * Owner, 2026-09-17: "If it is feast day and we have an icon of the saint,
 * could we display it on the splash?" — then, of the choices: saints with a
 * true icon AND the feasts of our Lord; larger than the app icon, the name
 * beneath, held about two seconds; for everyone on the app.
 *
 * CHOSEN BY HAND, NOT BY NAME-MATCHING. The catalogue's people tags would pair
 * Saint Mary Magdalene with icons of the Virgin Mary, Saint Joseph with the
 * patriarch's story, and Saint James of Jerusalem with James the Elder — so
 * each day names the one icon that actually shows that saint or that feast,
 * and a day with no such icon is simply absent (Mark, Luke, Matthew, John,
 * Michael, Paul alone, Philip and James together). Keys are the calendar's own
 * names: `day.name` for holy days and feasts, `day.commemoration` for Lesser
 * Feasts, exactly as the home's date header reads them (lib/liturgical).
 */
type FeastIconPick = { iconId: number; label: string };

const BY_FEAST_NAME: Record<string, FeastIconPick> = {
  // ── Feasts of our Lord ─────────────────────────────────────────────────────
  "The Presentation of Our Lord Jesus Christ in the Temple": { iconId: 54414, label: "The Presentation" },
  "The Annunciation": { iconId: 59673, label: "The Annunciation" },
  "The Transfiguration of Our Lord Jesus Christ": { iconId: 57114, label: "The Transfiguration" },
  "Holy Cross Day": { iconId: 56778, label: "Holy Cross Day" },
  "The Nativity of Our Lord Jesus Christ: Christmas Day": { iconId: 31710, label: "The Nativity of Our Lord" },
  "The Day of Pentecost": { iconId: 59680, label: "The Day of Pentecost" },
  // Rublev's Hospitality of Abraham — the icon of the Holy Trinity.
  "Trinity Sunday": { iconId: 58465, label: "Trinity Sunday" },
  // ── Saints ─────────────────────────────────────────────────────────────────
  "The Confession of Saint Peter the Apostle": { iconId: 59677, label: "Saint Peter" },
  "Saint Joseph": { iconId: 57108, label: "Saint Joseph" },
  "The Nativity of Saint John the Baptist": { iconId: 59675, label: "Saint John the Baptist" },
  "Saint Mary Magdalene": { iconId: 59688, label: "Saint Mary Magdalene" },
  // Duccio's panel of James the ELDER (with Philip) — the apostle of July 25.
  "Saint James the Apostle": { iconId: 49165, label: "Saint James" },
  "Saint Mary the Virgin, Mother of Our Lord Jesus Christ": { iconId: 59642, label: "Saint Mary the Virgin" },
  "Saint Bartholomew the Apostle": { iconId: 49153, label: "Saint Bartholomew" },
  "All Saints' Day": { iconId: 46450, label: "All Saints" },
  "Saint Andrew the Apostle": { iconId: 49261, label: "Saint Andrew" },
  "Saint Thomas the Apostle": { iconId: 59684, label: "Saint Thomas" },
};

/** Lesser Feasts — shown only while the reader keeps them (Settings), as the header does. */
const BY_COMMEMORATION: Record<string, FeastIconPick> = {
  "Frederick Douglass, Social Reformer": { iconId: 57101, label: "Frederick Douglass" },
  "Martin Luther King, Jr., Pastor and Martyr": { iconId: 57100, label: "Martin Luther King Jr." },
  "George of Lydda, Martyr": { iconId: 54596, label: "Saint George" },
  "Lydia of Thyatira, Coworker of the Apostle Paul": { iconId: 56896, label: "Lydia of Thyatira" },
  "Moses the Black, Monastic and Martyr": { iconId: 57116, label: "Moses the Black" },
  "Elizabeth Cady Stanton, Amelia Bloomer, and Sojourner Truth, Social Reformers": { iconId: 57105, label: "Sojourner Truth" },
  "Teresa of Avila, Mystic and Monastic Reformer": { iconId: 57125, label: "Teresa of Avila" },
  "Tabitha (Dorcas) of Joppa": { iconId: 59685, label: "Tabitha of Joppa" },
};

export type FeastIcon = { label: string; img: string; credit: string; art: IconArtwork };

let byId: Map<number, IconArtwork> | null = null;
function iconById(id: number): IconArtwork | null {
  if (!byId) byId = new Map(ICON_CATALOGUE.map((a) => [a.id, a]));
  return byId.get(id) ?? null;
}

/**
 * The short credit printed under the name. Most of these icons are shown by
 * their artists' permission for non-commercial use WITH attribution (the same
 * grant Praying with Icons prints in full on its closing slide), so the splash
 * names the iconographer and the collection it came through.
 */
function creditFor(art: IconArtwork): string {
  const artist = (art.artist ?? "").split(",").slice(0, 2).map((s) => s.trim()).filter(Boolean);
  // Catalogue artists are "Surname, Given, dates" — turn the first two parts
  // round ("Latimore, Kelly" → "Kelly Latimore") — except a name whose second
  // part is a particle, which already reads in order ("Duccio, di Buoninsegna"
  // → "Duccio di Buoninsegna").
  const [first, second] = artist;
  const name = !first ? ""
    : !second || /\d/.test(second) ? first
      : /^[a-z]/.test(second) ? `${first} ${second}`
        : `${second} ${first}`;
  return [name, "Art in the Christian Tradition"].filter(Boolean).join(" · ");
}

/** The icon for a date, or null when the day has none (or a Lesser Feast the reader doesn't keep). */
export function feastIconFor(date: Date, observeLesserFeasts: boolean = readLesserFeastsPref()): FeastIcon | null {
  try {
    const day = getDay(date, { observeLesserFeasts });
    const pick = (day.commemoration ? BY_COMMEMORATION[day.commemoration] : undefined) ?? BY_FEAST_NAME[day.name];
    if (!pick) return null;
    const art = iconById(pick.iconId);
    if (!art?.img) return null;
    return { label: pick.label, img: art.img, credit: creditFor(art), art };
  } catch {
    return null;
  }
}

/** Every feast icon in the coming `days` (today first) — what the offline walk saves ahead. */
export function feastIconUrlsAhead(days: number, from: Date = new Date()): string[] {
  const out = new Set<string>();
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, 12);
    // Both answers, so turning Lesser Feasts on offline still finds its icon.
    for (const lesser of [true, false]) {
      const icon = feastIconFor(d, lesser);
      if (icon) out.add(icon.img);
    }
  }
  return Array.from(out);
}

/** For tests: every name this table answers to, and the icon ids it names. */
export const FEAST_ICON_TABLE = { BY_FEAST_NAME, BY_COMMEMORATION };
