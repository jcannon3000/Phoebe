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

  // ── February ──────────────────────────────────────────────
  { month: 2, day: 1,  rank: "lesser_feast", name: "Brigid of Kildare, Monastic",                           color: "white", life: "c. 523" },
  { month: 2, day: 3,  rank: "lesser_feast", name: "Anskar, Bishop and Missionary",                         color: "white", life: "865" },
  { month: 2, day: 4,  rank: "lesser_feast", name: "Manche Masemola, Martyr",                               color: "red",   life: "1928" },
  { month: 2, day: 5,  rank: "lesser_feast", name: "Agatha of Sicily, Martyr",                              color: "red",   life: "c. 251" },
  { month: 2, day: 6,  rank: "lesser_feast", name: "The Martyrs of Japan",                                  color: "red",   life: "1597" },
  { month: 2, day: 8,  rank: "lesser_feast", name: "Bakhita (Josephine Margaret Bakhita), Monastic",        color: "white", life: "1947" },
  { month: 2, day: 10, rank: "lesser_feast", name: "Scholastica, Monastic",                                 color: "white", life: "543" },
  { month: 2, day: 11, rank: "lesser_feast", name: "The Consecration of Barbara Clementine Harris, First Woman Bishop in the Anglican Communion", color: "white", life: "1989" },
  { month: 2, day: 12, rank: "lesser_feast", name: "Theodora, Empress",                                     color: "white", life: "c. 867" },
  { month: 2, day: 13, rank: "lesser_feast", name: "Absalom Jones, Priest",                                 color: "white", life: "1818" },
  { month: 2, day: 14, rank: "lesser_feast", name: "Cyril and Methodius, Missionaries",                     color: "white", life: "869 and 885" },
  { month: 2, day: 15, rank: "lesser_feast", name: "Thomas Bray, Priest and Missionary",                    color: "white", life: "1730" },
  { month: 2, day: 17, rank: "lesser_feast", name: "Janani Luwum, Archbishop and Martyr",                   color: "red",   life: "1977" },
  { month: 2, day: 18, rank: "lesser_feast", name: "Martin Luther, Pastor and Reformer",                    color: "white", life: "1546" },
  { month: 2, day: 19, rank: "lesser_feast", name: "Agnes Tsao Kou Ying, Agatha Lin Zhao, and Lucy Yi Zhenmei, Catechists and Martyrs", color: "red", life: "1856, 1858, and 1862" },
  { month: 2, day: 20, rank: "lesser_feast", name: "Frederick Douglass, Social Reformer",                   color: "white", life: "1895" },
  { month: 2, day: 22, rank: "lesser_feast", name: "Margaret of Cortona, Monastic",                         color: "white", life: "1297" },
  { month: 2, day: 23, rank: "lesser_feast", name: "Polycarp, Bishop and Martyr of Smyrna",                 color: "red",   life: "156" },
  { month: 2, day: 25, rank: "lesser_feast", name: "Emily Malbone Morgan, Lay Leader and Contemplative",    color: "white", life: "1937" },
  { month: 2, day: 26, rank: "lesser_feast", name: "Photini, The Samaritan Woman",                          color: "white", life: "c. 67" },
  { month: 2, day: 27, rank: "lesser_feast", name: "George Herbert, Priest and Poet",                       color: "white", life: "1633" },
  { month: 2, day: 28, rank: "lesser_feast", name: "Anna Julia Haywood Cooper, Educator",                   color: "white", life: "1964" },

  // ── March ─────────────────────────────────────────────────
  { month: 3, day: 1,  rank: "lesser_feast", name: "David of Wales, Bishop",                                color: "white", life: "c. 544" },
  { month: 3, day: 2,  rank: "lesser_feast", name: "Chad of Lichfield, Bishop",                             color: "white", life: "672" },
  { month: 3, day: 3,  rank: "lesser_feast", name: "John and Charles Wesley, Priests",                      color: "white", life: "1791, 1788" },
  { month: 3, day: 7,  rank: "lesser_feast", name: "Perpetua and Felicity, Martyrs",                        color: "red",   life: "202" },
  { month: 3, day: 9,  rank: "lesser_feast", name: "Gregory of Nyssa, Bishop and Theologian",               color: "white", life: "c. 394" },
  { month: 3, day: 10, rank: "lesser_feast", name: "Harriet Ross Tubman, Social Reformer",                  color: "white", life: "1923" },
  { month: 3, day: 12, rank: "lesser_feast", name: "Gregory the Great, Bishop and Theologian",              color: "white", life: "604" },
  { month: 3, day: 13, rank: "lesser_feast", name: "James Theodore Holly, Bishop",                          color: "white", life: "1911" },
  { month: 3, day: 15, rank: "lesser_feast", name: "Vincent de Paul, Priest, and Louise de Marillac, Vowed Religious, Workers of Charity", color: "white", life: "1660" },
  { month: 3, day: 17, rank: "lesser_feast", name: "Patrick of Ireland, Bishop and Missionary",             color: "white", life: "461" },
  { month: 3, day: 18, rank: "lesser_feast", name: "Cyril of Jerusalem, Bishop and Theologian",             color: "white", life: "386" },
  { month: 3, day: 20, rank: "lesser_feast", name: "Cuthbert, Bishop",                                      color: "white", life: "687" },
  { month: 3, day: 21, rank: "lesser_feast", name: "Thomas Ken, Bishop of Bath and Wells",                  color: "white", life: "1711" },
  { month: 3, day: 22, rank: "lesser_feast", name: "James De Koven, Priest",                                color: "white", life: "1879" },
  { month: 3, day: 23, rank: "lesser_feast", name: "Gregory the Illuminator, Bishop and Missionary",        color: "white", life: "c. 332" },
  { month: 3, day: 24, rank: "lesser_feast", name: "Óscar Romero, Archbishop and Martyr, and the Martyrs of El Salvador", color: "red", life: "1980" },
  { month: 3, day: 26, rank: "lesser_feast", name: "Harriet Monsell, Monastic",                             color: "white", life: "1883" },
  { month: 3, day: 27, rank: "lesser_feast", name: "Charles Henry Brent, Bishop",                           color: "white", life: "1929" },
  { month: 3, day: 28, rank: "lesser_feast", name: "James Solomon Russell, Priest",                         color: "white", life: "1935" },
  { month: 3, day: 29, rank: "lesser_feast", name: "John Keble, Priest and Poet",                           color: "white", life: "1866" },
  { month: 3, day: 30, rank: "lesser_feast", name: "Mary of Egypt, Monastic",                               color: "white", life: "c. 421" },
  { month: 3, day: 31, rank: "lesser_feast", name: "John Donne, Priest and Poet",                           color: "white", life: "1631" },

  // ── April ─────────────────────────────────────────────────
  { month: 4, day: 1,  rank: "lesser_feast", name: "Frederick Denison Maurice, Priest",                     color: "white", life: "1872" },
  { month: 4, day: 2,  rank: "lesser_feast", name: "James Lloyd Breck, Priest",                             color: "white", life: "1876" },
  { month: 4, day: 3,  rank: "lesser_feast", name: "Richard of Chichester, Bishop",                         color: "white", life: "1253" },
  { month: 4, day: 4,  rank: "lesser_feast", name: "Martin Luther King, Jr., Pastor and Martyr",            color: "red",   life: "1968" },
  { month: 4, day: 5,  rank: "lesser_feast", name: "Harriet Starr Cannon, Monastic",                        color: "white", life: "1896" },
  { month: 4, day: 7,  rank: "lesser_feast", name: "Tikhon, Bishop and Ecumenist",                          color: "white", life: "1925" },
  { month: 4, day: 8,  rank: "lesser_feast", name: "William Augustus Muhlenberg, Priest",                   color: "white", life: "1877" },
  { month: 4, day: 9,  rank: "lesser_feast", name: "Dietrich Bonhoeffer, Pastor and Theologian",            color: "white", life: "1945" },
  { month: 4, day: 10, rank: "lesser_feast", name: "William Law, Priest",                                   color: "white", life: "1761" },
  { month: 4, day: 11, rank: "lesser_feast", name: "George Augustus Selwyn, Bishop",                        color: "white", life: "1878" },
  { month: 4, day: 14, rank: "lesser_feast", name: "Zenaida, Philonella, and Hermione, Unmercenary Physicians", color: "white", life: "c. 100, c. 117" },
  { month: 4, day: 15, rank: "lesser_feast", name: "Damien, Priest, and Marianne Cope, Monastic, of Hawai'i", color: "white", life: "1889 and 1918" },
  { month: 4, day: 16, rank: "lesser_feast", name: "Peter Williams Cassey, Deacon, and Annie Besant Cassey", color: "white", life: "1917 and 1875" },
  { month: 4, day: 17, rank: "lesser_feast", name: "Kateri Tekakwitha, Lay Contemplative",                  color: "white", life: "1680" },
  { month: 4, day: 18, rank: "lesser_feast", name: "Juana Inés de la Cruz, Monastic and Theologian",        color: "white", life: "1695" },
  { month: 4, day: 19, rank: "lesser_feast", name: "Alphege, Archbishop of Canterbury, and Martyr",         color: "red",   life: "1012" },
  { month: 4, day: 21, rank: "lesser_feast", name: "Anselm, Archbishop of Canterbury",                      color: "white", life: "1109" },
  { month: 4, day: 22, rank: "lesser_feast", name: "Hadewijch of Brabant, Poet and Mystic",                 color: "white", life: "thirteenth century" },
  { month: 4, day: 23, rank: "lesser_feast", name: "Toyohiko Kagawa, Social Reformer",                      color: "white", life: "1960" },
  { month: 4, day: 27, rank: "lesser_feast", name: "Zita of Tuscany, Worker of Charity",                    color: "white", life: "1271" },
  { month: 4, day: 29, rank: "lesser_feast", name: "Catherine of Siena, Mystic and Prophetic Witness",      color: "white", life: "1380" },

  // ── May ───────────────────────────────────────────────────
  { month: 5, day: 2,  rank: "lesser_feast", name: "Athanasius of Alexandria, Bishop and Theologian",       color: "white", life: "373" },
  { month: 5, day: 3,  rank: "lesser_feast", name: "Elisabeth Cruciger, Poet and Hymnographer",             color: "white", life: "1535" },
  { month: 5, day: 4,  rank: "lesser_feast", name: "Monica, Mother of Augustine of Hippo",                  color: "white", life: "387" },
  { month: 5, day: 5,  rank: "lesser_feast", name: "Martyrs of the Reformation Era",                        color: "red" },
  { month: 5, day: 6,  rank: "lesser_feast", name: "George of Lydda, Martyr",                               color: "red" },
  { month: 5, day: 8,  rank: "lesser_feast", name: "Julian of Norwich, Mystic and Theologian",              color: "white", life: "c. 1417" },
  { month: 5, day: 9,  rank: "lesser_feast", name: "Gregory of Nazianzus, Bishop and Theologian",           color: "white", life: "389" },
  { month: 5, day: 11, rank: "lesser_feast", name: "Johann Arndt and Jacob Boehme, Mystics",                color: "white", life: "1621 and 1624" },
  { month: 5, day: 13, rank: "lesser_feast", name: "Frances Perkins, Social Reformer",                      color: "white", life: "1965" },
  { month: 5, day: 15, rank: "lesser_feast", name: "Pachomius of Tabennisi, Monastic",                      color: "white", life: "348" },
  { month: 5, day: 17, rank: "lesser_feast", name: "Thurgood Marshall, Public Servant",                     color: "white", life: "1993" },
  { month: 5, day: 19, rank: "lesser_feast", name: "Dunstan, Archbishop of Canterbury",                     color: "white", life: "988" },
  { month: 5, day: 20, rank: "lesser_feast", name: "Alcuin, Deacon, and Abbot of Tours",                    color: "white", life: "804" },
  { month: 5, day: 21, rank: "lesser_feast", name: "Lydia of Thyatira, Coworker of the Apostle Paul",       color: "white" },
  { month: 5, day: 22, rank: "lesser_feast", name: "Helena of Constantinople, Protector of the Holy Places", color: "white", life: "330" },
  { month: 5, day: 24, rank: "lesser_feast", name: "Jackson Kemper, Bishop and Missionary",                 color: "white", life: "1870" },
  { month: 5, day: 25, rank: "lesser_feast", name: "Bede the Venerable, Priest and Historian",              color: "white", life: "735" },
  { month: 5, day: 26, rank: "lesser_feast", name: "Augustine, First Archbishop of Canterbury",             color: "white", life: "605" },
  { month: 5, day: 28, rank: "lesser_feast", name: "Mechthild of Magdeburg, Mystic",                        color: "white", life: "c. 1282" },
];

registerLesserFeasts(ENTRIES);
