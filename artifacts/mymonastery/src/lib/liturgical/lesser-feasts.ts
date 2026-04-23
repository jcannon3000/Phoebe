// Lesser Feasts and Fasts (LFF 2022) — optional commemorations.
//
// Compact entries: { month, day, name, color, life? }
//   - Martyrs / Martyr → red
//   - Everyone else → white
// Life dates are the year of death unless the tradition is older
// (then an era string like "fourth century").
//
// This file registers itself with the liturgical calendar on import.
// calendar.ts then surfaces these as `commemoration` on the ferial
// header line — the date stays primary, the saint sits beneath.

import type { FixedFeastEntry } from "./types";
import { registerLesserFeasts } from "./calendar";

const ENTRIES: FixedFeastEntry[] = [
  // ── January ───────────────────────────────────────────────
  { month: 1, day: 4,  rank: "lesser_feast", name: "Elizabeth Seton, Vowed Religious and Educator",         color: "white", life: "1821" },
  { month: 1, day: 5,  rank: "lesser_feast", name: "Sarah, Theodora, and Syncletica of Egypt, Desert Mothers", color: "white", life: "fourth–fifth century" },
  { month: 1, day: 8,  rank: "lesser_feast", name: "Harriet Bedell, Deaconess and Missionary",              color: "white", life: "1969" },
  { month: 1, day: 9,  rank: "lesser_feast", name: "Julia Chester Emery, Lay Leader and Missionary",         color: "white", life: "1922" },
  { month: 1, day: 10, rank: "lesser_feast", name: "William Laud, Archbishop of Canterbury",                color: "white", life: "1645" },
  { month: 1, day: 12, rank: "lesser_feast", name: "Aelred of Rievaulx, Monastic and Theologian",           color: "white", life: "1167" },
  { month: 1, day: 13, rank: "lesser_feast", name: "Hilary of Poitiers, Bishop",                            color: "white", life: "367" },
  { month: 1, day: 14, rank: "lesser_feast", name: "Richard Meux Benson, Priest, and Charles Gore, Bishop", color: "white", life: "1915 and 1932" },
  { month: 1, day: 17, rank: "lesser_feast", name: "Antony of Egypt, Monastic",                             color: "white" },
  { month: 1, day: 19, rank: "lesser_feast", name: "Wulfstan of Worcester, Bishop",                         color: "white", life: "1095" },
  { month: 1, day: 20, rank: "lesser_feast", name: "Fabian, Bishop and Martyr",                             color: "red",   life: "250" },
  { month: 1, day: 21, rank: "lesser_feast", name: "Agnes and Cecilia of Rome, Martyrs",                    color: "red",   life: "304 and c. 230" },
  { month: 1, day: 22, rank: "lesser_feast", name: "Vincent of Saragossa, Deacon and Martyr",               color: "red",   life: "304" },
  { month: 1, day: 23, rank: "lesser_feast", name: "Phillips Brooks, Bishop",                               color: "white", life: "1893" },
  { month: 1, day: 24, rank: "lesser_feast", name: "Florence Li Tim-Oi, Priest",                            color: "white", life: "1992" },
  { month: 1, day: 26, rank: "lesser_feast", name: "Timothy and Titus, Companions of Saint Paul",           color: "white" },
  { month: 1, day: 27, rank: "lesser_feast", name: "John Chrysostom, Bishop and Theologian",                color: "white", life: "407" },
  { month: 1, day: 28, rank: "lesser_feast", name: "Thomas Aquinas, Friar and Theologian",                  color: "white", life: "1274" },
  { month: 1, day: 29, rank: "lesser_feast", name: "Liliʻuokalani of Hawai'i",                              color: "white" },
  { month: 1, day: 31, rank: "lesser_feast", name: "Marcella of Rome, Monastic and Scholar",                color: "white", life: "410" },
];

registerLesserFeasts(ENTRIES);
