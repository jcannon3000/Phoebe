/**
 * Art in the Christian Tradition — the Visio Divina catalogue.
 *
 * GENERATED FILE. Do not edit by hand: run
 *   node scripts/fetch-act-catalogue.mjs
 * which re-harvests ACT and re-verifies every licence. That script's header
 * explains why this is fetchable and why each entry is safe to display.
 *
 * Every entry here has been checked individually against the Wikimedia Commons
 * API and came back public domain, CC0, or a CC BY/BY-SA variant — the licence
 * is recorded per entry so the closing slide can name it. Records whose rights
 * could not be resolved were dropped rather than assumed.
 *
 * `img` points at ACT's own S3 host rather than a bundled asset: at 233
 * artworks this collection is far too large to ship inside the app binary, and
 * their host serves only full-size JPEGs (there is no IIIF derivative
 * endpoint). So the image is fetched when the practice opens.
 *
 * `refs` are the passages ACT tags the work to, and they are what lets the
 * image follow the day: visioSelect crosses them against the office's appointed
 * lessons. `days` are ACT's own lectionary labels ("Year B Lent 3rd Sunday"),
 * kept as a cross-check but not used for selection — they're free text, and the
 * passage match is exact. `essay` is a short commentary at thevcs.org —
 * LINKED, never reproduced.
 */

export type CatalogueArtwork = {
  /** ACT's own record id. */
  id: number;
  title: string;
  artist: string | null;
  date: string | null;
  where: string | null;
  img: string;
  refs: string[];
  days: string[];
  essay: string;
  act: string;
  /** The verified licence, named on the closing slide. */
  licence: string;
  attribution: string;
};

export const ACT_CATALOGUE: CatalogueArtwork[] = [
 {
  "id": 46134,
  "title": "Christ Crowned with Thorns",
  "artist": "Van Dyck, Anthony, 1599-1641",
  "date": "1620",
  "where": "Museo del Prado, Madrid, Spain",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Yorck_A_006.jpg",
  "refs": [
   "Matthew 26:14-27:66",
   "Mark 14:1-15:47",
   "Luke 22:14-23:56"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year B Liturgy of Pass",
   "Year C Liturgy of Pass"
  ],
  "essay": "https://thevcs.org/crowning-and-robing/christ-crowned",
  "act": "https://act.library.vanderbilt.edu/artworks/46134",
  "licence": "Public domain",
  "attribution": "Van Dyck, Anthony, 1599-1641. Christ Crowned with Thorns, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46764,
  "title": "Birth of Christ",
  "artist": "La Tour, Georges du Mesnil de, 1593-1652",
  "date": "1645-1648",
  "where": "Museum of Fine Arts of Rennes, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Georges_de_la_Tour_020.jpg",
  "refs": [
   "Ephesians 5:8-14",
   "Psalm 36:5-11"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "Year A Lent 4th Sunday",
   "Year B Holy Monday",
   "Year B Nativity of the Lord Proper I",
   "Year C Nativity of the Lord Proper I"
  ],
  "essay": "https://thevcs.org/children-light/choreography-light",
  "act": "https://act.library.vanderbilt.edu/artworks/46764",
  "licence": "Public domain",
  "attribution": "La Tour, Georges du Mesnil de, 1593-1652. Birth of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46806,
  "title": "Woman at the Window",
  "artist": "Friedrich, Caspar David, 1774-1840",
  "date": "1822",
  "where": "Alte Nationalgalerie, Berlin, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Caspar_David_Friedrich_018.jpg",
  "refs": [
   "Isaiah 5:1-7",
   "Psalm 62:5-12"
  ],
  "days": [
   "Year C Proper 15th Sunday",
   "Year A Proper 22nd Sunday",
   "Year B Epiphany 3rd Sunday"
  ],
  "essay": "https://thevcs.org/soul-desire/i-sought-him-whom-my-soul-loves?first=2131",
  "act": "https://act.library.vanderbilt.edu/artworks/46806",
  "licence": "Public domain",
  "attribution": "Friedrich, Caspar David, 1774-1840. Woman at the Window, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 47441,
  "title": "The Third of May",
  "artist": "Goya, Francisco, 1746-1828",
  "date": "1814",
  "where": "Museo del Prado, Madrid, Spain",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Francisco_de_Goya_y_Lucientes_023.jpg",
  "refs": [
   "Ecclesiastes 3:1-13"
  ],
  "days": [
   "Year A New Year’s Day",
   "Year B New Year’s Day",
   "Year C New Year’s Day"
  ],
  "essay": "https://thevcs.org/everything-season/time-war?first=1466",
  "act": "https://act.library.vanderbilt.edu/artworks/47441",
  "licence": "Public domain",
  "attribution": "Goya, Francisco, 1746-1828. The Third of May, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 47774,
  "title": "Transfiguration",
  "artist": "Angelico, fra, approximately 1400-1455",
  "date": "1450",
  "where": "Museo Nazionale di San Marco, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Fra_Angelico_042.jpg",
  "refs": [
   "Matthew 17:1-9",
   "Mark 9:2-9",
   "Luke 9:28-36, (37-43)",
   "Mark 9:2-8"
  ],
  "days": [
   "Year A Transfiguration Sunday",
   "Year B Transfiguration Sunday",
   "Year C Transfiguration Sunday"
  ],
  "essay": "https://thevcs.org/transfiguration",
  "act": "https://act.library.vanderbilt.edu/artworks/47774",
  "licence": "Public domain",
  "attribution": "Angelico, fra, approximately 1400-1455. Transfiguration, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 47778,
  "title": "Noli Me Tangere - \"Do not hold me.\"",
  "artist": "Angelico, fra, approximately 1400-1455",
  "date": "1450",
  "where": "Museo Nazionale di San Marco, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Fra_Angelico_039.jpg",
  "refs": [
   "John 20:1-18"
  ],
  "days": [
   "Year A Resurrection of the Lord",
   "Year B Resurrection of the Lord"
  ],
  "essay": "https://thevcs.org/noli-me-tangere/making-all-things-new",
  "act": "https://act.library.vanderbilt.edu/artworks/47778",
  "licence": "Public domain",
  "attribution": "Angelico, fra, approximately 1400-1455. Noli Me Tangere - \"Do not hold me.\", from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 48047,
  "title": "Christ Expelling the Money Changers in the Temple",
  "artist": "Greco, 1541?-1614",
  "date": "1600",
  "where": "National Gallery (Great Britain), London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/El_Greco_016.jpg",
  "refs": [
   "Matthew 21:12-16",
   "Mark 11:15-17",
   "Luke 19:45-46",
   "Kings I, 8:(1, 6, 10-11), 22-30, 41-43"
  ],
  "days": [
   "Year B Proper 16th Sunday",
   "Year B Lent 3rd Sunday"
  ],
  "essay": "https://thevcs.org/dedication-temple/space-holy",
  "act": "https://act.library.vanderbilt.edu/artworks/48047",
  "licence": "Public domain",
  "attribution": "Greco, 1541?-1614. Christ Expelling the Money Changers in the Temple, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 48067,
  "title": "Judah and Tamar",
  "artist": "Vernet, Emile-Jean-Horace, 1789-1863",
  "date": "1840",
  "where": "Wallace Collection, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Emile_Jean_Horace_Vernet_001.jpg",
  "refs": [
   "Genesis 38"
  ],
  "days": [],
  "essay": "https://thevcs.org/tamar/double-standards?first=6671",
  "act": "https://act.library.vanderbilt.edu/artworks/48067",
  "licence": "Public domain",
  "attribution": "Vernet, Emile-Jean-Horace, 1789-1863. Judah and Tamar, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 49140,
  "title": "Christ in the House of Mary and Martha",
  "artist": "Velázquez, Diego, 1599-1660",
  "date": "1618",
  "where": "National Gallery (Great Britain), London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Diego_Velazquez_008.jpg",
  "refs": [
   "Luke 10:38-42"
  ],
  "days": [
   "Year C Proper 11th Sunday"
  ],
  "essay": "https://thevcs.org/jesus-visits-martha-and-mary/marthas-shoes",
  "act": "https://act.library.vanderbilt.edu/artworks/49140",
  "licence": "Public domain",
  "attribution": "Velázquez, Diego, 1599-1660. Christ in the House of Mary and Martha, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 49605,
  "title": "Amnon and Tamar",
  "artist": "Steen, Jan, 1626-1679",
  "date": "ca. 1661-1670",
  "where": "Wallraf-Richartz-Museum, Cologne, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jan_Steen_001.jpg",
  "refs": [
   "Samuel II, 13:1-22",
   "Samuel II, 13:1-19"
  ],
  "days": [],
  "essay": "https://thevcs.org/tamar-and-amnon/testosterones-toy?first=2041",
  "act": "https://act.library.vanderbilt.edu/artworks/49605",
  "licence": "Public domain",
  "attribution": "Steen, Jan, 1626-1679. Amnon and Tamar, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 49607,
  "title": "Christ with Mary and Martha",
  "artist": "Vermeer, Johannes, 1632-1675",
  "date": "1654",
  "where": "National Gallery of Scotland, Edinburgh, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jan_Vermeer_van_Delft_004.jpg",
  "refs": [
   "Luke 10:38-42"
  ],
  "days": [
   "Year C Proper 11th Sunday"
  ],
  "essay": "https://thevcs.org/jesus-visits-martha-and-mary/sibling-harmony",
  "act": "https://act.library.vanderbilt.edu/artworks/49607",
  "licence": "Public domain",
  "attribution": "Vermeer, Johannes, 1632-1675. Christ with Mary and Martha, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 49955,
  "title": "Three Youths in the Fiery Furnace",
  "artist": null,
  "date": "3rd century/early 4th century",
  "where": "Catacomb of Priscilla, Rome, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/WK_Fiery_furnace_01.jpg",
  "refs": [
   "Daniel 3"
  ],
  "days": [],
  "essay": "https://thevcs.org/fiery-furnace/baptism-fire?first=4786",
  "act": "https://act.library.vanderbilt.edu/artworks/49955",
  "licence": "Public domain",
  "attribution": "Three Youths in the Fiery Furnace, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 50284,
  "title": "Where Do We Come From? What Are We? Where Are We Going?",
  "artist": "Gauguin, Paul, 1848-1903",
  "date": "1897-1898",
  "where": "Museum of Fine Arts, Boston, Boston, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/MFA_36-270.jpg",
  "refs": [
   "Ecclesiastes 1:2, 12-14; 2:18-23"
  ],
  "days": [
   "Year C Proper 13th Sunday"
  ],
  "essay": "https://thevcs.org/philosophy-pleasure-and-folly/personal-philosophy?first=2321",
  "act": "https://act.library.vanderbilt.edu/artworks/50284",
  "licence": "Public domain",
  "attribution": "Gauguin, Paul, 1848-1903. Where Do We Come From? What Are We? Where Are We Going?, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 51130,
  "title": "Moses Striking the Rock and Bringing Forth the Water",
  "artist": "Bachiacca, 1494-1557",
  "date": "1540-1545",
  "where": "National Gallery of Scotland, Edinburgh, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Yorck_B_001.jpg",
  "refs": [
   "Exodus 17:1-7",
   "Numbers 20:2-13"
  ],
  "days": [
   "Year A Proper 21st Sunday"
  ],
  "essay": "https://thevcs.org/striking-rock/miracle-presence?first=5956",
  "act": "https://act.library.vanderbilt.edu/artworks/51130",
  "licence": "Public domain",
  "attribution": "Bachiacca, 1494-1557. Moses Striking the Rock and Bringing Forth the Water, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54125,
  "title": "Ecce Ancilla Domini! (Behold the Lord's Servant)",
  "artist": "Rossetti, Dante Gabriel, 1828-1882",
  "date": "1849-1850",
  "where": "Tate Britain, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/B_FourthSundayofAdvent.jpg",
  "refs": [
   "Luke 1:26-38"
  ],
  "days": [
   "Year B Advent 4th Sunday"
  ],
  "essay": "https://thevcs.org/annunciation/white-annunciation",
  "act": "https://act.library.vanderbilt.edu/artworks/54125",
  "licence": "Public domain",
  "attribution": "Rossetti, Dante Gabriel, 1828-1882. Ecce Ancilla Domini! (Behold the Lord's Servant), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54223,
  "title": "The prophet Habakkuk",
  "artist": "Donatello, 1386?-1466",
  "date": "ca. 1425",
  "where": "Opera di S. Maria del Fiore (Florence, Italy). Museo, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/zuccone9320idn89.jpg",
  "refs": [
   "Habakkuk 1:1-4; 2:1-4"
  ],
  "days": [
   "Year C Proper 22nd Sunday"
  ],
  "essay": "https://thevcs.org/protest-faith/prophet-high?first=6226",
  "act": "https://act.library.vanderbilt.edu/artworks/54223",
  "licence": "CC BY-SA 4.0",
  "attribution": "Donatello, 1386?-1466. The prophet Habakkuk, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54429,
  "title": "San Clemente - \"Triumph of the Cross\" - mosaics in apse of 12th century church",
  "artist": null,
  "date": "12th century",
  "where": "Basilica of Saint Clement, Rome, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/L42-clemente.jpg",
  "refs": [
   "Matthew 26:14-27:66",
   "Mark 14:1-15:47",
   "Luke 22:14-23:56"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year B Liturgy of Pass",
   "Year C Liturgy of Pass"
  ],
  "essay": "https://thevcs.org/thirsting-god/second-tree-life",
  "act": "https://act.library.vanderbilt.edu/artworks/54429",
  "licence": "Public domain",
  "attribution": "San Clemente - \"Triumph of the Cross\" - mosaics in apse of 12th century church, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54557,
  "title": "Mosaic from Kariye Camii showing Christ enthroned",
  "artist": "Anonymous",
  "date": "1315-1321",
  "where": "Kariye Museum (also known as Kariye Camii or Church of the Holy Savior of Chora), Istanbul, Turkey",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Chora_Church_Constantinople_(6)34.jpg",
  "refs": [
   "John 14:1-14",
   "Peter I, 2:2-10"
  ],
  "days": [
   "Year A Easter 5th Sunday"
  ],
  "essay": "https://thevcs.org/living-stone-and-chosen-people/built-spiritual-house",
  "act": "https://act.library.vanderbilt.edu/artworks/54557",
  "licence": "Public domain",
  "attribution": "Anonymous. Mosaic from Kariye Camii showing Christ enthroned, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54666,
  "title": "Prodigal Son",
  "artist": "Rembrandt Harmenszoon van Rijn, 1606-1669",
  "date": "1636",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/prodigal-rembrandt4.jpg",
  "refs": [
   "Luke 15:1-3, 11b-32"
  ],
  "days": [
   "Year C Lent 4th Sunday"
  ],
  "essay": "https://thevcs.org/lords-prayer/father-forgives-we-forgive",
  "act": "https://act.library.vanderbilt.edu/artworks/54666",
  "licence": "Public domain",
  "attribution": "Rembrandt Harmenszoon van Rijn, 1606-1669. Prodigal Son, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54707,
  "title": "Blinding of Samson, detail",
  "artist": "Rembrandt Harmenszoon van Rijn, 1606-1669",
  "date": "1636",
  "where": "Städel, Frankfurt am Main, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/samson-rembrandt.jpg",
  "refs": [
   "Judges 16:1-22"
  ],
  "days": [],
  "essay": "https://thevcs.org/samson-and-delilah/grim-delight?first=1106",
  "act": "https://act.library.vanderbilt.edu/artworks/54707",
  "licence": "Public domain",
  "attribution": "Rembrandt Harmenszoon van Rijn, 1606-1669. Blinding of Samson, detail, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54731,
  "title": "Good Samaritan",
  "artist": "Rembrandt Harmenszoon van Rijn, 1606-1669",
  "date": "1633",
  "where": "Rijksmuseum Amsterdam, Amsterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/good-rembrandt3.jpg",
  "refs": [
   "Luke 10:25-37"
  ],
  "days": [
   "Year C Proper 10th Sunday"
  ],
  "essay": "https://thevcs.org/good-samaritan/sht-happens",
  "act": "https://act.library.vanderbilt.edu/artworks/54731",
  "licence": "Public domain",
  "attribution": "Rembrandt Harmenszoon van Rijn, 1606-1669. Good Samaritan, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54928,
  "title": "Saint Francis in the Desert",
  "artist": "Bellini, Giovanni, 1426?-1516",
  "date": "1480",
  "where": "Frick Collection, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/bellini-francis.jpg",
  "refs": [
   "Psalm 139:1-6, 13-18",
   "Philippians 4:1-9"
  ],
  "days": [
   "Year C Proper 18th Sunday",
   "Year A Proper 23rd Sunday"
  ],
  "essay": "https://thevcs.org/exhortation-attentiveness/rejoice-lord-always",
  "act": "https://act.library.vanderbilt.edu/artworks/54928",
  "licence": "Public domain",
  "attribution": "Bellini, Giovanni, 1426?-1516. Saint Francis in the Desert, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55038,
  "title": "Disciples John and Peter on their way to the tomb on Easter morning",
  "artist": "Burnand, Eugène, 1850-1921",
  "date": "1898",
  "where": "Musee d'Orsay, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/burnandjean.jpg",
  "refs": [
   "John 20:1-18",
   "Peter I, 1:3-9"
  ],
  "days": [
   "Year A Resurrection of the Lord",
   "Year B Resurrection of the Lord",
   "Year A Easter 2nd Sunday"
  ],
  "essay": "https://thevcs.org/where-angels-long-look",
  "act": "https://act.library.vanderbilt.edu/artworks/55038",
  "licence": "Public domain",
  "attribution": "Burnand, Eugène, 1850-1921. Disciples John and Peter on their way to the tomb on Easter morning, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55312,
  "title": "Anointing of David",
  "artist": null,
  "date": "10th century",
  "where": "Bibliothèque nationale de France, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Paris_psaulter_gr139_fol3v.jpg",
  "refs": [
   "Samuel II, 5:1-5, 9-10",
   "Samuel I, 16:1-13"
  ],
  "days": [
   "Year B Proper 9th Sunday",
   "Year A Lent 4th Sunday"
  ],
  "essay": "https://thevcs.org/anointing-david/sacred-rule",
  "act": "https://act.library.vanderbilt.edu/artworks/55312",
  "licence": "Public domain",
  "attribution": "Anointing of David, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55346,
  "title": "Sermon on the Mount",
  "artist": "Bruegel, Jan, 1568-1625",
  "date": "1598",
  "where": "Getty Center, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Sermon_on_the_Mount8.jpg",
  "refs": [
   "Matthew 5:1-12",
   "Luke 6:17-26"
  ],
  "days": [
   "Year A Epiphany 4thSunday",
   "Year C Epiphany 6th Sunday"
  ],
  "essay": "https://thevcs.org/sermon-mount/righteousness-heart?first=1676",
  "act": "https://act.library.vanderbilt.edu/artworks/55346",
  "licence": "Public domain",
  "attribution": "Bruegel, Jan, 1568-1625. Sermon on the Mount, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55366,
  "title": "Brow of the Hill Near Nazareth",
  "artist": "Tissot, James, 1836-1902",
  "date": "ca. 1886-1894",
  "where": "Brooklyn Museum, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Brow_of_the_Hill.jpg",
  "refs": [
   "Luke 4:21-30"
  ],
  "days": [
   "Year C Epiphany 4thSunday"
  ],
  "essay": "https://thevcs.org/open-unexpected/brow-hill",
  "act": "https://act.library.vanderbilt.edu/artworks/55366",
  "licence": "Public domain",
  "attribution": "Tissot, James, 1836-1902. Brow of the Hill Near Nazareth, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55553,
  "title": "Eastern Orthodox icon of Jesus Christ as the True Vine",
  "artist": null,
  "date": "16th century",
  "where": "Byzantine and Christian Museum, Athens, Greece",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Christ_the_True_Vin-icon.jpg",
  "refs": [
   "John 15:1-8",
   "Psalm 80:1-2, 8-19"
  ],
  "days": [
   "Year C Proper 15th Sunday",
   "Year B Easter 5th Sunday"
  ],
  "essay": "https://thevcs.org/subversive-horticulture/cultivation",
  "act": "https://act.library.vanderbilt.edu/artworks/55553",
  "licence": "Public domain",
  "attribution": "Eastern Orthodox icon of Jesus Christ as the True Vine, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55613,
  "title": "Mount Horeb, Sinai",
  "artist": "Frith, Francis",
  "date": "1858",
  "where": "J. Paul Getty Museum, Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/frith-horeb.jpg",
  "refs": [
   "Kings I, 19:1-18",
   "Exodus 19:2-8a"
  ],
  "days": [
   "Year C Proper 7th Sunday",
   "Year A Proper 6th Sunday"
  ],
  "essay": "https://thevcs.org/sinai-calling/sinai-still",
  "act": "https://act.library.vanderbilt.edu/artworks/55613",
  "licence": "Public domain",
  "attribution": "Frith, Francis. Mount Horeb, Sinai, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55647,
  "title": "The Course of Empire. Desolation",
  "artist": "Cole, Thomas, 1801-1848",
  "date": "1836",
  "where": "New York Historical Society, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Desolation_Thomas_Cole_1836.jpg",
  "refs": [
   "Jeremiah 4:11-12, 22-28",
   "Daniel 7:1-3, 15-18"
  ],
  "days": [
   "Year B All Saints Day",
   "Year C Proper 19th Sunday"
  ],
  "essay": "https://thevcs.org/daniels-four-beasts/collapse?first=6471",
  "act": "https://act.library.vanderbilt.edu/artworks/55647",
  "licence": "Public domain",
  "attribution": "Cole, Thomas, 1801-1848. The Course of Empire. Desolation, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55695,
  "title": "Jeremiah lamenting the destruction of Jerusalem",
  "artist": "Rembrandt Harmenszoon van Rijn, 1606-1669",
  "date": "1630",
  "where": "Rijksmuseum Amsterdam, Amsterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jeremiah-destruction-Jerusalem.jpg",
  "refs": [
   "Jeremiah 8:18-9:1",
   "Jeremiah 4:11-12, 22-28"
  ],
  "days": [
   "Year A Proper 17th Sunday",
   "Year C Proper 20th Sunday",
   "Year C Proper 19th Sunday"
  ],
  "essay": "https://thevcs.org/raising-standards/my-anguish-my-anguish?first=4261",
  "act": "https://act.library.vanderbilt.edu/artworks/55695",
  "licence": "Public domain",
  "attribution": "Rembrandt Harmenszoon van Rijn, 1606-1669. Jeremiah lamenting the destruction of Jerusalem, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55720,
  "title": "Rich Man and the Poor Lazarus",
  "artist": "Terbrugghen, Hendrik, 1588?-1629",
  "date": "1625",
  "where": "Centraal Museum, Utrecht, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Hendrick_ter_Brugghen-rich-laz.jpg",
  "refs": [
   "Luke 16:19-31"
  ],
  "days": [
   "Year C Proper 21st Sunday"
  ],
  "essay": "https://thevcs.org/reversal-fortunes/textured-story",
  "act": "https://act.library.vanderbilt.edu/artworks/55720",
  "licence": "Public domain",
  "attribution": "Terbrugghen, Hendrik, 1588?-1629. Rich Man and the Poor Lazarus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55968,
  "title": "Israelites Gathering Manna",
  "artist": "Roberti, Ercole de', -1496",
  "date": "ca. 1490-1499",
  "where": "National Gallery (Great Britain), London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Ercole_de_Roberti_mann39572.jpg",
  "refs": [
   "Exodus 16:2-15"
  ],
  "days": [
   "Year A Proper 20th Sunday",
   "",
   "Year B Proper 13th Sunday"
  ],
  "essay": "https://thevcs.org/manna-desert/stage-journey",
  "act": "https://act.library.vanderbilt.edu/artworks/55968",
  "licence": "Public domain",
  "attribution": "Roberti, Ercole de', -1496. Israelites Gathering Manna, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56665,
  "title": "Widow's Mite",
  "artist": "Tissot, James, 1836-1902",
  "date": "1886-1894",
  "where": "Brooklyn Museum, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/tissot-widow-2389479709830hd832.jpg",
  "refs": [
   "Mark 12:38-44",
   "Mark 12:41-44",
   "Luke 20:45-21:4"
  ],
  "days": [
   "Year C Proper 20th Sunday",
   "Year B Proper 27th Sunday"
  ],
  "essay": "https://thevcs.org/widows-mite/all-she-had-left-give?first=5901",
  "act": "https://act.library.vanderbilt.edu/artworks/56665",
  "licence": "Public domain",
  "attribution": "Tissot, James, 1836-1902. Widow's Mite, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56713,
  "title": "John the Baptist Preaching",
  "artist": "Ghirlandaio, Domenico, 1449-1494",
  "date": "ca. 1486-1490",
  "where": "Santa Maria Novella, Florence, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/preaching8219734js0-h5827.jpg",
  "refs": [
   "John 1:29-42",
   "Luke 3:7-18"
  ],
  "days": [
   "Year C Epiphany 2nd Sunday",
   "Year C Advent 3rd Sunday"
  ],
  "essay": "https://thevcs.org/misidentifying-prophet/visual-hierarchies",
  "act": "https://act.library.vanderbilt.edu/artworks/56713",
  "licence": "Public domain",
  "attribution": "Ghirlandaio, Domenico, 1449-1494. John the Baptist Preaching, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56885,
  "title": "Supper at Emmaus",
  "artist": "Caravaggio, Michelangelo Merisi da, 1573-1610",
  "date": "1601",
  "where": "National Gallery (Great Britain), London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/supper410qwa.jpg",
  "refs": [
   "Luke 24:13-35",
   "Luke 24:13-49"
  ],
  "days": [
   "Year A Easter 3rd Sunday",
   "Year A Resurrection of the Lord",
   "Year B Resurrection of the Lord",
   "Year C Resurrection of the Lord"
  ],
  "essay": "https://thevcs.org/road-emmaus/simultaneity-and-surprise",
  "act": "https://act.library.vanderbilt.edu/artworks/56885",
  "licence": "Public domain",
  "attribution": "Caravaggio, Michelangelo Merisi da, 1573-1610. Supper at Emmaus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57260,
  "title": "Tribute Money",
  "artist": "Masaccio, 1401-1428",
  "date": "1424-1428",
  "where": "Brancacci Chapel, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/tribute89023jr87.jpg",
  "refs": [
   "Matthew 22:15-22",
   "Matthew 17:22-27"
  ],
  "days": [
   "Year A Proper 24th Sunday"
  ],
  "essay": "https://thevcs.org/tribute-money/space-and-time?first=6601",
  "act": "https://act.library.vanderbilt.edu/artworks/57260",
  "licence": "Public domain",
  "attribution": "Masaccio, 1401-1428. Tribute Money, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57355,
  "title": "The Entombment of Christ",
  "artist": "Caravaggio, Michelangelo Merisi da, 1573-1610",
  "date": "ca. 1600-1604",
  "where": "Vatican Museums, Vatican City",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/entombbsw2796hfl02z.jpg",
  "refs": [
   "John 18:1-19:42"
  ],
  "days": [
   "Year A Good Friday",
   "Year B Good Friday",
   "Year C Good Friday"
  ],
  "essay": "https://thevcs.org/birth-church/descent-ascent",
  "act": "https://act.library.vanderbilt.edu/artworks/57355",
  "licence": "Public domain",
  "attribution": "Caravaggio, Michelangelo Merisi da, 1573-1610. The Entombment of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57953,
  "title": "Storm on the Sea of Galilee",
  "artist": "Rembrandt Harmenszoon van Rijn, 1606-1669",
  "date": "1633",
  "where": "Unknown",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/rembrandt9023r9gggyty6r54e.jpg",
  "refs": [
   "Mark 4:35-41",
   "Psalm 93"
  ],
  "days": [
   "Year A Ascension of the Lord",
   "Year B Ascension of the Lord",
   "Year C Ascension of the Lord",
   "Year B Proper 7th Sunday"
  ],
  "essay": "https://thevcs.org/over-troubled-water/waters-rise?first=3046",
  "act": "https://act.library.vanderbilt.edu/artworks/57953",
  "licence": "Public domain",
  "attribution": "Rembrandt Harmenszoon van Rijn, 1606-1669. Storm on the Sea of Galilee, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58171,
  "title": "Good Samaritan",
  "artist": "Bassano, Jacopo, approximately 1518-1592",
  "date": "ca. 1562-1563",
  "where": "National Gallery (Great Britain), Westminster, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/good3562456d3fd.jpg",
  "refs": [
   "Luke 10:25-37"
  ],
  "days": [
   "Year C Proper 10th Sunday"
  ],
  "essay": "https://thevcs.org/good-samaritan/go-and-do-likewise",
  "act": "https://act.library.vanderbilt.edu/artworks/58171",
  "licence": "Public domain",
  "attribution": "Bassano, Jacopo, approximately 1518-1592. Good Samaritan, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58179,
  "title": "Flight by Night",
  "artist": "Tanner, Henry Ossawa, 1859-1937",
  "date": "1923",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Ossawa_Tanner_Henry_Flight_into_Egypt.jpg",
  "refs": [
   "Matthew 2:13-23"
  ],
  "days": [
   "Year A Christmas 1st Sunday"
  ],
  "essay": "https://thevcs.org/flight-egypt/flight-night",
  "act": "https://act.library.vanderbilt.edu/artworks/58179",
  "licence": "Public domain",
  "attribution": "Tanner, Henry Ossawa, 1859-1937. Flight by Night, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58310,
  "title": "St Joseph and the Christ Child",
  "artist": "Greco, 1541?-1614",
  "date": "ca. 1600",
  "where": "Museum of Santa Cruz, Toledo, Spain",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/joseph23289h387h73sg276f6.jpg",
  "refs": [
   "Matthew 2:13-23"
  ],
  "days": [
   "Year A Christmas 1st Sunday"
  ],
  "essay": "https://thevcs.org/return-egypt/shepherding-good-shepherd/",
  "act": "https://act.library.vanderbilt.edu/artworks/58310",
  "licence": "Public domain",
  "attribution": "Greco, 1541?-1614. St Joseph and the Christ Child, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58311,
  "title": "Massacre of the Innocents",
  "artist": "Poussin, Nicolas, 1594?-1665",
  "date": "ca. 1632-1637",
  "where": "Musée Condé, Chantilly, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/poussin3e37eg67eg63fxp1.jpg",
  "refs": [
   "Matthew 2:13-23"
  ],
  "days": [
   "Year A Christmas 1st Sunday"
  ],
  "essay": "https://thevcs.org/massacre-innocents/tragedy-and-nobility/",
  "act": "https://act.library.vanderbilt.edu/artworks/58311",
  "licence": "Public domain",
  "attribution": "Poussin, Nicolas, 1594?-1665. Massacre of the Innocents, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58321,
  "title": "Sermon on the Mount",
  "artist": "Angelico, fra, approximately 1400-1455",
  "date": "ca. 1442",
  "where": "Museo Nazionale di San Marco, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Fra_Angelico_Sermon_on_the_Mount (1).jpg",
  "refs": [
   "Matthew 5:1-12",
   "Matthew 7:21-29"
  ],
  "days": [
   "Year A Epiphany 4thSunday",
   "Year A Epiphany 9th Sunday"
  ],
  "essay": "https://thevcs.org/sermon-mount/summit-law",
  "act": "https://act.library.vanderbilt.edu/artworks/58321",
  "licence": "Public domain",
  "attribution": "Angelico, fra, approximately 1400-1455. Sermon on the Mount, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58323,
  "title": "Bible of the Poor",
  "artist": null,
  "date": "1450-1465",
  "where": "Cleveland Museum of Art, Cleveland, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/biblia3897fbg25z0.jpg",
  "refs": [
   "Matthew 4:1-11",
   "Luke 11:1-13",
   "Luke 4:1-13"
  ],
  "days": [
   "Year A Lent 1st Sunday",
   "Year C Proper 12th Sunday",
   "Year C Lent 1st Sunday"
  ],
  "essay": "https://thevcs.org/lords-prayer/tempted-satan-and-delivered-through-christ",
  "act": "https://act.library.vanderbilt.edu/artworks/58323",
  "licence": "CC0",
  "attribution": "Bible of the Poor, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58325,
  "title": "Christ and the Woman with the Issue of Blood",
  "artist": null,
  "date": "4th century",
  "where": "Catacombs of Saints Marcellinus and Peter, Rome, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/woman478fh65f67g6y.jpg",
  "refs": [
   "Matthew 9:20-22",
   "Mark 5:21-43",
   "Luke 8:43-47"
  ],
  "days": [
   "Year B Proper 8th Sunday"
  ],
  "essay": "https://thevcs.org/woman-issue-blood/wide-eyed-wonder",
  "act": "https://act.library.vanderbilt.edu/artworks/58325",
  "licence": "Public domain",
  "attribution": "Christ and the Woman with the Issue of Blood, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58327,
  "title": "The Sower III (version 2)",
  "artist": "Gogh, Vincent van, 1853-1890",
  "date": "1888",
  "where": "Van Gogh Museum, Amsterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/sower-gogh39uh23erf.jpg",
  "refs": [
   "Mark 4:1-11",
   "Luke 8:4-15",
   "Matthew 13:1-9, 18-23"
  ],
  "days": [
   "Year B Proper 6th Sunday",
   "Year A Proper 10th Sunday"
  ],
  "essay": "https://thevcs.org/parable-sower/there-went-out-sower-sow",
  "act": "https://act.library.vanderbilt.edu/artworks/58327",
  "licence": "Public domain",
  "attribution": "Gogh, Vincent van, 1853-1890. The Sower III (version 2), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58328,
  "title": "There Will Be No Miracles Here",
  "artist": "Coley, Nathan, 1967-",
  "date": "2007-2009",
  "where": "Scottish National Gallery of Modern Art, Edinburgh, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/miracles36d6t.jpg",
  "refs": [
   "Mark 6:1-13",
   "Luke 4:21-30"
  ],
  "days": [
   "Year B Proper 9th Sunday",
   "Year C Epiphany 4thSunday"
  ],
  "essay": "https://thevcs.org/open-unexpected/there-will-be-no-miracles-here",
  "act": "https://act.library.vanderbilt.edu/artworks/58328",
  "licence": "CC BY-SA 4.0",
  "attribution": "Coley, Nathan, 1967-. There Will Be No Miracles Here, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58329,
  "title": "Entry into Jerusalem",
  "artist": "T'oros Roslin, active 13th century",
  "date": "1262",
  "where": "Walters Art Museum, Baltimore, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/entry-toros893uhif.jpg",
  "refs": [
   "Luke 19:28-40",
   "Matthew 21:1-11",
   "Mark 11:1-11",
   "John 12:12-16"
  ],
  "days": [
   "Year C Liturgy of Palms",
   "Year A Liturgy of Palms",
   "Year B Liturgy of Palms"
  ],
  "essay": "https://thevcs.org/christs-triumphal-entry/image-and-prophecy",
  "act": "https://act.library.vanderbilt.edu/artworks/58329",
  "licence": "CC0",
  "attribution": "T'oros Roslin, active 13th century. Entry into Jerusalem, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58331,
  "title": "Wise Virgins",
  "artist": "Küng, Erhart, approximately 1420-1507",
  "date": "ca. 1460-1481",
  "where": "Bern Minster, Bern, Switzerland",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/virgins287g301mz0.jpg",
  "refs": [
   "Matthew 25:1-13"
  ],
  "days": [
   "Year A Proper 27th Sunday"
  ],
  "essay": "https://thevcs.org/wise-and-foolish-maidens/heart-it-all",
  "act": "https://act.library.vanderbilt.edu/artworks/58331",
  "licence": "CC BY 3.0",
  "attribution": "Küng, Erhart, approximately 1420-1507. Wise Virgins, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58332,
  "title": "Allegory of Mercy",
  "artist": null,
  "date": "1342-1352",
  "where": "Bigallo Museum, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Madonna_miseri3289yd76t.jpg",
  "refs": [
   "Matthew 25:31-46"
  ],
  "days": [
   "Year A Reign of Christ"
  ],
  "essay": "https://thevcs.org/sheep-and-goats/what-you-give-what-you-get",
  "act": "https://act.library.vanderbilt.edu/artworks/58332",
  "licence": "Public domain",
  "attribution": "Allegory of Mercy, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58334,
  "title": "Institution of the Eucharist",
  "artist": "Roberti, Ercole de', -1496",
  "date": "ca. 1490-1499",
  "where": "National Gallery (Great Britain), London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/euchar9028got98238w976e.jpg",
  "refs": [
   "Matthew 26:14-27:66",
   "Mark 14:1-15:47",
   "Luke 22:14-23:56"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year B Liturgy of Pass",
   "Year C Liturgy of Pass"
  ],
  "essay": "https://thevcs.org/last-supper/last-supper",
  "act": "https://act.library.vanderbilt.edu/artworks/58334",
  "licence": "Public domain",
  "attribution": "Roberti, Ercole de', -1496. Institution of the Eucharist, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58354,
  "title": "Annunciation, Mary",
  "artist": null,
  "date": "ca. 1151",
  "where": "Palatine Chapel, Palermo, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/annun-mary2398e6trds.jpg",
  "refs": [
   "Luke 1:26-38",
   "Luke 11:1-13"
  ],
  "days": [
   "Year B Advent 4th Sunday",
   "Year C Proper 12th Sunday"
  ],
  "essay": "https://thevcs.org/lords-prayer/virgin-prays-thy-will-be-done",
  "act": "https://act.library.vanderbilt.edu/artworks/58354",
  "licence": "CC BY 2.0",
  "attribution": "Annunciation, Mary, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58355,
  "title": "Christ Bound and Crowned with Thorns",
  "artist": "Solario, Andrea, approximately 1465-approximately 1520",
  "date": "ca. 1509",
  "where": "Philadelphia Museum of Art, Philadelphia, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/thorns2398ygty65tr.jpg",
  "refs": [
   "Matthew 26:14-27:66",
   "Mark 14:1-15:47",
   "Luke 22:14-23:56"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year B Liturgy of Pass",
   "Year C Liturgy of Pass"
  ],
  "essay": "https://thevcs.org/crowning-and-robing/christ-bound",
  "act": "https://act.library.vanderbilt.edu/artworks/58355",
  "licence": "Public domain",
  "attribution": "Solario, Andrea, approximately 1465-approximately 1520. Christ Bound and Crowned with Thorns, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58356,
  "title": "Crucifixion",
  "artist": "Mantegna, Andrea, 1431-1506",
  "date": "1457-1459",
  "where": "Louvre, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/mantegna28hu73ftvgs89ygtyfcf.jpg",
  "refs": [
   "Matthew 26:14-27:66",
   "Mark 14:1-15:47",
   "Luke 22:14-23:56"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year B Liturgy of Pass",
   "Year C Liturgy of Pass"
  ],
  "essay": "https://thevcs.org/casting-lots/die-cast",
  "act": "https://act.library.vanderbilt.edu/artworks/58356",
  "licence": "Public domain",
  "attribution": "Mantegna, Andrea, 1431-1506. Crucifixion, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58357,
  "title": "Passion and Crucifixion of Christ",
  "artist": "Luini, Bernardino, 1475?-1533?",
  "date": "1529",
  "where": "Church of Santa Maria degli Angeli, Lugano, Switzerland",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/luini39ijg782g76gvhj.jpg",
  "refs": [
   "Matthew 26:14-27:66",
   "Mark 14:1-15:47",
   "Luke 22:14-23:56",
   "John 18:1-19:42"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year B Liturgy of Pass",
   "Year C Liturgy of Pass",
   "Year A Good Friday"
  ],
  "essay": "https://thevcs.org/casting-lots/opposite-charity",
  "act": "https://act.library.vanderbilt.edu/artworks/58357",
  "licence": "Public domain",
  "attribution": "Luini, Bernardino, 1475?-1533?. Passion and Crucifixion of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58358,
  "title": "Lamentation over the Dead Christ",
  "artist": "Mantegna, Andrea, 1431-1506",
  "date": "ca. 1483",
  "where": "Pinacoteca di Brera, Milan, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/dead98jnge78tg.jpg",
  "refs": [
   "Matthew 27:57-66",
   "Mark 15:1-39, (40-47)",
   "John 19:38-42"
  ],
  "days": [
   "Year B Liturgy of Pass",
   "Year A Holy Saturday"
  ],
  "essay": "https://thevcs.org/burial-christ/burial-christ",
  "act": "https://act.library.vanderbilt.edu/artworks/58358",
  "licence": "Public domain",
  "attribution": "Mantegna, Andrea, 1431-1506. Lamentation over the Dead Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58359,
  "title": "Entombment (or Christ being carried to his Tomb)",
  "artist": "Michelangelo Buonarroti, 1475-1564",
  "date": "ca. 1500-1501",
  "where": "National Gallery (Great Britain), London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/michel3987tgyr5ft.jpg",
  "refs": [
   "Matthew 27:57-66",
   "John 19:38-42"
  ],
  "days": [
   "Year A Holy Saturday"
  ],
  "essay": "https://thevcs.org/burial-christ/burial-christ",
  "act": "https://act.library.vanderbilt.edu/artworks/58359",
  "licence": "Public domain",
  "attribution": "Michelangelo Buonarroti, 1475-1564. Entombment (or Christ being carried to his Tomb), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58360,
  "title": "St. Sisoes at the Tomb of Alexander of Macedon",
  "artist": null,
  "date": "1500-1599",
  "where": "Varlaam Monastery, Meteora, Greece",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Varlaam52398hundyu78utgy.jpg",
  "refs": [
   "Mark 9:38-50"
  ],
  "days": [
   "Year B Proper 21st Sunday",
   "Year B Proper 28th Sunday"
  ],
  "essay": "https://thevcs.org/road-oblivion/i-cannot-believe-my-eyes",
  "act": "https://act.library.vanderbilt.edu/artworks/58360",
  "licence": "Public domain",
  "attribution": "St. Sisoes at the Tomb of Alexander of Macedon, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58361,
  "title": "New Harmony",
  "artist": "Klee, Paul, 1879-1940",
  "date": "1936",
  "where": "Solomon R. Guggenheim Museum, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/klee98932hu67tf34r5f4.jpg",
  "refs": [
   "Mark 10:17-31"
  ],
  "days": [
   "Year B Proper 23rd Sunday"
  ],
  "essay": "https://thevcs.org/rich-young-man/hearing-colours-newly-arranged",
  "act": "https://act.library.vanderbilt.edu/artworks/58361",
  "licence": "Public domain",
  "attribution": "Klee, Paul, 1879-1940. New Harmony, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58362,
  "title": "Composite Camel with Attendant",
  "artist": null,
  "date": "ca. 1550-1575",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/camel54908urfiu82t5.jpg",
  "refs": [
   "Mark 10:17-31"
  ],
  "days": [
   "Year B Proper 23rd Sunday"
  ],
  "essay": "https://thevcs.org/rich-young-man/visualizing-impossibility",
  "act": "https://act.library.vanderbilt.edu/artworks/58362",
  "licence": "CC0",
  "attribution": "Composite Camel with Attendant, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58363,
  "title": "Annunciation with St. Margaret and St. Ansanus",
  "artist": "Martini, Simone, 1283-1344, Lippo Memmi",
  "date": "1333",
  "where": "Uffizi Gallery, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/martini32897gh56trgf.jpg",
  "refs": [
   "Luke 1:26-38"
  ],
  "days": [
   "Year B Advent 4th Sunday",
   "Year C Day of Pentecost"
  ],
  "essay": "https://thevcs.org/annunciation/angels-greeting",
  "act": "https://act.library.vanderbilt.edu/artworks/58363",
  "licence": "Public domain",
  "attribution": "Martini, Simone, 1283-1344, Lippo Memmi. Annunciation with St. Margaret and St. Ansanus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58364,
  "title": "Annunciation",
  "artist": "Lippi, Filippo, approximately 1406-1469",
  "date": "ca. 1450-1453",
  "where": "National Gallery (Great Britain), London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lippi398hubd78ytg.jpg",
  "refs": [
   "Luke 1:26-38"
  ],
  "days": [
   "Year B Advent 4th Sunday"
  ],
  "essay": "https://thevcs.org/annunciation/openings",
  "act": "https://act.library.vanderbilt.edu/artworks/58364",
  "licence": "Public domain",
  "attribution": "Lippi, Filippo, approximately 1406-1469. Annunciation, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58365,
  "title": "Visitation",
  "artist": "Pontormo, Jacopo da, 1494-1556",
  "date": "1514-1516",
  "where": "Santissima Annunziata (Florence), Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/visit2389328987fbhj476tfcfr5.jpg",
  "refs": [
   "Luke 1:39-57"
  ],
  "days": [
   "Year A Visitation of Mary to Elizabeth"
  ],
  "essay": "https://thevcs.org/quickening-creation/mary-ark",
  "act": "https://act.library.vanderbilt.edu/artworks/58365",
  "licence": "CC BY 3.0",
  "attribution": "Pontormo, Jacopo da, 1494-1556. Visitation, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58366,
  "title": "Visitation",
  "artist": null,
  "date": "14th century",
  "where": "Timios Stavros (Pelendri), Pelendri, Cyprus",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Visitation_Pelendri2389uhd78g.jpg",
  "refs": [
   "Luke 1:39-57"
  ],
  "days": [
   "Year A Visitation of Mary to Elizabeth",
   ""
  ],
  "essay": "https://thevcs.org/quickening-creation/re-visiting-creation",
  "act": "https://act.library.vanderbilt.edu/artworks/58366",
  "licence": "Public domain",
  "attribution": "Visitation, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58367,
  "title": "Visitation",
  "artist": "Greco, 1541?-1614",
  "date": "ca. 1610-1614",
  "where": "Dumbarton Oaks, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/La_Visitacion_El_Greco3298uhduyu76.jpg",
  "refs": [
   "Luke 1:39-57"
  ],
  "days": [
   "Year A Visitation of Mary to Elizabeth"
  ],
  "essay": "https://thevcs.org/quickening-creation/beginning-again",
  "act": "https://act.library.vanderbilt.edu/artworks/58367",
  "licence": "Public domain",
  "attribution": "Greco, 1541?-1614. Visitation, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58368,
  "title": "Adoration of the Shepherds",
  "artist": "Maíno, Juan Bautista, 1581-1649",
  "date": "1615-1620",
  "where": "Meadows Museum, Dallas, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/nativity079iyjg89iuyjg57utjgm.jpg",
  "refs": [
   "Luke 2:(1-7), 8-20"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I"
  ],
  "essay": "https://thevcs.org/adoration-shepherds/world-turned-upside-down",
  "act": "https://act.library.vanderbilt.edu/artworks/58368",
  "licence": "Public domain",
  "attribution": "Maíno, Juan Bautista, 1581-1649. Adoration of the Shepherds, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58369,
  "title": "Nativity with the Annunciation to the Shepherds and the Adoration of the Shepherds",
  "artist": null,
  "date": "1370-1371",
  "where": "National Gallery (Great Britain), London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/cione84378ryu4361245e4s.jpg",
  "refs": [
   "Luke 2:(1-7), 8-20"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I"
  ],
  "essay": "https://thevcs.org/adoration-shepherds/people-walked-darkness",
  "act": "https://act.library.vanderbilt.edu/artworks/58369",
  "licence": "Public domain",
  "attribution": "Nativity with the Annunciation to the Shepherds and the Adoration of the Shepherds, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58370,
  "title": "Good Samaritan",
  "artist": null,
  "date": "500-599",
  "where": "Cattedrale Maria Santissima Achiropita (Rossano), Rossano, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/good437847654763684hbr.jpg",
  "refs": [
   "Luke 10:25-37"
  ],
  "days": [
   "Year C Proper 10th Sunday"
  ],
  "essay": "https://thevcs.org/good-samaritan/samaritan-jesus",
  "act": "https://act.library.vanderbilt.edu/artworks/58370",
  "licence": "Public domain",
  "attribution": "Good Samaritan, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58373,
  "title": "Kitchen Scene with Christ at Emmaus",
  "artist": "Beuckelaer, Joachim, approximately 1533-1575",
  "date": "ca. 1560-1565",
  "where": "Mauritshuis, The Hague, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/kitchenscene4yr29o1.jpg",
  "refs": [
   "Luke 24:13-35"
  ],
  "days": [
   "Year A Easter 3rd Sunday"
  ],
  "essay": "https://thevcs.org/road-emmaus/abundance-and-dissimulation",
  "act": "https://act.library.vanderbilt.edu/artworks/58373",
  "licence": "Public domain",
  "attribution": "Beuckelaer, Joachim, approximately 1533-1575. Kitchen Scene with Christ at Emmaus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58374,
  "title": "Christ Disappearing at Emmaus",
  "artist": "Fuseli, Henry, 1741-1825",
  "date": "1792",
  "where": "Yale Center for British Art, New Haven, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/christdisappearing5r1mp0x8.jpg",
  "refs": [
   "Luke 24:13-49"
  ],
  "days": [
   "Year A Resurrection of the Lord"
  ],
  "essay": "https://thevcs.org/road-emmaus/visible-vanishing",
  "act": "https://act.library.vanderbilt.edu/artworks/58374",
  "licence": "Public domain",
  "attribution": "Fuseli, Henry, 1741-1825. Christ Disappearing at Emmaus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58375,
  "title": "Preaching of Saint John the Baptist",
  "artist": "Bruegel, Pieter, 1564-1638",
  "date": "1566",
  "where": "Museum of Fine Arts, Budapest, Budapest, Hungary",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/sermon328956732huc.jpg",
  "refs": [
   "John 1:29-42",
   "Luke 3:7-18"
  ],
  "days": [
   "Year A Epiphany 2nd Sunday",
   "Year C Advent 3rd Sunday",
   "Year B Advent 2nd  Sunday"
  ],
  "essay": "https://thevcs.org/misidentifying-prophet/picturing-attention-and-inattention",
  "act": "https://act.library.vanderbilt.edu/artworks/58375",
  "licence": "Public domain",
  "attribution": "Bruegel, Pieter, 1564-1638. Preaching of Saint John the Baptist, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58376,
  "title": "Christ Blessing Saint John the Baptist",
  "artist": "Moretto, da Brescia, 1498?-1554",
  "date": "ca. 1520-1523",
  "where": "National Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/christblessing1r4f6d9n.jpg",
  "refs": [
   "John 1:29-42"
  ],
  "days": [
   "Year A Epiphany 2nd Sunday"
  ],
  "essay": "https://thevcs.org/misidentifying-prophet/postures-humility",
  "act": "https://act.library.vanderbilt.edu/artworks/58376",
  "licence": "Public domain",
  "attribution": "Moretto, da Brescia, 1498?-1554. Christ Blessing Saint John the Baptist, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58377,
  "title": "Christ and the Samaritan Woman",
  "artist": "Fontana, Lavinia, 1552-1614",
  "date": "1607",
  "where": "National Museum of Capodimonte, Naples, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/christsamaritan45rfvb13.jpg",
  "refs": [
   "John 4:5-42"
  ],
  "days": [
   "Year A Lent 3rd Sunday"
  ],
  "essay": "https://thevcs.org/woman-well/pioneer-empowered",
  "act": "https://act.library.vanderbilt.edu/artworks/58377",
  "licence": "Public domain",
  "attribution": "Fontana, Lavinia, 1552-1614. Christ and the Samaritan Woman, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58379,
  "title": "Christ at the Pool of Bethesda",
  "artist": "Hogarth, William, 1697-1764",
  "date": "1735-1736",
  "where": "St Bartholomew's Hospital, Bart Museum, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/christbethesda4r1m5g9s.jpg",
  "refs": [
   "John 5:1-9"
  ],
  "days": [
   "Year C Easter 6th Sunday"
  ],
  "essay": "https://thevcs.org/pool-bethesda/healing-hospital",
  "act": "https://act.library.vanderbilt.edu/artworks/58379",
  "licence": "CC BY 4.0",
  "attribution": "Hogarth, William, 1697-1764. Christ at the Pool of Bethesda, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58381,
  "title": "Golgotha",
  "artist": "Munch, Edvard, 1863-1944",
  "date": "1900",
  "where": "Munch Museum, Oslo, Norway",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/golgotha92kw05vp.jpg",
  "refs": [
   "Matthew 26:14-27:66",
   "Mark 14:1-15:47",
   "Luke 22:14-23:56"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year B Liturgy of Pass",
   "Year C Liturgy of Pass"
  ],
  "essay": "https://thevcs.org/imaging-trinity/rejected",
  "act": "https://act.library.vanderbilt.edu/artworks/58381",
  "licence": "Public domain",
  "attribution": "Munch, Edvard, 1863-1944. Golgotha, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58383,
  "title": "Trinity, Book of Hours, Royal 2 B XV f. 10v",
  "artist": null,
  "date": "1500",
  "where": "British Library, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/trinityhours85hb1k9z.jpg",
  "refs": [
   "John 10:22-30"
  ],
  "days": [
   "Year C Easter 4th Sunday"
  ],
  "essay": "https://thevcs.org/imaging-trinity/father-and-i-are-one",
  "act": "https://act.library.vanderbilt.edu/artworks/58383",
  "licence": "Public domain",
  "attribution": "Trinity, Book of Hours, Royal 2 B XV f. 10v, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58384,
  "title": "Raising of Lazarus",
  "artist": "Piombo, Sebastiano Luciani, known as del, 1485-1547",
  "date": "1517-1519",
  "where": "National Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/raisinglazarus27bout19.jpg",
  "refs": [
   "John 11:1-45"
  ],
  "days": [
   "Year A Lent 5th  Sunday"
  ],
  "essay": "https://thevcs.org/i-am-resurrection-and-life/lazarus-come-out",
  "act": "https://act.library.vanderbilt.edu/artworks/58384",
  "licence": "Public domain",
  "attribution": "Piombo, Sebastiano Luciani, known as del, 1485-1547. Raising of Lazarus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58385,
  "title": "Triptych of the Micault Family",
  "artist": "Vermeyen, Jan Cornelisz, 1500-1559",
  "date": "ca. 1539-1559",
  "where": "Royal Museum of Fine Arts of Belgium, Brussels, Belgium",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/micaultfamily8t3n5b1v.jpg",
  "refs": [
   "John 11:1-45"
  ],
  "days": [
   "Year A Lent 5th  Sunday"
  ],
  "essay": "https://thevcs.org/i-am-resurrection-and-life/unbind-him-and-let-him-go",
  "act": "https://act.library.vanderbilt.edu/artworks/58385",
  "licence": "Public domain",
  "attribution": "Vermeyen, Jan Cornelisz, 1500-1559. Triptych of the Micault Family, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58386,
  "title": "Raising of Lazarus",
  "artist": "Duccio, di Buoninsegna, -1319?",
  "date": "ca. 1310-1311",
  "where": "Kimbell Art Museum, Fort Worth, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/raisinglazarus5ghut193.jpg",
  "refs": [
   "John 11:1-45"
  ],
  "days": [
   "Year A Lent 5th  Sunday"
  ],
  "essay": "https://thevcs.org/i-am-resurrection-and-life/take-away-stone",
  "act": "https://act.library.vanderbilt.edu/artworks/58386",
  "licence": "Public domain",
  "attribution": "Duccio, di Buoninsegna, -1319?. Raising of Lazarus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58387,
  "title": "Vertumnus",
  "artist": "Arcimboldi, Giuseppe, 1527-1593",
  "date": "1590",
  "where": "Skokloster Castle, Habo Municipality, Sweden",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/vertumnus4g0h1mx8.jpg",
  "refs": [
   "John 15:1-8"
  ],
  "days": [
   "Year B Easter 5th Sunday"
  ],
  "essay": "https://thevcs.org/subversive-horticulture/restoration",
  "act": "https://act.library.vanderbilt.edu/artworks/58387",
  "licence": "Public domain",
  "attribution": "Arcimboldi, Giuseppe, 1527-1593. Vertumnus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58388,
  "title": "Saint Sebastian",
  "artist": "Sodoma, 1477?-1549",
  "date": "1525",
  "where": "Palazzo Pitti, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/saintsebastian23edco91.jpg",
  "refs": [
   "John 15:18-27"
  ],
  "days": [],
  "essay": "https://thevcs.org/disciples-and-world/they-will-persecute-you",
  "act": "https://act.library.vanderbilt.edu/artworks/58388",
  "licence": "Public domain",
  "attribution": "Sodoma, 1477?-1549. Saint Sebastian, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58389,
  "title": "Christ Taking Leave of the Apostles",
  "artist": "Duccio, di Buoninsegna, -1319?",
  "date": "1308-1311",
  "where": "Museo dell'Opera del Duomo, Siena, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/christleave35ty10px.jpg",
  "refs": [
   "John 16:16-24"
  ],
  "days": [],
  "essay": "https://thevcs.org/presence-beyond-absence/vital-conversations",
  "act": "https://act.library.vanderbilt.edu/artworks/58389",
  "licence": "Public domain",
  "attribution": "Duccio, di Buoninsegna, -1319?. Christ Taking Leave of the Apostles, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58390,
  "title": "Mary Magdalene",
  "artist": "Savoldo, Gian Girolamo, approximately 1480-",
  "date": "ca. 1535-1540",
  "where": "National Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/marymagdalene30jp1m6v.jpg",
  "refs": [
   "John 20:1-18"
  ],
  "days": [
   "Year B Resurrection of the Lord"
  ],
  "essay": "https://thevcs.org/mary-magdalene-tomb/rising-light",
  "act": "https://act.library.vanderbilt.edu/artworks/58390",
  "licence": "Public domain",
  "attribution": "Savoldo, Gian Girolamo, approximately 1480-. Mary Magdalene, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58391,
  "title": "Ark of the Covenant",
  "artist": null,
  "date": "806-811",
  "where": "Oratory at Germigny-des-Prés, Germigny-des-Prés, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/arkcovenant1fgpq956.jpg",
  "refs": [
   "John 20:1-18"
  ],
  "days": [
   "Year A Resurrection of the Lord"
  ],
  "essay": "https://thevcs.org/mary-magdalene-tomb/grave-clothes-lying-there",
  "act": "https://act.library.vanderbilt.edu/artworks/58391",
  "licence": "CC BY-SA 4.0",
  "attribution": "Ark of the Covenant, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58392,
  "title": "Noli me Tangere",
  "artist": "Titian, approximately 1488-1576",
  "date": "ca. 1514",
  "where": "National Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/nolimetangere5g1m4n7r.jpg",
  "refs": [
   "John 20:1-18"
  ],
  "days": [
   "Year A Resurrection of the Lord"
  ],
  "essay": "https://thevcs.org/noli-me-tangere/heaven-and-earth-converge-meeting-lines",
  "act": "https://act.library.vanderbilt.edu/artworks/58392",
  "licence": "Public domain",
  "attribution": "Titian, approximately 1488-1576. Noli me Tangere, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58393,
  "title": "Christ Displaying His Wounds",
  "artist": "Galli, Giovanni Antonio, 1585-1652",
  "date": "ca. 1625-1635",
  "where": "Perth Museum and Art Gallery, Perth, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/christwounds4t8x9q1k.jpg",
  "refs": [
   "John 20:19-31"
  ],
  "days": [
   "Year A Easter 2nd Sunday",
   "Year C Easter 2nd Sunday"
  ],
  "essay": "https://thevcs.org/doubting-thomas/because-thou-hast-seen-me",
  "act": "https://act.library.vanderbilt.edu/artworks/58393",
  "licence": "Public domain",
  "attribution": "Galli, Giovanni Antonio, 1585-1652. Christ Displaying His Wounds, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58394,
  "title": "Incredulity of St. Thomas",
  "artist": "Strozzi, Bernardo, 1581-1644",
  "date": "ca. 1620",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Bernardo_Strozzi_The_Incredulity_of_Saint_Thomas.jpg",
  "refs": [
   "John 20:19-31"
  ],
  "days": [
   "Year A Easter 2nd Sunday",
   "Year B Easter 2nd Sunday",
   "Year C Easter 2nd Sunday"
  ],
  "essay": "https://thevcs.org/doubting-thomas/blessed-are-they-have-not-seen",
  "act": "https://act.library.vanderbilt.edu/artworks/58394",
  "licence": "Public domain",
  "attribution": "Strozzi, Bernardo, 1581-1644. Incredulity of St. Thomas, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58395,
  "title": "Ascension and Pentecost",
  "artist": null,
  "date": "1050-1100",
  "where": "Monasterio de Santo Domingo de Silos, Santo Domingo de Silos, Spain",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ascensionpentecost4f6s8e1o.jpg",
  "refs": [
   "Acts 1:1-11",
   "Luke 24:44-53",
   "Acts 2:1-21"
  ],
  "days": [
   "Year A Ascension of the Lord",
   "Year A Day of Pentecost"
  ],
  "essay": "https://thevcs.org/pentecost/ups-and-downs",
  "act": "https://act.library.vanderbilt.edu/artworks/58395",
  "licence": "Public domain",
  "attribution": "Ascension and Pentecost, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58396,
  "title": "Pentecost",
  "artist": null,
  "date": "11th century",
  "where": "Hosios Loukas Monastery, Hosios Loukas, Greece",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/pentecost1p7k2m4f.jpg",
  "refs": [
   "Acts 2:1-21"
  ],
  "days": [
   "Year A Day of Pentecost"
  ],
  "essay": "https://thevcs.org/pentecost/power-preach",
  "act": "https://act.library.vanderbilt.edu/artworks/58396",
  "licence": "CC BY-SA 3.0",
  "attribution": "Pentecost, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58398,
  "title": "Stoning of Saint Stephen",
  "artist": "Lotto, Lorenzo, 1480?-1556?",
  "date": "1513-1516",
  "where": "Accademia Carrara, Bergamo, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Lotto_Lorenzo_Stoning_of_Saint_Stephen.jpg",
  "refs": [
   "Acts 7:55-60"
  ],
  "days": [
   "Year A Easter 5th Sunday"
  ],
  "essay": "https://thevcs.org/stoning-stephen/sharing-passion-christ",
  "act": "https://act.library.vanderbilt.edu/artworks/58398",
  "licence": "Public domain",
  "attribution": "Lotto, Lorenzo, 1480?-1556?. Stoning of Saint Stephen, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58399,
  "title": "Stoning of St. Stephen",
  "artist": "Carpaccio, Vittore, 1455?-1525?",
  "date": "1520",
  "where": "Staatsgalerie Stuttgart, Stuttgart, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/stoningstephen2b6j1s3w.jpg",
  "refs": [
   "Acts 7:55-60"
  ],
  "days": [
   "Year A Easter 5th Sunday"
  ],
  "essay": "https://thevcs.org/stoning-stephen/incomprehension-and-seed-faith",
  "act": "https://act.library.vanderbilt.edu/artworks/58399",
  "licence": "Public domain",
  "attribution": "Carpaccio, Vittore, 1455?-1525?. Stoning of St. Stephen, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58400,
  "title": "Composition of Hagia Sophia",
  "artist": null,
  "date": "13th century",
  "where": "Hagia Sophia, Istanbul, Turkey",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/deesis06kh9u87.jpg",
  "refs": [
   "Romans 3:24-25"
  ],
  "days": [
   "Year A Ash Wednesday"
  ],
  "essay": "https://thevcs.org/grace-works/he-might-be-just-and-justifier",
  "act": "https://act.library.vanderbilt.edu/artworks/58400",
  "licence": "Public domain",
  "attribution": "Composition of Hagia Sophia, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58401,
  "title": "Magic Apple Tree",
  "artist": "Palmer, Samuel, 1805-1881",
  "date": "ca. 1830",
  "where": "Fitzwilliam Museum, Cambridge, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/magicapple4t8b3m2p.jpg",
  "refs": [
   "Romans 12:1-8"
  ],
  "days": [
   "Year A Proper 16th Sunday"
  ],
  "essay": "https://thevcs.org/be-transformed/fruitfulness-and-transfiguration",
  "act": "https://act.library.vanderbilt.edu/artworks/58401",
  "licence": "Public domain",
  "attribution": "Palmer, Samuel, 1805-1881. Magic Apple Tree, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58404,
  "title": "Self-Portrait with Fur-Trimmed Robe",
  "artist": "Dürer, Albrecht, 1471-1528",
  "date": "1500",
  "where": "Alte Pinakothek, Munich, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/durerself3916gnwr.jpg",
  "refs": [
   "Corinthians II, 3:12-4:2"
  ],
  "days": [
   "Year C Transfiguration Sunday"
  ],
  "essay": "https://thevcs.org/glory-glory-advancing/paradox-portraiture",
  "act": "https://act.library.vanderbilt.edu/artworks/58404",
  "licence": "Public domain",
  "attribution": "Dürer, Albrecht, 1471-1528. Self-Portrait with Fur-Trimmed Robe, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58405,
  "title": "Jali Lattice Window",
  "artist": null,
  "date": "ca. 1572",
  "where": "Humayun's Tomb, Delhi, India",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/jaalilattice4h6j8a3r.jpg",
  "refs": [
   "Corinthians II, 3:12-4:2"
  ],
  "days": [
   "Year C Transfiguration Sunday"
  ],
  "essay": "https://thevcs.org/glory-glory-advancing/beyond-veil",
  "act": "https://act.library.vanderbilt.edu/artworks/58405",
  "licence": "CC BY-SA 2.0",
  "attribution": "Jali Lattice Window, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58406,
  "title": "Processional Cross",
  "artist": null,
  "date": "ca. 1150-1175",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/processionalcross12hb98xk.jpg",
  "refs": [
   "Ephesians 2:11-22"
  ],
  "days": [
   "Year B Proper 11th Sunday"
  ],
  "essay": "https://thevcs.org/flight-egypt/flight-night",
  "act": "https://act.library.vanderbilt.edu/artworks/58406",
  "licence": "CC BY-SA 2.5",
  "attribution": "Processional Cross, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58408,
  "title": "Woman on the Stairs",
  "artist": "Friedrich, Caspar David, 1774-1840",
  "date": "ca. 1825",
  "where": "Pomeranian State Museum, Greifswald, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/womanstairs5y1m9x7w.jpg",
  "refs": [
   "Ephesians 5:8-14"
  ],
  "days": [
   "Year A Lent 4th Sunday"
  ],
  "essay": "https://thevcs.org/children-light/what-kind-light",
  "act": "https://act.library.vanderbilt.edu/artworks/58408",
  "licence": "Public domain",
  "attribution": "Friedrich, Caspar David, 1774-1840. Woman on the Stairs, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58409,
  "title": "Shadow of Death",
  "artist": "Hunt, William Holman, 1827-1910",
  "date": "ca. 1870-1873",
  "where": "Manchester City Art Gallery, Manchester, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/shadowdeath2084fkqp.jpg",
  "refs": [
   "Philippians 2:5-11"
  ],
  "days": [
   "Year B Holy Name of Jesus"
  ],
  "essay": "https://thevcs.org/christ-hymn/being-found-human-form",
  "act": "https://act.library.vanderbilt.edu/artworks/58409",
  "licence": "Public domain",
  "attribution": "Hunt, William Holman, 1827-1910. Shadow of Death, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58410,
  "title": "Still Life of Flowers and Grapes encircling a Monstrance in a Niche",
  "artist": "Kessel, Jan van, 1626-1679",
  "date": "ca. 1670",
  "where": "National Gallery of Scotland, Edinburgh, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/stillflowers12rewm97.jpg",
  "refs": [
   "Philippians 4:1-9"
  ],
  "days": [
   "Year A Proper 23rd Sunday"
  ],
  "essay": "https://thevcs.org/flight-egypt/flight-night",
  "act": "https://act.library.vanderbilt.edu/artworks/58410",
  "licence": "Public domain",
  "attribution": "Kessel, Jan van, 1626-1679. Still Life of Flowers and Grapes encircling a Monstrance in a Niche, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58411,
  "title": "Pantocrator, God the Son, as the Creator of the Universe",
  "artist": null,
  "date": "ca. 1226-1234",
  "where": "Catedral de Toledo, Toledo, Spain",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/pantocrator4tg7uj8.jpg",
  "refs": [
   "Colossians 1:1-14",
   "Colossians 1:11-20"
  ],
  "days": [
   "Year C Proper 10th Sunday",
   "Year C Reign of Christ"
  ],
  "essay": "https://thevcs.org/cosmic-christ-and-his-gospel/pantocrator-mother-creation",
  "act": "https://act.library.vanderbilt.edu/artworks/58411",
  "licence": "Public domain",
  "attribution": "Pantocrator, God the Son, as the Creator of the Universe, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58414,
  "title": "Angelus Novus",
  "artist": "Klee, Paul, 1879-1940",
  "date": "1920",
  "where": "Israel Museum, Jerusalem, Israel",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/angelusnovus53bo1c9d.jpg",
  "refs": [
   "Thessalonians I, 5:1-11"
  ],
  "days": [
   "Year A Proper 28th Sunday"
  ],
  "essay": "https://thevcs.org/faith-hope-and-love/angels-hinterland",
  "act": "https://act.library.vanderbilt.edu/artworks/58414",
  "licence": "Public domain",
  "attribution": "Klee, Paul, 1879-1940. Angelus Novus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58415,
  "title": "Self-Portrait between the Clock and the Bed",
  "artist": "Munch, Edvard, 1863-1944",
  "date": "1940-1943",
  "where": "Munch Museum, Oslo, Norway",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/selfmunch46gw19km.jpg",
  "refs": [
   "Thessalonians I, 5:1-11"
  ],
  "days": [
   "Year A Proper 28th Sunday"
  ],
  "essay": "https://thevcs.org/faith-hope-and-love/be-alert",
  "act": "https://act.library.vanderbilt.edu/artworks/58415",
  "licence": "Public domain",
  "attribution": "Munch, Edvard, 1863-1944. Self-Portrait between the Clock and the Bed, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58425,
  "title": "Slave pen, Alexandria, Va",
  "artist": null,
  "date": "1861-1865",
  "where": "Library of Congress, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/slavepen91vb0z4d.jpg",
  "refs": [
   "Timothy I, 6:6-19"
  ],
  "days": [
   "Year C Proper 21st Sunday"
  ],
  "essay": "https://thevcs.org/slaves-and-masters-rich-and-poor/pen-mighty",
  "act": "https://act.library.vanderbilt.edu/artworks/58425",
  "licence": "Public domain",
  "attribution": "Slave pen, Alexandria, Va, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58427,
  "title": "Blood of the Redeemer",
  "artist": "Bellini, Giovanni, 1426?-1516",
  "date": "ca. 1465",
  "where": "National Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/bloodredeemer49m1t0xp.jpg",
  "refs": [
   "Hebrews 9:11-15"
  ],
  "days": [
   "Year B Proper 26th Sunday"
  ],
  "essay": "https://thevcs.org/sanctuary-not-made-hands/drink-immortality",
  "act": "https://act.library.vanderbilt.edu/artworks/58427",
  "licence": "Public domain",
  "attribution": "Bellini, Giovanni, 1426?-1516. Blood of the Redeemer, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58432,
  "title": "David is Anointed and Affirmed as King",
  "artist": null,
  "date": "3rd century",
  "where": "Dura Europos, Salhiyé, Syria",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/dura932jng78hjb43n.jpg",
  "refs": [
   "Samuel II, 5:1-5, 9-10",
   "Samuel I, 16:1-13"
  ],
  "days": [
   "Year B Proper 9th Sunday",
   "Year A Lent 4th Sunday"
  ],
  "essay": "https://thevcs.org/anointing-david/gods-saving-hand-history",
  "act": "https://act.library.vanderbilt.edu/artworks/58432",
  "licence": "Public domain",
  "attribution": "David is Anointed and Affirmed as King, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58433,
  "title": "Madonna Hodegetria",
  "artist": "Tedice, Enrico di",
  "date": "ca. 1250",
  "where": "Bargello, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/madw9843jhd7g.jpg",
  "refs": [
   "Hebrews 10:5-10"
  ],
  "days": [
   "Year C Advent 4th Sunday"
  ],
  "essay": "https://thevcs.org/willing-victim-his-birth/new-way",
  "act": "https://act.library.vanderbilt.edu/artworks/58433",
  "licence": "Public domain",
  "attribution": "Tedice, Enrico di. Madonna Hodegetria, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58434,
  "title": "Coronation of the Virgin",
  "artist": "Angelico, fra, approximately 1400-1455",
  "date": "ca. 1435",
  "where": "Uffizi Gallery, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/fra9032jknf87213w4sx1a.jpg",
  "refs": [
   "James 1:17-27"
  ],
  "days": [
   "Year B Proper 17th Sunday"
  ],
  "essay": "https://thevcs.org/movement-spheres/crown-life",
  "act": "https://act.library.vanderbilt.edu/artworks/58434",
  "licence": "Public domain",
  "attribution": "Angelico, fra, approximately 1400-1455. Coronation of the Virgin, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58435,
  "title": "Narcissus",
  "artist": "Caravaggio, Michelangelo Merisi da, 1573-1610",
  "date": "ca. 1597-1599",
  "where": "Galleria Nazionale d'Arte Antica, Rome, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Narcissus3298dhj236tgdr54.jpg",
  "refs": [
   "James 1:17-27"
  ],
  "days": [
   "Year B Proper 17th Sunday"
  ],
  "essay": "https://thevcs.org/movement-spheres/circle-self",
  "act": "https://act.library.vanderbilt.edu/artworks/58435",
  "licence": "Public domain",
  "attribution": "Caravaggio, Michelangelo Merisi da, 1573-1610. Narcissus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58436,
  "title": "Rondanini Pietà",
  "artist": "Michelangelo Buonarroti, 1475-1564",
  "date": "1553-1564",
  "where": "Sforza Castle, Milan, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Michelangelo_pi3288ydhty65.jpg",
  "refs": [
   "Peter I, 2:2-10"
  ],
  "days": [
   "Year A Easter 5th Sunday"
  ],
  "essay": "https://thevcs.org/living-stone-and-chosen-people/rejected-mortals",
  "act": "https://act.library.vanderbilt.edu/artworks/58436",
  "licence": "CC BY-SA 3.0",
  "attribution": "Michelangelo Buonarroti, 1475-1564. Rondanini Pietà, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58437,
  "title": "Christ appearing to Saint Peter on the Appian Way",
  "artist": "Carracci, Annibale, 1560-1609",
  "date": "1601-1602",
  "where": "National Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/christappearing3r6h9s1d.jpg",
  "refs": [
   "Peter I, 4:12-14; 5:6-11"
  ],
  "days": [
   "Year A Easter 7th Sunday"
  ],
  "essay": "https://thevcs.org/finding-meaning-suffering/named-and-unashamed",
  "act": "https://act.library.vanderbilt.edu/artworks/58437",
  "licence": "Public domain",
  "attribution": "Carracci, Annibale, 1560-1609. Christ appearing to Saint Peter on the Appian Way, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58438,
  "title": "Last Judgment",
  "artist": "Lochner, Stefan, approximately 1410-1451",
  "date": "ca. 1435",
  "where": "Wallraf-Richartz-Museum, Cologne, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lastjudgment6y1b9z0a.jpg",
  "refs": [
   "Matthew 25:31-46"
  ],
  "days": [
   "Year A New Year’s Day"
  ],
  "essay": "https://thevcs.org/finding-meaning-suffering/beginning-household-god",
  "act": "https://act.library.vanderbilt.edu/artworks/58438",
  "licence": "Public domain",
  "attribution": "Lochner, Stefan, approximately 1410-1451. Last Judgment, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58439,
  "title": "Destruction of Sodom and Gomorrah",
  "artist": "Martin, John, 1789-1854",
  "date": "1852",
  "where": "Laing Art Gallery, Newcastle upon Tyne, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/destructionsodom4613gmpq.jpg",
  "refs": [
   "Peter II, 3:8-15a"
  ],
  "days": [
   "Year B Advent 2nd  Sunday"
  ],
  "essay": "https://thevcs.org/fire/inferno",
  "act": "https://act.library.vanderbilt.edu/artworks/58439",
  "licence": "Public domain",
  "attribution": "Martin, John, 1789-1854. Destruction of Sodom and Gomorrah, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58440,
  "title": "Nataraja, Shiva as the Lord of Dance",
  "artist": null,
  "date": "11th century",
  "where": "Cleveland Museum of Art, Cleveland, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/shivadance4671bwqs.jpg",
  "refs": [
   "Peter II, 3:8-15a"
  ],
  "days": [
   "Year B Advent 2nd  Sunday"
  ],
  "essay": "https://thevcs.org/fire/ring-fire",
  "act": "https://act.library.vanderbilt.edu/artworks/58440",
  "licence": "CC0",
  "attribution": "Nataraja, Shiva as the Lord of Dance, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58441,
  "title": "Division of the Light from the Darkness",
  "artist": "Nash, Paul, 1889-1946",
  "date": "1924",
  "where": "Fine Arts Museums of San Francisco, San Francisco, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/divisionlight845gme1k.jpg",
  "refs": [
   "Genesis 1:1-5"
  ],
  "days": [
   "Year B Baptism of the Lord"
  ],
  "essay": "https://thevcs.org/let-there-be-light/light-chaos",
  "act": "https://act.library.vanderbilt.edu/artworks/58441",
  "licence": "CC BY 4.0",
  "attribution": "Nash, Paul, 1889-1946. Division of the Light from the Darkness, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58442,
  "title": "Creation of Light",
  "artist": "Martin, John, 1789-1854",
  "date": "1824",
  "where": "Cleveland Museum of Art, Cleveland, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/creationlight31jp94vw.jpg",
  "refs": [
   "Genesis 1:1-2:4a"
  ],
  "days": [
   "Year A Trinity Sunday"
  ],
  "essay": "https://thevcs.org/let-there-be-light/dawn-creation",
  "act": "https://act.library.vanderbilt.edu/artworks/58442",
  "licence": "Public domain",
  "attribution": "Martin, John, 1789-1854. Creation of Light, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58443,
  "title": "Pietà",
  "artist": "Vecchietta, approximately 1412-1480",
  "date": "1448-1450",
  "where": "Diocesan Museum, Oratory of the Compagnia di San Bernardino, Siena, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/pieta3289fh76t.jpg",
  "refs": [
   "Genesis 3:8-15"
  ],
  "days": [
   "Year B Proper 5th Sunday"
  ],
  "essay": "https://thevcs.org/crushing-serpent/his-own-devotion",
  "act": "https://act.library.vanderbilt.edu/artworks/58443",
  "licence": "CC BY-SA 3.0",
  "attribution": "Vecchietta, approximately 1412-1480. Pietà, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58444,
  "title": "Noah's Ark on the Mount Ararat",
  "artist": "Myle, Simon de",
  "date": "1570",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/arknn5vu37dt6t.jpg",
  "refs": [
   "Genesis 6:9-22; 7:24; 8:14-19",
   "Genesis 7:1-5, 11-18; 8:6-18; 9:8-13"
  ],
  "days": [
   "Year A Easter Vigil",
   "Year A Proper 4th Sunday"
  ],
  "essay": "https://thevcs.org/out-ark/life-abundance",
  "act": "https://act.library.vanderbilt.edu/artworks/58444",
  "licence": "Public domain",
  "attribution": "Myle, Simon de. Noah's Ark on the Mount Ararat, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58445,
  "title": "Madonna and Child with St Anne",
  "artist": "Caravaggio, Michelangelo Merisi da, 1573-1610",
  "date": "1606",
  "where": "Galleria Borghese, Rome, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Madonna_with_the_Serpent2347.jpg",
  "refs": [
   "Genesis 3:8-15"
  ],
  "days": [
   "Year B Proper 5th Sunday"
  ],
  "essay": "https://thevcs.org/crushing-serpent/rejected-masterpiece",
  "act": "https://act.library.vanderbilt.edu/artworks/58445",
  "licence": "Public domain",
  "attribution": "Caravaggio, Michelangelo Merisi da, 1573-1610. Madonna and Child with St Anne, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58446,
  "title": "Exit from Noah's Ark",
  "artist": "Bedford Master, active 1415-1430",
  "date": "ca. 1410-1430",
  "where": "British Library, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/exitark1048gpqm.jpg",
  "refs": [
   "Genesis 6:9-22; 7:24; 8:14-19",
   "Genesis 7:1-5, 11-18; 8:6-18; 9:8-13"
  ],
  "days": [
   "Year A Easter Vigil",
   "Year A Proper 4th Sunday"
  ],
  "essay": "https://thevcs.org/out-ark/new-world-miniature",
  "act": "https://act.library.vanderbilt.edu/artworks/58446",
  "licence": "Public domain",
  "attribution": "Bedford Master, active 1415-1430. Exit from Noah's Ark, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58447,
  "title": "Rainbow Dome",
  "artist": "Foppa, Vincenzo, active 1459-1490",
  "date": "ca. 1462-1468",
  "where": "Basilica of Sant'Eustorgio, Portinari Chapel, Milan, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/dome39gj68j5am.jpg",
  "refs": [
   "Genesis 7:1-5, 11-18; 8:6-18; 9:8-13"
  ],
  "days": [
   "Year A Easter Vigil",
   "Year B Easter Vigil",
   "Year C Easter Vigil"
  ],
  "essay": "https://thevcs.org/first-rainbow/rainbow",
  "act": "https://act.library.vanderbilt.edu/artworks/58447",
  "licence": "CC BY 3.0",
  "attribution": "Foppa, Vincenzo, active 1459-1490. Rainbow Dome, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58465,
  "title": "Hospitality of Abraham",
  "artist": "Rublev, Andreĭ, Saint, -approximately 1430",
  "date": "ca. 1420",
  "where": "Tretyakov Gallery, Moscow, Russia",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/hospitalityabe298ght1y.jpg",
  "refs": [
   "Genesis 18:1-15, (21:1-7)",
   "Genesis 18:1-10a"
  ],
  "days": [
   "Year C Trinity Sunday",
   "Year A Trinity Sunday",
   "Year B Trinity Sunday",
   "Year A Proper 6th Sunday",
   "Year C Proper 11th Sunday"
  ],
  "essay": "https://thevcs.org/hospitality-abraham",
  "act": "https://act.library.vanderbilt.edu/artworks/58465",
  "licence": "Public domain",
  "attribution": "Rublev, Andreĭ, Saint, -approximately 1430. Hospitality of Abraham, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58466,
  "title": "Hagar",
  "artist": "Lewis, Edmonia",
  "date": "1875",
  "where": "Smithsonian American Art Museum, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/hagar3056gcxw.jpg",
  "refs": [
   "Genesis 21:8-21"
  ],
  "days": [
   "Year A Proper 7th Sunday"
  ],
  "essay": "https://thevcs.org/get-out/wilderness",
  "act": "https://act.library.vanderbilt.edu/artworks/58466",
  "licence": "CC0",
  "attribution": "Lewis, Edmonia. Hagar, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58467,
  "title": "Wooded Landscape with Abraham and Isaac",
  "artist": "Bruegel, Jan, 1568-1625",
  "date": "1599",
  "where": "National Museum of Western Art, Tokyo, Japan",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/woodabeisaac471bnm9x.jpg",
  "refs": [
   "Genesis 22:1-18"
  ],
  "days": [
   "Year A Proper 8th Sunday"
  ],
  "essay": "https://thevcs.org/journey-moriah/figures-landscape",
  "act": "https://act.library.vanderbilt.edu/artworks/58467",
  "licence": "Public domain",
  "attribution": "Bruegel, Jan, 1568-1625. Wooded Landscape with Abraham and Isaac, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58468,
  "title": "Vision of the Sermon (Jacob Wrestling with the Angel)",
  "artist": "Gauguin, Paul, 1848-1903",
  "date": "1888",
  "where": "Scottish National Gallery, Edinburgh, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/visionjacob82vo1f3s.jpg",
  "refs": [
   "Genesis 32:22-31"
  ],
  "days": [
   "Year A Proper 13th Sunday",
   "Year C Proper 24th Sunday"
  ],
  "essay": "https://thevcs.org/jacob-wrestling-angel/one-who-wont-let-go",
  "act": "https://act.library.vanderbilt.edu/artworks/58468",
  "licence": "Public domain",
  "attribution": "Gauguin, Paul, 1848-1903. Vision of the Sermon (Jacob Wrestling with the Angel), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58469,
  "title": "Joseph Sent to Shechem by Jacob",
  "artist": null,
  "date": "ca. 500-550",
  "where": "Austrian National Library, Vienna, Austria",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/josephshechem84th1k9s.jpg",
  "refs": [
   "Genesis 37:1-4, 12-28"
  ],
  "days": [
   "Year A Proper 14th Sunday"
  ],
  "essay": "https://thevcs.org/joseph-sold/behold-dreamer-cometh",
  "act": "https://act.library.vanderbilt.edu/artworks/58469",
  "licence": "Public domain",
  "attribution": "Joseph Sent to Shechem by Jacob, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58470,
  "title": "Roundel Illustrating Episodes from the Biblical Story of Joseph",
  "artist": null,
  "date": "7th century",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/roundeljoseph3bn5j8d.jpg",
  "refs": [
   "Genesis 37:1-4, 12-28"
  ],
  "days": [
   "Year A Proper 14th Sunday"
  ],
  "essay": "https://thevcs.org/joseph-sold/story-comes-full-circle",
  "act": "https://act.library.vanderbilt.edu/artworks/58470",
  "licence": "CC0",
  "attribution": "Roundel Illustrating Episodes from the Biblical Story of Joseph, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58471,
  "title": "Miriam's Song of Praise",
  "artist": "Hensel, Wilhelm, 1794-1861",
  "date": "1836",
  "where": "Royal Collection of the British Royal Family, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/miriamsong8rghm143.jpg",
  "refs": [
   "Exodus 15:1b-11, 20-21"
  ],
  "days": [
   "Year A Proper 19th Sunday"
  ],
  "essay": "https://thevcs.org/song-miriam/composer-songs",
  "act": "https://act.library.vanderbilt.edu/artworks/58471",
  "licence": "Public domain",
  "attribution": "Hensel, Wilhelm, 1794-1861. Miriam's Song of Praise, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58472,
  "title": "Dance of Miriam and Preparation for Seder",
  "artist": null,
  "date": "ca. 1320-1330",
  "where": "British Library, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/dancemiriam58df01pm.jpg",
  "refs": [
   "Exodus 15:1b-11, 20-21"
  ],
  "days": [
   "Year A Proper 19th Sunday"
  ],
  "essay": "https://thevcs.org/song-miriam/frame-drum",
  "act": "https://act.library.vanderbilt.edu/artworks/58472",
  "licence": "Public domain",
  "attribution": "Dance of Miriam and Preparation for Seder, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58473,
  "title": "Bread plate 'Waste Not Want Not'",
  "artist": "Pugin, Augustus Welby Northmore, 1812-1852",
  "date": "ca. 1850",
  "where": "Cleveland Museum of Art, Cleveland, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Augustus_Northmore_Bread_plate_waste_not_want_not.jpg",
  "refs": [
   "Exodus 16:2-4, 9-15",
   "Exodus 16:2-15"
  ],
  "days": [
   "Year A Proper 20th Sunday",
   "Year B Proper 13th Sunday"
  ],
  "essay": "https://thevcs.org/manna-desert/give-us-day",
  "act": "https://act.library.vanderbilt.edu/artworks/58473",
  "licence": "Public domain",
  "attribution": "Pugin, Augustus Welby Northmore, 1812-1852. Bread plate 'Waste Not Want Not', from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58474,
  "title": "Iconoclasts and the Crucifixion",
  "artist": null,
  "date": "ca. 850",
  "where": "State Historical Museum, Moscow, Russia",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/crucifixiconoclast84gh5k1b.jpg",
  "refs": [
   "Exodus 20:1-17"
  ],
  "days": [
   "Year B Lent 3rd Sunday"
  ],
  "essay": "https://thevcs.org/second-commandment/vandalizing-byzantine-iconoclasts",
  "act": "https://act.library.vanderbilt.edu/artworks/58474",
  "licence": "Public domain",
  "attribution": "Iconoclasts and the Crucifixion, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58475,
  "title": "Icon on the Triumph of Orthodoxy",
  "artist": null,
  "date": "ca. 1400",
  "where": "British Museum, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/triumphorthodoxy4912dfvc.jpg",
  "refs": [
   "Exodus 20:1-17"
  ],
  "days": [
   "Year B Lent 3rd Sunday"
  ],
  "essay": "https://thevcs.org/second-commandment/victorious-icons",
  "act": "https://act.library.vanderbilt.edu/artworks/58475",
  "licence": "Public domain",
  "attribution": "Icon on the Triumph of Orthodoxy, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58476,
  "title": "Adoration of the Golden Calf",
  "artist": "Poussin, Nicolas, 1594?-1665",
  "date": "1633-1634",
  "where": "National Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/adorationcalf4t2y3h8p.jpg",
  "refs": [
   "Exodus 32:1-14"
  ],
  "days": [
   "Year A Proper 23rd Sunday"
  ],
  "essay": "https://thevcs.org/golden-calf/danger-and-therapy",
  "act": "https://act.library.vanderbilt.edu/artworks/58476",
  "licence": "Public domain",
  "attribution": "Poussin, Nicolas, 1594?-1665. Adoration of the Golden Calf, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58477,
  "title": "Israelites Worship the Golden Calf and Moses Breaks the Tablets",
  "artist": "William, de Brailes, active 13th century",
  "date": "ca. 1250",
  "where": "Walters Art Museum, Baltimore, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/israelcalf3nvwx915.jpg",
  "refs": [
   "Exodus 32:1-14"
  ],
  "days": [
   "Year A Proper 23rd Sunday"
  ],
  "essay": "https://thevcs.org/golden-calf/imaging-word",
  "act": "https://act.library.vanderbilt.edu/artworks/58477",
  "licence": "Public domain",
  "attribution": "William, de Brailes, active 13th century. Israelites Worship the Golden Calf and Moses Breaks the Tablets, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58478,
  "title": "Twilight in the Wilderness",
  "artist": "Church, Frederic Edwin, 1826-1900",
  "date": "1860",
  "where": "Cleveland Museum of Art, Cleveland, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/twilightwilderness24ga01km.jpg",
  "refs": [
   "Deuteronomy 8:7-18",
   "isaiah 43:18-25"
  ],
  "days": [
   "Year B Epiphany 7th Sunday",
   "Year A Thanksgiving Day"
  ],
  "essay": "https://thevcs.org/remember-do-not-forget/complexity-land",
  "act": "https://act.library.vanderbilt.edu/artworks/58478",
  "licence": "Public domain",
  "attribution": "Church, Frederic Edwin, 1826-1900. Twilight in the Wilderness, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58604,
  "title": "Story of David and Goliath",
  "artist": "Pesellino, approximately 1422-1457",
  "date": "ca. 1445-1455",
  "where": "National Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/goli290fjn79u8tr54edrfv.jpg",
  "refs": [
   "Samuel I, 17:(1a, 4-11, 19-23), 32-49"
  ],
  "days": [
   "Year B Proper 7th Sunday"
  ],
  "essay": "https://thevcs.org/david-and-goliath/alls-fair-love-and-war",
  "act": "https://act.library.vanderbilt.edu/artworks/58604",
  "licence": "Public domain",
  "attribution": "Pesellino, approximately 1422-1457. Story of David and Goliath, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58605,
  "title": "David",
  "artist": "Bernini, Gian Lorenzo, 1598-1680",
  "date": "1623-1624",
  "where": "Galleria Borghese, Rome, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/david9348ijh970hlljn.jpg",
  "refs": [
   "Samuel I, 17:(1a, 4-11, 19-23), 32-49"
  ],
  "days": [
   "Year B Proper 7th Sunday"
  ],
  "essay": "https://thevcs.org/david-and-goliath/never-alone",
  "act": "https://act.library.vanderbilt.edu/artworks/58605",
  "licence": "CC0",
  "attribution": "Bernini, Gian Lorenzo, 1598-1680. David, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58613,
  "title": "Plate with the Battle of David and Goliath",
  "artist": null,
  "date": "629-630",
  "where": "Metropolitan Museum of Art, New York City, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/davidsamuel3729tvbx.jpg",
  "refs": [
   "Samuel I, 17:(1a, 4-11, 19-23), 32-49"
  ],
  "days": [
   "Year B Proper 7th Sunday"
  ],
  "essay": "https://thevcs.org/david-and-goliath/head-plate",
  "act": "https://act.library.vanderbilt.edu/artworks/58613",
  "licence": "CC BY-SA 3.0",
  "attribution": "Plate with the Battle of David and Goliath, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58614,
  "title": "Prophet Elijah in the Desert",
  "artist": "Bouts, Dieric, 1415-1475",
  "date": "1464-1468",
  "where": "St. Peter's Church, Leuven, Belgium",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/elijahdieric48jg92od.jpg",
  "refs": [
   "Kings I, 19:1-4, (5-7), 8-15a"
  ],
  "days": [
   "Year C Proper 7th Sunday",
   "Year B Proper 14th Sunday"
  ],
  "essay": "https://thevcs.org/prophet-elijah-wilderness/heavenly-food",
  "act": "https://act.library.vanderbilt.edu/artworks/58614",
  "licence": "Public domain",
  "attribution": "Bouts, Dieric, 1415-1475. Prophet Elijah in the Desert, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58615,
  "title": "Man in Oriental Costume (King Uzziah Stricken by Leprosy)",
  "artist": "Rembrandt Harmenszoon van Rijn, 1606-1669",
  "date": "1639",
  "where": "Chatsworth House, Bakewell, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/uzziah12is45or.jpg",
  "refs": [
   "Kings II, 5:1-14"
  ],
  "days": [
   "Year C Proper 9th Sunday",
   "Year B Epiphany 6th Sunday"
  ],
  "essay": "https://thevcs.org/healing-naaman/gehazis-kindred",
  "act": "https://act.library.vanderbilt.edu/artworks/58615",
  "licence": "Public domain",
  "attribution": "Rembrandt Harmenszoon van Rijn, 1606-1669. Man in Oriental Costume (King Uzziah Stricken by Leprosy), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58618,
  "title": "Solomon and the Queen of Sheba",
  "artist": "Ghiberti, Lorenzo, 1378-1455",
  "date": "1425-1452",
  "where": "Florence Baptistery, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ghibertiSolomon38gh56ao.jpg",
  "refs": [
   "Kings I, 10:1-13",
   "Chronicles II, 9:1-12"
  ],
  "days": [],
  "essay": "https://thevcs.org/arrival-queen-sheba/match-made-heaven",
  "act": "https://act.library.vanderbilt.edu/artworks/58618",
  "licence": "CC BY-SA 3.0",
  "attribution": "Ghiberti, Lorenzo, 1378-1455. Solomon and the Queen of Sheba, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58619,
  "title": "Ezra Reads the Law",
  "artist": "Schnorr von Carolsfeld, Julius, 1794-1872",
  "date": "1860",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ezrapreaches043jk2i8.jpg",
  "refs": [
   "Nehemiah 8:1-3, 5-6, 8-10"
  ],
  "days": [
   "Year C Epiphany 3rd Sunday"
  ],
  "essay": "https://thevcs.org/meet-with-joy-sweet-jerusalem/words-words-words",
  "act": "https://act.library.vanderbilt.edu/artworks/58619",
  "licence": "Public domain",
  "attribution": "Schnorr von Carolsfeld, Julius, 1794-1872. Ezra Reads the Law, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58620,
  "title": "Hiker Above the Sea of Fog",
  "artist": "Friedrich, Caspar David, 1774-1840",
  "date": "ca. 1817",
  "where": "Hamburger Kunsthalle, Hamburg, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/wanderer043gil8f.jpg",
  "refs": [
   "Psalm 19"
  ],
  "days": [
   "Year B Lent 3rd Sunday"
  ],
  "essay": "https://thevcs.org/heavens-are-telling/contemplating-gods-creation",
  "act": "https://act.library.vanderbilt.edu/artworks/58620",
  "licence": "Public domain",
  "attribution": "Friedrich, Caspar David, 1774-1840. Hiker Above the Sea of Fog, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58621,
  "title": "Pass at Faido",
  "artist": "Turner, J. M. W. (Joseph Mallord William), 1775-1851",
  "date": "ca. 1800-1845",
  "where": "Morgan Library & Museum, New York City, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/gotthard1849aft5.jpg",
  "refs": [
   "Psalm 19"
  ],
  "days": [
   "Year B Lent 3rd Sunday"
  ],
  "essay": "https://thevcs.org/heavens-are-telling/all-great-art-praise",
  "act": "https://act.library.vanderbilt.edu/artworks/58621",
  "licence": "Public domain",
  "attribution": "Turner, J. M. W. (Joseph Mallord William), 1775-1851. Pass at Faido, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58622,
  "title": "What Our Lord Saw from the Cross",
  "artist": "Tissot, James, 1836-1902",
  "date": "1886-1894",
  "where": "Brooklyn Museum, Brooklyn, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/tissotCross04352jkl.jpg",
  "refs": [
   "John 18:1-19:42",
   "Psalm 22"
  ],
  "days": [
   "Year A Good Friday"
  ],
  "essay": "https://thevcs.org/great-cry/participation-suffering",
  "act": "https://act.library.vanderbilt.edu/artworks/58622",
  "licence": "Public domain",
  "attribution": "Tissot, James, 1836-1902. What Our Lord Saw from the Cross, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58623,
  "title": "Isenheim Altarpiece",
  "artist": "Grünewald, Matthias, active 16th century",
  "date": "ca. 1512-1516",
  "where": "Unterlinden Museum, Colmar, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/isenheim453fst89.jpg",
  "refs": [
   "Matthew 26:14-27:66",
   "Mark 14:1-15:47",
   "Luke 22:14-23:56"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year B Liturgy of Pass",
   "Year C Liturgy of Pass"
  ],
  "essay": "https://thevcs.org/great-cry/loneliness-desolation",
  "act": "https://act.library.vanderbilt.edu/artworks/58623",
  "licence": "Public domain",
  "attribution": "Grünewald, Matthias, active 16th century. Isenheim Altarpiece, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58624,
  "title": "Under the Wave off Kanagawa",
  "artist": "Katsushika, Hokusai, 1760-1849",
  "date": "ca. 1830-1832",
  "where": "Metropolitan Museum of Art, New York City, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/kanagawa0934dhko.jpg",
  "refs": [
   "Psalm 43",
   "Psalm 42"
  ],
  "days": [
   "Year C Proper 7th Sunday"
  ],
  "essay": "https://thevcs.org/thirsting-god/terror-transience-transcendence",
  "act": "https://act.library.vanderbilt.edu/artworks/58624",
  "licence": "Public domain",
  "attribution": "Katsushika, Hokusai, 1760-1849. Under the Wave off Kanagawa, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58823,
  "title": "Visit of the Queen of Sheba to Solomon",
  "artist": "Tintoretto, Jacopo, 1518-1594",
  "date": "ca. 1545-1546",
  "where": "Bob Jones University Museum and Gallery, Greenville, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/shebasolomon3gb1os98.jpg",
  "refs": [
   "Kings I, 10:1-13",
   "Chronicles II, 9:1-12"
  ],
  "days": [],
  "essay": "https://thevcs.org/arrival-queen-sheba/stage-set",
  "act": "https://act.library.vanderbilt.edu/artworks/58823",
  "licence": "CC BY-SA 4.0",
  "attribution": "Tintoretto, Jacopo, 1518-1594. Visit of the Queen of Sheba to Solomon, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58825,
  "title": "Marriage Feast at Cana",
  "artist": null,
  "date": "ca. 1310-1320",
  "where": "British Library, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/marriagecana30bw4m1p.jpg",
  "refs": [
   "John 2:1-11",
   "Psalm 69:7-10, (11-15), 16-18"
  ],
  "days": [
   "Year C Epiphany 2nd Sunday",
   "Year A Proper 7th Sunday"
  ],
  "essay": "https://thevcs.org/cry-deliverance/neck",
  "act": "https://act.library.vanderbilt.edu/artworks/58825",
  "licence": "Public domain",
  "attribution": "Marriage Feast at Cana, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58826,
  "title": "Cueva de las Manos",
  "artist": null,
  "date": "11000-7000",
  "where": "Cueva de las Manos (Cave of the Hands), Santa Cruz, Argentina",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/cuevamanos85gh1tb3.jpg",
  "refs": [
   "Psalm 90:1-6, 13-17"
  ],
  "days": [
   "Year A Proper 25th Sunday"
  ],
  "essay": "https://thevcs.org/handwork/dwelling-place-all-generations",
  "act": "https://act.library.vanderbilt.edu/artworks/58826",
  "licence": "Public domain",
  "attribution": "Cueva de las Manos, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58828,
  "title": "Cottage",
  "artist": "Gogh, Vincent van, 1853-1890",
  "date": "1885",
  "where": "Van Gogh Museum, Amsterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/cottage3nbuw928.jpg",
  "refs": [
   "Psalm 133"
  ],
  "days": [
   "Year B Proper 7th Sunday",
   "Year B Easter 2nd Sunday",
   "Year A Proper 15th Sunday"
  ],
  "essay": "https://thevcs.org/one/when-kindred-live-together?first=5091",
  "act": "https://act.library.vanderbilt.edu/artworks/58828",
  "licence": "Public domain",
  "attribution": "Gogh, Vincent van, 1853-1890. Cottage, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58829,
  "title": "Burghers of Calais",
  "artist": "Rodin, Auguste, 1840-1917",
  "date": "1884-1895",
  "where": "In front of the town hall of Calais, Calais, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/burgherscalais32gj94xp.jpg",
  "refs": [
   "Psalm 133"
  ],
  "days": [
   "Year B Proper 7th Sunday",
   "Year B Easter 2nd Sunday",
   "Year A Proper 15th Sunday"
  ],
  "essay": "https://thevcs.org/one/together-even-one?first=5091",
  "act": "https://act.library.vanderbilt.edu/artworks/58829",
  "licence": "CC BY-SA 3.0",
  "attribution": "Rodin, Auguste, 1840-1917. Burghers of Calais, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58847,
  "title": "St. Albans Psalter Initial S",
  "artist": null,
  "date": "ca. 1120-1130",
  "where": "Dombibliothek Hildesheim, Hildesheim, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/albanspsalter83rw25ns.jpg",
  "refs": [
   "Psalm 137"
  ],
  "days": [
   "Year C Proper 22nd Sunday"
  ],
  "essay": "https://thevcs.org/rivers-babylon/singing-and-scheming?first=2616",
  "act": "https://act.library.vanderbilt.edu/artworks/58847",
  "licence": "Public domain",
  "attribution": "St. Albans Psalter Initial S, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58848,
  "title": "Animalia Rationalia et Insecta (Ignis): Plate XII",
  "artist": "Hoefnagel, Joris, 1542-1601",
  "date": "ca. 1575-1580",
  "where": "National Gallery of Art (U.S.), Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/animalia93fpgk17.jpg",
  "refs": [
   "Psalm 145"
  ],
  "days": [
   "Year A Proper 13th Sunday"
  ],
  "essay": "https://thevcs.org/joris-hoefnagels-insects/double-take?first=2341",
  "act": "https://act.library.vanderbilt.edu/artworks/58848",
  "licence": "CC0",
  "attribution": "Hoefnagel, Joris, 1542-1601. Animalia Rationalia et Insecta (Ignis): Plate XII, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58849,
  "title": "Animalia Rationalia et Insecta (Ignis): Plate XI",
  "artist": "Hoefnagel, Joris, 1542-1601",
  "date": "ca. 1575-1580",
  "where": "National Gallery of Art (U.S.), Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/insecta3612vwtx.jpg",
  "refs": [
   "Psalm 145"
  ],
  "days": [
   "Year A Proper 13th Sunday"
  ],
  "essay": "https://thevcs.org/joris-hoefnagels-insects/unusual-encounter?first=2341",
  "act": "https://act.library.vanderbilt.edu/artworks/58849",
  "licence": "CC0",
  "attribution": "Hoefnagel, Joris, 1542-1601. Animalia Rationalia et Insecta (Ignis): Plate XI, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58850,
  "title": "Animalia Rationalia et Insecta (Ignis): Plate XIV",
  "artist": "Hoefnagel, Joris, 1542-1601",
  "date": "ca. 1575-1580",
  "where": "National Gallery of Art (U.S.), Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/insectaxiv45tgpa19.jpg",
  "refs": [
   "Psalm 145"
  ],
  "days": [
   "Year A Proper 13th Sunday"
  ],
  "essay": "https://thevcs.org/thevcs.org/joris-hoefnagels-insects/words-and-deeds?first=2341",
  "act": "https://act.library.vanderbilt.edu/artworks/58850",
  "licence": "CC0",
  "attribution": "Hoefnagel, Joris, 1542-1601. Animalia Rationalia et Insecta (Ignis): Plate XIV, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58857,
  "title": "Portrait of Giovanna Tornabuoni",
  "artist": "Ghirlandaio, Domenico, 1449-1494",
  "date": "1489-1490",
  "where": "Thyssen-Bornemisza Museum, Madrid, Spain",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Domenico_Ghirlandaio_Portrait_of_Giovanna_Tornabuoni.jpg",
  "refs": [
   "Proverbs 31:10-31"
  ],
  "days": [
   "Year B Proper 20th Sunday"
  ],
  "essay": "https://thevcs.org/wife-noble-character/more-precious-jewels?first=761",
  "act": "https://act.library.vanderbilt.edu/artworks/58857",
  "licence": "Public domain",
  "attribution": "Ghirlandaio, Domenico, 1449-1494. Portrait of Giovanna Tornabuoni, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58858,
  "title": "Katharina von Bora",
  "artist": "Koch, Nina",
  "date": "1999",
  "where": "Lutherhaus, Wittenberg, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Nina_Koch_Katharina_Von_Bora.jpg",
  "refs": [
   "Proverbs 31:10-31"
  ],
  "days": [
   "Year B Proper 20th Sunday"
  ],
  "essay": "https://thevcs.org/wife-noble-character/breaking-new-ground?first=771",
  "act": "https://act.library.vanderbilt.edu/artworks/58858",
  "licence": "CC BY-SA 2.0",
  "attribution": "Koch, Nina. Katharina von Bora, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58859,
  "title": "Extensive Landscape with Ruins",
  "artist": "Ruisdael, Jacob van, 1628 or 1629-1682",
  "date": "ca. 1665-1670",
  "where": "National Gallery (Great Britain), London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jacob_Isaacksz_van_Ruisdael_An_Extensive_Landscape_with_a_Ruined_Castle_and_a_Village_Church.jpg",
  "refs": [
   "Ecclesiastes 1:2, 12-14; 2:18-23"
  ],
  "days": [
   "Year C Proper 13th Sunday"
  ],
  "essay": "https://thevcs.org/vanity-vanities/life-under-sun?first=2001",
  "act": "https://act.library.vanderbilt.edu/artworks/58859",
  "licence": "Public domain",
  "attribution": "Ruisdael, Jacob van, 1628 or 1629-1682. Extensive Landscape with Ruins, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58860,
  "title": "Vanitas Still Life with Self-Portrait",
  "artist": "Bailly, David, 1584-1657",
  "date": "1651",
  "where": "Museum De Lakenhal, Leiden, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/David_Bailly_Self_Portrait_with_Vanitas_Symbols.jpg",
  "refs": [
   "Ecclesiastes 1:2, 12-14; 2:18-23"
  ],
  "days": [
   "Year C Proper 13th Sunday"
  ],
  "essay": "https://thevcs.org/vanity-vanities/recounting-time?first=2001",
  "act": "https://act.library.vanderbilt.edu/artworks/58860",
  "licence": "Public domain",
  "attribution": "Bailly, David, 1584-1657. Vanitas Still Life with Self-Portrait, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58861,
  "title": "Self-Portrait at the Easel",
  "artist": "Rembrandt Harmenszoon van Rijn, 1606-1669",
  "date": "1660",
  "where": "Louvre, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Rembrandt_Self_Portrait_at_The_Easel.jpg",
  "refs": [
   "Ecclesiastes 3:1-13"
  ],
  "days": [
   "Year A New Year’s Day",
   "Year B New Year’s Day",
   "Year C New Year’s Day"
  ],
  "essay": "https://thevcs.org/everything-season/business-god-has-given?first=1471",
  "act": "https://act.library.vanderbilt.edu/artworks/58861",
  "licence": "Public domain",
  "attribution": "Rembrandt Harmenszoon van Rijn, 1606-1669. Self-Portrait at the Easel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58862,
  "title": "Allegory of the City of Madrid",
  "artist": "Goya, Francisco, 1746-1828",
  "date": "1810",
  "where": "Museo de Historia de Madrid, Madrid, Spain",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Goya_y_Lucientes,_Francisco_de_Allegory_of_the_City_of_Madrid_1810.jpg",
  "refs": [
   "Ecclesiastes 3:1-13"
  ],
  "days": [
   "Year A New Year’s Day",
   "Year B New Year’s Day",
   "Year C New Year’s Day"
  ],
  "essay": "https://thevcs.org/everything-season/reversals-fortune?first=1466",
  "act": "https://act.library.vanderbilt.edu/artworks/58862",
  "licence": "Public domain",
  "attribution": "Goya, Francisco, 1746-1828. Allegory of the City of Madrid, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58863,
  "title": "Parable of the Labourers in the Vineyard",
  "artist": "Rembrandt Harmenszoon van Rijn, 1606-1669",
  "date": "1637",
  "where": "Hermitage Museum, Saint Petersburg, Russia",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/labourersvineyard3m8g91wo.jpg",
  "refs": [
   "Isaiah 5:1-7"
  ],
  "days": [
   "Year C Proper 15th Sunday",
   "Year A Proper 22nd Sunday"
  ],
  "essay": "https://thevcs.org/song-vineyard/just-wages?first=5131",
  "act": "https://act.library.vanderbilt.edu/artworks/58863",
  "licence": "Public domain",
  "attribution": "Rembrandt Harmenszoon van Rijn, 1606-1669. Parable of the Labourers in the Vineyard, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58864,
  "title": "Saint Francis Receiving the Stigmata",
  "artist": "Giotto, 1266?-1337",
  "date": "1337",
  "where": "Basilica of Saint Francis of Assisi, Assisi, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/legendfrancis5gj1m0a8.jpg",
  "refs": [
   "Isaiah 6:1-8"
  ],
  "days": [
   "Year B Trinity Sunday"
  ],
  "essay": "https://thevcs.org/holy-holy-holy/theatre-divine-life?first=4386",
  "act": "https://act.library.vanderbilt.edu/artworks/58864",
  "licence": "Public domain",
  "attribution": "Giotto, 1266?-1337. Saint Francis Receiving the Stigmata, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58865,
  "title": "Throne of the Third Heaven of the Nations' Millennium General Assembly",
  "artist": "Hampton, James, 1909-1964",
  "date": "1950-1964",
  "where": "Smithsonian American Art Museum, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/thirdheaven4ty8w2k.jpg",
  "refs": [
   "Isaiah 6:1-8"
  ],
  "days": [
   "Year B Trinity Sunday"
  ],
  "essay": "https://thevcs.org/holy-holy-holy/found-glory?first=4386",
  "act": "https://act.library.vanderbilt.edu/artworks/58865",
  "licence": "CC BY-SA 4.0",
  "attribution": "Hampton, James, 1909-1964. Throne of the Third Heaven of the Nations' Millennium General Assembly, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58866,
  "title": "Rue de l'Épicerie in Rouen, Effect of Sunlight",
  "artist": "Pissarro, Camille, 1830-1903",
  "date": "1898",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ruelepicerie8t9g4n5b.jpg",
  "refs": [
   "Isaiah 55:1-9"
  ],
  "days": [
   "Year A Proper 13th Sunday"
  ],
  "essay": "https://thevcs.org/return-again/economy-god?first=4661",
  "act": "https://act.library.vanderbilt.edu/artworks/58866",
  "licence": "Public domain",
  "attribution": "Pissarro, Camille, 1830-1903. Rue de l'Épicerie in Rouen, Effect of Sunlight, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58867,
  "title": "Christ in the Winepress",
  "artist": "Pinaigrier, Nicholas",
  "date": "1585-1606",
  "where": "Saint-Étienne-du-Mont, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/christwinepress7ty4f32d.jpg",
  "refs": [
   "Isaiah 63:7-9"
  ],
  "days": [
   "Year A Christmas 1st Sunday"
  ],
  "essay": "https://thevcs.org/winepress/be-ready-pressing?first=1236",
  "act": "https://act.library.vanderbilt.edu/artworks/58867",
  "licence": "CC0",
  "attribution": "Pinaigrier, Nicholas. Christ in the Winepress, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58874,
  "title": "Altarpiece No. 1",
  "artist": "Klint, Hilma af, 1862-1944",
  "date": "1915",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/altarpiece18ugnc36.jpg",
  "refs": [
   "Thessalonians I, 5:1-11"
  ],
  "days": [
   "Year A Proper 28th Sunday"
  ],
  "essay": "https://thevcs.org/faith-hope-and-love/behold-i-tell-you-secret",
  "act": "https://act.library.vanderbilt.edu/artworks/58874",
  "licence": "Public domain",
  "attribution": "Klint, Hilma af, 1862-1944. Altarpiece No. 1, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58894,
  "title": "Landscape with the Destruction of Sodom and Gomorrah",
  "artist": "Patinir, Joachim, approximately 1485-1524",
  "date": "c. 1520",
  "where": "Museum Boijmans Van Beuningen, Rotterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Joachim_Patinir_Landscape_with_the_Destruction_of_Sodom_and_Gomorrah.jpg",
  "refs": [
   "Genesis 19:1-29"
  ],
  "days": [],
  "essay": "https://thevcs.org/lots-wife/lots-wife?first=4861",
  "act": "https://act.library.vanderbilt.edu/artworks/58894",
  "licence": "Public domain",
  "attribution": "Patinir, Joachim, approximately 1485-1524. Landscape with the Destruction of Sodom and Gomorrah, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59105,
  "title": "Valley of Dry Bones, Ezekiel",
  "artist": null,
  "date": "ca. 250",
  "where": "National Museum of Damascus, Damascus, Syria",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ezekielValley48g01pdq.jpg",
  "refs": [
   "Ezekiel 37:1-14"
  ],
  "days": [
   "Year A Easter Vigil",
   "Year B Easter Vigil",
   "Year C Easter Vigil",
   "Year A Lent 5th  Sunday",
   "Year B Day of Pentecost"
  ],
  "essay": "https://thevcs.org/dry-bones/ancient-messianic-hope?first=1796",
  "act": "https://act.library.vanderbilt.edu/artworks/59105",
  "licence": "Public domain",
  "attribution": "Valley of Dry Bones, Ezekiel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59106,
  "title": "Hymn to the Virgin",
  "artist": "Poulakēs, Theodōros, approximately 1622-1692",
  "date": "1650-1699",
  "where": "Benaki Museum, Athens, Greece",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/hymnvirgin1j0s9v4m.jpg",
  "refs": [
   "Daniel 7:1-3, 15-18"
  ],
  "days": [
   "Year B All Saints Day"
  ],
  "essay": "https://thevcs.org/daniels-four-beasts/game?first=6471",
  "act": "https://act.library.vanderbilt.edu/artworks/59106",
  "licence": "Public domain",
  "attribution": "Poulakēs, Theodōros, approximately 1622-1692. Hymn to the Virgin, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59107,
  "title": "Slave Ship",
  "artist": "Turner, J. M. W. (Joseph Mallord William), 1775-1851",
  "date": "1840",
  "where": "Museum of Fine Arts, Boston, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/slaveship7b1p92sx.jpg",
  "refs": [
   "Amos 5:18-24"
  ],
  "days": [
   "Year A Proper 27th Sunday"
  ],
  "essay": "https://thevcs.org/dark-days/rolling-down-waters?first=4356",
  "act": "https://act.library.vanderbilt.edu/artworks/59107",
  "licence": "Public domain",
  "attribution": "Turner, J. M. W. (Joseph Mallord William), 1775-1851. Slave Ship, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59109,
  "title": "Downtrodden",
  "artist": "Kollwitz, Käthe Schmidt, 1867-1945",
  "date": "1900",
  "where": "Honolulu Museum of Art, Honolulu, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/downtrodden6yuzk913.jpg",
  "refs": [
   "Amos 5:18-24"
  ],
  "days": [
   "Year A Proper 27th Sunday"
  ],
  "essay": "https://thevcs.org/flight-egypt/flight-night",
  "act": "https://act.library.vanderbilt.edu/artworks/59109",
  "licence": "Public domain",
  "attribution": "Kollwitz, Käthe Schmidt, 1867-1945. Downtrodden, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59110,
  "title": "Battle of Issus between Alexander and Darius III",
  "artist": null,
  "date": "ca. 100 BCE",
  "where": "National Archaeological Museum, Naples, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/battleissus5rf29pj8.jpg",
  "refs": [
   "Zechariah 9:9-12"
  ],
  "days": [
   "Year A Proper 9th Sunday"
  ],
  "essay": "https://thevcs.org/oracle-worried-people/beware-greeks-bearing-arms?first=4991",
  "act": "https://act.library.vanderbilt.edu/artworks/59110",
  "licence": "Public domain",
  "attribution": "Battle of Issus between Alexander and Darius III, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59112,
  "title": "Landscape with the Destruction of Sodom and Gomorrah",
  "artist": "Patinir, Joachim, approximately 1485-1524",
  "date": "ca. 1520",
  "where": "Museum Boijmans Van Beuningen, Rotterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/sodomgomorrah37tb10km.jpg",
  "refs": [
   "Genesis 19:1-29"
  ],
  "days": [],
  "essay": "https://thevcs.org/lots-wife/lots-wife?first=4861",
  "act": "https://act.library.vanderbilt.edu/artworks/59112",
  "licence": "Public domain",
  "attribution": "Patinir, Joachim, approximately 1485-1524. Landscape with the Destruction of Sodom and Gomorrah, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59113,
  "title": "Dresden After the Bombardment",
  "artist": "Peter, Richard, 1895-1977",
  "date": "1945",
  "where": "View from the town hall tower with the allegory of kindness (sculpture by August Schreitmüller, 1908-10) (Image archived in Deutsche Fotothek in the Saxon State Library), Dresden, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/dresdenbombardment9ce2k18s.jpg",
  "refs": [
   "Genesis 19:1-29"
  ],
  "days": [],
  "essay": "https://thevcs.org/lots-wife/lots-wife?first=4861",
  "act": "https://act.library.vanderbilt.edu/artworks/59113",
  "licence": "CC BY-SA 3.0 de",
  "attribution": "Peter, Richard, 1895-1977. Dresden After the Bombardment, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59114,
  "title": "Moses Rescued from the Waters",
  "artist": "Poussin, Nicolas, 1594?-1665",
  "date": "1638",
  "where": "Louvre, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/findingmoses74rg81mx.jpg",
  "refs": [
   "Exodus 2:1-10"
  ],
  "days": [],
  "essay": "https://thevcs.org/finding-moses/tranquility-restored?first=86",
  "act": "https://act.library.vanderbilt.edu/artworks/59114",
  "licence": "Public domain",
  "attribution": "Poussin, Nicolas, 1594?-1665. Moses Rescued from the Waters, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59115,
  "title": "Moses's Journey into Egypt and the Circumcision of His Son Eliezar",
  "artist": "Perugino, approximately 1450-1523",
  "date": "ca. 1482",
  "where": "Sistine Chapel, Vatican City",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/mosesjourney5t9d2m1k.jpg",
  "refs": [
   "Exodus 4:10-31"
  ],
  "days": [],
  "essay": "https://thevcs.org/bridegroom-blood/unpacking-narrative?first=1",
  "act": "https://act.library.vanderbilt.edu/artworks/59115",
  "licence": "Public domain",
  "attribution": "Perugino, approximately 1450-1523. Moses's Journey into Egypt and the Circumcision of His Son Eliezar, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59116,
  "title": "Agnus-Dei: The Scapegoat",
  "artist": "Tissot, James, 1836-1902",
  "date": "ca. 1886-1894",
  "where": "Brooklyn Museum, Brooklyn, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/agnusdei6h2k1s9p.jpg",
  "refs": [
   "Leviticus 16:1-5, 20-28"
  ],
  "days": [],
  "essay": "https://thevcs.org/scaping-sin/painful-transference?first=756",
  "act": "https://act.library.vanderbilt.edu/artworks/59116",
  "licence": "Public domain",
  "attribution": "Tissot, James, 1836-1902. Agnus-Dei: The Scapegoat, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59117,
  "title": "Solomon Making a Sacrifice to the Idols",
  "artist": "Bourdon, Sebastien, 1616-1671",
  "date": "ca. 1646-1647",
  "where": "Louvre, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/solomonidols3trcj917.jpg",
  "refs": [
   "Deuteronomy 11:1-17"
  ],
  "days": [],
  "essay": "https://thevcs.org/solomon-shadows/flagrante?first=2266",
  "act": "https://act.library.vanderbilt.edu/artworks/59117",
  "licence": "Public domain",
  "attribution": "Bourdon, Sebastien, 1616-1671. Solomon Making a Sacrifice to the Idols, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59118,
  "title": "Liberation of a Beleaguered City",
  "artist": null,
  "date": "ca. 400",
  "where": "Skulpturensammlung und das Museum für Byzantinische Kunst, Berlin, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/liberationcity3t8g9v2m.jpg",
  "refs": [
   "Joshua 10:16-27"
  ],
  "days": [],
  "essay": "https://thevcs.org/longest-day/be-strong-and-good-courage?first=826",
  "act": "https://act.library.vanderbilt.edu/artworks/59118",
  "licence": "CC BY 3.0",
  "attribution": "Liberation of a Beleaguered City, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59119,
  "title": "Samson and Delilah",
  "artist": "Van Dyck, Anthony, 1599-1641",
  "date": "ca. 1628-1630",
  "where": "Kunsthistorisches Museum, Vienna, Austria",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/samsondelilah3t8m0s1i.jpg",
  "refs": [
   "Judges 16:1-22"
  ],
  "days": [],
  "essay": "https://thevcs.org/samson-and-delilah/tragic-lovers?first=1111",
  "act": "https://act.library.vanderbilt.edu/artworks/59119",
  "licence": "Public domain",
  "attribution": "Van Dyck, Anthony, 1599-1641. Samson and Delilah, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59120,
  "title": "Judgment of Solomon",
  "artist": "Poussin, Nicolas, 1594?-1665",
  "date": "1649",
  "where": "Louvre, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/judgmentsolomon5b3f9s1x.jpg",
  "refs": [
   "Kings I, 3:16-28"
  ],
  "days": [],
  "essay": "https://thevcs.org/wisdom-solomon/justice-or-compassion?first=6251",
  "act": "https://act.library.vanderbilt.edu/artworks/59120",
  "licence": "Public domain",
  "attribution": "Poussin, Nicolas, 1594?-1665. Judgment of Solomon, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59121,
  "title": "Queen Vashti Leaving the Royal Palace",
  "artist": "Lippi, Filippino, -1504",
  "date": "ca. 1480",
  "where": "Museo Home, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/queenvashti6hb01de4.jpg",
  "refs": [
   "Esther 1:1-21"
  ],
  "days": [],
  "essay": "https://thevcs.org/banished-vashti/what-price-dignity?first=3256",
  "act": "https://act.library.vanderbilt.edu/artworks/59121",
  "licence": "Public domain",
  "attribution": "Lippi, Filippino, -1504. Queen Vashti Leaving the Royal Palace, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59122,
  "title": "Esther",
  "artist": "Millais, John Everett, 1829-1896",
  "date": "ca. 1863-1865",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/esthermillais5y83vm9s.jpg",
  "refs": [
   "Esther 8:1-17"
  ],
  "days": [],
  "essay": "https://thevcs.org/esther-pleads-her-people/turncoat?first=421",
  "act": "https://act.library.vanderbilt.edu/artworks/59122",
  "licence": "Public domain",
  "attribution": "Millais, John Everett, 1829-1896. Esther, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59123,
  "title": "Nocturne: Blue and Silver - Cremorne Lights",
  "artist": "Whistler, James McNeill, 1834-1903",
  "date": "1872",
  "where": "Tate, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/nocturneblue7360viwu.jpg",
  "refs": [
   "Job 28:12-28"
  ],
  "days": [],
  "essay": "https://thevcs.org/where-shall-wisdom-be-found/long-rumours-wisdom?first=1036",
  "act": "https://act.library.vanderbilt.edu/artworks/59123",
  "licence": "Public domain",
  "attribution": "Whistler, James McNeill, 1834-1903. Nocturne: Blue and Silver - Cremorne Lights, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59124,
  "title": "Ships in Distress off a Rocky Coast",
  "artist": "Backhuysen, Ludolf, approximately 1630-1708",
  "date": "1867",
  "where": "National Gallery of Art, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/shipsdistress38yt91jv.jpg",
  "refs": [
   "Job 28:12-28"
  ],
  "days": [],
  "essay": "https://thevcs.org/where-shall-wisdom-be-found/precarity?first=1036",
  "act": "https://act.library.vanderbilt.edu/artworks/59124",
  "licence": "Public domain",
  "attribution": "Backhuysen, Ludolf, approximately 1630-1708. Ships in Distress off a Rocky Coast, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59125,
  "title": "Study of Cirrus Clouds",
  "artist": "Constable, John, 1776-1837",
  "date": "ca. 1822",
  "where": "Victoria and Albert Museum, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/cirrusclouds2j9d0w1m.jpg",
  "refs": [
   "Job 28:12-28"
  ],
  "days": [],
  "essay": "https://thevcs.org/where-shall-wisdom-be-found/stage-sun?first=1036",
  "act": "https://act.library.vanderbilt.edu/artworks/59125",
  "licence": "Public domain",
  "attribution": "Constable, John, 1776-1837. Study of Cirrus Clouds, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59126,
  "title": "Lady with Her Maidservant Holding a Letter",
  "artist": "Vermeer, Johannes, 1632-1675",
  "date": "1666-1667",
  "where": "Frick Collection, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ladymaidservant46th19ab.jpg",
  "refs": [
   "Song of Solomon 3:1-11"
  ],
  "days": [],
  "essay": "https://thevcs.org/soul-desire/nocturnal-movements?first=2126",
  "act": "https://act.library.vanderbilt.edu/artworks/59126",
  "licence": "Public domain",
  "attribution": "Vermeer, Johannes, 1632-1675. Lady with Her Maidservant Holding a Letter, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59127,
  "title": "Susanna and the Elders",
  "artist": "Tintoretto, 1518-1594",
  "date": "ca. 1555-1556",
  "where": "Kunsthistorisches Museum, Vienna, Austria",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/susannaelders73rf91qw.jpg",
  "refs": [
   "Song of Solomon 4:9-5:1"
  ],
  "days": [],
  "essay": "https://thevcs.org/garden-earthly-and-heavenly-delights",
  "act": "https://act.library.vanderbilt.edu/artworks/59127",
  "licence": "Public domain",
  "attribution": "Tintoretto, 1518-1594. Susanna and the Elders, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59128,
  "title": "Story of Daniel and the Three Youths in the Fiery Furnace",
  "artist": "Konstantinos, Adrianoupolitis",
  "date": "ca. 1750-1799",
  "where": "Benaki Museum, Athens, Greece",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/danielyouths3921ghew.jpg",
  "refs": [
   "Daniel 3"
  ],
  "days": [],
  "essay": "https://thevcs.org/fiery-furnace/shelter-most-high?first=4791",
  "act": "https://act.library.vanderbilt.edu/artworks/59128",
  "licence": "Public domain",
  "attribution": "Konstantinos, Adrianoupolitis. Story of Daniel and the Three Youths in the Fiery Furnace, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59129,
  "title": "Belshazzar's Feast",
  "artist": "Martin, John, 1789-1854",
  "date": "1820",
  "where": "Yale Center for British Art, New Haven, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/belshazzarsfeast1945gapd.jpg",
  "refs": [
   "Daniel 5:1-12",
   "Daniel 5:13-31"
  ],
  "days": [],
  "essay": "https://thevcs.org/writing-wall/writing-wall?first=4676",
  "act": "https://act.library.vanderbilt.edu/artworks/59129",
  "licence": "Public domain",
  "attribution": "Martin, John, 1789-1854. Belshazzar's Feast, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59130,
  "title": "Belshazzar's Feast",
  "artist": "Rembrandt Harmenszoon van Rijn, 1606-1669",
  "date": "ca. 1635-1638",
  "where": "National Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/belshazzarrembrandt36tghw21.jpg",
  "refs": [
   "Daniel 5:1-12"
  ],
  "days": [],
  "essay": "https://thevcs.org/writing-wall/writing-wall?first=4676",
  "act": "https://act.library.vanderbilt.edu/artworks/59130",
  "licence": "Public domain",
  "attribution": "Rembrandt Harmenszoon van Rijn, 1606-1669. Belshazzar's Feast, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59131,
  "title": "Meat Stall with the Holy Family Giving Alms",
  "artist": "Aertsen, Pieter, 1508-1575",
  "date": "1551",
  "where": "North Carolina Museum of Art, Raleigh, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/meatstall5tyvc193.jpg",
  "refs": [
   "Hosea 4:1-19"
  ],
  "days": [],
  "essay": "https://thevcs.org/time-change/they-shall-eat-not-be-satisfied?first=2296",
  "act": "https://act.library.vanderbilt.edu/artworks/59131",
  "licence": "Public domain",
  "attribution": "Aertsen, Pieter, 1508-1575. Meat Stall with the Holy Family Giving Alms, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59132,
  "title": "Fragment of the Alps",
  "artist": "Ruskin, John, 1819-1900",
  "date": "1854-1856",
  "where": "Harvard Art Museums, Cambridge, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/fragmentsalps38fi10ax.jpg",
  "refs": [
   "Hosea 14:1-9"
  ],
  "days": [],
  "essay": "https://thevcs.org/gardened-god/divinity-detail?first=6116",
  "act": "https://act.library.vanderbilt.edu/artworks/59132",
  "licence": "Public domain",
  "attribution": "Ruskin, John, 1819-1900. Fragment of the Alps, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59134,
  "title": "Summer",
  "artist": "Wertinger, Hans, approximately 1465-1533",
  "date": "ca. 1525",
  "where": "National Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/summerwertinger392eds1b.jpg",
  "refs": [
   "Hosea 14:1-9"
  ],
  "days": [],
  "essay": "https://thevcs.org/gardened-god/rendering-fruit?first=6111",
  "act": "https://act.library.vanderbilt.edu/artworks/59134",
  "licence": "Public domain",
  "attribution": "Wertinger, Hans, approximately 1465-1533. Summer, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59135,
  "title": "Forest Fire",
  "artist": "Piero, di Cosimo, 1462-1521",
  "date": "ca. 1505",
  "where": "Ashmolean Museum of Art and Archaeology, Oxford, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/forestfire35rgow19.jpg",
  "refs": [
   "Joel 1:1-20"
  ],
  "days": [],
  "essay": "https://thevcs.org/landscapes-devastation/devouring-flames?first=116",
  "act": "https://act.library.vanderbilt.edu/artworks/59135",
  "licence": "Public domain",
  "attribution": "Piero, di Cosimo, 1462-1521. Forest Fire, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59136,
  "title": "Jonah",
  "artist": "Lorenzetto",
  "date": "ca. 1520",
  "where": "Chigi Chapel in the Basilica of Santa Maria del Popolo, Rome, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/jonahlorenzetto48fgt12d.jpg",
  "refs": [
   "Jonah 2:1-10"
  ],
  "days": [],
  "essay": "https://thevcs.org/jonah-and-whale/o-death-where-thy-sting?first=2586",
  "act": "https://act.library.vanderbilt.edu/artworks/59136",
  "licence": "CC BY 3.0",
  "attribution": "Lorenzetto. Jonah, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59137,
  "title": "Jonah and the Whale",
  "artist": "Lastman, Pieter, 1583-1633",
  "date": "1621",
  "where": "Museum Kunstpalast, Düsseldorf, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/jonahwhale3gbtu127.jpg",
  "refs": [
   "Jonah 2:1-10"
  ],
  "days": [],
  "essay": "https://thevcs.org/jonah-and-whale/deliverance-belongs-lord?first=2586",
  "act": "https://act.library.vanderbilt.edu/artworks/59137",
  "licence": "Public domain",
  "attribution": "Lastman, Pieter, 1583-1633. Jonah and the Whale, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59138,
  "title": "Jonah and the Whale",
  "artist": null,
  "date": "ca. 1400",
  "where": "Metropolitan Museum of Art, New York City, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/jonahwhale10ryxm72.jpg",
  "refs": [
   "Jonah 2:1-10"
  ],
  "days": [],
  "essay": "https://thevcs.org/jonah-and-whale/faithful-repentance?first=2586",
  "act": "https://act.library.vanderbilt.edu/artworks/59138",
  "licence": "Public domain",
  "attribution": "Jonah and the Whale, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59140,
  "title": "Triptych with the Life Story of Solomon",
  "artist": null,
  "date": "ca. 1521",
  "where": "Mauritshuis, The Hague, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/triptychsolomon1497gyqc.jpg",
  "refs": [
   "Kings I, 11:26-40"
  ],
  "days": [],
  "essay": "https://thevcs.org/solomons-idolatry",
  "act": "https://act.library.vanderbilt.edu/artworks/59140",
  "licence": "Public domain",
  "attribution": "Triptych with the Life Story of Solomon, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59141,
  "title": "Suicide of Saul",
  "artist": "Bruegel, Pieter, approximately 1525-1569",
  "date": "1562",
  "where": "Kunsthistorisches Museum, Vienna, Austria",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/suicidesaul35tp91sd.jpg",
  "refs": [
   "Chronicles I, 10:1-14"
  ],
  "days": [],
  "essay": "https://thevcs.org/decisions-decisions/alone-again-naturally?first=2811",
  "act": "https://act.library.vanderbilt.edu/artworks/59141",
  "licence": "Public domain",
  "attribution": "Bruegel, Pieter, approximately 1525-1569. Suicide of Saul, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59142,
  "title": "Esther before Ahasuerus",
  "artist": "Guercino, 1591-1666",
  "date": "1639",
  "where": "University of Michigan Museum of Art, Ann Arbor, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/estherahasuerus75tg92so.jpg",
  "refs": [
   "Esther 8:1-17"
  ],
  "days": [],
  "essay": "https://thevcs.org/esther-pleads-her-people/paradoxes-power?first=416",
  "act": "https://act.library.vanderbilt.edu/artworks/59142",
  "licence": "Public domain",
  "attribution": "Guercino, 1591-1666. Esther before Ahasuerus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59143,
  "title": "Christ as the Man of Sorrows",
  "artist": "Cranach, Lucas, 1472-1553",
  "date": "1537",
  "where": "Ludwig Roselius Museum, Bremen, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/christmansorrows64gm1q0a.jpg",
  "refs": [
   "Psalm 88"
  ],
  "days": [],
  "essay": "https://thevcs.org/psalters-darkest-hour/opening-darkness?first=2416",
  "act": "https://act.library.vanderbilt.edu/artworks/59143",
  "licence": "Public domain",
  "attribution": "Cranach, Lucas, 1472-1553. Christ as the Man of Sorrows, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59154,
  "title": "Prophet Zechariah",
  "artist": "Michelangelo Buonarroti, 1475-1564",
  "date": "1508-1512",
  "where": "Sistine Chapel, Vatican City",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/prophetzechariah39bu14sw.jpg",
  "refs": [
   "Zechariah 1:1-17"
  ],
  "days": [],
  "essay": "https://thevcs.org/index.php/exalted-return-jerusalem/prophet?first=3796",
  "act": "https://act.library.vanderbilt.edu/artworks/59154",
  "licence": "Public domain",
  "attribution": "Michelangelo Buonarroti, 1475-1564. Prophet Zechariah, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59155,
  "title": "Re-building of the Temple in Jerusalem",
  "artist": "Doré, Gustave, 1832-1883",
  "date": "1886",
  "where": "Dore Bible",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/rebuildingtemple4781gtqp.jpg",
  "refs": [
   "Zechariah 1:1-17"
  ],
  "days": [],
  "essay": "https://thevcs.org/index.php/exalted-return-jerusalem/reconstruction?first=3796",
  "act": "https://act.library.vanderbilt.edu/artworks/59155",
  "licence": "Public domain",
  "attribution": "Doré, Gustave, 1832-1883. Re-building of the Temple in Jerusalem, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59156,
  "title": "Genealogy of Christ",
  "artist": "Herrad, of Landsberg, Abbess of Hohenburg, approximately 1130-1195",
  "date": "ca. 1175-1195",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/treejesse9012rtoc.jpg",
  "refs": [
   "Matthew 1:1-17"
  ],
  "days": [],
  "essay": "https://thevcs.org/genealogies-jesus/abraham-and-his-seed?first=6986",
  "act": "https://act.library.vanderbilt.edu/artworks/59156",
  "licence": "Public domain",
  "attribution": "Herrad, of Landsberg, Abbess of Hohenburg, approximately 1130-1195. Genealogy of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59157,
  "title": "Saint Matthew and the Angel",
  "artist": "Caravaggio, Michelangelo Merisi da, 1573-1610",
  "date": "1602",
  "where": "Formerly part of the Kaiser Friedrich Museum, Berlin, destroyed in WWII, 1945",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/matthewangel4r9d2m0x.jpg",
  "refs": [
   "Matthew 1:1-17"
  ],
  "days": [],
  "essay": "https://thevcs.org/genealogies-jesus/caravaggios-first-inspiration?first=6996",
  "act": "https://act.library.vanderbilt.edu/artworks/59157",
  "licence": "Public domain",
  "attribution": "Caravaggio, Michelangelo Merisi da, 1573-1610. Saint Matthew and the Angel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59158,
  "title": "Mosaic of Jesus and his ancestors (Genealogy of Christ)",
  "artist": null,
  "date": "1315-1321",
  "where": "Chora Church, Istanbul, Turkey",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/genealogyjesus35tg06mz.jpg",
  "refs": [
   "Matthew 1:1-17"
  ],
  "days": [],
  "essay": "https://thevcs.org/genealogies-jesus/descendants-christ-pantocrator?first=6996",
  "act": "https://act.library.vanderbilt.edu/artworks/59158",
  "licence": "CC BY-SA 3.0",
  "attribution": "Mosaic of Jesus and his ancestors (Genealogy of Christ), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59338,
  "title": "Flight into Egypt",
  "artist": "Carpaccio, Vittore, 1455?-1525?",
  "date": "ca. 1515",
  "where": "National Gallery of Art, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Vittore_Carpaccio_The_Flight_into_Egypt-1500.jpg",
  "refs": [
   "Matthew 2:13-18"
  ],
  "days": [],
  "essay": "https://thevcs.org/flight-egypt/reading-landscape?first=316",
  "act": "https://act.library.vanderbilt.edu/artworks/59338",
  "licence": "Public domain",
  "attribution": "Carpaccio, Vittore, 1455?-1525?. Flight into Egypt, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59340,
  "title": "Triumph of the Innocents",
  "artist": "Hunt, William Holman, 1827-1910",
  "date": "ca. 1883",
  "where": "Tate Britain, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/William_Holman_Hunt_The_Triumph_of_the_Innocents.jpg",
  "refs": [
   "Matthew 2:13-23"
  ],
  "days": [
   "Year A Christmas 1st Sunday"
  ],
  "essay": "https://thevcs.org/light-egypt/revelation-dream?first=316",
  "act": "https://act.library.vanderbilt.edu/artworks/59340",
  "licence": "Public domain",
  "attribution": "Hunt, William Holman, 1827-1910. Triumph of the Innocents, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59341,
  "title": "Return of the Holy Family from Egypt",
  "artist": "Poussin, Nicolas, 1594?-1665",
  "date": "ca. 1628",
  "where": "Dulwich Picture Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Nicolas_Poussin_The_Return_of_the_Holy_Family_from_Egypt.jpg",
  "refs": [
   "Matthew 2:13-23"
  ],
  "days": [
   "Year A Christmas 1st Sunday"
  ],
  "essay": "https://thevcs.org/return-egypt/fateful-crossing?first=141",
  "act": "https://act.library.vanderbilt.edu/artworks/59341",
  "licence": "Public domain",
  "attribution": "Poussin, Nicolas, 1594?-1665. Return of the Holy Family from Egypt, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59343,
  "title": "Wheatfield with Crows",
  "artist": "Gogh, Vincent van, 1853-1890",
  "date": "1890",
  "where": "Van Gogh Museum, Amsterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Vincent_van_Gogh_Wheatfield_with_crows.jpg",
  "refs": [
   "Matthew 6:19-24",
   "Luke 12:22-31"
  ],
  "days": [],
  "essay": "https://thevcs.org/seek-ye-first-kingdom-god/look-birds-air?first=6916",
  "act": "https://act.library.vanderbilt.edu/artworks/59343",
  "licence": "Public domain",
  "attribution": "Gogh, Vincent van, 1853-1890. Wheatfield with Crows, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59344,
  "title": "Vase of Tulips",
  "artist": "Cézanne, Paul, 1839-1906",
  "date": "ca. 1890",
  "where": "Art Institute of Chicago, Chicago, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Paul_Cézanne_The_Vase_of_Tulips.jpg",
  "refs": [
   "Matthew 6:19-24",
   "Luke 12:22-31"
  ],
  "days": [],
  "essay": "https://thevcs.org/seek-ye-first-kingdom-god/consider-lilies-field?first=6916",
  "act": "https://act.library.vanderbilt.edu/artworks/59344",
  "licence": "Public domain",
  "attribution": "Cézanne, Paul, 1839-1906. Vase of Tulips, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59345,
  "title": "Christ Asleep during the Tempest",
  "artist": "Delacroix, Eugène, 1798-1863",
  "date": "ca. 1853",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Eugene_Delacroix_Christ_Asleep_During_the_Tempest.jpg",
  "refs": [
   "Luke 8:22-25",
   "Matthew 8:23-27"
  ],
  "days": [],
  "essay": "https://thevcs.org/calming-storm/interior-tempest?first=7121",
  "act": "https://act.library.vanderbilt.edu/artworks/59345",
  "licence": "Public domain",
  "attribution": "Delacroix, Eugène, 1798-1863. Christ Asleep during the Tempest, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59346,
  "title": "Healing of the Possessed Man of Gerasa",
  "artist": "Bril, Paul, 1554-1626",
  "date": "1601",
  "where": "Alte Pinakothek, Munich, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Anonymous_Christ_healing_the_possessed_of_Gerasa_Milanese_workshop_c._968_AD.jpg",
  "refs": [
   "Mark 5:1-20",
   "Luke 8:26-39",
   "Matthew 8:28-9:1"
  ],
  "days": [
   "Year C Proper 7th Sunday"
  ],
  "essay": "https://thevcs.org/gerasene-demoniac/whimsical-landscape?first=5756",
  "act": "https://act.library.vanderbilt.edu/artworks/59346",
  "licence": "Public domain",
  "attribution": "Bril, Paul, 1554-1626. Healing of the Possessed Man of Gerasa, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59347,
  "title": "Healing of the Possessed Man of Gerasa",
  "artist": null,
  "date": "ca. 962-968",
  "where": "Hessisches Landesmuseum Darmstadt, Darmstadt, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/healingpossessed45ghix90.jpg",
  "refs": [
   "Mark 5:1-20",
   "Luke 8:26-39",
   "Matthew 8:28-9:1"
  ],
  "days": [
   "Year C Proper 7th Sunday"
  ],
  "essay": "https://thevcs.org/gerasene-demoniac/jesus-heals-gerasene-demoniac?first=5761",
  "act": "https://act.library.vanderbilt.edu/artworks/59347",
  "licence": "Public domain",
  "attribution": "Healing of the Possessed Man of Gerasa, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59349,
  "title": "Daughters of Edward Darley Boit",
  "artist": "Sargent, John Singer, 1856-1925",
  "date": "1882",
  "where": "Museum of Fine Arts, Boston, Boston, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/John_Singer_Sargent_Daughters_of_Edward_Boit.jpg",
  "refs": [
   "Matthew 12:46-50"
  ],
  "days": [],
  "essay": "https://thevcs.org/who-are-my-mother-and-my-brothers/unrelated-relations?first=7221",
  "act": "https://act.library.vanderbilt.edu/artworks/59349",
  "licence": "Public domain",
  "attribution": "Sargent, John Singer, 1856-1925. Daughters of Edward Darley Boit, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59350,
  "title": "Salome Dancing for Herod",
  "artist": "Horions, Hans",
  "date": "ca. 1634-1672",
  "where": "Rijksmuseum, Amsterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Hans_Horions_Salome_danst_voor_Herodes_Rijksmuseum_SK-A-804.jpg",
  "refs": [
   "Matthew 14:1-12"
  ],
  "days": [
   "Year A Proper 24th Sunday"
  ],
  "essay": "https://thevcs.org/salomes-dance/piercing-gazes?first=6536",
  "act": "https://act.library.vanderbilt.edu/artworks/59350",
  "licence": "Public domain",
  "attribution": "Horions, Hans. Salome Dancing for Herod, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59351,
  "title": "Christ Walking on the Water",
  "artist": "Runge, Philipp Otto, 1777-1810",
  "date": "ca. 1806-1807",
  "where": "Hamburger Kunsthalle, Hamburg, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Philipp_Otto_Runge_Petrus_auf_dem_Meer_Christ_walks_on_the_water_ca1806.jpg",
  "refs": [
   "Matthew 14:22-33"
  ],
  "days": [
   "Year A Proper 14th Sunday"
  ],
  "essay": "https://thevcs.org/walking-water/those-peril-sea?first=5546",
  "act": "https://act.library.vanderbilt.edu/artworks/59351",
  "licence": "Public domain",
  "attribution": "Runge, Philipp Otto, 1777-1810. Christ Walking on the Water, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59352,
  "title": "Carrying of the Cross",
  "artist": "Martini, Simone, 1283-1344",
  "date": "ca. 1335",
  "where": "Louvre, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Simone_Martini_Carrying_of_the_Cross.jpg",
  "refs": [
   "Matthew 16:21-28",
   "Luke 9:21-27"
  ],
  "days": [
   "Year A Proper 17th Sunday"
  ],
  "essay": "https://thevcs.org/forfeit-and-gain/if-any-would-come-after-me?first=6441",
  "act": "https://act.library.vanderbilt.edu/artworks/59352",
  "licence": "Public domain",
  "attribution": "Martini, Simone, 1283-1344. Carrying of the Cross, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59353,
  "title": "Christ Carrying the Cross",
  "artist": "Hemessen, Jan Sanders van, approximately 1500-approximately 1563",
  "date": "1553",
  "where": "Christian Museum, Esztergom, Hungary",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jan_van_Hemessen_Christ_Carrying_the_Cross_WGA11350.jpg",
  "refs": [
   "Matthew 16:21-28",
   "Luke 9:21-27"
  ],
  "days": [
   "Year A Proper 17th Sunday"
  ],
  "essay": "https://thevcs.org/forfeit-and-gain/son-man-will-also-be-ashamed?first=6446",
  "act": "https://act.library.vanderbilt.edu/artworks/59353",
  "licence": "Public domain",
  "attribution": "Hemessen, Jan Sanders van, approximately 1500-approximately 1563. Christ Carrying the Cross, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59354,
  "title": "Saint Peter Paying the Tribute with a Piece of Silver Found in a Fish",
  "artist": "Hayter, George Sir, 1792-1871",
  "date": "1817",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/George_Hayter_SAINT_PETER_PAYING_THE_TRIBUTE_WITH_A_PIECE_OF_SILVER_FOUND_IN_A_FISH.jpg",
  "refs": [
   "Matthew 17:22-27"
  ],
  "days": [],
  "essay": "https://thevcs.org/tribute-money/hijacking-scripture?first=6596",
  "act": "https://act.library.vanderbilt.edu/artworks/59354",
  "licence": "Public domain",
  "attribution": "Hayter, George Sir, 1792-1871. Saint Peter Paying the Tribute with a Piece of Silver Found in a Fish, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59716,
  "title": "Samson",
  "artist": "Solomon Joseph Solomon",
  "date": "1886-1887",
  "where": "Walker Art Gallery, Liverpool, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/samsonsolomon4569vtaw.jpg",
  "refs": [
   "Judges 16:1-22"
  ],
  "days": [],
  "essay": "https://thevcs.org/samson-and-delilah/exposed?first=1106",
  "act": "https://act.library.vanderbilt.edu/artworks/59716",
  "licence": "Public domain",
  "attribution": "Solomon Joseph Solomon. Samson, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59717,
  "title": "Betrayal of Christ",
  "artist": "Van Dyck, Anthony, 1599-1641",
  "date": "1618-1620",
  "where": "Bristol City Museum and Art Gallery, Bristol, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/betrayaldyck39gb10me.jpg",
  "refs": [
   "Matthew 26:14-27:66",
   "Mark 14:1-15:47",
   "Luke 22:14-23:56"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year B Liturgy of Pass",
   "Year C Liturgy of Pass"
  ],
  "essay": "https://thevcs.org/betrayal-christ/judas-must-you-betray-me-with-kiss?first=6006",
  "act": "https://act.library.vanderbilt.edu/artworks/59717",
  "licence": "Public domain",
  "attribution": "Van Dyck, Anthony, 1599-1641. Betrayal of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59718,
  "title": "Scenes from the Passion of Christ: The Agony in the Garden, the Crucifixion, and the Descent into Limbo triptych",
  "artist": "Andrea di Vanni d'Andrea, approximately 1332-approximately 1414",
  "date": "1380-1389",
  "where": "National Gallery of Art, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/scenespassion5t9d2k3l.jpg",
  "refs": [
   "Matthew 27:11-54"
  ],
  "days": [
   "Year A Liturgy of Pass"
  ],
  "essay": "https://thevcs.org/casting-lots/drawing-straws?first=5271",
  "act": "https://act.library.vanderbilt.edu/artworks/59718",
  "licence": "CC0",
  "attribution": "Andrea di Vanni d'Andrea, approximately 1332-approximately 1414. Scenes from the Passion of Christ: The Agony in the Garden, the Crucifixion, and the Descent into Limbo triptych, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59719,
  "title": "Lamentation of Christ",
  "artist": "Mantegna, Andrea, 1431-1506",
  "date": "ca. 1490",
  "where": "Pinacoteca di Brera, Milan, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lamentationchrist4r9g02sp.jpg",
  "refs": [
   "Matthew 27:57-66"
  ],
  "days": [
   "Year A Holy Saturday",
   "Year B Holy Saturday",
   "Year C Holy Saturday"
  ],
  "essay": "https://thevcs.org/flight-egypt/flight-night",
  "act": "https://act.library.vanderbilt.edu/artworks/59719",
  "licence": "Public domain",
  "attribution": "Mantegna, Andrea, 1431-1506. Lamentation of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59720,
  "title": "Ascension of Christ",
  "artist": "Mistr vyšebrodského cyklu",
  "date": "ca. 1350",
  "where": "National Gallery Prague, Prague, Czech Republic",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ascensionmistr39ty10kx.jpg",
  "refs": [
   "Luke 24:44-53",
   "Mark 16:19-20"
  ],
  "days": [
   "Year A Lent 5th  Sunday",
   "Year B Easter 6th Sunday"
  ],
  "essay": "https://thevcs.org/ascension/feet-last?first=5831",
  "act": "https://act.library.vanderbilt.edu/artworks/59720",
  "licence": "Public domain",
  "attribution": "Mistr vyšebrodského cyklu. Ascension of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59721,
  "title": "Transfiguration",
  "artist": "Theophanes the Greek and workshop",
  "date": "1400-1425",
  "where": "Tretyakov Gallery, Moscow, Russia",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/transfigurationtheophanes52th96sd.jpg",
  "refs": [
   "Mark 9:2-9",
   "Mark 9:2-8",
   "Luke 9:28-36"
  ],
  "days": [
   "Year B Lent 2nd Sunday",
   "Year B Transfiguration Sunday",
   "Year C Transfiguration Sunday",
   "Year C Lent 2nd Sunday"
  ],
  "essay": "https://thevcs.org/transfiguration-0/the-transfiguration",
  "act": "https://act.library.vanderbilt.edu/artworks/59721",
  "licence": "Public domain",
  "attribution": "Theophanes the Greek and workshop. Transfiguration, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59753,
  "title": "Field with Flowers Near Arles",
  "artist": "Gogh, Vincent van, 1853-1890",
  "date": "1888",
  "where": "Van Gogh Museum, Amsterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Vincent_van_Gogh_Veld_met_bloemen_bij_Arles.jpg",
  "refs": [
   "Matthew 6:25-33",
   "Matthew 6:24-34"
  ],
  "days": [
   "Year A Epiphany 8th Sunday"
  ],
  "essay": "https://thevcs.org/parable-sower/there-went-out-sower-sow",
  "act": "https://act.library.vanderbilt.edu/artworks/59753",
  "licence": "Public domain",
  "attribution": "Gogh, Vincent van, 1853-1890. Field with Flowers Near Arles, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 }
];
