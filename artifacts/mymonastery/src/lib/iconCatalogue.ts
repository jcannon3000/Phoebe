/**
 * Art in the Christian Tradition — the ICON catalogue.
 *
 * GENERATED FILE. Do not edit by hand: run
 *   node scripts/fetch-act-icons.mjs
 * which re-harvests ACT's icon-tradition works. Every entry either passed the
 * Wikimedia Commons licence check (public domain / CC0 / CC BY(-SA)) or
 * carries ACT's recorded artist grant of non-commercial use with attribution
 * (Phoebe is a non-profit; the required attribution is printed on the
 * closing slide). Records with neither were dropped.
 *
 * Searched by /icon-prayer ONLY — kept separate from visioCatalogue.ts on
 * purpose: these works carry no scripture refs, and visioSelect must never be
 * able to pick one as the day's shared image. Do not merge the two files.
 */

export type IconArtwork = {
  id: number;
  title: string;
  artist: string | null;
  date: string | null;
  where: string | null;
  img: string;
  /** Who the icon depicts (ACT's people tags) — searched alongside the title. */
  people: string[];
  act: string;
  licence: string;
  attribution: string;
};

export const ICON_CATALOGUE: IconArtwork[] = [
 {
  "id": 31710,
  "title": "Nativity on Russian Icon",
  "artist": null,
  "date": "1600",
  "where": "Victoria and Albert Museum, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/00000334.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/31710",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Nativity on Russian Icon, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Prof. Patout J. Burns."
 },
 {
  "id": 31724,
  "title": "Madonna and the Child; the Crucified Christ",
  "artist": null,
  "date": null,
  "where": "Victoria and Albert Museum, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/00000348.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/31724",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Madonna and the Child; the Crucified Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Prof. Patout J. Burns."
 },
 {
  "id": 46638,
  "title": "Christ Pantocrator",
  "artist": null,
  "date": "1020",
  "where": "Ayasofya Müzesi, Istanbul, Turkey",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Yorck_B_040.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/46638",
  "licence": "Public domain",
  "attribution": "Christ Pantocrator, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46695,
  "title": "Christ's Birth",
  "artist": "Conrad, von Soest, fl. 1370-1420",
  "date": "1403",
  "where": "Stadtkirche St. Nikolaus, Bad Wildungen, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Conrad_von_Soest_004.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/46695",
  "licence": "Public domain",
  "attribution": "Conrad, von Soest, fl. 1370-1420. Christ's Birth, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46784,
  "title": "Adoration of the Three Kings - Pantocrator - Christ",
  "artist": "Gentile, da Fabriano, ca. 1370-1427",
  "date": "1423",
  "where": "Uffizi Gallery, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Gentile_da_Fabriano_028.jpg",
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/46784",
  "licence": "Public domain",
  "attribution": "Gentile, da Fabriano, ca. 1370-1427. Adoration of the Three Kings - Pantocrator - Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 48051,
  "title": "Christ Blessing, The Saviour of the World",
  "artist": "Greco, 1541?-1614",
  "date": "1600",
  "where": "National Gallery of Scotland, Edinburgh, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/El_Greco_021.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/48051",
  "licence": "Public domain",
  "attribution": "Greco, 1541?-1614. Christ Blessing, The Saviour of the World, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54414,
  "title": "La presentación de Cristo en el templo",
  "artist": "Latimore, Kelly",
  "date": "2018",
  "where": "Longview, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_5045.jpg",
  "people": [
   "Simeon (Biblical figure)",
   "Anna (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/54414",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. La presentación de Cristo en el templo, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 54588,
  "title": "Saint Theodore - ceramic icon",
  "artist": null,
  "date": "10th century",
  "where": "Sofia, Bulgaria",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/L82-Theodore-ceramic.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/54588",
  "licence": "Public domain",
  "attribution": "Saint Theodore - ceramic icon, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54591,
  "title": "Christ the Savior, 6th century incaustic icon",
  "artist": null,
  "date": "6th century",
  "where": "Saint Catherine (Monastery : Mount Sinai), Sinai, Egypt",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/L84-iconChrist.jpg",
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/54591",
  "licence": "Public domain",
  "attribution": "Christ the Savior, 6th century incaustic icon, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54596,
  "title": "St. George, Sinai",
  "artist": null,
  "date": "9th-10th centuries",
  "where": "Saint Catherine (Monastery : Mount Sinai), Sinai, Egypt",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/L86-StGeorgeCrete.jpg",
  "people": [
   "George, Saint"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/54596",
  "licence": "Public domain",
  "attribution": "St. George, Sinai, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54617,
  "title": "Saint Anne holding the child Mary",
  "artist": null,
  "date": "ca. 1300",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/L89-Serbia-14th.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/54617",
  "licence": "Public domain",
  "attribution": "Saint Anne holding the child Mary, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54618,
  "title": "Simeon in mural at Sopocani",
  "artist": null,
  "date": "1263-1270",
  "where": "Sopocani Monastery, Raska",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/L89-Sopocani1.jpg",
  "people": [
   "Simeon (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/54618",
  "licence": "Public domain",
  "attribution": "Simeon in mural at Sopocani, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54619,
  "title": "Sopocani mural",
  "artist": null,
  "date": "1263-1270",
  "where": "Raska",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/L89-Sopocani2.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/54619",
  "licence": "Public domain",
  "attribution": "Sopocani mural, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54989,
  "title": "Parable of the Souls",
  "artist": null,
  "date": "16th century",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/northdoor.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/54989",
  "licence": "Public domain",
  "attribution": "Parable of the Souls, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55254,
  "title": "Holy Trinity",
  "artist": "Masaccio, 1401-1428",
  "date": "ca. 1426-1428",
  "where": "Santa Maria Novella, Florence, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/masaccio-trinita.jpg",
  "people": [
   "Trinity"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/55254",
  "licence": "Public domain",
  "attribution": "Masaccio, 1401-1428. Holy Trinity, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55259,
  "title": "Anglo-Catalan Psalter or The Great Canterbury Psalter, folio 1 recto: Genesis",
  "artist": null,
  "date": "ca. 1185-1195",
  "where": "Bibliothèque nationale de France, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/saltiri-creation.jpg",
  "people": [
   "Eve (Biblical figure)",
   "Adam (Biblical figure)",
   "Abel (Biblical figure)",
   "Cain (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/55259",
  "licence": "Public domain",
  "attribution": "Anglo-Catalan Psalter or The Great Canterbury Psalter, folio 1 recto: Genesis, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55282,
  "title": "Interrogation of Christ",
  "artist": "Anonymous",
  "date": "12th century",
  "where": "Walters Art Museum, Baltimore, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Byzantine_-_Interrogation_of_Christ_-_Walters_41209.jpg",
  "people": [
   "Pharisees (Biblical figures)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/55282",
  "licence": "Public domain",
  "attribution": "Anonymous. Interrogation of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55374,
  "title": "Transfiguration of Christ",
  "artist": null,
  "date": "ca. 1200",
  "where": "Louvre, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Transfiguration_Christ_Louvre_ML145.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/55374",
  "licence": "CC BY 2.5",
  "attribution": "Transfiguration of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55553,
  "title": "Eastern Orthodox icon of Jesus Christ as the True Vine",
  "artist": null,
  "date": "16th century",
  "where": "Byzantine and Christian Museum, Athens, Greece",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Christ_the_True_Vin-icon.jpg",
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/55553",
  "licence": "Public domain",
  "attribution": "Eastern Orthodox icon of Jesus Christ as the True Vine, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55565,
  "title": "Icon with hetimasia, detail",
  "artist": null,
  "date": "10th-11th centuries",
  "where": "Louvre, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Hetimasia_warrior_saints_Louvre_OA11152.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/55565",
  "licence": "Public domain",
  "attribution": "Icon with hetimasia, detail, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55642,
  "title": "Philemon and Apphia",
  "artist": null,
  "date": "early 21st century?",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Philemon_and_Apphia.jpg",
  "people": [
   "Philemon (Biblical figure)",
   "Apphia (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/55642",
  "licence": "Public domain",
  "attribution": "Philemon and Apphia, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55893,
  "title": "Multiplication of the Loaves and Fishes, detail",
  "artist": "Reid, Patricia",
  "date": "ca. 2000",
  "where": "New Skete Community, Cambridge, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/feed-fish-5918.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/55893",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Reid, Patricia. Multiplication of the Loaves and Fishes, detail, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/jimforest/5125264193."
 },
 {
  "id": 56487,
  "title": "Noah's Ark Icon",
  "artist": "Ermakova, Natalia",
  "date": "20th century",
  "where": "St Nicholas Russian Orthodox Church, Amsterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/4338027250_158c201ffa_o.jpg",
  "people": [
   "Noah (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/56487",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Ermakova, Natalia. Noah's Ark Icon, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/jimforest/4338027250/ - CC BY-NC 2.0."
 },
 {
  "id": 56535,
  "title": "A Visit",
  "artist": "Swanson, John August",
  "date": "1995",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-a-visit.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/56535",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. A Visit, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56537,
  "title": "Abraham and Isaac",
  "artist": "Swanson, John August",
  "date": "1976",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-abraham-and-isaac.jpg",
  "people": [
   "Abraham (Biblical figure)",
   "Isaac (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/56537",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Abraham and Isaac, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56538,
  "title": "Celebration",
  "artist": "Swanson, John August",
  "date": "1997",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Celebration.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/56538",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Celebration, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56539,
  "title": "Daniel",
  "artist": "Swanson, John August",
  "date": "2000",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Daniel.jpg",
  "people": [
   "Daniel (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/56539",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Daniel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56540,
  "title": "David and Goliath",
  "artist": "Swanson, John August",
  "date": "2005",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-David-and-Goliath.jpg",
  "people": [
   "David, King of Israel (Biblical figure)",
   "Goliath (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/56540",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. David and Goliath, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56541,
  "title": "Dream of Jacob",
  "artist": "Swanson, John August",
  "date": "1986",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Dream-of-Jacob.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/56541",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Dream of Jacob, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56542,
  "title": "Ecclesiastes",
  "artist": "Swanson, John August",
  "date": "1989",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Ecclesiastes.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/56542",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Ecclesiastes, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56544,
  "title": "Entry into the City",
  "artist": "Swanson, John August",
  "date": "1990",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-entry-into-the-city.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/56544",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Entry into the City, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56546,
  "title": "Festival of Lights",
  "artist": "Swanson, John August",
  "date": "2000",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-FestivalOfLights.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/56546",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Festival of Lights, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56547,
  "title": "Flight into Egypt",
  "artist": "Swanson, John August",
  "date": "2002",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-FlightIntoEgypt.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/56547",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Flight into Egypt, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56548,
  "title": "Good Samaritan",
  "artist": "Swanson, John August",
  "date": "2002",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Good-Samaritan.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/56548",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Good Samaritan, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56549,
  "title": "Jonah",
  "artist": "Swanson, John August",
  "date": "1983",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Jonah.jpg",
  "people": [
   "Jonah (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/56549",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Jonah, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56550,
  "title": "The Great Catch",
  "artist": "Swanson, John August",
  "date": "1993",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-GreatCatch.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/56550",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. The Great Catch, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56551,
  "title": "Kiss of Judas",
  "artist": "Swanson, John August",
  "date": "2008",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-KissOfJudas.jpg",
  "people": [
   "Judas Iscariot (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/56551",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Kiss of Judas, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56552,
  "title": "Last Supper",
  "artist": "Swanson, John August",
  "date": "2009",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Last_Supper.jpg",
  "people": [
   "Jesus Christ (Biblical figure)",
   "Apostles (Biblical figures)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/56552",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Last Supper, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56553,
  "title": "Loaves and Fishes",
  "artist": "Swanson, John August",
  "date": "2003",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-LoavesAndFishes.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/56553",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Loaves and Fishes, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56554,
  "title": "Moses",
  "artist": "Swanson, John August",
  "date": "1983",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Moses.jpg",
  "people": [
   "Moses (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/56554",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Moses, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56556,
  "title": "Peaceable Kingdom",
  "artist": "Swanson, John August",
  "date": "1994",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-PeaceableKingdom.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/56556",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Peaceable Kingdom, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56557,
  "title": "Presentation in the Temple",
  "artist": "Swanson, John August",
  "date": "1988",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Presentation.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/56557",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Presentation in the Temple, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56558,
  "title": "The Procession",
  "artist": "Swanson, John August",
  "date": "2007",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Procession.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/56558",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. The Procession, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56559,
  "title": "Prodigal Son",
  "artist": "Swanson, John August",
  "date": "1984",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-ProdigalSon1984.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/56559",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Prodigal Son, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56560,
  "title": "Psalm 23",
  "artist": "Swanson, John August",
  "date": "2010",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-psalm23.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/56560",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Psalm 23, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56561,
  "title": "Story of Ruth",
  "artist": "Swanson, John August",
  "date": "1991",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-StoryOfRuth.jpg",
  "people": [
   "Ruth (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/56561",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Story of Ruth, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56562,
  "title": "Story of Joseph",
  "artist": "Swanson, John August",
  "date": "2005",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-StoryofJoseph.jpg",
  "people": [
   "Joseph, the son of Jacob (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/56562",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Story of Joseph, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56567,
  "title": "The Flood",
  "artist": "Swanson, John August",
  "date": "1974",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Noah_BuildingTheArc.jpg",
  "people": [
   "Noah (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/56567",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. The Flood, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56568,
  "title": "Rainbow",
  "artist": "Swanson, John August",
  "date": "1974",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Noah_TheRainbow.jpg",
  "people": [
   "Noah (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/56568",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Rainbow, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56666,
  "title": "Icon of the Second Coming",
  "artist": null,
  "date": "ca. 1700",
  "where": "Private collection",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Icon_second_coming234879d.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/56666",
  "licence": "Public domain",
  "attribution": "Icon of the Second Coming, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56778,
  "title": "Icon of Crucifixion",
  "artist": null,
  "date": "ca. 1560",
  "where": "Benaki Museum, Athens, Greece",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Crucifixionqklenlkndl0i0kjnd28x.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/56778",
  "licence": "Public domain",
  "attribution": "Icon of Crucifixion, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56896,
  "title": "Lydia of Thyatira",
  "artist": null,
  "date": "20th century",
  "where": "Akhisar, Turkey",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/24499073678_0c3d96130e_k.jpg",
  "people": [
   "Lydia (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/56896",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Lydia of Thyatira, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/captspaulding/24499073678/ - CaptSpalding."
 },
 {
  "id": 57094,
  "title": "Saint of the Gulf",
  "artist": "Pittman, Lauren Wright",
  "date": "2018",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_saintofthegulf_thumbnail.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/57094",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Saint of the Gulf, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57100,
  "title": "Martin Luther King, Jr.",
  "artist": "Latimore, Kelly",
  "date": "2019",
  "where": "St. Louis, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_5109.jpg",
  "people": [
   "King, Martin Luther, Jr., 1929-1968"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/57100",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Martin Luther King, Jr., from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57101,
  "title": "Frederick Douglass",
  "artist": "Latimore, Kelly",
  "date": "2014",
  "where": "Cincinnati, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_3878.jpg",
  "people": [
   "Douglass, Frederick, 1818-1895"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/57101",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Frederick Douglass, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57102,
  "title": "Nicholas Black Elk",
  "artist": "Latimore, Kelly",
  "date": "2019",
  "where": "St. Louis, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_4713.jpg",
  "people": [
   "Black Elk, Nicolas, 1863-1950"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/57102",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Nicholas Black Elk, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57104,
  "title": "Maya Angelou",
  "artist": "Latimore, Kelly",
  "date": "2017",
  "where": "St. Louis, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_3194.jpg",
  "people": [
   "Angelou, Maya, 1928-2014"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/57104",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Maya Angelou, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57105,
  "title": "Sojourner Truth",
  "artist": "Latimore, Kelly",
  "date": "2018",
  "where": "Takoma, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_4383.jpg",
  "people": [
   "Truth, Sojourner, 1799-1883"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/57105",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Sojourner Truth, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57106,
  "title": "Mary: Keep Watch",
  "artist": "Latimore, Kelly",
  "date": "2015",
  "where": "St. Louis, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_4954.jpg",
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/57106",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Mary: Keep Watch, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57107,
  "title": "Simple Mary",
  "artist": "Latimore, Kelly",
  "date": "2011",
  "where": "Columbus, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_5680.jpg",
  "people": [
   "Mary, the mother of Jesus (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/57107",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Simple Mary, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57108,
  "title": "Refugees: Holy Family",
  "artist": "Latimore, Kelly",
  "date": "2018",
  "where": "Cincinnati, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_4035.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/57108",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Refugees: Holy Family, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57109,
  "title": "Refugees: La Sagrada Familia",
  "artist": "Latimore, Kelly",
  "date": "2016",
  "where": "New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_2361.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/57109",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Refugees: La Sagrada Familia, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57110,
  "title": "Fannie Lou Hamer",
  "artist": "Latimore, Kelly",
  "date": "2019",
  "where": "St. Louis, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_5297.jpg",
  "people": [
   "Hamer, Fannie Lou, 1917-1977"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/57110",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Fannie Lou Hamer, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57111,
  "title": "Our Lady of Prompt Succor",
  "artist": "Latimore, Kelly",
  "date": "2018",
  "where": "New Orleans, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_4671.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/57111",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Our Lady of Prompt Succor, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57112,
  "title": "Mother of God: Protectress of the Oppressed",
  "artist": "Latimore, Kelly",
  "date": "2019",
  "where": "St. Louis, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_5407.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/57112",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Mother of God: Protectress of the Oppressed, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57114,
  "title": "Transfiguration",
  "artist": "Latimore, Kelly",
  "date": "2014",
  "where": "Glendale, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_5681.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/57114",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Transfiguration, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57115,
  "title": "Mother Jones",
  "artist": "Latimore, Kelly",
  "date": "2015",
  "where": "Toledo, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_4363.jpg",
  "people": [
   "Jones, Mother, 1837-1930"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/57115",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Mother Jones, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57116,
  "title": "Moses the Black",
  "artist": "Latimore, Kelly",
  "date": "2019",
  "where": "Kansas City, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_5072.jpg",
  "people": [
   "Moses the Black, 330-405"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/57116",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Moses the Black, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57117,
  "title": "John Muir",
  "artist": "Latimore, Kelly",
  "date": "2011",
  "where": "St. Louis, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_3551.jpg",
  "people": [
   "Muir, John, 1838-1914"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/57117",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. John Muir, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57118,
  "title": "Christ: Consider the Lilies",
  "artist": "Latimore, Kelly",
  "date": "2010",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_3875.jpg",
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/57118",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Christ: Consider the Lilies, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57119,
  "title": "Cloud of Unknowing",
  "artist": "Latimore, Kelly",
  "date": "2010",
  "where": "St. Louis, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_4868.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/57119",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Cloud of Unknowing, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57120,
  "title": "Roebuck \"Pops\" Staples",
  "artist": "Latimore, Kelly",
  "date": "2019",
  "where": "Chicago, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_4753.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/57120",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Roebuck \"Pops\" Staples, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57121,
  "title": "Good Shepherd",
  "artist": "Latimore, Kelly",
  "date": "2019",
  "where": "Good Shepherd Episcopal Church, Athens, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_5207.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/57121",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Good Shepherd, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57122,
  "title": "Dorothy Day with Homeless Christ",
  "artist": "Latimore, Kelly",
  "date": "2015",
  "where": "New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_4437.jpg",
  "people": [
   "Jesus Christ (Biblical figure)",
   "Day, Dorothy, 1897-1980"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/57122",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Dorothy Day with Homeless Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57123,
  "title": "Trinity",
  "artist": "Latimore, Kelly",
  "date": "2016",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_2737.jpg",
  "people": [
   "Trinity"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/57123",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Trinity, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57124,
  "title": "Christ: the Tekton",
  "artist": "Latimore, Kelly",
  "date": "2015",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_5387.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/57124",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Christ: the Tekton, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57125,
  "title": "St. Teresa of Avila",
  "artist": "Latimore, Kelly",
  "date": "2016",
  "where": "St. Paul's Episcopal Church, Gallipoli, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_2753.jpg",
  "people": [
   "Teresa of Avila, 1515-1582"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/57125",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. St. Teresa of Avila, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57348,
  "title": "Tormenting of Christ",
  "artist": null,
  "date": "19th century",
  "where": "Brooklyn Museum, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/thornsmncvxjhgfadewq.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/57348",
  "licence": "CC BY 3.0",
  "attribution": "Tormenting of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57360,
  "title": "Sealing of Christ’s Tomb",
  "artist": null,
  "date": "ca. 1850-1900",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/tomb422d4sg45xd0.jpg",
  "people": [
   "Pharisees (Biblical figures)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/57360",
  "licence": "Public domain",
  "attribution": "Sealing of Christ’s Tomb, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57436,
  "title": "Icon of Christ Feeding the Multitude",
  "artist": null,
  "date": "20th century",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/feed4r786j0.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/57436",
  "licence": "Public domain",
  "attribution": "Icon of Christ Feeding the Multitude, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57626,
  "title": "Job and His Daughters",
  "artist": null,
  "date": "5th century",
  "where": "Biblioteca Nazionale Vittorio Emanuele III, Naples, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/job389s321wxqz.jpg",
  "people": [
   "Job (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/57626",
  "licence": "Public domain",
  "attribution": "Job and His Daughters, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57758,
  "title": "Folds from Ethiopian Processional Icon",
  "artist": null,
  "date": "ca. 1450-1500",
  "where": "Walters Art Museum, Baltimore, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/process329577096mfq.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/57758",
  "licence": "Public domain",
  "attribution": "Folds from Ethiopian Processional Icon, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58411,
  "title": "Pantocrator, God the Son, as the Creator of the Universe",
  "artist": null,
  "date": "ca. 1226-1234",
  "where": "Catedral de Toledo, Toledo, Spain",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/pantocrator4tg7uj8.jpg",
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/58411",
  "licence": "Public domain",
  "attribution": "Pantocrator, God the Son, as the Creator of the Universe, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58465,
  "title": "Hospitality of Abraham",
  "artist": "Rublev, Andreĭ, Saint, -approximately 1430",
  "date": "ca. 1420",
  "where": "Tretyakov Gallery, Moscow, Russia",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/hospitalityabe298ght1y.jpg",
  "people": [
   "Angels (Biblical figures)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/58465",
  "licence": "Public domain",
  "attribution": "Rublev, Andreĭ, Saint, -approximately 1430. Hospitality of Abraham, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58475,
  "title": "Icon on the Triumph of Orthodoxy",
  "artist": null,
  "date": "ca. 1400",
  "where": "British Museum, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/triumphorthodoxy4912dfvc.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/58475",
  "licence": "Public domain",
  "attribution": "Icon on the Triumph of Orthodoxy, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58575,
  "title": "Shepherds",
  "artist": "Swanson, John August",
  "date": "1985",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Shepherds.jpg",
  "people": [
   "Angel (Biblical figure)",
   "Shepherds (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/58575",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Shepherds, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 58577,
  "title": "River",
  "artist": "Swanson, John August",
  "date": "1987",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-River.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/58577",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. River, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 58578,
  "title": "Take Away the Stone",
  "artist": "Swanson, John August",
  "date": "2005",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/TakeAwaytheStone.jpg",
  "people": [
   "Lazarus, of Bethany (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/58578",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Take Away the Stone, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 58579,
  "title": "Washing of the Feet",
  "artist": "Swanson, John August",
  "date": "1999",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/WashingOfTheFeet.jpg",
  "people": [
   "Jesus Christ (Biblical figure)",
   "Peter, the Apostle (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/58579",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Washing of the Feet, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 58580,
  "title": "Washing of the Feet II",
  "artist": "Swanson, John August",
  "date": "2000",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/WashingOfTheFeetII.jpg",
  "people": [
   "Jesus Christ (Biblical figure)",
   "Peter, the Apostle (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/58580",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Washing of the Feet II, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 58581,
  "title": "Wedding Feast",
  "artist": "Swanson, John August",
  "date": "1996",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/WeddingFeast.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/58581",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Wedding Feast, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 58774,
  "title": "Elijah",
  "artist": "Anonymous",
  "date": "18th century",
  "where": "Lebanon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/elijahicon3720wtka.jpg",
  "people": [
   "Elijah (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/58774",
  "licence": "Public domain",
  "attribution": "Anonymous. Elijah, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58782,
  "title": "Great Deesis with Prophets",
  "artist": "Anonymous",
  "date": "16th century",
  "where": "Walters Art Museum, Baltimore, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/deesis3928sdkb.jpg",
  "people": [
   "Moses (Biblical figure)",
   "Mary, the mother of Jesus (Biblical figure)",
   "Isaiah (Biblical figure)",
   "Jeremiah (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "David, King of Israel (Biblical figure)",
   "Solomon, King of Israel (Biblical figure)",
   "Peter, the Apostle (Biblical figure)",
   "Paul, the Apostle (Biblical figure)",
   "John, the Baptist (Biblical figure)",
   "Daniel (Biblical figure)",
   "Jacob (Biblical figure)",
   "Gideon (Biblical figure)",
   "Micah (Biblical figure)",
   "Zechariah (Biblical figure, Hebrew Bible)",
   "Habakkuk (Biblical figure)",
   "Jonah (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/58782",
  "licence": "Public domain",
  "attribution": "Anonymous. Great Deesis with Prophets, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59393,
  "title": "Mosaic of Christ Pantocrator",
  "artist": null,
  "date": "521-547",
  "where": "S. Apollinare nuovo (Basilica : Ravenna, Italy), Ravenna, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/L36-Ravenna.jpg",
  "people": [],
  "act": "https://act.library.vanderbilt.edu/artworks/59393",
  "licence": "Public domain",
  "attribution": "Mosaic of Christ Pantocrator, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59642,
  "title": "Mary the Theotokos",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Theotokus-Miller.jpg",
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59642",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Mary the Theotokos, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59651,
  "title": "Mary the Universal Mother",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Universal Mother-Miller.jpg",
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59651",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Mary the Universal Mother, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59652,
  "title": "Mary of Seven Sorrows",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/May Swords-Miller.jpg",
  "people": [
   "Mary, the mother of Jesus (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59652",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Mary of Seven Sorrows, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59653,
  "title": "Mary Enthroned with Christ",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mary enthroned-Miller.jpg",
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59653",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Mary Enthroned with Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59654,
  "title": "Virgin of Guadalupe",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Guadelupe-Miller.jpg",
  "people": [
   "Mary, the mother of Jesus (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59654",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Virgin of Guadalupe, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.millericons.com/."
 },
 {
  "id": 59655,
  "title": "A Mother's Love Holds the World",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mary Holds a World of Wisdom-Miller.jpg",
  "people": [
   "Mary, the mother of Jesus (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59655",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. A Mother's Love Holds the World, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.millericons.com/."
 },
 {
  "id": 59656,
  "title": "Mary of Three Hands",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mary Three Hands-Miller.jpg",
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59656",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Mary of Three Hands, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.millericons.com/."
 },
 {
  "id": 59657,
  "title": "Mary, the Rose without Thorns",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mary, The Rose Without Thorns-Miller.jpg",
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59657",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Mary, the Rose without Thorns, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59658,
  "title": "Mary of the Burning Bush",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mary of the Burning Bush-Miller.jpg",
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59658",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Mary of the Burning Bush, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59672,
  "title": "The Holy Trinity",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Holy Trinity-Miller.jpg",
  "people": [
   "Jesus Christ (Biblical figure)",
   "God (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59672",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. The Holy Trinity, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59673,
  "title": "The Annunciation",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Annunciation-Miller.jpg",
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Gabriel (archangel)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59673",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. The Annunciation, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59674,
  "title": "The Nativity",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Nativity-Miller.jpg",
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59674",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. The Nativity, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59675,
  "title": "John the Baptist",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/John the Baptist-Miller.jpg",
  "people": [
   "John, the Baptist (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59675",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. John the Baptist, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59676,
  "title": "Wedding at Cana",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Wedding at Cana-Miller.jpg",
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59676",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Wedding at Cana, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59677,
  "title": "Peter Walking on Water",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Peter Walking on Water-Miller.jpg",
  "people": [
   "Jesus Christ (Biblical figure)",
   "Peter, the Apostle (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59677",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Peter Walking on Water, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59678,
  "title": "Washing the Feet of the Disciples",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Washing Feet-Miller.jpg",
  "people": [
   "Jesus Christ (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59678",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Washing the Feet of the Disciples, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59679,
  "title": "Transfiguration",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Transfiguration-Miller.jpg",
  "people": [
   "Moses (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Peter, the Apostle (Biblical figure)",
   "John, the Apostle (Biblical figure)",
   "Elijah (Biblical figure)",
   "James the Elder, the Apostle (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59679",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Transfiguration, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59680,
  "title": "Pentecost",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Pentecost 1-Miller.jpg",
  "people": [
   "Disciples (Biblical figures)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59680",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Pentecost, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59681,
  "title": "Pentecost (A Second Version)",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Pentecost 2-Miller.jpg",
  "people": [
   "Disciples (Biblical figures)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59681",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Pentecost (A Second Version), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59682,
  "title": "Holy Baptism",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Baptism-Miller.jpg",
  "people": [
   "Angels (Biblical figures)",
   "Jesus Christ (Biblical figure)",
   "John, the Baptist (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59682",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Holy Baptism, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59683,
  "title": "Extravagant Love",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Extravagant Love-Miller.jpg",
  "people": [
   "Jesus Christ (Biblical figure)",
   "Woman Who Bathed Christs Feet with Tears (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59683",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Extravagant Love, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59684,
  "title": "Doubting Thomas",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Doubting-Miller.jpg",
  "people": [
   "Jesus Christ (Biblical figure)",
   "Thomas, the Apostle (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59684",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Doubting Thomas, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59685,
  "title": "Raising Tabitha",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Raising Tabitha-Miller.jpg",
  "people": [
   "Peter, the Apostle (Biblical figure)",
   "Tabitha (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59685",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Raising Tabitha, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59686,
  "title": "Samaritan at the Well",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Samaritan Woman-Miller.jpg",
  "people": [
   "Jesus Christ (Biblical figure)",
   "Samaritan Woman (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59686",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Samaritan at the Well, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59687,
  "title": "Jesus Casts Out a Demon",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Casting Out Demons-Miller.jpg",
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59687",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Jesus Casts Out a Demon, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59688,
  "title": "First Apostle to the Apostles",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Apostle to the Apostles-Miller.jpg",
  "people": [
   "Jesus Christ (Biblical figure)",
   "Mary Magdalene (Biblical figure)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59688",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. First Apostle to the Apostles, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59763,
  "title": "Peter Walking on Water",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Peter Walking-2389hd-bw.jpg",
  "people": [
   "Jesus Christ (Biblical figure)",
   "Peter, the Apostle (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "act": "https://act.library.vanderbilt.edu/artworks/59763",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Peter Walking on Water, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 }
];
